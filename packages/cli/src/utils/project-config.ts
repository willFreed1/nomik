import fs from 'node:fs';
import path from 'node:path';
import type { ProjectNode } from '@genome/core';

const GENOME_DIR = '.genome';
const PROJECT_FILE = 'project.json';

export interface LocalProjectConfig {
    projectId: string;
    projectName: string;
    createdAt: string;
}

/** Chemin vers le fichier .genome/project.json depuis le cwd */
function getConfigPath(cwd: string = process.cwd()): string {
    return path.join(cwd, GENOME_DIR, PROJECT_FILE);
}

/** Lit la config projet locale (.genome/project.json) */
export function readProjectConfig(cwd?: string): LocalProjectConfig | null {
    const configPath = getConfigPath(cwd);
    if (!fs.existsSync(configPath)) return null;
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as LocalProjectConfig;
    } catch {
        return null;
    }
}

/** Ecrit la config projet locale (.genome/project.json) */
export function writeProjectConfig(config: LocalProjectConfig, cwd?: string): void {
    const dir = path.join(cwd ?? process.cwd(), GENOME_DIR);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const configPath = path.join(dir, PROJECT_FILE);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** Genere un ProjectNode a partir d'un nom */
export function createProjectNode(name: string, rootPath?: string): ProjectNode {
    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
    return {
        id: slug,
        type: 'project',
        name,
        rootPath: rootPath ?? process.cwd(),
        createdAt: new Date().toISOString(),
    };
}

/** Deduit un nom de projet depuis le nom du repertoire courant */
export function defaultProjectName(cwd?: string): string {
    return path.basename(cwd ?? process.cwd());
}
