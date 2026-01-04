import fs from 'node:fs';
import path from 'node:path';
import Parser from 'tree-sitter';
import { type ClassNode, type FunctionNode, type VariableNode, type GraphNode, type GraphEdge, type CallsEdge, type ExtendsEdge, type ImplementsEdge, type HandlesEdge, ParseError, getLogger } from '@nomik/core';
import type { FileNode, RouteNode } from '@nomik/core';
import { detectLanguage, grammars } from './languages/index';
import { extractFunctions } from './extractors/functions';
import { extractClasses } from './extractors/classes';
import { extractVariables } from './extractors/variables';
import { extractImports, importsToEdges } from './extractors/imports';
import { extractRoutes } from './extractors/routes';
import { extractExports } from './extractors/exports';
import { extractCalls, extractArrayCallbackAliases } from './extractors/calls';
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

        // Fichiers markdown : parsing sans tree-sitter
        if (language === 'markdown') {
            const md = parseMarkdown(absolutePath, content);
            logger.debug({ filePath: absolutePath, nodes: md.nodes.length, edges: md.edges.length }, 'parsed markdown');
            return { file: md.file, nodes: md.nodes, edges: md.edges, imports: [], exports: [], calls: [], arrayAliases: {} };
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
            // typescript, tsx, javascript — memes extracteurs (tsx utilise le grammar TSX de tree-sitter)
            functions = extractFunctions(tree, absolutePath);
            classes = extractClasses(tree, absolutePath);
            variables = extractVariables(tree, absolutePath);
            imports = extractImports(tree, absolutePath);
            routes = extractRoutes(tree, absolutePath);
            exports = extractExports(tree, absolutePath);
            calls = extractCalls(tree, absolutePath);
            arrayAliases = Object.fromEntries(extractArrayCallbackAliases(tree));
        }

        const nodes: GraphNode[] = [fileNode, ...functions, ...classes, ...variables, ...routes];

        // Edges CONTAINS : File → Function/Class/Route
        const containsEdges: GraphEdge[] = [...functions, ...classes, ...variables, ...routes].map((n) => ({
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
        const localVarMap = new Map<string, string>();
        for (const v of variables) {
            localVarMap.set(v.name, v.id);
        }
        const localCallEdges = resolveCallEdges(calls, localFuncMap);

        // Edges CALLS depuis le contexte fichier (appels dans callbacks anonymes, top-level)
        const fileCallEdges = resolveFileCallEdges(calls, localFuncMap, fileNode.id);

        // Edges DEPENDS_ON pour references variable-array -> fonctions
        // Ex: sanitizeInputs -> sanitizeBodyParams
        const variableRefEdges = resolveVariableArrayReferenceEdges(arrayAliases, localVarMap, localFuncMap);

        // Edges EXTENDS : Class → Class parent
        const extendsEdges = resolveExtendsEdges(classes, localFuncMap, absolutePath);

        // Edges IMPLEMENTS : Class → Interface (par nom)
        const implementsEdges = resolveImplementsEdges(classes, absolutePath);

        // Edges HANDLES : Route → handler function (Express router.get('/path', handler))
        const handlesEdges = resolveRouteHandlesEdges(routes, localFuncMap);

        // Edges framework : File → Function pour les entry points Next.js, Nuxt, etc.
        const frameworkEdges = resolveFrameworkEntryEdges(fileNode, functions);

        const edges: GraphEdge[] = [
            ...containsEdges,
            ...importEdges,
            ...localCallEdges,
            ...fileCallEdges,
            ...variableRefEdges,
            ...extendsEdges,
            ...implementsEdges,
            ...handlesEdges,
            ...frameworkEdges,
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

        // Resolution cross-fichier : DEPENDS_ON (imports), CALLS, EXTENDS
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

        // Resolution des aliases de chemin (tsconfig.json paths: { "@/*": ["./src/*"] })
        // Supporte les monorepos avec plusieurs tsconfig (web-app/, backend/, etc.)
        const allAliasConfigs = findAllPathAliases(filePaths);

        // Resolution DEPENDS_ON : File → File via imports relatifs ET aliases
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
        for (const r of results) {
            const localIds = new Set(r.nodes.map((n) => n.id));
            const importedReceiverFileIds = buildImportedReceiverFileIds(
                r.file.path,
                resolvedImportsByFile,
                filePathToId,
            );

            // CALLS cross-fichier (fonctions nommees → fonctions dans autres fichiers)
            const crossCallEdges = resolveCrossFileCallEdges(
                r.calls,
                localIds,
                globalFuncMultiMap,
                importedReceiverFileIds,
                nodeIdToFileId,
            );
            const existingEdgeIds = new Set(r.edges.map((e) => e.id));
            for (const edge of crossCallEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
                    crossFileCallCount++;
                }
            }

            // CALLS cross-fichier depuis le contexte fichier (__file__ → fonctions dans autres fichiers)
            const crossFileEdges = resolveFileCrossFileCallEdges(
                r.calls,
                localIds,
                globalFuncMultiMap,
                r.file.id,
                importedReceiverFileIds,
                nodeIdToFileId,
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

            // HANDLES cross-fichier : Route → Function handler dans un autre fichier
            const crossHandlesEdges = resolveCrossFileHandlesEdges(r.nodes, localIds, globalFuncMultiMap);
            for (const edge of crossHandlesEdges) {
                if (!existingEdgeIds.has(edge.id)) {
                    r.edges.push(edge);
                    existingEdgeIds.add(edge.id);
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

/** Variable array aliases to function references (intra-file).
 * Creates DEPENDS_ON(kind='call') edges for value-flow references:
 *   export const sanitizeInputs = [sanitizeQueryParams, sanitizeBodyParams]
 */
function resolveVariableArrayReferenceEdges(
    arrayAliases: Record<string, string[]>,
    varMap: Map<string, string>,
    funcMap: Map<string, string>,
): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();

    for (const [alias, members] of Object.entries(arrayAliases)) {
        const varId = varMap.get(alias);
        if (!varId) continue;
        for (const member of members) {
            const fnId = funcMap.get(member);
            if (!fnId) continue;
            const key = `${varId}->${fnId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push({
                id: `${varId}->depends_on->${fnId}`,
                type: 'DEPENDS_ON' as const,
                sourceId: varId,
                targetId: fnId,
                confidence: 0.9,
                kind: 'call' as const,
            });
        }
    }

    return edges;
}

/** Resolution cross-fichier avec multi-map (gere les noms de fonctions dupliques) */
function resolveCrossFileCallEdges(
    calls: CallInfo[],
    localIds: Set<string>,
    multiMap: Map<string, string[]>,
    importedReceiverFileIds: Map<string, Set<string>>,
    nodeIdToFileId: Map<string, string>,
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
        let remoteCalleeIds = calleeIds.filter((id) => !localIds.has(id));
        remoteCalleeIds = filterMethodCandidatesByReceiverImport(
            remoteCalleeIds,
            call,
            importedReceiverFileIds,
            nodeIdToFileId,
        );

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
    importedReceiverFileIds: Map<string, Set<string>>,
    nodeIdToFileId: Map<string, string>,
): CallsEdge[] {
    const edges: CallsEdge[] = [];
    const seen = new Set<string>();

    for (const call of calls) {
        if (call.callerName !== '__file__') continue;
        let calleeIds = multiMap.get(call.calleeName) ?? [];
        calleeIds = filterMethodCandidatesByReceiverImport(
            calleeIds,
            call,
            importedReceiverFileIds,
            nodeIdToFileId,
        );

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

function filterMethodCandidatesByReceiverImport(
    calleeIds: string[],
    call: CallInfo,
    importedReceiverFileIds: Map<string, Set<string>>,
    nodeIdToFileId: Map<string, string>,
): string[] {
    if (!call.isMethodCall || !call.receiverName) return calleeIds;
    const importedTargetFileIds = importedReceiverFileIds.get(call.receiverName);
    if (!importedTargetFileIds || importedTargetFileIds.size === 0) return calleeIds;
    return calleeIds.filter((calleeId) => {
        const ownerFileId = nodeIdToFileId.get(calleeId);
        return ownerFileId ? importedTargetFileIds.has(ownerFileId) : false;
    });
}

function idToFilePath(fileId: string, filePathToId: Map<string, string>): string | null {
    for (const [fp, id] of filePathToId.entries()) {
        if (id === fileId) return fp;
    }
    return null;
}

function buildImportedReceiverFileIds(
    importerPath: string,
    resolvedImportsByFile: Map<string, Array<{ imp: ImportInfo; resolvedPath: string }>>,
    filePathToId: Map<string, string>,
): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    const resolvedImports = resolvedImportsByFile.get(importerPath) ?? [];

    for (const { imp, resolvedPath } of resolvedImports) {
        const targetFileId = filePathToId.get(resolvedPath);
        if (!targetFileId) continue;
        for (const rawSpecifier of imp.specifiers) {
            const specifier = normalizeImportSpecifier(rawSpecifier);
            if (!specifier) continue;
            const set = map.get(specifier) ?? new Set<string>();
            set.add(targetFileId);
            map.set(specifier, set);
        }
    }
    return map;
}

function normalizeImportSpecifier(specifier: string): string {
    const trimmed = specifier.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('* as ')) {
        return trimmed.slice(5).trim();
    }
    const asMatch = /\bas\b/.test(trimmed)
        ? trimmed.split(/\bas\b/).map(s => s.trim()).filter(Boolean)
        : null;
    if (asMatch && asMatch.length >= 2) {
        return asMatch[asMatch.length - 1] ?? '';
    }
    return trimmed;
}

/** Resolve calls through imported array aliases.
 * Example:
 *   // sanitizeMiddleware.ts
 *   export const sanitizeInputs = [sanitizeQueryParams, sanitizeBodyParams]
 *   // index.ts
 *   app.use(sanitizeInputs)
 * This creates CALLS edges from the actual caller to both underlying functions.
 */
function resolveImportedArrayAliasCallEdges(
    current: ParseResult,
    allResults: ParseResult[],
    localFuncMap: Map<string, string>,
    resolvedImportsByFile: Map<string, Array<{ imp: ImportInfo; resolvedPath: string }>>,
): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    const resultByPath = new Map(allResults.map(r => [r.file.path, r] as const));
    const resolvedImports = resolvedImportsByFile.get(current.file.path) ?? [];

    // Build local lookup: imported symbol name -> exporting file parse result
    const importedAliasTargets = new Map<string, ParseResult[]>();
    for (const entry of resolvedImports) {
        const targetResult = resultByPath.get(entry.resolvedPath);
        if (!targetResult) continue;
        for (const specifier of entry.imp.specifiers) {
            const normalized = normalizeImportSpecifier(specifier);
            if (!normalized) continue;
            const arr = importedAliasTargets.get(normalized) ?? [];
            arr.push(targetResult);
            importedAliasTargets.set(normalized, arr);
        }
    }

    for (const call of current.calls) {
        const targetFiles = importedAliasTargets.get(call.calleeName);
        if (!targetFiles || targetFiles.length === 0) continue;

        const sourceId =
            call.callerName === '__file__'
                ? current.file.id
                : localFuncMap.get(call.callerName);
        if (!sourceId) continue;

        for (const targetFile of targetFiles) {
            const aliasMembers = targetFile.arrayAliases[call.calleeName] ?? [];
            if (aliasMembers.length === 0) continue;
            const aliasVarNode = targetFile.nodes.find(
                n => n.type === 'variable' && n.name === call.calleeName,
            );

            // Keep a direct usage edge to the imported alias variable when available.
            if (aliasVarNode) {
                const varKey = `${sourceId}->${aliasVarNode.id}`;
                if (!seen.has(varKey)) {
                    seen.add(varKey);
                    edges.push({
                        id: `${sourceId}->depends_on->${aliasVarNode.id}`,
                        type: 'DEPENDS_ON' as const,
                        sourceId,
                        targetId: aliasVarNode.id,
                        confidence: 0.9,
                        kind: 'call' as const,
                    });
                }
            }

            for (const memberName of aliasMembers) {
                const targetFunctions = targetFile.nodes.filter(
                    n => n.type === 'function' && n.name === memberName,
                );
                for (const fn of targetFunctions) {
                    const key = `${sourceId}->${fn.id}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    edges.push({
                        id: `${sourceId}->calls->${fn.id}`,
                        type: 'CALLS' as const,
                        sourceId,
                        targetId: fn.id,
                        confidence: 0.85,
                        line: call.line,
                        column: call.column,
                    });
                }
            }
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

/** Resolution des edges HANDLES : Route → handler function (intra-fichier)
 *  Cree un lien semantique entre un noeud Route et la fonction qui le gere
 *  Gere les handlers locaux et les member_expression (controller.method)
 */
function resolveRouteHandlesEdges(
    routes: GraphNode[],
    funcMap: Map<string, string>,
): HandlesEdge[] {
    const edges: HandlesEdge[] = [];
    for (const node of routes) {
        if (node.type !== 'route') continue;
        const route = node as RouteNode;
        if (!route.handlerName || route.handlerName === 'anonymous') continue;

        const methodName = extractHandlerMethodName(route.handlerName);
        const targetId = funcMap.get(methodName);
        if (targetId) {
            edges.push({
                id: `${route.id}->handles->${targetId}`,
                type: 'HANDLES' as const,
                sourceId: route.id,
                targetId,
                confidence: 0.9,
                middleware: route.middleware ?? [],
            });
        }
    }
    return edges;
}

/** Resolution des edges HANDLES cross-fichier : Route → Function dans un autre fichier
 *  Cas typique : attributeRoutes.ts contient router.get('/sets', attributeController.getAllSets)
 *  mais getAllSets est defini dans attributeController.ts
 */
function resolveCrossFileHandlesEdges(
    nodes: GraphNode[],
    localIds: Set<string>,
    multiMap: Map<string, string[]>,
): HandlesEdge[] {
    const edges: HandlesEdge[] = [];
    const seen = new Set<string>();

    for (const node of nodes) {
        if (node.type !== 'route') continue;
        const route = node as RouteNode;
        if (!route.handlerName || route.handlerName === 'anonymous') continue;

        const methodName = extractHandlerMethodName(route.handlerName);
        const candidateIds = multiMap.get(methodName) ?? [];

        // Only target functions in OTHER files (cross-file)
        const remoteIds = candidateIds.filter((id) => !localIds.has(id));
        for (const targetId of remoteIds) {
            const key = `${route.id}->${targetId}`;
            if (seen.has(key)) continue;
            seen.add(key);

            edges.push({
                id: `${route.id}->handles->${targetId}`,
                type: 'HANDLES' as const,
                sourceId: route.id,
                targetId,
                confidence: 0.85,
                middleware: route.middleware ?? [],
            });
        }
    }
    return edges;
}

/** Extrait le nom de methode depuis un handlerName (supporte "controller.method" et "method") */
function extractHandlerMethodName(handlerName: string): string {
    return handlerName.includes('.')
        ? handlerName.split('.').pop()!
        : handlerName;
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

// ────────────────────────────────────────────────────────────────────────
// Path Alias Resolution (tsconfig.json / jsconfig.json)
// ────────────────────────────────────────────────────────────────────────

interface PathAliasConfig {
    configDir: string; // directory containing the tsconfig
    baseDir: string;   // resolved baseUrl
    aliases: Map<string, string>; // prefix → resolved target directory
}

/** Parse un fichier tsconfig.json/jsconfig.json et extrait les path aliases */
function parseTsConfigFile(configPath: string, visited: Set<string> = new Set()): PathAliasConfig | null {
    const absoluteConfigPath = path.resolve(configPath);
    if (visited.has(absoluteConfigPath)) return null;
    visited.add(absoluteConfigPath);

    const config = readJsoncFile(absoluteConfigPath);
    if (!config) return null;

    const aliases = new Map<string, string>();

    // Merge aliases from extended config first, then override with local config.
    const extendsValue = typeof config.extends === 'string' ? config.extends : null;
    const extendedPath = extendsValue ? resolveExtendsConfigPath(absoluteConfigPath, extendsValue) : null;
    if (extendedPath && fs.existsSync(extendedPath)) {
        const extended = parseTsConfigFile(extendedPath, visited);
        if (extended) {
            for (const [prefix, targetDir] of extended.aliases.entries()) {
                aliases.set(prefix, targetDir);
            }
        }
    }

    const compilerOptions = config.compilerOptions ?? {};
    const baseUrl = compilerOptions.baseUrl ?? '.';
    const paths: Record<string, string[]> = compilerOptions.paths ?? {};
    const configDir = path.dirname(absoluteConfigPath);
    const baseDir = path.resolve(configDir, baseUrl);

    for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets) || targets.length === 0) continue;
        // "@/*" -> prefix "@/", target "./src/*" -> "<baseDir>/src/"
        const prefix = pattern.replace(/\*$/, '');
        const target = (targets[0] as string).replace(/\*$/, '');
        aliases.set(prefix, path.resolve(baseDir, target));
    }

    if (aliases.size === 0) return null;

    getLogger().debug({ configPath: absoluteConfigPath, aliases: Object.fromEntries(aliases) }, 'path aliases detected');
    return { configDir: path.resolve(configDir), baseDir, aliases };
}

function readJsoncFile(filePath: string): any | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const cleaned = content
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/,\s*([\]}])/g, '$1');
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

function resolveExtendsConfigPath(configPath: string, extendsValue: string): string | null {
    // Handle relative/absolute extends paths. Package-based extends are ignored for now.
    if (!extendsValue.startsWith('.') && !path.isAbsolute(extendsValue)) return null;
    const configDir = path.dirname(configPath);
    let candidate = path.isAbsolute(extendsValue)
        ? extendsValue
        : path.resolve(configDir, extendsValue);
    if (!path.extname(candidate)) candidate += '.json';
    return candidate;
}

/** Decouvre TOUS les tsconfig.json/jsconfig.json dans l'arborescence des fichiers scannes
 *  Supporte les monorepos : web-app/tsconfig.json, backend/tsconfig.json, etc.
 *  Retourne les configs triees par profondeur (le plus profond en premier)
 *  pour que la resolution nearest-match fonctionne correctement.
 */
function findAllPathAliases(filePaths: string[]): PathAliasConfig[] {
    const configs: PathAliasConfig[] = [];
    const checkedDirs = new Set<string>();
    const configNames = ['tsconfig.json', 'jsconfig.json'];

    // Parcourir chaque fichier et remonter son arborescence
    for (const fp of filePaths) {
        let dir = path.dirname(fp);
        while (dir !== path.dirname(dir)) {
            if (checkedDirs.has(dir)) break; // Deja verifie ce repertoire et ses parents
            checkedDirs.add(dir);

            for (const name of configNames) {
                const configPath = path.join(dir, name);
                if (fs.existsSync(configPath)) {
                    const config = parseTsConfigFile(configPath);
                    if (config) configs.push(config);
                    break; // Un seul config par repertoire
                }
            }

            dir = path.dirname(dir);
        }
    }

    // Trier par profondeur decroissante (le plus profond en premier)
    // pour que nearest-match fonctionne : web-app/tsconfig.json avant ./tsconfig.json
    configs.sort((a, b) => b.configDir.length - a.configDir.length);
    return configs;
}

/** Resout un import avec alias en cherchant le tsconfig le plus proche du fichier importeur
 *  Monorepo-safe : chaque sous-projet peut avoir ses propres aliases
 */
function resolveAliasImportMulti(
    importSource: string,
    importerPath: string,
    configs: PathAliasConfig[],
    filePathToId: Map<string, string>,
): string | null {
    const importerDir = path.resolve(path.dirname(importerPath));

    // Trouver le tsconfig le plus proche (deepest-first grace au tri)
    for (const config of configs) {
        if (!importerDir.startsWith(config.configDir)) continue;

        // Essayer chaque alias de ce config
        for (const [prefix, targetDir] of config.aliases) {
            if (!importSource.startsWith(prefix)) continue;
            const rest = importSource.slice(prefix.length);
            const searchBases = [path.join(targetDir, rest)];

            // Practical fallback for monorepo setups where @/* should resolve to <project>/src/*
            // but inherited paths from extended tsconfig may point to a shared root.
            if (prefix === '@/') {
                searchBases.push(path.join(config.configDir, 'src', rest));
            }

            for (const base of searchBases) {
                const candidates = [
                    base + '.ts',
                    base + '.tsx',
                    base + '.js',
                    base + '.jsx',
                    base + '/index.ts',
                    base + '/index.tsx',
                    base + '/index.js',
                    base,
                ];

                for (const candidate of candidates) {
                    const normalized = path.resolve(candidate);
                    const id = filePathToId.get(normalized);
                    if (id) return id;
                }
            }
        }
    }
    return null;
}

// ────────────────────────────────────────────────────────────────────────
// Framework Entry Point Detection (Next.js, Nuxt, etc.)
// ────────────────────────────────────────────────────────────────────────

/** Framework entry point patterns — fonctions automatiquement invoquees par le framework */
const FRAMEWORK_ENTRY_PATTERNS: Array<{
    filePattern: RegExp;
    functionNames: string[];
}> = [
    // Next.js middleware (src/middleware.ts or middleware.ts)
    { filePattern: /[\\/]middleware\.(ts|js|tsx|jsx)$/, functionNames: ['middleware'] },
    // Next.js API routes (app/**/route.ts — GET, POST, PUT, DELETE, PATCH exports)
    { filePattern: /[\\/]route\.(ts|js|tsx|jsx)$/, functionNames: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
    // Next.js page components (app/**/page.tsx — default export)
    { filePattern: /[\\/]page\.(ts|js|tsx|jsx)$/, functionNames: ['default', 'Page'] },
    // Next.js layout components (app/**/layout.tsx)
    { filePattern: /[\\/]layout\.(ts|js|tsx|jsx)$/, functionNames: ['default', 'Layout', 'RootLayout'] },
    // Next.js loading/error/not-found
    { filePattern: /[\\/](loading|error|not-found|global-error)\.(ts|js|tsx|jsx)$/, functionNames: ['default'] },
    // next.config.js lifecycle hooks
    { filePattern: /[\\/]next\.config\.(js|mjs|ts)$/, functionNames: ['rewrites', 'redirects', 'headers'] },
    // Nuxt plugins/middleware
    { filePattern: /[\\/]plugins[\\/]/, functionNames: ['default'] },
    // Express/Fastify main app entry
    { filePattern: /[\\/](app|server|index)\.(ts|js)$/, functionNames: ['default', 'app', 'server'] },
];

/** Cree des edges File → CALLS → Function pour les fonctions auto-invoquees par le framework
 *  Empeche les entry points framework d'etre flag dead code
 */
function resolveFrameworkEntryEdges(
    fileNode: { id: string; path: string },
    functions: { id: string; name: string }[],
): CallsEdge[] {
    const edges: CallsEdge[] = [];

    for (const pattern of FRAMEWORK_ENTRY_PATTERNS) {
        if (!pattern.filePattern.test(fileNode.path)) continue;

        for (const fn of functions) {
            if (pattern.functionNames.includes(fn.name)) {
                edges.push({
                    id: `${fileNode.id}->framework->${fn.id}`,
                    type: 'CALLS' as const,
                    sourceId: fileNode.id,
                    targetId: fn.id,
                    confidence: 0.95,
                    line: 0,
                });
            }
        }
    }

    return edges;
}
