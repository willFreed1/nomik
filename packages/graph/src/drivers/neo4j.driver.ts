import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { type GraphConfig, GraphConnectionError, getLogger } from '@nomik/core';
import type { GraphDriver } from './driver.interface.js';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

function isTransientNeo4jError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const anyErr = err as { code?: string; message?: string; name?: string };
    const code = String(anyErr.code ?? '');
    const msg = String(anyErr.message ?? '').toLowerCase();
    const name = String(anyErr.name ?? '').toLowerCase();
    return code.startsWith('Neo.TransientError')
        || code.includes('ServiceUnavailable')
        || code.includes('SessionExpired')
        || msg.includes('connection')
        || msg.includes('timeout')
        || msg.includes('service unavailable')
        || msg.includes('session expired')
        || name.includes('serviceunavailable')
        || name.includes('sessionexpired');
}

/** Retry avec backoff exponentiel pour les erreurs transientes Neo4j */
async function withRetry<T>(fn: () => Promise<T>, label: string, logger: ReturnType<typeof getLogger>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const isTransient = isTransientNeo4jError(err);
            if (!isTransient || attempt === MAX_RETRIES - 1) throw lastError;
            const delay = RETRY_BASE_MS * Math.pow(2, attempt);
            logger.warn({ attempt: attempt + 1, delay, label, error: lastError.message }, 'neo4j retry');
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

export function createNeo4jDriver(config: GraphConfig): GraphDriver {
    const logger = getLogger();
    let driver: Driver | null = null;
    let connected = false;

    async function connect(): Promise<void> {
        try {
            await withRetry(async () => {
                if (driver) {
                    await driver.close();
                    driver = null;
                }
                const nextDriver = neo4j.driver(
                    config.uri,
                    neo4j.auth.basic(config.auth.username, config.auth.password),
                    {
                        maxConnectionPoolSize: config.maxConnectionPoolSize,
                        connectionTimeout: config.connectionTimeoutMs,
                    },
                );
                const info = await nextDriver.getServerInfo();
                driver = nextDriver;
                connected = true;
                logger.info({ address: info.address, version: info.protocolVersion }, 'neo4j connected');
            }, 'connect', logger);
        } catch (err) {
            throw new GraphConnectionError(
                `Failed to connect to Neo4j at ${config.uri}: ${err instanceof Error ? err.message : String(err)}`,
                config.uri,
            );
        }
    }

    async function disconnect(): Promise<void> {
        if (driver) {
            await driver.close();
            connected = false;
            logger.info('neo4j disconnected');
        }
    }

    function getSession(): Session {
        if (!driver) throw new GraphConnectionError('Not connected to Neo4j', config.uri);
        return driver.session();
    }

    function isConnected(): boolean {
        return connected;
    }

    async function runQuery<T = unknown>(
        cypher: string,
        params: Record<string, unknown> = {},
    ): Promise<T[]> {
        return withRetry(async () => {
            const session = getSession();
            try {
                const result = await session.run(cypher, params);
                return result.records.map((r) => r.toObject() as T);
            } finally {
                await session.close();
            }
        }, 'runQuery', logger);
    }

    async function runWrite(
        cypher: string,
        params: Record<string, unknown> = {},
    ): Promise<void> {
        return withRetry(async () => {
            const session = getSession();
            try {
                await session.executeWrite((tx) => tx.run(cypher, params));
            } finally {
                await session.close();
            }
        }, 'runWrite', logger);
    }

    async function healthCheck(): Promise<boolean> {
        try {
            if (!driver) return false;
            await driver.getServerInfo();
            return true;
        } catch {
            return false;
        }
    }

    return { connect, disconnect, getSession, isConnected, runQuery, runWrite, healthCheck };
}
