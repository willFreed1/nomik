import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import { extractPythonFunctions, extractPythonClasses, extractPythonImports, extractPythonCalls } from '../extractors/python';

let parser: Parser;

async function getParser(): Promise<Parser> {
    if (parser) return parser;
    parser = new Parser();
    const mod = await import('tree-sitter-python');
    const lang = (mod as any).default ?? mod;
    parser.setLanguage(lang as Parser.Language);
    return parser;
}

function parse(code: string) {
    return getParser().then(p => p.parse(code));
}

const SAMPLE_PY = `
import os
import sys
from pathlib import Path
from typing import List, Optional

class BaseService:
    """Service de base"""
    def __init__(self, name: str):
        self.name = name

    def start(self):
        pass

class UserService(BaseService):
    """Gestion des utilisateurs"""
    _cache = {}

    def __init__(self, db):
        super().__init__("user")
        self.db = db

    async def get_user(self, user_id: int) -> Optional[dict]:
        result = self.db.query(user_id)
        return result

    def list_users(self) -> List[dict]:
        return self.db.find_all()

def create_app(config: dict) -> "App":
    """Cree l'application principale"""
    service = UserService(config["db"])
    service.start()
    return App(service)

async def main():
    app = create_app({"db": None})
    user = await app.service.get_user(1)
    print(user)
`;

describe('extractPythonFunctions', () => {
    it('extrait les fonctions Python avec parametres', async () => {
        const tree = await parse(SAMPLE_PY);
        const fns = extractPythonFunctions(tree, '/app/main.py');

        const names = fns.map(f => f.name);
        expect(names).toContain('create_app');
        expect(names).toContain('main');
        expect(names).toContain('__init__');
        expect(names).toContain('start');
        expect(names).toContain('get_user');
        expect(names).toContain('list_users');
    });

    it('detecte les fonctions async', async () => {
        const tree = await parse(SAMPLE_PY);
        const fns = extractPythonFunctions(tree, '/app/main.py');

        const mainFn = fns.find(f => f.name === 'main');
        expect(mainFn?.isAsync).toBe(true);

        const getUser = fns.find(f => f.name === 'get_user');
        expect(getUser?.isAsync).toBe(true);

        const createApp = fns.find(f => f.name === 'create_app');
        expect(createApp?.isAsync).toBe(false);
    });

    it('extrait les parametres sans self/cls', async () => {
        const tree = await parse(SAMPLE_PY);
        const fns = extractPythonFunctions(tree, '/app/main.py');

        const createApp = fns.find(f => f.name === 'create_app');
        expect(createApp?.params).toContain('config');
    });
});

describe('extractPythonClasses', () => {
    it('extrait les classes avec heritage', async () => {
        const tree = await parse(SAMPLE_PY);
        const classes = extractPythonClasses(tree, '/app/main.py');

        expect(classes.length).toBe(2);

        const base = classes.find(c => c.name === 'BaseService');
        expect(base).toBeDefined();
        expect(base?.superClass).toBeUndefined();

        const user = classes.find(c => c.name === 'UserService');
        expect(user).toBeDefined();
        expect(user?.superClass).toBe('BaseService');
    });

    it('extrait les methodes de la classe', async () => {
        const tree = await parse(SAMPLE_PY);
        const classes = extractPythonClasses(tree, '/app/main.py');

        const user = classes.find(c => c.name === 'UserService');
        expect(user?.methods).toContain('__init__');
        expect(user?.methods).toContain('get_user');
        expect(user?.methods).toContain('list_users');
    });
});

describe('extractPythonImports', () => {
    it('extrait import et from...import', async () => {
        const tree = await parse(SAMPLE_PY);
        const imports = extractPythonImports(tree, '/app/main.py');

        const sources = imports.map(i => i.source);
        expect(sources).toContain('os');
        expect(sources).toContain('sys');
        expect(sources).toContain('pathlib');
        expect(sources).toContain('typing');
    });

    it('extrait les specifiers du from...import', async () => {
        const tree = await parse(SAMPLE_PY);
        const imports = extractPythonImports(tree, '/app/main.py');

        const typingImport = imports.find(i => i.source === 'typing');
        expect(typingImport?.specifiers).toContain('List');
        expect(typingImport?.specifiers).toContain('Optional');
    });
});

describe('extractPythonCalls', () => {
    it('extrait les appels de fonctions', async () => {
        const tree = await parse(SAMPLE_PY);
        const calls = extractPythonCalls(tree, '/app/main.py');

        const callNames = calls.map(c => c.calleeName);
        expect(callNames).toContain('UserService');
        expect(callNames).toContain('print');
    });
});
