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
            'border-color': '#06b6d4',
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
            'border-color': '#10b981',
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
            'border-color': '#a855f7',
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
            'opacity': 0.4,
        }
    },
    // CALLS : edges amber
    {
        selector: 'edge[label="CALLS"]',
        style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            'line-style': 'solid',
            'opacity': 0.5,
            'width': 1.5,
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
];
