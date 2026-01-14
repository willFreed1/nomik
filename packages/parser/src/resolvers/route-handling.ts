import type { CallsEdge, ClassNode, ExtendsEdge, HandlesEdge, ImplementsEdge } from '@nomik/core';
import type { GraphNode, RouteNode } from '@nomik/core';

// ────────────────────────────────────────────────────────────────────────
// Route handling, extends, implements, framework entry
// ────────────────────────────────────────────────────────────────────────

/** Resolution des edges EXTENDS (heritage de classe) */
export function resolveExtendsEdges(
    classes: ClassNode[],
    _funcMap: Map<string, string>,
    _filePath: string,
): ExtendsEdge[] {
    const edges: ExtendsEdge[] = [];
    const classMap = new Map<string, string>();
    for (const cls of classes) {
        classMap.set(cls.name, cls.id);
    }

    for (const cls of classes) {
        if (!cls.superClass) continue;
        const parentId = classMap.get(cls.superClass);
        if (!parentId) continue;
        edges.push({
            id: `${cls.id}->extends->${parentId}`,
            type: 'EXTENDS' as const,
            sourceId: cls.id,
            targetId: parentId,
            confidence: 1.0,
        });
    }
    return edges;
}

/** Resolution des edges IMPLEMENTS (interfaces) */
export function resolveImplementsEdges(
    classes: ClassNode[],
    _filePath: string,
): ImplementsEdge[] {
    const edges: ImplementsEdge[] = [];
    const classMap = new Map<string, string>();
    for (const cls of classes) {
        classMap.set(cls.name, cls.id);
    }

    for (const cls of classes) {
        for (const iface of cls.interfaces) {
            const targetId = classMap.get(iface);
            if (!targetId) continue;
            edges.push({
                id: `${cls.id}->implements->${targetId}`,
                type: 'IMPLEMENTS' as const,
                sourceId: cls.id,
                targetId,
                confidence: 1.0,
            });
        }
    }
    return edges;
}

/** Resolution des edges HANDLES : Route → handler function (intra-fichier)
 *  Cree un lien semantique entre un noeud Route et la fonction qui le gere
 *  Gere les handlers locaux et les member_expression (controller.method)
 */
export function resolveRouteHandlesEdges(
    routes: GraphNode[],
    funcMap: Map<string, string>,
): HandlesEdge[] {
    const edges: HandlesEdge[] = [];
    for (const node of routes) {
        if (node.type !== 'route') continue;
        const route = node as RouteNode;
        if (!route.handlerName || route.handlerName === 'anonymous') continue;

        const methodName = extractHandlerMethodName(route.handlerName);
        const targetId = funcMap.get(methodName);
        if (targetId) {
            edges.push({
                id: `${route.id}->handles->${targetId}`,
                type: 'HANDLES' as const,
                sourceId: route.id,
                targetId,
                confidence: 0.9,
                middleware: route.middleware ?? [],
            });
        }
    }
    return edges;
}

/** Resolution des edges HANDLES cross-fichier : Route → Function dans un autre fichier
 *  Cas typique : attributeRoutes.ts contient router.get('/sets', attributeController.getAllSets)
 *  mais getAllSets est defini dans attributeController.ts
 */
export function resolveCrossFileHandlesEdges(
    nodes: GraphNode[],
    localIds: Set<string>,
    multiMap: Map<string, string[]>,
): HandlesEdge[] {
    const edges: HandlesEdge[] = [];
    const seen = new Set<string>();

    for (const node of nodes) {
        if (node.type !== 'route') continue;
        const route = node as RouteNode;
        if (!route.handlerName || route.handlerName === 'anonymous') continue;

        const methodName = extractHandlerMethodName(route.handlerName);
        const candidateIds = multiMap.get(methodName) ?? [];

        // Only target functions in OTHER files (cross-file)
        const remoteIds = candidateIds.filter((id) => !localIds.has(id));
        for (const targetId of remoteIds) {
            const key = `${route.id}->${targetId}`;
            if (seen.has(key)) continue;
            seen.add(key);

            edges.push({
                id: `${route.id}->handles->${targetId}`,
                type: 'HANDLES' as const,
                sourceId: route.id,
                targetId,
                confidence: 0.85,
                middleware: route.middleware ?? [],
            });
        }
    }
    return edges;
}

/** Extrait le nom de methode depuis un handlerName (supporte "controller.method" et "method") */
export function extractHandlerMethodName(handlerName: string): string {
    return handlerName.includes('.')
        ? handlerName.split('.').pop()!
        : handlerName;
}

// ────────────────────────────────────────────────────────────────────────
// Framework Entry Point Detection (Next.js, Nuxt, etc.)
// ────────────────────────────────────────────────────────────────────────

/** Framework entry point patterns — fonctions automatiquement invoquees par le framework */
const FRAMEWORK_ENTRY_PATTERNS: Array<{
    filePattern: RegExp;
    functionNames: string[];
}> = [
    // Next.js middleware (src/middleware.ts or middleware.ts)
    { filePattern: /[\\/]middleware\.(ts|js|tsx|jsx)$/, functionNames: ['middleware'] },
    // Next.js API routes (app/**/route.ts — GET, POST, PUT, DELETE, PATCH exports)
    { filePattern: /[\\/]route\.(ts|js|tsx|jsx)$/, functionNames: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] },
    // Next.js page components (app/**/page.tsx — default export)
    { filePattern: /[\\/]page\.(ts|js|tsx|jsx)$/, functionNames: ['default', 'Page'] },
    // Next.js layout components (app/**/layout.tsx)
    { filePattern: /[\\/]layout\.(ts|js|tsx|jsx)$/, functionNames: ['default', 'Layout', 'RootLayout'] },
    // Next.js loading/error/not-found
    { filePattern: /[\\/](loading|error|not-found|global-error)\.(ts|js|tsx|jsx)$/, functionNames: ['default'] },
    // next.config.js lifecycle hooks
    { filePattern: /[\\/]next\.config\.(js|mjs|ts)$/, functionNames: ['rewrites', 'redirects', 'headers'] },
    // Nuxt plugins/middleware
    { filePattern: /[\\/]plugins[\\/]/, functionNames: ['default'] },
    // Express/Fastify main app entry
    { filePattern: /[\\/](app|server|index)\.(ts|js)$/, functionNames: ['default', 'app', 'server'] },
];

/** Cree des edges File → CALLS → Function pour les fonctions auto-invoquees par le framework
 *  Empeche les entry points framework d'etre flag dead code
 */
export function resolveFrameworkEntryEdges(
    fileNode: { id: string; path: string },
    functions: { id: string; name: string }[],
): CallsEdge[] {
    const edges: CallsEdge[] = [];

    for (const pattern of FRAMEWORK_ENTRY_PATTERNS) {
        if (!pattern.filePattern.test(fileNode.path)) continue;

        for (const fn of functions) {
            if (pattern.functionNames.includes(fn.name)) {
                edges.push({
                    id: `${fileNode.id}->framework->${fn.id}`,
                    type: 'CALLS' as const,
                    sourceId: fileNode.id,
                    targetId: fn.id,
                    confidence: 0.95,
                    line: 0,
                });
            }
        }
    }

    return edges;
}
