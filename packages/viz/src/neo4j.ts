import neo4j from 'neo4j-driver';

export const driver = neo4j.driver(
    import.meta.env.VITE_NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
        import.meta.env.VITE_NEO4J_USER || 'neo4j',
        import.meta.env.VITE_NEO4J_PASSWORD || 'genome_local'
    )
);

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
              AND f.name <> 'constructor'
            WITH f
            WHERE NOT f.filePath ENDS WITH '.tsx'
              AND NOT f.filePath ENDS WITH '.jsx'
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
