import { useState } from 'react';
import type { HealthStats } from '../neo4j';

interface Props {
    stats: HealthStats | null;
    loading: boolean;
}

/** Extrait le nom de fichier court depuis un chemin complet */
function basename(filePath: string): string {
    const parts = filePath.split(/[/\\]/);
    return parts[parts.length - 1] ?? filePath;
}

/** Sidebar avec metriques du graphe et details dead code / god objects */
export function StatsPanel({ stats, loading }: Props) {
    const [showDeadCode, setShowDeadCode] = useState(false);
    const [showGodObjects, setShowGodObjects] = useState(false);

    if (loading || !stats) {
        return (
            <aside className="w-64 border-r border-gray-800 p-4 flex flex-col gap-4 shrink-0">
                <h2 className="text-xs font-mono text-slate-500 tracking-wider uppercase">Health</h2>
                <div className="text-xs font-mono text-slate-600 animate-pulse">Loading...</div>
            </aside>
        );
    }

    const metrics: Array<{ label: string; value: number; color: string }> = [
        { label: 'Nodes', value: stats.nodeCount, color: 'text-slate-300' },
        { label: 'Edges', value: stats.edgeCount, color: 'text-slate-300' },
        { label: 'Files', value: stats.fileCount, color: 'text-cyan-400' },
        { label: 'Functions', value: stats.functionCount, color: 'text-emerald-400' },
        { label: 'Classes', value: stats.classCount, color: 'text-purple-400' },
        { label: 'Routes', value: stats.routeCount, color: 'text-amber-400' },
    ];

    return (
        <aside className="w-64 border-r border-gray-800 p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
            {/* Counts */}
            <div>
                <h2 className="text-xs font-mono text-slate-500 tracking-wider uppercase mb-3">Graph</h2>
                <div className="space-y-1.5">
                    {metrics.map(m => (
                        <div key={m.label} className="flex justify-between items-center">
                            <span className="text-[11px] font-mono text-slate-500">{m.label}</span>
                            <span className={`text-sm font-mono font-bold ${m.color}`}>{m.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-gray-800" />

            {/* Health */}
            <div>
                <h2 className="text-xs font-mono text-slate-500 tracking-wider uppercase mb-3">Health</h2>

                {/* Dead code — cliquable pour voir les details */}
                <button
                    onClick={() => setShowDeadCode(!showDeadCode)}
                    className="w-full flex justify-between items-center py-1 hover:bg-slate-900/50 rounded px-1 -mx-1 transition-colors"
                >
                    <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                        <span className={`text-[9px] transition-transform ${showDeadCode ? 'rotate-90' : ''}`}>▶</span>
                        Dead code
                    </span>
                    <span className={`text-sm font-mono font-bold ${stats.deadCodeCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {stats.deadCodeCount}
                        {stats.deadCodeCount > 0 && <span className="ml-1 text-[9px]">!</span>}
                    </span>
                </button>

                {/* Detail dead code */}
                {showDeadCode && stats.deadCodeItems.length > 0 && (
                    <div className="ml-3 mt-1 mb-2 space-y-1 max-h-48 overflow-y-auto border-l border-gray-800 pl-2">
                        {stats.deadCodeItems.map((item, i) => (
                            <div key={`${item.name}-${i}`} className="group">
                                <div className="text-[10px] font-mono text-red-300/80 truncate" title={item.name}>
                                    {item.name}
                                </div>
                                <div className="text-[9px] font-mono text-slate-600 truncate" title={item.filePath}>
                                    {basename(item.filePath)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {showDeadCode && stats.deadCodeItems.length === 0 && (
                    <div className="ml-3 mt-1 mb-2 text-[10px] font-mono text-emerald-400/60">Aucun dead code</div>
                )}

                {/* God objects — cliquable pour voir les details */}
                <button
                    onClick={() => setShowGodObjects(!showGodObjects)}
                    className="w-full flex justify-between items-center py-1 hover:bg-slate-900/50 rounded px-1 -mx-1 transition-colors"
                >
                    <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                        <span className={`text-[9px] transition-transform ${showGodObjects ? 'rotate-90' : ''}`}>▶</span>
                        God objects
                    </span>
                    <span className={`text-sm font-mono font-bold ${stats.godObjectCount > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                        {stats.godObjectCount}
                        {stats.godObjectCount > 0 && <span className="ml-1 text-[9px]">!</span>}
                    </span>
                </button>

                {/* Detail god objects */}
                {showGodObjects && stats.godObjectItems.length > 0 && (
                    <div className="ml-3 mt-1 mb-2 space-y-1 max-h-48 overflow-y-auto border-l border-gray-800 pl-2">
                        {stats.godObjectItems.map((item, i) => (
                            <div key={`${item.name}-${i}`} className="group">
                                <div className="text-[10px] font-mono text-orange-300/80 truncate flex justify-between" title={item.name}>
                                    <span className="truncate">{item.name}</span>
                                    <span className="text-orange-400/60 ml-1 shrink-0">{item.depCount} calls</span>
                                </div>
                                <div className="text-[9px] font-mono text-slate-600 truncate" title={item.filePath}>
                                    {basename(item.filePath)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {showGodObjects && stats.godObjectItems.length === 0 && (
                    <div className="ml-3 mt-1 mb-2 text-[10px] font-mono text-emerald-400/60">Aucun god object</div>
                )}
            </div>

            {/* Health score */}
            <div className="border-t border-gray-800 pt-3">
                <HealthScore stats={stats} />
            </div>
        </aside>
    );
}

/** Indicateur visuel du score de sante
 *  Formule : penalise proportionnellement le dead code et les god objects
 *  - dead code : -1 point par % de fonctions mortes (plafonné a -30)
 *  - god objects : -5 points par god object (plafonné a -30)
 */
function HealthScore({ stats }: { stats: HealthStats }) {
    const total = stats.functionCount || 1;
    const deadPenalty = Math.min(30, Math.round((stats.deadCodeCount / total) * 100));
    const godPenalty = Math.min(30, stats.godObjectCount * 5);
    const score = Math.max(0, 100 - deadPenalty - godPenalty);

    const getColor = (s: number) => {
        if (s >= 80) return 'text-emerald-400';
        if (s >= 50) return 'text-amber-400';
        return 'text-red-400';
    };

    const getLabel = (s: number) => {
        if (s >= 80) return 'Healthy';
        if (s >= 50) return 'Fair';
        return 'Needs attention';
    };

    return (
        <div className="text-center">
            <div className={`text-2xl font-mono font-bold ${getColor(score)}`}>{score}%</div>
            <div className={`text-[10px] font-mono ${getColor(score)}`}>{getLabel(score)}</div>
        </div>
    );
}
