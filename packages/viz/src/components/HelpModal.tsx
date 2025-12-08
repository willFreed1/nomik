import { useState } from 'react';

/** Modal d'aide expliquant les interactions et les codes couleur */
export function HelpButton() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 text-xs rounded hover:bg-slate-700 hover:text-slate-200 font-mono transition-colors"
                title="How to use"
            >
                ? Help
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
                            <h2 className="text-lg font-mono font-bold text-cyan-400">GENOME Guide</h2>
                            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
                        </div>

                        <div className="px-6 py-5 space-y-6 text-sm font-mono">
                            {/* Node types */}
                            <HelpSection title="Node Types">
                                <HelpRow color="bg-cyan-500" shape="rounded" label="File" desc="Source file (.ts, .tsx, .js)" />
                                <HelpRow color="bg-emerald-500" shape="rounded-full" label="Function" desc="Function, method, or arrow function" />
                                <HelpRow color="bg-purple-500" shape="diamond" label="Class" desc="Class declaration" />
                            </HelpSection>

                            {/* Edge types */}
                            <HelpSection title="Edge Types">
                                <HelpEdge color="bg-slate-500" label="CONTAINS" desc="File contains a function or class" />
                                <HelpEdge color="bg-amber-500" label="CALLS" desc="Function calls another function" />
                            </HelpSection>

                            {/* Impact overlay */}
                            <HelpSection title="Impact Analysis (click a node)">
                                <HelpGlow color="border-red-500 shadow-red-500" label="Red glow" desc="Selected node (source of impact)" />
                                <HelpGlow color="border-amber-500 shadow-amber-500" label="Amber glow" desc="Functions called BY the selected node (downstream)" />
                                <HelpGlow color="border-blue-500 shadow-blue-500" label="Blue glow" desc="Functions that CALL the selected node (upstream)" />
                                <div className="flex items-center gap-3 text-slate-400">
                                    <span className="w-4 h-4 rounded bg-slate-800 opacity-30 border border-slate-600 flex-shrink-0" />
                                    <span><b className="text-slate-300">Faded</b> — Not directly related to the selected node</span>
                                </div>
                            </HelpSection>

                            {/* Interactions */}
                            <HelpSection title="Interactions">
                                <InteractionRow action="Click node" result="Select + show impact overlay + open detail panel" />
                                <InteractionRow action="Click background" result="Clear selection and impact overlay" />
                                <InteractionRow action="Scroll" result="Zoom in/out" />
                                <InteractionRow action="Drag" result="Pan the graph" />
                                <InteractionRow action="Drag node" result="Move individual node" />
                                <InteractionRow action="Search bar" result="Type a name, press Enter to find and focus" />
                                <InteractionRow action="Filters" result="Toggle node/edge types visibility" />
                            </HelpSection>

                            {/* Detail panel */}
                            <HelpSection title="Detail Panel (right side)">
                                <p className="text-slate-400">Click any node to open the detail panel showing:</p>
                                <ul className="text-slate-400 list-disc list-inside space-y-1 mt-2">
                                    <li>Node type, name, and source file</li>
                                    <li>Properties (exported, async, return type, etc.)</li>
                                    <li><b className="text-amber-400">Calls</b> — functions this node calls</li>
                                    <li><b className="text-blue-400">Called by</b> — functions that call this node</li>
                                    <li><b className="text-slate-300">Contains</b> — child nodes (for files)</li>
                                </ul>
                            </HelpSection>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">{title}</h3>
            <div className="space-y-2.5">{children}</div>
        </div>
    );
}

function HelpRow({ color, shape, label, desc }: { color: string; shape: string; label: string; desc: string }) {
    const shapeClass = shape === 'diamond'
        ? `w-3 h-3 ${color} rotate-45 flex-shrink-0`
        : shape === 'rounded-full'
        ? `w-3 h-3 ${color} rounded-full flex-shrink-0`
        : `w-4 h-3 ${color} rounded flex-shrink-0`;

    return (
        <div className="flex items-center gap-3">
            <span className={shapeClass} />
            <span className="text-slate-200 w-20">{label}</span>
            <span className="text-slate-500">{desc}</span>
        </div>
    );
}

function HelpEdge({ color, label, desc }: { color: string; label: string; desc: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className={`w-5 h-0.5 ${color} flex-shrink-0`} />
            <span className="text-slate-200 w-20">{label}</span>
            <span className="text-slate-500">{desc}</span>
        </div>
    );
}

function HelpGlow({ color, label, desc }: { color: string; label: string; desc: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className={`w-4 h-4 rounded bg-slate-800 border-2 shadow-md flex-shrink-0 ${color}`} />
            <span className="text-slate-200 w-24">{label}</span>
            <span className="text-slate-500">{desc}</span>
        </div>
    );
}

function InteractionRow({ action, result }: { action: string; result: string }) {
    return (
        <div className="flex gap-3">
            <span className="text-cyan-400 w-28 flex-shrink-0">{action}</span>
            <span className="text-slate-400">{result}</span>
        </div>
    );
}
