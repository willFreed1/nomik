// ────────────────────────────────────────────────────────────────────
// HTML Wiki Generator — GitNexus-style documentation site
// Light theme, prose, Mermaid diagrams, hierarchical sidebar
// ────────────────────────────────────────────────────────────────────

export interface WikiData {
    projectName: string;
    generatedAt: string;
    stats: { fileCount: number; functionCount: number; classCount: number; routeCount: number;
             dbTableCount?: number; externalApiCount?: number; envVarCount?: number; routeCount2?: number };
    files: Array<{ path: string; language: string; functionCount: number; lineCount: number }>;
    functions: Array<{ name: string; filePath: string; isExported: boolean; callerCount: number; calleeCount: number }>;
    deadCode: Array<{ name: string; filePath: string }>;
    godFiles: Array<{ filePath: string; functionCount: number; totalLines: number }>;
    duplicates: Array<{ bodyHash: string; count: number; functions: Array<{ name: string; filePath: string }> }>;
    serviceLinks: Array<{ topicName: string; broker: string; producers: Array<{ name: string; filePath: string }>; consumers: Array<{ name: string; filePath: string }> }>;
    modules: Array<{
        name: string;
        files: Array<{
            path: string; language: string; lineCount: number;
            functions: Array<{ name: string; isExported: boolean; startLine: number; endLine: number; callerCount: number; calleeCount: number; callerNames: string; calleeNames: string }>;
            dbOps: Array<{ tableName: string; operation: string; functionName: string }>;
            apiCalls: Array<{ endpoint: string; method: string; functionName: string }>;
            routes: Array<{ method: string; path: string; handlerName: string }>;
            envVars: Array<{ varName: string; functionName: string }>;
        }>;
    }>;
}

// ── Helpers ──────────────────────────────────────────────────────────

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortPath(p: string, n = 3): string {
    return p.split(/[/\\]/).slice(-n).join('/');
}

function sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

function plural(n: number, word: string): string {
    return n === 1 ? `${n} ${word}` : `${n} ${word}s`;
}

// ── Language analysis ────────────────────────────────────────────────

function getLangBreakdown(files: Array<{ language: string }>): Array<{ lang: string; count: number; pct: string }> {
    const counts = new Map<string, number>();
    for (const f of files) counts.set(f.language, (counts.get(f.language) || 0) + 1);
    const total = files.length || 1;
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => ({ lang, count, pct: ((count / total) * 100).toFixed(1) }));
}

// ── Prose generators (data-driven, no LLM) ──────────────────────────

function describeModule(mod: WikiData['modules'][0]): string {
    const totalFns = mod.files.reduce((s, f) => s + f.functions.length, 0);
    const totalLines = mod.files.reduce((s, f) => s + f.lineCount, 0);
    const exported = mod.files.reduce((s, f) => s + f.functions.filter(fn => fn.isExported).length, 0);
    const allRoutes = mod.files.flatMap(f => f.routes);
    const allDb = mod.files.flatMap(f => f.dbOps);
    const allApi = mod.files.flatMap(f => f.apiCalls);
    const allEnv = [...new Set(mod.files.flatMap(f => f.envVars.map(e => e.varName)))];
    const langs = [...new Set(mod.files.map(f => f.language))];

    let desc = `<p>This module contains ${plural(mod.files.length, 'file')} with ${plural(totalFns, 'function')} `;
    desc += `across ${plural(totalLines, 'line')} of ${langs.join(', ')} code. `;
    if (exported > 0) desc += `${plural(exported, 'function')} ${exported === 1 ? 'is' : 'are'} exported for use by other modules. `;
    desc += `</p>`;

    if (allRoutes.length > 0 || allDb.length > 0 || allApi.length > 0) {
        desc += `<p>`;
        if (allRoutes.length > 0) {
            const methods = [...new Set(allRoutes.map(r => r.method))];
            desc += `It exposes ${plural(allRoutes.length, 'HTTP route')} (${methods.map(m => `<code>${esc(m)}</code>`).join(', ')}). `;
        }
        if (allDb.length > 0) {
            const tables = [...new Set(allDb.map(d => d.tableName))];
            const reads = allDb.filter(d => d.operation === 'READS_FROM').length;
            const writes = allDb.filter(d => d.operation !== 'READS_FROM').length;
            desc += `It interacts with ${plural(tables.length, 'database table')} (${tables.map(t => `<code>${esc(t)}</code>`).join(', ')})`;
            if (reads > 0 && writes > 0) desc += ` with ${reads} read and ${writes} write operations`;
            desc += `. `;
        }
        if (allApi.length > 0) {
            desc += `It makes ${plural(allApi.length, 'external API call')}. `;
        }
        desc += `</p>`;
    }
    if (allEnv.length > 0) {
        desc += `<p>Environment variables used: ${allEnv.map(v => `<code>${esc(v)}</code>`).join(', ')}.</p>`;
    }
    return desc;
}

function describeFile(f: WikiData['modules'][0]['files'][0]): string {
    const fname = f.path.split(/[/\\]/).pop() || f.path;
    const exported = f.functions.filter(fn => fn.isExported).length;
    const hotFns = f.functions.filter(fn => fn.callerCount >= 3);

    let desc = `<p><code>${esc(fname)}</code> is a ${f.language} file with ${plural(f.lineCount, 'line')} `;
    desc += `containing ${plural(f.functions.length, 'function')}`;
    if (exported > 0) desc += ` (${exported} exported)`;
    desc += `.`;

    if (hotFns.length > 0) {
        desc += ` The most-used functions are ${hotFns.slice(0, 3).map(fn => `<code>${esc(fn.name)}</code> (${fn.callerCount} callers)`).join(', ')}.`;
    }
    desc += `</p>`;
    return desc;
}

// ── Mermaid diagram generators ───────────────────────────────────────

function buildArchitectureDiagram(modules: WikiData['modules']): string {
    if (modules.length === 0) return '';
    const top = modules.slice(0, 12);
    let mermaid = 'graph TD\n';
    for (const mod of top) {
        const id = sanitizeId(mod.name);
        const fns = mod.files.reduce((s, f) => s + f.functions.length, 0);
        mermaid += `    ${id}["${esc(mod.name)}\\n${fns} functions"]\n`;
    }
    // Add cross-module edges based on callee references
    for (const mod of top) {
        const srcId = sanitizeId(mod.name);
        const calleeFiles = new Set<string>();
        for (const f of mod.files) {
            for (const fn of f.functions) {
                if (fn.calleeNames) {
                    fn.calleeNames.split(', ').forEach(() => calleeFiles.add(fn.name));
                }
            }
        }
        // Find which other modules contain functions called by this module
        for (const other of top) {
            if (other.name === mod.name) continue;
            const otherId = sanitizeId(other.name);
            const otherFnNames = new Set(other.files.flatMap(f => f.functions.map(fn => fn.name)));
            for (const f of mod.files) {
                for (const fn of f.functions) {
                    if (fn.calleeNames) {
                        const callees = fn.calleeNames.split(', ');
                        if (callees.some(c => otherFnNames.has(c))) {
                            mermaid += `    ${srcId} --> ${otherId}\n`;
                            break;
                        }
                    }
                }
                if (mermaid.includes(`${srcId} --> ${otherId}`)) break;
            }
        }
    }
    // Style
    mermaid += '    classDef default fill:#f8fafc,stroke:#334155,stroke-width:1px,color:#1e293b\n';
    return mermaid;
}

function buildModuleDependencyDiagram(mod: WikiData['modules'][0]): string {
    if (mod.files.length <= 1) return '';
    let mermaid = 'graph LR\n';
    const fileIds = new Map<string, string>();
    for (const f of mod.files) {
        const fname = f.path.split(/[/\\]/).pop() || f.path;
        const id = sanitizeId(fname);
        fileIds.set(f.path, id);
        mermaid += `    ${id}["${esc(fname)}"]\n`;
    }
    // Infer edges from callee names matching function names in other files
    for (const f of mod.files) {
        const srcId = fileIds.get(f.path)!;
        for (const fn of f.functions) {
            if (!fn.calleeNames) continue;
            const callees = fn.calleeNames.split(', ');
            for (const other of mod.files) {
                if (other.path === f.path) continue;
                const tgtId = fileIds.get(other.path)!;
                if (callees.some(c => other.functions.some(ofn => ofn.name === c))) {
                    if (!mermaid.includes(`${srcId} --> ${tgtId}`)) {
                        mermaid += `    ${srcId} --> ${tgtId}\n`;
                    }
                }
            }
        }
    }
    mermaid += '    classDef default fill:#f8fafc,stroke:#334155,stroke-width:1px,color:#1e293b\n';
    return mermaid;
}

// ── Main generator ───────────────────────────────────────────────────

export function generateHtmlWiki(data: WikiData): string {
    const { projectName, generatedAt, stats, files, functions, deadCode, godFiles, duplicates, serviceLinks, modules } = data;
    const langBreakdown = getLangBreakdown(files);
    const primaryLang = langBreakdown[0]?.lang || 'unknown';

    // ── Build page sections ──
    type Section = { id: string; title: string; content: string; parent?: string };
    const sections: Section[] = [];

    // ═══════════════════════════════════════════════════════════════════
    // OVERVIEW
    // ═══════════════════════════════════════════════════════════════════
    const archDiagram = buildArchitectureDiagram(modules);
    let overviewContent = `<h1>Overview</h1>`;
    overviewContent += `<p class="lead">This is the auto-generated architecture wiki for <strong>${esc(projectName)}</strong>, `;
    overviewContent += `a ${primaryLang} project with ${plural(stats.fileCount, 'file')}, `;
    overviewContent += `${plural(stats.functionCount, 'function')}, and ${plural(stats.classCount, 'class')}`;
    if (stats.routeCount > 0) overviewContent += `, exposing ${plural(stats.routeCount, 'HTTP route')}`;
    overviewContent += `.</p>`;

    if (archDiagram) {
        overviewContent += `<h2>Architecture</h2>`;
        overviewContent += `<p>The following diagram shows the top-level modules and their dependencies, derived from the call graph.</p>`;
        overviewContent += `<div class="mermaid">${esc(archDiagram)}</div>`;
    }

    overviewContent += `<h2>How It Works</h2>`;
    overviewContent += `<p>The codebase is organized into ${plural(modules.length, 'module')} (directory clusters). `;
    if (langBreakdown.length > 1) {
        overviewContent += `It is primarily written in ${langBreakdown.slice(0, 3).map(l => `<strong>${esc(l.lang)}</strong> (${l.pct}%)`).join(', ')}. `;
    }
    overviewContent += `From there, several layers interact:</p><ul>`;
    const hasRoutes = modules.some(m => m.files.some(f => f.routes.length > 0));
    const hasDb = modules.some(m => m.files.some(f => f.dbOps.length > 0));
    const hasApi = modules.some(m => m.files.some(f => f.apiCalls.length > 0));
    const hasEnv = modules.some(m => m.files.some(f => f.envVars.length > 0));
    if (hasRoutes) overviewContent += `<li><strong>HTTP Routes</strong> — the project exposes REST endpoints handled by route handler functions.</li>`;
    if (hasDb) {
        const allTables = [...new Set(modules.flatMap(m => m.files.flatMap(f => f.dbOps.map(d => d.tableName))))];
        overviewContent += `<li><strong>Database</strong> — functions read from and write to ${plural(allTables.length, 'table')} (${allTables.slice(0, 5).map(t => `<code>${esc(t)}</code>`).join(', ')}${allTables.length > 5 ? ', ...' : ''}).</li>`;
    }
    if (hasApi) overviewContent += `<li><strong>External APIs</strong> — the project calls external HTTP services.</li>`;
    if (hasEnv) {
        const allEnv = [...new Set(modules.flatMap(m => m.files.flatMap(f => f.envVars.map(e => e.varName))))];
        overviewContent += `<li><strong>Configuration</strong> — ${plural(allEnv.length, 'environment variable')} configure runtime behavior.</li>`;
    }
    overviewContent += `</ul>`;

    // Key Flows
    const topFns = functions.slice(0, 5);
    if (topFns.length > 0) {
        overviewContent += `<h2>Key Functions</h2>`;
        overviewContent += `<p>The most-connected functions in the codebase, ranked by how many other functions call them:</p><ul>`;
        for (const fn of topFns) {
            overviewContent += `<li><code>${esc(fn.name)}</code> in <code>${esc(shortPath(fn.filePath, 2))}</code> — ${plural(fn.callerCount, 'caller')}, ${plural(fn.calleeCount, 'callee')}${fn.isExported ? ' (exported)' : ''}</li>`;
        }
        overviewContent += `</ul>`;
    }

    // Language breakdown
    overviewContent += `<h2>Language Distribution</h2>`;
    overviewContent += `<div class="lang-bar-container">`;
    for (const l of langBreakdown) {
        overviewContent += `<div class="lang-segment" style="width:${l.pct}%;background:${getLangColor(l.lang)}" title="${esc(l.lang)}: ${l.count} files (${l.pct}%)"></div>`;
    }
    overviewContent += `</div><div class="lang-legend">`;
    for (const l of langBreakdown) {
        overviewContent += `<span class="lang-item"><span class="lang-dot" style="background:${getLangColor(l.lang)}"></span>${esc(l.lang)} (${l.count})</span>`;
    }
    overviewContent += `</div>`;

    sections.push({ id: 'overview', title: 'Overview', content: overviewContent });

    // ═══════════════════════════════════════════════════════════════════
    // MODULE PAGES
    // ═══════════════════════════════════════════════════════════════════
    for (const mod of modules) {
        const modId = `mod-${sanitizeId(mod.name)}`;
        let mc = `<h1>${esc(mod.name)}</h1>`;
        mc += describeModule(mod);

        // Module dependency diagram
        const modDiagram = buildModuleDependencyDiagram(mod);
        if (modDiagram) {
            mc += `<h2>File Dependencies</h2>`;
            mc += `<p>Internal file-to-file call relationships within this module:</p>`;
            mc += `<div class="mermaid">${esc(modDiagram)}</div>`;
        }

        // Files
        for (const f of mod.files) {
            const fname = f.path.split(/[/\\]/).pop() || f.path;
            mc += `<div class="file-block">`;
            mc += `<h2>${esc(fname)}</h2>`;
            mc += `<div class="file-path"><code>${esc(shortPath(f.path))}</code> &middot; ${esc(f.language)} &middot; ${plural(f.lineCount, 'line')}</div>`;
            mc += describeFile(f);

            // Functions
            if (f.functions.length > 0) {
                mc += `<h3>Functions</h3>`;
                mc += `<table><thead><tr><th>Name</th><th>Lines</th><th>Exported</th><th>Callers</th><th>Callees</th></tr></thead><tbody>`;
                for (const fn of f.functions) {
                    const lines = fn.startLine && fn.endLine ? `${fn.startLine}–${fn.endLine}` : '—';
                    mc += `<tr><td><code>${esc(fn.name)}</code></td><td>${lines}</td><td>${fn.isExported ? 'Yes' : '—'}</td><td>${fn.callerCount}</td><td>${fn.calleeCount}</td></tr>`;
                }
                mc += `</tbody></table>`;

                // Call details for hot functions
                const hot = f.functions.filter(fn => fn.callerCount >= 2 || fn.calleeCount >= 2);
                if (hot.length > 0) {
                    mc += `<h3>Call Graph</h3>`;
                    for (const fn of hot) {
                        mc += `<div class="call-block"><h4><code>${esc(fn.name)}</code></h4>`;
                        if (fn.callerNames) mc += `<p class="call-info"><span class="call-label">Called by:</span> ${fn.callerNames.split(', ').map(c => `<code>${esc(c)}</code>`).join(', ')}</p>`;
                        if (fn.calleeNames) mc += `<p class="call-info"><span class="call-label">Calls:</span> ${fn.calleeNames.split(', ').map(c => `<code>${esc(c)}</code>`).join(', ')}</p>`;
                        mc += `</div>`;
                    }
                }
            }

            // Routes
            if (f.routes.length > 0) {
                mc += `<h3>Routes</h3>`;
                mc += `<table><thead><tr><th>Method</th><th>Path</th><th>Handler</th></tr></thead><tbody>`;
                for (const r of f.routes) mc += `<tr><td><span class="http-method http-${esc(r.method.toLowerCase())}">${esc(r.method)}</span></td><td><code>${esc(r.path)}</code></td><td><code>${esc(r.handlerName)}</code></td></tr>`;
                mc += `</tbody></table>`;
            }

            // DB
            if (f.dbOps.length > 0) {
                mc += `<h3>Database Operations</h3>`;
                mc += `<table><thead><tr><th>Table</th><th>Operation</th><th>Function</th></tr></thead><tbody>`;
                for (const db of f.dbOps) {
                    mc += `<tr><td><code>${esc(db.tableName)}</code></td><td>${db.operation === 'READS_FROM' ? 'READ' : 'WRITE'}</td><td><code>${esc(db.functionName)}</code></td></tr>`;
                }
                mc += `</tbody></table>`;
            }

            // API
            if (f.apiCalls.length > 0) {
                mc += `<h3>External API Calls</h3>`;
                mc += `<table><thead><tr><th>Endpoint</th><th>Method</th><th>Function</th></tr></thead><tbody>`;
                for (const api of f.apiCalls) mc += `<tr><td><code>${esc(api.endpoint)}</code></td><td><code>${esc(api.method)}</code></td><td><code>${esc(api.functionName)}</code></td></tr>`;
                mc += `</tbody></table>`;
            }

            // Env
            if (f.envVars.length > 0) {
                const unique = [...new Set(f.envVars.map(e => e.varName))];
                mc += `<h3>Environment Variables</h3><ul>`;
                for (const v of unique) mc += `<li><code>${esc(v)}</code></li>`;
                mc += `</ul>`;
            }

            mc += `</div>`; // file-block
        }

        sections.push({ id: modId, title: mod.name, content: mc, parent: 'modules' });
    }

    // ═══════════════════════════════════════════════════════════════════
    // HEALTH
    // ═══════════════════════════════════════════════════════════════════
    let healthContent = `<h1>Health Report</h1>`;
    healthContent += `<p>Automated code quality analysis based on the knowledge graph.</p>`;

    healthContent += `<h2>Dead Code</h2>`;
    if (deadCode.length > 0) {
        healthContent += `<p>${plural(deadCode.length, 'function')} detected with no callers and no route/event handlers — candidates for removal.</p>`;
        healthContent += `<table><thead><tr><th>Function</th><th>File</th></tr></thead><tbody>`;
        for (const d of deadCode) healthContent += `<tr><td><code>${esc(d.name)}</code></td><td><code>${esc(shortPath(d.filePath, 2))}</code></td></tr>`;
        healthContent += `</tbody></table>`;
    } else {
        healthContent += `<p class="ok">No dead code detected.</p>`;
    }

    healthContent += `<h2>God Files</h2>`;
    if (godFiles.length > 0) {
        healthContent += `<p>${plural(godFiles.length, 'file')} contain more than 10 functions — consider splitting them into smaller, focused modules.</p>`;
        healthContent += `<table><thead><tr><th>File</th><th>Functions</th><th>Lines</th></tr></thead><tbody>`;
        for (const g of godFiles) healthContent += `<tr><td><code>${esc(shortPath(g.filePath, 2))}</code></td><td>${g.functionCount}</td><td>${g.totalLines}</td></tr>`;
        healthContent += `</tbody></table>`;
    } else {
        healthContent += `<p class="ok">No god files detected.</p>`;
    }

    healthContent += `<h2>Duplicate Functions</h2>`;
    if (duplicates.length > 0) {
        healthContent += `<p>${plural(duplicates.length, 'group')} of functions share identical implementations — consider extracting shared utilities.</p>`;
        for (const d of duplicates) {
            healthContent += `<div class="dup-group"><strong>${d.count} copies</strong> (hash: <code>${esc(d.bodyHash.substring(0, 12))}</code>)<ul>`;
            for (const f of d.functions) healthContent += `<li><code>${esc(f.name)}</code> in <code>${esc(shortPath(f.filePath, 2))}</code></li>`;
            healthContent += `</ul></div>`;
        }
    } else {
        healthContent += `<p class="ok">No duplicate functions detected.</p>`;
    }

    sections.push({ id: 'health', title: 'Health Report', content: healthContent });

    // ═══════════════════════════════════════════════════════════════════
    // SERVICE LINKS
    // ═══════════════════════════════════════════════════════════════════
    if (serviceLinks.length > 0) {
        let svcContent = `<h1>Cross-Service Links</h1>`;
        svcContent += `<p>Message-based communication between services, detected from the call graph.</p>`;
        for (const link of serviceLinks) {
            svcContent += `<h2>${esc(link.topicName)}</h2>`;
            svcContent += `<p>Broker: <code>${esc(link.broker)}</code></p>`;
            svcContent += `<div class="svc-grid"><div><h3>Producers</h3><ul>`;
            for (const p of link.producers) svcContent += `<li><code>${esc(p.name)}</code> <span class="hint">${esc(shortPath(p.filePath, 2))}</span></li>`;
            svcContent += `</ul></div><div><h3>Consumers</h3><ul>`;
            for (const c of link.consumers) svcContent += `<li><code>${esc(c.name)}</code> <span class="hint">${esc(shortPath(c.filePath, 2))}</span></li>`;
            svcContent += `</ul></div></div>`;
        }
        sections.push({ id: 'service-links', title: 'Cross-Service Links', content: svcContent });
    }

    // ── Build sidebar HTML ──
    const topPages = sections.filter(s => !s.parent);
    const modulePages = sections.filter(s => s.parent === 'modules');

    let sidebarHtml = `<div class="sidebar-header"><h1>${esc(projectName)}</h1><div class="gen-info">${esc(generatedAt)}</div></div>`;
    sidebarHtml += `<div class="sidebar-search"><input type="text" id="search" placeholder="Search..." autocomplete="off" /></div>`;
    sidebarHtml += `<nav class="sidebar-nav">`;

    for (const p of topPages) {
        sidebarHtml += `<a href="#" class="nav-link" data-section="${p.id}">${esc(p.title)}</a>`;
    }

    if (modulePages.length > 0) {
        sidebarHtml += `<div class="nav-group-title">MODULES</div>`;
        for (const p of modulePages) {
            sidebarHtml += `<a href="#" class="nav-link nav-child" data-section="${p.id}">${esc(p.title)}</a>`;
        }
    }

    sidebarHtml += `</nav>`;

    // ── Build section HTML ──
    const sectionHtml = sections.map(s =>
        `<section id="section-${s.id}" class="page">${s.content}</section>`
    ).join('\n');

    // ── Full HTML ──
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Wiki</title>
<style>
/* ── Reset & Base ── */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { font-size: 16px; -webkit-font-smoothing: antialiased; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; color: #1e293b; background: #fff; display: flex; min-height: 100vh; line-height: 1.7; }

/* ── Sidebar ── */
.sidebar { width: 260px; background: #f8fafc; border-right: 1px solid #e2e8f0; position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column; z-index: 100; }
.sidebar-header { padding: 20px 20px 12px; }
.sidebar-header h1 { font-size: 15px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px; }
.gen-info { font-size: 11px; color: #94a3b8; margin-top: 2px; }
.sidebar-search { padding: 0 12px 12px; }
.sidebar-search input { width: 100%; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; background: #fff; color: #334155; outline: none; }
.sidebar-search input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
.sidebar-nav { flex: 1; padding: 4px 0; overflow-y: auto; }
.nav-link { display: block; padding: 7px 20px; font-size: 14px; color: #475569; text-decoration: none; border-left: 3px solid transparent; transition: all 0.12s; }
.nav-link:hover { color: #1e293b; background: #f1f5f9; }
.nav-link.active { color: #2563eb; border-left-color: #2563eb; font-weight: 600; background: rgba(37,99,235,0.04); }
.nav-child { padding-left: 32px; font-size: 13px; }
.nav-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; padding: 16px 20px 4px; }

/* ── Main ── */
.main { margin-left: 260px; flex: 1; max-width: 820px; padding: 40px 48px 80px; }
.page { display: none; }
.page.active { display: block; animation: fadeIn 0.15s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* ── Typography ── */
h1 { font-size: 28px; font-weight: 700; color: #0f172a; margin-bottom: 16px; letter-spacing: -0.5px; }
h2 { font-size: 22px; font-weight: 600; color: #0f172a; margin: 32px 0 12px; padding-top: 24px; border-top: 1px solid #f1f5f9; }
h2:first-child, h1 + h2 { border-top: none; padding-top: 0; }
h3 { font-size: 17px; font-weight: 600; color: #1e293b; margin: 20px 0 8px; }
h4 { font-size: 15px; font-weight: 600; color: #334155; margin: 12px 0 6px; }
p { margin-bottom: 12px; color: #334155; }
.lead { font-size: 17px; color: #475569; line-height: 1.8; margin-bottom: 20px; }
ul { margin: 8px 0 16px 24px; }
li { margin-bottom: 4px; color: #334155; }
code { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.88em; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #0f172a; }
a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }
.ok { color: #16a34a; font-weight: 500; }
.hint { color: #94a3b8; font-size: 12px; }

/* ── Tables ── */
table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 14px; }
thead th { text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; background: #f8fafc; }
tbody td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
tbody tr:hover { background: #f8fafc; }

/* ── Language bar ── */
.lang-bar-container { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin: 8px 0; background: #f1f5f9; }
.lang-segment { min-width: 3px; }
.lang-legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 6px 0 16px; font-size: 13px; color: #475569; }
.lang-item { display: flex; align-items: center; gap: 4px; }
.lang-dot { width: 8px; height: 8px; border-radius: 50%; }

/* ── Mermaid ── */
.mermaid { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 12px 0 20px; overflow-x: auto; }
.mermaid svg { max-width: 100%; }

/* ── File blocks ── */
.file-block { border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 16px 0; background: #fff; }
.file-block h2 { font-size: 18px; margin: 0 0 4px; padding: 0; border: none; }
.file-path { font-size: 13px; color: #64748b; margin-bottom: 12px; }

/* ── Call blocks ── */
.call-block { border-left: 3px solid #e2e8f0; padding: 8px 16px; margin: 8px 0; }
.call-block h4 { margin: 0 0 4px; }
.call-info { font-size: 13px; margin: 2px 0; color: #475569; }
.call-label { font-weight: 600; color: #64748b; }

/* ── HTTP methods ── */
.http-method { font-family: monospace; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
.http-get { background: #dcfce7; color: #166534; }
.http-post { background: #dbeafe; color: #1e40af; }
.http-put { background: #fef3c7; color: #92400e; }
.http-delete { background: #fee2e2; color: #991b1b; }
.http-patch { background: #f3e8ff; color: #6b21a8; }

/* ── Dup groups ── */
.dup-group { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 8px 0; }
.dup-group ul { margin-top: 8px; }

/* ── Service grid ── */
.svc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 12px 0; }

/* ── Responsive ── */
@media (max-width: 768px) {
    .sidebar { width: 100%; position: relative; max-height: 40vh; border-right: none; border-bottom: 1px solid #e2e8f0; }
    .main { margin-left: 0; padding: 24px 20px; }
    body { flex-direction: column; }
    .svc-grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<aside class="sidebar">
    ${sidebarHtml}
</aside>
<main class="main">
    ${sectionHtml}
</main>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
(function() {
    // Mermaid init
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
        document.querySelectorAll('.mermaid').forEach(function(el, i) {
            var code = el.textContent;
            el.textContent = '';
            el.removeAttribute('data-processed');
            mermaid.render('mermaid-' + i, code).then(function(result) {
                el.innerHTML = result.svg;
            }).catch(function() {
                el.textContent = code;
                el.style.whiteSpace = 'pre';
                el.style.fontFamily = 'monospace';
                el.style.fontSize = '12px';
            });
        });
    }

    // Navigation
    var links = document.querySelectorAll('.nav-link');
    var pages = document.querySelectorAll('.page');
    function show(id) {
        pages.forEach(function(p) { p.classList.remove('active'); });
        links.forEach(function(l) { l.classList.remove('active'); });
        var sec = document.getElementById('section-' + id);
        var nav = document.querySelector('[data-section="' + id + '"]');
        if (sec) { sec.classList.add('active'); window.scrollTo(0, 0); }
        if (nav) nav.classList.add('active');
    }
    links.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            show(this.getAttribute('data-section'));
        });
    });

    // Search
    var searchInput = document.getElementById('search');
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

    // Show first page
    if (links.length > 0) show(links[0].getAttribute('data-section'));
})();
</script>
</body>
</html>`;
}

// ── Language colors ──────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
    typescript: '#3178c6', javascript: '#f7df1e', python: '#3572A5', rust: '#dea584',
    csharp: '#178600', sql: '#e38c00', markdown: '#083fa1', json: '#6b7280',
    yaml: '#cb171e', html: '#e34c26', css: '#563d7c', go: '#00ADD8',
    java: '#b07219', ruby: '#701516', php: '#4F5D95', swift: '#F05138',
};

function getLangColor(lang: string): string {
    return LANG_COLORS[lang.toLowerCase()] || '#94a3b8';
}
