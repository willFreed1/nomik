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
            'font-size': '12px', // Larger base font
            'font-family': 'monospace',
            'width': 20,
            'height': 20,
            'border-width': 1,
            'border-color': '#475569',
            'overlay-padding': '4px',
            'z-index': 10,
            'text-background-color': '#020617',
            'text-background-opacity': 0.7,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle'
        }
    },
    // FILE NODES: The "Cities" of our map (Visual Anchors)
    {
        selector: 'node[label="File"]',
        style: {
            'background-color': '#0f172a',
            'border-color': '#06b6d4', // Cyan 500
            'border-width': 2,
            'shadow-blur': 30, // Strong glow
            'shadow-color': '#06b6d4',
            'color': '#22d3ee', // Cyan 400
            'shape': 'round-rectangle',
            'width': 'label',
            'height': 32, // Taller
            'padding': '12px', // More padding
            'font-size': '14px', // Larger font for files
            'font-weight': 'bold',
            'text-valign': 'center',
            'text-margin-y': 0,
            'z-index': 20 // Always on top
        }
    },
    // FUNCTION NODES: The "Streets" (Details)
    {
        selector: 'node[label="Function"]',
        style: {
            'background-color': '#0f172a',
            'border-color': '#10b981', // Emerald 500
            'shadow-blur': 10,
            'shadow-color': '#10b981',
            'color': '#86efac', // Emerald 300 (lighter text)
            'width': 12, // Much smaller
            'height': 12,
            'font-size': '10px' // Smaller font
        }
    },
    // CLASS NODES: The "Landmarks"
    {
        selector: 'node[label="Class"]',
        style: {
            'background-color': '#0f172a',
            'border-color': '#a855f7', // Purple 500
            'shadow-blur': 20,
            'shadow-color': '#a855f7',
            'color': '#d8b4fe', // Purple 300
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
            'line-color': '#334155', // Slate 700
            'target-arrow-color': '#334155',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            'opacity': 0.4 // Reduced opacity to reduce clutter
            // 'label': 'data(label)', // HIDDEN by default to reduce clutter
        }
    },
    // CALLS edges
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
            'shadow-blur': 40,
            'shadow-color': '#fff',
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
    // Impact highlight : noeuds impactes
    {
        selector: 'node.impact-source',
        style: {
            'border-color': '#ef4444',
            'border-width': 4,
            'shadow-blur': 50,
            'shadow-color': '#ef4444',
            'z-index': 1000,
        }
    },
    {
        selector: 'node.impact-callee',
        style: {
            'border-color': '#f59e0b',
            'border-width': 3,
            'shadow-blur': 30,
            'shadow-color': '#f59e0b',
            'z-index': 900,
        }
    },
    {
        selector: 'node.impact-caller',
        style: {
            'border-color': '#3b82f6',
            'border-width': 3,
            'shadow-blur': 30,
            'shadow-color': '#3b82f6',
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
    // Search highlight
    {
        selector: 'node.search-match',
        style: {
            'border-color': '#22d3ee',
            'border-width': 4,
            'shadow-blur': 40,
            'shadow-color': '#22d3ee',
            'z-index': 1000,
        }
    },
];
