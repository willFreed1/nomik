import { GraphViewer } from './components/GraphViewer';

function App() {
    return (
        <div className="flex h-screen w-full flex-col bg-gray-950 text-white">
            <header className="p-4 border-b border-gray-800 flex justify-between items-center">
                <h1 className="text-2xl font-bold tracking-tight text-blue-400">GENOME</h1>
                <div className="text-sm text-gray-400">MVP Visualization</div>
            </header>
            <main className="flex-1 p-4 overflow-hidden">
                <GraphViewer />
            </main>
        </div>
    )
}

export default App
