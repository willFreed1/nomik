// ────────────────────────────────────────────────────────────────────
// LLM-Powered Wiki Generator
// Hybrid approach: graph provides evidence, Claude writes documentation
// ────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { GraphService } from '@nomik/graph';

// ── Types ────────────────────────────────────────────────────────────

export interface GraphContext {
    projectName: string;
    generatedAt: string;
    stats: {
        fileCount: number; functionCount: number; classCount: number; routeCount: number;
    };
    languages: Array<{ lang: string; count: number; pct: string }>;
    files: Array<{ path: string; language: string; functionCount: number; lineCount: number }>;
    functions: Array<{
        name: string; filePath: string; isExported: boolean;
        callerCount: number; calleeCount: number;
    }>;
    deadCode: Array<{ name: string; filePath: string }>;
    godFiles: Array<{ filePath: string; functionCount: number; totalLines: number }>;
    duplicates: Array<{
        bodyHash: string; count: number;
        functions: Array<{ name: string; filePath: string }>;
    }>;
    serviceLinks: Array<{
        topicName: string; broker: string;
        producers: Array<{ name: string; filePath: string }>;
        consumers: Array<{ name: string; filePath: string }>;
    }>;
    modules: Array<{
        name: string;
        files: Array<{
            path: string; language: string; lineCount: number;
            functions: Array<{
                name: string; isExported: boolean;
                startLine: number; endLine: number;
                callerCount: number; calleeCount: number;
                callerNames: string; calleeNames: string;
            }>;
            dbOps: Array<{ tableName: string; operation: string; functionName: string }>;
            apiCalls: Array<{ endpoint: string; method: string; functionName: string }>;
            routes: Array<{ method: string; path: string; handlerName: string }>;
            envVars: Array<{ varName: string; functionName: string }>;
        }>;
    }>;
}

interface WikiPage {
    id: string;
    title: string;
    filename: string;
    parent?: string;
    content: string;
}

// ── Graph Context Extractor ──────────────────────────────────────────

export async function extractGraphContext(
    graph: GraphService,
    projectId: string | undefined,
    projectName: string,
): Promise<GraphContext> {
    const pf = projectId ? ' WHERE f.projectId = $projectId' : '';

    const [stats, deadCode, godFiles, duplicates, serviceLinks] = await Promise.all([
        graph.getStats(projectId),
        graph.getDeadCode(projectId),
        graph.getGodFiles(10, projectId),
        graph.getDuplicates(projectId),
        graph.getServiceLinks(projectId),
    ]);

    const files = await graph.executeQuery<{
        path: string; language: string; functionCount: number; lineCount: number;
    }>(
        `MATCH (f:File)${pf}
         OPTIONAL MATCH (f)-[:CONTAINS]->(fn:Function)
         WITH f, count(fn) as functionCount
         RETURN f.path as path, COALESCE(f.language, 'unknown') as language,
                functionCount, COALESCE(f.lineCount, 0) as lineCount
         ORDER BY f.path`,
        { projectId },
    );

    const functions = await graph.executeQuery<{
        name: string; filePath: string; isExported: boolean;
        callerCount: number; calleeCount: number;
    }>(
        `MATCH (fn:Function)${projectId ? ' WHERE fn.projectId = $projectId' : ''}
         OPTIONAL MATCH (caller)-[:CALLS]->(fn)
         WITH fn, count(DISTINCT caller) as callerCount
         OPTIONAL MATCH (fn)-[:CALLS]->(callee)
         RETURN fn.name as name, fn.filePath as filePath,
                COALESCE(fn.isExported, false) as isExported,
                callerCount, count(DISTINCT callee) as calleeCount
         ORDER BY callerCount DESC
         LIMIT 100`,
        { projectId },
    );

    // Language breakdown
    const langCounts = new Map<string, number>();
    for (const f of files) langCounts.set(f.language, (langCounts.get(f.language) || 0) + 1);
    const total = files.length || 1;
    const languages = Array.from(langCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => ({ lang, count, pct: ((count / total) * 100).toFixed(1) }));

    // Module grouping with per-file details
    const moduleMap = new Map<string, typeof files>();
    for (const f of files) {
        const mod = extractModule(f.path);
        if (!moduleMap.has(mod)) moduleMap.set(mod, []);
        moduleMap.get(mod)!.push(f);
    }

    const modules = [];
    for (const [mod, modFiles] of Array.from(moduleMap.entries()).sort((a, b) => b[1].length - a[1].length)) {
        const fileDetails = [];
        for (const f of modFiles) {
            const detail = await getFileDetail(graph, f.path, projectId);
            fileDetails.push({ path: f.path, language: f.language, lineCount: f.lineCount, ...detail });
        }
        modules.push({ name: mod, files: fileDetails });
    }

    return {
        projectName,
        generatedAt: new Date().toISOString().split('T')[0]!,
        stats, languages, files, functions,
        deadCode, godFiles, duplicates, serviceLinks, modules,
    };
}

// ── Per-file detail query (same as wiki.ts) ──────────────────────────

async function getFileDetail(graph: GraphService, filePath: string, projectId?: string) {
    const pf2 = projectId ? ' AND f.projectId = $projectId' : '';

    const functions = await graph.executeQuery<{
        name: string; isExported: boolean; startLine: number; endLine: number;
        callerCount: number; calleeCount: number; callerNames: string; calleeNames: string;
    }>(
        `MATCH (f:File {path: $filePath})-[:CONTAINS]->(fn:Function)
         WHERE true ${pf2}
         OPTIONAL MATCH (caller)-[:CALLS]->(fn) WHERE caller.name <> fn.name
         WITH fn, collect(DISTINCT caller.name) as callerList, count(DISTINCT caller) as callerCount
         OPTIONAL MATCH (fn)-[:CALLS]->(callee)
         RETURN fn.name as name, COALESCE(fn.isExported, false) as isExported,
                COALESCE(fn.startLine, 0) as startLine, COALESCE(fn.endLine, 0) as endLine,
                callerCount, count(DISTINCT callee) as calleeCount,
                REDUCE(s = '', x IN callerList[0..5] | s + CASE WHEN s = '' THEN '' ELSE ', ' END + COALESCE(x, '')) as callerNames,
                REDUCE(s = '', x IN collect(DISTINCT callee.name)[0..5] | s + CASE WHEN s = '' THEN '' ELSE ', ' END + COALESCE(x, '')) as calleeNames
         ORDER BY callerCount DESC`,
        { filePath, projectId },
    );

    const dbOps = await graph.executeQuery<{ tableName: string; operation: string; functionName: string }>(
        `MATCH (f:File {path: $filePath})-[:CONTAINS]->(fn:Function)
         WHERE true ${pf2}
         MATCH (fn)-[r:READS_FROM|WRITES_TO]->(t:DBTable)
         RETURN t.name as tableName, type(r) as operation, fn.name as functionName ORDER BY t.name`,
        { filePath, projectId },
    );

    const apiCalls = await graph.executeQuery<{ endpoint: string; method: string; functionName: string }>(
        `MATCH (f:File {path: $filePath})-[:CONTAINS]->(fn:Function)
         WHERE true ${pf2}
         MATCH (fn)-[r:CALLS_EXTERNAL]->(api:ExternalAPI)
         RETURN COALESCE(api.endpoint, api.name) as endpoint, COALESCE(r.method, 'GET') as method, fn.name as functionName ORDER BY api.endpoint`,
        { filePath, projectId },
    );

    const routes = await graph.executeQuery<{ method: string; path: string; handlerName: string }>(
        `MATCH (r:Route)-[:HANDLES]->(fn:Function)
         MATCH (f:File {path: $filePath})-[:CONTAINS]->(fn)
         WHERE true ${pf2}
         RETURN r.method as method, r.path as path, fn.name as handlerName ORDER BY r.path`,
        { filePath, projectId },
    );

    const envVars = await graph.executeQuery<{ varName: string; functionName: string }>(
        `MATCH (f:File {path: $filePath})-[:CONTAINS]->(fn:Function)
         WHERE true ${pf2}
         MATCH (fn)-[:USES_ENV]->(ev:EnvVar)
         RETURN ev.name as varName, fn.name as functionName ORDER BY ev.name`,
        { filePath, projectId },
    );

    return { functions, dbOps, apiCalls, routes, envVars };
}

function extractModule(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    parts.pop();
    if (!parts.length) return 'root';
    if (parts[0] === 'packages' && parts.length >= 2) {
        const pkg = parts[1]!;
        const rest = parts.slice(2).filter(p => p !== 'src' && p !== 'source');
        return rest.length > 0 ? `${pkg}/${rest[0]!}` : pkg;
    }
    if (parts[0] === 'src' || parts[0] === 'source') parts.shift();
    return parts.slice(0, 2).join('/') || 'root';
}

// ── Claude API Integration ───────────────────────────────────────────

async function callClaude(
    client: Anthropic,
    systemPrompt: string,
    userPrompt: string,
    model = 'claude-sonnet-4-20250514',
): Promise<string> {
    const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content[0];
    if (block && block.type === 'text') return block.text;
    return '';
}

// ── Prompt Templates ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior technical writer generating documentation for a software project.
You write clear, professional, readable documentation that helps developers understand the codebase.

Rules:
- Output ONLY the HTML content for the page body (no <html>, <head>, <body>, <style> tags — just the inner content).
- Use semantic HTML: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <table>, <code>, etc.
- Write in second person ("you") when giving guidance, third person when describing the system.
- Be specific — reference actual function names, file paths, and module names from the data.
- Keep paragraphs concise (2-4 sentences).
- Use bullet lists and tables for structured information.
- Use <code> for function names, file names, variables, commands.
- Cross-reference other pages using <a href="filename.html">Page Title</a> links.
- When asked to generate SVG diagrams, create clean, professional diagrams with:
  - White background, no border
  - Rounded rectangles for components (#f8fafc fill, #334155 stroke)
  - Arrows with #64748b color
  - Clear labels in sans-serif font
  - Proper spacing and alignment
  - Keep diagrams under 800px wide
- Do NOT wrap output in markdown code fences. Output raw HTML directly.`;

function overviewPrompt(ctx: GraphContext): string {
    const modSummary = ctx.modules.slice(0, 15).map(m => {
        const fns = m.files.reduce((s, f) => s + f.functions.length, 0);
        const routes = m.files.flatMap(f => f.routes).length;
        const db = m.files.flatMap(f => f.dbOps).length;
        return `  - ${m.name}: ${m.files.length} files, ${fns} functions${routes ? `, ${routes} routes` : ''}${db ? `, ${db} DB ops` : ''}`;
    }).join('\n');

    const topFns = ctx.functions.slice(0, 10).map(f =>
        `  - ${f.name} (${f.filePath}) — ${f.callerCount} callers, ${f.calleeCount} callees${f.isExported ? ', exported' : ''}`
    ).join('\n');

    const allRoutes = ctx.modules.flatMap(m => m.files.flatMap(f => f.routes));
    const allDb = ctx.modules.flatMap(m => m.files.flatMap(f => f.dbOps));
    const allTables = [...new Set(allDb.map(d => d.tableName))];
    const allEnv = [...new Set(ctx.modules.flatMap(m => m.files.flatMap(f => f.envVars.map(e => e.varName))))];

    return `Generate the OVERVIEW page for the "${ctx.projectName}" project wiki.

PROJECT DATA:
- ${ctx.stats.fileCount} files, ${ctx.stats.functionCount} functions, ${ctx.stats.classCount} classes, ${ctx.stats.routeCount} routes
- Languages: ${ctx.languages.map(l => `${l.lang} (${l.pct}%)`).join(', ')}
- ${ctx.deadCode.length} dead code functions, ${ctx.godFiles.length} god files, ${ctx.duplicates.length} duplicate groups
- ${allRoutes.length} HTTP routes, ${allTables.length} DB tables, ${allEnv.length} env vars

MODULES (top 15):
${modSummary}

TOP FUNCTIONS (by caller count):
${topFns}

${allRoutes.length > 0 ? `ROUTES:\n${allRoutes.slice(0, 20).map(r => `  - ${r.method} ${r.path} → ${r.handlerName}`).join('\n')}` : ''}
${allTables.length > 0 ? `DB TABLES: ${allTables.join(', ')}` : ''}
${allEnv.length > 0 ? `ENV VARS: ${allEnv.slice(0, 20).join(', ')}` : ''}

Generate:
1. <h1>Overview</h1> with a lead paragraph explaining what this project is and does
2. An inline <svg> architecture diagram showing the main modules and how they connect (based on the module data above). Make it clean and professional.
3. <h2>How It Works</h2> — explain the system's architecture and data flow in prose
4. <h2>Key Modules</h2> — bullet list of the most important modules with brief descriptions and links to their pages (e.g. <a href="modules/${sanitizeFilename('moduleName')}.html">Module Name</a>)
5. <h2>Key Functions</h2> — the most important functions and what they likely do
6. <h2>Technology Stack</h2> — languages, frameworks inferred from the data

Cross-reference module pages using: <a href="modules/MODULENAME.html">Module Name</a>
Cross-reference other pages: <a href="api-reference.html">API Reference</a>, <a href="database.html">Database</a>, <a href="configuration.html">Configuration</a>, <a href="health.html">Health Report</a>`;
}

function architecturePrompt(ctx: GraphContext): string {
    const modDeps: string[] = [];
    for (const mod of ctx.modules.slice(0, 12)) {
        const callees = new Set<string>();
        for (const f of mod.files) {
            for (const fn of f.functions) {
                if (fn.calleeNames) fn.calleeNames.split(', ').forEach(c => callees.add(c));
            }
        }
        for (const other of ctx.modules) {
            if (other.name === mod.name) continue;
            const otherFns = new Set(other.files.flatMap(f => f.functions.map(fn => fn.name)));
            for (const c of callees) {
                if (otherFns.has(c)) { modDeps.push(`${mod.name} → ${other.name}`); break; }
            }
        }
    }

    return `Generate the ARCHITECTURE page for "${ctx.projectName}".

MODULE DEPENDENCIES:
${modDeps.length > 0 ? modDeps.join('\n') : 'No cross-module dependencies detected.'}

MODULES:
${ctx.modules.slice(0, 15).map(m => {
    const fns = m.files.reduce((s, f) => s + f.functions.length, 0);
    const routes = m.files.flatMap(f => f.routes);
    const db = m.files.flatMap(f => f.dbOps);
    const api = m.files.flatMap(f => f.apiCalls);
    return `- ${m.name}: ${m.files.length} files, ${fns} functions${routes.length ? `, routes: ${routes.map(r => `${r.method} ${r.path}`).join(', ')}` : ''}${db.length ? `, DB: ${[...new Set(db.map(d => d.tableName))].join(', ')}` : ''}${api.length ? `, external APIs: ${api.length}` : ''}`;
}).join('\n')}

Generate:
1. <h1>Architecture</h1> with intro paragraph
2. A large, detailed <svg> diagram (700px wide) showing all modules as boxes and their dependency arrows. Group related modules visually. Use different colors for modules with routes (blue tint), DB access (green tint), and pure logic (gray).
3. <h2>Module Overview</h2> — prose explaining each major module's role
4. <h2>Data Flow</h2> — an <svg> diagram showing how a typical request flows through the system (e.g. HTTP → route handler → service → DB)
5. <h2>Design Patterns</h2> — describe patterns observed (e.g. layered architecture, event-driven, etc.)

Link to module detail pages: <a href="modules/MODULENAME.html">Module Name</a>`;
}

function modulePrompt(ctx: GraphContext, mod: GraphContext['modules'][0]): string {
    const totalFns = mod.files.reduce((s, f) => s + f.functions.length, 0);
    const exported = mod.files.reduce((s, f) => s + f.functions.filter(fn => fn.isExported).length, 0);
    const allRoutes = mod.files.flatMap(f => f.routes);
    const allDb = mod.files.flatMap(f => f.dbOps);
    const allApi = mod.files.flatMap(f => f.apiCalls);
    const allEnv = [...new Set(mod.files.flatMap(f => f.envVars.map(e => e.varName)))];

    const fileDetails = mod.files.map(f => {
        const fname = f.path.split(/[/\\]/).pop() || f.path;
        const hotFns = f.functions.filter(fn => fn.callerCount >= 2 || fn.calleeCount >= 2);
        let desc = `  FILE: ${fname} (${f.language}, ${f.lineCount} lines, ${f.functions.length} functions)`;
        if (f.functions.length > 0) {
            desc += `\n    Functions: ${f.functions.map(fn => `${fn.name}${fn.isExported ? ' [exported]' : ''} (${fn.callerCount} callers, ${fn.calleeCount} callees)`).join(', ')}`;
        }
        if (hotFns.length > 0) {
            desc += `\n    Call graph:`;
            for (const fn of hotFns) {
                if (fn.callerNames) desc += `\n      ${fn.name} ← called by: ${fn.callerNames}`;
                if (fn.calleeNames) desc += `\n      ${fn.name} → calls: ${fn.calleeNames}`;
            }
        }
        if (f.routes.length > 0) desc += `\n    Routes: ${f.routes.map(r => `${r.method} ${r.path}`).join(', ')}`;
        if (f.dbOps.length > 0) desc += `\n    DB: ${f.dbOps.map(d => `${d.functionName} ${d.operation} ${d.tableName}`).join(', ')}`;
        if (f.apiCalls.length > 0) desc += `\n    External APIs: ${f.apiCalls.map(a => `${a.functionName} → ${a.method} ${a.endpoint}`).join(', ')}`;
        if (f.envVars.length > 0) desc += `\n    Env vars: ${[...new Set(f.envVars.map(e => e.varName))].join(', ')}`;
        return desc;
    }).join('\n\n');

    return `Generate a MODULE documentation page for "${mod.name}" in project "${ctx.projectName}".

MODULE SUMMARY:
- ${mod.files.length} files, ${totalFns} functions (${exported} exported)
- Languages: ${[...new Set(mod.files.map(f => f.language))].join(', ')}
- Total lines: ${mod.files.reduce((s, f) => s + f.lineCount, 0)}
${allRoutes.length > 0 ? `- ${allRoutes.length} HTTP routes` : ''}
${allDb.length > 0 ? `- DB tables: ${[...new Set(allDb.map(d => d.tableName))].join(', ')}` : ''}
${allApi.length > 0 ? `- ${allApi.length} external API calls` : ''}
${allEnv.length > 0 ? `- Env vars: ${allEnv.join(', ')}` : ''}

FILES:
${fileDetails}

Generate:
1. <h1>${mod.name}</h1> with a paragraph explaining what this module does and its role in the project
2. If there are multiple files, generate an <svg> diagram showing file relationships (based on call graph data)
3. For EACH file, generate a <h2>FileName</h2> section with:
   - A paragraph explaining what the file does
   - A functions table: <table> with Name, Lines, Exported, Callers, Callees
   - If there are call relationships, a "Call Graph" subsection explaining who calls whom
   - If there are routes, a "Routes" subsection with a table
   - If there are DB operations, a "Database Operations" subsection
   - If there are API calls, an "External APIs" subsection
   - If there are env vars, an "Environment Variables" list
4. <h2>Summary</h2> — a brief summary of the module's responsibilities

Link back to <a href="../index.html">Overview</a> and to other module pages as relevant.`;
}

function apiReferencePrompt(ctx: GraphContext): string {
    const allRoutes = ctx.modules.flatMap(m => m.files.flatMap(f =>
        f.routes.map(r => ({ ...r, filePath: f.path, module: m.name }))
    ));
    if (allRoutes.length === 0) return '';

    return `Generate an API REFERENCE page for "${ctx.projectName}".

ROUTES:
${allRoutes.map(r => `- ${r.method} ${r.path} → handler: ${r.handlerName} (in ${r.filePath}, module: ${r.module})`).join('\n')}

Generate:
1. <h1>API Reference</h1> with intro paragraph
2. Group routes by path prefix or module
3. For each route: method badge, path, handler function, which module it belongs to
4. Brief description of what each endpoint likely does (infer from handler name and module context)
5. Link handler names to their module pages`;
}

function databasePrompt(ctx: GraphContext): string {
    const allDb = ctx.modules.flatMap(m => m.files.flatMap(f =>
        f.dbOps.map(d => ({ ...d, filePath: f.path, module: m.name }))
    ));
    if (allDb.length === 0) return '';
    const tables = [...new Set(allDb.map(d => d.tableName))];

    return `Generate a DATABASE documentation page for "${ctx.projectName}".

DB OPERATIONS:
${allDb.map(d => `- ${d.functionName} ${d.operation} ${d.tableName} (in ${d.filePath}, module: ${d.module})`).join('\n')}

TABLES: ${tables.join(', ')}

Generate:
1. <h1>Database</h1> with intro paragraph
2. An <svg> diagram showing tables and which modules read/write them
3. For each table: <h2>table_name</h2> with description of access patterns, which functions read vs write
4. <h2>Access Patterns</h2> — summary of read/write distribution`;
}

function configurationPrompt(ctx: GraphContext): string {
    const allEnv = ctx.modules.flatMap(m => m.files.flatMap(f =>
        f.envVars.map(e => ({ ...e, filePath: f.path, module: m.name }))
    ));
    if (allEnv.length === 0) return '';
    const uniqueVars = [...new Set(allEnv.map(e => e.varName))];

    return `Generate a CONFIGURATION documentation page for "${ctx.projectName}".

ENVIRONMENT VARIABLES:
${uniqueVars.map(v => {
    const users = allEnv.filter(e => e.varName === v);
    return `- ${v}: used by ${users.map(u => `${u.functionName} (${u.module})`).join(', ')}`;
}).join('\n')}

Generate:
1. <h1>Configuration</h1> with intro paragraph
2. A table of all environment variables with: Name, Description (inferred), Used By (modules/functions), Required?
3. Group variables by category if possible (e.g. database, auth, API keys, etc.)
4. Guidance on setting up the configuration`;
}

function healthPrompt(ctx: GraphContext): string {
    return `Generate a HEALTH REPORT page for "${ctx.projectName}".

STATS:
- ${ctx.stats.fileCount} files, ${ctx.stats.functionCount} functions

DEAD CODE (${ctx.deadCode.length} functions):
${ctx.deadCode.slice(0, 30).map(d => `- ${d.name} in ${d.filePath}`).join('\n') || 'None detected.'}

GOD FILES (${ctx.godFiles.length} files with >10 functions):
${ctx.godFiles.map(g => `- ${g.filePath}: ${g.functionCount} functions, ${g.totalLines} lines`).join('\n') || 'None detected.'}

DUPLICATES (${ctx.duplicates.length} groups):
${ctx.duplicates.slice(0, 10).map(d => `- Hash ${d.bodyHash.substring(0, 12)}: ${d.functions.map(f => `${f.name} (${f.filePath})`).join(', ')}`).join('\n') || 'None detected.'}

Generate:
1. <h1>Health Report</h1> with summary paragraph (overall health assessment)
2. <h2>Dead Code</h2> — table + explanation + recommendations for each
3. <h2>God Files</h2> — table + explanation + specific refactoring suggestions
4. <h2>Duplicate Functions</h2> — groups + recommendations for extraction
5. <h2>Recommendations</h2> — prioritized action items for improving code quality`;
}

// ── Static Site Assets ───────────────────────────────────────────────

function getStyleCSS(): string {
    return `/* NOMIK Wiki — Generated Documentation */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { font-size: 16px; -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; color: #1e293b; background: #fff; display: flex; min-height: 100vh; line-height: 1.7; }

/* Sidebar */
.sidebar { width: 260px; background: #f8fafc; border-right: 1px solid #e2e8f0; position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column; z-index: 100; }
.sidebar-header { padding: 20px 20px 16px; border-bottom: 1px solid #e2e8f0; }
.sidebar-header h1 { font-size: 15px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; }
.sidebar-header .gen-info { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.sidebar-search { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
.sidebar-search input { width: 100%; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; color: #334155; outline: none; }
.sidebar-search input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.sidebar-nav { flex: 1; padding: 4px 0; overflow-y: auto; }
.nav-link { display: block; padding: 7px 20px; font-size: 14px; color: #475569; text-decoration: none; border-left: 3px solid transparent; transition: all 0.12s; }
.nav-link:hover { color: #1e293b; background: #f1f5f9; }
.nav-link.active { color: #2563eb; border-left-color: #2563eb; font-weight: 600; background: rgba(37,99,235,0.04); }
.nav-child { padding-left: 32px; font-size: 13px; }
.nav-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; padding: 16px 20px 4px; }

/* Main */
.main { margin-left: 260px; flex: 1; max-width: 820px; padding: 40px 48px 80px; }

/* Typography */
h1 { font-size: 28px; font-weight: 700; color: #0f172a; margin-bottom: 16px; letter-spacing: -0.5px; }
h2 { font-size: 22px; font-weight: 600; color: #0f172a; margin: 32px 0 12px; padding-top: 24px; border-top: 1px solid #f1f5f9; }
h2:first-child, h1 + h2 { border-top: none; padding-top: 0; }
h3 { font-size: 17px; font-weight: 600; color: #1e293b; margin: 20px 0 8px; }
h4 { font-size: 15px; font-weight: 600; color: #334155; margin: 12px 0 6px; }
p { margin-bottom: 12px; color: #334155; }
.lead { font-size: 17px; color: #475569; line-height: 1.8; margin-bottom: 20px; }
ul, ol { margin: 8px 0 16px 24px; }
li { margin-bottom: 4px; color: #334155; }
code { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.88em; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #0f172a; }
a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Tables */
table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 14px; }
thead th { text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }
tbody td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
tbody tr:hover { background: #f8fafc; }

/* SVG diagrams */
svg { max-width: 100%; height: auto; margin: 16px 0; }
.diagram-container { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 16px 0; overflow-x: auto; text-align: center; }

/* HTTP methods */
.http-method { font-family: monospace; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
.http-get { background: #dcfce7; color: #166534; }
.http-post { background: #dbeafe; color: #1e40af; }
.http-put { background: #fef3c7; color: #92400e; }
.http-delete { background: #fee2e2; color: #991b1b; }
.http-patch { background: #f3e8ff; color: #6b21a8; }

/* Status badges */
.ok { color: #16a34a; font-weight: 500; }
.warn { color: #d97706; font-weight: 500; }
.error { color: #dc2626; font-weight: 500; }

/* File blocks */
.file-block { border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 16px 0; background: #fff; }
.file-path { font-size: 13px; color: #64748b; margin-bottom: 12px; }

/* Call graph */
.call-block { border-left: 3px solid #e2e8f0; padding: 8px 16px; margin: 8px 0; }
.call-label { font-weight: 600; color: #64748b; font-size: 13px; }

/* Responsive */
@media (max-width: 768px) {
    .sidebar { width: 100%; position: relative; max-height: 40vh; border-right: none; border-bottom: 1px solid #e2e8f0; }
    .main { margin-left: 0; padding: 24px 20px; }
    body { flex-direction: column; }
}`;
}

function getNavJS(): string {
    return `(function() {
    // Highlight current page in sidebar
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var links = document.querySelectorAll('.nav-link');
    links.forEach(function(link) {
        var href = link.getAttribute('href');
        if (href === currentPage || (currentPage === 'index.html' && href === 'index.html')) {
            link.classList.add('active');
        }
    });

    // Search
    var searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            links.forEach(function(link) {
                var text = link.textContent.toLowerCase();
                link.style.display = text.includes(q) ? '' : 'none';
            });
            document.querySelectorAll('.nav-group-title').forEach(function(t) {
                t.style.display = q ? 'none' : '';
            });
        });
    }
})();`;
}

// ── Page Template ────────────────────────────────────────────────────

function wrapPage(
    projectName: string,
    generatedAt: string,
    pageTitle: string,
    bodyContent: string,
    pages: WikiPage[],
    currentPageFilename: string,
    isSubpage = false,
): string {
    const prefix = isSubpage ? '../' : '';
    const topPages = pages.filter(p => !p.parent);
    const modulePages = pages.filter(p => p.parent === 'modules');

    let sidebar = '';
    for (const p of topPages) {
        const href = isSubpage ? `../${p.filename}` : p.filename;
        const active = p.filename === currentPageFilename ? ' active' : '';
        sidebar += `<a href="${href}" class="nav-link${active}">${esc(p.title)}</a>\n`;
    }
    if (modulePages.length > 0) {
        sidebar += `<div class="nav-group-title">MODULES</div>\n`;
        for (const p of modulePages) {
            const href = isSubpage ? `../${p.filename}` : p.filename;
            const active = p.filename === currentPageFilename ? ' active' : '';
            sidebar += `<a href="${href}" class="nav-link nav-child${active}">${esc(p.title)}</a>\n`;
        }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(pageTitle)} — ${esc(projectName)} Wiki</title>
<link rel="stylesheet" href="${prefix}assets/style.css">
</head>
<body>
<aside class="sidebar">
    <div class="sidebar-header">
        <h1><a href="${prefix}index.html" style="color:inherit;text-decoration:none">${esc(projectName)}</a></h1>
        <div class="gen-info">Generated ${esc(generatedAt)}</div>
    </div>
    <div class="sidebar-search">
        <input type="text" id="search" placeholder="Search..." autocomplete="off" />
    </div>
    <nav class="sidebar-nav">
        ${sidebar}
    </nav>
</aside>
<main class="main">
    ${bodyContent}
</main>
<script src="${prefix}assets/nav.js"></script>
</body>
</html>`;
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeFilename(name: string): string {
    return name.replace(/[/\\:*?"<>|]/g, '_').toLowerCase();
}

// ── Main Generator ───────────────────────────────────────────────────

export async function generateLLMWiki(
    ctx: GraphContext,
    outDir: string,
    apiKey?: string,
): Promise<void> {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
        throw new Error(
            'ANTHROPIC_API_KEY not set. Set it as an environment variable or pass --api-key.\n' +
            '  Get your key at: https://console.anthropic.com/settings/keys'
        );
    }

    const client = new Anthropic({ apiKey: key });
    const pages: WikiPage[] = [];

    // Create directories
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    mkdirSync(join(outDir, 'images'), { recursive: true });
    mkdirSync(join(outDir, 'modules'), { recursive: true });
    mkdirSync(join(outDir, 'data'), { recursive: true });

    // Save graph context for reference
    writeFileSync(join(outDir, 'data', 'graph-context.json'), JSON.stringify(ctx, null, 2));
    console.log('  📦 data/graph-context.json');

    // Write static assets
    writeFileSync(join(outDir, 'assets', 'style.css'), getStyleCSS());
    writeFileSync(join(outDir, 'assets', 'nav.js'), getNavJS());
    console.log('  🎨 assets/style.css + nav.js');

    // ── Generate pages via Claude ──
    console.log('\n  📝 Generating pages with Claude...\n');

    // 1. Overview
    console.log('    → Overview...');
    const overviewContent = await callClaude(client, SYSTEM_PROMPT, overviewPrompt(ctx));
    pages.push({ id: 'overview', title: 'Overview', filename: 'index.html', content: overviewContent });

    // 2. Architecture
    console.log('    → Architecture...');
    const archContent = await callClaude(client, SYSTEM_PROMPT, architecturePrompt(ctx));
    pages.push({ id: 'architecture', title: 'Architecture', filename: 'architecture.html', content: archContent });

    // 3. API Reference (if routes exist)
    const apiPrompt = apiReferencePrompt(ctx);
    if (apiPrompt) {
        console.log('    → API Reference...');
        const apiContent = await callClaude(client, SYSTEM_PROMPT, apiPrompt);
        pages.push({ id: 'api', title: 'API Reference', filename: 'api-reference.html', content: apiContent });
    }

    // 4. Database (if DB ops exist)
    const dbPrompt = databasePrompt(ctx);
    if (dbPrompt) {
        console.log('    → Database...');
        const dbContent = await callClaude(client, SYSTEM_PROMPT, dbPrompt);
        pages.push({ id: 'database', title: 'Database', filename: 'database.html', content: dbContent });
    }

    // 5. Configuration (if env vars exist)
    const cfgPrompt = configurationPrompt(ctx);
    if (cfgPrompt) {
        console.log('    → Configuration...');
        const cfgContent = await callClaude(client, SYSTEM_PROMPT, cfgPrompt);
        pages.push({ id: 'config', title: 'Configuration', filename: 'configuration.html', content: cfgContent });
    }

    // 6. Health Report
    console.log('    → Health Report...');
    const healthContent = await callClaude(client, SYSTEM_PROMPT, healthPrompt(ctx));
    pages.push({ id: 'health', title: 'Health Report', filename: 'health.html', content: healthContent });

    // 7. Module pages
    for (const mod of ctx.modules) {
        const modFilename = `modules/${sanitizeFilename(mod.name)}.html`;
        console.log(`    → Module: ${mod.name}...`);
        const modContent = await callClaude(client, SYSTEM_PROMPT, modulePrompt(ctx, mod));
        pages.push({ id: `mod-${sanitizeFilename(mod.name)}`, title: mod.name, filename: modFilename, content: modContent, parent: 'modules' });
    }

    // ── Write all pages ──
    console.log('\n  💾 Writing pages...\n');
    for (const page of pages) {
        const isSubpage = page.filename.includes('/');
        const html = wrapPage(
            ctx.projectName, ctx.generatedAt, page.title,
            page.content, pages, page.filename, isSubpage,
        );
        const outPath = join(outDir, page.filename);
        writeFileSync(outPath, html);
        console.log(`    📄 ${page.filename}`);
    }

    console.log(`\n  ✅ Wiki generated with ${pages.length} pages in ${outDir}/`);
    console.log(`  👉 Open ${join(outDir, 'index.html')} in your browser\n`);
}
