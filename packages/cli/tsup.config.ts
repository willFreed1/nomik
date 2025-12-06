import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    clean: true,
    dts: false, // CLI doesn't need dts usually, or maybe it does for plugins? Let's skip for now to save time/space
    banner: {
        js: '#!/usr/bin/env node',
    },
});
