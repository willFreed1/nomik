import type { GraphDriver } from '../drivers/driver.interface.js';

export interface ImpactResult {
    name: string;
    type: string;
    filePath: string;
    depth: number;
    relationship: string;
}

/** Analyse d'impact scope par projet */
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
    CALL apoc.path.subgraphNodes(target, {
      relationshipFilter: "<CALLS|<HANDLES|<TRIGGERS|<DEPENDS_ON|<LISTENS_TO",
      maxLevel: $maxDepth
    }) YIELD node
    WHERE node <> target ${nodeFilter}
    RETURN COALESCE(node.name, node.path) as name,
           labels(node)[0] as type,
           COALESCE(node.filePath, node.path) as filePath,
           1 as depth,
           "DEPENDS_ON" as relType
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

export async function findDependencyChain(
    driver: GraphDriver,
    fromName: string,
    toName: string,
    projectId?: string,
): Promise<string[][]> {
    const projectFilter = projectId ? 'AND a.projectId = $projectId AND b.projectId = $projectId' : '';
    const results = await driver.runQuery<{ path: string[] }>(
        `
    MATCH (a {name: $from}), (b {name: $to})
    WHERE true ${projectFilter}
    WITH a, b LIMIT 1
    MATCH path = shortestPath((a)-[*..10]-(b))
    RETURN [n IN nodes(path) | n.name] as path
    `,
        { from: fromName, to: toName, projectId },
    );
    return results.map((r) => r.path);
}

export async function findDeadCode(driver: GraphDriver, projectId?: string): Promise<Array<{ name: string; filePath: string }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:Function {isExported: true})
    WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-() ${projectFilter}
    RETURN f.name as name, f.filePath as filePath
    ORDER BY f.filePath
    `,
        { projectId },
    );
}

export async function findGodObjects(
    driver: GraphDriver,
    threshold: number = 10,
    projectId?: string,
): Promise<Array<{ name: string; filePath: string; depCount: number }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:Function)-[r:CALLS|DEPENDS_ON]->()
    WHERE true ${projectFilter}
    WITH f, count(r) as depCount
    WHERE depCount > $threshold
    RETURN f.name as name, f.filePath as filePath, depCount
    ORDER BY depCount DESC
    `,
        { threshold, projectId },
    );
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
