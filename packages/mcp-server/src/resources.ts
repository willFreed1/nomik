import type { GraphService } from '@nomik/graph';
import { NomikError } from '@nomik/core';

export async function handleListResources(_graph: GraphService) {
    return [
        {
            uri: 'nomik://stats',
            name: 'Graph Statistics',
            mimeType: 'application/json',
            description: 'Current counts of nodes and edges in the graph',
        },
    ];
}

export async function handleReadResource(graph: GraphService, uri: string) {
    if (uri === 'nomik://stats') {
        const stats = await graph.getStats();
        return [
            {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(stats, null, 2),
            },
        ];
    }

    throw new NomikError(`Resource not found: ${uri}`, 'NOT_FOUND', 'medium', true);
}
