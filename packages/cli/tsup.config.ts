import { defineConfig } from 'tsup';

/** Bundle CLI + MCP server en fichiers autonomes pour distribution npm */
export default defineConfig([
    {
        entry: { index: 'src/index.ts' },
        format: ['esm'],
        clean: true,
        dts: false,
        banner: { js: '#!/usr/bin/env node' },
        noExternal: ['@genome/core', '@genome/parser', '@genome/graph', '@genome/watcher'],
        external: ['neo4j-driver', 'tree-sitter', 'tree-sitter-typescript', 'tree-sitter-javascript', 'pino', 'pino-pretty', 'chokidar', 'glob', 'zod'],
    },
    {
        entry: { 'mcp-server': '../mcp-server/src/index.ts' },
        format: ['esm'],
        outDir: 'dist',
        dts: false,
        noExternal: ['@genome/core', '@genome/graph', '@modelcontextprotocol/sdk'],
        external: ['neo4j-driver', 'pino', 'pino-pretty', 'zod'],
    },
]);
