import type { GraphDriver } from '../drivers/driver.interface.js';
import type { GraphNode, GraphEdge } from '@genome/core';

export async function upsertNode(driver: GraphDriver, node: GraphNode): Promise<void> {
    const label = nodeTypeToLabel(node.type);
    const cypher = `
    MERGE (n:${label} {id: $id})
    SET n += $props, n.updatedAt = datetime()
  `;
    await driver.runWrite(cypher, { id: node.id, props: nodeToProps(node) });
}

export async function upsertNodes(driver: GraphDriver, nodes: GraphNode[]): Promise<void> {
    for (const node of nodes) {
        await upsertNode(driver, node);
    }
}

export async function createEdge(driver: GraphDriver, edge: GraphEdge): Promise<void> {
    const cypher = `
    MATCH (a {id: $sourceId}), (b {id: $targetId})
    MERGE (a)-[r:${edge.type} {id: $edgeId}]->(b)
    SET r += $props
  `;
    await driver.runWrite(cypher, {
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        edgeId: edge.id,
        props: edgeToProps(edge),
    });
}

export async function createEdges(driver: GraphDriver, edges: GraphEdge[]): Promise<void> {
    for (const edge of edges) {
        await createEdge(driver, edge);
    }
}

export async function clearFileData(driver: GraphDriver, filePath: string): Promise<void> {
    await driver.runWrite(
        `MATCH (f:File {path: $path})-[:CONTAINS]->(n) DETACH DELETE n`,
        { path: filePath },
    );
    await driver.runWrite(
        `MATCH (f:File {path: $path}) DETACH DELETE f`,
        { path: filePath },
    );
}

function nodeTypeToLabel(type: string): string {
    const map: Record<string, string> = {
        file: 'File',
        function: 'Function',
        class: 'Class',
        variable: 'Variable',
        module: 'Module',
        route: 'Route',
        db_table: 'DBTable',
        external_api: 'ExternalAPI',
        cron_job: 'CronJob',
        event: 'Event',
        env_var: 'EnvVar',
    };
    return map[type] ?? 'Unknown';
}

function nodeToProps(node: GraphNode): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(node)) {
        if (key === 'id' || key === 'type') continue;
        if (Array.isArray(val)) {
            props[key] = JSON.stringify(val);
        } else if (val !== undefined && val !== null) {
            props[key] = val;
        }
    }
    return props;
}

function edgeToProps(edge: GraphEdge): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(edge)) {
        if (['id', 'type', 'sourceId', 'targetId'].includes(key)) continue;
        if (Array.isArray(val)) {
            props[key] = JSON.stringify(val);
        } else if (val !== undefined && val !== null) {
            props[key] = val;
        }
    }
    return props;
}
