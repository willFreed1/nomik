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

    it('disambiguates obj.method() cross-file calls using imported receiver provenance', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const backendLoggerPath = path.join(tmpDir, 'backend', 'utils', 'logger.ts');
            const webLoggerPath = path.join(tmpDir, 'web-app', 'utils', 'logger.ts');
            const middlewarePath = path.join(tmpDir, 'backend', 'middlewares', 'sanitizeMiddleware.ts');

            writeFile(backendLoggerPath, `
export const logger = {
  error(message: string) {
    return message;
  }
};
`);
            writeFile(webLoggerPath, `
export const logger = {
  error(message: string) {
    return message + 'web';
  }
};
`);
            writeFile(middlewarePath, `
import { logger } from '../utils/logger';
export function sanitizeBodyParams() {
  logger.error('x');
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([backendLoggerPath, webLoggerPath, middlewarePath]);

            const middlewareResult = results.find(r => r.file.path === path.resolve(middlewarePath));
            const backendLoggerResult = results.find(r => r.file.path === path.resolve(backendLoggerPath));
            const webLoggerResult = results.find(r => r.file.path === path.resolve(webLoggerPath));
            expect(middlewareResult).toBeDefined();
            expect(backendLoggerResult).toBeDefined();
            expect(webLoggerResult).toBeDefined();

            const sanitizeFn = middlewareResult!.nodes.find(
                n => n.type === 'function' && n.name === 'sanitizeBodyParams',
            );
            const backendErrorFn = backendLoggerResult!.nodes.find(
                n => n.type === 'function' && n.name === 'error',
            );
            const webErrorFn = webLoggerResult!.nodes.find(
                n => n.type === 'function' && n.name === 'error',
            );
            expect(sanitizeFn).toBeDefined();
            expect(backendErrorFn).toBeDefined();
            expect(webErrorFn).toBeDefined();

            const backendCall = middlewareResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === sanitizeFn!.id &&
                    e.targetId === backendErrorFn!.id,
            );
            expect(backendCall).toBeDefined();

            const webCall = middlewareResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === sanitizeFn!.id &&
                    e.targetId === webErrorFn!.id,
            );
            expect(webCall).toBeUndefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('does not treat next(error) variable flow as a callback reference', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const remotePath = path.join(tmpDir, 'remote', 'errorUtil.ts');
            const remoteNextPath = path.join(tmpDir, 'remote', 'nextUtil.ts');
            const middlewarePath = path.join(tmpDir, 'backend', 'middlewares', 'sanitizeMiddleware.ts');

            writeFile(remotePath, `
export function error() {
  return 'bad-edge-target';
}
`);
            writeFile(remoteNextPath, `
export function next() {
  return 'bad-next-target';
}
`);
            writeFile(middlewarePath, `
export function sanitizeBodyParams(next: any) {
  try {
    throw new Error('x');
  } catch (error) {
    next(error);
  }
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([remotePath, remoteNextPath, middlewarePath]);

            const middlewareResult = results.find(r => r.file.path === path.resolve(middlewarePath));
            const remoteResult = results.find(r => r.file.path === path.resolve(remotePath));
            const remoteNextResult = results.find(r => r.file.path === path.resolve(remoteNextPath));
            expect(middlewareResult).toBeDefined();
            expect(remoteResult).toBeDefined();
            expect(remoteNextResult).toBeDefined();

            const sanitizeFn = middlewareResult!.nodes.find(
                n => n.type === 'function' && n.name === 'sanitizeBodyParams',
            );
            const remoteErrorFn = remoteResult!.nodes.find(
                n => n.type === 'function' && n.name === 'error',
            );
            const remoteNextFn = remoteNextResult!.nodes.find(
                n => n.type === 'function' && n.name === 'next',
            );
            expect(sanitizeFn).toBeDefined();
            expect(remoteErrorFn).toBeDefined();
            expect(remoteNextFn).toBeDefined();

            const wrongEdge = middlewareResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === sanitizeFn!.id &&
                    e.targetId === remoteErrorFn!.id,
            );
            expect(wrongEdge).toBeUndefined();

            const wrongNextEdge = middlewareResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === sanitizeFn!.id &&
                    e.targetId === remoteNextFn!.id,
            );
            expect(wrongNextEdge).toBeUndefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('links const-arrow declaration variable to its function symbol', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'service.ts');
            writeFile(filePath, `
export const sanitizeBodyParams = () => {
  return true;
};
`);

            const engine = createParserEngine();
            const [result] = await engine.parseFiles([filePath]);
            expect(result).toBeDefined();

            const varNode = result!.nodes.find(
                n => n.type === 'variable' && n.name === 'sanitizeBodyParams',
            );
            const fnNode = result!.nodes.find(
                n => n.type === 'function' && n.name === 'sanitizeBodyParams',
            );
            expect(varNode).toBeDefined();
            expect(fnNode).toBeDefined();

            const declAliasEdge = result!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === varNode!.id &&
                    e.targetId === fnNode!.id,
            );
            expect(declAliasEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves @ aliases from extended tsconfig files', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const baseConfigPath = path.join(tmpDir, 'tsconfig.base.json');
            const webConfigPath = path.join(tmpDir, 'web-app', 'tsconfig.json');
            const mapUtilsPath = path.join(tmpDir, 'src', 'utils', 'mapUtils.ts');
            const listingsMapPath = path.join(tmpDir, 'web-app', 'src', 'components', 'ListingsMap.tsx');

            writeFile(baseConfigPath, `
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
`);
            writeFile(webConfigPath, `
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve"
  }
}
`);
            writeFile(mapUtilsPath, `
export function getDepartmentCode() { return '75'; }
`);
            writeFile(listingsMapPath, `
import { getDepartmentCode } from '@/utils/mapUtils';
export function renderMap() {
  return getDepartmentCode();
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([mapUtilsPath, listingsMapPath]);

            const mapUtilsResult = results.find(r => r.file.path === path.resolve(mapUtilsPath));
            const listingsMapResult = results.find(r => r.file.path === path.resolve(listingsMapPath));
            expect(mapUtilsResult).toBeDefined();
            expect(listingsMapResult).toBeDefined();

            const dependsOnEdge = listingsMapResult!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === listingsMapResult!.file.id &&
                    e.targetId === mapUtilsResult!.file.id,
            );
            expect(dependsOnEdge).toBeDefined();

            const moduleNode = listingsMapResult!.nodes.find(
                n => n.type === 'module' && n.name === '@/utils/mapUtils',
            );
            expect(moduleNode).toBeDefined();

            const importsEdge = listingsMapResult!.edges.find(
                e => e.type === 'IMPORTS' &&
                    e.sourceId === listingsMapResult!.file.id &&
                    e.targetId === moduleNode!.id,
            );
            expect(importsEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

