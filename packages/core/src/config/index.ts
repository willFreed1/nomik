import { type GenomeConfig, genomeConfigSchema } from '../types/config.js';
import { ConfigError } from '../errors/index.js';

const CONFIG_FILENAMES = [
    'genome.config.ts',
    'genome.config.js',
    'genome.config.json',
];

export function defineConfig(config: Partial<GenomeConfig> & Pick<GenomeConfig, 'target'>): GenomeConfig {
    const result = genomeConfigSchema.safeParse(config);
    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ConfigError(`Invalid configuration: ${issues}`);
    }
    return result.data;
}

export function validateConfig(raw: unknown): GenomeConfig {
    const result = genomeConfigSchema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new ConfigError(`Invalid configuration: ${issues}`);
    }
    return result.data;
}

export function loadConfigFromEnv(): Partial<GenomeConfig> {
    const env = process.env;
    return {
        graph: {
            driver: (env['GENOME_GRAPH_DRIVER'] as 'neo4j' | 'falkordb') ?? 'neo4j',
            uri: env['GENOME_GRAPH_URI'] ?? 'bolt://localhost:7687',
            auth: {
                username: env['GENOME_GRAPH_USER'] ?? 'neo4j',
                password: env['GENOME_GRAPH_PASS'] ?? 'genome_local',
            },
            maxConnectionPoolSize: 50,
            connectionTimeoutMs: 5000,
        },
        log: {
            level: (env['GENOME_LOG_LEVEL'] as GenomeConfig['log']['level']) ?? 'info',
            pretty: true,
        },
        mcp: {
            transport: 'stdio' as const,
            port: env['GENOME_MCP_PORT'] ? parseInt(env['GENOME_MCP_PORT'], 10) : 3334,
        },
        viz: {
            port: env['GENOME_VIZ_PORT'] ? parseInt(env['GENOME_VIZ_PORT'], 10) : 3333,
            theme: 'dark' as const,
        },
    };
}

export { CONFIG_FILENAMES };
