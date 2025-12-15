import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertNode, upsertNodes, createEdge, createEdges, clearFileData } from '../queries/write.js';
import type { GraphDriver } from '../drivers/driver.interface.js';
import type { GraphNode, GraphEdge } from '@genome/core';

function createMockDriver(): GraphDriver {
    return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        runQuery: vi.fn().mockResolvedValue([]),
        runWrite: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue(true),
    };
}

describe('upsertNode', () => {
    let driver: GraphDriver;

    beforeEach(() => {
        driver = createMockDriver();
    });

    it('appelle runWrite avec le bon label et id', async () => {
        const node: GraphNode = {
            id: 'abc123',
            type: 'file',
            path: '/src/index.ts',
            language: 'typescript',
            hash: 'deadbeef',
            size: 1024,
            lastParsed: '2026-01-01T00:00:00Z',
        } as any;

        await upsertNode(driver, node);

        expect(driver.runWrite).toHaveBeenCalledTimes(1);
        const [cypher, params] = (driver.runWrite as any).mock.calls[0];
        expect(cypher).toContain('MERGE (n:File {id: $id})');
        expect(params.id).toBe('abc123');
    });
});

describe('upsertNodes', () => {
    let driver: GraphDriver;

    beforeEach(() => {
        driver = createMockDriver();
    });

    it('groupe par type et fait un appel par label', async () => {
        const nodes: GraphNode[] = [
            { id: 'f1', type: 'file', path: '/a.ts', language: 'typescript', hash: 'h1', size: 100, lastParsed: '' } as any,
            { id: 'fn1', type: 'function', name: 'foo', filePath: '/a.ts', startLine: 1, endLine: 10, params: [], isAsync: false, isExported: true, isGenerator: false, decorators: [], confidence: 1 } as any,
            { id: 'fn2', type: 'function', name: 'bar', filePath: '/a.ts', startLine: 11, endLine: 20, params: [], isAsync: false, isExported: false, isGenerator: false, decorators: [], confidence: 1 } as any,
        ];

        await upsertNodes(driver, nodes);

        // 1 appel pour File, 1 appel pour Function = 2 appels
        expect(driver.runWrite).toHaveBeenCalledTimes(2);

        const calls = (driver.runWrite as any).mock.calls;
        const cyphers = calls.map((c: any) => c[0]);
        expect(cyphers.some((c: string) => c.includes(':File'))).toBe(true);
        expect(cyphers.some((c: string) => c.includes(':Function'))).toBe(true);
    });

    it('ne fait aucun appel pour un tableau vide', async () => {
        await upsertNodes(driver, []);
        expect(driver.runWrite).not.toHaveBeenCalled();
    });
});

describe('createEdge', () => {
    let driver: GraphDriver;

    beforeEach(() => {
        driver = createMockDriver();
    });

    it('cree un edge CONTAINS entre source et target', async () => {
        const edge: GraphEdge = {
            id: 'e1',
            type: 'CONTAINS',
            sourceId: 'f1',
            targetId: 'fn1',
            confidence: 1.0,
        };

        await createEdge(driver, edge);

        expect(driver.runWrite).toHaveBeenCalledTimes(1);
        const [cypher, params] = (driver.runWrite as any).mock.calls[0];
        expect(cypher).toContain(':CONTAINS');
        expect(params.sourceId).toBe('f1');
        expect(params.targetId).toBe('fn1');
    });
});

describe('createEdges', () => {
    let driver: GraphDriver;

    beforeEach(() => {
        driver = createMockDriver();
    });

    it('groupe les edges par type de relation', async () => {
        const edges: GraphEdge[] = [
            { id: 'e1', type: 'CONTAINS', sourceId: 'f1', targetId: 'fn1', confidence: 1 },
            { id: 'e2', type: 'CONTAINS', sourceId: 'f1', targetId: 'fn2', confidence: 1 },
            { id: 'e3', type: 'CALLS', sourceId: 'fn1', targetId: 'fn2', confidence: 1, line: 5, column: 10 },
        ];

        await createEdges(driver, edges);

        // 1 appel CONTAINS batch, 1 appel CALLS batch
        expect(driver.runWrite).toHaveBeenCalledTimes(2);
    });
});

describe('clearFileData', () => {
    let driver: GraphDriver;

    beforeEach(() => {
        driver = createMockDriver();
    });

    it('supprime les enfants puis le fichier', async () => {
        await clearFileData(driver, '/src/index.ts');

        expect(driver.runWrite).toHaveBeenCalledTimes(2);

        const calls = (driver.runWrite as any).mock.calls;
        // Premier appel : supprime les enfants
        expect(calls[0][0]).toContain('CONTAINS');
        expect(calls[0][0]).toContain('DETACH DELETE');
        expect(calls[0][1].path).toBe('/src/index.ts');

        // Deuxieme appel : supprime le File
        expect(calls[1][0]).toContain('DETACH DELETE f');
        expect(calls[1][1].path).toBe('/src/index.ts');
    });
});
