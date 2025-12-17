import type { SupportedLanguage } from './registry';

export interface LanguageGrammar {
    language: SupportedLanguage;
    extensions: string[];
    load: () => Promise<unknown>;
}

const typescriptGrammar: LanguageGrammar = {
    language: 'typescript',
    extensions: ['.ts', '.tsx'],
    async load() {
        const { default: TypeScript } = await import('tree-sitter-typescript');
        return TypeScript.typescript;
    },
};

const javascriptGrammar: LanguageGrammar = {
    language: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    async load() {
        const { default: JavaScript } = await import('tree-sitter-javascript');
        return JavaScript;
    },
};

const pythonGrammar: LanguageGrammar = {
    language: 'python',
    extensions: ['.py', '.pyw'],
    async load() {
        const { default: Python } = await import('tree-sitter-python');
        return Python;
    },
};

const rustGrammar: LanguageGrammar = {
    language: 'rust',
    extensions: ['.rs'],
    async load() {
        const { default: Rust } = await import('tree-sitter-rust');
        return Rust;
    },
};

/** Grammaires tree-sitter par langage (markdown n'utilise pas tree-sitter) */
export const grammars: Partial<Record<SupportedLanguage, LanguageGrammar>> = {
    typescript: typescriptGrammar,
    javascript: javascriptGrammar,
    python: pythonGrammar,
    rust: rustGrammar,
};
