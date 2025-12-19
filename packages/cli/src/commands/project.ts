import { Command } from 'commander';
import { createLogger, setLogger, loadConfigFromEnv, validateConfig } from '@genome/core';
import { createGraphService } from '@genome/graph';
import { readProjectConfig, writeProjectConfig, createProjectNode } from '../utils/project-config.js';

/** Commande principale : genome project <sous-commande> */
export const projectCommand = new Command('project')
    .description('Manage GENOME projects (multi-project isolation)');

/** genome project list */
projectCommand
    .command('list')
    .description('List all projects in the knowledge graph')
    .action(async () => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);
        const config = loadConfigFromEnv();
        const graph = createGraphService(validateConfig({ ...config, target: { root: '.', include: [], exclude: [] } }).graph);
        try {
            await graph.connect();
            const projects = await graph.listProjects();
            const local = readProjectConfig();

            console.log('');
            console.log('  \x1b[36m\x1b[1mGENOME Projects\x1b[0m');
            console.log('');
            if (projects.length === 0) {
                console.log('  \x1b[2mNo projects found. Run "genome project create <name>" or "genome init".\x1b[0m');
            } else {
                for (const p of projects) {
                    const isCurrent = local?.projectId === p.id;
                    const marker = isCurrent ? ' \x1b[32m← current\x1b[0m' : '';
                    console.log(`  ${isCurrent ? '\x1b[32m●\x1b[0m' : '○'} \x1b[1m${p.name}\x1b[0m (${p.id})${marker}`);
                    console.log(`    \x1b[2mroot: ${p.rootPath}  |  created: ${p.createdAt?.slice(0, 10) ?? 'n/a'}\x1b[0m`);
                }
            }
            console.log('');
        } finally {
            await graph.disconnect();
        }
    });

/** genome project create <name> */
projectCommand
    .command('create <name>')
    .description('Create a new project and set it as current')
    .action(async (name: string) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);
        const config = loadConfigFromEnv();
        const graph = createGraphService(validateConfig({ ...config, target: { root: '.', include: [], exclude: [] } }).graph);
        try {
            await graph.connect();
            await graph.initSchema();

            const project = createProjectNode(name);

            // Verifier si le projet existe deja
            const existing = await graph.getProject(project.id);
            if (existing) {
                console.log(`  \x1b[33m!\x1b[0m Project "${name}" already exists (${project.id}). Switching to it.`);
            } else {
                await graph.createProject(project);
                console.log(`  \x1b[32m✓\x1b[0m Project "${name}" created (${project.id})`);
            }

            writeProjectConfig({ projectId: project.id, projectName: name, createdAt: new Date().toISOString() });
            console.log(`  \x1b[32m✓\x1b[0m .genome/project.json written`);
            console.log('');
            console.log(`  Run \x1b[33mgenome scan .\x1b[0m to index this project.`);
            console.log('');
        } finally {
            await graph.disconnect();
        }
    });

/** genome project switch <name> */
projectCommand
    .command('switch <name>')
    .description('Switch to an existing project')
    .action(async (name: string) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);
        const config = loadConfigFromEnv();
        const graph = createGraphService(validateConfig({ ...config, target: { root: '.', include: [], exclude: [] } }).graph);
        try {
            await graph.connect();

            const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
            const project = await graph.getProject(slug);
            if (!project) {
                console.log(`  \x1b[31m✗\x1b[0m Project "${name}" not found in Neo4j.`);
                console.log(`  \x1b[2mRun "genome project list" to see available projects.\x1b[0m`);
                console.log(`  \x1b[2mRun "genome project create ${name}" to create it.\x1b[0m`);
                return;
            }

            writeProjectConfig({ projectId: project.id, projectName: project.name, createdAt: project.createdAt });
            console.log(`  \x1b[32m✓\x1b[0m Switched to project "${project.name}" (${project.id})`);
            console.log('');
        } finally {
            await graph.disconnect();
        }
    });

/** genome project delete <name> */
projectCommand
    .command('delete <name>')
    .description('Delete a project and ALL its data from Neo4j')
    .action(async (name: string) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);
        const config = loadConfigFromEnv();
        const graph = createGraphService(validateConfig({ ...config, target: { root: '.', include: [], exclude: [] } }).graph);
        try {
            await graph.connect();

            const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
            const project = await graph.getProject(slug);
            if (!project) {
                console.log(`  \x1b[31m✗\x1b[0m Project "${name}" not found.`);
                return;
            }

            await graph.deleteProject(slug);
            console.log(`  \x1b[32m✓\x1b[0m Project "${project.name}" and all its data deleted.`);

            // Si c'est le projet courant, nettoyer la config locale
            const local = readProjectConfig();
            if (local?.projectId === slug) {
                console.log(`  \x1b[33m!\x1b[0m This was the current project. Run "genome project create" or "genome project switch".`);
            }
            console.log('');
        } finally {
            await graph.disconnect();
        }
    });

/** genome project info */
projectCommand
    .command('info')
    .description('Show current project details')
    .action(async () => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);

        const local = readProjectConfig();
        if (!local) {
            console.log('  \x1b[33m!\x1b[0m No project configured. Run "genome init" or "genome project create <name>".');
            return;
        }

        const config = loadConfigFromEnv();
        const graph = createGraphService(validateConfig({ ...config, target: { root: '.', include: [], exclude: [] } }).graph);
        try {
            await graph.connect();
            const project = await graph.getProject(local.projectId);
            const stats = await graph.getStats(local.projectId);

            console.log('');
            console.log('  \x1b[36m\x1b[1mCurrent Project\x1b[0m');
            console.log('');
            console.log(`  Name:       \x1b[1m${project?.name ?? local.projectName}\x1b[0m`);
            console.log(`  ID:         ${local.projectId}`);
            console.log(`  Root:       ${project?.rootPath ?? 'n/a'}`);
            console.log(`  Created:    ${project?.createdAt?.slice(0, 10) ?? local.createdAt.slice(0, 10)}`);
            console.log(`  Nodes:      ${stats.nodeCount}`);
            console.log(`  Edges:      ${stats.edgeCount}`);
            console.log(`  Files:      ${stats.fileCount}`);
            console.log(`  Functions:  ${stats.functionCount}`);
            console.log(`  Classes:    ${stats.classCount}`);
            console.log('');
        } finally {
            await graph.disconnect();
        }
    });
