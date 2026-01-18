import type { DBTableNode, DBColumnNode, GraphNode, GraphEdge } from '@nomik/core';
import { createNodeId } from '../utils.js';

export interface DBSchemaColumn {
    name: string;
    dataType?: string;
    nullable?: boolean;
}

export interface DBSchemaTable {
    name: string;
    schema?: string;
    columns: DBSchemaColumn[];
}

export function extractDBSchemaFromSQL(content: string): DBSchemaTable[] {
    const sql = stripSqlComments(content);
    const tables = new Map<string, DBSchemaTable>();

    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[\]\w.]+)\s*\(([\s\S]*?)\)\s*;/gi;
    let match: RegExpExecArray | null;
    while ((match = createTableRegex.exec(sql)) !== null) {
        const rawName = match[1] ?? '';
        const defs = match[2] ?? '';
        const table = parseTableName(rawName);
        if (!table.name) continue;

        const entry = tables.get(table.name) ?? { name: table.name, schema: table.schema, columns: [] };
        for (const col of extractSqlColumnsFromDefinition(defs)) {
            if (!entry.columns.some((c) => c.name === col.name)) entry.columns.push(col);
        }
        tables.set(entry.name, entry);
    }

    const alterAddRegex = /ALTER\s+TABLE\s+([`"\[\]\w.]+)\s+ADD\s+(?:COLUMN\s+)?([`"\[\]\w]+)\s+([A-Za-z][A-Za-z0-9_(),\s]*)/gi;
    while ((match = alterAddRegex.exec(sql)) !== null) {
        const table = parseTableName(match[1] ?? '');
        const colName = normalizeIdent(match[2] ?? '');
        if (!table.name || !colName) continue;

        const entry = tables.get(table.name) ?? { name: table.name, schema: table.schema, columns: [] };
        if (!entry.columns.some((c) => c.name === colName)) {
            entry.columns.push({ name: colName, dataType: (match[3] ?? '').trim() || undefined });
        }
        tables.set(entry.name, entry);
    }

    return [...tables.values()];
}

export function extractDBSchemaFromCSharpMigration(content: string): DBSchemaTable[] {
    const tables = new Map<string, DBSchemaTable>();

    const createTableRegex = /migrationBuilder\.CreateTable\s*\(([\s\S]*?)\);/gi;
    let match: RegExpExecArray | null;
    while ((match = createTableRegex.exec(content)) !== null) {
        const block = match[1] ?? '';
        const tableMatch = /name\s*:\s*"([^"]+)"/i.exec(block);
        const tableName = tableMatch?.[1]?.trim();
        if (!tableName) continue;

        const table = tables.get(tableName) ?? { name: tableName, columns: [] };
        const columnsBlockMatch = /columns\s*:\s*table\s*=>\s*new\s*\{([\s\S]*?)\}\s*,/i.exec(block);
        const columnsBlock = columnsBlockMatch?.[1] ?? '';
        const columnRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*table\.Column<([^>]+)>\(([^)]*)\)/g;
        let colMatch: RegExpExecArray | null;
        while ((colMatch = columnRegex.exec(columnsBlock)) !== null) {
            const colName = colMatch[1] ?? '';
            if (!colName) continue;
            const dataType = (colMatch[2] ?? '').trim() || undefined;
            const args = colMatch[3] ?? '';
            const nullableMatch = /nullable\s*:\s*(true|false)/i.exec(args);
            const nullable = nullableMatch ? nullableMatch[1]?.toLowerCase() === 'true' : undefined;
            if (!table.columns.some((c) => c.name === colName)) {
                table.columns.push({ name: colName, dataType, nullable });
            }
        }

        tables.set(table.name, table);
    }

    const addColumnRegex = /migrationBuilder\.AddColumn<([^>]+)>\s*\(\s*name\s*:\s*"([^"]+)"[\s\S]*?table\s*:\s*"([^"]+)"/gi;
    while ((match = addColumnRegex.exec(content)) !== null) {
        const dataType = (match[1] ?? '').trim() || undefined;
        const colName = (match[2] ?? '').trim();
        const tableName = (match[3] ?? '').trim();
        if (!tableName || !colName) continue;

        const table = tables.get(tableName) ?? { name: tableName, columns: [] };
        if (!table.columns.some((c) => c.name === colName)) {
            table.columns.push({ name: colName, dataType });
        }
        tables.set(table.name, table);
    }

    return [...tables.values()];
}

export function buildDBSchemaNodesAndEdges(
    tables: DBSchemaTable[],
    fileId: string,
    filePath: string,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seenNodeIds = new Set<string>();
    const seenEdgeIds = new Set<string>();

    for (const t of tables) {
        const tableNodeId = createNodeId('db_table', filePath, t.name);
        if (!seenNodeIds.has(tableNodeId)) {
            const tableNode: DBTableNode = {
                id: tableNodeId,
                type: 'db_table',
                name: t.name,
                schema: t.schema,
                operations: [],
            };
            nodes.push(tableNode);
            seenNodeIds.add(tableNodeId);
        }

        const fileContainsTableId = `${fileId}->contains->${tableNodeId}`;
        if (!seenEdgeIds.has(fileContainsTableId)) {
            edges.push({
                id: fileContainsTableId,
                type: 'CONTAINS',
                sourceId: fileId,
                targetId: tableNodeId,
                confidence: 1.0,
            });
            seenEdgeIds.add(fileContainsTableId);
        }

        for (const c of t.columns) {
            const colNodeId = createNodeId('db_column', filePath, `${t.name}.${c.name}`);
            if (!seenNodeIds.has(colNodeId)) {
                const colNode: DBColumnNode = {
                    id: colNodeId,
                    type: 'db_column',
                    name: c.name,
                    tableName: t.name,
                    dataType: c.dataType,
                    nullable: c.nullable,
                };
                nodes.push(colNode);
                seenNodeIds.add(colNodeId);
            }

            const tableContainsColId = `${tableNodeId}->contains->${colNodeId}`;
            if (!seenEdgeIds.has(tableContainsColId)) {
                edges.push({
                    id: tableContainsColId,
                    type: 'CONTAINS',
                    sourceId: tableNodeId,
                    targetId: colNodeId,
                    confidence: 1.0,
                });
                seenEdgeIds.add(tableContainsColId);
            }
        }
    }

    return { nodes, edges };
}

function stripSqlComments(sql: string): string {
    const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
    return noBlock.replace(/--.*$/gm, ' ');
}

function parseTableName(raw: string): { schema?: string; name: string } {
    const cleaned = raw
        .split('.')
        .map((p) => normalizeIdent(p))
        .filter(Boolean);
    if (cleaned.length === 0) return { name: '' };
    if (cleaned.length === 1) return { name: cleaned[0]! };
    return { schema: cleaned.slice(0, -1).join('.'), name: cleaned[cleaned.length - 1]! };
}

function extractSqlColumnsFromDefinition(defs: string): DBSchemaColumn[] {
    const cols: DBSchemaColumn[] = [];
    const parts = splitCommaAware(defs);

    for (const part of parts) {
        const line = part.trim();
        if (!line) continue;
        if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX|KEY)\b/i.test(line)) continue;

        const match = /^([`"\[]?[A-Za-z_][\w$]*[`"\]]?)\s+([A-Za-z][A-Za-z0-9_(),\s]*)/i.exec(line);
        if (!match) continue;

        const name = normalizeIdent(match[1] ?? '');
        if (!name) continue;
        const dataType = (match[2] ?? '').trim() || undefined;
        const nullable = !/\bNOT\s+NULL\b/i.test(line);
        cols.push({ name, dataType, nullable });
    }

    return cols;
}

function splitCommaAware(input: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (const ch of input) {
        if (ch === '(') depth++;
        if (ch === ')' && depth > 0) depth--;
        if (ch === ',' && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) parts.push(current);
    return parts;
}

function normalizeIdent(value: string): string {
    return value.trim().replace(/^[`"\[]/, '').replace(/[`"\]]$/, '').trim();
}
