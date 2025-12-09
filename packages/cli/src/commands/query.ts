import { Command } from 'commander';
import { loadConfigFromEnv, createLogger, setLogger } from '@genome/core';
import { createGraphService } from '@genome/graph';

/** Commande CLI pour executer du Cypher brut */
export const queryCommand = new Command('query')
    .description('Execute a raw Cypher query against the knowledge graph')
    .argument('<cypher>', 'Cypher query string')
    .option('-j, --json', 'Output raw JSON')
    .action(async (cypher: string, opts: { json?: boolean }) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);
        const envConfig = loadConfigFromEnv();
        if (!envConfig.graph) {
            logger.error('Graph config missing. Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD env vars.');
            process.exit(1);
        }
        const graph = createGraphService(envConfig.graph);

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
                const first = results[0]!;
                const keys = Object.keys(first);
                console.log(keys.map(k => k.padEnd(30)).join(' | '));
                console.log(keys.map(() => '-'.repeat(30)).join('-+-'));
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
