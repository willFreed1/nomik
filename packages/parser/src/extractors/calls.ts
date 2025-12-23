import type Parser from 'tree-sitter';

export interface CallInfo {
    callerName: string;
    calleeName: string;
    line: number;
    column: number;
    isMethodCall: boolean;
    isConstructor: boolean;
}

/** Extrait les appels de fonctions depuis l'AST — inclut obj.method() et references config */
export function extractCalls(tree: Parser.Tree, _filePath: string): CallInfo[] {
    const results: CallInfo[] = [];
    const seen = new Set<string>();

    function push(call: CallInfo): void {
        const key = `${call.callerName}->${call.calleeName}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push(call);
        }
    }

    function visit(node: Parser.SyntaxNode, currentFunction: string | null): void {
        let funcName = currentFunction;

        if (isFunctionLike(node)) {
            const name = resolveFuncName(node);
            if (name) funcName = name;
        }

        // Appels de fonctions : fn() et obj.method()
        if (node.type === 'call_expression') {
            const caller = funcName ?? '__file__';
            const call = buildCallInfo(node, caller, false);
            if (call) push(call);
        }

        // Constructeurs : new Class()
        if (node.type === 'new_expression') {
            const caller = funcName ?? '__file__';
            const call = buildCallInfo(node, caller, true);
            if (call) push(call);
        }

        // References de fonctions dans les proprietes d'objets
        // { someFunction } (shorthand) ou { key: someFunction } (identifiant comme valeur)
        if (node.type === 'shorthand_property_identifier') {
            const name = node.text;
            if (name && !NOISE.has(name)) {
                const caller = funcName ?? '__file__';
                push({
                    callerName: caller,
                    calleeName: name,
                    line: node.startPosition.row + 1,
                    column: node.startPosition.column,
                    isMethodCall: false,
                    isConstructor: false,
                });
            }
        }

        if (node.type === 'pair') {
            const value = node.childForFieldName('value');
            if (value?.type === 'identifier' && !NOISE.has(value.text)) {
                const caller = funcName ?? '__file__';
                push({
                    callerName: caller,
                    calleeName: value.text,
                    line: value.startPosition.row + 1,
                    column: value.startPosition.column,
                    isMethodCall: false,
                    isConstructor: false,
                });
            }
        }

        // References de fonctions passees en argument : fn(callback), arr.map(handler)
        if (node.type === 'arguments') {
            for (const arg of node.namedChildren) {
                if (arg.type === 'identifier' && !NOISE.has(arg.text)) {
                    const caller = funcName ?? '__file__';
                    push({
                        callerName: caller,
                        calleeName: arg.text,
                        line: arg.startPosition.row + 1,
                        column: arg.startPosition.column,
                        isMethodCall: false,
                        isConstructor: false,
                    });
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

/** Noms ignores : builtins, stdlib, constructeurs standard */
const NOISE = new Set([
    'require', 'import', 'console', 'JSON', 'Object', 'Array', 'Map', 'Set',
    'Promise', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Buffer',
    'Symbol', 'Error', 'RegExp', 'Date', 'Math', 'Proxy', 'Reflect',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
    'isNaN', 'isFinite', 'eval', 'fetch', 'alert', 'confirm', 'prompt',
]);

/** Objets stdlib node/browser — filtrage pour obj.method() */
const OBJ_NOISE = new Set([
    'console', 'JSON', 'Object', 'Array', 'Map', 'Set', 'Promise', 'Math',
    'Date', 'RegExp', 'Error', 'Buffer', 'Proxy', 'Reflect',
    'path', 'fs', 'os', 'process', 'child_process', 'util', 'url', 'crypto',
    'http', 'https', 'net', 'stream', 'events', 'zlib',
    'window', 'document', 'navigator', 'location', 'history',
    'localStorage', 'sessionStorage',
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
        // Filtrer les appels stdlib : console.log, path.resolve, fs.readFileSync, etc.
        if (obj) {
            const objName = obj.type === 'identifier' ? obj.text : null;
            if (objName && (NOISE.has(objName) || OBJ_NOISE.has(objName))) return null;
        }
    } else {
        return null;
    }

    if (NOISE.has(calleeName)) return null;
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
