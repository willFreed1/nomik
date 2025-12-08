import { Command } from 'commander';
import { loadConfig, getLogger } from '@genome/core';
import { createGraphService } from '@genome/graph';

/** Commande CLI pour exécuter du Cypher brut */
export const queryCommand = new Command('query')
    .description('Execute a raw Cypher query against the knowledge graph')
    .argument('<cypher>', 'Cypher query string')
    .option('-j, --json', 'Output raw JSON')
    .action(async (cypher: string, opts: { json?: boolean }) => {
        const logger = getLogger();
        const config = loadConfig();
        const graph = createGraphService(config.graph);

        try {
            await graph.connect();
            const results = await graph.executeQuery<Record<string, unknown>>(cypher);

            if (opts.json) {
                console.log(JSON.stringify(results, null, 2));
            } else {
                if (results.length === 0) {
                    console.log('(no results)');
                    return;
                }
                const keys = Object.keys(results[0]);
                // En-tête
                console.log(keys.map(k => k.padEnd(30)).join(' | '));
                console.log(keys.map(() => '-'.repeat(30)).join('-+-'));
                // Lignes
                for (const row of results) {
                    console.log(keys.map(k => {
                        const v = row[k];
                        const s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
                        return s.substring(0, 30).padEnd(30);
                    }).join(' | '));
                }
                console.log(`\n${results.length} row(s)`);
            }
        } catch (err) {
            logger.error({ error: err instanceof Error ? err.message : String(err) }, 'query failed');
            process.exit(1);
        } finally {
            await graph.disconnect();
        }
    });
