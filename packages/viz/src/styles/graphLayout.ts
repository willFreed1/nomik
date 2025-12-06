/** Parametres du layout force-directed (cose) — densite optimisee */
export const graphLayout = {
    name: 'cose',
    nodeRepulsion: (_node: any) => 45000,
    idealEdgeLength: (_edge: any) => 80,
    edgeElasticity: (_edge: any) => 64,
    nestingFactor: 1.2,
    gravity: 0.8,
    numIter: 1500,
    initialTemp: 600,
    coolingFactor: 0.98,
    minTemp: 1.0,
    randomize: true,
    componentSpacing: 40,
    nodeDimensionsIncludeLabels: true,
    fit: true,
    padding: 30,
};
