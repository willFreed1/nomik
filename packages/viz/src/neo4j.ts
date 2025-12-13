import neo4j from 'neo4j-driver';

export const driver = neo4j.driver(
    import.meta.env.VITE_NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
        import.meta.env.VITE_NEO4J_USER || 'neo4j',
        import.meta.env.VITE_NEO4J_PASSWORD || 'genome_local'
    )
);

export async function fetchGraphData() {
    const session = driver.session();
    try {
        console.log('Connecting to Neo4j...');
        // Recupere le graphe complet sans node_modules ni metadonnees
        const result = await session.run(`
      MATCH (n)-[r]->(m)
      WHERE NOT n:ScanMeta AND NOT m:ScanMeta
      RETURN n, r, m
    `);
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
