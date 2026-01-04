import type Parser from 'tree-sitter';

export interface CallInfo {
    callerName: string;
    calleeName: string;
    receiverName?: string;
    line: number;
    column: number;
    isMethodCall: boolean;
    isConstructor: boolean;
}

export type ArrayCallbackAliases = Map<string, string[]>;

/** Extract function calls from the AST — includes obj.method() and config references */
export function extractCalls(tree: Parser.Tree, _filePath: string): CallInfo[] {
    const results: CallInfo[] = [];
    const seen = new Set<string>();
    // Callback aliases stored in arrays:
    // const middleware = [fnA, fnB] then app.use(middleware)
    const arrayCallbackRefs = extractArrayCallbackAliases(tree);

    function push(call: CallInfo): void {
        const key = `${call.callerName}->${call.calleeName}->${call.receiverName ?? ''}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push(call);
        }
    }

    function visit(node: Parser.SyntaxNode, currentFunction: string | null): void {
        let funcName = currentFunction;

        if (isFunctionLike(node) && isTrackedFunctionScope(node)) {
            const name = resolveFuncName(node);
            if (name) funcName = name;
        }

        // Function calls: fn() and obj.method()
        if (node.type === 'call_expression') {
            const caller = funcName ?? '__file__';
            const call = buildCallInfo(node, caller, false);
            if (call) push(call);
        }

        // Constructor calls: new Class()
        if (node.type === 'new_expression') {
            const caller = funcName ?? '__file__';
            const call = buildCallInfo(node, caller, true);
            if (call) push(call);
        }

        // Function references in object properties:
        // { someFunction } (shorthand) or { key: someFunction } (identifier as value)
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

        // Function references passed as arguments: fn(callback), arr.map(handler)
        // Includes member_expression: router.get('/path', controller.method)
        if (node.type === 'arguments') {
            const callbackContext = isLikelyCallbackArgumentContext(node);
            for (const arg of node.namedChildren) {
                if (callbackContext && arg.type === 'identifier' && !NOISE.has(arg.text)) {
                    const caller = funcName ?? '__file__';
                    push({
                        callerName: caller,
                        calleeName: arg.text,
                        line: arg.startPosition.row + 1,
                        column: arg.startPosition.column,
                        isMethodCall: false,
                        isConstructor: false,
                    });
                    // Resolve array aliases: app.use(sanitizeInputs) => sanitizeQueryParams/sanitizeBodyParams
                    const aliasedCallbacks = arrayCallbackRefs.get(arg.text);
                    if (aliasedCallbacks) {
                        for (const cbName of aliasedCallbacks) {
                            push({
                                callerName: caller,
                                calleeName: cbName,
                                line: arg.startPosition.row + 1,
                                column: arg.startPosition.column,
                                isMethodCall: false,
                                isConstructor: false,
                            });
                        }
                    }
                }
                // member_expression as callback: controller.method, service.handler
                // e.g. router.get('/path', attributeController.getAllSets)
                if (callbackContext && arg.type === 'member_expression') {
                    const property = arg.childForFieldName('property');
                    const obj = arg.childForFieldName('object');
                    if (property && !NOISE.has(property.text)) {
                        const objName = obj?.type === 'identifier' ? obj.text : null;
                        if (!objName || (!NOISE.has(objName) && !OBJ_NOISE.has(objName))) {
                            const caller = funcName ?? '__file__';
                            push({
                                callerName: caller,
                                calleeName: property.text,
                                receiverName: objName ?? undefined,
                                line: arg.startPosition.row + 1,
                                column: arg.startPosition.column,
                                isMethodCall: true,
                                isConstructor: false,
                            });
                        }
                    }
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

/** Extract callback aliases declared as arrays.
 * Example: const sanitizeInputs = [sanitizeQueryParams, sanitizeBodyParams]
 */
export function extractArrayCallbackAliases(tree: Parser.Tree): ArrayCallbackAliases {
    const aliases: ArrayCallbackAliases = new Map();

    function visit(node: Parser.SyntaxNode): void {
        if (node.type === 'variable_declarator') {
            const nameNode = node.childForFieldName('name');
            const valueNode = node.childForFieldName('value');
            if (nameNode?.type === 'identifier' && valueNode?.type === 'array') {
                const refs: string[] = [];
                for (const item of valueNode.namedChildren) {
                    if (item.type === 'identifier' && !NOISE.has(item.text)) {
                        refs.push(item.text);
                        continue;
                    }
                    if (item.type === 'member_expression') {
                        const property = item.childForFieldName('property');
                        const obj = item.childForFieldName('object');
                        const objName = obj?.type === 'identifier' ? obj.text : null;
                        if (
                            property &&
                            !NOISE.has(property.text) &&
                            (!objName || (!NOISE.has(objName) && !OBJ_NOISE.has(objName)))
                        ) {
                            refs.push(property.text);
                        }
                    }
                }
                if (refs.length > 0) aliases.set(nameNode.text, refs);
            }
        }
        for (const child of node.namedChildren) {
            visit(child);
        }
    }

    visit(tree.rootNode);
    return aliases;
}

function isLikelyCallbackArgumentContext(argsNode: Parser.SyntaxNode): boolean {
    const parentCall = argsNode.parent;
    if (!parentCall || parentCall.type !== 'call_expression') return false;
    const fn = parentCall.childForFieldName('function');
    if (!fn) return false;

    if (fn.type === 'identifier') {
        return CALLBACK_ARG_CALLEES.has(fn.text);
    }
    if (fn.type === 'member_expression') {
        const property = fn.childForFieldName('property');
        return !!property && CALLBACK_ARG_CALLEES.has(property.text);
    }
    return false;
}

/** Ignored names: builtins, stdlib, common constructors */
const NOISE = new Set([
    'require', 'import', 'console', 'JSON', 'Object', 'Array', 'Map', 'Set',
    'Promise', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Buffer',
    'Symbol', 'Error', 'RegExp', 'Date', 'Math', 'Proxy', 'Reflect',
    'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
    'isNaN', 'isFinite', 'eval', 'fetch', 'alert', 'confirm', 'prompt',
]);

const CALLBACK_ARG_CALLEES = new Set([
    // Express/router style callback containers
    'use', 'all', 'get', 'post', 'put', 'patch', 'delete',
    // Event and promise callback containers
    'on', 'once', 'off', 'then', 'catch', 'finally', 'addEventListener',
    // Common JS callback containers
    'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
    'setTimeout', 'setInterval',
]);

/** Node/browser stdlib objects — filter noisy obj.method() calls */
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

function isTrackedFunctionScope(node: Parser.SyntaxNode): boolean {
    // Keep function-scope tracking aligned with the function extractor
    // to avoid callerName values that cannot be resolved to real symbols.
    if (node.type === 'method_definition' && node.parent?.type === 'object') {
        if (!isModuleScopeObjectLiteral(node.parent)) return false;
    }
    if ((node.type === 'arrow_function' || node.type === 'function') && node.parent?.type === 'pair') {
        const body = node.childForFieldName('body');
        if (node.type === 'arrow_function' && body && body.type !== 'statement_block') return false;
        if (!isModuleScopeObjectLiteral(node.parent.parent)) return false;
    }
    return true;
}

function isModuleScopeObjectLiteral(node: Parser.SyntaxNode | null | undefined): boolean {
    if (!node || node.type !== 'object') return false;
    const declarator = node.parent;
    if (!declarator || declarator.type !== 'variable_declarator') return false;
    const declaration = declarator.parent;
    if (!declaration) return false;
    if (declaration.type !== 'lexical_declaration' && declaration.type !== 'variable_declaration') return false;
    const container = declaration.parent;
    if (!container) return false;
    return container.type === 'program' || container.type === 'export_statement';
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
    let receiverName: string | undefined;

    if (fn.type === 'identifier') {
        calleeName = fn.text;
    } else if (fn.type === 'member_expression') {
        const obj = fn.childForFieldName('object');
        const property = fn.childForFieldName('property');
        if (!property) return null;
        calleeName = property.text;
        isMethodCall = true;
        // Filter stdlib calls: console.log, path.resolve, fs.readFileSync, etc.
        if (obj) {
            const objName = obj.type === 'identifier' ? obj.text : null;
            if (objName && (NOISE.has(objName) || OBJ_NOISE.has(objName))) return null;
            receiverName = objName ?? undefined;
        }
    } else {
        return null;
    }

    if (NOISE.has(calleeName)) return null;
    if (calleeName.startsWith('_') && calleeName.length <= 2) return null;

    return {
        callerName,
        calleeName,
        receiverName,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
        isMethodCall,
        isConstructor: isNew,
    };
}
