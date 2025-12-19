import { Command } from 'commander';
import { loadConfigFromEnv, validateConfig, createLogger, setLogger } from '@genome/core';
import { createParserEngine } from '@genome/parser';
import { createGraphService } from '@genome/graph';
import { createWatcher } from '@genome/watcher';
import { readProjectConfig, defaultProjectName, createProjectNode } from '../utils/project-config.js';

/** Commande watch : surveille les fichiers et met a jour le graphe en temps reel */
export const watchCommand = new Command('watch')
    .description('Watch files and incrementally update the graph')
    .argument('[path]', 'Root directory to watch', '.')
    .option('-d, --debounce <ms>', 'Debounce delay in ms', '500')
    .action(async (targetPath: string, opts: { debounce: string }) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);

        const config = loadConfigFromEnv();
        const fullConfig = validateConfig({
            ...config,
            target: { root: targetPath, include: ['**/*'], exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'] },
        });

        const graph = createGraphService(fullConfig.graph);
        await graph.connect();
        logger.info('Connected to Neo4j');

        const local = readProjectConfig();
        const projectId = local?.projectId ?? createProjectNode(defaultProjectName()).id;

        const parser = createParserEngine();
        const watcher = createWatcher(
            { root: fullConfig.target.root, debounceMs: Number(opts.debounce), projectId },
            parser,
            graph,
        );

        await watcher.start();
        logger.info('Watching for changes... Press Ctrl+C to stop.');

        process.on('SIGINT', async () => {
            await watcher.stop();
            await graph.disconnect();
            process.exit(0);
        });
    });
