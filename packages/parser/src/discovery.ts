import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { TargetConfig } from '@nomik/core';
import { isSupportedFile } from './languages/index';

/** Chemins a exclure meme si le glob les laisse passer (symlinks pnpm) */
const HARD_EXCLUDE = /[\\/](node_modules|dist|\.git|docker)[\\/]/;

export async function discoverFiles(config: TargetConfig): Promise<string[]> {
    const root = path.resolve(config.root);

    if (!fs.existsSync(root)) {
        throw new Error(`Target root does not exist: ${root}`);
    }

    const files = await glob(config.include, {
        cwd: root,
        ignore: config.exclude,
        absolute: true,
        nodir: true,
        follow: false,
    });

    return files
        .filter(f => !HARD_EXCLUDE.test(f))
        .filter(isSupportedFile)
        .sort();
}
