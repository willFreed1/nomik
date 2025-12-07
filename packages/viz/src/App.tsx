import { GraphViewer } from './components/GraphViewer';

function App() {
    return (
        <div className="flex h-screen w-full flex-col bg-gray-950 text-white">
            <header className="px-4 py-3 border-b border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold tracking-tight text-cyan-400 font-mono">GENOME</h1>
                    <span className="text-[10px] font-mono text-slate-600 tracking-wider uppercase">Knowledge Graph</span>
                </div>
                <div className="text-xs font-mono text-slate-500">v0.1.0</div>
            </header>
            <main className="flex-1 p-3 overflow-hidden">
                <GraphViewer />
            </main>
        </div>
    )
}

export default App
