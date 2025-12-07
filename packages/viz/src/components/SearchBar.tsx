import { useState, useCallback } from 'react';
import type cytoscape from 'cytoscape';

interface SearchBarProps {
    cy: cytoscape.Core | null;
}

/** Barre de recherche pour trouver et focaliser un noeud */
export function SearchBar({ cy }: SearchBarProps) {
    const [query, setQuery] = useState('');

    const handleSearch = useCallback(() => {
        if (!cy || !query.trim()) {
            cy?.elements().removeClass('search-match faded');
            return;
        }

        const q = query.toLowerCase();
        cy.elements().removeClass('search-match faded');

        const matches = cy.nodes().filter((n) => {
            const name = (n.data('name') ?? '').toLowerCase();
            const filePath = (n.data('filePath') ?? n.data('path') ?? '').toLowerCase();
            return name.includes(q) || filePath.includes(q);
        });

        if (matches.length > 0) {
            cy.elements().addClass('faded');
            matches.removeClass('faded').addClass('search-match');
            matches.connectedEdges().removeClass('faded');
            matches.neighborhood().nodes().removeClass('faded');
            cy.animate({ fit: { eles: matches, padding: 80 }, duration: 400 });
        }
    }, [cy, query]);

    const handleClear = useCallback(() => {
        setQuery('');
        cy?.elements().removeClass('search-match faded');
        cy?.fit(undefined, 30);
    }, [cy]);

    return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search nodes..."
                className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-3 py-1.5 w-56 font-mono placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
            />
            <button onClick={handleSearch} className="px-3 py-1.5 bg-cyan-900/50 border border-cyan-700/50 text-cyan-300 text-sm rounded hover:bg-cyan-800/50 font-mono">
                Find
            </button>
            {query && (
                <button onClick={handleClear} className="px-2 py-1.5 text-slate-500 text-sm hover:text-slate-300 font-mono">
                    Clear
                </button>
            )}
        </div>
    );
}
