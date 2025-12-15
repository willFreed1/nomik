import { describe, it, expect } from 'vitest';
import { createNodeId, createFileHash } from '../utils';

describe('createNodeId', () => {
    it('retourne un hash hex de 16 caracteres', () => {
        const id = createNodeId('function', '/src/app.ts', 'handleClick');

        expect(id).toHaveLength(16);
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('est deterministe pour les memes inputs', () => {
        const a = createNodeId('file', '/src/index.ts', '');
        const b = createNodeId('file', '/src/index.ts', '');
        expect(a).toBe(b);
    });

    it('produit des ids differents pour des inputs differents', () => {
        const a = createNodeId('function', '/src/a.ts', 'foo');
        const b = createNodeId('function', '/src/b.ts', 'foo');
        const c = createNodeId('function', '/src/a.ts', 'bar');

        expect(a).not.toBe(b);
        expect(a).not.toBe(c);
    });

    it('differencie le type dans le hash', () => {
        const a = createNodeId('file', '/src/index.ts', '');
        const b = createNodeId('function', '/src/index.ts', '');
        expect(a).not.toBe(b);
    });
});

describe('createFileHash', () => {
    it('retourne un hash sha256 complet (64 chars hex)', () => {
        const hash = createFileHash('export const x = 1;');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('est deterministe', () => {
        const a = createFileHash('const a = 1;');
        const b = createFileHash('const a = 1;');
        expect(a).toBe(b);
    });

    it('change si le contenu change', () => {
        const a = createFileHash('const a = 1;');
        const b = createFileHash('const a = 2;');
        expect(a).not.toBe(b);
    });
});
