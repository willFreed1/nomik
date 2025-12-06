import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';

const CONFIG_TEMPLATE = `import { defineConfig } from '@genome/core';

export default defineConfig({
  target: {
    root: './src',
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'],
  },
  graph: {
    driver: 'neo4j',
    uri: 'bolt://localhost:7687',
    auth: { username: 'neo4j', password: 'genome_local' },
  },
  parser: {
    languages: ['typescript'],
  },
});
`;

export const initCommand = new Command('init')
    .description('Initialize GENOME config in the current directory')
    .action(async () => {
        const configPath = path.resolve('genome.config.ts');
        if (fs.existsSync(configPath)) {
            console.log('genome.config.ts already exists');
            return;
        }
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        console.log('Created genome.config.ts');
    });
