import { type GraphConfig, getLogger } from '@genome/core';
import type { GraphNode, GraphEdge } from '@genome/core';
import { createNeo4jDriver } from './drivers/neo4j.driver.js';
import type { GraphDriver } from './drivers/driver.interface.js';
import { upsertNodes, createEdges, clearFileData } from './queries/write.js';
import { impactAnalysis, findDeadCode, findGodObjects, graphStats, findDependencyChain, recentChanges } from './queries/read.js';
import { initializeSchema } from './schema/init.js';
import { QueryCache } from './cache.js';
import type { ImpactResult } from './queries/read.js';

export interface GraphService {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    initSchema(): Promise<void>;
    ingestFileData(nodes: GraphNode[], edges: GraphEdge[], filePath: string): Promise<void>;
    getImpact(symbolName: string, depth?: number): Promise<ImpactResult[]>;
    getDeadCode(): Promise<Array<{ name: string; filePath: string }>>;
    getGodObjects(threshold?: number): Promise<Array<{ name: string; filePath: string; depCount: number }>>;
    getStats(): Promise<{ nodeCount: number; edgeCount: number; fileCount: number; functionCount: number; classCount: number; routeCount: number }>;
    getDependencyChain(from: string, to: string): Promise<string[][]>;
    getRecentChanges(since: string, limit?: number): Promise<Array<{ name: string; type: string; filePath: string; updatedAt: string; createdAt: string | null }>>;
    healthCheck(): Promise<boolean>;
    executeQuery<T>(query: string, params?: Record<string, any>): Promise<T[]>;
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

        async ingestFileData(nodes: GraphNode[], edges: GraphEdge[], filePath: string) {
            await clearFileData(driver, filePath);
            await upsertNodes(driver, nodes);
            await createEdges(driver, edges);
            // Invalide le cache apres une ecriture
            cache.invalidateAll();
            logger.debug({ filePath, nodes: nodes.length, edges: edges.length }, 'ingested file data');
        },

        async getImpact(symbolName: string, depth = 5) {
            return cached(`impact:${symbolName}:${depth}`, () => impactAnalysis(driver, symbolName, depth));
        },

        async getDeadCode() {
            return cached('deadCode', () => findDeadCode(driver));
        },

        async getGodObjects(threshold = 10) {
            return cached(`godObjects:${threshold}`, () => findGodObjects(driver, threshold));
        },

        async getStats() {
            return cached('stats', () => graphStats(driver));
        },

        async getDependencyChain(from: string, to: string) {
            return cached(`depChain:${from}:${to}`, () => findDependencyChain(driver, from, to));
        },

        async getRecentChanges(since: string, limit = 50) {
            return cached(`recent:${since}:${limit}`, () => recentChanges(driver, since, limit));
        },

        async healthCheck() {
            return driver.healthCheck();
        },

        async executeQuery<T>(query: string, params?: Record<string, any>) {
            return driver.runQuery<T>(query, params);
        },
    };
}
