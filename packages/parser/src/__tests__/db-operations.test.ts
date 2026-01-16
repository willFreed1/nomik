import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import { extractDBOperations, buildDBClientIdentifiers, buildDBNodesAndEdges } from '../extractors/db-operations';
import type { DBClientIds } from '../extractors/db-operations';
import type { ImportInfo } from '../extractors/imports';

let parser: Parser;

async function getParser(): Promise<Parser> {
    if (parser) return parser;
    parser = new Parser();
    const mod = await import('tree-sitter-typescript');
    const lang = (mod as any).default?.typescript ?? (mod as any).typescript;
    parser.setLanguage(lang as Parser.Language);
    return parser;
}

function parse(code: string) {
    return getParser().then(p => p.parse(code));
}

function emptyIds(): DBClientIds {
    return { prismaIds: new Set(), supabaseIds: new Set(), queryBuilderIds: new Set() };
}

// ── buildDBClientIdentifiers ────────────────────────────────────────

describe('buildDBClientIdentifiers', () => {
    it('detects @prisma/client import', () => {
        const imports: ImportInfo[] = [
            { source: '@prisma/client', specifiers: ['PrismaClient'], isDefault: false, isDynamic: false, isTypeOnly: false, line: 1 },
        ];
        const ids = buildDBClientIdentifiers(imports);
        expect(ids.prismaIds.has('PrismaClient')).toBe(true);
    });

    it('detects @supabase/supabase-js import', () => {
        const imports: ImportInfo[] = [
            { source: '@supabase/supabase-js', specifiers: ['createClient'], isDefault: false, isDynamic: false, isTypeOnly: false, line: 1 },
        ];
        const ids = buildDBClientIdentifiers(imports);
        expect(ids.supabaseIds.has('createClient')).toBe(true);
        // No fallback to 'supabase-js' because specifiers are non-empty
    });

    it('detects knex import', () => {
        const imports: ImportInfo[] = [
            { source: 'knex', specifiers: ['knex'], isDefault: true, isDynamic: false, isTypeOnly: false, line: 1 },
        ];
        const ids = buildDBClientIdentifiers(imports);
        expect(ids.queryBuilderIds.has('knex')).toBe(true);
    });

    it('detects drizzle-orm import', () => {
        const imports: ImportInfo[] = [
            { source: 'drizzle-orm', specifiers: ['drizzle'], isDefault: false, isDynamic: false, isTypeOnly: false, line: 1 },
        ];
        const ids = buildDBClientIdentifiers(imports);
        expect(ids.queryBuilderIds.has('drizzle')).toBe(true);
    });

    it('ignores non-DB packages', () => {
        const imports: ImportInfo[] = [
            { source: 'lodash', specifiers: ['get'], isDefault: false, isDynamic: false, isTypeOnly: false, line: 1 },
        ];
        const ids = buildDBClientIdentifiers(imports);
        expect(ids.prismaIds.size).toBe(0);
        expect(ids.supabaseIds.size).toBe(0);
        expect(ids.queryBuilderIds.size).toBe(0);
    });

    it('returns empty sets for no imports', () => {
        const ids = buildDBClientIdentifiers([]);
        expect(ids.prismaIds.size).toBe(0);
        expect(ids.supabaseIds.size).toBe(0);
        expect(ids.queryBuilderIds.size).toBe(0);
    });
});

// ── extractDBOperations — Prisma pattern ────────────────────────────

describe('extractDBOperations (Prisma)', () => {
    it('detects prisma.user.findMany() as SELECT', async () => {
        const tree = await parse(`
            async function getUsers() {
                return prisma.user.findMany();
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(['prisma']), supabaseIds: new Set(), queryBuilderIds: new Set() };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].tableName).toBe('user');
        expect(ops[0].operation).toBe('SELECT');
        expect(ops[0].callerName).toBe('getUsers');
    });

    it('detects prisma.post.create() as INSERT', async () => {
        const tree = await parse(`
            async function createPost() {
                return prisma.post.create({ data: { title: 'hello' } });
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(['prisma']), supabaseIds: new Set(), queryBuilderIds: new Set() };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].tableName).toBe('post');
        expect(ops[0].operation).toBe('INSERT');
    });

    it('detects prisma.user.update() as UPDATE', async () => {
        const tree = await parse(`
            async function updateUser() {
                return prisma.user.update({ where: { id: 1 }, data: { name: 'new' } });
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(['prisma']), supabaseIds: new Set(), queryBuilderIds: new Set() };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].operation).toBe('UPDATE');
    });

    it('detects prisma.user.delete() as DELETE', async () => {
        const tree = await parse(`
            async function deleteUser() {
                return prisma.user.delete({ where: { id: 1 } });
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(['prisma']), supabaseIds: new Set(), queryBuilderIds: new Set() };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].operation).toBe('DELETE');
    });

    it('detects Prisma method even without known import (structural match)', async () => {
        const tree = await parse(`
            async function search() {
                return db.article.findMany({ where: {} });
            }
        `);
        // db is NOT in prismaIds, but findMany is a unique Prisma method
        const ops = extractDBOperations(tree, '/test.ts', emptyIds());
        expect(ops.length).toBe(1);
        expect(ops[0].tableName).toBe('article');
        expect(ops[0].operation).toBe('SELECT');
    });
});

// ── extractDBOperations — Supabase pattern ──────────────────────────

describe('extractDBOperations (Supabase)', () => {
    it('detects supabase.from("users").select() as SELECT', async () => {
        const tree = await parse(`
            async function getUsers() {
                return supabase.from('users').select('*');
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(), supabaseIds: new Set(['supabase']), queryBuilderIds: new Set() };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].tableName).toBe('users');
        expect(ops[0].operation).toBe('SELECT');
    });

    it('detects supabase.from("posts").insert() as INSERT', async () => {
        const tree = await parse(`
            async function addPost() {
                return supabase.from('posts').insert({ title: 'new' });
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(), supabaseIds: new Set(['supabase']), queryBuilderIds: new Set() };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].tableName).toBe('posts');
        expect(ops[0].operation).toBe('INSERT');
    });
});

// ── extractDBOperations — Knex/query-builder pattern ────────────────

describe('extractDBOperations (Knex)', () => {
    it('detects knex("users").select() as SELECT', async () => {
        const tree = await parse(`
            async function getUsers() {
                return knex('users').select('*');
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(), supabaseIds: new Set(), queryBuilderIds: new Set(['knex']) };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].tableName).toBe('users');
        expect(ops[0].operation).toBe('SELECT');
    });

    it('detects db("posts").insert() as INSERT', async () => {
        const tree = await parse(`
            async function addPost() {
                return db('posts').insert({ title: 'hello' });
            }
        `);
        const ids: DBClientIds = { prismaIds: new Set(), supabaseIds: new Set(), queryBuilderIds: new Set(['db']) };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].tableName).toBe('posts');
        expect(ops[0].operation).toBe('INSERT');
    });
});

// ── extractDBOperations — edge cases ────────────────────────────────

describe('extractDBOperations (edge cases)', () => {
    it('ignores non-DB member calls', async () => {
        const tree = await parse(`
            function doStuff() {
                console.log('hello');
                arr.map(x => x);
            }
        `);
        const ops = extractDBOperations(tree, '/test.ts', emptyIds());
        expect(ops.length).toBe(0);
    });

    it('uses __file__ for top-level DB calls', async () => {
        const tree = await parse(`
            prisma.user.findMany();
        `);
        const ids: DBClientIds = { prismaIds: new Set(['prisma']), supabaseIds: new Set(), queryBuilderIds: new Set() };
        const ops = extractDBOperations(tree, '/test.ts', ids);
        expect(ops.length).toBe(1);
        expect(ops[0].callerName).toBe('__file__');
    });
});

// ── buildDBNodesAndEdges ────────────────────────────────────────────

describe('buildDBNodesAndEdges', () => {
    it('creates DBTable node and READS_FROM edge for SELECT', () => {
        const dbOps = [{
            callerName: 'getUsers',
            tableName: 'users',
            operation: 'SELECT' as const,
            receiverName: 'prisma',
            line: 5,
        }];
        const funcMap = new Map([['getUsers', 'func-id-1']]);
        const { nodes, edges } = buildDBNodesAndEdges(dbOps, funcMap, 'file-id', '/test.ts');

        expect(nodes.length).toBe(1);
        expect(nodes[0].type).toBe('db_table');
        expect((nodes[0] as any).name).toBe('users');

        expect(edges.length).toBe(1);
        expect(edges[0].type).toBe('READS_FROM');
        expect(edges[0].sourceId).toBe('func-id-1');
    });

    it('creates WRITES_TO edge for INSERT', () => {
        const dbOps = [{
            callerName: 'createPost',
            tableName: 'posts',
            operation: 'INSERT' as const,
            receiverName: 'prisma',
            line: 10,
        }];
        const funcMap = new Map([['createPost', 'func-id-2']]);
        const { edges } = buildDBNodesAndEdges(dbOps, funcMap, 'file-id', '/test.ts');

        expect(edges.length).toBe(1);
        expect(edges[0].type).toBe('WRITES_TO');
    });

    it('deduplicates table nodes for same table', () => {
        const dbOps = [
            { callerName: 'a', tableName: 'users', operation: 'SELECT' as const, receiverName: 'p', line: 1 },
            { callerName: 'b', tableName: 'users', operation: 'INSERT' as const, receiverName: 'p', line: 2 },
        ];
        const funcMap = new Map([['a', 'id-a'], ['b', 'id-b']]);
        const { nodes, edges } = buildDBNodesAndEdges(dbOps, funcMap, 'file-id', '/test.ts');

        expect(nodes.length).toBe(1);
        expect((nodes[0] as any).operations).toContain('SELECT');
        expect((nodes[0] as any).operations).toContain('INSERT');
        expect(edges.length).toBe(2);
    });

    it('falls back to fileId when caller not in funcMap', () => {
        const dbOps = [{
            callerName: '__file__',
            tableName: 'users',
            operation: 'SELECT' as const,
            receiverName: null,
            line: 1,
        }];
        const { edges } = buildDBNodesAndEdges(dbOps, new Map(), 'file-id', '/test.ts');
        expect(edges[0].sourceId).toBe('file-id');
    });
});
