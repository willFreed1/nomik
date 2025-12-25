import { type NomikConfig, nomikConfigSchema } from '../types/config.js';
import { ConfigError } from '../errors/index.js';

const CONFIG_FILENAMES = [
    'nomik.config.ts',
    'nomik.config.js',
    'nomik.config.json',
];

export function defineConfig(config: Partial<NomikConfig> & Pick<NomikConfig, 'target'>): NomikConfig {
    const result = nomikConfigSchema.safeParse(config);
    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ConfigError(`Invalid configuration: ${issues}`);
    }
    return result.data;
}

export function validateConfig(raw: unknown): NomikConfig {
    const result = nomikConfigSchema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ConfigError(`Invalid configuration: ${issues}`);
    }
    return result.data;
}

export function loadConfigFromEnv(): Partial<NomikConfig> {
    const env = process.env;
    return {
        graph: {
            driver: (env['NOMIK_GRAPH_DRIVER'] as 'neo4j' | 'falkordb') ?? 'neo4j',
            uri: env['NOMIK_GRAPH_URI'] ?? 'bolt://localhost:7687',
            auth: {
                username: env['NOMIK_GRAPH_USER'] ?? 'neo4j',
                password: env['NOMIK_GRAPH_PASS'] ?? 'nomik_local',
            },
            maxConnectionPoolSize: 50,
            connectionTimeoutMs: 5000,
        },
        log: {
            level: (env['NOMIK_LOG_LEVEL'] as NomikConfig['log']['level']) ?? 'info',
            pretty: true,
        },
        mcp: {
            transport: 'stdio' as const,
            port: env['NOMIK_MCP_PORT'] ? parseInt(env['NOMIK_MCP_PORT'], 10) : 3334,
        },
        viz: {
            port: env['NOMIK_VIZ_PORT'] ? parseInt(env['NOMIK_VIZ_PORT'], 10) : 3333,
            theme: 'dark' as const,
        },
    };
}

export { CONFIG_FILENAMES };
