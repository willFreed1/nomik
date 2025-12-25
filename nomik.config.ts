import { defineConfig } from '@nomik/core';

export default defineConfig({
  target: {
    root: './src',
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.md', '**/*.py', '**/*.rs'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*', '**/*.d.ts', '**/__pycache__/**', '**/target/**', '**/.venv/**'],
  },
  graph: {
    driver: 'neo4j',
    uri: 'bolt://localhost:7687',
    auth: { username: 'neo4j', password: 'nomik_local' },
  },
  parser: {
    languages: ['typescript', 'python', 'rust'],
  },
});
