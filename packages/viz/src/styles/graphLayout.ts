/** Parametres du layout force-directed (cose) — optimise pour lisibilite */
export const graphLayout = {
    name: 'cose',
    nodeRepulsion: (_node: any) => 12000,
    idealEdgeLength: (_edge: any) => 50,
    edgeElasticity: (_edge: any) => 100,
    nestingFactor: 1.2,
    gravity: 1.5,
    numIter: 2000,
    initialTemp: 400,
    coolingFactor: 0.97,
    minTemp: 1.0,
    randomize: true,
    componentSpacing: 60,
    nodeDimensionsIncludeLabels: true,
    fit: true,
    padding: 40,
};
