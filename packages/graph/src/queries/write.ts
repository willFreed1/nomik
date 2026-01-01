import type { GraphDriver } from '../drivers/driver.interface.js';
import type { GraphNode, GraphEdge, ProjectNode } from '@nomik/core';

/** Upsert par lots avec UNWIND — chaque noeud reçoit le projectId */
export async function upsertNodes(driver: GraphDriver, nodes: GraphNode[], projectId: string): Promise<void> {
    const grouped = groupByType(nodes);
    for (const [type, batch] of Object.entries(grouped)) {
        const label = nodeTypeToLabel(type);
        const cypher = `
      UNWIND $batch AS item
      MERGE (n:${label} {id: item.id})
      ON CREATE SET n.createdAt = datetime()
      SET n += item.props, n.updatedAt = datetime(), n.projectId = $projectId
    `;
        const items = batch.map(n => ({ id: n.id, props: nodeToProps(n) }));
        await driver.runWrite(cypher, { batch: items, projectId });
    }
}

function groupByType(nodes: GraphNode[]): Record<string, GraphNode[]> {
    const map: Record<string, GraphNode[]> = {};
    for (const n of nodes) {
        (map[n.type] ??= []).push(n);
    }
    return map;
}

/** Creation d'edges par lots — chaque edge reçoit le projectId */
export async function createEdges(driver: GraphDriver, edges: GraphEdge[], projectId: string): Promise<void> {
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
      SET r += item.props, r.projectId = $projectId
    `;
        const items = batch.map(e => ({ sourceId: e.sourceId, targetId: e.targetId, edgeId: e.id, props: edgeToProps(e) }));
        await driver.runWrite(cypher, { batch: items, projectId });
    }
}

/** Supprime les donnees d'un fichier dans un projet specifique */
export async function clearFileData(driver: GraphDriver, filePath: string, projectId: string): Promise<void> {
    await driver.runWrite(
        `MATCH (f:File {path: $path, projectId: $projectId})-[:CONTAINS]->(n) DETACH DELETE n`,
        { path: filePath, projectId },
    );
    await driver.runWrite(
        `MATCH (f:File {path: $path, projectId: $projectId}) DETACH DELETE f`,
        { path: filePath, projectId },
    );
}

/** Purge les noeuds obsoletes d'un projet : fichiers qui ne sont plus dans le scan courant
 *  Typiquement : fichiers exclus (public/, .min.js), fichiers supprimes, fichiers renommes
 */
export async function purgeStaleFiles(
    driver: GraphDriver,
    currentFilePaths: string[],
    projectId: string,
): Promise<void> {
    // D'abord supprimer les noeuds CONTENUS par les fichiers obsoletes
    await driver.runWrite(
        `MATCH (f:File {projectId: $projectId})-[:CONTAINS]->(n)
         WHERE NOT f.path IN $currentPaths
         DETACH DELETE n`,
        { currentPaths: currentFilePaths, projectId },
    );
    // Puis les File nodes eux-memes
    await driver.runWrite(
        `MATCH (f:File {projectId: $projectId})
         WHERE NOT f.path IN $currentPaths
         DETACH DELETE f`,
        { currentPaths: currentFilePaths, projectId },
    );
}

/** Cree ou met a jour un noeud Project */
export async function upsertProject(driver: GraphDriver, project: ProjectNode): Promise<void> {
    await driver.runWrite(
        `MERGE (p:Project {id: $id})
         ON CREATE SET p.createdAt = datetime()
         SET p.name = $name, p.rootPath = $rootPath, p.updatedAt = datetime()`,
        { id: project.id, name: project.name, rootPath: project.rootPath },
    );
}

/** Supprime toutes les donnees d'un projet (noeuds + relations attachees) */
export async function deleteProjectData(driver: GraphDriver, projectId: string): Promise<void> {
    // DETACH DELETE supprime les noeuds ET leurs relations attachees en une seule passe
    await driver.runWrite(
        `MATCH (n {projectId: $projectId}) DETACH DELETE n`,
        { projectId },
    );
    // Le noeud Project a id = projectId (pas de propriete projectId sur lui-meme)
    await driver.runWrite(
        `MATCH (p:Project {id: $projectId}) DELETE p`,
        { projectId },
    );
}

/** Liste tous les projets */
export async function listProjects(driver: GraphDriver): Promise<ProjectNode[]> {
    return driver.runQuery<ProjectNode>(
        `MATCH (p:Project)
         RETURN p.id as id, 'project' as type, p.name as name, p.rootPath as rootPath,
                toString(p.createdAt) as createdAt, toString(p.updatedAt) as lastScanAt
         ORDER BY p.name`,
    );
}

/** Recupere un projet par ID */
export async function getProject(driver: GraphDriver, projectId: string): Promise<ProjectNode | null> {
    const results = await driver.runQuery<ProjectNode>(
        `MATCH (p:Project {id: $id})
         RETURN p.id as id, 'project' as type, p.name as name, p.rootPath as rootPath,
                toString(p.createdAt) as createdAt, toString(p.updatedAt) as lastScanAt`,
        { id: projectId },
    );
    return results[0] ?? null;
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
