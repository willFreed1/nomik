import fs from 'node:fs';
import path from 'node:path';
import Parser from 'tree-sitter';
import { type ClassNode, type FunctionNode, type GraphNode, type GraphEdge, type CallsEdge, type ExtendsEdge, type ImplementsEdge, ParseError, getLogger } from '@nomik/core';
import type { FileNode } from '@nomik/core';
import { detectLanguage, grammars } from './languages/index';
import { extractFunctions } from './extractors/functions';
import { extractClasses } from './extractors/classes';
import { extractImports, importsToEdges } from './extractors/imports';
import { extractRoutes } from './extractors/routes';
import { extractExports } from './extractors/exports';
import { extractCalls } from './extractors/calls';
import { parseMarkdown } from './extractors/markdown';
import { extractPythonFunctions, extractPythonClasses, extractPythonImports, extractPythonCalls } from './extractors/python';
import { extractRustFunctions, extractRustClasses, extractRustImports, extractRustCalls } from './extractors/rust';
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

        // Fichiers markdown : parsing sans tree-sitter
        if (language === 'markdown') {
            const md = parseMarkdown(absolutePath, content);
            logger.debug({ filePath: absolutePath, nodes: md.nodes.length, edges: md.edges.length }, 'parsed markdown');
            return { file: md.file, nodes: md.nodes, edges: md.edges, imports: [], exports: [], calls: [] };
        }

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

        // Dispatch vers les extracteurs specifiques au langage
        let functions: FunctionNode[], classes: ClassNode[], imports: ImportInfo[], exports: ExportInfo[], calls: CallInfo[], routes: GraphNode[];

        if (language === 'python') {
            functions = extractPythonFunctions(tree, absolutePath);
            classes = extractPythonClasses(tree, absolutePath);
            imports = extractPythonImports(tree, absolutePath);
            calls = extractPythonCalls(tree, absolutePath);
            routes = [];
            exports = [];
        } else if (language === 'rust') {
            functions = extractRustFunctions(tree, absolutePath);
            classes = extractRustClasses(tree, absolutePath);
            imports = extractRustImports(tree, absolutePath);
            calls = extractRustCalls(tree, absolutePath);
            routes = [];
            exports = [];
        } else {
            functions = extractFunctions(tree, absolutePath);
            classes = extractClasses(tree, absolutePath);
            imports = extractImports(tree, absolutePath);
            routes = extractRoutes(tree, absolutePath);
            exports = extractExports(tree, absolutePath);
            calls = extractCalls(tree, absolutePath);
        }

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

        // Edges CALLS depuis le contexte fichier (appels dans callbacks anonymes, top-level)
        const fileCallEdges = resolveFileCallEdges(calls, localFuncMap, fileNode.id);

        // Edges EXTENDS : Class → Class parent
        const extendsEdges = resolveExtendsEdges(classes, localFuncMap, absolutePath);

        // Edges IMPLEMENTS : Class → Interface (par nom)
        const implementsEdges = resolveImplementsEdges(classes, absolutePath);

        const edges: GraphEdge[] = [
            ...containsEdges,
            ...importEdges,
            ...localCallEdges,
            ...fileCallEdges,
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

        // Resolution cross-fichier : DEPENDS_ON (imports), CALLS, EXTENDS
        const globalFuncMap = new Map<string, string>();
        const globalFuncMultiMap = new Map<string, string[]>();
        const globalClassMap = new Map<string, string>();
        const filePathToId = new Map<string, string>();
        for (const r of results) {
            filePathToId.set(r.file.path, r.file.id);
            for (const n of r.nodes) {
                if (n.type === 'function') {
                    globalFuncMap.set(n.name, n.id);
                    const arr = globalFuncMultiMap.get(n.name) ?? [];
                    arr.push(n.id);
                    globalFuncMultiMap.set(n.name, arr);
                }
                if (n.type === 'class') globalClassMap.set(n.name, n.id);
            }
        }

        // Resolution DEPENDS_ON : File → File via imports relatifs
        let dependsOnCount = 0;
        for (const r of results) {
            for (const imp of r.imports) {
                if (!imp.source.startsWith('.')) continue;
                const resolved = resolveImportPath(r.file.path, imp.source, filePathToId);
                if (resolved) {
                    const edgeId = `${r.file.id}->depends_on->${resolved}`;
                    const exists = r.edges.some(e => e.id === edgeId);
                    if (!exists) {
                        r.edges.push({
                            id: edgeId,
                            type: 'DEPENDS_ON' as const,
                            sourceId: r.file.id,
                            targetId: resolved,
                            confidence: 1.0,
                            kind: 'import' as const,
                        });
                        dependsOnCount++;
                    }
                }
            }
        }

        let crossFileCallCount = 0;
        let crossFileExtendsCount = 0;
        for (const r of results) {
            const localIds = new Set(r.nodes.map((n) => n.id));

            // CALLS cross-fichier (fonctions nommees → fonctions dans autres fichiers)
            const crossCallEdges = resolveCrossFileCallEdges(r.calls, localIds, globalFuncMultiMap);
            const existingEdgeIds = new Set(r.edges.map((e) => e.id));
            for (const edge of crossCallEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
                    crossFileCallCount++;
                }
            }

            // CALLS cross-fichier depuis le contexte fichier (__file__ → fonctions dans autres fichiers)
            const crossFileEdges = resolveFileCrossFileCallEdges(r.calls, localIds, globalFuncMultiMap, r.file.id);
            for (const edge of crossFileEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
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
                dependsOn: dependsOnCount,
                crossFileCalls: crossFileCallCount,
                crossFileExtends: crossFileExtendsCount,
            },
            'parse batch complete',
        );
        return results;
    }

    return { parseFile, parseFiles };
}

/** Resolution des appels intra-fichier en edges CALLS (caller et callee dans le meme fichier) */
function resolveCallEdges(calls: CallInfo[], funcMap: Map<string, string>): CallsEdge[] {
    const edges: CallsEdge[] = [];
    const seen = new Set<string>();

    for (const call of calls) {
        if (call.callerName === '__file__') continue;
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

/** Edges CALLS depuis le contexte fichier (appels dans callbacks anonymes ou top-level) */
function resolveFileCallEdges(calls: CallInfo[], funcMap: Map<string, string>, fileId: string): CallsEdge[] {
    const edges: CallsEdge[] = [];
    const seen = new Set<string>();

    for (const call of calls) {
        if (call.callerName !== '__file__') continue;
        const calleeId = funcMap.get(call.calleeName);
        if (!calleeId) continue;

        const key = `${fileId}->${calleeId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        edges.push({
            id: `${fileId}->calls->${calleeId}`,
            type: 'CALLS' as const,
            sourceId: fileId,
            targetId: calleeId,
            confidence: 0.9,
            line: call.line,
            column: call.column,
        });
    }
    return edges;
}

/** Resolution cross-fichier avec multi-map (gere les noms de fonctions dupliques) */
function resolveCrossFileCallEdges(
    calls: CallInfo[],
    localIds: Set<string>,
    multiMap: Map<string, string[]>,
): CallsEdge[] {
    const edges: CallsEdge[] = [];
    const seen = new Set<string>();

    for (const call of calls) {
        if (call.callerName === '__file__') continue;
        const callerIds = multiMap.get(call.callerName) ?? [];
        const calleeIds = multiMap.get(call.calleeName) ?? [];

        // Seul le caller dans CE fichier est pertinent
        const localCallerIds = callerIds.filter((id) => localIds.has(id));
        // Seuls les callees dans AUTRES fichiers sont pertinents
        const remoteCalleeIds = calleeIds.filter((id) => !localIds.has(id));

        for (const callerId of localCallerIds) {
            for (const calleeId of remoteCalleeIds) {
                if (callerId === calleeId) continue;
                const key = `${callerId}->${calleeId}`;
                if (seen.has(key)) continue;
                seen.add(key);

                edges.push({
                    id: `${callerId}->calls->${calleeId}`,
                    type: 'CALLS' as const,
                    sourceId: callerId,
                    targetId: calleeId,
                    confidence: 0.85,
                    line: call.line,
                    column: call.column,
                });
            }
        }
    }
    return edges;
}

/** Resolution cross-fichier des appels __file__ (File → fonctions dans autres fichiers) */
function resolveFileCrossFileCallEdges(
    calls: CallInfo[],
    localIds: Set<string>,
    multiMap: Map<string, string[]>,
    fileId: string,
): CallsEdge[] {
    const edges: CallsEdge[] = [];
    const seen = new Set<string>();

    for (const call of calls) {
        if (call.callerName !== '__file__') continue;
        const calleeIds = multiMap.get(call.calleeName) ?? [];

        for (const calleeId of calleeIds) {
            if (localIds.has(calleeId)) continue;
            const key = `${fileId}->${calleeId}`;
            if (seen.has(key)) continue;
            seen.add(key);

            edges.push({
                id: `${fileId}->calls->${calleeId}`,
                type: 'CALLS' as const,
                sourceId: fileId,
                targetId: calleeId,
                confidence: 0.8,
                line: call.line,
                column: call.column,
            });
        }
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

/** Resolution d'un import relatif vers l'id du fichier cible
 *  Gere le remapping ESM .js → .ts et les extensions Python/Rust
 */
function resolveImportPath(
    importerPath: string,
    importSource: string,
    filePathToId: Map<string, string>,
): string | null {
    const dir = path.dirname(importerPath);
    const base = path.resolve(dir, importSource);

    // Remapping ESM : import './foo.js' → chercher foo.ts d'abord
    const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
    const hasJsExt = stripped !== base;

    const candidates = hasJsExt
        ? [
            stripped + '.ts',
            stripped + '.tsx',
            stripped + '.js',
            stripped + '.jsx',
            stripped + '/index.ts',
            stripped + '/index.tsx',
            stripped + '/index.js',
            stripped,
            base,
        ]
        : [
            base + '.ts',
            base + '.tsx',
            base + '.js',
            base + '.jsx',
            base + '.py',
            base + '.rs',
            base + '/index.ts',
            base + '/index.tsx',
            base + '/index.js',
            base + '/mod.rs',
            base,
        ];

    for (const candidate of candidates) {
        const normalized = path.resolve(candidate);
        const id = filePathToId.get(normalized);
        if (id) return id;
    }
    return null;
}
