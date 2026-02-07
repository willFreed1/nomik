import type { GraphService } from '@nomik/graph';
import { NomikError } from '@nomik/core';

/** Labels Neo4j reconnus par le scan */
const KNOWN_LABELS = ['File', 'Function', 'Class', 'Variable', 'Module', 'Route', 'DBTable', 'DBColumn', 'ExternalAPI', 'CronJob', 'Event', 'EnvVar', 'QueueJob', 'Metric', 'Span', 'Topic', 'SecurityIssue'];

/** Recupere le projectId depuis l'env (injecte par Cursor/IDE) */
function getProjectId(): string | undefined {
    return process.env.NOMIK_PROJECT_ID || undefined;
}

const TOOLS = {
    nm_search: {
        name: 'nm_search',
        description: 'Semantic search for nodes in the knowledge graph. Use this to find classes, functions, or files.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search term (name of symbol)' },
                limit: { type: 'number', description: 'Max results', default: 10 },
                project: { type: 'string', description: 'Project name to scope the search to. Overrides NOMIK_PROJECT_ID env var.' },
            },
            required: ['query'],
        },
    },
    nm_db_impact: {
        name: 'nm_db_impact',
        description: 'Analyze who reads/writes a DB table or a specific column in the knowledge graph.',
        inputSchema: {
            type: 'object',
            properties: {
                table: { type: 'string', description: 'Table name (e.g. users)' },
                column: { type: 'string', description: 'Optional column name (e.g. email)' },
                limit: { type: 'number', description: 'Max result rows per reads/writes list', default: 100 },
                project: { type: 'string', description: 'Project name to scope the analysis to. Overrides NOMIK_PROJECT_ID env var.' },
            },
            required: ['table'],
        },
    },
    nm_impact: {
        name: 'nm_impact',
        description: 'Analyze downstream impact of a change to a symbol. Returns a list of dependent nodes.',
        inputSchema: {
            type: 'object',
            properties: {
                symbolId: { type: 'string', description: 'The unique ID of the node (from search)' },
                depth: { type: 'number', description: 'Traversal depth', default: 3 },
                project: { type: 'string', description: 'Project name to scope the analysis to. Overrides NOMIK_PROJECT_ID env var.' },
            },
            required: ['symbolId'],
        },
    },
    nm_trace: {
        name: 'nm_trace',
        description: 'Show the full dependency chain between two symbols. Returns the shortest path.',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'Source symbol name' },
                to: { type: 'string', description: 'Target symbol name' },
                project: { type: 'string', description: 'Project name to scope the trace to. Overrides NOMIK_PROJECT_ID env var.' },
            },
            required: ['from', 'to'],
        },
    },
    nm_context: {
        name: 'nm_context',
        description: 'Get rich context for a file or function: what it contains, what it calls, what calls it, its imports.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name of the file (path) or function/class name' },
                project: { type: 'string', description: 'Project name to scope the context to. Overrides NOMIK_PROJECT_ID env var.' },
            },
            required: ['name'],
        },
    },
    nm_health: {
        name: 'nm_health',
        description: 'Codebase health metrics: node counts, edge counts, dead code, god objects, god files, duplicate code.',
        inputSchema: {
            type: 'object',
            properties: {
                project: { type: 'string', description: 'Project name to scope the analysis to. Overrides NOMIK_PROJECT_ID env var.' },
                includeDeadCode: { type: 'boolean', description: 'Include dead code analysis', default: false },
                includeGodObjects: { type: 'boolean', description: 'Include god object detection', default: false },
                godObjectThreshold: { type: 'number', description: 'Dependency count threshold for god objects', default: 15 },
                includeGodFiles: { type: 'boolean', description: 'Include god file detection (files with too many functions)', default: false },
                godFileThreshold: { type: 'number', description: 'Function count threshold for god files', default: 10 },
                includeDuplicates: { type: 'boolean', description: 'Include duplicate code detection (functions with identical body hash)', default: false },
            },
        },
    },
    nm_path: {
        name: 'nm_path',
        description: 'Find the shortest path between two code entities in the knowledge graph. Returns detailed steps with node types and relationship types.',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'Source node name' },
                to: { type: 'string', description: 'Target node name' },
                project: { type: 'string', description: 'Project name to scope the path search to. Overrides NOMIK_PROJECT_ID env var.' },
            },
            required: ['from', 'to'],
        },
    },
    nm_changes: {
        name: 'nm_changes',
        description: 'Show nodes that changed recently. Use to answer "what changed today/this week?"',
        inputSchema: {
            type: 'object',
            properties: {
                since: { type: 'string', description: 'ISO date string (e.g. 2026-02-05T00:00:00Z). Default: 24h ago' },
                limit: { type: 'number', description: 'Max results', default: 30 },
                project: { type: 'string', description: 'Project name to scope the changes to. Overrides NOMIK_PROJECT_ID env var.' },
            },
        },
    },
    nm_explain: {
        name: 'nm_explain',
        description: 'Explain a symbol — returns its type, file location, incoming edges (callers), outgoing edges (callees), and summary. Use this to understand what a function/class does and how it connects.',
        inputSchema: {
            type: 'object',
            properties: {
                symbol: { type: 'string', description: 'Name of the function, class, or variable to explain' },
                project: { type: 'string', description: 'Project name to scope the explanation to. Overrides NOMIK_PROJECT_ID env var.' },
            },
            required: ['symbol'],
        },
    },
    nm_projects: {
        name: 'nm_projects',
        description: 'List all projects tracked in the NOMIK knowledge graph.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
};

export async function handleListTools() {
    return Object.values(TOOLS);
}

/** Extraction des proprietes depuis un record Neo4j */
function extractNodeData(record: any): Record<string, unknown> {
    const node = record.n;
    if (!node) return {};
    const props = node.properties ?? node;
    const labels: string[] = node.labels ?? [];
    return { ...props, _labels: labels };
}

export async function handleCallTool(graph: GraphService, name: string, args: any) {
    const projectId = getProjectId();
    /** Resolve effective project: explicit arg > env var */
    const eid = (a: any) => a.project ? String(a.project) : projectId;

    switch (name) {
        case 'nm_search': {
            const effectiveProjectId = eid(args);
            const query = String(args.query ?? '');
            const limit = Number(args.limit) || 10;
            const projectFilter = effectiveProjectId ? 'AND n.projectId = $projectId' : '';
            // Normalize path separators for cross-platform search
            const queryAlt = query.includes('/') ? query.replace(/\//g, '\\') : query.includes('\\') ? query.replace(/\\\\/g, '/') : null;

            const results = await graph.executeQuery<{ n: any }>(
                `MATCH (n)
                 WHERE any(lbl IN labels(n) WHERE lbl IN $labels)
                   AND (
                     $query = '' OR $query = '*'
                     OR (n.name IS NOT NULL AND toLower(n.name) CONTAINS toLower($query))
                     OR (n.path IS NOT NULL AND toLower(n.path) CONTAINS toLower($query))
                     OR (n.id IS NOT NULL AND n.id CONTAINS $query)
                     ${queryAlt ? 'OR (n.path IS NOT NULL AND toLower(n.path) CONTAINS toLower($queryAlt))' : ''}
                   )
                   ${projectFilter}
                 RETURN n
                 ORDER BY CASE WHEN n.name IS NOT NULL THEN n.name ELSE n.path END
                 LIMIT toInteger($limit)`,
                { query, queryAlt, limit, labels: KNOWN_LABELS, projectId: effectiveProjectId }
            );

            const nodes = results.map(extractNodeData);
            return [{ type: 'text', text: JSON.stringify(nodes, null, 2) }];
        }

        case 'nm_impact': {
            const effectiveProjectId = eid(args);
            const symId = String(args.symbolId);
            const depth = Number(args.depth) || 3;
            const impacts = await graph.getImpact(symId, depth, effectiveProjectId);
            return [{ type: 'text', text: JSON.stringify(impacts, null, 2) }];
        }

        case 'nm_trace': {
            const effectiveProjectId = eid(args);
            const from = String(args.from);
            const to = String(args.to);
            const paths = await graph.getDependencyChain(from, to, effectiveProjectId);
            return [{ type: 'text', text: JSON.stringify(paths, null, 2) }];
        }

        case 'nm_context': {
            const effectiveProjectId = eid(args);
            const target = String(args.name);
            const projectFilter = effectiveProjectId ? 'AND n.projectId = $projectId' : '';
            const preferFile = /\.[a-zA-Z0-9]+$/.test(target);
            // Normalize path separators for cross-platform lookup
            const targetAlt = target.includes('/') ? target.replace(/\//g, '\\') : target.includes('\\') ? target.replace(/\\\\/g, '/') : null;
            const nodeResults = await graph.executeQuery<any>(
                `MATCH (n)
                 WHERE (n.name = $target OR n.path = $target OR n.path CONTAINS $target
                        ${targetAlt ? 'OR n.path = $targetAlt OR n.path CONTAINS $targetAlt' : ''}) ${projectFilter}
                 WITH n,
                      CASE
                        WHEN n.path = $target OR n.path = $targetAlt THEN 3
                        WHEN n.name = $target THEN 2
                        WHEN n.path CONTAINS $target OR ($targetAlt IS NOT NULL AND n.path CONTAINS $targetAlt) THEN 1
                        ELSE 0
                      END as rank
                 RETURN n
                 ORDER BY rank DESC,
                          CASE WHEN $preferFile AND 'File' IN labels(n) THEN 1 ELSE 0 END DESC,
                          size(COALESCE(n.path, n.name, '')) ASC
                 LIMIT 1`,
                { target, targetAlt, projectId: effectiveProjectId, preferFile }
            );

            if (nodeResults.length === 0) {
                return [{ type: 'text', text: JSON.stringify({ error: 'Node not found', query: target }) }];
            }

            const nodeRecord = nodeResults[0];
            const node = nodeRecord.n;
            const nodeProps = node?.properties ?? node ?? {};
            const nodeLabels: string[] = node?.labels ?? [];
            const nodeId = nodeProps.id as string | undefined;
            if (!nodeId) {
                return [{ type: 'text', text: JSON.stringify({ error: 'Node has no id', query: target }) }];
            }

            const toItems = <T>(rows: any[]): T[] =>
                rows
                    .map(r => r.item)
                    .filter((v): v is T => v !== null && v !== undefined);

            const containsRows = await graph.executeQuery<any>(
                `MATCH (n {id: $id})-[:CONTAINS]->(child)
                 RETURN DISTINCT {name: COALESCE(child.name, child.path), type: labels(child)[0]} as item
                 ORDER BY item.name`,
                { id: nodeId }
            );

            let callsRows: any[] = [];
            let calledByRows: any[] = [];
            let importsRows: any[] = [];
            let extendsRows: any[] = [];

            if (nodeLabels.includes('File')) {
                callsRows = await graph.executeQuery<any>(
                    `MATCH (f:File {id: $id})-[:CONTAINS]->(inner)-[:CALLS|HANDLES]->(callee)
                     RETURN DISTINCT {name: COALESCE(callee.name, callee.path), file: COALESCE(callee.filePath, callee.path)} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
                calledByRows = await graph.executeQuery<any>(
                    `MATCH (f:File {id: $id})-[:CONTAINS]->(inner)<-[:CALLS|HANDLES]-(caller)
                     RETURN DISTINCT {name: COALESCE(caller.name, caller.path), file: COALESCE(caller.filePath, caller.path)} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
                importsRows = await graph.executeQuery<any>(
                    `MATCH (f:File {id: $id})-[:DEPENDS_ON|IMPORTS]->(imp)
                     RETURN DISTINCT {name: COALESCE(imp.name, imp.path)} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
                extendsRows = await graph.executeQuery<any>(
                    `MATCH (f:File {id: $id})-[:CONTAINS]->(:Class)-[:EXTENDS]->(parent)
                     RETURN DISTINCT {name: parent.name} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
            } else {
                callsRows = await graph.executeQuery<any>(
                    `MATCH (n {id: $id})-[:CALLS|HANDLES]->(callee)
                     RETURN DISTINCT {name: COALESCE(callee.name, callee.path), file: COALESCE(callee.filePath, callee.path)} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
                calledByRows = await graph.executeQuery<any>(
                    `MATCH (caller)-[:CALLS|HANDLES]->(n {id: $id})
                     RETURN DISTINCT {name: COALESCE(caller.name, caller.path), file: COALESCE(caller.filePath, caller.path)} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
                importsRows = await graph.executeQuery<any>(
                    `MATCH (n {id: $id})-[:DEPENDS_ON|IMPORTS]->(imp)
                     RETURN DISTINCT {name: COALESCE(imp.name, imp.path)} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
                extendsRows = await graph.executeQuery<any>(
                    `MATCH (n {id: $id})-[:EXTENDS]->(parent)
                     RETURN DISTINCT {name: parent.name} as item
                     ORDER BY item.name`,
                    { id: nodeId }
                );
            }

            const context = {
                node: { ...nodeProps, _labels: nodeLabels },
                contains: toItems(containsRows),
                calls: toItems(callsRows),
                calledBy: toItems(calledByRows),
                imports: toItems(importsRows),
                extends: toItems(extendsRows),
            };
            return [{ type: 'text', text: JSON.stringify(context, null, 2) }];
        }

        case 'nm_health': {
            const effectiveProjectId = args.project ? String(args.project) : projectId;
            const stats = await graph.getStats(effectiveProjectId);
            const result: any = { ...stats };

            if (args.includeDeadCode) {
                result.deadCode = await graph.getDeadCode(effectiveProjectId);
            }
            if (args.includeGodObjects) {
                const threshold = Number(args.godObjectThreshold) || 15;
                result.godObjects = await graph.getGodObjects(threshold, effectiveProjectId);
            }
            if (args.includeGodFiles) {
                const threshold = Number(args.godFileThreshold) || 10;
                result.godFiles = await graph.getGodFiles(threshold, effectiveProjectId);
            }
            if (args.includeDuplicates) {
                result.duplicates = await graph.getDuplicates(effectiveProjectId);
            }

            const edgeFilter = effectiveProjectId ? '{projectId: $projectId}' : '';
            const edgeCounts = await graph.executeQuery<{ type: string; count: number }>(
                `MATCH ()-[r ${edgeFilter}]->()
                 RETURN type(r) as type, count(r) as count
                 ORDER BY count DESC`,
                { projectId: effectiveProjectId }
            );
            result.edgeTypes = edgeCounts;

            return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
        }

        case 'nm_db_impact': {
            const effectiveProjectId = eid(args);
            const table = String(args.table ?? '').trim();
            const column = args.column ? String(args.column).trim() : undefined;
            const limit = Number(args.limit) || 100;
            if (!table) {
                return [{ type: 'text', text: JSON.stringify({ error: 'table is required' }) }];
            }
            const impact = await graph.getDBImpact(table, column, limit, effectiveProjectId);
            return [{ type: 'text', text: JSON.stringify(impact, null, 2) }];
        }

        case 'nm_path': {
            const effectiveProjectId = eid(args);
            const from = String(args.from);
            const to = String(args.to);
            const detailed = await graph.getDetailedPath(from, to, effectiveProjectId);
            if (detailed.length === 0) {
                return [{ type: 'text', text: JSON.stringify({ error: 'No path found', from, to }) }];
            }
            return [{ type: 'text', text: JSON.stringify({ from, to, paths: detailed }, null, 2) }];
        }

        case 'nm_changes': {
            const effectiveProjectId = eid(args);
            const since = args.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const limit = Number(args.limit) || 30;
            const changes = await graph.getRecentChanges(since, limit, effectiveProjectId);
            return [{ type: 'text', text: JSON.stringify(changes, null, 2) }];
        }

        case 'nm_explain': {
            const effectiveProjectId = eid(args);
            const symbolName = String(args.symbol ?? '').trim();
            if (!symbolName) {
                return [{ type: 'text', text: JSON.stringify({ error: 'symbol is required' }) }];
            }
            const explain = await graph.getExplain(symbolName, effectiveProjectId);
            if (!explain.symbol) {
                return [{ type: 'text', text: JSON.stringify({ error: `Symbol "${symbolName}" not found in graph`, hint: 'Run nomik scan first, then use the exact function/class name' }) }];
            }

            // Build a structured summary
            const inByType: Record<string, string[]> = {};
            for (const e of explain.incomingEdges) {
                (inByType[e.edgeType] ??= []).push(`${e.sourceType}:${e.sourceName}`);
            }
            const outByType: Record<string, string[]> = {};
            for (const e of explain.outgoingEdges) {
                (outByType[e.edgeType] ??= []).push(`${e.targetType}:${e.targetName}`);
            }

            const summary = {
                symbol: explain.symbol,
                containedIn: explain.containedIn,
                siblingCount: explain.siblingCount,
                incoming: inByType,
                outgoing: outByType,
                callerCount: explain.incomingEdges.filter(e => e.edgeType === 'CALLS').length,
                calleeCount: explain.outgoingEdges.filter(e => e.edgeType === 'CALLS').length,
                totalEdges: explain.incomingEdges.length + explain.outgoingEdges.length,
            };
            return [{ type: 'text', text: JSON.stringify(summary, null, 2) }];
        }

        case 'nm_projects': {
            const projects = await graph.listProjects();
            return [{ type: 'text', text: JSON.stringify(projects, null, 2) }];
        }

        default:
            throw new NomikError(`Unknown tool: ${name}`, 'INVALID_CONFIG', 'low', true);
    }
}
