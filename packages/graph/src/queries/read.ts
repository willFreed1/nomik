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

/** Detection de dead code — fonctions sans aucun appel entrant
 *  Exclut : constructeurs, methodes de classes, composants React, barrel re-exports
 */
export async function findDeadCode(driver: GraphDriver, projectId?: string): Promise<Array<{ name: string; filePath: string }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:Function)
    WHERE NOT (f)<-[:CALLS]-()
      AND NOT (f)<-[:HANDLES]-()
      AND NOT (f)<-[:DEPENDS_ON {kind: 'import'}]-(:File)
      AND f.name <> 'constructor'
      ${projectFilter}
    WITH f
    WHERE NOT f.filePath ENDS WITH '.tsx'
      AND NOT f.filePath ENDS WITH '.jsx'
      AND NOT f.filePath ENDS WITH '.md'
      AND NOT f.filePath ENDS WITH '.mdx'
    OPTIONAL MATCH (parent:File)-[:CONTAINS]->(f)
    WITH f, parent
    WHERE parent IS NULL
       OR (NOT parent.path ENDS WITH 'index.ts'
           AND NOT parent.path ENDS WITH 'index.js')
    // Exclure les methodes de classes (appelees via obj.method(), pas directement)
    WITH f, parent
    OPTIONAL MATCH (parent)-[:CONTAINS]->(cls:Class)
    WHERE cls.methods CONTAINS ('"' + f.name + '"')
    WITH f, cls
    WHERE cls IS NULL
    RETURN f.name as name, f.filePath as filePath
    ORDER BY f.filePath
    `,
        { projectId },
    );
}

/** Detection de god objects — ne compte que le couplage cross-fichier inattendu
 *  Exclut : dispatch intra-fichier et appels vers des fichiers directement importes (DEPENDS_ON)
 */
export async function findGodObjects(
    driver: GraphDriver,
    threshold: number = 15,
    projectId?: string,
): Promise<Array<{ name: string; filePath: string; depCount: number }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:Function)-[:CALLS]->(target)
    WHERE true ${projectFilter}
    MATCH (ff:File)-[:CONTAINS]->(f)
    WHERE NOT (ff)-[:CONTAINS]->(target)
    MATCH (tf:File)-[:CONTAINS]->(target)
    WHERE NOT (ff)-[:DEPENDS_ON]->(tf)
    WITH f, count(DISTINCT target) as depCount
    WHERE depCount > $threshold
    RETURN f.name as name, f.filePath as filePath, depCount
    ORDER BY depCount DESC
    `,
        { threshold, projectId },
    );
}

/** Detection de god files — fichiers avec trop de fonctions (responsabilites)
 *  Indicateur de mauvaise modularisation : un fichier avec >N fonctions est suspect
 */
export async function findGodFiles(
    driver: GraphDriver,
    threshold: number = 10,
    projectId?: string,
): Promise<Array<{ filePath: string; functionCount: number; totalLines: number }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:File)-[:CONTAINS]->(fn:Function)
    WHERE true ${projectFilter}
    WITH f, count(fn) as functionCount
    WHERE functionCount > $threshold
    RETURN f.path as filePath,
           functionCount,
           COALESCE(f.size, 0) as totalLines
    ORDER BY functionCount DESC
    `,
        { threshold, projectId },
    );
}

/** Detection de code duplique — fonctions avec le meme bodyHash dans des fichiers differents
 *  Indicateur de copier-coller : fonctions identiques (apres normalisation whitespace)
 */
export async function findDuplicates(
    driver: GraphDriver,
    projectId?: string,
): Promise<Array<{ bodyHash: string; count: number; functions: Array<{ name: string; filePath: string }> }>> {
    const projectFilter = projectId ? 'AND f.projectId = $projectId' : '';
    return driver.runQuery(
        `
    MATCH (f:Function)
    WHERE f.bodyHash IS NOT NULL ${projectFilter}
    WITH f.bodyHash as bodyHash, collect({name: f.name, filePath: f.filePath}) as funcs, count(*) as cnt
    WHERE cnt > 1
    RETURN bodyHash, cnt as count, funcs as functions
    ORDER BY cnt DESC
    LIMIT 50
    `,
        { projectId },
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
