import { useEffect, useState, useRef, useCallback } from 'react';
import cytoscape from 'cytoscape';
import { fetchGraphData, fetchGraphOverview, type ViewMode } from '../neo4j';
import { graphStyles, graphStylesFast } from '../styles/graphStyles';
import { graphLayout } from '../styles/graphLayout';
import { getAdaptiveLayout } from '../styles/graphLayout';
import { SearchBar } from './SearchBar';
import { FilterPanel } from './FilterPanel';
import { NodeDetail } from './NodeDetail';
import { HelpButton } from './HelpModal';
import { LayoutSelector } from './LayoutSelector';

/** Rendering phase for progressive loading UX */
type Phase = 'loading' | 'computing' | 'streaming' | 'ready' | 'error';

interface GraphViewerProps {
    projectId?: string;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
}

/** Main 2D graph viewer — headless layout + progressive streaming */
export function GraphViewer({ projectId, viewMode, onViewModeChange }: GraphViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const [phase, setPhase] = useState<Phase>('loading');
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<cytoscape.NodeSingular | null>(null);
    const [isLargeGraph, setIsLargeGraph] = useState(false);
    const [stats, setStats] = useState({ nodes: 0, edges: 0, streamed: 0 });

    // Master effect: fetch data → compute layout headlessly → stream into visible cy
    useEffect(() => {
        if (!containerRef.current) return;
        let cancelled = false;

        // Destroy previous cy instance
        if (cyRef.current) {
            cyRef.current.destroy();
            cyRef.current = null;
        }
        setPhase('loading');
        setError(null);
        setSelectedNode(null);
        setStats({ nodes: 0, edges: 0, streamed: 0 });

        async function run() {
            try {
                // ── Phase 1: Fetch data ──
                const data = viewMode === 'overview'
                    ? await fetchGraphOverview(projectId)
                    : await fetchGraphData(projectId);
                if (cancelled) return;

                const nodeEls = data.nodes;
                const edgeEls = data.edges;
                const nodeIds = new Set(nodeEls.map((n: any) => n.data.id));
                const validEdges = edgeEls.filter((e: any) =>
                    nodeIds.has(e.data.source) && nodeIds.has(e.data.target)
                );
                const allElements = [...nodeEls, ...validEdges];
                const large = nodeEls.length > 300;
                setIsLargeGraph(large);
                setStats({ nodes: nodeEls.length, edges: validEdges.length, streamed: 0 });

                // ── Phase 2: Compute layout headlessly (no rendering = no lag) ──
                setPhase('computing');
                // Yield to browser so overlay renders before heavy computation
                await new Promise(r => requestAnimationFrame(r));
                if (cancelled) return;

                const activeLayout = large ? getAdaptiveLayout(allElements.length) : graphLayout;
                const activeStyles = large ? graphStylesFast : graphStyles;

                // Headless cy — computes positions without touching the DOM
                const headlessCy = cytoscape({
                    headless: true,
                    styleEnabled: false,
                    elements: allElements,
                });

                // Run layout synchronously (headless = no rendering overhead)
                const positions = new Map<string, { x: number; y: number }>();
                await new Promise<void>((resolve) => {
                    const layout = headlessCy.layout({
                        ...activeLayout,
                        animate: false,
                        fit: true,
                    });
                    layout.one('layoutstop', () => {
                        headlessCy.nodes().forEach((n: cytoscape.NodeSingular) => {
                            positions.set(n.id(), { ...n.position() });
                        });
                        resolve();
                    });
                    layout.run();
                });
                headlessCy.destroy();
                if (cancelled) return;

                // ── Phase 3: Stream elements into visible cy with pre-computed positions ──
                setPhase('streaming');

                const cy = cytoscape({
                    container: containerRef.current,
                    style: activeStyles,
                    minZoom: 0.1,
                    maxZoom: 4,
                    wheelSensitivity: 0.3,
                });
                cyRef.current = cy;

                // Performance options for large graphs
                if (large) {
                    try {
                        (cy as any).renderer().options.textureOnViewport = true;
                        (cy as any).renderer().options.hideEdgesOnViewport = true;
                    } catch (_) { /* renderer options not available in all versions */ }
                }

                // Progressive batch streaming — nodes first, then edges
                const BATCH_SIZE = large ? 200 : 100;

                // Stream nodes with pre-computed positions
                for (let i = 0; i < nodeEls.length; i += BATCH_SIZE) {
                    if (cancelled) return;
                    const batch = nodeEls.slice(i, i + BATCH_SIZE);
                    cy.batch(() => {
                        for (const el of batch) {
                            const pos = positions.get(el.data.id);
                            cy.add({ ...el, position: pos ?? { x: 0, y: 0 } });
                        }
                    });
                    setStats(s => ({ ...s, streamed: Math.min(i + BATCH_SIZE, nodeEls.length) }));
                    // Yield to browser between batches
                    await new Promise(r => requestAnimationFrame(r));
                }

                // Stream edges in batches
                for (let i = 0; i < validEdges.length; i += BATCH_SIZE * 2) {
                    if (cancelled) return;
                    const batch = validEdges.slice(i, i + BATCH_SIZE * 2);
                    cy.batch(() => {
                        for (const el of batch) {
                            cy.add(el);
                        }
                    });
                    await new Promise(r => requestAnimationFrame(r));
                }

                if (cancelled) return;
                cy.fit(undefined, 30);

                // Setup event handlers
                cy.on('tap', 'node', (evt) => {
                    const node = evt.target;
                    cy.elements().removeClass('impact-source impact-callee impact-caller impact-edge faded search-match');
                    setSelectedNode(node);

                    const callees = node.outgoers('edge[label="CALLS"]');
                    const callers = node.incomers('edge[label="CALLS"]');
                    const containsEdges = node.outgoers('edge[label="CONTAINS"]');
                    const containedEdges = node.incomers('edge[label="CONTAINS"]');
                    const dependsOut = node.outgoers('edge[label="DEPENDS_ON"]');
                    const dependsIn = node.incomers('edge[label="DEPENDS_ON"]');

                    const impactedEdges = callees.union(callers).union(containsEdges).union(containedEdges).union(dependsOut).union(dependsIn);
                    cy.elements().addClass('faded');
                    node.removeClass('faded').addClass('impact-source');
                    callees.targets().removeClass('faded').addClass('impact-callee');
                    callers.sources().removeClass('faded').addClass('impact-caller');
                    impactedEdges.removeClass('faded').addClass('impact-edge');
                    containsEdges.targets().removeClass('faded');
                    containedEdges.sources().removeClass('faded');
                    dependsOut.targets().removeClass('faded').addClass('impact-callee');
                    dependsIn.sources().removeClass('faded').addClass('impact-caller');
                });
                cy.on('tap', (evt) => {
                    if (evt.target === cy) {
                        cy.elements().removeClass('impact-source impact-callee impact-caller impact-edge faded search-match');
                        setSelectedNode(null);
                    }
                });
                // Edge labels on hover (skip for large graphs — perf cost)
                if (!large) {
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
                }

                setPhase('ready');

            } catch (err: any) {
                if (!cancelled) {
                    console.error('GraphViewer error:', err);
                    setError(err.message);
                    setPhase('error');
                }
            }
        }

        run();

        return () => {
            cancelled = true;
            if (cyRef.current) {
                cyRef.current.destroy();
                cyRef.current = null;
            }
        };
    }, [projectId, viewMode]);

    const handleCloseDetail = useCallback(() => {
        const cy = cyRef.current;
        if (!cy) return;
        cy.elements().removeClass('impact-source impact-callee impact-caller impact-edge faded search-match');
        setSelectedNode(null);
    }, []);

    // Phase-aware loading message
    const phaseMessage = phase === 'loading' ? (viewMode === 'overview' ? 'FETCHING OVERVIEW...' : 'FETCHING GRAPH DATA...')
        : phase === 'computing' ? `COMPUTING LAYOUT (${stats.nodes} nodes, ${stats.edges} edges)...`
        : phase === 'streaming' ? `STREAMING ${stats.streamed}/${stats.nodes} nodes...`
        : null;

    return (
        <div className="w-full h-full flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <SearchBar cy={cyRef.current} />
                    <HelpButton />
                    <LayoutSelector cy={cyRef.current} />
                    {/* View mode toggle */}
                    <div className="flex items-center gap-1 bg-slate-900 rounded border border-slate-700 p-0.5">
                        <button
                            onClick={() => onViewModeChange('overview')}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${viewMode === 'overview' ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-700' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
                        >
                            Overview
                        </button>
                        <button
                            onClick={() => onViewModeChange('full')}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${viewMode === 'full' ? 'bg-amber-900/60 text-amber-400 border border-amber-700' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
                        >
                            Full Graph
                        </button>
                    </div>
                    {isLargeGraph && phase === 'ready' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-900/40 text-amber-400 border border-amber-800">
                            FAST MODE
                        </span>
                    )}
                </div>
                {phase === 'ready' && <FilterPanel cy={cyRef.current} />}
            </div>

            {/* Graph + Detail panel */}
            <div className="flex-1 border border-slate-800 bg-[#020617] rounded-lg overflow-hidden relative shadow-2xl shadow-cyan-900/20">
                <div className="absolute top-4 left-4 z-10 pointer-events-none">
                    <h2 className="text-xs font-mono text-cyan-500/50 tracking-[0.2em] uppercase">
                        {viewMode === 'overview' ? 'File Overview' : 'System Visualization'}
                    </h2>
                </div>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 z-10 flex items-center gap-4 text-[10px] font-mono pointer-events-none">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" /> File</span>
                    {viewMode === 'full' && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Function</span>}
                    {viewMode === 'full' && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-purple-500 inline-block" style={{ transform: 'rotate(45deg)', width: 8, height: 8 }} /> Class</span>}
                    <span className="text-slate-600">|</span>
                    {viewMode === 'full' && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-500 inline-block" /> CONTAINS</span>}
                    {viewMode === 'full' && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> CALLS</span>}
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-sky-400 inline-block" style={{ borderTop: '1px dashed #38bdf8' }} /> DEPENDS_ON</span>
                </div>

                {/* Cytoscape container — managed manually for full control */}
                <div ref={containerRef} className="w-full h-full" />

                {/* Phase overlays */}
                {phaseMessage && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-slate-950/80 pointer-events-none">
                        <div className="text-cyan-400 font-mono text-sm animate-pulse">{phaseMessage}</div>
                        {phase === 'streaming' && (
                            <div className="mt-3 w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-cyan-500 rounded-full transition-all duration-200"
                                    style={{ width: `${stats.nodes > 0 ? (stats.streamed / stats.nodes) * 100 : 0}%` }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Error */}
                {phase === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center z-30">
                        <div className="text-red-500 font-mono text-sm">SYSTEM ERROR: {error}</div>
                    </div>
                )}

                <NodeDetail node={selectedNode} onClose={handleCloseDetail} />
            </div>
        </div>
    );
}
