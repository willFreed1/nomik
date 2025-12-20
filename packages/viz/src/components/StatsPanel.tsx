import type { HealthStats } from '../neo4j';

interface Props {
    stats: HealthStats | null;
    loading: boolean;
}

/** Sidebar showing project health metrics */
export function StatsPanel({ stats, loading }: Props) {
    if (loading || !stats) {
        return (
            <aside className="w-52 border-r border-gray-800 p-4 flex flex-col gap-4 shrink-0">
                <h2 className="text-xs font-mono text-slate-500 tracking-wider uppercase">Health</h2>
                <div className="text-xs font-mono text-slate-600 animate-pulse">Loading...</div>
            </aside>
        );
    }

    const metrics: Array<{ label: string; value: number; color: string; alert?: boolean }> = [
        { label: 'Nodes', value: stats.nodeCount, color: 'text-slate-300' },
        { label: 'Edges', value: stats.edgeCount, color: 'text-slate-300' },
        { label: 'Files', value: stats.fileCount, color: 'text-cyan-400' },
        { label: 'Functions', value: stats.functionCount, color: 'text-emerald-400' },
        { label: 'Classes', value: stats.classCount, color: 'text-purple-400' },
        { label: 'Routes', value: stats.routeCount, color: 'text-amber-400' },
    ];

    const healthIndicators: Array<{ label: string; value: number; color: string; alert: boolean }> = [
        { label: 'Dead code', value: stats.deadCodeCount, color: stats.deadCodeCount > 0 ? 'text-red-400' : 'text-emerald-400', alert: stats.deadCodeCount > 0 },
        { label: 'God objects', value: stats.godObjectCount, color: stats.godObjectCount > 0 ? 'text-orange-400' : 'text-emerald-400', alert: stats.godObjectCount > 0 },
    ];

    return (
        <aside className="w-52 border-r border-gray-800 p-4 flex flex-col gap-5 shrink-0 overflow-y-auto">
            {/* Counts */}
            <div>
                <h2 className="text-xs font-mono text-slate-500 tracking-wider uppercase mb-3">Graph</h2>
                <div className="space-y-2">
                    {metrics.map(m => (
                        <div key={m.label} className="flex justify-between items-center">
                            <span className="text-[11px] font-mono text-slate-500">{m.label}</span>
                            <span className={`text-sm font-mono font-bold ${m.color}`}>{m.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-800" />

            {/* Health */}
            <div>
                <h2 className="text-xs font-mono text-slate-500 tracking-wider uppercase mb-3">Health</h2>
                <div className="space-y-2">
                    {healthIndicators.map(h => (
                        <div key={h.label} className="flex justify-between items-center">
                            <span className="text-[11px] font-mono text-slate-500">{h.label}</span>
                            <span className={`text-sm font-mono font-bold ${h.color}`}>
                                {h.value === 0 ? '0' : h.value}
                                {h.alert && <span className="ml-1 text-[9px]">!</span>}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Health score */}
            <div className="border-t border-gray-800 pt-3">
                <HealthScore stats={stats} />
            </div>
        </aside>
    );
}

/** Visual health score indicator */
function HealthScore({ stats }: { stats: HealthStats }) {
    // Simple scoring: penalize dead code and god objects
    const total = stats.functionCount || 1;
    const deadRatio = stats.deadCodeCount / total;
    const godRatio = stats.godObjectCount / total;
    const score = Math.max(0, Math.round((1 - deadRatio * 2 - godRatio * 3) * 100));

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
