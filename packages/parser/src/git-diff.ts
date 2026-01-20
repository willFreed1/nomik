import { execSync } from 'node:child_process';
import path from 'node:path';

// ────────────────────────────────────────────────────────────────────────
// Git Diff Parser — extracts changed files and line ranges from git diff
// ────────────────────────────────────────────────────────────────────────

export interface DiffFile {
    filePath: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    changedLines: number[];
}

export interface DiffSummary {
    baseBranch: string;
    files: DiffFile[];
    totalChangedFiles: number;
    totalChangedLines: number;
}

/**
 * Parse git diff between current HEAD and a base branch/commit.
 * Returns structured info about changed files and line ranges.
 */
export function getGitDiff(base: string = 'main', cwd?: string): DiffSummary {
    const opts: { encoding: 'utf-8'; stdio: ['pipe', 'pipe', 'pipe']; cwd?: string } = { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd };

    // Get merge-base to handle diverged branches
    let mergeBase: string;
    try {
        mergeBase = execSync(`git merge-base ${base} HEAD`, opts).trim();
    } catch {
        // If merge-base fails (e.g., no common ancestor), fall back to direct diff
        mergeBase = base;
    }

    // Get list of changed files with status
    const nameStatus = execSync(`git diff --name-status ${mergeBase}`, opts).trim();
    if (!nameStatus) {
        return { baseBranch: base, files: [], totalChangedFiles: 0, totalChangedLines: 0 };
    }

    const files: DiffFile[] = [];
    let totalChangedLines = 0;

    for (const line of nameStatus.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const statusChar = parts[0]!.charAt(0);
        const filePath = parts[parts.length - 1]!; // For renames, take the new path

        let status: DiffFile['status'];
        switch (statusChar) {
            case 'A': status = 'added'; break;
            case 'D': status = 'deleted'; break;
            case 'R': status = 'renamed'; break;
            default: status = 'modified'; break;
        }

        // Get changed line numbers from unified diff
        const changedLines: number[] = [];
        if (status !== 'deleted') {
            try {
                const diff = execSync(`git diff -U0 ${mergeBase} -- "${filePath}"`, opts);
                const hunkPattern = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/gm;
                let hm: RegExpExecArray | null;
                while ((hm = hunkPattern.exec(diff)) !== null) {
                    const start = parseInt(hm[1]!, 10);
                    const count = hm[2] !== undefined ? parseInt(hm[2], 10) : 1;
                    for (let i = 0; i < count; i++) {
                        changedLines.push(start + i);
                    }
                }
            } catch {
                // File might be binary or unavailable
            }
        }

        totalChangedLines += changedLines.length;
        const absPath = cwd ? path.resolve(cwd, filePath) : path.resolve(filePath);
        files.push({ filePath: absPath, status, changedLines });
    }

    return {
        baseBranch: base,
        files,
        totalChangedFiles: files.length,
        totalChangedLines,
    };
}

/**
 * Given changed lines and a list of functions with their line ranges,
 * find which functions were modified.
 */
export interface FunctionLineRange {
    name: string;
    id: string;
    startLine: number;
    endLine: number;
}

export function findChangedFunctions(
    changedLines: number[],
    functions: FunctionLineRange[],
): FunctionLineRange[] {
    if (changedLines.length === 0 || functions.length === 0) return [];

    const changedSet = new Set(changedLines);
    return functions.filter(fn =>
        fn.startLine > 0 && fn.endLine > 0 &&
        Array.from({ length: fn.endLine - fn.startLine + 1 }, (_, i) => fn.startLine + i)
            .some(line => changedSet.has(line)),
    );
}
