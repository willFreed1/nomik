import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createParserEngine } from '../parser';

function writeFile(p: string, content: string): void {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf-8');
}

describe('parser integration regressions', () => {
    it('resolves cross-file middleware array aliases to underlying function calls', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const middlewarePath = path.join(tmpDir, 'sanitizeMiddleware.ts');
            const indexPath = path.join(tmpDir, 'index.ts');

            writeFile(middlewarePath, `
export function sanitizeQueryParams(req: any, _res: any, next: any) { next(); }
export function sanitizeBodyParams(req: any, _res: any, next: any) { next(); }
export const sanitizeInputs = [sanitizeQueryParams, sanitizeBodyParams];
`);

            writeFile(indexPath, `
import express from 'express';
import { sanitizeInputs } from './sanitizeMiddleware';
const app = express();
app.use(sanitizeInputs);
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([middlewarePath, indexPath]);

            const middlewareResult = results.find(r => r.file.path === path.resolve(middlewarePath));
            const indexResult = results.find(r => r.file.path === path.resolve(indexPath));

            expect(middlewareResult).toBeDefined();
            expect(indexResult).toBeDefined();

            const sanitizeBody = middlewareResult!.nodes.find(
                n => n.type === 'function' && n.name === 'sanitizeBodyParams',
            );
            const sanitizeInputsVar = middlewareResult!.nodes.find(
                n => n.type === 'variable' && n.name === 'sanitizeInputs',
            );

            expect(sanitizeBody).toBeDefined();
            expect(sanitizeInputsVar).toBeDefined();

            const crossFileCall = indexResult!.edges.find(
                e => e.type === 'CALLS' && e.targetId === sanitizeBody!.id,
            );
            expect(crossFileCall).toBeDefined();

            const aliasUsageEdge = indexResult!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === indexResult!.file.id &&
                    e.targetId === sanitizeInputsVar!.id,
            );
            expect(aliasUsageEdge).toBeDefined();

            const variableRefEdge = middlewareResult!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === sanitizeInputsVar!.id &&
                    e.targetId === sanitizeBody!.id,
            );
            expect(variableRefEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

