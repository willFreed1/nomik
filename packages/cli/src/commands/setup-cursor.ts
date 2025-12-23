import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Command } from 'commander';
import { createLogger, setLogger } from '@genome/core';
import { readProjectConfig } from '../utils/project-config.js';

/** Detecte le chemin du MCP server (installe globalement ou local) */
function findMcpServerPath(): string {
    // Cas 1 : install locale (monorepo dev)
    const localPath = path.resolve('packages', 'mcp-server', 'dist', 'index.js');
    if (fs.existsSync(localPath)) return localPath;

    // Cas 2 : installe via npm global — le MCP server est dans le meme package
    const cliDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
    const bundledMcp = path.resolve(cliDir, '..', 'mcp-server', 'index.js');
    if (fs.existsSync(bundledMcp)) return bundledMcp;

    // Cas 3 : fallback — cherche dans node_modules
    try {
        const resolved = import.meta.resolve?.('@genome/mcp-server');
        if (resolved) return new URL(resolved).pathname.replace(/^\/([A-Z]:)/, '$1');
    } catch { /* ignore */ }

    return localPath;
}

/** Commande setup-cursor : configure automatiquement .cursor/mcp.json */
export const setupCursorCommand = new Command('setup-cursor')
    .description('Auto-configure Cursor IDE to use GENOME MCP server')
    .option('--global', 'Configure globally for all projects (user-level)')
    .option('--graph-uri <uri>', 'Neo4j URI', 'bolt://localhost:7687')
    .option('--graph-user <user>', 'Neo4j username', 'neo4j')
    .option('--graph-pass <pass>', 'Neo4j password', 'genome_local')
    .action(async (opts: { global?: boolean; graphUri: string; graphUser: string; graphPass: string }) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);

        const mcpPath = findMcpServerPath();

        const local = readProjectConfig();
        const envBlock: Record<string, string> = {
            GENOME_GRAPH_URI: opts.graphUri,
            GENOME_GRAPH_USER: opts.graphUser,
            GENOME_GRAPH_PASS: opts.graphPass,
        };
        if (local?.projectId) {
            envBlock.GENOME_PROJECT_ID = local.projectId;
        }

        const config = {
            mcpServers: {
                genome: {
                    command: 'node',
                    args: [mcpPath],
                    env: envBlock,
                },
            },
        };

        // Determiner le chemin de config
        let configDir: string;
        let configPath: string;

        if (opts.global) {
            // Config globale Cursor (user-level)
            const home = os.homedir();
            const platform = process.platform;
            if (platform === 'win32') {
                configDir = path.join(home, 'AppData', 'Roaming', 'Cursor', 'User');
            } else if (platform === 'darwin') {
                configDir = path.join(home, 'Library', 'Application Support', 'Cursor', 'User');
            } else {
                configDir = path.join(home, '.config', 'Cursor', 'User');
            }
            configPath = path.join(configDir, 'globalStorage', 'mcp.json');
            configDir = path.dirname(configPath);
        } else {
            // Config projet-local
            configDir = path.resolve('.cursor');
            configPath = path.join(configDir, 'mcp.json');
        }

        // Creer le dossier si necessaire
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // Merge avec config existante si elle existe
        let existing: Record<string, any> = {};
        if (fs.existsSync(configPath)) {
            try {
                existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                logger.info({ path: configPath }, 'existing MCP config found, merging');
            } catch {
                logger.warn('existing mcp.json is invalid, overwriting');
            }
        }

        // Merge : garder les autres serveurs MCP, ajouter/remplacer genome
        const merged = {
            ...existing,
            mcpServers: {
                ...(existing.mcpServers ?? {}),
                ...config.mcpServers,
            },
        };

        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

        console.log('');
        console.log('  \x1b[36m\x1b[1mGENOME MCP configured for Cursor!\x1b[0m');
        console.log('');
        console.log(`  Config written to: \x1b[33m${configPath}\x1b[0m`);
        console.log(`  MCP server:        \x1b[33m${mcpPath}\x1b[0m`);
        console.log(`  Neo4j:             \x1b[33m${opts.graphUri}\x1b[0m`);
        console.log('');
        console.log('  \x1b[2mRestart Cursor to activate. The AI can now use:\x1b[0m');
        console.log('  \x1b[2m  - kb_search, kb_impact, kb_get_context\x1b[0m');
        console.log('  \x1b[2m  - kb_graph_stats, kb_find_path, kb_recent_changes\x1b[0m');
        console.log('');
    });
