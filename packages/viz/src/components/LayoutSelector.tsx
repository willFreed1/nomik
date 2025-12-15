import { useCallback } from 'react';
import type cytoscape from 'cytoscape';
import { type LayoutName, getLayout } from '../styles/graphLayout';

interface LayoutSelectorProps {
    cy: cytoscape.Core | null;
}

const LAYOUTS: { name: LayoutName; label: string; icon: string }[] = [
    { name: 'cose', label: 'Force', icon: '⊛' },
    { name: 'breadthfirst', label: 'Arbre', icon: '⊤' },
    { name: 'concentric', label: 'Radial', icon: '◎' },
    { name: 'circle', label: 'Cercle', icon: '○' },
];

/** Selecteur de layout pour changer la disposition du graphe */
export function LayoutSelector({ cy }: LayoutSelectorProps) {
    const applyLayout = useCallback((name: LayoutName) => {
        if (!cy) return;
        const layout = cy.layout(getLayout(name) as any);
        layout.run();
    }, [cy]);

    return (
        <div className="flex items-center gap-1">
            {LAYOUTS.map(l => (
                <button
                    key={l.name}
                    onClick={() => applyLayout(l.name)}
                    title={l.label}
                    className="px-2 py-1 rounded text-xs font-mono border border-slate-700 hover:border-cyan-600 hover:text-cyan-400 text-slate-400 transition-all"
                >
                    <span className="mr-1">{l.icon}</span>{l.label}
                </button>
            ))}
        </div>
    );
}
