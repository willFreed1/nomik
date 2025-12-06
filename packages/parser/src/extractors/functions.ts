import type Parser from 'tree-sitter';
import type { FunctionNode, ParameterInfo } from '@genome/core';
import { createNodeId } from '../utils';

export function extractFunctions(tree: Parser.Tree, filePath: string): FunctionNode[] {
    const results: FunctionNode[] = [];
    const cursor = tree.walk();

    function visit(): void {
        const node = cursor.currentNode;

        if (isFunctionLike(node)) {
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

function isFunctionLike(node: Parser.SyntaxNode): boolean {
    return [
        'function_declaration',
        'method_definition',
        'arrow_function',
        'function',
        'generator_function_declaration',
    ].includes(node.type);
}

function buildFunctionNode(node: Parser.SyntaxNode, filePath: string): FunctionNode | null {
    const name = resolveFunctionName(node);
    if (!name) return null;

    const params = extractParameters(node);
    const returnType = extractReturnType(node);
    const isAsync = hasModifier(node, 'async');
    const isExported = isNodeExported(node);
    const isGenerator = node.type === 'generator_function_declaration' || hasModifier(node, '*');
    const decorators = extractDecorators(node);

    return {
        id: createNodeId('function', filePath, name),
        type: 'function',
        name,
        filePath,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        params,
        returnType,
        isAsync,
        isExported,
        isGenerator,
        decorators,
        confidence: 1.0,
    };
}

function resolveFunctionName(node: Parser.SyntaxNode): string | null {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return nameNode.text;

    if (node.type === 'arrow_function' || node.type === 'function') {
        const parent = node.parent;
        if (parent?.type === 'variable_declarator') {
            return parent.childForFieldName('name')?.text ?? null;
        }
        if (parent?.type === 'pair') {
            return parent.childForFieldName('key')?.text ?? null;
        }
    }

    return null;
}

function extractParameters(node: Parser.SyntaxNode): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    const paramsNode = node.childForFieldName('parameters');
    if (!paramsNode) return params;

    for (const child of paramsNode.namedChildren) {
        if (child.type === 'required_parameter' || child.type === 'optional_parameter') {
            const pattern = child.childForFieldName('pattern');
            const typeAnnotation = child.childForFieldName('type');
            params.push({
                name: pattern?.text ?? child.text,
                type: typeAnnotation?.text?.replace(/^:\s*/, ''),
                optional: child.type === 'optional_parameter',
                defaultValue: child.childForFieldName('value')?.text,
            });
        } else if (child.type === 'identifier') {
            params.push({ name: child.text, optional: false });
        }
    }
    return params;
}

function extractReturnType(node: Parser.SyntaxNode): string | undefined {
    const returnType = node.childForFieldName('return_type');
    return returnType?.text?.replace(/^:\s*/, '');
}

function hasModifier(node: Parser.SyntaxNode, modifier: string): boolean {
    for (const child of node.children) {
        if (child.text === modifier) return true;
    }
    const parent = node.parent;
    if (parent) {
        for (const child of parent.children) {
            if (child === node) break;
            if (child.text === modifier) return true;
        }
    }
    return false;
}

function isNodeExported(node: Parser.SyntaxNode): boolean {
    const parent = node.parent;
    if (parent?.type === 'export_statement') return true;
    if (parent?.type === 'lexical_declaration' && parent.parent?.type === 'export_statement') {
        return true;
    }
    return false;
}

function extractDecorators(node: Parser.SyntaxNode): string[] {
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
