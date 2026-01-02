import type { GraphService } from '@nomik/graph';
import { NomikError } from '@nomik/core';

/** Labels Neo4j reconnus par le scan */
const KNOWN_LABELS = ['File', 'Function', 'Class', 'Variable', 'Module', 'Route', 'DBTable', 'ExternalAPI', 'CronJob', 'Event', 'EnvVar'];

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
            },
            required: ['query'],
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
            },
            required: ['name'],
        },
    },
    nm_health: {
        name: 'nm_health',
        description: 'Codebase health metrics: node counts, edge counts, dead code, god objects.',
        inputSchema: {
            type: 'object',
            properties: {
                includeDeadCode: { type: 'boolean', description: 'Include dead code analysis', default: false },
                includeGodObjects: { type: 'boolean', description: 'Include god object detection', default: false },
                godObjectThreshold: { type: 'number', description: 'Dependency count threshold for god objects', default: 15 },
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
            },
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

    switch (name) {
        case 'nm_search': {
            const query = String(args.query ?? '');
            const limit = Number(args.limit) || 10;
            const projectFilter = projectId ? 'AND n.projectId = $projectId' : '';

            const results = await graph.executeQuery<{ n: any }>(
                `MATCH (n)
                 WHERE any(lbl IN labels(n) WHERE lbl IN $labels)
                   AND (
                     $query = '' OR $query = '*'
                     OR (n.name IS NOT NULL AND toLower(n.name) CONTAINS toLower($query))
                     OR (n.path IS NOT NULL AND toLower(n.path) CONTAINS toLower($query))
                     OR (n.id IS NOT NULL AND n.id CONTAINS $query)
                   )
                   ${projectFilter}
                 RETURN n
                 ORDER BY CASE WHEN n.name IS NOT NULL THEN n.name ELSE n.path END
                 LIMIT toInteger($limit)`,
                { query, limit, labels: KNOWN_LABELS, projectId }
            );

            const nodes = results.map(extractNodeData);
            return [{ type: 'text', text: JSON.stringify(nodes, null, 2) }];
        }

        case 'nm_impact': {
            const symId = String(args.symbolId);
            const depth = Number(args.depth) || 3;
            const impacts = await graph.getImpact(symId, depth, projectId);
            return [{ type: 'text', text: JSON.stringify(impacts, null, 2) }];
        }

        case 'nm_trace': {
            const from = String(args.from);
            const to = String(args.to);
            const paths = await graph.getDependencyChain(from, to, projectId);
            return [{ type: 'text', text: JSON.stringify(paths, null, 2) }];
        }

        case 'nm_context': {
            const target = String(args.name);
            const projectFilter = projectId ? 'AND n.projectId = $projectId' : '';
            const preferFile = /\.[a-zA-Z0-9]+$/.test(target);
            const nodeResults = await graph.executeQuery<any>(
                `MATCH (n)
                 WHERE (n.name = $target OR n.path = $target OR n.path CONTAINS $target) ${projectFilter}
                 WITH n,
                      CASE
                        WHEN n.path = $target THEN 3
                        WHEN n.name = $target THEN 2
                        WHEN n.path CONTAINS $target THEN 1
                        ELSE 0
                      END as rank
                 RETURN n
                 ORDER BY rank DESC,
                          CASE WHEN $preferFile AND 'File' IN labels(n) THEN 1 ELSE 0 END DESC,
                          size(COALESCE(n.path, n.name, '')) ASC
                 LIMIT 1`,
                { target, projectId, preferFile }
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
            const stats = await graph.getStats(projectId);
            const result: any = { ...stats };

            if (args.includeDeadCode) {
                result.deadCode = await graph.getDeadCode(projectId);
            }
            if (args.includeGodObjects) {
                const threshold = Number(args.godObjectThreshold) || 15;
                result.godObjects = await graph.getGodObjects(threshold, projectId);
            }

            const edgeFilter = projectId ? '{projectId: $projectId}' : '';
            const edgeCounts = await graph.executeQuery<{ type: string; count: number }>(
                `MATCH ()-[r ${edgeFilter}]->()
                 RETURN type(r) as type, count(r) as count
                 ORDER BY count DESC`,
                { projectId }
            );
            result.edgeTypes = edgeCounts;

            return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
        }

        case 'nm_path': {
            const from = String(args.from);
            const to = String(args.to);
            const detailed = await graph.getDetailedPath(from, to, projectId);
            if (detailed.length === 0) {
                return [{ type: 'text', text: JSON.stringify({ error: 'No path found', from, to }) }];
            }
            return [{ type: 'text', text: JSON.stringify({ from, to, paths: detailed }, null, 2) }];
        }

        case 'nm_changes': {
            const since = args.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const limit = Number(args.limit) || 30;
            const changes = await graph.getRecentChanges(since, limit, projectId);
            return [{ type: 'text', text: JSON.stringify(changes, null, 2) }];
        }

        case 'nm_projects': {
            const projects = await graph.listProjects();
            return [{ type: 'text', text: JSON.stringify(projects, null, 2) }];
        }

        default:
            throw new NomikError(`Unknown tool: ${name}`, 'INVALID_CONFIG', 'low', true);
    }
}
