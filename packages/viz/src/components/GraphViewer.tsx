import { useEffect, useState, useRef, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape from 'cytoscape';
import { fetchGraphData } from '../neo4j';
import { graphStyles } from '../styles/graphStyles';
import { graphLayout } from '../styles/graphLayout';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { NodeDetail } from './NodeDetail';
import { HelpButton } from './HelpModal';
import { LayoutSelector } from './LayoutSelector';

interface GraphViewerProps {
    projectId?: string;
}

/** Main 2D graph viewer component */
export function GraphViewer({ projectId }: GraphViewerProps) {
    const [elements, setElements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<cytoscape.NodeSingular | null>(null);
    const [, setCyReady] = useState(false);
    const cyRef = useRef<cytoscape.Core | null>(null);

    // Reload data when projectId changes
    useEffect(() => {
        setLoading(true);
        setError(null);
        setElements([]);
        setSelectedNode(null);
        fetchGraphData(projectId)
            .then(data => {
                const nodes = data.nodes;
                const edges = data.edges;

                const nodeIds = new Set(nodes.map((n: any) => n.data.id));
                const validEdges = edges.filter((e: any) =>
                    nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
                );

                setElements([...nodes, ...validEdges]);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [projectId]);

    /** Impact overlay on node click */
    const handleNodeTap = useCallback((node: cytoscape.NodeSingular) => {
        const cy = cyRef.current;
        if (!cy) return;

        // Clear previous impact
        cy.elements().removeClass('impact-source impact-callee impact-caller impact-edge faded search-match');

        setSelectedNode(node);

        // Impact overlay: highlight calls and dependencies
        const callees = node.outgoers('edge[label="CALLS"]');
        const callers = node.incomers('edge[label="CALLS"]');
        const containsEdges = node.outgoers('edge[label="CONTAINS"]');
        const containedEdges = node.incomers('edge[label="CONTAINS"]');
        const dependsOut = node.outgoers('edge[label="DEPENDS_ON"]');
        const dependsIn = node.incomers('edge[label="DEPENDS_ON"]');

        const impactedEdges = callees.union(callers).union(containsEdges).union(containedEdges).union(dependsOut).union(dependsIn);
        // Fade everything, then highlight impacted
        cy.elements().addClass('faded');
        node.removeClass('faded').addClass('impact-source');
        callees.targets().removeClass('faded').addClass('impact-callee');
        callers.sources().removeClass('faded').addClass('impact-caller');
        impactedEdges.removeClass('faded').addClass('impact-edge');
        containsEdges.targets().removeClass('faded');
        containedEdges.sources().removeClass('faded');
        dependsOut.targets().removeClass('faded').addClass('impact-callee');
        dependsIn.sources().removeClass('faded').addClass('impact-caller');
    }, []);

    /** Clear on background click */
    const handleBgTap = useCallback(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.elements().removeClass('impact-source impact-callee impact-caller impact-edge faded search-match');
        setSelectedNode(null);
    }, []);

    const handleCloseDetail = useCallback(() => {
        handleBgTap();
    }, [handleBgTap]);

    if (loading) return <div className="text-cyan-400 font-mono flex items-center justify-center h-full">INITIALIZING SYSTEM...</div>;
    if (error) return <div className="text-red-500 font-mono flex items-center justify-center h-full">SYSTEM ERROR: {error}</div>;
    if (!elements || elements.length === 0) return <div className="text-gray-500 font-mono flex items-center justify-center h-full">NO DATA DETECTED. SCAN REQUIRED.</div>;

    return (
        <div className="w-full h-full flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <SearchBar cy={cyRef.current} />
                    <HelpButton />
                    <LayoutSelector cy={cyRef.current} />
                </div>
                <FilterPanel cy={cyRef.current} />
            </div>

            {/* Graph + Detail panel */}
            <div className="flex-1 border border-slate-800 bg-[#020617] rounded-lg overflow-hidden relative shadow-2xl shadow-cyan-900/20">
                <div className="absolute top-4 left-4 z-10 pointer-events-none">
                    <h2 className="text-xs font-mono text-cyan-500/50 tracking-[0.2em] uppercase">System Visualization</h2>
                </div>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4 text-[10px] font-mono pointer-events-none">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" /> File</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Function</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500 inline-block" style={{ transform: 'rotate(45deg)', width: 8, height: 8 }} /> Class</span>
                    <span className="text-slate-600">|</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-500 inline-block" /> CONTAINS</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> CALLS</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-400 inline-block" style={{ borderTop: '1px dashed #38bdf8' }} /> DEPENDS_ON</span>
                </div>

                <CytoscapeComponent
                    elements={elements}
                    style={{ width: '100%', height: '100%' }}
                    layout={graphLayout}
                    stylesheet={graphStyles}
                    cy={(cy: cytoscape.Core) => {
                        if (cyRef.current === cy) return;
                        cyRef.current = cy;
                        setCyReady(true);

                        cy.on('tap', 'node', (evt) => handleNodeTap(evt.target));
                        cy.on('tap', (evt) => {
                            if (evt.target === cy) handleBgTap();
                        });
                        // Show edge label on hover
                        cy.on('mouseover', 'edge', (evt) => {
                            evt.target.style('label', evt.target.data('label'));
                            evt.target.style('font-size', '9px');
                            evt.target.style('color', '#94a3b8');
                            evt.target.style('text-background-color', '#020617');
                            evt.target.style('text-background-opacity', 0.8);
                            evt.target.style('text-background-padding', '2px');
                            evt.target.style('text-rotation', 'autorotate');
                        });
                        cy.on('mouseout', 'edge', (evt) => {
                            evt.target.style('label', '');
                        });
                    }}
                    minZoom={0.1}
                    maxZoom={4}
                    wheelSensitivity={0.3}
                />

                <NodeDetail node={selectedNode} onClose={handleCloseDetail} />
            </div>
        </div>
    );
}
