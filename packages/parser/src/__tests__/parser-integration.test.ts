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

    it('creates symbol dependency edges for barrel re-exports', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const servicePath = path.join(tmpDir, 'lib', 'graph.service.ts');
            const indexPath = path.join(tmpDir, 'lib', 'index.ts');
            const appPath = path.join(tmpDir, 'app.ts');

            writeFile(servicePath, `
export function createGraphService() {
  return true;
}
`);

            writeFile(indexPath, `
export { createGraphService } from './graph.service';
`);

            writeFile(appPath, `
import { createGraphService } from './lib';
export function boot() {
  return createGraphService();
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([servicePath, indexPath, appPath]);

            const serviceResult = results.find(r => r.file.path === path.resolve(servicePath));
            const indexResult = results.find(r => r.file.path === path.resolve(indexPath));
            expect(serviceResult).toBeDefined();
            expect(indexResult).toBeDefined();

            const createGraphServiceFn = serviceResult!.nodes.find(
                n => n.type === 'function' && n.name === 'createGraphService',
            );
            expect(createGraphServiceFn).toBeDefined();

            const reExportSymbolEdge = indexResult!.edges.find(
                e => e.type === 'DEPENDS_ON'
                    && e.sourceId === indexResult!.file.id
                    && e.targetId === createGraphServiceFn!.id,
            );
            expect(reExportSymbolEdge).toBeDefined();
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

    it('does not index local closure helper variables as top-level function symbols', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'socketMetrics.ts');
            writeFile(filePath, `
export function instrumentSocket(socket: any) {
  const originalOn = socket.on.bind(socket);
  socket.on = ((event: string, listener: (...args: any[]) => void) => {
    const wrapped = (...args: any[]) => listener(...args);
    return originalOn(event, wrapped);
  }) as any;
}
`);

            const engine = createParserEngine();
            const [result] = await engine.parseFiles([filePath]);
            expect(result).toBeDefined();

            const wrappedFn = result!.nodes.find(
                n => n.type === 'function' && n.name === 'wrapped',
            );
            expect(wrappedFn).toBeUndefined();

            const instrumentFn = result!.nodes.find(
                n => n.type === 'function' && n.name === 'instrumentSocket',
            );
            expect(instrumentFn).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves alias-imported function calls across files', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const servicePath = path.join(tmpDir, 'listingService.ts');
            const pagePath = path.join(tmpDir, 'page.tsx');

            writeFile(servicePath, `
export function getFeaturedListings() {
  return [];
}
`);
            writeFile(pagePath, `
import { getFeaturedListings as getFeatured } from './listingService';
export function HomePage() {
  return getFeatured();
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([servicePath, pagePath]);

            const serviceResult = results.find(r => r.file.path === path.resolve(servicePath));
            const pageResult = results.find(r => r.file.path === path.resolve(pagePath));
            expect(serviceResult).toBeDefined();
            expect(pageResult).toBeDefined();

            const featuredFn = serviceResult!.nodes.find(
                n => n.type === 'function' && n.name === 'getFeaturedListings',
            );
            const homeFn = pageResult!.nodes.find(
                n => n.type === 'function' && n.name === 'HomePage',
            );
            expect(featuredFn).toBeDefined();
            expect(homeFn).toBeDefined();

            const crossCall = pageResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === homeFn!.id &&
                    e.targetId === featuredFn!.id,
            );
            expect(crossCall).toBeDefined();

            const importSymbolRef = pageResult!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === pageResult!.file.id &&
                    e.targetId === featuredFn!.id,
            );
            expect(importSymbolRef).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves typed route-handler member callbacks (controller.method as Type)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const controllerPath = path.join(tmpDir, 'categoryController.ts');
            const routesPath = path.join(tmpDir, 'categoryRoutes.ts');

            writeFile(controllerPath, `
export const categoryController = {
  getCategoryBySlug(_req: any, _res: any) {
    return true;
  }
};
`);
            writeFile(routesPath, `
import { categoryController } from './categoryController';
const router = { get: (..._args: any[]) => {} };
router.get('/slug/:slug', categoryController.getCategoryBySlug as any);
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([controllerPath, routesPath]);

            const controllerResult = results.find(r => r.file.path === path.resolve(controllerPath));
            const routesResult = results.find(r => r.file.path === path.resolve(routesPath));
            expect(controllerResult).toBeDefined();
            expect(routesResult).toBeDefined();

            const targetFn = controllerResult!.nodes.find(
                n => n.type === 'function' && n.name === 'getCategoryBySlug',
            );
            expect(targetFn).toBeDefined();

            const incoming = routesResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === routesResult!.file.id &&
                    e.targetId === targetFn!.id,
            );
            expect(incoming).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves dynamic import then-destructured function usage', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const audioPath = path.join(tmpDir, 'audioUtils.ts');
            const socketPath = path.join(tmpDir, 'SocketContext.tsx');

            writeFile(audioPath, `
export const playMessageSound = () => true;
`);
            writeFile(socketPath, `
export function onMessage() {
  import('./audioUtils').then(({ playMessageSound }) => {
    playMessageSound();
  });
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([audioPath, socketPath]);

            const audioResult = results.find(r => r.file.path === path.resolve(audioPath));
            const socketResult = results.find(r => r.file.path === path.resolve(socketPath));
            expect(audioResult).toBeDefined();
            expect(socketResult).toBeDefined();

            const soundFn = audioResult!.nodes.find(
                n => n.type === 'function' && n.name === 'playMessageSound',
            );
            const onMessageFn = socketResult!.nodes.find(
                n => n.type === 'function' && n.name === 'onMessage',
            );
            expect(soundFn).toBeDefined();
            expect(onMessageFn).toBeDefined();

            const crossCall = socketResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === onMessageFn!.id &&
                    e.targetId === soundFn!.id,
            );
            expect(crossCall).toBeDefined();
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

    it('resolves @/ alias imports with direct tsconfig paths (Next.js project)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            // Mimic: web-app/tsconfig.json with "@/*": ["./src/*"]
            const tsconfigPath = path.join(tmpDir, 'web-app', 'tsconfig.json');
            const servicePath = path.join(tmpDir, 'web-app', 'src', 'services', 'userService.ts');
            const pagePath = path.join(tmpDir, 'web-app', 'src', 'app', 'users', 'page.tsx');

            // Use realistic JSONC content with glob patterns that trigger the
            // block comment regex bug: /* in "src/*" looks like a comment opener,
            // */ in "**/*.ts" looks like a closer, destroying the paths block.
            writeFile(tsconfigPath, `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "src/*": ["./src/*"],
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}`);

            writeFile(servicePath, `
export function getUserProfile(id: string) {
  return { id };
}
`);
            writeFile(pagePath, `
import { getUserProfile } from '@/services/userService';
export default function UserProfilePage() {
  const profile = getUserProfile('123');
  return profile;
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([servicePath, pagePath]);

            const serviceResult = results.find(r => r.file.path === path.resolve(servicePath));
            const pageResult = results.find(r => r.file.path === path.resolve(pagePath));
            expect(serviceResult).toBeDefined();
            expect(pageResult).toBeDefined();

            const getUserProfileFn = serviceResult!.nodes.find(
                n => n.type === 'function' && n.name === 'getUserProfile',
            );
            expect(getUserProfileFn).toBeDefined();

            // DEPENDS_ON file-to-file edge must exist
            const dependsOnFile = pageResult!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === pageResult!.file.id &&
                    e.targetId === serviceResult!.file.id,
            );
            expect(dependsOnFile).toBeDefined();

            // DEPENDS_ON file-to-function (import symbol ref) edge must exist
            const dependsOnFn = pageResult!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === pageResult!.file.id &&
                    e.targetId === getUserProfileFn!.id,
            );
            expect(dependsOnFn).toBeDefined();

            // CALLS edge from UserProfilePage → getUserProfile must exist
            const userPageFn = pageResult!.nodes.find(
                n => n.type === 'function' && n.name === 'UserProfilePage',
            );
            expect(userPageFn).toBeDefined();

            const callEdge = pageResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === userPageFn!.id &&
                    e.targetId === getUserProfileFn!.id,
            );
            expect(callEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('detects isExported for export const arrow functions', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'utils.ts');
            writeFile(filePath, `
export const playMessageSound = () => {
  const audio = new Audio('/msg.mp3');
  audio.play();
};
export function formatDistance(meters: number): string {
  return meters + 'm';
}
export const throttle = (fn: Function, delay: number) => {
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([filePath]);
            const result = results[0]!;

            const playFn = result.nodes.find(n => n.type === 'function' && n.name === 'playMessageSound');
            const formatFn = result.nodes.find(n => n.type === 'function' && n.name === 'formatDistance');
            const throttleFn = result.nodes.find(n => n.type === 'function' && n.name === 'throttle');

            expect(playFn).toBeDefined();
            expect(formatFn).toBeDefined();
            expect(throttleFn).toBeDefined();

            expect((playFn as any).isExported).toBe(true);
            expect((formatFn as any).isExported).toBe(true);
            expect((throttleFn as any).isExported).toBe(true);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('traces intra-file function calls (helper called within same module)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'usePageTracking.ts');
            // Exact real-world pattern: getSessionId (private const arrow at module scope)
            // called inside trackPageView (nested const arrow inside useEffect callback)
            // within usePageTracking (module-scope export const arrow).
            // The nested arrow must NOT create a new caller scope — calls inside it
            // should be attributed to the enclosing module-scope function.
            writeFile(filePath, `
import { useEffect } from 'react';
const getSessionId = (): string => {
  return 'sess_123';
};
export const usePageTracking = () => {
  useEffect(() => {
    const trackPageView = async () => {
      const sessionId = getSessionId();
      console.log(sessionId);
    };
    trackPageView();
  }, []);
};
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([filePath]);
            const result = results[0]!;

            const getSessionFn = result.nodes.find(n => n.type === 'function' && n.name === 'getSessionId');
            const useTrackingFn = result.nodes.find(n => n.type === 'function' && n.name === 'usePageTracking');
            expect(getSessionFn).toBeDefined();
            expect(useTrackingFn).toBeDefined();

            const callEdge = result.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === useTrackingFn!.id &&
                    e.targetId === getSessionFn!.id,
            );
            expect(callEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves namespace import method calls (import * as X then X.method())', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const servicePath = path.join(tmpDir, 'listingService.ts');
            const pagePath = path.join(tmpDir, 'editPage.tsx');

            writeFile(servicePath, `
export function updateListing(id: string, data: any) {
  return fetch('/api/listings/' + id, { method: 'PUT', body: JSON.stringify(data) });
}
export function deleteListing(id: string) {
  return fetch('/api/listings/' + id, { method: 'DELETE' });
}
`);
            writeFile(pagePath, `
import * as listingService from './listingService';
export default function EditListingPage() {
  listingService.updateListing('123', { title: 'test' });
  return null;
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([servicePath, pagePath]);

            const serviceResult = results.find(r => r.file.path === path.resolve(servicePath));
            const pageResult = results.find(r => r.file.path === path.resolve(pagePath));
            expect(serviceResult).toBeDefined();
            expect(pageResult).toBeDefined();

            const updateFn = serviceResult!.nodes.find(n => n.type === 'function' && n.name === 'updateListing');
            expect(updateFn).toBeDefined();

            const pageFn = pageResult!.nodes.find(n => n.type === 'function' && n.name === 'EditListingPage');
            expect(pageFn).toBeDefined();

            // CALLS edge from EditListingPage → updateListing via namespace import
            const callEdge = pageResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === pageFn!.id &&
                    e.targetId === updateFn!.id,
            );
            expect(callEdge).toBeDefined();

            // Granularity check: DEPENDS_ON should exist for updateListing (accessed)
            // but NOT for deleteListing (not accessed via listingService.deleteListing)
            const deleteFn = serviceResult!.nodes.find(n => n.type === 'function' && n.name === 'deleteListing');
            expect(deleteFn).toBeDefined();

            const dependsOnUpdate = pageResult!.edges.find(
                e => e.type === 'DEPENDS_ON' && e.targetId === updateFn!.id,
            );
            expect(dependsOnUpdate).toBeDefined();

            const dependsOnDelete = pageResult!.edges.find(
                e => e.type === 'DEPENDS_ON' && e.targetId === deleteFn!.id,
            );
            expect(dependsOnDelete).toBeUndefined(); // Must NOT exist — prevents false negatives
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('does not create cross-file CALLS for name collisions (local shadows remote)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            // format.ts exports formatNumber
            const formatPath = path.join(tmpDir, 'format.ts');
            writeFile(formatPath, `
export function formatNumber(n: number): string {
  return n.toLocaleString();
}
`);
            // consumer.ts does NOT import formatNumber from format.ts
            // but defines its own local formatNumber and calls it
            const consumerPath = path.join(tmpDir, 'consumer.ts');
            writeFile(consumerPath, `
import { something } from './format';
const formatNumber = (n: number) => String(n);
export function render() {
  return formatNumber(42);
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([formatPath, consumerPath]);

            const formatResult = results.find(r => r.file.path === path.resolve(formatPath));
            const consumerResult = results.find(r => r.file.path === path.resolve(consumerPath));
            expect(formatResult).toBeDefined();
            expect(consumerResult).toBeDefined();

            const remoteFn = formatResult!.nodes.find(n => n.type === 'function' && n.name === 'formatNumber');
            expect(remoteFn).toBeDefined();

            // No CALLS edge should point to format.ts::formatNumber — the call targets the local shadow
            const badEdge = consumerResult!.edges.find(
                e => e.type === 'CALLS' && e.targetId === remoteFn!.id,
            );
            expect(badEdge).toBeUndefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('allows controller→service same-name method delegation (no local shadow for method calls)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const servicePath = path.join(tmpDir, 'categoryService.ts');
            writeFile(servicePath, `
export async function getAllCategories(filters: any) {
  return [];
}
`);
            const controllerPath = path.join(tmpDir, 'categoryController.ts');
            writeFile(controllerPath, `
import * as categoryService from './categoryService';
export async function getAllCategories(req: any, res: any) {
  const cats = await categoryService.getAllCategories(req.query);
  res.json(cats);
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([servicePath, controllerPath]);

            const serviceResult = results.find(r => r.file.path === path.resolve(servicePath));
            const controllerResult = results.find(r => r.file.path === path.resolve(controllerPath));
            expect(serviceResult).toBeDefined();
            expect(controllerResult).toBeDefined();

            const serviceFn = serviceResult!.nodes.find(n => n.type === 'function' && n.name === 'getAllCategories');
            const controllerFn = controllerResult!.nodes.find(n => n.type === 'function' && n.name === 'getAllCategories');
            expect(serviceFn).toBeDefined();
            expect(controllerFn).toBeDefined();

            // Controller must have a CALLS edge to service — method call receiver disambiguates
            const callEdge = controllerResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === controllerFn!.id &&
                    e.targetId === serviceFn!.id,
            );
            expect(callEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves dynamic import().then() destructured function as cross-file CALLS', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const audioPath = path.join(tmpDir, 'audioUtils.ts');
            const consumerPath = path.join(tmpDir, 'SocketContext.tsx');

            writeFile(audioPath, `
export const playMessageSound = () => {
  const audio = new Audio('/msg.mp3');
  audio.play();
};
`);
            writeFile(consumerPath, `
export function handleNewMessage(msg: any) {
  import('./audioUtils').then(({ playMessageSound }) => playMessageSound());
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([audioPath, consumerPath]);

            const audioResult = results.find(r => r.file.path === path.resolve(audioPath));
            const consumerResult = results.find(r => r.file.path === path.resolve(consumerPath));
            expect(audioResult).toBeDefined();
            expect(consumerResult).toBeDefined();

            const playFn = audioResult!.nodes.find(n => n.type === 'function' && n.name === 'playMessageSound');
            expect(playFn).toBeDefined();

            // The dynamic import should create a DEPENDS_ON file edge
            const dependsOn = consumerResult!.edges.find(
                e => e.type === 'DEPENDS_ON' &&
                    e.sourceId === consumerResult!.file.id &&
                    e.targetId === audioResult!.file.id,
            );
            expect(dependsOn).toBeDefined();

            // The then-destructured call should create a CALLS edge
            const handleFn = consumerResult!.nodes.find(n => n.type === 'function' && n.name === 'handleNewMessage');
            expect(handleFn).toBeDefined();

            const callEdge = consumerResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === handleFn!.id &&
                    e.targetId === playFn!.id,
            );
            expect(callEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

