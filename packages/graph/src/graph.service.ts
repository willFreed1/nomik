import { type GraphConfig, getLogger } from '@genome/core';
import type { GraphNode, GraphEdge, ProjectNode } from '@genome/core';
import { createNeo4jDriver } from './drivers/neo4j.driver.js';
import type { GraphDriver } from './drivers/driver.interface.js';
import { upsertNodes, createEdges, clearFileData, upsertProject, deleteProjectData, listProjects, getProject } from './queries/write.js';
import { impactAnalysis, findDeadCode, findGodObjects, graphStats, findDependencyChain, findDetailedPath, recentChanges } from './queries/read.js';
import { initializeSchema } from './schema/init.js';
import { QueryCache } from './cache.js';
import type { ImpactResult, DetailedPath } from './queries/read.js';

export interface ParseResult {
    file: { id: string; path: string; language: string; hash: string; size: number; lastParsed: string; type: 'file' };
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface GraphService {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    initSchema(): Promise<void>;
    /** @deprecated Utilisez ingestBatch pour preserver les edges cross-fichier */
    ingestFileData(nodes: GraphNode[], edges: GraphEdge[], filePath: string, projectId: string): Promise<void>;
    /** Ingestion 3-phases : clear → upsert → edges (preserve les edges cross-fichier) */
    ingestBatch(results: ParseResult[], projectId: string): Promise<void>;
    getImpact(symbolName: string, depth?: number, projectId?: string): Promise<ImpactResult[]>;
    getDeadCode(projectId?: string): Promise<Array<{ name: string; filePath: string }>>;
    getGodObjects(threshold?: number, projectId?: string): Promise<Array<{ name: string; filePath: string; depCount: number }>>;
    getStats(projectId?: string): Promise<{ nodeCount: number; edgeCount: number; fileCount: number; functionCount: number; classCount: number; routeCount: number }>;
    getDependencyChain(from: string, to: string, projectId?: string): Promise<string[][]>;
    getDetailedPath(from: string, to: string, projectId?: string): Promise<DetailedPath[]>;
    getRecentChanges(since: string, limit?: number, projectId?: string): Promise<Array<{ name: string; type: string; filePath: string; updatedAt: string; createdAt: string | null }>>;
    healthCheck(): Promise<boolean>;
    executeQuery<T>(query: string, params?: Record<string, any>): Promise<T[]>;
    // Gestion des projets
    createProject(project: ProjectNode): Promise<void>;
    listProjects(): Promise<ProjectNode[]>;
    getProject(projectId: string): Promise<ProjectNode | null>;
    deleteProject(projectId: string): Promise<void>;
}

/** Cree un service graph avec cache TTL sur les lectures */
export function createGraphService(config: GraphConfig): GraphService {
    const logger = getLogger();
    const driver: GraphDriver = createNeo4jDriver(config);
    const cache = new QueryCache(30_000, 200);

    /** Helper cache : retourne le cache si dispo, sinon execute et stocke */
    async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const hit = cache.get<T>(key);
        if (hit !== undefined) {
            logger.debug({ cacheKey: key }, 'cache hit');
            return hit;
        }
        const result = await fn();
        cache.set(key, result);
        return result;
    }

    return {
        async connect() {
            await driver.connect();
        },

        async disconnect() {
            await driver.disconnect();
        },

        async initSchema() {
            await initializeSchema(driver);
            logger.info('graph schema initialized');
        },

        async ingestFileData(nodes: GraphNode[], edges: GraphEdge[], filePath: string, projectId: string) {
            await clearFileData(driver, filePath, projectId);
            await upsertNodes(driver, nodes, projectId);
            await createEdges(driver, edges, projectId);
            cache.invalidateAll();
            logger.debug({ filePath, projectId, nodes: nodes.length, edges: edges.length }, 'ingested file data');
        },

        async ingestBatch(results, projectId: string) {
            // Phase 1 : Supprimer les anciennes donnees de TOUS les fichiers d'abord
            for (const r of results) {
                await clearFileData(driver, r.file.path, projectId);
            }
            // Phase 2 : Creer TOUS les noeuds (result.nodes inclut deja le FileNode)
            for (const r of results) {
                await upsertNodes(driver, r.nodes, projectId);
            }
            // Phase 3 : Creer TOUTES les edges (intra + cross-fichier preservees)
            const allEdges: GraphEdge[] = [];
            for (const r of results) {
                allEdges.push(...r.edges);
            }
            await createEdges(driver, allEdges, projectId);
            cache.invalidateAll();
            logger.info({ files: results.length, edges: allEdges.length }, 'batch ingestion complete (3-phase)');
        },

        async getImpact(symbolName: string, depth = 5, projectId?: string) {
            return cached(`impact:${projectId}:${symbolName}:${depth}`, () => impactAnalysis(driver, symbolName, depth, projectId));
        },

        async getDeadCode(projectId?: string) {
            return cached(`deadCode:${projectId}`, () => findDeadCode(driver, projectId));
        },

        async getGodObjects(threshold = 15, projectId?: string) {
            return cached(`godObjects:${projectId}:${threshold}`, () => findGodObjects(driver, threshold, projectId));
        },

        async getStats(projectId?: string) {
            return cached(`stats:${projectId}`, () => graphStats(driver, projectId));
        },

        async getDependencyChain(from: string, to: string, projectId?: string) {
            return cached(`depChain:${projectId}:${from}:${to}`, () => findDependencyChain(driver, from, to, projectId));
        },

        async getDetailedPath(from: string, to: string, projectId?: string) {
            return cached(`detailedPath:${projectId}:${from}:${to}`, () => findDetailedPath(driver, from, to, projectId));
        },

        async getRecentChanges(since: string, limit = 50, projectId?: string) {
            return cached(`recent:${projectId}:${since}:${limit}`, () => recentChanges(driver, since, limit, projectId));
        },

        async healthCheck() {
            return driver.healthCheck();
        },

        async executeQuery<T>(query: string, params?: Record<string, any>) {
            return driver.runQuery<T>(query, params);
        },

        // Gestion des projets
        async createProject(project: ProjectNode) {
            await upsertProject(driver, project);
            cache.invalidateAll();
            logger.info({ projectId: project.id, name: project.name }, 'project created');
        },

        async listProjects() {
            return cached('projects:list', () => listProjects(driver));
        },

        async getProject(projectId: string) {
            return getProject(driver, projectId);
        },

        async deleteProject(projectId: string) {
            await deleteProjectData(driver, projectId);
            cache.invalidateAll();
            logger.info({ projectId }, 'project deleted');
        },
    };
}
