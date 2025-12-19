import { type GraphConfig, getLogger } from '@genome/core';
import type { GraphNode, GraphEdge, ProjectNode } from '@genome/core';
import { createNeo4jDriver } from './drivers/neo4j.driver.js';
import type { GraphDriver } from './drivers/driver.interface.js';
import { upsertNodes, createEdges, clearFileData, upsertProject, deleteProjectData, listProjects, getProject } from './queries/write.js';
import { impactAnalysis, findDeadCode, findGodObjects, graphStats, findDependencyChain, recentChanges } from './queries/read.js';
import { initializeSchema } from './schema/init.js';
import { QueryCache } from './cache.js';
import type { ImpactResult } from './queries/read.js';

export interface GraphService {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    initSchema(): Promise<void>;
    ingestFileData(nodes: GraphNode[], edges: GraphEdge[], filePath: string, projectId: string): Promise<void>;
    getImpact(symbolName: string, depth?: number, projectId?: string): Promise<ImpactResult[]>;
    getDeadCode(projectId?: string): Promise<Array<{ name: string; filePath: string }>>;
    getGodObjects(threshold?: number, projectId?: string): Promise<Array<{ name: string; filePath: string; depCount: number }>>;
    getStats(projectId?: string): Promise<{ nodeCount: number; edgeCount: number; fileCount: number; functionCount: number; classCount: number; routeCount: number }>;
    getDependencyChain(from: string, to: string, projectId?: string): Promise<string[][]>;
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

        async getImpact(symbolName: string, depth = 5, projectId?: string) {
            return cached(`impact:${projectId}:${symbolName}:${depth}`, () => impactAnalysis(driver, symbolName, depth, projectId));
        },

        async getDeadCode(projectId?: string) {
            return cached(`deadCode:${projectId}`, () => findDeadCode(driver, projectId));
        },

        async getGodObjects(threshold = 10, projectId?: string) {
            return cached(`godObjects:${projectId}:${threshold}`, () => findGodObjects(driver, threshold, projectId));
        },

        async getStats(projectId?: string) {
            return cached(`stats:${projectId}`, () => graphStats(driver, projectId));
        },

        async getDependencyChain(from: string, to: string, projectId?: string) {
            return cached(`depChain:${projectId}:${from}:${to}`, () => findDependencyChain(driver, from, to, projectId));
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
