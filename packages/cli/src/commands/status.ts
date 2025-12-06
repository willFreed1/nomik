import { Command } from 'commander';
import { loadConfigFromEnv, validateConfig } from '@genome/core';
import { createGraphService } from '@genome/graph';

export const statusCommand = new Command('status')
    .description('Show GENOME graph health and statistics')
    .action(async () => {
        const envConfig = loadConfigFromEnv();
        const config = validateConfig({
            ...envConfig,
            target: { root: '.' },
        });

        const graph = createGraphService(config.graph);

        try {
            await graph.connect();
            const healthy = await graph.healthCheck();

            if (!healthy) {
                console.log('  ❌ Neo4j is not reachable\n');
                return;
            }

            const stats = await graph.getStats();

            console.log(`\n🧬 GENOME Status\n`);
            console.log(`  Neo4j:     ✅ Connected`);
            console.log(`  Nodes:     ${stats.nodeCount}`);
            console.log(`  Edges:     ${stats.edgeCount}`);
            console.log(`  Files:     ${stats.fileCount}`);
            console.log(`  Functions: ${stats.functionCount}`);
            console.log(`  Classes:   ${stats.classCount}`);
            console.log(`  Routes:    ${stats.routeCount}\n`);
        } catch (err) {
            console.error(`  ❌ Cannot connect to Neo4j: ${err instanceof Error ? err.message : String(err)}\n`);
        } finally {
            await graph.disconnect();
        }
    });
