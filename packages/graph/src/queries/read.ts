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
      AND NOT (f)<-[:DEPENDS_ON]-(:File)
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
    WITH f, parent, cls
    WHERE cls IS NULL
    // Exclure les fonctions re-exportees via barrel (index.ts/js imports parent file)
    OPTIONAL MATCH (barrel:File)-[:DEPENDS_ON|IMPORTS]->(parent)
    WHERE barrel IS NOT NULL
      AND (barrel.path ENDS WITH 'index.ts' OR barrel.path ENDS WITH 'index.js')
    WITH f, barrel
    WHERE barrel IS NULL
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
           COALESCE(f.lineCount, 0) as totalLines
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
      AND (f.endLine - f.startLine) >= 3
    WITH f.bodyHash as bodyHash, collect({name: f.name, filePath: f.filePath}) as funcs, count(*) as cnt
    WHERE cnt > 1
    RETURN bodyHash, cnt as count, funcs as functions
    ORDER BY cnt DESC
    LIMIT 50
    `,
        { projectId },
    );
}

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

/** Cross-service correlation: find producer↔consumer pairs sharing the same topic/queue */
export interface ServiceLink {
    topicName: string;
    broker: string;
    producers: Array<{ name: string; filePath: string }>;
    consumers: Array<{ name: string; filePath: string }>;
}

export async function findServiceLinks(
    driver: GraphDriver,
    projectId?: string,
): Promise<ServiceLink[]> {
    const pf = projectId ? 'AND t.projectId = $projectId' : '';

    // Find topics that have both producers and consumers
    const results = await driver.runQuery<{
        topicName: string; broker: string;
        producers: Array<{ name: string; filePath: string }>;
        consumers: Array<{ name: string; filePath: string }>;
    }>(
        `MATCH (p)-[:PRODUCES_MESSAGE]->(pt:Topic)
         WHERE pt.topicKind = 'producer' ${pf.replace(/\bt\./g, 'pt.')}
         WITH pt.name as topicName, COALESCE(pt.broker, 'unknown') as broker,
              collect(DISTINCT {name: COALESCE(p.name, p.path), filePath: COALESCE(p.filePath, p.path, '')}) as producers
         MATCH (c)-[:CONSUMES_MESSAGE]->(ct:Topic)
         WHERE ct.name = topicName AND ct.topicKind = 'consumer' ${pf.replace(/\bt\./g, 'ct.')}
         WITH topicName, broker, producers,
              collect(DISTINCT {name: COALESCE(c.name, c.path), filePath: COALESCE(c.filePath, c.path, '')}) as consumers
         WHERE size(producers) > 0 AND size(consumers) > 0
         RETURN topicName, broker, producers, consumers
         ORDER BY topicName`,
        { projectId },
    );

    // Also check queue jobs (PRODUCES_JOB / CONSUMES_JOB)
    const queueResults = await driver.runQuery<{
        topicName: string; broker: string;
        producers: Array<{ name: string; filePath: string }>;
        consumers: Array<{ name: string; filePath: string }>;
    }>(
        `MATCH (p)-[:PRODUCES_JOB]->(pq:QueueJob)
         ${projectId ? 'WHERE pq.projectId = $projectId' : ''}
         WITH pq.queueName as topicName,
              collect(DISTINCT {name: COALESCE(p.name, p.path), filePath: COALESCE(p.filePath, p.path, '')}) as producers
         MATCH (c)-[:CONSUMES_JOB]->(cq:QueueJob)
         WHERE cq.queueName = topicName ${projectId ? 'AND cq.projectId = $projectId' : ''}
         WITH topicName, producers,
              collect(DISTINCT {name: COALESCE(c.name, c.path), filePath: COALESCE(c.filePath, c.path, '')}) as consumers
         WHERE size(producers) > 0 AND size(consumers) > 0
         RETURN topicName, 'queue' as broker, producers, consumers
         ORDER BY topicName`,
        { projectId },
    );

    const links: ServiceLink[] = [];

    for (const r of [...results, ...queueResults]) {
        links.push({
            topicName: r.topicName,
            broker: r.broker,
            producers: r.producers,
            consumers: r.consumers,
        });
    }

    return links;
}

/** Full context explanation of a symbol: properties, callers, callees, edges */
export interface ExplainResult {
    symbol: {
        name: string;
        type: string;
        filePath: string;
        startLine: number;
        endLine: number;
        isExported: boolean;
        bodyHash?: string;
    } | null;
    incomingEdges: Array<{ sourceName: string; sourceType: string; edgeType: string; filePath: string }>;
    outgoingEdges: Array<{ targetName: string; targetType: string; edgeType: string; filePath: string }>;
    containedIn: string | null;
    siblingCount: number;
}

export async function explainSymbol(
    driver: GraphDriver,
    symbolName: string,
    projectId?: string,
): Promise<ExplainResult> {
    const pf = projectId ? 'AND n.projectId = $projectId' : '';

    // 1. Find the symbol
    const symbols = await driver.runQuery<{
        name: string; type: string; filePath: string;
        startLine: number; endLine: number; isExported: boolean; bodyHash: string | null;
    }>(
        `MATCH (n)
         WHERE (n.name = $name OR n.id = $name) ${pf}
           AND NOT n:File AND NOT n:Project AND NOT n:ScanMeta
         RETURN COALESCE(n.name, n.path) as name,
                labels(n)[0] as type,
                COALESCE(n.filePath, n.path, '') as filePath,
                COALESCE(n.startLine, 0) as startLine,
                COALESCE(n.endLine, 0) as endLine,
                COALESCE(n.isExported, false) as isExported,
                n.bodyHash as bodyHash
         LIMIT 1`,
        { name: symbolName, projectId },
    );

    const symbol = symbols[0] ?? null;
    if (!symbol) {
        return { symbol: null, incomingEdges: [], outgoingEdges: [], containedIn: null, siblingCount: 0 };
    }

    // 2. Incoming edges (who references this symbol)
    const incoming = await driver.runQuery<{
        sourceName: string; sourceType: string; edgeType: string; filePath: string;
    }>(
        `MATCH (src)-[r]->(target)
         WHERE (target.name = $name OR target.id = $name) ${pf.replace(/\bn\./g, 'target.')}
           AND NOT target:File AND NOT target:Project
         RETURN COALESCE(src.name, src.path) as sourceName,
                labels(src)[0] as sourceType,
                type(r) as edgeType,
                COALESCE(src.filePath, src.path, '') as filePath
         ORDER BY edgeType, sourceName
         LIMIT 50`,
        { name: symbolName, projectId },
    );

    // 3. Outgoing edges (what this symbol references)
    const outgoing = await driver.runQuery<{
        targetName: string; targetType: string; edgeType: string; filePath: string;
    }>(
        `MATCH (src)-[r]->(target)
         WHERE (src.name = $name OR src.id = $name) ${pf.replace(/\bn\./g, 'src.')}
           AND NOT src:File AND NOT src:Project
         RETURN COALESCE(target.name, target.path) as targetName,
                labels(target)[0] as targetType,
                type(r) as edgeType,
                COALESCE(target.filePath, target.path, '') as filePath
         ORDER BY edgeType, targetName
         LIMIT 50`,
        { name: symbolName, projectId },
    );

    // 4. Containing file + sibling count
    const containerInfo = await driver.runQuery<{ filePath: string; siblingCount: number }>(
        `MATCH (f:File)-[:CONTAINS]->(n)
         WHERE (n.name = $name OR n.id = $name) ${pf}
         WITH f LIMIT 1
         OPTIONAL MATCH (f)-[:CONTAINS]->(sibling)
         RETURN f.path as filePath, count(sibling) as siblingCount`,
        { name: symbolName, projectId },
    );

    return {
        symbol: symbol ? { ...symbol, bodyHash: symbol.bodyHash ?? undefined } : null,
        incomingEdges: incoming,
        outgoingEdges: outgoing,
        containedIn: containerInfo[0]?.filePath ?? null,
        siblingCount: containerInfo[0]?.siblingCount ?? 0,
    };
}
