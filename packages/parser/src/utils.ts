import { createHash } from 'node:crypto';

export function createNodeId(type: string, filePath: string, name: string): string {
    const raw = `${type}:${filePath}:${name}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function createFileHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}
