import { useState, useCallback, useEffect } from 'react';
import type cytoscape from 'cytoscape';

interface FilterPanelProps {
    cy: cytoscape.Core | null;
}

interface FilterState {
    File: boolean;
    Function: boolean;
    Class: boolean;
    CONTAINS: boolean;
    CALLS: boolean;
    DEPENDS_ON: boolean;
}

const LABEL_COLORS: Record<string, string> = {
    File: '#06b6d4',
    Function: '#10b981',
    Class: '#a855f7',
    CONTAINS: '#334155',
    CALLS: '#f59e0b',
    DEPENDS_ON: '#38bdf8',
};

/** Panneau de filtres pour masquer/afficher les types de noeuds et edges */
export function FilterPanel({ cy }: FilterPanelProps) {
    const [filters, setFilters] = useState<FilterState>({
        File: true,
        Function: true,
        Class: true,
        CONTAINS: true,
        CALLS: true,
        DEPENDS_ON: true,
    });
    const [counts, setCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!cy) return;
        const c: Record<string, number> = {};
        ['File', 'Function', 'Class'].forEach((label) => {
            c[label] = cy.nodes(`[label="${label}"]`).length;
        });
        ['CONTAINS', 'CALLS', 'DEPENDS_ON'].forEach((type) => {
            c[type] = cy.edges(`[label="${type}"]`).length;
        });
        setCounts(c);
    }, [cy]);

    const toggle = useCallback((key: keyof FilterState) => {
        if (!cy) return;
        setFilters((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            if (['File', 'Function', 'Class'].includes(key)) {
                const nodes = cy.nodes(`[label="${key}"]`);
                next[key] ? nodes.style('display', 'element') : nodes.style('display', 'none');
            } else {
                const edges = cy.edges(`[label="${key}"]`);
                next[key] ? edges.style('display', 'element') : edges.style('display', 'none');
            }
            return next;
        });
    }, [cy]);

    return (
        <div className="flex items-center gap-3">
            {(Object.keys(filters) as (keyof FilterState)[]).map((key) => (
                <button
                    key={key}
                    onClick={() => toggle(key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-all ${
                        filters[key]
                            ? 'border-slate-600 text-slate-200'
                            : 'border-slate-800 text-slate-600 opacity-50'
                    }`}
                >
                    <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: filters[key] ? LABEL_COLORS[key] : '#334155' }}
                    />
                    {key}
                    <span className="text-slate-500 ml-0.5">{counts[key] ?? 0}</span>
                </button>
            ))}
        </div>
    );
}
