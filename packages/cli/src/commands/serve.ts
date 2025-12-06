import { Command } from 'commander';
import { createLogger, setLogger } from '@genome/core';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';

/** Commande serve : lance le MCP server et optionnellement le dashboard viz */
export const serveCommand = new Command('serve')
    .description('Start MCP server and visualization dashboard')
    .option('--no-viz', 'Skip visualization dashboard')
    .option('--viz-port <port>', 'Visualization port', '3000')
    .action(async (opts: { viz: boolean; vizPort: string }) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);

        const rootDir = path.resolve(__dirname, '..', '..', '..');

        logger.info('Starting MCP server (stdio mode)...');
        const mcpPath = path.join(rootDir, 'packages', 'mcp-server', 'dist', 'index.js');
        logger.info({ path: mcpPath }, 'MCP server ready for stdio connections');

        if (opts.viz) {
            logger.info({ port: opts.vizPort }, 'Starting visualization dashboard...');
            const vizDir = path.join(rootDir, 'packages', 'viz');
            const vizProcess = spawn('npx', ['vite', '--port', opts.vizPort], {
                cwd: vizDir,
                stdio: 'inherit',
                shell: true,
            });

            vizProcess.on('error', (err) => {
                logger.error({ error: err.message }, 'Viz process error');
            });

            process.on('SIGINT', () => {
                vizProcess.kill();
                process.exit(0);
            });
        } else {
            logger.info('Viz disabled. Use --viz to enable.');
            logger.info('MCP server is configured in .cursor/mcp.json for Cursor IDE.');
        }
    });
