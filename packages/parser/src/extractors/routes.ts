import type Parser from 'tree-sitter';
import type { RouteNode } from '@genome/core';
import { createNodeId } from '../utils';

export function extractRoutes(tree: Parser.Tree, filePath: string): RouteNode[] {
    const results: RouteNode[] = [];
    const cursor = tree.walk();

    function visit(): void {
        const node = cursor.currentNode;

        const route = tryExpressRoute(node, filePath)
            ?? tryDecoratorRoute(node, filePath);
        if (route) results.push(route);

        if (cursor.gotoFirstChild()) {
            do { visit(); } while (cursor.gotoNextSibling());
            cursor.gotoParent();
        }
    }

    visit();
    return results;
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'all'] as const;

function tryExpressRoute(node: Parser.SyntaxNode, filePath: string): RouteNode | null {
    if (node.type !== 'call_expression') return null;

    const fn = node.childForFieldName('function');
    if (!fn || fn.type !== 'member_expression') return null;

    const property = fn.childForFieldName('property');
    if (!property) return null;

    const methodName = property.text.toLowerCase();
    if (!HTTP_METHODS.includes(methodName as typeof HTTP_METHODS[number])) return null;

    const args = node.childForFieldName('arguments');
    if (!args || args.namedChildren.length < 2) return null;

    const pathArg = args.namedChildren[0];
    if (!pathArg) return null;
    const routePath = pathArg.text.replace(/['"]/g, '');

    const lastArg = args.namedChildren[args.namedChildren.length - 1];
    const handlerName = resolveHandlerName(lastArg);

    const middleware = args.namedChildren
        .slice(1, -1)
        .map((a: Parser.SyntaxNode) => a.text)
        .filter((t: string) => t !== undefined);

    const method = methodName.toUpperCase() as RouteNode['method'];

    return {
        id: createNodeId('route', filePath, `${method}:${routePath}`),
        type: 'route',
        method,
        path: routePath,
        handlerName: handlerName ?? 'anonymous',
        filePath,
        middleware,
    };
}

function tryDecoratorRoute(node: Parser.SyntaxNode, filePath: string): RouteNode | null {
    if (node.type !== 'decorator') return null;

    const expr = node.namedChildren[0];
    if (!expr || expr.type !== 'call_expression') return null;

    const fn = expr.childForFieldName('function');
    if (!fn) return null;

    const decoratorName = fn.text.toLowerCase();
    const methodMatch = HTTP_METHODS.find((m) => decoratorName.includes(m));
    if (!methodMatch) return null;

    const args = expr.childForFieldName('arguments');
    const pathArg = args?.namedChildren[0];
    const routePath = pathArg?.text?.replace(/['"]/g, '') ?? '/';

    const sibling = node.nextNamedSibling;
    const handlerName = sibling?.childForFieldName('name')?.text ?? 'anonymous';
    const method = methodMatch.toUpperCase() as RouteNode['method'];

    return {
        id: createNodeId('route', filePath, `${method}:${routePath}`),
        type: 'route',
        method,
        path: routePath,
        handlerName,
        filePath,
        middleware: [],
    };
}

function resolveHandlerName(node: Parser.SyntaxNode | undefined): string | null {
    if (!node) return null;
    if (node.type === 'identifier') return node.text;
    if (node.type === 'member_expression') return node.text;
    if (node.type === 'arrow_function' || node.type === 'function') {
        return node.childForFieldName('name')?.text ?? null;
    }
    return null;
}
