import type { GraphDriver } from '../drivers/driver.interface.js';

export interface ImpactResult {
    name: string;
    type: string;
    filePath: string;
    depth: number;
    relationship: string;
}

/** Analyse d'impact en amont : trouve tous les dependants d'un symbole */
export async function impactAnalysis(
    driver: GraphDriver,
    symbolName: string,
    maxDepth: number = 5,
): Promise<ImpactResult[]> {
    const results = await driver.runQuery<{
        name: string;
        type: string;
        filePath: string;
        depth: number;
        relType: string;
    }>(
        `
    MATCH (target)
    WHERE target.name = $name OR target.id = $name
    WITH target LIMIT 1
    CALL apoc.path.subgraphNodes(target, {
      relationshipFilter: "<CALLS|<HANDLES|<TRIGGERS|<DEPENDS_ON|<LISTENS_TO",
      maxLevel: $maxDepth
    }) YIELD node
    WHERE node <> target
    RETURN COALESCE(node.name, node.path) as name,
           labels(node)[0] as type,
           COALESCE(node.filePath, node.path) as filePath,
           1 as depth,
           "DEPENDS_ON" as relType
    `,
        { name: symbolName, maxDepth },
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
): Promise<string[][]> {
    const results = await driver.runQuery<{ path: string[] }>(
        `
    MATCH (a {name: $from}), (b {name: $to}),
    path = shortestPath((a)-[*..10]-(b))
    RETURN [n IN nodes(path) | n.name] as path
    `,
        { from: fromName, to: toName },
    );
    return results.map((r) => r.path);
}

export async function findDeadCode(driver: GraphDriver): Promise<Array<{ name: string; filePath: string }>> {
    return driver.runQuery(
        `
    MATCH (f:Function {isExported: true})
    WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-()
    RETURN f.name as name, f.filePath as filePath
    ORDER BY f.filePath
    `,
    );
}

export async function findGodObjects(
    driver: GraphDriver,
    threshold: number = 10,
): Promise<Array<{ name: string; filePath: string; depCount: number }>> {
    return driver.runQuery(
        `
    MATCH (f:Function)-[r:CALLS|DEPENDS_ON]->()
    WITH f, count(r) as depCount
    WHERE depCount > $threshold
    RETURN f.name as name, f.filePath as filePath, depCount
    ORDER BY depCount DESC
    `,
        { threshold },
    );
}

export async function graphStats(driver: GraphDriver): Promise<{
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    functionCount: number;
    classCount: number;
    routeCount: number;
}> {
    const [result] = await driver.runQuery<{
        nodeCount: number;
        edgeCount: number;
        fileCount: number;
        functionCount: number;
        classCount: number;
        routeCount: number;
    }>(
        `
    MATCH (n)
    WITH count(n) as nodeCount
    OPTIONAL MATCH ()-[r]->()
    WITH nodeCount, count(r) as edgeCount
    OPTIONAL MATCH (f:File) WITH nodeCount, edgeCount, count(f) as fileCount
    OPTIONAL MATCH (fn:Function) WITH nodeCount, edgeCount, fileCount, count(fn) as functionCount
    OPTIONAL MATCH (c:Class) WITH nodeCount, edgeCount, fileCount, functionCount, count(c) as classCount
    OPTIONAL MATCH (rt:Route) WITH nodeCount, edgeCount, fileCount, functionCount, classCount, count(rt) as routeCount
    RETURN nodeCount, edgeCount, fileCount, functionCount, classCount, routeCount
    `,
    );
    return result ?? { nodeCount: 0, edgeCount: 0, fileCount: 0, functionCount: 0, classCount: 0, routeCount: 0 };
}
