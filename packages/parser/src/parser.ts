import fs from 'node:fs';
import path from 'node:path';
import Parser from 'tree-sitter';
import { type ClassNode, type GraphNode, type GraphEdge, type CallsEdge, type ExtendsEdge, type ImplementsEdge, ParseError, getLogger } from '@genome/core';
import type { FileNode } from '@genome/core';
import { detectLanguage, grammars } from './languages/index';
import { extractFunctions } from './extractors/functions';
import { extractClasses } from './extractors/classes';
import { extractImports, importsToEdges } from './extractors/imports';
import { extractRoutes } from './extractors/routes';
import { extractExports } from './extractors/exports';
import { extractCalls } from './extractors/calls';
import { createNodeId, createFileHash } from './utils';
import type { ImportInfo } from './extractors/imports';
import type { ExportInfo } from './extractors/exports';
import type { CallInfo } from './extractors/calls';

export interface ParseResult {
    file: FileNode;
    nodes: GraphNode[];
    edges: GraphEdge[];
    imports: ImportInfo[];
    exports: ExportInfo[];
    calls: CallInfo[];
}

export interface ParserEngine {
    parseFile(filePath: string): Promise<ParseResult>;
    parseFiles(filePaths: string[]): Promise<ParseResult[]>;
}

const parserCache = new Map<string, Parser>();

async function getParser(language: string): Promise<Parser> {
    const cached = parserCache.get(language);
    if (cached) return cached;

    const grammar = grammars[language as keyof typeof grammars];
    if (!grammar) throw new ParseError(`Unsupported language: ${language}`, '', 0);

    const parser = new Parser();
    const lang = await grammar.load();
    parser.setLanguage(lang as Parser.Language);
    parserCache.set(language, parser);
    return parser;
}

export function createParserEngine(): ParserEngine {
    const logger = getLogger();

    async function parseFile(filePath: string): Promise<ParseResult> {
        const absolutePath = path.resolve(filePath);
        const language = detectLanguage(absolutePath);
        if (!language) throw new ParseError(`Cannot detect language for: ${filePath}`, filePath);

        const content = fs.readFileSync(absolutePath, 'utf-8');
        const hash = createFileHash(content);

        const parser = await getParser(language);
        const tree = parser.parse(content);

        const fileNode: FileNode = {
            id: createNodeId('file', absolutePath, ''),
            type: 'file',
            path: absolutePath,
            language,
            hash,
            size: Buffer.byteLength(content, 'utf-8'),
            lastParsed: new Date().toISOString(),
        };

        const functions = extractFunctions(tree, absolutePath);
        const classes = extractClasses(tree, absolutePath);
        const imports = extractImports(tree, absolutePath);
        const routes = extractRoutes(tree, absolutePath);
        const exports = extractExports(tree, absolutePath);
        const calls = extractCalls(tree, absolutePath);

        const nodes: GraphNode[] = [fileNode, ...functions, ...classes, ...routes];

        // Edges CONTAINS : File → Function/Class/Route
        const containsEdges: GraphEdge[] = [...functions, ...classes, ...routes].map((n) => ({
            id: `${fileNode.id}->contains->${n.id}`,
            type: 'CONTAINS' as const,
            sourceId: fileNode.id,
            targetId: n.id,
            confidence: 1.0,
        }));

        // Edges IMPORTS : File → Module
        const importEdges = importsToEdges(imports, fileNode.id, (source) =>
            createNodeId('module', source, ''),
        );

        // Edges CALLS : resolution intra-fichier
        const localFuncMap = new Map<string, string>();
        for (const fn of functions) {
            localFuncMap.set(fn.name, fn.id);
        }
        const localCallEdges = resolveCallEdges(calls, localFuncMap);

        // Edges EXTENDS : Class → Class parent
        const extendsEdges = resolveExtendsEdges(classes, localFuncMap, absolutePath);

        // Edges IMPLEMENTS : Class → Interface (par nom)
        const implementsEdges = resolveImplementsEdges(classes, absolutePath);

        const edges: GraphEdge[] = [
            ...containsEdges,
            ...importEdges,
            ...localCallEdges,
            ...extendsEdges,
            ...implementsEdges,
        ];

        logger.debug({ filePath: absolutePath, nodes: nodes.length, edges: edges.length }, 'parsed file');

        return { file: fileNode, nodes, edges, imports, exports, calls };
    }

    async function parseFiles(filePaths: string[]): Promise<ParseResult[]> {
        const results: ParseResult[] = [];
        let failed = 0;

        for (const fp of filePaths) {
            try {
                const result = await parseFile(fp);
                results.push(result);
            } catch (err) {
                failed++;
                logger.warn({ filePath: fp, error: err instanceof Error ? err.message : String(err) }, 'parse failed');
            }
        }

        // Resolution cross-fichier des CALLS apres parsing de tous les fichiers
        const globalFuncMap = new Map<string, string>();
        const globalClassMap = new Map<string, string>();
        for (const r of results) {
            for (const n of r.nodes) {
                if (n.type === 'function') globalFuncMap.set(n.name, n.id);
                if (n.type === 'class') globalClassMap.set(n.name, n.id);
            }
        }

        let crossFileCallCount = 0;
        let crossFileExtendsCount = 0;
        for (const r of results) {
            const localIds = new Set(r.nodes.map((n) => n.id));

            // CALLS cross-fichier
            const crossCallEdges = resolveCallEdges(r.calls, globalFuncMap)
                .filter((e) => !localIds.has(e.targetId));
            const existingCallTargets = new Set(
                r.edges.filter((e) => e.type === 'CALLS').map((e) => e.targetId),
            );
            for (const edge of crossCallEdges) {
                if (!existingCallTargets.has(edge.targetId)) {
                    r.edges.push({ ...edge, confidence: 0.85 });
                    crossFileCallCount++;
                }
            }

            // EXTENDS cross-fichier
            for (const n of r.nodes) {
                if (n.type === 'class' && n.superClass) {
                    const parentId = globalClassMap.get(n.superClass);
                    if (parentId && !localIds.has(parentId)) {
                        const exists = r.edges.some(
                            (e) => e.type === 'EXTENDS' && e.sourceId === n.id,
                        );
                        if (!exists) {
                            r.edges.push({
                                id: `${n.id}->extends->${parentId}`,
                                type: 'EXTENDS' as const,
                                sourceId: n.id,
                                targetId: parentId,
                                confidence: 0.9,
                            });
                            crossFileExtendsCount++;
                        }
                    }
                }
            }
        }

        logger.info(
            {
                total: filePaths.length,
                parsed: results.length,
                failed,
                crossFileCalls: crossFileCallCount,
                crossFileExtends: crossFileExtendsCount,
            },
            'parse batch complete',
        );
        return results;
    }

    return { parseFile, parseFiles };
}

/** Resolution des appels en edges CALLS */
function resolveCallEdges(calls: CallInfo[], funcMap: Map<string, string>): CallsEdge[] {
    const edges: CallsEdge[] = [];
    const seen = new Set<string>();

    for (const call of calls) {
        const callerId = funcMap.get(call.callerName);
        const calleeId = funcMap.get(call.calleeName);
        if (!callerId || !calleeId) continue;
        if (callerId === calleeId) continue;

        const key = `${callerId}->${calleeId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        edges.push({
            id: `${callerId}->calls->${calleeId}`,
            type: 'CALLS' as const,
            sourceId: callerId,
            targetId: calleeId,
            confidence: 1.0,
            line: call.line,
            column: call.column,
        });
    }
    return edges;
}

/** Resolution des edges EXTENDS (heritage de classe) */
function resolveExtendsEdges(
    classes: ClassNode[],
    _funcMap: Map<string, string>,
    _filePath: string,
): ExtendsEdge[] {
    const edges: ExtendsEdge[] = [];
    const classMap = new Map<string, string>();
    for (const cls of classes) {
        classMap.set(cls.name, cls.id);
    }

    for (const cls of classes) {
        if (!cls.superClass) continue;
        const parentId = classMap.get(cls.superClass);
        if (!parentId) continue;
        edges.push({
            id: `${cls.id}->extends->${parentId}`,
            type: 'EXTENDS' as const,
            sourceId: cls.id,
            targetId: parentId,
            confidence: 1.0,
        });
    }
    return edges;
}

/** Resolution des edges IMPLEMENTS (interfaces) */
function resolveImplementsEdges(
    classes: ClassNode[],
    _filePath: string,
): ImplementsEdge[] {
    const edges: ImplementsEdge[] = [];
    const classMap = new Map<string, string>();
    for (const cls of classes) {
        classMap.set(cls.name, cls.id);
    }

    for (const cls of classes) {
        for (const iface of cls.interfaces) {
            const targetId = classMap.get(iface);
            if (!targetId) continue;
            edges.push({
                id: `${cls.id}->implements->${targetId}`,
                type: 'IMPLEMENTS' as const,
                sourceId: cls.id,
                targetId,
                confidence: 1.0,
            });
        }
    }
    return edges;
}
