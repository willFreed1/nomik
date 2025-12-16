import { defineConfig } from 'tsup';

/** Bundle CLI en un seul fichier autonome pour distribution npm */
export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    clean: true,
    dts: false,
    banner: {
        js: '#!/usr/bin/env node',
    },
    // Inline workspace packages, garder les deps natives externes
    noExternal: [
        '@genome/core',
        '@genome/parser',
        '@genome/graph',
        '@genome/watcher',
    ],
    external: [
        'neo4j-driver',
        'tree-sitter',
        'tree-sitter-typescript',
        'tree-sitter-javascript',
        'pino',
        'pino-pretty',
        'chokidar',
        'glob',
        'zod',
    ],
});
