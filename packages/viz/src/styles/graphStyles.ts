export const graphStyles: any[] = [
    {
        selector: 'node',
        style: {
            'background-color': '#1e293b',
            'label': 'data(name)',
            'color': '#cbd5e1',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 6,
            'font-size': '12px',
            'font-family': 'monospace',
            'width': 20,
            'height': 20,
            'border-width': 1,
            'border-color': '#475569',
            'overlay-padding': '4px',
            'overlay-opacity': 0,
            'z-index': 10,
            'text-background-color': '#020617',
            'text-background-opacity': 0.7,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle'
        }
    },
    // FILE : ancres visuelles du graphe
    {
        selector: 'node[label="File"]',
        style: {
            'background-color': '#083344',
            'border-color': 'data(dirColor)',
            'border-width': 3,
            'color': '#22d3ee',
            'shape': 'round-rectangle',
            'width': 50,
            'height': 32,
            'padding': '12px',
            'font-size': '14px',
            'font-weight': 'bold',
            'text-valign': 'center',
            'text-margin-y': 0,
            'z-index': 20
        }
    },
    // FUNCTION : noeuds detail
    {
        selector: 'node[label="Function"]',
        style: {
            'background-color': '#064e3b',
            'border-color': 'data(dirColor)',
            'border-width': 1.5,
            'color': '#86efac',
            'width': 12,
            'height': 12,
            'font-size': '10px'
        }
    },
    // CLASS : noeuds marqueurs
    {
        selector: 'node[label="Class"]',
        style: {
            'background-color': '#3b0764',
            'border-color': 'data(dirColor)',
            'border-width': 2,
            'color': '#d8b4fe',
            'shape': 'diamond',
            'width': 24,
            'height': 24,
            'font-size': '12px',
            'font-weight': 'bold'
        }
    },
    {
        selector: 'edge',
        style: {
            'width': 2,
            'line-color': '#334155',
            'target-arrow-color': '#334155',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            'opacity': 0.55,
        }
    },
    // CALLS : edges amber/orange — highly visible
    {
        selector: 'edge[label="CALLS"]',
        style: {
            'line-color': '#fbbf24',
            'target-arrow-color': '#fbbf24',
            'line-style': 'solid',
            'opacity': 0.8,
            'width': 2,
        }
    },
    // DEPENDS_ON : edges sky dashed (imports entre fichiers)
    {
        selector: 'edge[label="DEPENDS_ON"]',
        style: {
            'line-color': '#38bdf8',
            'target-arrow-color': '#38bdf8',
            'line-style': 'dashed',
            'opacity': 0.75,
            'width': 2,
        }
    },
    // Selection
    {
        selector: 'node:selected',
        style: {
            'border-width': 4,
            'border-color': '#fff',
            'overlay-color': '#fff',
            'overlay-opacity': 0.15,
            'overlay-padding': 6,
            'z-index': 999
        }
    },
    {
        selector: 'edge:selected',
        style: {
            'line-color': '#fff',
            'target-arrow-color': '#fff',
            'width': 4,
            'opacity': 1,
            'z-index': 999
        }
    },
    // Impact : source (rouge)
    {
        selector: 'node.impact-source',
        style: {
            'border-color': '#ef4444',
            'border-width': 5,
            'overlay-color': '#ef4444',
            'overlay-opacity': 0.2,
            'overlay-padding': 8,
            'z-index': 1000,
        }
    },
    // Impact : callees downstream (amber)
    {
        selector: 'node.impact-callee',
        style: {
            'border-color': '#f59e0b',
            'border-width': 3,
            'overlay-color': '#f59e0b',
            'overlay-opacity': 0.15,
            'overlay-padding': 6,
            'z-index': 900,
        }
    },
    // Impact : callers upstream (bleu)
    {
        selector: 'node.impact-caller',
        style: {
            'border-color': '#3b82f6',
            'border-width': 3,
            'overlay-color': '#3b82f6',
            'overlay-opacity': 0.15,
            'overlay-padding': 6,
            'z-index': 900,
        }
    },
    {
        selector: 'edge.impact-edge',
        style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            'width': 3,
            'opacity': 1,
            'z-index': 900,
        }
    },
    // Noeuds fades quand impact actif
    {
        selector: 'node.faded',
        style: {
            'opacity': 0.15,
        }
    },
    {
        selector: 'edge.faded',
        style: {
            'opacity': 0.05,
        }
    },
    // Recherche : highlight cyan
    {
        selector: 'node.search-match',
        style: {
            'border-color': '#22d3ee',
            'border-width': 4,
            'overlay-color': '#22d3ee',
            'overlay-opacity': 0.2,
            'overlay-padding': 6,
            'z-index': 1000,
        }
    },
    {
        selector: 'node.search-focus',
        style: {
            'border-color': '#f8fafc',
            'border-width': 5,
            'overlay-color': '#22d3ee',
            'overlay-opacity': 0.25,
            'overlay-padding': 8,
            'z-index': 1100,
        }
    },
    {
        selector: 'edge.search-edge',
        style: {
            'opacity': 0.9,
            'width': 2.5,
            'line-color': '#22d3ee',
            'target-arrow-color': '#22d3ee',
            'z-index': 950,
        }
    },
    // Filter visibility control
    {
        selector: '.filter-hidden',
        style: { 'display': 'none' }
    },
];

/** Performance-optimized styles for large graphs (>300 nodes) */
export const graphStylesFast: any[] = [
    {
        selector: 'node',
        style: {
            'background-color': '#1e293b',
            'label': 'data(name)',
            'color': '#cbd5e1',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'font-size': '9px',
            'font-family': 'monospace',
            'width': 14,
            'height': 14,
            'border-width': 1,
            'border-color': '#475569',
            'overlay-padding': '2px',
            'overlay-opacity': 0,
            'min-zoomed-font-size': 10,  // Hide labels when zoomed out
        }
    },
    {
        selector: 'node[label="File"]',
        style: {
            'background-color': '#083344',
            'border-color': 'data(dirColor)',
            'border-width': 2,
            'color': '#22d3ee',
            'shape': 'round-rectangle',
            'width': 40,
            'height': 24,
            'font-size': '11px',
            'font-weight': 'bold',
            'text-valign': 'center',
            'text-margin-y': 0,
            'z-index': 20,
            'min-zoomed-font-size': 6,
        }
    },
    {
        selector: 'node[label="Function"]',
        style: {
            'background-color': '#064e3b',
            'border-color': 'data(dirColor)',
            'border-width': 1,
            'color': '#86efac',
            'width': 8,
            'height': 8,
            'font-size': '8px',
            'min-zoomed-font-size': 14,  // Only show when zoomed in close
        }
    },
    {
        selector: 'node[label="Class"]',
        style: {
            'background-color': '#3b0764',
            'border-color': 'data(dirColor)',
            'border-width': 1.5,
            'color': '#d8b4fe',
            'shape': 'diamond',
            'width': 16,
            'height': 16,
            'font-size': '9px',
            'min-zoomed-font-size': 12,
        }
    },
    {
        selector: 'edge',
        style: {
            'width': 1,
            'line-color': '#1e293b',
            'target-arrow-color': '#1e293b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.6,
            'opacity': 0.35,
        }
    },
    {
        selector: 'edge[label="CALLS"]',
        style: {
            'line-color': '#fbbf24',
            'target-arrow-color': '#fbbf24',
            'opacity': 0.5,
            'width': 1.5,
        }
    },
    {
        selector: 'edge[label="DEPENDS_ON"]',
        style: {
            'line-color': '#38bdf8',
            'target-arrow-color': '#38bdf8',
            'line-style': 'dashed',
            'opacity': 0.55,
            'width': 1.5,
        }
    },
    {
        selector: 'node:selected',
        style: {
            'border-width': 3,
            'border-color': '#fff',
            'overlay-color': '#fff',
            'overlay-opacity': 0.15,
            'z-index': 999
        }
    },
    {
        selector: 'node.impact-source',
        style: {
            'border-color': '#ef4444',
            'border-width': 4,
            'overlay-color': '#ef4444',
            'overlay-opacity': 0.2,
            'z-index': 1000,
        }
    },
    {
        selector: 'node.impact-callee',
        style: {
            'border-color': '#f59e0b',
            'border-width': 2,
            'overlay-color': '#f59e0b',
            'overlay-opacity': 0.1,
            'z-index': 900,
        }
    },
    {
        selector: 'node.impact-caller',
        style: {
            'border-color': '#3b82f6',
            'border-width': 2,
            'overlay-color': '#3b82f6',
            'overlay-opacity': 0.1,
            'z-index': 900,
        }
    },
    {
        selector: 'edge.impact-edge',
        style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            'width': 2,
            'opacity': 0.8,
            'z-index': 900,
        }
    },
    {
        selector: 'node.faded',
        style: { 'opacity': 0.1 }
    },
    {
        selector: 'edge.faded',
        style: { 'opacity': 0.03 }
    },
    {
        selector: 'node.search-match',
        style: {
            'border-color': '#22d3ee',
            'border-width': 3,
            'overlay-color': '#22d3ee',
            'overlay-opacity': 0.2,
            'z-index': 1000,
        }
    },
    {
        selector: 'node.search-focus',
        style: {
            'border-color': '#f8fafc',
            'border-width': 4,
            'overlay-color': '#22d3ee',
            'overlay-opacity': 0.2,
            'z-index': 1050,
        }
    },
    {
        selector: 'edge.search-edge',
        style: {
            'opacity': 0.75,
            'width': 2,
            'line-color': '#22d3ee',
            'target-arrow-color': '#22d3ee',
            'z-index': 920,
        }
    },
    // Filter visibility control
    {
        selector: '.filter-hidden',
        style: { 'display': 'none' }
    },
];
