import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchGraphData } from '../neo4j';
import { HelpButton } from './HelpModal';

/** Couleurs par type de noeud */
const NODE_COLORS: Record<string, string> = {
    File: '#06b6d4',
    Function: '#10b981',
    Class: '#a855f7',
    Route: '#f59e0b',
};

/** Couleurs par type d'edge */
const EDGE_COLORS: Record<string, string> = {
    CONTAINS: '#334155',
    CALLS: '#f59e0b',
    DEPENDS_ON: '#38bdf8',
    EXTENDS: '#a855f7',
    IMPLEMENTS: '#d946ef',
};

interface NodeObj {
    id: string;
    label: string;
    name: string;
    [key: string]: any;
}

/** Visualiseur 3D avec rotation — style ADN/reseau neuronal */
export function Graph3DViewer() {
    const containerRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<NodeObj | null>(null);
    const [stats, setStats] = useState({ nodes: 0, edges: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        let cancelled = false;

        async function init() {
            try {
                // Import dynamique pour eviter les problemes ESM
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mod: any = await import('3d-force-graph');
                const ForceGraph3D = mod.default ?? mod;

                if (cancelled || !containerRef.current) return;

                const graph = ForceGraph3D()(containerRef.current)
                    .backgroundColor('#020617')
                    .nodeLabel((node: any) => `<div style="background:#0f172a;color:#e2e8f0;padding:6px 10px;border-radius:6px;font-family:monospace;font-size:11px;border:1px solid #334155;box-shadow:0 4px 20px rgba(0,0,0,.5)"><b style="color:${NODE_COLORS[node.label] ?? '#94a3b8'}">${node.label}</b><br/>${node.name}</div>`)
                    .nodeColor((node: any) => NODE_COLORS[node.label] ?? '#475569')
                    .nodeVal((node: any) => {
                        if (node.label === 'File') return 6;
                        if (node.label === 'Class') return 4;
                        return 1.5;
                    })
                    .nodeOpacity(0.92)
                    .nodeResolution(16)
                    .linkColor((link: any) => EDGE_COLORS[link.label] ?? '#1e293b')
                    .linkOpacity(0.35)
                    .linkWidth((link: any) => link.label === 'CALLS' ? 1.2 : link.label === 'DEPENDS_ON' ? 1.8 : 0.4)
                    .linkDirectionalParticles((link: any) => link.label === 'CALLS' ? 2 : link.label === 'DEPENDS_ON' ? 1 : 0)
                    .linkDirectionalParticleSpeed(0.004)
                    .linkDirectionalParticleColor((link: any) => EDGE_COLORS[link.label] ?? '#475569')
                    .linkDirectionalParticleWidth(1.2)
                    .onNodeClick((node: any) => {
                        setSelectedNode(node);
                        const distance = 120;
                        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
                        graph.cameraPosition(
                            { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                            node,
                            1500,
                        );
                    })
                    .onBackgroundClick(() => setSelectedNode(null))
                    .warmupTicks(80)
                    .cooldownTicks(200);

                graphRef.current = graph;

                // Charger les donnees depuis Neo4j
                const data = await fetchGraphData();
                if (cancelled) return;

                const nodes = data.nodes.map((n: any) => ({
                    id: n.data.id,
                    label: n.data.label,
                    name: n.data.name,
                    ...n.data,
                }));
                const links = data.edges.map((e: any) => ({
                    source: e.data.source,
                    target: e.data.target,
                    label: e.data.label,
                }));

                graph.graphData({ nodes, links });
                setStats({ nodes: nodes.length, edges: links.length });
                setLoading(false);

                // Auto-rotation lente style ADN
                let angle = 0;
                const rotateInterval = setInterval(() => {
                    if (!graphRef.current) { clearInterval(rotateInterval); return; }
                    angle += 0.15;
                    graphRef.current.cameraPosition({
                        x: 350 * Math.sin((angle * Math.PI) / 180),
                        z: 350 * Math.cos((angle * Math.PI) / 180),
                    });
                }, 40);

                containerRef.current?.addEventListener('mousedown', () => {
                    clearInterval(rotateInterval);
                }, { once: true });

            } catch (err: any) {
                if (!cancelled) {
                    console.error('Graph3D init error:', err);
                    setError(err.message);
                    setLoading(false);
                }
            }
        }

        init();

        const handleResize = () => {
            if (containerRef.current && graphRef.current) {
                graphRef.current.width(containerRef.current.clientWidth);
                graphRef.current.height(containerRef.current.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelled = true;
            window.removeEventListener('resize', handleResize);
            if (graphRef.current) {
                graphRef.current._destructor?.();
                graphRef.current = null;
            }
        };
    }, []);

    /** Recentrage du graphe */
    const handleFitView = useCallback(() => {
        graphRef.current?.zoomToFit(500, 50);
    }, []);

    return (
        <div className="w-full h-full flex flex-col gap-3">
            {/* Toolbar — toujours visible */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <HelpButton />
                    {!loading && (
                        <button
                            onClick={handleFitView}
                            className="px-3 py-1 rounded text-xs font-mono border border-slate-700 hover:border-cyan-600 hover:text-cyan-400 text-slate-400 transition-all"
                        >
                            Fit View
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#06b6d4' }} /> File</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#10b981' }} /> Function</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#a855f7' }} /> Class/Interface</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400">{stats.nodes} nodes</span>
                    <span className="text-slate-400">{stats.edges} edges</span>
                </div>
            </div>

            {/* 3D graph container — toujours rendu pour le ref */}
            <div className="flex-1 border border-slate-800 bg-[#020617] rounded-lg overflow-hidden relative shadow-2xl shadow-cyan-900/20">
                <div ref={containerRef} className="w-full h-full" />

                {/* Overlay de chargement */}
                {loading && !error && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="text-cyan-400 font-mono text-sm animate-pulse">INITIALIZING 3D SYSTEM...</div>
                    </div>
                )}

                {/* Erreur */}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div className="text-red-500 font-mono text-sm">SYSTEM ERROR: {error}</div>
                    </div>
                )}

                {/* Detail du noeud selectionne */}
                {selectedNode && (
                    <div className="absolute top-4 right-4 w-72 bg-slate-900/95 border border-slate-700 rounded-lg p-4 text-xs font-mono backdrop-blur-sm z-20">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-cyan-400 font-bold text-sm">{selectedNode.name}</span>
                            <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white">x</button>
                        </div>
                        <div className="space-y-1 text-slate-300">
                            <div><span className="text-slate-500">type:</span> {selectedNode.label}</div>
                            {selectedNode.filePath && <div><span className="text-slate-500">file:</span> {(selectedNode.filePath as string).split(/[/\\]/).pop()}</div>}
                            {selectedNode.startLine && <div><span className="text-slate-500">line:</span> {selectedNode.startLine}</div>}
                            {selectedNode.language && <div><span className="text-slate-500">lang:</span> {selectedNode.language}</div>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
