import type cytoscape from 'cytoscape';

interface NodeDetailProps {
    node: cytoscape.NodeSingular | null;
    onClose: () => void;
}

/** Panneau de detail du noeud selectionne */
export function NodeDetail({ node, onClose }: NodeDetailProps) {
    if (!node) return null;

    const data = node.data();
    const label = data.label ?? 'Unknown';
    const name = data.name ?? data.path ?? 'unnamed';

    const calledBy = node.incomers('edge[label="CALLS"]').sources();
    const calls = node.outgoers('edge[label="CALLS"]').targets();
    const containedBy = node.incomers('edge[label="CONTAINS"]').sources();
    const contains = node.outgoers('edge[label="CONTAINS"]').targets();

    return (
        <div className="absolute right-4 top-4 bottom-4 w-80 bg-slate-900/95 border border-slate-700 rounded-lg backdrop-blur-sm z-20 flex flex-col shadow-2xl shadow-black/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                        label === 'File' ? 'border-cyan-700 text-cyan-400' :
                        label === 'Function' ? 'border-emerald-700 text-emerald-400' :
                        'border-purple-700 text-purple-400'
                    }`}>{label}</span>
                    <span className="text-sm font-mono text-slate-200 truncate max-w-[180px]">{name}</span>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">&times;</button>
            </div>

            {/* Properties */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-xs font-mono">
                {/* Fichier source */}
                {data.filePath && (
                    <Section title="File">
                        <span className="text-slate-400">{shortenPath(data.filePath)}</span>
                        {data.startLine && <span className="text-slate-500 ml-1">:{data.startLine}-{data.endLine}</span>}
                    </Section>
                )}

                {/* Proprietes */}
                <Section title="Properties">
                    <div className="space-y-1">
                        {data.isExported !== undefined && <Prop label="exported" value={String(data.isExported)} />}
                        {data.isAsync !== undefined && <Prop label="async" value={String(data.isAsync)} />}
                        {data.returnType && <Prop label="returns" value={data.returnType} />}
                        {data.superClass && <Prop label="extends" value={data.superClass} />}
                        {data.language && <Prop label="language" value={data.language} />}
                        {data.size && <Prop label="size" value={`${data.size} B`} />}
                    </div>
                </Section>

                {/* Appels sortants */}
                {calls.length > 0 && (
                    <Section title={`Calls (${calls.length})`}>
                        <NodeList nodes={calls} color="text-amber-400" />
                    </Section>
                )}

                {/* Appels entrants */}
                {calledBy.length > 0 && (
                    <Section title={`Called by (${calledBy.length})`}>
                        <NodeList nodes={calledBy} color="text-blue-400" />
                    </Section>
                )}

                {/* Contenu (pour les fichiers) */}
                {contains.length > 0 && (
                    <Section title={`Contains (${contains.length})`}>
                        <NodeList nodes={contains} color="text-slate-300" />
                    </Section>
                )}

                {/* Parent */}
                {containedBy.length > 0 && (
                    <Section title="Contained in">
                        <NodeList nodes={containedBy} color="text-cyan-400" />
                    </Section>
                )}
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1.5">{title}</div>
            {children}
        </div>
    );
}

function Prop({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between">
            <span className="text-slate-500">{label}</span>
            <span className="text-slate-300">{value}</span>
        </div>
    );
}

function NodeList({ nodes, color }: { nodes: cytoscape.NodeCollection; color: string }) {
    return (
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {nodes.map((n: cytoscape.NodeSingular) => (
                <div key={n.id()} className={`${color} truncate`}>
                    {n.data('name') ?? n.data('path') ?? n.id()}
                </div>
            ))}
        </div>
    );
}

function shortenPath(p: string): string {
    const parts = p.replace(/\\/g, '/').split('/');
    const idx = parts.findIndex((s) => s === 'packages');
    return idx >= 0 ? parts.slice(idx).join('/') : parts.slice(-3).join('/');
}
