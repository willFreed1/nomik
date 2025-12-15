import { describe, it, expect } from 'vitest';
import { defineConfig, validateConfig, loadConfigFromEnv } from '../config/index.js';

describe('defineConfig', () => {
    it('retourne une config valide avec les valeurs par defaut', () => {
        const config = defineConfig({ target: { root: '/tmp/project' } });

        expect(config.target.root).toBe('/tmp/project');
        expect(config.graph.driver).toBe('neo4j');
        expect(config.graph.uri).toBe('bolt://localhost:7687');
        expect(config.graph.auth.username).toBe('neo4j');
        expect(config.log.level).toBe('info');
        expect(config.mcp.transport).toBe('stdio');
    });

    it('accepte un override partiel', () => {
        const config = defineConfig({
            target: { root: '/tmp/project' },
            graph: { uri: 'bolt://custom:7687' },
        });

        expect(config.graph.uri).toBe('bolt://custom:7687');
        expect(config.graph.driver).toBe('neo4j');
    });

    it('lance ConfigError si target est absent', () => {
        expect(() => validateConfig({})).toThrow('Invalid configuration');
        expect(() => validateConfig({})).toThrow('target');
    });

    it('lance ConfigError si root est vide', () => {
        expect(() => defineConfig({ target: { root: '' } })).not.toThrow();
    });
});

describe('validateConfig', () => {
    it('valide et retourne une config complete', () => {
        const config = validateConfig({
            target: { root: './src' },
        });

        expect(config.target.root).toBe('./src');
        expect(config.target.include).toContain('**/*.ts');
        expect(config.target.exclude).toContain('**/node_modules/**');
    });

    it('rejette un driver invalide', () => {
        expect(() =>
            validateConfig({
                target: { root: '.' },
                graph: { driver: 'invalid_db' },
            }),
        ).toThrow('Invalid configuration');
    });

    it('rejette un port negatif', () => {
        expect(() =>
            validateConfig({
                target: { root: '.' },
                mcp: { port: -1 },
            }),
        ).toThrow('Invalid configuration');
    });
});

describe('loadConfigFromEnv', () => {
    it('retourne les valeurs par defaut sans variables env', () => {
        const config = loadConfigFromEnv();

        expect(config.graph).toBeDefined();
        expect(config.graph!.driver).toBe('neo4j');
        expect(config.graph!.uri).toBe('bolt://localhost:7687');
        expect(config.log!.level).toBe('info');
    });

    it('lit GENOME_GRAPH_URI depuis env', () => {
        const original = process.env['GENOME_GRAPH_URI'];
        process.env['GENOME_GRAPH_URI'] = 'bolt://custom:9999';

        const config = loadConfigFromEnv();
        expect(config.graph!.uri).toBe('bolt://custom:9999');

        if (original) process.env['GENOME_GRAPH_URI'] = original;
        else delete process.env['GENOME_GRAPH_URI'];
    });
});
