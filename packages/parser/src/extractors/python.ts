import type Parser from 'tree-sitter';
import type { FunctionNode, ClassNode, GraphEdge } from '@genome/core';
import { createNodeId } from '../utils';
import type { ImportInfo } from './imports';
import type { CallInfo } from './calls';

/** Extrait les fonctions Python (def, async def, methodes) */
export function extractPythonFunctions(tree: Parser.Tree, filePath: string): FunctionNode[] {
    const results: FunctionNode[] = [];
    const cursor = tree.walk();

    function visit(): void {
        const node = cursor.currentNode;

        if (node.type === 'function_definition') {
            const fn = buildFunctionNode(node, filePath);
            if (fn) results.push(fn);
        }

        if (cursor.gotoFirstChild()) {
            do { visit(); } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    visit();
    return results;
}

function buildFunctionNode(node: Parser.SyntaxNode, filePath: string): FunctionNode | null {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    const name = nameNode.text;

    const params = node.childForFieldName('parameters');
    const paramNames = params ? params.namedChildren
        .filter(c => c.type === 'identifier' || c.type === 'typed_parameter' || c.type === 'default_parameter')
        .map(c => {
            if (c.type === 'typed_parameter') return c.namedChildren.find(cc => cc.type === 'identifier')?.text ?? c.text;
            if (c.type === 'default_parameter') return c.childForFieldName('name')?.text ?? c.text;
            return c.text;
        })
        .filter(n => n !== 'self' && n !== 'cls') : [];

    const isAsync = node.parent?.type === 'decorated_definition'
        ? node.previousNamedSibling?.type === 'decorator' && false
        : node.text.startsWith('async');

    const decorators = extractDecorators(node);
    const isExported = !name.startsWith('_');

    return {
        id: createNodeId('function', filePath, name),
        type: 'function',
        name,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported,
        isAsync: node.text.trimStart().startsWith('async'),
        params: paramNames,
        isGenerator: node.text.includes('yield'),
        decorators,
        confidence: 1.0,
    };
}

function extractDecorators(node: Parser.SyntaxNode): string[] {
    const decorators: string[] = [];
    const parent = node.parent;
    if (parent?.type === 'decorated_definition') {
        for (const child of parent.namedChildren) {
            if (child.type === 'decorator') {
                decorators.push(child.text.replace(/^@/, ''));
            }
        }
    }
    return decorators;
}

/** Extrait les classes Python */
export function extractPythonClasses(tree: Parser.Tree, filePath: string): ClassNode[] {
    const results: ClassNode[] = [];
    const cursor = tree.walk();

    function visit(): void {
        const node = cursor.currentNode;

        if (node.type === 'class_definition') {
            const cls = buildClassNode(node, filePath);
            if (cls) results.push(cls);
        }

        if (cursor.gotoFirstChild()) {
            do { visit(); } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    visit();
    return results;
}

function buildClassNode(node: Parser.SyntaxNode, filePath: string): ClassNode | null {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return null;
    const name = nameNode.text;

    const superclasses = node.childForFieldName('superclasses');
    const bases = superclasses ? superclasses.namedChildren.map(c => c.text) : [];
    const superClass = bases[0];

    const body = node.childForFieldName('body');
    const methods = body ? body.namedChildren
        .filter(c => c.type === 'function_definition' || (c.type === 'decorated_definition' && c.namedChildren.some(cc => cc.type === 'function_definition')))
        .map(c => {
            const fn = c.type === 'function_definition' ? c : c.namedChildren.find(cc => cc.type === 'function_definition');
            return fn?.childForFieldName('name')?.text;
        })
        .filter((n): n is string => n !== undefined) : [];

    const classDecorators = extractDecorators(node);

    return {
        id: createNodeId('class', filePath, name),
        type: 'class',
        name,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported: !name.startsWith('_'),
        isAbstract: classDecorators.some(d => d.includes('abstract') || d.includes('ABC')),
        superClass,
        interfaces: bases.slice(1),
        decorators: classDecorators,
        methods,
        properties: [],
    };
}

/** Extrait les imports Python (import x, from x import y) */
export function extractPythonImports(tree: Parser.Tree, filePath: string): ImportInfo[] {
    const results: ImportInfo[] = [];
    const cursor = tree.walk();

    function visit(): void {
        const node = cursor.currentNode;

        if (node.type === 'import_statement') {
            const names = node.namedChildren.filter(c => c.type === 'dotted_name' || c.type === 'aliased_import');
            for (const n of names) {
                const source = n.type === 'aliased_import' ? (n.childForFieldName('name')?.text ?? n.text) : n.text;
                results.push({ source, specifiers: [source.split('.').pop() ?? source], isDefault: false, filePath, line: node.startPosition.row + 1 });
            }
        } else if (node.type === 'import_from_statement') {
            const module = node.childForFieldName('module_name')?.text ?? node.children.find(c => c.type === 'dotted_name' || c.type === 'relative_import')?.text ?? '';
            const names = node.namedChildren
                .filter(c => c.type === 'dotted_name' || c.type === 'aliased_import')
                .slice(1)
                .map(c => c.type === 'aliased_import' ? (c.childForFieldName('name')?.text ?? c.text) : c.text);
            if (names.length > 0) {
                results.push({ source: module, specifiers: names, isDefault: false, filePath, line: node.startPosition.row + 1 });
            }
        }

        if (cursor.gotoFirstChild()) {
            do { visit(); } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    visit();
    return results;
}

/** Extrait les appels de fonctions Python */
export function extractPythonCalls(tree: Parser.Tree, filePath: string): CallInfo[] {
    const results: CallInfo[] = [];
    const cursor = tree.walk();

    function visit(): void {
        const node = cursor.currentNode;

        if (node.type === 'call') {
            const funcNode = node.childForFieldName('function');
            if (funcNode) {
                const callerNode = findEnclosingFunction(node);
                results.push({
                    callerName: callerNode?.childForFieldName('name')?.text ?? '<module>',
                    calleeName: funcNode.text,
                    filePath,
                    line: node.startPosition.row + 1,
                });
            }
        }

        if (cursor.gotoFirstChild()) {
            do { visit(); } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    visit();
    return results;
}

function findEnclosingFunction(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    let current = node.parent;
    while (current) {
        if (current.type === 'function_definition') return current;
        current = current.parent;
    }
    return null;
}
