import type { GraphDriver } from '../drivers/driver.interface.js';
import type { GraphNode, GraphEdge } from '@genome/core';

export async function upsertNode(driver: GraphDriver, node: GraphNode): Promise<void> {
    const label = nodeTypeToLabel(node.type);
    const cypher = `
    MERGE (n:${label} {id: $id})
    ON CREATE SET n.createdAt = datetime()
    SET n += $props, n.updatedAt = datetime()
  `;
    await driver.runWrite(cypher, { id: node.id, props: nodeToProps(node) });
}

/** Upsert par lots avec UNWIND pour la performance */
export async function upsertNodes(driver: GraphDriver, nodes: GraphNode[]): Promise<void> {
    const grouped = groupByType(nodes);
    for (const [type, batch] of Object.entries(grouped)) {
        const label = nodeTypeToLabel(type);
        const cypher = `
      UNWIND $batch AS item
      MERGE (n:${label} {id: item.id})
      ON CREATE SET n.createdAt = datetime()
      SET n += item.props, n.updatedAt = datetime()
    `;
        const items = batch.map(n => ({ id: n.id, props: nodeToProps(n) }));
        await driver.runWrite(cypher, { batch: items });
    }
}

function groupByType(nodes: GraphNode[]): Record<string, GraphNode[]> {
    const map: Record<string, GraphNode[]> = {};
    for (const n of nodes) {
        (map[n.type] ??= []).push(n);
    }
    return map;
}

export async function createEdge(driver: GraphDriver, edge: GraphEdge): Promise<void> {
    const cypher = `
    MATCH (a {id: $sourceId}), (b {id: $targetId})
    MERGE (a)-[r:${edge.type} {id: $edgeId}]->(b)
    ON CREATE SET r.createdAt = datetime()
    SET r += $props
  `;
    await driver.runWrite(cypher, {
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        edgeId: edge.id,
        props: edgeToProps(edge),
    });
}

/** Création d'edges par lots groupés par type de relation */
export async function createEdges(driver: GraphDriver, edges: GraphEdge[]): Promise<void> {
    const grouped: Record<string, GraphEdge[]> = {};
    for (const e of edges) {
        (grouped[e.type] ??= []).push(e);
    }
    for (const [relType, batch] of Object.entries(grouped)) {
        const cypher = `
      UNWIND $batch AS item
      MATCH (a {id: item.sourceId}), (b {id: item.targetId})
      MERGE (a)-[r:${relType} {id: item.edgeId}]->(b)
      ON CREATE SET r.createdAt = datetime()
      SET r += item.props
    `;
        const items = batch.map(e => ({ sourceId: e.sourceId, targetId: e.targetId, edgeId: e.id, props: edgeToProps(e) }));
        await driver.runWrite(cypher, { batch: items });
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
