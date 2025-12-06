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

export const grammars: Record<SupportedLanguage, LanguageGrammar> = {
    typescript: typescriptGrammar,
    javascript: javascriptGrammar,
};
