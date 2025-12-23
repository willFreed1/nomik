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
      relationshipFilter: "<CALLS|<HANDLES|<TRIGGERS|<DEPENDS_ON|<LISTENS_TO",
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
    const projectFilter = projectId ? 'AND a.projectId = $projectId AND b.projectId = $projectId' : '';
    const results = await driver.runQuery<{ names: string[]; types: string[]; files: string[]; rels: string[] }>(
        `
    MATCH (a), (b)
    WHERE (a.name = $from OR a.path CONTAINS $from) AND (b.name = $to OR b.path CONTAINS $to)
    ${projectFilter}
    WITH a, b LIMIT 1
    MATCH path = shortestPath((a)-[*..10]-(b))
    RETURN [n IN nodes(path) | COALESCE(n.name, n.path)] as names,
           [n IN nodes(path) | labels(n)[0]] as types,
           [n IN nodes(path) | COALESCE(n.filePath, n.path, '')] as files,
           [r IN relationships(path) | type(r)] as rels
    `,
        { from: fromName, to: toName, projectId },
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

/** Detection de dead code — exclut les faux positifs :
 *  - Fonctions appelees via CALLS ou HANDLES
 *  - Fonctions dont le fichier parent est importe (DEPENDS_ON entrant = usage cross-package)
 *  - Fonctions contenues dans un fichier index.ts/index.js (re-exports de package)
 */
export async function findDeadCode(driver: GraphDriver, projectId?: string): Promise<Array<{ name: string; filePath: string }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:Function {isExported: true})
    WHERE NOT (f)<-[:CALLS]-()
      AND NOT (f)<-[:HANDLES]-()
      ${projectFilter}
    WITH f
    OPTIONAL MATCH (parent:File)-[:CONTAINS]->(f)
    WITH f, parent
    WHERE parent IS NOT NULL
      AND NOT (parent)<-[:DEPENDS_ON]-()
      AND NOT parent.path ENDS WITH 'index.ts'
      AND NOT parent.path ENDS WITH 'index.js'
      AND NOT parent.path ENDS WITH 'index.tsx'
    RETURN f.name as name, f.filePath as filePath
    ORDER BY f.filePath
    `,
        { projectId },
    );
}

/** Detection de god objects — compte uniquement les CALLS sortants distincts
 *  (DEPENDS_ON est file-level, pas pertinent pour le couplage fonctionnel)
 */
export async function findGodObjects(
    driver: GraphDriver,
    threshold: number = 10,
    projectId?: string,
): Promise<Array<{ name: string; filePath: string; depCount: number }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:Function)-[:CALLS]->(target)
    WHERE true ${projectFilter}
    WITH f, count(DISTINCT target) as depCount
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
