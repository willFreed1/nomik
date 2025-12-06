import { Command } from 'commander';
import { createLogger, loadConfigFromEnv, validateConfig } from '@genome/core';
import { createParserEngine, discoverFiles } from '@genome/parser';
import { createGraphService } from '@genome/graph';

export const scanCommand = new Command('scan')
    .description('Parse and index a codebase into the GENOME knowledge graph')
    .argument('<path>', 'Path to the project root')
    .option('--language <lang>', 'Language to parse', 'typescript')
    .action(async (targetPath: string, _opts: { language: string }) => {
        const logger = createLogger({ level: 'info', pretty: true });
        const envConfig = loadConfigFromEnv();
        const config = validateConfig({
            ...envConfig,
            target: {
                root: targetPath,
                include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
                exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.*'],
            },
        });

        logger.info({ path: targetPath }, 'GENOME — Scanning target');

        const files = await discoverFiles(config.target);
        logger.info({ count: files.length }, 'Files discovered');

        if (files.length === 0) {
            logger.warn('No supported files found');
            return;
        }

        const parser = createParserEngine();
        const results = await parser.parseFiles(files);

        const totalNodes = results.reduce((sum, r) => sum + r.nodes.length, 0);
        const totalEdges = results.reduce((sum, r) => sum + r.edges.length, 0);
        logger.info({
            files: results.length,
            nodes: totalNodes,
            edges: totalEdges
        }, 'Parsing complete');

        const graph = createGraphService(config.graph);

        try {
            await graph.connect();
            await graph.initSchema();

            for (const result of results) {
                await graph.ingestFileData(result.nodes, result.edges, result.file.path);
            }

            const stats = await graph.getStats();
            logger.info({
                nodes: stats.nodeCount,
                edges: stats.edgeCount,
                files: stats.fileCount,
                functions: stats.functionCount,
                classes: stats.classCount,
                routes: stats.routeCount
            }, 'Graph sync complete');

        } catch (err) {
            if (err instanceof Error && err.message.includes('connect')) {
                logger.error('Cannot connect to Neo4j. Is it running? (Run "pnpm db:up")');
            } else {
                logger.error({ err }, 'Scan failed');
            }
        } finally {
            await graph.disconnect();
        }
    });
