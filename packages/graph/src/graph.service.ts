import { type GraphConfig, getLogger } from '@genome/core';
import type { GraphNode, GraphEdge } from '@genome/core';
import { createNeo4jDriver } from './drivers/neo4j.driver.js';
import type { GraphDriver } from './drivers/driver.interface.js';
import { upsertNodes, createEdges, clearFileData } from './queries/write.js';
import { impactAnalysis, findDeadCode, findGodObjects, graphStats, findDependencyChain, recentChanges } from './queries/read.js';
import { initializeSchema } from './schema/init.js';
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

export function createGraphService(config: GraphConfig): GraphService {
    const logger = getLogger();
    const driver: GraphDriver = createNeo4jDriver(config);

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
            logger.debug({ filePath, nodes: nodes.length, edges: edges.length }, 'ingested file data');
        },

        async getImpact(symbolName: string, depth = 5) {
            return impactAnalysis(driver, symbolName, depth);
        },

        async getDeadCode() {
            return findDeadCode(driver);
        },

        async getGodObjects(threshold = 10) {
            return findGodObjects(driver, threshold);
        },

        async getStats() {
            return graphStats(driver);
        },

        async getDependencyChain(from: string, to: string) {
            return findDependencyChain(driver, from, to);
        },

        async getRecentChanges(since: string, limit = 50) {
            return recentChanges(driver, since, limit);
        },

        async healthCheck() {
            return driver.healthCheck();
        },

        async executeQuery<T>(query: string, params?: Record<string, any>) {
            return driver.runQuery<T>(query, params);
        },
    };
}
