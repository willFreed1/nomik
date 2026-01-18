import { describe, it, expect } from 'vitest';
import { extractDBSchemaFromSQL, extractDBSchemaFromCSharpMigration, buildDBSchemaNodesAndEdges } from '../extractors/db-schema';

describe('db-schema extractor (sql)', () => {
    it('extracts table + columns from CREATE TABLE and ALTER TABLE ADD COLUMN', () => {
        const sql = `
            CREATE TABLE users (
              id INT NOT NULL,
              email VARCHAR(255),
              created_at TIMESTAMP
            );

            ALTER TABLE users ADD COLUMN is_active BOOLEAN;
        `;

        const tables = extractDBSchemaFromSQL(sql);
        expect(tables.length).toBe(1);
        expect(tables[0]?.name).toBe('users');
        expect(tables[0]?.columns.some(c => c.name === 'id')).toBe(true);
        expect(tables[0]?.columns.some(c => c.name === 'email')).toBe(true);
        expect(tables[0]?.columns.some(c => c.name === 'is_active')).toBe(true);
    });
});

describe('db-schema extractor (csharp migration)', () => {
    it('extracts table + columns from migrationBuilder.CreateTable/AddColumn', () => {
        const cs = `
            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "Users",
                type: "nvarchar(max)",
                nullable: true);
        `;

        const tables = extractDBSchemaFromCSharpMigration(cs);
        expect(tables.length).toBe(1);
        expect(tables[0]?.name).toBe('Users');
        expect(tables[0]?.columns.some(c => c.name === 'Id')).toBe(true);
        expect(tables[0]?.columns.some(c => c.name === 'Email')).toBe(true);
        expect(tables[0]?.columns.some(c => c.name === 'Phone')).toBe(true);
    });
});

describe('buildDBSchemaNodesAndEdges', () => {
    it('builds DBTable/DBColumn nodes and CONTAINS edges', () => {
        const schema = [{
            name: 'users',
            columns: [{ name: 'id' }, { name: 'email' }],
        }];
        const { nodes, edges } = buildDBSchemaNodesAndEdges(schema, 'file-id', '/tmp/migration.sql');

        expect(nodes.some(n => n.type === 'db_table' && (n as any).name === 'users')).toBe(true);
        expect(nodes.some(n => n.type === 'db_column' && (n as any).name === 'id')).toBe(true);
        expect(edges.some(e => e.type === 'CONTAINS' && e.sourceId === 'file-id')).toBe(true);
        expect(edges.filter(e => e.type === 'CONTAINS').length).toBeGreaterThanOrEqual(3);
    });
});
