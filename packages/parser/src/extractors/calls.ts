import type Parser from 'tree-sitter';

export interface CallInfo {
    callerName: string;
    calleeName: string;
    line: number;
    column: number;
    isMethodCall: boolean;
    isConstructor: boolean;
}

/** Extrait les appels de fonctions depuis l'AST, lies a leur fonction appelante */
export function extractCalls(tree: Parser.Tree, _filePath: string): CallInfo[] {
    const results: CallInfo[] = [];
    const seen = new Set<string>();

    function visit(node: Parser.SyntaxNode, currentFunction: string | null): void {
        let funcName = currentFunction;

        if (isFunctionLike(node)) {
            const name = resolveFuncName(node);
            if (name) funcName = name;
        }

        if (node.type === 'call_expression' && funcName) {
            const call = buildCallInfo(node, funcName, false);
            if (call) {
                const key = `${call.callerName}->${call.calleeName}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push(call);
                }
            }
        }

        if (node.type === 'new_expression' && funcName) {
            const call = buildCallInfo(node, funcName, true);
            if (call) {
                const key = `${call.callerName}->${call.calleeName}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push(call);
                }
            }
        }

        for (const child of node.namedChildren) {
            visit(child, funcName);
        }
    }

    visit(tree.rootNode, null);
    return results;
}

const NOISE = new Set([
    'require', 'import', 'console', 'JSON', 'Object', 'Array', 'Map', 'Set',
    'Promise', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Buffer',
    'Symbol', 'Error', 'RegExp', 'Date', 'Math', 'Proxy', 'Reflect',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
    'isNaN', 'isFinite', 'eval', 'fetch', 'alert', 'confirm', 'prompt',
]);

function isFunctionLike(node: Parser.SyntaxNode): boolean {
    return [
        'function_declaration',
        'method_definition',
        'arrow_function',
        'function',
        'generator_function_declaration',
    ].includes(node.type);
}

function resolveFuncName(node: Parser.SyntaxNode): string | null {
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

function buildCallInfo(node: Parser.SyntaxNode, callerName: string, isNew: boolean): CallInfo | null {
    const fn = node.childForFieldName('function') ?? node.childForFieldName('constructor');
    if (!fn) return null;

    let calleeName: string;
    let isMethodCall = false;

    if (fn.type === 'identifier') {
        calleeName = fn.text;
    } else if (fn.type === 'member_expression') {
        const obj = fn.childForFieldName('object');
        const property = fn.childForFieldName('property');
        if (!property) return null;
        calleeName = property.text;
        isMethodCall = true;
        if (obj && NOISE.has(obj.text)) return null;
    } else {
        return null;
    }

    if (NOISE.has(calleeName)) return null;
    if (calleeName === callerName) return null;
    if (calleeName.startsWith('_') && calleeName.length <= 2) return null;

    return {
        callerName,
        calleeName,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        isMethodCall,
        isConstructor: isNew,
    };
}
