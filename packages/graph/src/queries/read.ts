import type { GraphDriver } from '../drivers/driver.interface.js';

export interface ImpactResult {
    name: string;
    type: string;
    filePath: string;
    depth: number;
    relationship: string;
}

/** Analyse d'impact scope par projet — retourne la profondeur et le type de relation reels */
export async function impactAnalysis(
    driver: GraphDriver,
    symbolName: string,
    maxDepth: number = 5,
    projectId?: string,
): Promise<ImpactResult[]> {
    const projectFilter = projectId ? 'AND target.projectId = $projectId' : '';
    const nodeFilter = projectId ? 'AND node.projectId = $projectId' : '';
    const results = await driver.runQuery<{
        name: string;
        type: string;
        filePath: string;
        depth: number;
        relType: string;
    }>(
        `
    MATCH (target)
    WHERE (target.name = $name OR target.id = $name) ${projectFilter}
    WITH target LIMIT 1
    CALL apoc.path.expandConfig(target, {
      relationshipFilter: "<CALLS|<HANDLES|<TRIGGERS|<DEPENDS_ON|<LISTENS_TO|DEPENDS_ON",
      maxLevel: $maxDepth,
      uniqueness: "NODE_GLOBAL"
    }) YIELD path
    WITH last(nodes(path)) as node,
         length(path) as depth,
         last(relationships(path)) as rel
    WHERE node <> target ${nodeFilter}
    RETURN DISTINCT COALESCE(node.name, node.path) as name,
           labels(node)[0] as type,
           COALESCE(node.filePath, node.path) as filePath,
           depth,
           type(rel) as relType
    ORDER BY depth ASC, name ASC
    `,
        { name: symbolName, maxDepth, projectId },
    );

    return results.map((r) => ({
        name: r.name,
        type: r.type,
        filePath: r.filePath,
        depth: r.depth,
        relationship: r.relType,
    }));
}

/** Return all functions, classes, variables, and routes contained in a file, as known by the graph */
export interface FileSymbol {
    name: string;
    type: 'Function' | 'Class' | 'Variable' | 'Route';
    id: string;
    isExported: boolean;
    startLine: number;
    endLine: number;
}

export async function getFileSymbols(
    driver: GraphDriver,
    filePath: string,
    projectId?: string,
): Promise<FileSymbol[]> {
    const projectFilter = projectId ? 'AND child.projectId = $projectId' : '';
    return driver.runQuery<FileSymbol>(
        `
    MATCH (f:File)-[:CONTAINS]->(child)
    WHERE f.path = $filePath
      AND (child:Function OR child:Class OR child:Variable OR child:Route)
      ${projectFilter}
    RETURN COALESCE(child.name, child.handlerName, child.path) as name,
           labels(child)[0] as type,
           child.id as id,
           COALESCE(child.isExported, false) as isExported,
           COALESCE(child.startLine, child.line, 0) as startLine,
           COALESCE(child.endLine, child.line, 0) as endLine
    ORDER BY startLine ASC
    `,
        { filePath, projectId },
    );
}

/** Chemin le plus court entre deux entites avec detail des noeuds et relations */
export interface PathStep {
    nodeName: string;
    nodeType: string;
    filePath: string;
}

export interface DetailedPath {
    steps: PathStep[];
    relationships: string[];
    length: number;
}

export async function findDetailedPath(
    driver: GraphDriver,
    fromName: string,
    toName: string,
    projectId?: string,
): Promise<DetailedPath[]> {
    const projectFilterA = projectId ? 'AND a.projectId = $projectId' : '';
    const projectFilterB = projectId ? 'AND b.projectId = $projectId' : '';
    const pathProjectFilter = projectId
        ? 'AND all(n IN nodes(path) WHERE n.projectId = $projectId)'
        : '';
    const fromLooksLikePath = /[\\/]|[.][a-zA-Z0-9]+$/.test(fromName);
    const toLooksLikePath = /[\\/]|[.][a-zA-Z0-9]+$/.test(toName);
    const relFilter = fromLooksLikePath
        ? 'CONTAINS>|CALLS>|HANDLES>|DEPENDS_ON>|IMPORTS>|<CONTAINS'
        : 'CALLS>|HANDLES>|DEPENDS_ON>|IMPORTS>|<CONTAINS';
    const results = await driver.runQuery<{ names: string[]; types: string[]; files: string[]; rels: string[] }>(
        `
    MATCH (a)
    WHERE (a.name = $from OR a.path = $from OR a.path CONTAINS $from) ${projectFilterA}
    WITH a,
         CASE
           WHEN a.path = $from THEN 4
           WHEN a.name = $from THEN 3
           WHEN a.path CONTAINS $from THEN 2
           ELSE 0
         END AS rankA,
         CASE
           WHEN $fromLooksLikePath AND a:File THEN 3
           WHEN a:Function THEN 2
           WHEN a:Class THEN 1
           WHEN a:Variable THEN 0
           ELSE -1
         END AS typeRankA
    ORDER BY rankA DESC, typeRankA DESC, size(COALESCE(a.filePath, a.path, a.name, '')) ASC
    LIMIT 1
    MATCH (b)
    WHERE (b.name = $to OR b.path = $to OR b.path CONTAINS $to) ${projectFilterB}
    WITH a, b,
         CASE
           WHEN b.path = $to THEN 4
           WHEN b.name = $to THEN 3
           WHEN b.path CONTAINS $to THEN 2
           ELSE 0
         END AS rankB,
         CASE
           WHEN $toLooksLikePath AND b:File THEN 3
           WHEN b:Function THEN 2
           WHEN b:Class THEN 1
           WHEN b:Variable THEN 0
           ELSE -1
         END AS typeRankB
    ORDER BY rankB DESC, typeRankB DESC, size(COALESCE(b.filePath, b.path, b.name, '')) ASC
    LIMIT 1
    CALL apoc.path.expandConfig(a, {
      relationshipFilter: $relFilter,
      maxLevel: 10,
      bfs: true,
      uniqueness: "NODE_PATH",
      terminatorNodes: [b]
    }) YIELD path
    WITH path, b
    WHERE last(nodes(path)) = b
      ${pathProjectFilter}
    WITH path, length(path) as pathLen
    RETURN [n IN nodes(path) | COALESCE(n.name, n.path)] as names,
           [n IN nodes(path) | labels(n)[0]] as types,
           [n IN nodes(path) | COALESCE(n.filePath, n.path, '')] as files,
           [r IN relationships(path) | type(r)] as rels
    ORDER BY pathLen ASC
    LIMIT 1
    `,
        { from: fromName, to: toName, projectId, fromLooksLikePath, toLooksLikePath, relFilter },
    );
    return results.map((r) => ({
        steps: r.names.map((name, i) => ({
            nodeName: name,
            nodeType: r.types[i] ?? 'Unknown',
            filePath: r.files[i] ?? '',
        })),
        relationships: r.rels,
        length: r.rels.length,
    }));
}

export async function findDependencyChain(
    driver: GraphDriver,
    fromName: string,
    toName: string,
    projectId?: string,
): Promise<string[][]> {
    const projectFilterA = projectId ? 'AND a.projectId = $projectId' : '';
    const projectFilterB = projectId ? 'AND b.projectId = $projectId' : '';
    const pathProjectFilter = projectId
        ? 'AND all(n IN nodes(path) WHERE n.projectId = $projectId)'
        : '';
    const fromLooksLikePath = /[\\/]|[.][a-zA-Z0-9]+$/.test(fromName);
    const toLooksLikePath = /[\\/]|[.][a-zA-Z0-9]+$/.test(toName);
    const relFilter = fromLooksLikePath
        ? 'CONTAINS>|CALLS>|HANDLES>|DEPENDS_ON>|IMPORTS>|<CONTAINS'
        : 'CALLS>|HANDLES>|DEPENDS_ON>|IMPORTS>|<CONTAINS';
    const results = await driver.runQuery<{ chain: string[] }>(
        `
    MATCH (a)
    WHERE (a.name = $from OR a.path = $from OR a.path CONTAINS $from) ${projectFilterA}
    WITH a,
         CASE
           WHEN a.path = $from THEN 4
           WHEN a.name = $from THEN 3
           WHEN a.path CONTAINS $from THEN 2
           ELSE 0
         END AS rankA,
         CASE
           WHEN $fromLooksLikePath AND a:File THEN 3
           WHEN a:Function THEN 2
           WHEN a:Class THEN 1
           WHEN a:Variable THEN 0
           ELSE -1
         END AS typeRankA
    ORDER BY rankA DESC, typeRankA DESC, size(COALESCE(a.filePath, a.path, a.name, '')) ASC
    LIMIT 1
    MATCH (b)
    WHERE (b.name = $to OR b.path = $to OR b.path CONTAINS $to) ${projectFilterB}
    WITH a, b,
         CASE
           WHEN b.path = $to THEN 4
           WHEN b.name = $to THEN 3
           WHEN b.path CONTAINS $to THEN 2
           ELSE 0
         END AS rankB,
         CASE
           WHEN $toLooksLikePath AND b:File THEN 3
           WHEN b:Function THEN 2
           WHEN b:Class THEN 1
           WHEN b:Variable THEN 0
           ELSE -1
         END AS typeRankB
    ORDER BY rankB DESC, typeRankB DESC, size(COALESCE(b.filePath, b.path, b.name, '')) ASC
    LIMIT 1
    CALL apoc.path.expandConfig(a, {
      relationshipFilter: $relFilter,
      maxLevel: 10,
      bfs: true,
      uniqueness: "NODE_PATH",
      terminatorNodes: [b]
    }) YIELD path
    WITH path, b
    WHERE last(nodes(path)) = b
      ${pathProjectFilter}
    WITH path, length(path) as pathLen
    RETURN [n IN nodes(path) | COALESCE(n.name, n.path)] as chain
    ORDER BY pathLen ASC
    LIMIT 1
    `,
        { from: fromName, to: toName, projectId, fromLooksLikePath, toLooksLikePath, relFilter },
    );
    return results.map((r) => r.chain);
}

// Health queries split to read-health.ts
export { findDeadCode, findGodObjects, findGodFiles, findDuplicates } from './read-health.js';

export interface DBImpactSource {
    sourceName: string;
    sourceType: string;
    filePath: string;
    operation?: string;
}

export interface DBImpactResult {
    table: string;
    column?: string;
    readers: DBImpactSource[];
    writers: DBImpactSource[];
    columns: string[];
}

/** Impact DB: qui lit/ecrit une table/colonne, scope par projet */
export async function findDBImpact(
    driver: GraphDriver,
    table: string,
    column?: string,
    limit: number = 100,
    projectId?: string,
): Promise<DBImpactResult> {
    const tableFilter = projectId ? 'AND t.projectId = $projectId' : '';
    const sourceFilter = projectId ? 'AND src.projectId = $projectId' : '';
    const tableRows = await driver.runQuery<{ tableName: string; columns: string[] }>(
        `
    MATCH (t:DBTable)
    WHERE toLower(t.name) = toLower($table) ${tableFilter}
    OPTIONAL MATCH (t)-[:CONTAINS]->(c:DBColumn)
    WITH t, collect(DISTINCT c.name) as cols
    RETURN t.name as tableName, [x IN cols WHERE x IS NOT NULL] as columns
    LIMIT 1
    `,
        { table, projectId },
    );

    if (tableRows.length === 0) {
        return { table, column, readers: [], writers: [], columns: [] };
    }

    const targetMatch = column
        ? `
      MATCH (t:DBTable)-[:CONTAINS]->(target:DBColumn)
      WHERE toLower(t.name) = toLower($table)
        AND toLower(target.name) = toLower($column)
        ${tableFilter}
    `
        : `
      MATCH (t:DBTable)
      WHERE toLower(t.name) = toLower($table)
        ${tableFilter}
      WITH t AS target
    `;

    const readers = await driver.runQuery<DBImpactSource>(
        `
    ${targetMatch}
    MATCH (src)-[:READS_FROM]->(target)
    WHERE true ${sourceFilter}
    RETURN DISTINCT COALESCE(src.name, src.path) as sourceName,
                    labels(src)[0] as sourceType,
                    COALESCE(src.filePath, src.path, '') as filePath,
                    NULL as operation
    ORDER BY sourceName ASC
    LIMIT toInteger($limit)
    `,
        { table, column: column ?? null, limit, projectId },
    );

    const writers = await driver.runQuery<DBImpactSource>(
        `
    ${targetMatch}
    MATCH (src)-[r:WRITES_TO]->(target)
    WHERE true ${sourceFilter}
    RETURN DISTINCT COALESCE(src.name, src.path) as sourceName,
                    labels(src)[0] as sourceType,
                    COALESCE(src.filePath, src.path, '') as filePath,
                    r.operation as operation
    ORDER BY sourceName ASC
    LIMIT toInteger($limit)
    `,
        { table, column: column ?? null, limit, projectId },
    );

    const resolvedTable = tableRows[0]?.tableName ?? table;
    const columns = (tableRows[0]?.columns ?? []).filter(Boolean).sort();
    return { table: resolvedTable, column, readers, writers, columns };
}

export async function graphStats(driver: GraphDriver, projectId?: string): Promise<{
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    functionCount: number;
    classCount: number;
    routeCount: number;
}> {
    const pf = projectId ? '{projectId: $projectId}' : '';
    const [result] = await driver.runQuery<{
        nodeCount: number;
        edgeCount: number;
        fileCount: number;
        functionCount: number;
        classCount: number;
        routeCount: number;
    }>(
        `
    MATCH (n ${pf})
    WHERE NOT n:Project AND NOT n:ScanMeta
    WITH count(n) as nodeCount
    OPTIONAL MATCH ()-[r ${projectId ? '{projectId: $projectId}' : ''}]->()
    WITH nodeCount, count(r) as edgeCount
    OPTIONAL MATCH (f:File ${pf}) WITH nodeCount, edgeCount, count(f) as fileCount
    OPTIONAL MATCH (fn:Function ${pf}) WITH nodeCount, edgeCount, fileCount, count(fn) as functionCount
    OPTIONAL MATCH (c:Class ${pf}) WITH nodeCount, edgeCount, fileCount, functionCount, count(c) as classCount
    OPTIONAL MATCH (rt:Route ${pf}) WITH nodeCount, edgeCount, fileCount, functionCount, classCount, count(rt) as routeCount
    RETURN nodeCount, edgeCount, fileCount, functionCount, classCount, routeCount
    `,
        { projectId },
    );
    return result ?? { nodeCount: 0, edgeCount: 0, fileCount: 0, functionCount: 0, classCount: 0, routeCount: 0 };
}

/** Noeuds modifies depuis une date donnee, scope par projet */
export async function recentChanges(
    driver: GraphDriver,
    since: string,
    limit: number = 50,
    projectId?: string,
): Promise<Array<{ name: string; type: string; filePath: string; updatedAt: string; createdAt: string | null }>> {
    const projectFilter = projectId ? 'AND n.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (n)
    WHERE n.updatedAt >= datetime($since) ${projectFilter}
      AND NOT n:Project AND NOT n:ScanMeta
    RETURN COALESCE(n.name, n.path) as name,
           labels(n)[0] as type,
           COALESCE(n.filePath, n.path) as filePath,
           toString(n.updatedAt) as updatedAt,
           toString(n.createdAt) as createdAt
    ORDER BY n.updatedAt DESC
    LIMIT toInteger($limit)
    `,
        { since, limit, projectId },
    );
}

// Architecture diff split to read-diff.ts
export { architectureDiff } from './read-diff.js';
export type { DiffResult } from './read-diff.js';

// Flow detection split to read-flows.ts
export { detectFlows } from './read-flows.js';
export type { FlowStep, ExecutionFlow, FlowResult } from './read-flows.js';

// Community detection split to read-community.ts
export { detectCommunities } from './read-community.js';
export type { Community, CommunityResult } from './read-community.js';

// Onboard summary split to read-onboard.ts
export { getOnboardSummary } from './read-onboard.js';
export type { OnboardSummary } from './read-onboard.js';

// Explain + service-links queries split to read-explain.ts
export { findServiceLinks, explainSymbol } from './read-explain.js';
export type { ServiceLink, ExplainResult } from './read-explain.js';
