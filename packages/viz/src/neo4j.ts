import neo4j from 'neo4j-driver';

export const driver = neo4j.driver(
    import.meta.env.VITE_NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
        import.meta.env.VITE_NEO4J_USER || 'neo4j',
        import.meta.env.VITE_NEO4J_PASSWORD || 'nomik_local'
    )
);

/** View mode for progressive loading */
export type ViewMode = 'overview' | 'full';

/** Fetch overview: Files + DEPENDS_ON only (fast for any project size) */
export async function fetchGraphOverview(projectId?: string) {
    const session = driver.session();
    try {
        console.log('Fetching overview...', projectId ? `(project: ${projectId})` : '(all)');
        const pf = projectId ? 'WHERE f.projectId = $projectId' : '';
        const pf2 = projectId ? 'AND f.projectId = $projectId AND g.projectId = $projectId' : '';
        const params = { projectId: projectId ?? null };

        // Files with function/class counts for sizing
        const fileResult = await session.run(`
            MATCH (f:File) ${pf}
            OPTIONAL MATCH (f)-[:CONTAINS]->(fn:Function)
            OPTIONAL MATCH (f)-[:CONTAINS]->(cls:Class)
            RETURN f, count(DISTINCT fn) as funcCount, count(DISTINCT cls) as classCount
        `, params);

        // DEPENDS_ON edges between files
        const depResult = await session.run(`
            MATCH (f:File)-[r:DEPENDS_ON]->(g:File)
            WHERE NOT f:ScanMeta AND NOT g:ScanMeta ${pf2}
            RETURN f.id as sourceId, g.id as targetId, r
        `, params);

        const nodes = new Map<string, any>();
        const edges: any[] = [];
        const sanitize = (id: string) => id.replace(/:/g, '_');

        fileResult.records.forEach(record => {
            const f = record.get('f');
            const funcCount = record.get('funcCount')?.toNumber?.() ?? record.get('funcCount') ?? 0;
            const classCount = record.get('classCount')?.toNumber?.() ?? record.get('classCount') ?? 0;
            const nId = sanitize(f.elementId);
            const parts = (f.properties.path ?? '').split(/[/\\]/);
            const name = parts[parts.length - 1] || f.properties.name || 'File';
            nodes.set(nId, {
                data: {
                    ...f.properties,
                    id: nId,
                    label: 'File',
                    name,
                    funcCount,
                    classCount,
                    childCount: funcCount + classCount,
                }
            });
        });

        // Build a lookup from property id to elementId
        const propIdToElementId = new Map<string, string>();
        fileResult.records.forEach(record => {
            const f = record.get('f');
            propIdToElementId.set(f.properties.id, sanitize(f.elementId));
        });

        depResult.records.forEach(record => {
            const r = record.get('r');
            const sourceId = propIdToElementId.get(record.get('sourceId'));
            const targetId = propIdToElementId.get(record.get('targetId'));
            if (sourceId && targetId && nodes.has(sourceId) && nodes.has(targetId)) {
                edges.push({
                    data: {
                        id: sanitize(r.elementId),
                        source: sourceId,
                        target: targetId,
                        label: 'DEPENDS_ON',
                    }
                });
            }
        });

        console.log('Overview loaded:', { nodes: nodes.size, edges: edges.length });
        return { nodes: Array.from(nodes.values()), edges };
    } finally {
        await session.close();
    }
}

/** Fetch children of a file node (Functions + Classes + their CALLS edges) */
export async function fetchNodeNeighborhood(nodePropertyId: string, projectId?: string) {
    const session = driver.session();
    try {
        const params = { nodeId: nodePropertyId, projectId: projectId ?? null };
        const pf = projectId ? 'AND child.projectId = $projectId' : '';

        const result = await session.run(`
            MATCH (f:File {id: $nodeId})-[c:CONTAINS]->(child)
            WHERE (child:Function OR child:Class) ${pf}
            OPTIONAL MATCH (child)-[r:CALLS]->(target)
            WHERE target.projectId = $projectId OR $projectId IS NULL
            RETURN child, c, r, target
        `, params);

        const nodes = new Map<string, any>();
        const edges: any[] = [];
        const sanitize = (id: string) => id.replace(/:/g, '_');

        result.records.forEach(record => {
            const child = record.get('child');
            const c = record.get('c');
            const r = record.get('r');
            const target = record.get('target');

            const childId = sanitize(child.elementId);
            if (!nodes.has(childId)) {
                nodes.set(childId, {
                    data: {
                        ...child.properties,
                        id: childId,
                        label: child.labels[0],
                        name: child.properties.name || child.labels[0],
                    }
                });
            }

            edges.push({
                data: {
                    id: sanitize(c.elementId),
                    source: sanitize(c.startNodeElementId),
                    target: childId,
                    label: 'CONTAINS',
                }
            });

            if (r && target) {
                const targetId = sanitize(target.elementId);
                if (!nodes.has(targetId)) {
                    nodes.set(targetId, {
                        data: {
                            ...target.properties,
                            id: targetId,
                            label: target.labels[0],
                            name: target.properties.name || target.labels[0],
                        }
                    });
                }
                edges.push({
                    data: {
                        id: sanitize(r.elementId),
                        source: childId,
                        target: targetId,
                        label: 'CALLS',
                    }
                });
            }
        });

        console.log('Neighborhood loaded:', { nodes: nodes.size, edges: edges.length });
        return { nodes: Array.from(nodes.values()), edges };
    } finally {
        await session.close();
    }
}

/** Fetch graph data, optionally filtered by projectId */
export async function fetchGraphData(projectId?: string) {
    const session = driver.session();
    try {
        console.log('Connecting to Neo4j...', projectId ? `(project: ${projectId})` : '(all projects)');
        const projectFilter = projectId
            ? 'AND n.projectId = $projectId AND m.projectId = $projectId'
            : '';
        const result = await session.run(`
      MATCH (n)-[r]->(m)
      WHERE NOT n:ScanMeta AND NOT m:ScanMeta AND NOT n:Project AND NOT m:Project
      ${projectFilter}
      RETURN n, r, m
    `, { projectId: projectId ?? null });
        console.log('Query executed. Records:', result.records.length);

        const nodes = new Map();
        const edges: any[] = [];

        // Helper to sanitize Neo4j 5.x elementIds (which contain colons) for Cytoscape
        const sanitize = (id: string) => id.replace(/:/g, '_');

        result.records.forEach(record => {
            const n = record.get('n');
            const m = record.get('m');
            const r = record.get('r');

            const nId = sanitize(n.elementId);
            const mId = sanitize(m.elementId);
            const rId = sanitize(r.elementId);

            // Determine display names (Fixing 'no mapping for property label' warning)
            // Files use 'path', others use 'name'
            const getDisplayName = (node: any) => {
                const props = node.properties;
                if (props.name) return props.name;
                if (props.fileName) return props.fileName;
                if (props.path) {
                    // Extract basename from path (handles both win/unix separators)
                    const parts = props.path.split(/[/\\]/);
                    return parts[parts.length - 1];
                }
                return node.labels[0] || 'Node';
            };

            const nName = getDisplayName(n);
            const mName = getDisplayName(m);

            if (!nodes.has(nId)) {
                nodes.set(nId, {
                    data: {
                        ...n.properties, // Spread first
                        id: nId,
                        label: n.labels[0],
                        name: nName // Ensure name exists
                    }
                });
            }
            if (!nodes.has(mId)) {
                nodes.set(mId, {
                    data: {
                        ...m.properties, // Spread first
                        id: mId,
                        label: m.labels[0],
                        name: mName // Ensure name exists
                    }
                });
            }

            // STRICT FILTERING: Only add edge if both source and target are KNOWN
            if (nodes.has(nId) && nodes.has(mId)) {
                edges.push({
                    data: {
                        id: rId,
                        source: nId,
                        target: mId,
                        label: r.type
                    }
                });
            } else {
                console.warn(`Skipping edge ${rId} because source ${nId} or target ${mId} is missing.`);
            }
        });

        console.log('Parsed data:', { nodes: nodes.size, edges: edges.length });

        return {
            nodes: Array.from(nodes.values()),
            edges
        };
    } catch (error) {
        console.error('Neo4j Driver Error:', error);
        throw error;
    } finally {
        await session.close();
    }
}

/** Detail d'une fonction dead code ou god object */
export interface DeadCodeItem {
    name: string;
    filePath: string;
}

export interface GodObjectItem {
    name: string;
    filePath: string;
    depCount: number;
}

/** Health stats for a project (or all projects) */
export interface HealthStats {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    functionCount: number;
    classCount: number;
    routeCount: number;
    deadCodeCount: number;
    godObjectCount: number;
    deadCodeItems: DeadCodeItem[];
    godObjectItems: GodObjectItem[];
}

/** Fetch health metrics from the graph */
export async function fetchHealthStats(projectId?: string): Promise<HealthStats> {
    const session = driver.session();
    try {
        const pf = projectId ? 'AND n.projectId = $projectId' : '';
        const pfShort = projectId ? '{projectId: $projectId}' : '';
        const params = { projectId: projectId ?? null };

        // Counts
        const counts = await session.run(`
            MATCH (n) WHERE NOT n:ScanMeta AND NOT n:Project ${pf}
            RETURN
                count(n) as nodeCount,
                count(CASE WHEN n:File THEN 1 END) as fileCount,
                count(CASE WHEN n:Function THEN 1 END) as functionCount,
                count(CASE WHEN n:Class THEN 1 END) as classCount,
                count(CASE WHEN n:Route THEN 1 END) as routeCount
        `, params);
        const c = counts.records[0]!;

        // Edge count
        const edgeResult = await session.run(`
            MATCH (a)-[r]->(b)
            WHERE NOT a:ScanMeta AND NOT b:ScanMeta AND NOT a:Project AND NOT b:Project
            ${projectId ? 'AND a.projectId = $projectId AND b.projectId = $projectId' : ''}
            RETURN count(r) as edgeCount
        `, params);
        const edgeCount = edgeResult.records[0]?.get('edgeCount')?.toNumber?.() ?? edgeResult.records[0]?.get('edgeCount') ?? 0;

        // Dead code — exclut constructeurs, methodes de classes, React, barrel re-exports
        const deadCode = await session.run(`
            MATCH (f:Function ${pfShort})
            WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-()
              AND NOT (f)<-[:DEPENDS_ON {kind: 'import'}]-(:File)
              AND f.name <> 'constructor'
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
            WITH f, parent
            OPTIONAL MATCH (parent)-[:CONTAINS]->(cls:Class)
            WHERE cls.methods CONTAINS ('"' + f.name + '"')
            WITH f, cls
            WHERE cls IS NULL
            RETURN f.name as name, f.filePath as filePath
            ORDER BY f.filePath, f.name
        `, params);
        const deadCodeItems: DeadCodeItem[] = deadCode.records.map(r => ({
            name: r.get('name'),
            filePath: r.get('filePath') ?? '',
        }));
        const deadCodeCount = deadCodeItems.length;

        // God objects — couplage cross-fichier inattendu uniquement
        const godObjects = await session.run(`
            MATCH (f:Function ${pfShort})-[:CALLS]->(target)
            MATCH (ff:File)-[:CONTAINS]->(f)
            WHERE NOT (ff)-[:CONTAINS]->(target)
            MATCH (tf:File)-[:CONTAINS]->(target)
            WHERE NOT (ff)-[:DEPENDS_ON]->(tf)
            WITH f, count(DISTINCT target) as depCount
            WHERE depCount > 15
            RETURN f.name as name, f.filePath as filePath, depCount
            ORDER BY depCount DESC
        `, params);
        const godObjectItems: GodObjectItem[] = godObjects.records.map(r => ({
            name: r.get('name'),
            filePath: r.get('filePath') ?? '',
            depCount: r.get('depCount')?.toNumber?.() ?? r.get('depCount') ?? 0,
        }));
        const godObjectCount = godObjectItems.length;

        return {
            nodeCount: c.get('nodeCount')?.toNumber?.() ?? c.get('nodeCount') ?? 0,
            fileCount: c.get('fileCount')?.toNumber?.() ?? c.get('fileCount') ?? 0,
            functionCount: c.get('functionCount')?.toNumber?.() ?? c.get('functionCount') ?? 0,
            classCount: c.get('classCount')?.toNumber?.() ?? c.get('classCount') ?? 0,
            routeCount: c.get('routeCount')?.toNumber?.() ?? c.get('routeCount') ?? 0,
            edgeCount: typeof edgeCount === 'number' ? edgeCount : 0,
            deadCodeCount,
            godObjectCount,
            deadCodeItems,
            godObjectItems,
        };
    } finally {
        await session.close();
    }
}

/** List available projects in the graph */
export async function fetchProjects(): Promise<Array<{ id: string; name: string; rootPath: string }>> {
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH (p:Project) RETURN p.id as id, p.name as name, p.rootPath as rootPath ORDER BY p.name`
        );
        return result.records.map(r => ({
            id: r.get('id'),
            name: r.get('name'),
            rootPath: r.get('rootPath'),
        }));
    } finally {
        await session.close();
    }
}
