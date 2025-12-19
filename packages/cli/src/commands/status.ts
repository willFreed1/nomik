import { Command } from 'commander';
import { loadConfigFromEnv, validateConfig } from '@genome/core';
import { createGraphService } from '@genome/graph';
import { readProjectConfig } from '../utils/project-config.js';

export const statusCommand = new Command('status')
    .description('Show GENOME graph health and statistics')
    .action(async () => {
        const envConfig = loadConfigFromEnv();
        const config = validateConfig({
            ...envConfig,
            target: { root: '.' },
        });

        const local = readProjectConfig();
        const projectId = local?.projectId;
        const graph = createGraphService(config.graph);

        try {
            await graph.connect();
            const healthy = await graph.healthCheck();

            if (!healthy) {
                console.log('  \x1b[31m\u2717\x1b[0m Neo4j is not reachable\n');
                return;
            }

            const stats = await graph.getStats(projectId);

            console.log('');
            console.log('  \x1b[36m\x1b[1mGENOME Status\x1b[0m');
            console.log('');
            console.log(`  Project:   \x1b[1m${local?.projectName ?? '(none)'}\x1b[0m ${projectId ? `(${projectId})` : '\x1b[33m— run "genome init"\x1b[0m'}`);
            console.log(`  Neo4j:     \x1b[32m\u2713\x1b[0m Connected`);
            console.log(`  Nodes:     ${stats.nodeCount}`);
            console.log(`  Edges:     ${stats.edgeCount}`);
            console.log(`  Files:     ${stats.fileCount}`);
            console.log(`  Functions: ${stats.functionCount}`);
            console.log(`  Classes:   ${stats.classCount}`);
            console.log(`  Routes:    ${stats.routeCount}`);
            console.log('');
        } catch (err) {
            console.error(`  \x1b[31m\u2717\x1b[0m Cannot connect to Neo4j: ${err instanceof Error ? err.message : String(err)}\n`);
        } finally {
            await graph.disconnect();
        }
    });
