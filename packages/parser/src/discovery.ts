import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { TargetConfig } from '@genome/core';
import { isSupportedFile } from './languages/index';

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
    });

    return files.filter(isSupportedFile).sort();
}
