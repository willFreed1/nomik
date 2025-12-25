import fs from 'node:fs';
import path from 'node:path';
import type { ProjectNode } from '@nomik/core';

const NOMIK_DIR = '.nomik';
const PROJECT_FILE = 'project.json';
/** Version actuelle du schema projet — incrementer lors de migrations futures */
export const PROJECT_CONFIG_VERSION = 1;

export interface LocalProjectConfig {
    version: number;
    projectId: string;
    projectName: string;
    createdAt: string;
}

/** Chemin vers le fichier .nomik/project.json depuis le cwd */
function getConfigPath(cwd: string = process.cwd()): string {
    return path.join(cwd, NOMIK_DIR, PROJECT_FILE);
}

/** Lit la config projet locale (.nomik/project.json) */
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

/** Ecrit la config projet locale (.nomik/project.json) */
export function writeProjectConfig(config: LocalProjectConfig, cwd?: string): void {
    const dir = path.join(cwd ?? process.cwd(), NOMIK_DIR);
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
