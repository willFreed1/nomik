import path from 'node:path';

export type SupportedLanguage = 'typescript' | 'javascript' | 'markdown' | 'python' | 'rust';

const extensionMap: Record<string, SupportedLanguage> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.md': 'markdown',
    '.py': 'python',
    '.pyw': 'python',
    '.rs': 'rust',
};

export function detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = path.extname(filePath).toLowerCase();
    return extensionMap[ext] ?? null;
}

export function isSupportedFile(filePath: string): boolean {
    return detectLanguage(filePath) !== null;
}

