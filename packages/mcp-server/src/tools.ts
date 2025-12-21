import type { GraphService } from '@genome/graph';
import { GenomeError } from '@genome/core';

/** Labels Neo4j reconnus par le scan */
const KNOWN_LABELS = ['File', 'Function', 'Class', 'Variable', 'Module', 'Route', 'DBTable', 'ExternalAPI', 'CronJob', 'Event', 'EnvVar'];

/** Recupere le projectId depuis l'env (injecte par Cursor/IDE) */
function getProjectId(): string | undefined {
    return process.env.GENOME_PROJECT_ID || undefined;
}

const TOOLS = {
    kb_search: {
        name: 'kb_search',
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
    kb_impact: {
        name: 'kb_impact',
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
    kb_dependency_trace: {
        name: 'kb_dependency_trace',
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
    kb_get_context: {
        name: 'kb_get_context',
        description: 'Get rich context for a file or function: what it contains, what it calls, what calls it, its imports.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Name of the file (path) or function/class name' },
            },
            required: ['name'],
        },
    },
    kb_graph_stats: {
        name: 'kb_graph_stats',
        description: 'Codebase health metrics: node counts, edge counts, dead code, god objects.',
        inputSchema: {
            type: 'object',
            properties: {
                includeDeadCode: { type: 'boolean', description: 'Include dead code analysis', default: false },
                includeGodObjects: { type: 'boolean', description: 'Include god object detection', default: false },
                godObjectThreshold: { type: 'number', description: 'Dependency count threshold for god objects', default: 8 },
            },
        },
    },
    kb_find_path: {
        name: 'kb_find_path',
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
    kb_recent_changes: {
        name: 'kb_recent_changes',
        description: 'Show nodes that changed recently. Use to answer "what changed today/this week?"',
        inputSchema: {
            type: 'object',
            properties: {
                since: { type: 'string', description: 'ISO date string (e.g. 2026-02-05T00:00:00Z). Default: 24h ago' },
                limit: { type: 'number', description: 'Max results', default: 30 },
            },
        },
    },
    kb_list_projects: {
        name: 'kb_list_projects',
        description: 'List all projects tracked in the GENOME knowledge graph.',
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
        case 'kb_search': {
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

        case 'kb_impact': {
            const symId = String(args.symbolId);
            const depth = Number(args.depth) || 3;
            const impacts = await graph.getImpact(symId, depth, projectId);
            return [{ type: 'text', text: JSON.stringify(impacts, null, 2) }];
        }

        case 'kb_dependency_trace': {
            const from = String(args.from);
            const to = String(args.to);
            const paths = await graph.getDependencyChain(from, to, projectId);
            return [{ type: 'text', text: JSON.stringify(paths, null, 2) }];
        }

        case 'kb_get_context': {
            const target = String(args.name);
            const projectFilter = projectId ? 'AND n.projectId = $projectId' : '';

            const results = await graph.executeQuery<any>(
                `MATCH (n)
                 WHERE (n.name = $target OR n.path CONTAINS $target) ${projectFilter}
                 WITH n LIMIT 1
                 OPTIONAL MATCH (n)-[:CONTAINS]->(child)
                 WITH n, collect(DISTINCT {name: COALESCE(child.name, child.path), type: labels(child)[0]}) as children
                 OPTIONAL MATCH (n)-[:CALLS]->(callee)
                 WITH n, children, collect(DISTINCT {name: callee.name, file: callee.filePath}) as callees
                 OPTIONAL MATCH (caller)-[:CALLS]->(n)
                 WITH n, children, callees, collect(DISTINCT {name: caller.name, file: caller.filePath}) as callers
                 OPTIONAL MATCH (n)-[:IMPORTS]->(imp)
                 WITH n, children, callees, callers, collect(DISTINCT {name: COALESCE(imp.name, imp.path)}) as imports
                 OPTIONAL MATCH (n)-[:EXTENDS]->(parent)
                 WITH n, children, callees, callers, imports, collect(DISTINCT {name: parent.name}) as extends_
                 RETURN n, children, callees, callers, imports, extends_`,
                { target, projectId }
            );

            if (results.length === 0) {
                return [{ type: 'text', text: JSON.stringify({ error: 'Node not found', query: target }) }];
            }

            const r = results[0];
            const nodeProps = r.n?.properties ?? r.n ?? {};
            const context = {
                node: { ...nodeProps, _labels: r.n?.labels ?? [] },
                contains: r.children,
                calls: r.callees,
                calledBy: r.callers,
                imports: r.imports,
                extends: r.extends_,
            };
            return [{ type: 'text', text: JSON.stringify(context, null, 2) }];
        }

        case 'kb_graph_stats': {
            const stats = await graph.getStats(projectId);
            const result: any = { ...stats };

            if (args.includeDeadCode) {
                result.deadCode = await graph.getDeadCode(projectId);
            }
            if (args.includeGodObjects) {
                const threshold = Number(args.godObjectThreshold) || 8;
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

        case 'kb_find_path': {
            const from = String(args.from);
            const to = String(args.to);
            const detailed = await graph.getDetailedPath(from, to, projectId);
            if (detailed.length === 0) {
                return [{ type: 'text', text: JSON.stringify({ error: 'No path found', from, to }) }];
            }
            return [{ type: 'text', text: JSON.stringify({ from, to, paths: detailed }, null, 2) }];
        }

        case 'kb_recent_changes': {
            const since = args.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const limit = Number(args.limit) || 30;
            const changes = await graph.getRecentChanges(since, limit, projectId);
            return [{ type: 'text', text: JSON.stringify(changes, null, 2) }];
        }

        case 'kb_list_projects': {
            const projects = await graph.listProjects();
            return [{ type: 'text', text: JSON.stringify(projects, null, 2) }];
        }

        default:
            throw new GenomeError(`Unknown tool: ${name}`, 'INVALID_CONFIG', 'low', true);
    }
}
