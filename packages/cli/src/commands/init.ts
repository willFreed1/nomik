import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { readProjectConfig, writeProjectConfig, createProjectNode, defaultProjectName } from '../utils/project-config.js';

const CONFIG_TEMPLATE = `import { defineConfig } from '@genome/core';

export default defineConfig({
  target: {
    root: './src',
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.md', '**/*.py', '**/*.rs'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*', '**/*.d.ts', '**/__pycache__/**', '**/target/**', '**/.venv/**'],
  },
  graph: {
    driver: 'neo4j',
    uri: 'bolt://localhost:7687',
    auth: { username: 'neo4j', password: 'genome_local' },
  },
  parser: {
    languages: ['typescript', 'python', 'rust'],
  },
});
`;

const DOCKER_COMPOSE_TEMPLATE = `version: '3.8'
services:
  neo4j:
    image: neo4j:5.12-community
    container_name: genome-neo4j
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/genome_local
      - NEO4J_PLUGINS=["apoc"]
      - NEO4J_dbms_memory_heap_max__size=512M
    volumes:
      - genome-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider localhost:7474 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  genome-data:
`;

/** Verifie si Docker est disponible */
function hasDocker(): boolean {
    try {
        execSync('docker --version', { stdio: 'pipe' });
        return true;
    } catch { return false; }
}

/** Verifie si le container Neo4j tourne deja */
function isNeo4jRunning(): boolean {
    try {
        const out = execSync('docker ps --filter name=genome-neo4j --format "{{.Status}}"', { stdio: 'pipe' }).toString().trim();
        return out.length > 0;
    } catch { return false; }
}

export const initCommand = new Command('init')
    .description('Initialize GENOME in the current project (config + Neo4j)')
    .option('--no-docker', 'Skip Docker/Neo4j setup')
    .action(async (opts: { docker: boolean }) => {
        console.log('');
        console.log('  \x1b[36m\x1b[1mGENOME — Project Initialization\x1b[0m');
        console.log('');

        // 1. Config file
        const configPath = path.resolve('genome.config.ts');
        if (fs.existsSync(configPath)) {
            console.log('  \x1b[32m\u2713\x1b[0m genome.config.ts already exists');
        } else {
            fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
            console.log('  \x1b[32m\u2713\x1b[0m Created genome.config.ts');
        }

        // 2. Docker Compose
        if (opts.docker) {
            if (!hasDocker()) {
                console.log('  \x1b[33m!\x1b[0m Docker not found. Install Docker Desktop to use Neo4j.');
                console.log('    https://docs.docker.com/get-docker/');
            } else if (isNeo4jRunning()) {
                console.log('  \x1b[32m\u2713\x1b[0m Neo4j container already running');
            } else {
                const composePath = path.resolve('docker-compose.yml');
                if (!fs.existsSync(composePath)) {
                    fs.writeFileSync(composePath, DOCKER_COMPOSE_TEMPLATE, 'utf-8');
                    console.log('  \x1b[32m\u2713\x1b[0m Created docker-compose.yml');
                }
                console.log('  \x1b[36m...\x1b[0m Starting Neo4j container...');
                try {
                    execSync('docker compose up -d', { stdio: 'pipe', cwd: process.cwd() });
                    console.log('  \x1b[32m\u2713\x1b[0m Neo4j started (bolt://localhost:7687)');
                    console.log('  \x1b[2m  UI: http://localhost:7474  |  user: neo4j  |  pass: genome_local\x1b[0m');
                } catch (err) {
                    console.log(`  \x1b[31m\u2717\x1b[0m Failed to start Neo4j: ${err instanceof Error ? err.message : err}`);
                }
            }
        } else {
            console.log('  \x1b[2m  Skipping Docker setup (--no-docker)\x1b[0m');
        }

        // 3. Auto-creation du projet local (.genome/project.json)
        const existing = readProjectConfig();
        if (existing) {
            console.log(`  \x1b[32m\u2713\x1b[0m Project already configured: ${existing.projectName} (${existing.projectId})`);
        } else {
            const name = defaultProjectName();
            const node = createProjectNode(name);
            writeProjectConfig({ projectId: node.id, projectName: name, createdAt: new Date().toISOString() });
            console.log(`  \x1b[32m\u2713\x1b[0m Project created: ${name} (${node.id})`);
            console.log('  \x1b[2m  .genome/project.json written — commit this file to share with your team\x1b[0m');
        }

        // 4. .gitignore check
        const gitignorePath = path.resolve('.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            if (!content.includes('docker/data')) {
                fs.appendFileSync(gitignorePath, '\n# GENOME\ndocker/data/\ndocker/logs/\n');
                console.log('  \x1b[32m\u2713\x1b[0m Updated .gitignore');
            }
        }

        console.log('');
        console.log('  \x1b[1mNext steps:\x1b[0m');
        console.log('    1. \x1b[33mgenome scan .\x1b[0m          Scan your codebase');
        console.log('    2. \x1b[33mgenome setup-cursor\x1b[0m    Configure Cursor AI');
        console.log('    3. \x1b[33mgenome watch .\x1b[0m         Keep graph updated live');
        console.log('');
    });
