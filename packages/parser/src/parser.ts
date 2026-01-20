import fs from 'node:fs';
import path from 'node:path';
import Parser from 'tree-sitter';
import { type ClassNode, type FunctionNode, type VariableNode, type ModuleNode, type GraphNode, type GraphEdge, ParseError, getLogger } from '@nomik/core';
import type { FileNode } from '@nomik/core';
import { detectLanguage, grammars } from './languages/index';
import { extractFunctions } from './extractors/functions';
import { extractClasses } from './extractors/classes';
import { extractVariables } from './extractors/variables';
import { extractImports, importsToEdges } from './extractors/imports';
import { extractRoutes } from './extractors/routes';
import { extractExports } from './extractors/exports';
import { extractCalls, extractArrayCallbackAliases } from './extractors/calls';
import { parseMarkdown } from './extractors/markdown';
import { extractDBSchemaFromSQL, extractDBSchemaFromCSharpMigration, extractDBSchemaFromPythonMigration, isPythonMigrationFile, buildDBSchemaNodesAndEdges } from './extractors/db-schema/index';
import { extractAPICalls, buildAPINodesAndEdges, buildHttpClientIdentifiers } from './extractors/api-calls';
import { extractDBOperations, buildDBNodesAndEdges, buildDBClientIdentifiers } from './extractors/db-operations';
import { extractPythonFunctions, extractPythonClasses, extractPythonImports, extractPythonCalls } from './extractors/python';
import { extractRustFunctions, extractRustClasses, extractRustImports, extractRustCalls } from './extractors/rust';
import { createNodeId, createFileHash } from './utils';
import type { ImportInfo } from './extractors/imports';
import type { ExportInfo } from './extractors/exports';
import type { CallInfo } from './extractors/calls';
import {
    resolveCallEdges,
    resolveFileCallEdges,
    resolveVariableArrayReferenceEdges,
    resolveVariableDeclarationAliasEdges,
    resolveCrossFileCallEdges,
    resolveFileCrossFileCallEdges,
    buildImportedAliasFunctionIds,
    buildImportedReceiverFileIds,
    resolveImportedSymbolReferenceEdges,
    resolveImportedArrayAliasCallEdges,
    resolveExtendsEdges,
    resolveImplementsEdges,
    resolveRouteHandlesEdges,
    resolveCrossFileHandlesEdges,
    resolveFrameworkEntryEdges,
} from './resolvers/index';
import {
    findAllPathAliases,
    resolveImportPath,
    resolveAliasImportMulti,
} from './config/index';

export interface ParseResult {
    file: FileNode;
    nodes: GraphNode[];
    edges: GraphEdge[];
    imports: ImportInfo[];
    exports: ExportInfo[];
    calls: CallInfo[];
    arrayAliases: Record<string, string[]>;
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

        // Markdown files: parse without tree-sitter
        if (language === 'markdown') {
            const md = parseMarkdown(absolutePath, content);
            logger.debug({ filePath: absolutePath, nodes: md.nodes.length, edges: md.edges.length }, 'parsed markdown');
            return { file: md.file, nodes: md.nodes, edges: md.edges, imports: [], exports: [], calls: [], arrayAliases: {} };
        }

        if (language === 'sql' || language === 'csharp') {
            const fileNode: FileNode = {
                id: createNodeId('file', absolutePath, ''),
                type: 'file',
                path: absolutePath,
                language,
                hash: createFileHash(content),
                size: Buffer.byteLength(content, 'utf-8'),
                lastParsed: new Date().toISOString(),
            };
            const tables = language === 'sql'
                ? extractDBSchemaFromSQL(content)
                : extractDBSchemaFromCSharpMigration(content);
            const schema = buildDBSchemaNodesAndEdges(tables, fileNode.id, absolutePath);
            const nodes: GraphNode[] = [fileNode, ...schema.nodes];
            const edges: GraphEdge[] = [...schema.edges];
            logger.debug({ filePath: absolutePath, tables: tables.length, nodes: nodes.length, edges: edges.length }, 'parsed migration schema');
            return { file: fileNode, nodes, edges, imports: [], exports: [], calls: [], arrayAliases: {} };
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

        // Dispatch to language-specific extractors
        let functions: FunctionNode[], classes: ClassNode[], variables: VariableNode[], imports: ImportInfo[], exports: ExportInfo[], calls: CallInfo[], routes: GraphNode[];
        let arrayAliases: Record<string, string[]> = {};

        if (language === 'python') {
            functions = extractPythonFunctions(tree, absolutePath);
            classes = extractPythonClasses(tree, absolutePath);
            variables = [];
            imports = extractPythonImports(tree, absolutePath);
            calls = extractPythonCalls(tree, absolutePath);
            routes = [];
            exports = [];
            arrayAliases = {};
        } else if (language === 'rust') {
            functions = extractRustFunctions(tree, absolutePath);
            classes = extractRustClasses(tree, absolutePath);
            variables = [];
            imports = extractRustImports(tree, absolutePath);
            calls = extractRustCalls(tree, absolutePath);
            routes = [];
            exports = [];
            arrayAliases = {};
        } else {
            // typescript, tsx, javascript — same extractors (tsx uses tree-sitter TSX grammar)
            functions = extractFunctions(tree, absolutePath);
            classes = extractClasses(tree, absolutePath);
            variables = extractVariables(tree, absolutePath);
            imports = extractImports(tree, absolutePath);
            routes = extractRoutes(tree, absolutePath);
            exports = extractExports(tree, absolutePath);
            calls = extractCalls(tree, absolutePath);
            arrayAliases = Object.fromEntries(extractArrayCallbackAliases(tree));
        }

        const moduleNodes = buildModuleNodes(imports);

        // Edges CONTAINS: File → Function/Class/Route
        const containsEdges: GraphEdge[] = [...functions, ...classes, ...variables, ...routes].map((n) => ({
            id: `${fileNode.id}->contains->${n.id}`,
            type: 'CONTAINS' as const,
            sourceId: fileNode.id,
            targetId: n.id,
            confidence: 1.0,
        }));

        // Edges IMPORTS: File → Module
        const importEdges = importsToEdges(imports, fileNode.id, (source) =>
            createNodeId('module', source, ''),
        );

        // Edges CALLS: intra-file resolution
        const localFuncMap = new Map<string, string>();
        for (const fn of functions) {
            localFuncMap.set(fn.name, fn.id);
        }

        // API & DB tracking (TS/JS only for runtime DB operations)
        let apiNodes: GraphNode[] = [];
        let apiEdges: GraphEdge[] = [];
        let dbNodes: GraphNode[] = [];
        let dbEdges: GraphEdge[] = [];
        if (language !== 'python' && language !== 'rust') {
            const httpClientIds = buildHttpClientIdentifiers(imports);
            const dbClientIds = buildDBClientIdentifiers(imports);
            const apiCalls = extractAPICalls(tree, absolutePath, httpClientIds);
            const dbOps = extractDBOperations(tree, absolutePath, dbClientIds);
            if (apiCalls.length > 0) {
                const api = buildAPINodesAndEdges(apiCalls, localFuncMap, fileNode.id, absolutePath);
                apiNodes = api.nodes;
                apiEdges = api.edges;
            }
            if (dbOps.length > 0) {
                const db = buildDBNodesAndEdges(dbOps, localFuncMap, fileNode.id, absolutePath);
                dbNodes = db.nodes;
                dbEdges = db.edges;
            }
        }

        // Python migration enrichment: extract DB schema from Django/Alembic migration files
        let migrationSchemaNodes: GraphNode[] = [];
        let migrationSchemaEdges: GraphEdge[] = [];
        if (language === 'python' && isPythonMigrationFile(content)) {
            const migrationTables = extractDBSchemaFromPythonMigration(content);
            if (migrationTables.length > 0) {
                const schema = buildDBSchemaNodesAndEdges(migrationTables, fileNode.id, absolutePath);
                migrationSchemaNodes = schema.nodes;
                migrationSchemaEdges = schema.edges;
                logger.debug({ filePath: absolutePath, tables: migrationTables.length }, 'extracted Python migration schema');
            }
        }

        const nodes: GraphNode[] = [fileNode, ...functions, ...classes, ...variables, ...routes, ...moduleNodes, ...apiNodes, ...dbNodes, ...migrationSchemaNodes];

        const localVarMap = new Map<string, string>();
        for (const v of variables) {
            localVarMap.set(v.name, v.id);
        }
        const localCallEdges = resolveCallEdges(calls, localFuncMap);

        // Edges CALLS from file context (calls in anonymous callbacks, top-level)
        const fileCallEdges = resolveFileCallEdges(calls, localFuncMap, fileNode.id);

        // Edges DEPENDS_ON for variable-array references -> functions
        // Ex: sanitizeInputs -> sanitizeBodyParams
        const variableRefEdges = resolveVariableArrayReferenceEdges(arrayAliases, localVarMap, localFuncMap);
        // Edges DEPENDS_ON for const/let declarations wrapping a same-name function
        // Ex: export const sanitizeBodyParams = (...) => ...
        const variableDeclEdges = resolveVariableDeclarationAliasEdges(localVarMap, localFuncMap);

        // Edges EXTENDS: Class → parent Class
        const extendsEdges = resolveExtendsEdges(classes, localFuncMap, absolutePath);

        // Edges IMPLEMENTS: Class → Interface (by name)
        const implementsEdges = resolveImplementsEdges(classes, absolutePath);

        // Edges HANDLES: Route → handler function (Express router.get('/path', handler))
        const handlesEdges = resolveRouteHandlesEdges(routes, localFuncMap);

        // Edges framework: File → Function for Next.js, Nuxt, etc. entry points
        const frameworkEdges = resolveFrameworkEntryEdges(fileNode, functions);

        const edges: GraphEdge[] = [
            ...containsEdges,
            ...importEdges,
            ...localCallEdges,
            ...fileCallEdges,
            ...variableRefEdges,
            ...variableDeclEdges,
            ...extendsEdges,
            ...implementsEdges,
            ...handlesEdges,
            ...frameworkEdges,
            ...apiEdges,
            ...dbEdges,
            ...migrationSchemaEdges,
        ];

        logger.debug({ filePath: absolutePath, nodes: nodes.length, edges: edges.length }, 'parsed file');

        return { file: fileNode, nodes, edges, imports, exports, calls, arrayAliases };
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

        // Cross-file resolution: DEPENDS_ON (imports), CALLS, EXTENDS
        const globalFuncMap = new Map<string, string>();
        const globalFuncMultiMap = new Map<string, string[]>();
        const globalClassMap = new Map<string, string>();
        const filePathToId = new Map<string, string>();
        const nodeIdToFileId = new Map<string, string>();
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
                if (n.type !== 'file') nodeIdToFileId.set(n.id, r.file.id);
            }
        }

        // Resolution of path aliases (tsconfig.json paths: { "@/*": ["./src/*"] })
        // Supports monorepos with multiple tsconfig (web-app/, backend/, etc.)
        const allAliasConfigs = findAllPathAliases(filePaths);
        if (allAliasConfigs.length > 0) {
            logger.info(
                { count: allAliasConfigs.length, aliases: allAliasConfigs.map(c => ({ dir: c.configDir, prefixes: [...c.aliases.keys()] })) },
                'tsconfig path aliases detected',
            );
        }

        // DEPENDS_ON resolution: File → File via relative imports AND aliases
        const resolvedImportsByFile = new Map<string, Array<{ imp: ImportInfo; resolvedPath: string }>>();
        let dependsOnCount = 0;
        for (const r of results) {
            const resolvedImports: Array<{ imp: ImportInfo; resolvedPath: string }> = [];
            for (const imp of r.imports) {
                let resolved: string | null = null;

                if (imp.source.startsWith('.')) {
                    resolved = resolveImportPath(r.file.path, imp.source, filePathToId);
                } else if (allAliasConfigs.length > 0) {
                    resolved = resolveAliasImportMulti(imp.source, r.file.path, allAliasConfigs, filePathToId);
                }

                if (resolved) {
                    const resolvedPath = idToFilePath(resolved, filePathToId);
                    if (resolvedPath) {
                        resolvedImports.push({ imp, resolvedPath });
                    }
                    const edgeId = `${r.file.id}->depends_on->${resolved}`;
                    const exists = r.edges.some(e => e.id === edgeId);
                    if (!exists) {
                        r.edges.push({
                            id: edgeId,
                            type: 'DEPENDS_ON' as const,
                            sourceId: r.file.id,
                            targetId: resolved,
                            confidence: imp.source.startsWith('.') ? 1.0 : 0.9,
                            kind: 'import' as const,
                        });
                        dependsOnCount++;
                    }
                }
            }
            resolvedImportsByFile.set(r.file.path, resolvedImports);
        }

        let crossFileCallCount = 0;
        let crossFileExtendsCount = 0;
        const resultByPath = new Map(results.map((res) => [res.file.path, res] as const));
        for (const r of results) {
            const localIds = new Set(r.nodes.map((n) => n.id));
            const importedReceiverFileIds = buildImportedReceiverFileIds(
                r.file.path,
                resolvedImportsByFile,
                filePathToId,
            );
            const importedAliasFunctionIds = buildImportedAliasFunctionIds(
                r.file.path,
                resolvedImportsByFile,
                resultByPath,
            );

            // Build set of all file IDs this file imports from (static + dynamic)
            // Then transitively expand through barrel re-exports (export * from './foo')
            const importedFileIds = new Set<string>();
            for (const { resolvedPath } of resolvedImportsByFile.get(r.file.path) ?? []) {
                const fid = filePathToId.get(resolvedPath);
                if (fid) importedFileIds.add(fid);
            }
            expandBarrelReExports(importedFileIds, filePathToId, resolvedImportsByFile);

            // Cross-file CALLS (named functions → functions in other files)
            const crossCallEdges = resolveCrossFileCallEdges(
                r.calls,
                localIds,
                globalFuncMultiMap,
                importedAliasFunctionIds,
                importedReceiverFileIds,
                nodeIdToFileId,
                importedFileIds,
            );
            const existingEdgeIds = new Set(r.edges.map((e) => e.id));
            const importSymbolRefEdges = resolveImportedSymbolReferenceEdges(
                r.file.id,
                r.file.path,
                resolvedImportsByFile,
                resultByPath,
                r.calls,
            );
            for (const edge of importSymbolRefEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
                }
            }
            for (const edge of crossCallEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
                    crossFileCallCount++;
                }
            }

            // Cross-file CALLS from file context (__file__ → functions in other files)
            const crossFileEdges = resolveFileCrossFileCallEdges(
                r.calls,
                localIds,
                globalFuncMultiMap,
                r.file.id,
                importedAliasFunctionIds,
                importedReceiverFileIds,
                nodeIdToFileId,
                importedFileIds,
            );
            for (const edge of crossFileEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
                    crossFileCallCount++;
                }
            }

            // CALLS cross-fichier via alias tableaux importes:
            // import { sanitizeInputs } from './sanitizeMiddleware'; app.use(sanitizeInputs)
            const localFuncMap = new Map<string, string>();
            for (const n of r.nodes) {
                if (n.type === 'function') localFuncMap.set(n.name, n.id);
            }
            const crossArrayAliasEdges = resolveImportedArrayAliasCallEdges(
                r,
                results,
                localFuncMap,
                resolvedImportsByFile,
            );
            for (const edge of crossArrayAliasEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
                    if (edge.type === 'CALLS') crossFileCallCount++;
                }
            }

            // Cross-file EXTENDS
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

            // Cross-file HANDLES: Route → Function handler in another file
            const crossHandlesEdges = resolveCrossFileHandlesEdges(r.nodes, localIds, globalFuncMultiMap);
            for (const edge of crossHandlesEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
                }
            }
        }

        // Count unresolved non-relative imports for diagnostic purposes
        let unresolvedAliasImports = 0;
        for (const r of results) {
            for (const imp of r.imports) {
                if (!imp.source.startsWith('.') && !imp.isTypeOnly) {
                    const resolved = resolvedImportsByFile.get(r.file.path);
                    const wasResolved = resolved?.some(ri => ri.imp === imp) ?? false;
                    if (!wasResolved && (imp.source.startsWith('@/') || imp.source.startsWith('~/'))) {
                        unresolvedAliasImports++;
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
                aliasConfigs: allAliasConfigs.length,
                unresolvedAliasImports,
            },
            'parse batch complete',
        );
        return results;
    }

    return { parseFile, parseFiles };
}

// ── Local helpers (not extracted to modules) ──────────────────────────

function buildModuleNodes(imports: ImportInfo[]): ModuleNode[] {
    const nodes: ModuleNode[] = [];
    const seen = new Set<string>();
    for (const imp of imports) {
        const source = imp.source.trim();
        if (!source) continue;
        const id = createNodeId('module', source, '');
        if (seen.has(id)) continue;
        seen.add(id);
        const moduleType: ModuleNode['moduleType'] = source.startsWith('.')
            ? 'file'
            : source.startsWith('http://') || source.startsWith('https://')
                ? 'external'
                : 'package';
        nodes.push({
            id,
            type: 'module',
            name: source,
            path: source,
            moduleType,
        });
    }
    return nodes;
}

function idToFilePath(fileId: string, filePathToId: Map<string, string>): string | null {
    for (const [fp, id] of filePathToId.entries()) {
        if (id === fileId) return fp;
    }
    return null;
}

/**
 * Transitively expand importedFileIds through barrel re-exports.
 * When file A imports from barrel B (index.ts), and B does `export * from './C'`,
 * add C's file ID so cross-file CALLS resolution can match functions in C.
 */
function expandBarrelReExports(
    importedFileIds: Set<string>,
    filePathToId: Map<string, string>,
    resolvedImportsByFile: Map<string, Array<{ imp: ImportInfo; resolvedPath: string }>>,
): void {
    const idToPath = new Map<string, string>();
    for (const [p, id] of filePathToId) {
        idToPath.set(id, p);
    }
    const queue = [...importedFileIds];
    while (queue.length > 0) {
        const fid = queue.shift()!;
        const fpath = idToPath.get(fid);
        if (!fpath) continue;
        for (const { imp, resolvedPath } of resolvedImportsByFile.get(fpath) ?? []) {
            if (!imp.isReExport) continue;
            const targetId = filePathToId.get(resolvedPath);
            if (targetId && !importedFileIds.has(targetId)) {
                importedFileIds.add(targetId);
                queue.push(targetId);
            }
        }
    }
}