import type { GraphDriver } from '../drivers/driver.interface.js';

// ────────────────────────────────────────────────────────────────────────
// Onboard summary queries — aggregated data for codebase briefing
// ────────────────────────────────────────────────────────────────────────

export interface OnboardSummary {
    stats: { nodeCount: number; edgeCount: number; fileCount: number; functionCount: number; classCount: number; routeCount: number };
    routes: Array<{ method: string; path: string; filePath: string }>;
    dbTables: Array<{ name: string; schema: string; readerCount: number; writerCount: number }>;
    externalAPIs: Array<{ url: string; method: string; callerName: string }>;
    envVars: Array<{ name: string }>;
    highRiskFunctions: Array<{ name: string; filePath: string; callerCount: number }>;
    languages: Array<{ language: string; fileCount: number }>;
    deadCodeCount: number;
    godFileCount: number;
    duplicateCount: number;
    securityIssueCount: number;
}

export async function getOnboardSummary(
    driver: GraphDriver,
    projectId?: string,
): Promise<OnboardSummary> {
    const pf = projectId ? 'AND n.projectId = $projectId' : '';
    const pfF = projectId ? 'AND f.projectId = $projectId' : '';

    // Stats
    const [stats] = await driver.runQuery<OnboardSummary['stats']>(
        `MATCH (n) WHERE NOT n:Project AND NOT n:ScanMeta ${pf}
         WITH count(n) as nodeCount
         OPTIONAL MATCH (f:File) WHERE true ${pfF.replace('n.', 'f.')}
         WITH nodeCount, count(f) as fileCount
         RETURN nodeCount, 0 as edgeCount, fileCount, 0 as functionCount, 0 as classCount, 0 as routeCount`,
        { projectId },
    );

    // More precise counts
    const [counts] = await driver.runQuery<{ functionCount: number; classCount: number; routeCount: number }>(
        `OPTIONAL MATCH (fn:Function) WHERE true ${pfF.replace('f.', 'fn.')}
         WITH count(fn) as functionCount
         OPTIONAL MATCH (c:Class) WHERE true ${pfF.replace('f.', 'c.')}
         WITH functionCount, count(c) as classCount
         OPTIONAL MATCH (r:Route) WHERE true ${pfF.replace('f.', 'r.')}
         RETURN functionCount, classCount, count(r) as routeCount`,
        { projectId },
    );

    // Routes
    const routes = await driver.runQuery<{ method: string; path: string; filePath: string }>(
        `MATCH (r:Route) WHERE true ${pf.replace('n.', 'r.')}
         RETURN COALESCE(r.method, 'GET') as method, r.path as path, COALESCE(r.filePath, '') as filePath
         ORDER BY r.path LIMIT 50`,
        { projectId },
    );

    // DB tables
    const dbTables = await driver.runQuery<{ name: string; schema: string; readerCount: number; writerCount: number }>(
        `MATCH (t:DBTable) WHERE true ${pf.replace('n.', 't.')}
         OPTIONAL MATCH ()-[:READS_FROM]->(t)
         WITH t, count(*) as readerCount
         OPTIONAL MATCH ()-[:WRITES_TO]->(t)
         RETURN t.name as name, COALESCE(t.schema, 'default') as schema, readerCount, count(*) as writerCount
         ORDER BY readerCount + count(*) DESC LIMIT 30`,
        { projectId },
    );

    // External APIs
    const externalAPIs = await driver.runQuery<{ url: string; method: string; callerName: string }>(
        `MATCH (f:Function)-[:CALLS_API]->(api:ExternalAPI) WHERE true ${pfF}
         RETURN api.url as url, COALESCE(api.method, 'GET') as method, f.name as callerName
         ORDER BY api.url LIMIT 30`,
        { projectId },
    );

    // Env vars (unique names)
    const envVars = await driver.runQuery<{ name: string }>(
        `MATCH (e:EnvVar) WHERE true ${pf.replace('n.', 'e.')}
         RETURN DISTINCT e.name as name ORDER BY name LIMIT 50`,
        { projectId },
    );

    // High-risk functions (most callers)
    const highRiskFunctions = await driver.runQuery<{ name: string; filePath: string; callerCount: number }>(
        `MATCH (caller)-[:CALLS]->(f:Function) WHERE true ${pfF}
         WITH f, count(DISTINCT caller) as callerCount
         WHERE callerCount > 5
         RETURN f.name as name, f.filePath as filePath, callerCount
         ORDER BY callerCount DESC LIMIT 10`,
        { projectId },
    );

    // Language distribution
    const languages = await driver.runQuery<{ language: string; fileCount: number }>(
        `MATCH (f:File) WHERE f.language IS NOT NULL ${pfF}
         RETURN f.language as language, count(f) as fileCount
         ORDER BY fileCount DESC`,
        { projectId },
    );

    // Dead code count
    const [deadCodeResult] = await driver.runQuery<{ cnt: number }>(
        `MATCH (f:Function)
         WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-() AND NOT (f)<-[:DEPENDS_ON]-(:File)
           AND f.name <> 'constructor' ${pfF}
           AND NOT f.filePath ENDS WITH '.tsx' AND NOT f.filePath ENDS WITH '.jsx'
         RETURN count(f) as cnt`,
        { projectId },
    );

    // God file count
    const [godFileResult] = await driver.runQuery<{ cnt: number }>(
        `MATCH (f:File)-[:CONTAINS]->(fn:Function) WHERE true ${pfF}
         WITH f, count(fn) as functionCount WHERE functionCount > 10
         RETURN count(f) as cnt`,
        { projectId },
    );

    // Duplicate count
    const [dupResult] = await driver.runQuery<{ cnt: number }>(
        `MATCH (f:Function) WHERE f.bodyHash IS NOT NULL ${pfF} AND (f.endLine - f.startLine) >= 3
         WITH f.bodyHash as h, count(*) as c WHERE c > 1
         RETURN count(h) as cnt`,
        { projectId },
    );

    // Security issue count
    const [secResult] = await driver.runQuery<{ cnt: number }>(
        `MATCH (s:SecurityIssue) WHERE true ${pf.replace('n.', 's.')}
         RETURN count(s) as cnt`,
        { projectId },
    );

    return {
        stats: {
            nodeCount: stats?.nodeCount ?? 0,
            edgeCount: stats?.edgeCount ?? 0,
            fileCount: stats?.fileCount ?? 0,
            functionCount: counts?.functionCount ?? 0,
            classCount: counts?.classCount ?? 0,
            routeCount: counts?.routeCount ?? 0,
        },
        routes,
        dbTables,
        externalAPIs,
        envVars,
        highRiskFunctions,
        languages,
        deadCodeCount: deadCodeResult?.cnt ?? 0,
        godFileCount: godFileResult?.cnt ?? 0,
        duplicateCount: dupResult?.cnt ?? 0,
        securityIssueCount: secResult?.cnt ?? 0,
    };
}
