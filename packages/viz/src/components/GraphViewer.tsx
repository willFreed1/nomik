import { useEffect, useState, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import { fetchGraphData } from '../neo4j';
import { graphStyles } from '../styles/graphStyles';
import { graphLayout } from '../styles/graphLayout';

export function GraphViewer() {
    const [elements, setElements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);

    useEffect(() => {
        fetchGraphData()
            .then(data => {
                const nodes = data.nodes;
                const edges = data.edges;

                // Integrity Check
                const nodeIds = new Set(nodes.map((n: any) => n.data.id));
                const validEdges = edges.filter((e: any) => {
                    return nodeIds.has(e.data.source) && nodeIds.has(e.data.target);
                });

                const flatElements = [...nodes, ...validEdges];
                console.log(`Graph loaded. Nodes: ${nodes.length}, Edges: ${validEdges.length}`);
                setElements(flatElements);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch graph:", err);
                setError(err.message);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="text-cyan-400 font-mono flex items-center justify-center h-full">INITIALIZING SYSTEM...</div>;
    if (error) return <div className="text-red-500 font-mono flex items-center justify-center h-full">SYSTEM ERROR: {error}</div>;
    if (!elements || elements.length === 0) return <div className="text-gray-500 font-mono flex items-center justify-center h-full">NO DATA DETECTED. SCAN REQUIRED.</div>;

    return (
        <div className="w-full h-full border border-slate-800 bg-[#020617] rounded-lg overflow-hidden relative shadow-2xl shadow-cyan-900/20">
            <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <h2 className="text-xs font-mono text-cyan-500/50 tracking-[0.2em] uppercase">System Visualization</h2>
            </div>
            <CytoscapeComponent
                elements={elements}
                style={{ width: '100%', height: '100%' }}
                layout={graphLayout}
                stylesheet={graphStyles}
                cy={(cy: cytoscape.Core) => {
                    cyRef.current = cy;
                    cy.on('tap', 'node', (evt: any) => {
                        console.log('Selected:', evt.target.data());
                    });
                }}
                minZoom={0.1}
                maxZoom={4}
                wheelSensitivity={0.3}
            />
        </div>
    );
}
