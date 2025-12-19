import type { GraphDriver } from './driver.interface.js';

/** Wrapper qui injecte automatiquement projectId dans tous les params de requete */
export function createScopedDriver(driver: GraphDriver, projectId: string): GraphDriver {
    return {
        connect: () => driver.connect(),
        disconnect: () => driver.disconnect(),
        getSession: () => driver.getSession(),
        isConnected: () => driver.isConnected(),
        healthCheck: () => driver.healthCheck(),
        async runQuery<T = unknown>(cypher: string, params?: Record<string, unknown>): Promise<T[]> {
            return driver.runQuery<T>(cypher, { ...params, projectId });
        },
        async runWrite(cypher: string, params?: Record<string, unknown>): Promise<void> {
            return driver.runWrite(cypher, { ...params, projectId });
        },
    };
}
