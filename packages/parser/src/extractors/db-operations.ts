import Parser from 'tree-sitter';
import type { DBTableNode, ReadsFromEdge, WritesToEdge, GraphNode, GraphEdge } from '@nomik/core';
import type { ImportInfo } from './imports.js';
import { createNodeId } from '../utils.js';

// ────────────────────────────────────────────────────────────────────────
// Database Operation Detection — FULLY DYNAMIC, import-aware
//
// Strategy (works on ANY project, zero hardcoded variable names):
//   1. Import detection: scan file imports for known DB npm packages
//      (@prisma/client, @supabase/supabase-js, knex, drizzle-orm, etc.)
//      → the imported identifier becomes a tracked DB client
//   2. Pattern-based: detect structural patterns unique to each ORM:
//      - Prisma: x.table.findMany() (3-level chain + Prisma method)
//      - Supabase: x.from('table').select() (.from() chain)
//      - Knex/query-builder: x('table').select() (function call + method)
//   3. The receiver name is resolved from imports, not hardcoded
//
// Creates: DBTableNode + READS_FROM / WRITES_TO edges
// ────────────────────────────────────────────────────────────────────────

export interface DBOperationInfo {
    callerName: string;
    tableName: string;
    operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
    receiverName: string | null;
    line: number;
}

// ── Known npm packages that are DB clients (universal) ──
const PRISMA_PACKAGES = new Set(['@prisma/client']);
const SUPABASE_PACKAGES = new Set(['@supabase/supabase-js', '@supabase/ssr']);
const QUERY_BUILDER_PACKAGES = new Set(['knex', 'better-sqlite3', 'pg', 'mysql2', 'tedious']);
const DRIZZLE_PACKAGES = new Set(['drizzle-orm']);

// ── Prisma method classification ──
const PRISMA_READ_METHODS = new Set(['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy']);
const PRISMA_INSERT_METHODS = new Set(['create', 'createMany', 'createManyAndReturn']);
const PRISMA_UPDATE_METHODS = new Set(['update', 'updateMany', 'upsert']);
const PRISMA_DELETE_METHODS = new Set(['delete', 'deleteMany']);
const ALL_PRISMA_METHODS = new Set([...PRISMA_READ_METHODS, ...PRISMA_INSERT_METHODS, ...PRISMA_UPDATE_METHODS, ...PRISMA_DELETE_METHODS]);

// ── Supabase/query-builder method classification ──
const QB_READ_METHODS = new Set(['select', 'rpc', 'where', 'first', 'pluck', 'count']);
const QB_INSERT_METHODS = new Set(['insert']);
const QB_UPDATE_METHODS = new Set(['update', 'upsert']);
const QB_DELETE_METHODS = new Set(['delete', 'del', 'truncate']);

// ────────────────────────────────────────────────────────────────────────
// Step 1: Build dynamic DB client identifier sets from file imports
// ────────────────────────────────────────────────────────────────────────

export interface DBClientIds {
    prismaIds: Set<string>;
    supabaseIds: Set<string>;
    queryBuilderIds: Set<string>;
}

export function buildDBClientIdentifiers(imports: ImportInfo[]): DBClientIds {
    const prismaIds = new Set<string>();
    const supabaseIds = new Set<string>();
    const queryBuilderIds = new Set<string>();

    for (const imp of imports) {
        const source = imp.source.trim();
        const ids = imp.specifiers.length > 0 ? imp.specifiers : [source.split('/').pop()!];

        if (PRISMA_PACKAGES.has(source)) {
            for (const id of ids) prismaIds.add(id);
        } else if (SUPABASE_PACKAGES.has(source)) {
            for (const id of ids) supabaseIds.add(id);
        } else if (QUERY_BUILDER_PACKAGES.has(source) || DRIZZLE_PACKAGES.has(source)) {
            for (const id of ids) queryBuilderIds.add(id);
        }
    }

    return { prismaIds, supabaseIds, queryBuilderIds };
}

// ────────────────────────────────────────────────────────────────────────
// Step 2: Extract DB operations from AST using dynamic identifiers
// ────────────────────────────────────────────────────────────────────────

export function extractDBOperations(
    tree: Parser.Tree,
    _filePath: string,
    dbClientIds: DBClientIds,
): DBOperationInfo[] {
    const ops: DBOperationInfo[] = [];

    function visit(node: Parser.SyntaxNode): void {
        if (node.type === 'call_expression') {
            const info = parseDBOperation(node, dbClientIds);
            if (info) ops.push(info);
        }
        for (const child of node.children) {
            visit(child);
        }
    }

    visit(tree.rootNode);
    return ops;
}

function parseDBOperation(
    callNode: Parser.SyntaxNode,
    dbClientIds: DBClientIds,
): DBOperationInfo | null {
    const funcNode = callNode.childForFieldName('function');
    if (!funcNode || funcNode.type !== 'member_expression') return null;

    const prop = funcNode.childForFieldName('property');
    if (!prop) return null;
    const methodName = prop.text;

    const obj = funcNode.childForFieldName('object');
    if (!obj) return null;

    // ── Pattern 1: Prisma-style — receiver.table.method() ──
    // x.user.findMany() where x is a known Prisma client identifier
    // OR any x.y.prismaMethod() where prismaMethod is unique to Prisma
    if (obj.type === 'member_expression') {
        const outerObj = obj.childForFieldName('object');
        const tableProp = obj.childForFieldName('property');
        if (outerObj && tableProp && outerObj.type === 'identifier') {
            const receiverName = outerObj.text;
            // Known Prisma import OR structural match (unique method names)
            if (dbClientIds.prismaIds.has(receiverName) || ALL_PRISMA_METHODS.has(methodName)) {
                const operation = classifyPrismaMethod(methodName);
                if (operation) {
                    return {
                        callerName: findEnclosingFunctionName(callNode) ?? '__file__',
                        tableName: tableProp.text,
                        operation,
                        receiverName,
                        line: callNode.startPosition.row + 1,
                    };
                }
            }
        }

        // ── Pattern 2: Supabase-style — x.from('table').method() ──
        const fromTable = extractFromChain(obj);
        if (fromTable) {
            const operation = classifyQBMethod(methodName);
            if (operation) {
                return {
                    callerName: findEnclosingFunctionName(callNode) ?? '__file__',
                    tableName: fromTable,
                    operation,
                    receiverName: findChainRoot(obj) ?? 'db',
                    line: callNode.startPosition.row + 1,
                };
            }
        }
    }

    // ── Pattern 3: Query-builder-style — x('table').method() ──
    // knex('users').select(), db('posts').insert()
    if (obj.type === 'call_expression') {
        const innerFunc = obj.childForFieldName('function');
        if (innerFunc && innerFunc.type === 'identifier') {
            const receiverName = innerFunc.text;
            // Known query builder import OR structural match (.select/.insert after function call)
            if (dbClientIds.queryBuilderIds.has(receiverName)) {
                const tableName = extractFirstStringArg(obj);
                if (tableName) {
                    const operation = classifyQBMethod(methodName);
                    if (operation) {
                        return {
                            callerName: findEnclosingFunctionName(callNode) ?? '__file__',
                            tableName,
                            operation,
                            receiverName,
                            line: callNode.startPosition.row + 1,
                        };
                    }
                }
            }
        }
    }

    return null;
}

function classifyPrismaMethod(method: string): DBOperationInfo['operation'] | null {
    if (PRISMA_READ_METHODS.has(method)) return 'SELECT';
    if (PRISMA_INSERT_METHODS.has(method)) return 'INSERT';
    if (PRISMA_UPDATE_METHODS.has(method)) return 'UPDATE';
    if (PRISMA_DELETE_METHODS.has(method)) return 'DELETE';
    return null;
}

function classifyQBMethod(method: string): DBOperationInfo['operation'] | null {
    if (QB_READ_METHODS.has(method)) return 'SELECT';
    if (QB_INSERT_METHODS.has(method)) return 'INSERT';
    if (QB_UPDATE_METHODS.has(method)) return 'UPDATE';
    if (QB_DELETE_METHODS.has(method)) return 'DELETE';
    return null;
}

function extractFromChain(node: Parser.SyntaxNode): string | null {
    let current: Parser.SyntaxNode | null = node;
    while (current) {
        if (current.type === 'call_expression') {
            const func = current.childForFieldName('function');
            if (func && func.type === 'member_expression') {
                const prop = func.childForFieldName('property');
                if (prop && prop.text === 'from') {
                    return extractFirstStringArg(current);
                }
            }
        }
        if (current.type === 'member_expression') {
            const objChild = current.childForFieldName('object');
            if (objChild && objChild.type === 'call_expression') {
                const func = objChild.childForFieldName('function');
                if (func && func.type === 'member_expression') {
                    const prop = func.childForFieldName('property');
                    if (prop && prop.text === 'from') {
                        return extractFirstStringArg(objChild);
                    }
                }
                const result = extractFromChain(objChild);
                if (result) return result;
            }
        }
        current = current.parent;
    }
    return null;
}

function findChainRoot(node: Parser.SyntaxNode): string | null {
    let current: Parser.SyntaxNode | null = node;
    while (current) {
        if (current.type === 'identifier') return current.text;
        if (current.type === 'member_expression') {
            current = current.childForFieldName('object');
            continue;
        }
        if (current.type === 'call_expression') {
            current = current.childForFieldName('function');
            continue;
        }
        break;
    }
    return null;
}

function extractFirstStringArg(callNode: Parser.SyntaxNode): string | null {
    const args = callNode.childForFieldName('arguments');
    if (!args) return null;
    for (const child of args.children) {
        if (child.type === 'string' || child.type === 'template_string') {
            const text = child.text;
            if (text.startsWith("'") || text.startsWith('"')) return text.slice(1, -1);
            if (text.startsWith('`')) return text.slice(1, -1);
            return text;
        }
    }
    return null;
}

function findEnclosingFunctionName(node: Parser.SyntaxNode): string | null {
    let current: Parser.SyntaxNode | null = node.parent;
    while (current) {
        if (current.type === 'function_declaration' || current.type === 'method_definition') {
            const nameNode = current.childForFieldName('name');
            if (nameNode) return nameNode.text;
        }
        if (current.type === 'variable_declarator') {
            const nameNode = current.childForFieldName('name');
            const valueNode = current.childForFieldName('value');
            if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
                return nameNode.text;
            }
        }
        current = current.parent;
    }
    return null;
}

// ────────────────────────────────────────────────────────────────────────
// Node & Edge creation from extracted DB operations
// ────────────────────────────────────────────────────────────────────────

export function buildDBNodesAndEdges(
    dbOps: DBOperationInfo[],
    funcMap: Map<string, string>,
    fileId: string,
    filePath: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seenNodes = new Map<string, DBTableNode>();
    const seenEdges = new Set<string>();

    for (const op of dbOps) {
        const tableNodeId = createNodeId('db_table', filePath, op.tableName);

        // Create or update DBTableNode
        if (!seenNodes.has(tableNodeId)) {
            const tableNode: DBTableNode = {
                id: tableNodeId,
                type: 'db_table',
                name: op.tableName,
                operations: [op.operation],
            };
            seenNodes.set(tableNodeId, tableNode);
            nodes.push(tableNode);
        } else {
            const existing = seenNodes.get(tableNodeId)!;
            if (!existing.operations.includes(op.operation)) {
                existing.operations.push(op.operation);
            }
        }

        // Determine source function
        const sourceId = op.callerName === '__file__'
            ? fileId
            : funcMap.get(op.callerName) ?? fileId;

        const edgeKey = `${sourceId}->${tableNodeId}:${op.operation}`;
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);

        if (op.operation === 'SELECT') {
            const edge: ReadsFromEdge = {
                id: `${sourceId}->reads_from->${tableNodeId}`,
                type: 'READS_FROM',
                sourceId,
                targetId: tableNodeId,
                confidence: 0.85,
            };
            edges.push(edge);
        } else {
            const edgeOp = op.operation === 'INSERT' ? 'INSERT'
                : op.operation === 'UPDATE' ? 'UPDATE'
                : op.operation === 'DELETE' ? 'DELETE'
                : 'UPSERT';
            const edge: WritesToEdge = {
                id: `${sourceId}->writes_to->${tableNodeId}`,
                type: 'WRITES_TO',
                sourceId,
                targetId: tableNodeId,
                confidence: 0.85,
                operation: edgeOp as WritesToEdge['operation'],
            };
            edges.push(edge);
        }
    }

    return { nodes, edges };
}
