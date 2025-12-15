import { useState } from 'react';
import { GraphViewer } from './components/GraphViewer';
import { Graph3DViewer } from './components/Graph3DViewer';

function App() {
    const [mode, setMode] = useState<'3d' | '2d'>('3d');

    return (
        <div className="flex h-screen w-full flex-col bg-gray-950 text-white">
            <header className="px-4 py-3 border-b border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold tracking-tight text-cyan-400 font-mono">GENOME</h1>
                    <span className="text-[10px] font-mono text-slate-600 tracking-wider uppercase">Knowledge Graph</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-900 rounded border border-slate-700 p-0.5">
                        <button
                            onClick={() => setMode('3d')}
                            className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${mode === '3d' ? 'bg-cyan-900/60 text-cyan-400 border border-cyan-700' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
                        >
                            3D
                        </button>
                        <button
                            onClick={() => setMode('2d')}
                            className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${mode === '2d' ? 'bg-cyan-900/60 text-cyan-400 border border-cyan-700' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}
                        >
                            2D
                        </button>
                    </div>
                    <div className="text-xs font-mono text-slate-500">v0.1.0</div>
                </div>
            </header>
            <main className="flex-1 p-3 overflow-hidden">
                {mode === '3d' ? <Graph3DViewer /> : <GraphViewer />}
            </main>
        </div>
    );
}

export default App;
