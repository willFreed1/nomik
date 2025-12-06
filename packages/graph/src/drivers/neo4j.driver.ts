import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { type GraphConfig, GraphConnectionError, getLogger } from '@genome/core';
import type { GraphDriver } from './driver.interface.js';

export function createNeo4jDriver(config: GraphConfig): GraphDriver {
    const logger = getLogger();
    let driver: Driver | null = null;
    let connected = false;

    async function connect(): Promise<void> {
        try {
            driver = neo4j.driver(
                config.uri,
                neo4j.auth.basic(config.auth.username, config.auth.password),
                {
                    maxConnectionPoolSize: config.maxConnectionPoolSize,
                    connectionTimeout: config.connectionTimeoutMs,
                },
            );
            const info = await driver.getServerInfo();
            connected = true;
            logger.info({ address: info.address, version: info.protocolVersion }, 'neo4j connected');
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
        const session = getSession();
        try {
            const result = await session.run(cypher, params);
            return result.records.map((r) => r.toObject() as T);
        } finally {
            await session.close();
        }
    }

    async function runWrite(
        cypher: string,
        params: Record<string, unknown> = {},
    ): Promise<void> {
        const session = getSession();
        try {
            await session.executeWrite((tx) => tx.run(cypher, params));
        } finally {
            await session.close();
        }
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
