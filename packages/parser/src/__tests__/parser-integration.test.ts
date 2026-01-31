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

    it('resolves cross-file CALLS through barrel re-exports (export * from)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const sqlPath = path.join(tmpDir, 'db-schema', 'sql.ts');
            const pythonPath = path.join(tmpDir, 'db-schema', 'python.ts');
            const barrelPath = path.join(tmpDir, 'db-schema', 'index.ts');
            const parserPath = path.join(tmpDir, 'parser.ts');

            writeFile(sqlPath, `
export function extractDBSchemaFromSQL(content: string) {
  return [];
}
`);
            writeFile(pythonPath, `
export function extractDBSchemaFromPython(content: string) {
  return [];
}
`);
            writeFile(barrelPath, `
export * from './sql';
export * from './python';
`);
            writeFile(parserPath, `
import { extractDBSchemaFromSQL, extractDBSchemaFromPython } from './db-schema/index';
export function parseFile(content: string) {
  const sql = extractDBSchemaFromSQL(content);
  const py = extractDBSchemaFromPython(content);
  return [...sql, ...py];
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([sqlPath, pythonPath, barrelPath, parserPath]);

            const sqlResult = results.find(r => r.file.path === path.resolve(sqlPath));
            const pythonResult = results.find(r => r.file.path === path.resolve(pythonPath));
            const parserResult = results.find(r => r.file.path === path.resolve(parserPath));
            expect(sqlResult).toBeDefined();
            expect(pythonResult).toBeDefined();
            expect(parserResult).toBeDefined();

            const sqlFn = sqlResult!.nodes.find(n => n.type === 'function' && n.name === 'extractDBSchemaFromSQL');
            const pythonFn = pythonResult!.nodes.find(n => n.type === 'function' && n.name === 'extractDBSchemaFromPython');
            const parseFn = parserResult!.nodes.find(n => n.type === 'function' && n.name === 'parseFile');
            expect(sqlFn).toBeDefined();
            expect(pythonFn).toBeDefined();
            expect(parseFn).toBeDefined();

            // CALLS edges must exist through the barrel
            const callToSQL = parserResult!.edges.find(
                e => e.type === 'CALLS' && e.sourceId === parseFn!.id && e.targetId === sqlFn!.id,
            );
            expect(callToSQL).toBeDefined();

            const callToPython = parserResult!.edges.find(
                e => e.type === 'CALLS' && e.sourceId === parseFn!.id && e.targetId === pythonFn!.id,
            );
            expect(callToPython).toBeDefined();
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

    it('resolves namespace-imported callback references (import * as X, router.get(path, X.method))', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const controllerPath = path.join(tmpDir, 'controllers', 'userController.ts');
            const routesPath = path.join(tmpDir, 'routes', 'userRoutes.ts');

            writeFile(controllerPath, `
export async function getProfile(req: any, res: any) {
  res.json({ id: 1 });
}
export async function deleteProfile(req: any, res: any) {
  res.json({ deleted: true });
}
`);
            writeFile(routesPath, `
import * as userController from '../controllers/userController';
const router = { get: (..._args: any[]) => {}, delete: (..._args: any[]) => {} };
router.get('/profile', userController.getProfile);
router.delete('/profile', userController.deleteProfile);
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([controllerPath, routesPath]);

            const controllerResult = results.find(r => r.file.path === path.resolve(controllerPath));
            const routesResult = results.find(r => r.file.path === path.resolve(routesPath));
            expect(controllerResult).toBeDefined();
            expect(routesResult).toBeDefined();

            const getProfileFn = controllerResult!.nodes.find(
                n => n.type === 'function' && n.name === 'getProfile',
            );
            const deleteProfileFn = controllerResult!.nodes.find(
                n => n.type === 'function' && n.name === 'deleteProfile',
            );
            expect(getProfileFn).toBeDefined();
            expect(deleteProfileFn).toBeDefined();

            // CALLS edge from routes file → getProfile via namespace callback
            const callGetProfile = routesResult!.edges.find(
                e => e.type === 'CALLS' && e.targetId === getProfileFn!.id,
            );
            expect(callGetProfile).toBeDefined();

            // CALLS edge from routes file → deleteProfile via namespace callback
            const callDeleteProfile = routesResult!.edges.find(
                e => e.type === 'CALLS' && e.targetId === deleteProfileFn!.id,
            );
            expect(callDeleteProfile).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves await import() destructured function as CALLS edge', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const socketPath = path.join(tmpDir, 'lib', 'socket.ts');
            const servicePath = path.join(tmpDir, 'services', 'conversationService.ts');

            writeFile(socketPath, `
export async function createConversation(recipientId: string, msg: string) {
  return { id: '1' };
}
`);
            writeFile(servicePath, `
export const startConversation = async (recipientId: string, msg: string) => {
  const { createConversation: wsCreate } = await import('../lib/socket');
  const result = await wsCreate(recipientId, msg);
  return result;
};
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([socketPath, servicePath]);

            const socketResult = results.find(r => r.file.path === path.resolve(socketPath));
            const serviceResult = results.find(r => r.file.path === path.resolve(servicePath));
            expect(socketResult).toBeDefined();
            expect(serviceResult).toBeDefined();

            const createFn = socketResult!.nodes.find(
                n => n.type === 'function' && n.name === 'createConversation',
            );
            const startFn = serviceResult!.nodes.find(
                n => n.type === 'function' && n.name === 'startConversation',
            );
            expect(createFn).toBeDefined();
            expect(startFn).toBeDefined();

            // The await import destructuring should emit a call with calleeName 'wsCreate'
            // which is the local alias for createConversation
            const callInfo = serviceResult!.calls.find(
                c => c.calleeName === 'wsCreate',
            );
            expect(callInfo).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('tracks JSX <Component /> usage as CALLS edges', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const componentPath = path.join(tmpDir, 'utils', 'mapReactUtils.tsx');
            const pagePath = path.join(tmpDir, 'components', 'ListingsMap.tsx');

            writeFile(componentPath, `
export const MapListingPopup: React.FC<any> = ({ listing }) => {
  return listing.title;
};
export const DrawingModeHandler: React.FC<any> = ({ isDrawing }) => {
  return isDrawing;
};
`);
            writeFile(pagePath, `
import { MapListingPopup, DrawingModeHandler } from '../utils/mapReactUtils';
export function ListingsMap() {
  return (
    <div>
      <MapListingPopup listing={{}} />
      <DrawingModeHandler isDrawing={false} />
    </div>
  );
}
`);

            const engine = createParserEngine();
            const results = await engine.parseFiles([componentPath, pagePath]);

            const componentResult = results.find(r => r.file.path === path.resolve(componentPath));
            const pageResult = results.find(r => r.file.path === path.resolve(pagePath));
            expect(componentResult).toBeDefined();
            expect(pageResult).toBeDefined();

            // JSX call infos should be extracted for PascalCase components
            const jsxCalls = pageResult!.calls.filter(
                c => c.calleeName === 'MapListingPopup' || c.calleeName === 'DrawingModeHandler',
            );
            expect(jsxCalls.length).toBeGreaterThanOrEqual(2);

            // Verify they are attributed to the ListingsMap function
            const listingsMapCalls = jsxCalls.filter(c => c.callerName === 'ListingsMap');
            expect(listingsMapCalls.length).toBeGreaterThanOrEqual(2);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('tracks calls from export default function pages (Next.js pattern)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const servicePath = path.join(tmpDir, 'services', 'listingService.ts');
            const pagePath = path.join(tmpDir, 'app', 'page.tsx');

            writeFile(servicePath, `
export async function getFeaturedListings(limit: number) {
  return [];
}
`);
            writeFile(pagePath, `
import { getFeaturedListings } from '../services/listingService';
export default async function Home() {
  const listings = await getFeaturedListings(8);
  return listings;
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
                n => n.type === 'function' && n.name === 'Home',
            );
            expect(featuredFn).toBeDefined();
            expect(homeFn).toBeDefined();

            // Home must be exported
            expect((homeFn as any).isExported).toBe(true);

            // CALLS edge: Home → getFeaturedListings
            const callEdge = pageResult!.edges.find(
                e => e.type === 'CALLS' &&
                    e.sourceId === homeFn!.id &&
                    e.targetId === featuredFn!.id,
            );
            expect(callEdge).toBeDefined();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('FileNode includes lineCount property (not byte size)', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'counter.ts');
            writeFile(filePath, `export function count() {
  const a = 1;
  const b = 2;
  return a + b;
}
`);
            const engine = createParserEngine();
            const results = await engine.parseFiles([filePath]);
            const result = results[0]!;

            const fileNode = result.file;
            expect(fileNode.lineCount).toBeDefined();
            expect(fileNode.lineCount).toBe(6); // 5 code lines + 1 trailing newline
            // lineCount must NOT equal byte size
            expect(fileNode.lineCount).not.toBe(fileNode.size);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('extracts Supabase .from().insert().select() as INSERT not SELECT', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'messageService.ts');
            writeFile(filePath, `
import { supabaseAdmin } from '../config/supabase';

export async function createMessage(conversationId: string, content: string) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: conversationId, content })
    .select();
  return data;
}

export async function getMessages(conversationId: string) {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId);
  return data;
}
`);
            const engine = createParserEngine();
            const results = await engine.parseFiles([filePath]);
            const result = results[0]!;

            // Should find db_table nodes for 'messages'
            const dbTableNodes = result.nodes.filter(n => n.type === 'db_table');
            expect(dbTableNodes.length).toBeGreaterThanOrEqual(1);
            expect(dbTableNodes.some(n => (n as any).name === 'messages')).toBe(true);

            // Should have WRITES_TO edge (INSERT), not just READS_FROM
            const writesTo = result.edges.filter(e => e.type === 'WRITES_TO');
            expect(writesTo.length).toBeGreaterThanOrEqual(1);

            // Should also have READS_FROM edge for the select-only query
            const readsFrom = result.edges.filter(e => e.type === 'READS_FROM');
            expect(readsFrom.length).toBeGreaterThanOrEqual(1);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('resolves route handler names for identifier, member_expression, and call_expression patterns', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'routes.ts');
            writeFile(filePath, `
const router = { get: (..._a: any[]) => {}, post: (..._a: any[]) => {}, delete: (..._a: any[]) => {} };

function getUsers(_req: any, _res: any) {}
const ctrl = { deleteUser: (_req: any, _res: any) => {} };

router.get('/users', getUsers);
router.delete('/users/:id', ctrl.deleteUser);
router.post('/users', (_req: any, _res: any) => {});
`);
            const engine = createParserEngine();
            const results = await engine.parseFiles([filePath]);
            const result = results[0]!;

            const routes = result.nodes.filter(n => n.type === 'route');
            expect(routes.length).toBe(3);

            const getRoute = routes.find((r: any) => r.method === 'GET');
            expect((getRoute as any).handlerName).toBe('getUsers');

            const deleteRoute = routes.find((r: any) => r.method === 'DELETE');
            expect((deleteRoute as any).handlerName).toBe('ctrl.deleteUser');

            // Inline anonymous handler should fallback to 'anonymous'
            const postRoute = routes.find((r: any) => r.method === 'POST');
            expect((postRoute as any).handlerName).toBe('anonymous');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('bodyHash differs for functions with different bodies even if same structure', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomik-parser-'));
        try {
            const filePath = path.join(tmpDir, 'utils.ts');
            writeFile(filePath, `
export function add(a: number, b: number) {
  return a + b;
}

export function subtract(a: number, b: number) {
  return a - b;
}

export function redirectA() {
  return redirect('/a');
}

export function redirectB() {
  return redirect('/b');
}
`);
            const engine = createParserEngine();
            const results = await engine.parseFiles([filePath]);
            const result = results[0]!;

            const fns = result.nodes.filter(n => n.type === 'function') as any[];
            const add = fns.find(f => f.name === 'add');
            const sub = fns.find(f => f.name === 'subtract');
            const redA = fns.find(f => f.name === 'redirectA');
            const redB = fns.find(f => f.name === 'redirectB');

            expect(add).toBeDefined();
            expect(sub).toBeDefined();

            // Different bodies should have different hashes
            expect(add.bodyHash).not.toBe(sub.bodyHash);

            // Similar one-liner redirects have different bodies (different strings)
            expect(redA).toBeDefined();
            expect(redB).toBeDefined();
            expect(redA.bodyHash).not.toBe(redB.bodyHash);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
