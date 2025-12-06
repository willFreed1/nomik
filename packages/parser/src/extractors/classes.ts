import type Parser from 'tree-sitter';
import type { ClassNode } from '@genome/core';
import { createNodeId } from '../utils';

export function extractClasses(tree: Parser.Tree, filePath: string): ClassNode[] {
    const results: ClassNode[] = [];
    const cursor = tree.walk();

    function visit(): void {
        const node = cursor.currentNode;

        if (node.type === 'class_declaration' || node.type === 'abstract_class_declaration') {
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

    const superClass = extractSuperClass(node);
    const interfaces = extractInterfaces(node);
    const methods = extractMethodNames(node);
    const properties = extractPropertyNames(node);
    const decorators = extractClassDecorators(node);
    const isExported = node.parent?.type === 'export_statement';
    const isAbstract = node.type === 'abstract_class_declaration';

    return {
        id: createNodeId('class', filePath, name),
        type: 'class',
        name,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        isExported,
        isAbstract,
        superClass,
        interfaces,
        decorators,
        methods,
        properties,
    };
}

function extractSuperClass(node: Parser.SyntaxNode): string | undefined {
    const heritage = node.childForFieldName('superclass') ?? findChild(node, 'extends_clause');
    if (!heritage) return undefined;

    const typeNode = heritage.type === 'extends_clause'
        ? heritage.namedChildren[0]
        : heritage;
    return typeNode?.text;
}

function extractInterfaces(node: Parser.SyntaxNode): string[] {
    const impls = findChild(node, 'implements_clause');
    if (!impls) return [];
    return impls.namedChildren.map((c) => c.text);
}

function extractMethodNames(node: Parser.SyntaxNode): string[] {
    const body = node.childForFieldName('body');
    if (!body) return [];
    return body.namedChildren
        .filter((c: Parser.SyntaxNode) => c.type === 'method_definition')
        .map((c: Parser.SyntaxNode) => c.childForFieldName('name')?.text)
        .filter((n: string | undefined): n is string => n !== undefined);
}

function extractPropertyNames(node: Parser.SyntaxNode): string[] {
    const body = node.childForFieldName('body');
    if (!body) return [];
    return body.namedChildren
        .filter((c: Parser.SyntaxNode) => c.type === 'public_field_definition' || c.type === 'property_definition')
        .map((c: Parser.SyntaxNode) => c.childForFieldName('name')?.text)
        .filter((n: string | undefined): n is string => n !== undefined);
}

function extractClassDecorators(node: Parser.SyntaxNode): string[] {
    const decorators: string[] = [];
    const parent = node.parent;
    if (!parent) return decorators;
    for (const child of parent.children) {
        if (child === node) break;
        if (child.type === 'decorator') {
            decorators.push(child.text.replace(/^@/, ''));
        }
    }
    return decorators;
}

function findChild(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
    for (const child of node.namedChildren) {
        if (child.type === type) return child;
    }
    return null;
}
