import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { getLogger } from '@nomik/core';
import type { GraphService } from '@nomik/graph';
import type { ParserEngine } from '@nomik/parser';
import { isSupportedFile } from '@nomik/parser';

export interface WatcherOptions {
    root: string;
    debounceMs?: number;
    ignored?: string[];
    projectId: string;
}

export interface WatcherService {
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
}

/** Cree un watcher qui met a jour le graphe incrementalement */
export function createWatcher(
    options: WatcherOptions,
    parser: ParserEngine,
    graph: GraphService,
): WatcherService {
    const logger = getLogger();
    const debounceMs = options.debounceMs ?? 500;
    let fsWatcher: FSWatcher | null = null;
    let running = false;

    const pendingFiles = new Map<string, NodeJS.Timeout>();

    /** Exclut les chemins node_modules, dist, .git, docker meme si les symlinks passent le glob chokidar */
    function isExcludedPath(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, '/');
        return /\/node_modules\//.test(normalized)
            || /\/dist\//.test(normalized)
            || /\/\.git\//.test(normalized)
            || /\/docker\//.test(normalized);
    }

    /** Re-parse et re-ingere un fichier modifie */
    async function handleFileChange(filePath: string): Promise<void> {
        const abs = path.resolve(filePath);
        if (isExcludedPath(abs)) return;
        if (!isSupportedFile(abs)) return;

        try {
            const result = await parser.parseFile(abs);
            await graph.ingestFileData(result.nodes, result.edges, result.file.path, options.projectId);
            logger.info({ filePath: abs, nodes: result.nodes.length, edges: result.edges.length }, 'file re-indexed');
        } catch (err) {
            logger.warn({ filePath: abs, error: err instanceof Error ? err.message : String(err) }, 'watch re-index failed');
        }
    }

    /** Debounce pour eviter les rafales de changements */
    function scheduleReindex(filePath: string): void {
        const existing = pendingFiles.get(filePath);
        if (existing) clearTimeout(existing);

        const timeout = setTimeout(() => {
            pendingFiles.delete(filePath);
            handleFileChange(filePath);
        }, debounceMs);
        pendingFiles.set(filePath, timeout);
    }

    async function start(): Promise<void> {
        if (running) return;

        const root = path.resolve(options.root);
        const ignored = options.ignored ?? ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/docker/**'];

        fsWatcher = watch(root, {
            ignored,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
        });

        fsWatcher.on('change', (fp) => scheduleReindex(fp as string));
        fsWatcher.on('add', (fp) => scheduleReindex(fp as string));
        fsWatcher.on('unlink', (fp) => {
            logger.debug({ filePath: fp }, 'file deleted');
        });

        running = true;
        logger.info({ root, debounceMs }, 'watcher started');
    }

    async function stop(): Promise<void> {
        if (!running || !fsWatcher) return;

        for (const timeout of pendingFiles.values()) {
            clearTimeout(timeout);
        }
        pendingFiles.clear();

        await fsWatcher.close();
        fsWatcher = null;
        running = false;
        logger.info('watcher stopped');
    }

    return {
        start,
        stop,
        isRunning: () => running,
    };
}
