// HTML Wiki Generator — single self-contained index.html

// ────────────────────────────────────────────────────────────────────
// HTML Wiki Generator — single self-contained index.html
// ────────────────────────────────────────────────────────────────────

interface WikiData {
    projectName: string;
    generatedAt: string;
    stats: { fileCount: number; functionCount: number; classCount: number; routeCount: number };
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

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortPath(p: string, n = 3): string {
    return p.split(/[/\\]/).slice(-n).join('/');
}

export function generateHtmlWiki(data: WikiData): string {
    const { projectName, generatedAt, stats, files, functions, deadCode, godFiles, duplicates, serviceLinks, modules } = data;

    // ── Build sections ──
    const sections: Array<{ id: string; title: string; icon: string; content: string }> = [];

    // Overview
    sections.push({
        id: 'overview', title: 'Overview', icon: '📊',
        content: `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-value">${stats.fileCount}</div><div class="stat-label">Files</div></div>
                <div class="stat-card"><div class="stat-value">${stats.functionCount}</div><div class="stat-label">Functions</div></div>
                <div class="stat-card"><div class="stat-value">${stats.classCount}</div><div class="stat-label">Classes</div></div>
                <div class="stat-card"><div class="stat-value">${stats.routeCount}</div><div class="stat-label">Routes</div></div>
                <div class="stat-card ${deadCode.length > 0 ? 'stat-warn' : 'stat-ok'}"><div class="stat-value">${deadCode.length}</div><div class="stat-label">Dead Code</div></div>
                <div class="stat-card ${godFiles.length > 0 ? 'stat-warn' : 'stat-ok'}"><div class="stat-value">${godFiles.length}</div><div class="stat-label">God Files</div></div>
                <div class="stat-card ${duplicates.length > 0 ? 'stat-warn' : 'stat-ok'}"><div class="stat-value">${duplicates.length}</div><div class="stat-label">Duplicates</div></div>
            </div>
            <h3>Language Distribution</h3>
            ${buildLanguageChart(files)}
        `,
    });

    // Files
    sections.push({
        id: 'files', title: 'Files', icon: '📁',
        content: `
            <p class="subtitle">${files.length} files tracked</p>
            <div class="table-wrap">
            <table>
                <thead><tr><th>File</th><th>Language</th><th>Functions</th><th>Lines</th></tr></thead>
                <tbody>${files.map(f => `<tr><td><code>${esc(shortPath(f.path))}</code></td><td><span class="lang-badge">${esc(f.language)}</span></td><td>${f.functionCount}</td><td>${f.lineCount}</td></tr>`).join('')}</tbody>
            </table>
            </div>
        `,
    });

    // Functions
    sections.push({
        id: 'functions', title: 'Functions', icon: '⚡',
        content: `
            <p class="subtitle">Top ${functions.length} functions by caller count</p>
            <div class="table-wrap">
            <table>
                <thead><tr><th>Function</th><th>File</th><th>Exported</th><th>Callers</th><th>Callees</th></tr></thead>
                <tbody>${functions.map(fn => `<tr><td><code>${esc(fn.name)}</code></td><td><code>${esc(shortPath(fn.filePath, 2))}</code></td><td>${fn.isExported ? '<span class="badge-yes">✓</span>' : '<span class="badge-no">—</span>'}</td><td>${fn.callerCount}</td><td>${fn.calleeCount}</td></tr>`).join('')}</tbody>
            </table>
            </div>
        `,
    });

    // Health
    let healthContent = '';
    if (deadCode.length > 0) {
        healthContent += `<h3>Dead Code <span class="count">${deadCode.length}</span></h3>
            <div class="table-wrap"><table><thead><tr><th>Function</th><th>File</th></tr></thead>
            <tbody>${deadCode.map(d => `<tr><td><code>${esc(d.name)}</code></td><td><code>${esc(shortPath(d.filePath, 2))}</code></td></tr>`).join('')}</tbody></table></div>`;
    } else {
        healthContent += '<h3>Dead Code</h3><p class="ok-msg">✅ No dead code detected.</p>';
    }
    if (godFiles.length > 0) {
        healthContent += `<h3>God Files <span class="count">${godFiles.length}</span></h3>
            <div class="table-wrap"><table><thead><tr><th>File</th><th>Functions</th><th>Lines</th></tr></thead>
            <tbody>${godFiles.map(g => `<tr><td><code>${esc(shortPath(g.filePath, 2))}</code></td><td>${g.functionCount}</td><td>${g.totalLines}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
        healthContent += '<h3>God Files</h3><p class="ok-msg">✅ No god files detected.</p>';
    }
    if (duplicates.length > 0) {
        healthContent += `<h3>Duplicate Functions <span class="count">${duplicates.length}</span></h3>`;
        for (const d of duplicates) {
            healthContent += `<div class="dup-group"><h4>Hash: <code>${esc(d.bodyHash.substring(0, 12))}</code> (${d.count} copies)</h4><ul>`;
            for (const f of d.functions) healthContent += `<li><code>${esc(f.name)}</code> in <code>${esc(shortPath(f.filePath, 2))}</code></li>`;
            healthContent += '</ul></div>';
        }
    } else {
        healthContent += '<h3>Duplicate Functions</h3><p class="ok-msg">✅ No duplicates detected.</p>';
    }
    sections.push({ id: 'health', title: 'Health Report', icon: '🏥', content: healthContent });

    // Service Links
    if (serviceLinks.length > 0) {
        let svcContent = '';
        for (const link of serviceLinks) {
            svcContent += `<div class="svc-group"><h3>${esc(link.topicName)} <span class="broker-badge">${esc(link.broker)}</span></h3>`;
            svcContent += '<div class="svc-cols"><div><h4>Producers</h4><ul>';
            for (const p of link.producers) svcContent += `<li><code>${esc(p.name)}</code> <span class="file-hint">${esc(shortPath(p.filePath, 2))}</span></li>`;
            svcContent += '</ul></div><div><h4>Consumers</h4><ul>';
            for (const c of link.consumers) svcContent += `<li><code>${esc(c.name)}</code> <span class="file-hint">${esc(shortPath(c.filePath, 2))}</span></li>`;
            svcContent += '</ul></div></div></div>';
        }
        sections.push({ id: 'service-links', title: 'Cross-Service Links', icon: '🔗', content: svcContent });
    }

    // Modules
    for (const mod of modules) {
        let modContent = `<p class="subtitle">${mod.files.length} files</p>`;
        for (const f of mod.files) {
            const fname = f.path.split(/[/\\]/).pop() || f.path;
            modContent += `<div class="file-section"><h3>${esc(fname)}</h3>`;
            modContent += `<div class="file-meta"><span>📄 <code>${esc(shortPath(f.path))}</code></span><span>🔤 ${esc(f.language)}</span><span>📏 ${f.lineCount} lines</span></div>`;

            if (f.functions.length > 0) {
                modContent += `<h4>Functions <span class="count">${f.functions.length}</span></h4>`;
                modContent += '<div class="table-wrap"><table><thead><tr><th>Function</th><th>Lines</th><th>Exported</th><th>Callers</th><th>Callees</th></tr></thead><tbody>';
                for (const fn of f.functions) {
                    const lines = fn.startLine && fn.endLine ? `${fn.startLine}-${fn.endLine}` : '—';
                    modContent += `<tr><td><code>${esc(fn.name)}</code></td><td>${lines}</td><td>${fn.isExported ? '<span class="badge-yes">✓</span>' : '<span class="badge-no">—</span>'}</td><td>${fn.callerCount}</td><td>${fn.calleeCount}</td></tr>`;
                }
                modContent += '</tbody></table></div>';

                const hot = f.functions.filter(fn => fn.callerCount >= 3 || fn.calleeCount >= 3);
                if (hot.length > 0) {
                    modContent += `<details class="call-details"><summary>Call graph details (${hot.length} functions)</summary>`;
                    for (const fn of hot) {
                        modContent += `<div class="call-item"><strong><code>${esc(fn.name)}</code></strong>`;
                        if (fn.callerNames) modContent += `<div class="call-edge">← Called by: ${esc(fn.callerNames)}</div>`;
                        if (fn.calleeNames) modContent += `<div class="call-edge">→ Calls: ${esc(fn.calleeNames)}</div>`;
                        modContent += '</div>';
                    }
                    modContent += '</details>';
                }
            }

            if (f.routes.length > 0) {
                modContent += '<h4>Routes</h4><div class="table-wrap"><table><thead><tr><th>Method</th><th>Path</th><th>Handler</th></tr></thead><tbody>';
                for (const r of f.routes) modContent += `<tr><td><span class="method-badge method-${esc(r.method.toLowerCase())}">${esc(r.method)}</span></td><td><code>${esc(r.path)}</code></td><td><code>${esc(r.handlerName)}</code></td></tr>`;
                modContent += '</tbody></table></div>';
            }

            if (f.dbOps.length > 0) {
                modContent += '<h4>Database Operations</h4><div class="table-wrap"><table><thead><tr><th>Table</th><th>Operation</th><th>Function</th></tr></thead><tbody>';
                for (const db of f.dbOps) {
                    const op = db.operation === 'READS_FROM' ? '<span class="op-read">READ</span>' : '<span class="op-write">WRITE</span>';
                    modContent += `<tr><td><code>${esc(db.tableName)}</code></td><td>${op}</td><td><code>${esc(db.functionName)}</code></td></tr>`;
                }
                modContent += '</tbody></table></div>';
            }

            if (f.apiCalls.length > 0) {
                modContent += '<h4>External API Calls</h4><div class="table-wrap"><table><thead><tr><th>Endpoint</th><th>Method</th><th>Function</th></tr></thead><tbody>';
                for (const api of f.apiCalls) modContent += `<tr><td><code>${esc(api.endpoint)}</code></td><td><code>${esc(api.method)}</code></td><td><code>${esc(api.functionName)}</code></td></tr>`;
                modContent += '</tbody></table></div>';
            }

            if (f.envVars.length > 0) {
                const unique = [...new Set(f.envVars.map(e => e.varName))];
                modContent += `<h4>Environment Variables</h4><div class="env-list">${unique.map(v => `<code class="env-var">${esc(v)}</code>`).join(' ')}</div>`;
            }

            modContent += '</div>';
        }
        sections.push({ id: `mod-${sanitizeId(mod.name)}`, title: mod.name, icon: '📦', content: modContent });
    }

    // ── Build HTML ──
    const sectionHtml = sections.map(s =>
        `<section id="section-${s.id}" class="page-section">${s.content}</section>`
    ).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Architecture Wiki</title>
<style>
:root {
    --bg: #0a0e1a; --bg2: #111827; --bg3: #1e293b; --bg4: #334155;
    --text: #e2e8f0; --text2: #94a3b8; --text3: #64748b;
    --accent: #06b6d4; --accent2: #0891b2; --green: #10b981; --yellow: #f59e0b;
    --red: #ef4444; --purple: #a855f7; --blue: #3b82f6;
    --sidebar-w: 260px; --radius: 8px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; min-height: 100vh; }
a { color: var(--accent); text-decoration: none; }
code { font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 0.85em; background: var(--bg3); padding: 2px 6px; border-radius: 4px; color: var(--accent); }

/* Sidebar */
.sidebar { width: var(--sidebar-w); background: var(--bg2); border-right: 1px solid var(--bg3); position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto; z-index: 100; display: flex; flex-direction: column; }
.sidebar-header { padding: 20px 16px; border-bottom: 1px solid var(--bg3); }
.sidebar-header h1 { font-size: 16px; color: var(--accent); font-weight: 700; letter-spacing: -0.3px; }
.sidebar-header .gen-date { font-size: 11px; color: var(--text3); margin-top: 4px; }
.sidebar-search { padding: 8px 12px; border-bottom: 1px solid var(--bg3); }
.sidebar-search input { width: 100%; background: var(--bg3); border: 1px solid var(--bg4); color: var(--text); padding: 8px 10px; border-radius: 6px; font-size: 13px; outline: none; }
.sidebar-search input:focus { border-color: var(--accent); }
.sidebar-search input::placeholder { color: var(--text3); }
.nav-group { padding: 8px 0; flex: 1; overflow-y: auto; }
.nav-group-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text3); padding: 12px 16px 4px; font-weight: 600; }
.nav-item { display: flex; align-items: center; gap: 8px; padding: 8px 16px; color: var(--text2); font-size: 13px; cursor: pointer; transition: all 0.15s; border-left: 3px solid transparent; }
.nav-item:hover { background: var(--bg3); color: var(--text); }
.nav-item.active { background: rgba(6,182,212,0.08); color: var(--accent); border-left-color: var(--accent); font-weight: 600; }
.nav-icon { font-size: 14px; width: 20px; text-align: center; flex-shrink: 0; }
.nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Main content */
.main { margin-left: var(--sidebar-w); flex: 1; padding: 32px 48px; max-width: 1100px; }
.page-section { display: none; animation: fadeIn 0.2s ease; }
.page-section.active { display: block; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

h2 { font-size: 24px; font-weight: 700; margin-bottom: 20px; color: var(--text); }
h3 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: var(--text); }
h4 { font-size: 15px; font-weight: 600; margin: 16px 0 8px; color: var(--text2); }
.subtitle { color: var(--text3); font-size: 14px; margin-bottom: 16px; }

/* Stats grid */
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
.stat-card { background: var(--bg2); border: 1px solid var(--bg3); border-radius: var(--radius); padding: 16px; text-align: center; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--accent); }
.stat-label { font-size: 12px; color: var(--text3); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.stat-warn .stat-value { color: var(--yellow); }
.stat-ok .stat-value { color: var(--green); }

/* Tables */
.table-wrap { overflow-x: auto; margin: 8px 0 16px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
thead th { background: var(--bg2); color: var(--text3); font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; border-bottom: 2px solid var(--bg3); position: sticky; top: 0; }
tbody td { padding: 8px 12px; border-bottom: 1px solid var(--bg3); vertical-align: top; }
tbody tr:hover { background: rgba(6,182,212,0.04); }

/* Badges */
.badge-yes { color: var(--green); font-weight: 600; }
.badge-no { color: var(--text3); }
.lang-badge { background: var(--bg3); padding: 2px 8px; border-radius: 10px; font-size: 11px; color: var(--text2); }
.count { background: var(--bg3); padding: 2px 8px; border-radius: 10px; font-size: 12px; color: var(--text2); margin-left: 6px; }
.broker-badge { background: var(--purple); color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-left: 8px; }
.method-badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; font-family: monospace; }
.method-get { background: rgba(16,185,129,0.15); color: var(--green); }
.method-post { background: rgba(59,130,246,0.15); color: var(--blue); }
.method-put { background: rgba(245,158,11,0.15); color: var(--yellow); }
.method-delete { background: rgba(239,68,68,0.15); color: var(--red); }
.op-read { color: var(--blue); font-weight: 600; font-size: 12px; }
.op-write { color: var(--yellow); font-weight: 600; font-size: 12px; }
.ok-msg { color: var(--green); padding: 12px 0; }

/* File sections */
.file-section { background: var(--bg2); border: 1px solid var(--bg3); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
.file-meta { display: flex; gap: 16px; font-size: 13px; color: var(--text3); margin-bottom: 12px; flex-wrap: wrap; }
.env-list { display: flex; flex-wrap: wrap; gap: 6px; }
.env-var { background: rgba(168,85,247,0.12); color: var(--purple); border: 1px solid rgba(168,85,247,0.2); }
.file-hint { color: var(--text3); font-size: 12px; }

/* Call details */
.call-details { margin: 12px 0; }
.call-details summary { cursor: pointer; color: var(--accent); font-size: 13px; padding: 8px 0; }
.call-item { padding: 8px 12px; border-left: 2px solid var(--bg4); margin: 4px 0 4px 8px; }
.call-edge { font-size: 12px; color: var(--text3); margin-top: 2px; }

/* Language chart */
.lang-chart { display: flex; height: 24px; border-radius: 12px; overflow: hidden; margin: 8px 0 12px; }
.lang-bar { transition: width 0.3s; }
.lang-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: var(--text2); }
.lang-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 4px; vertical-align: middle; }

/* Duplicate groups */
.dup-group { background: var(--bg2); border: 1px solid var(--bg3); border-radius: var(--radius); padding: 16px; margin: 8px 0; }
.dup-group h4 { margin: 0 0 8px; font-size: 14px; }
.dup-group ul { list-style: none; padding-left: 8px; }
.dup-group li { padding: 4px 0; font-size: 13px; }
.dup-group li::before { content: '•'; color: var(--yellow); margin-right: 8px; }

/* Service links */
.svc-group { background: var(--bg2); border: 1px solid var(--bg3); border-radius: var(--radius); padding: 16px; margin: 8px 0; }
.svc-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.svc-cols h4 { font-size: 13px; margin-bottom: 6px; }
.svc-cols ul { list-style: none; padding: 0; }
.svc-cols li { padding: 3px 0; font-size: 13px; }

/* Responsive */
@media (max-width: 768px) {
    .sidebar { width: 100%; position: relative; border-right: none; border-bottom: 1px solid var(--bg3); max-height: 50vh; }
    .main { margin-left: 0; padding: 20px; }
    body { flex-direction: column; }
    .stats-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
    .svc-cols { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<nav class="sidebar">
    <div class="sidebar-header">
        <h1>${esc(projectName)}</h1>
        <div class="gen-date">Generated by NOMIK on ${esc(generatedAt)}</div>
    </div>
    <div class="sidebar-search">
        <input type="text" id="search" placeholder="Search pages..." autocomplete="off" />
    </div>
    <div class="nav-group">
        <div class="nav-group-label">Pages</div>
        ${sections.filter(s => !s.id.startsWith('mod-')).map(s =>
            `<a href="#" class="nav-item" data-section="${s.id}"><span class="nav-icon">${s.icon}</span><span class="nav-label">${esc(s.title)}</span></a>`
        ).join('\n')}
        ${modules.length > 0 ? `<div class="nav-group-label">Modules</div>
        ${modules.map(m =>
            `<a href="#" class="nav-item" data-section="mod-${sanitizeId(m.name)}"><span class="nav-icon">📦</span><span class="nav-label">${esc(m.name)}</span></a>`
        ).join('\n')}` : ''}
    </div>
</nav>
<main class="main">
    ${sectionHtml}
</main>
<script>
(function() {
    const items = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.page-section');
    function show(id) {
        sections.forEach(s => s.classList.remove('active'));
        items.forEach(i => i.classList.remove('active'));
        const sec = document.getElementById('section-' + id);
        const nav = document.querySelector('[data-section="' + id + '"]');
        if (sec) sec.classList.add('active');
        if (nav) nav.classList.add('active');
    }
    items.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            show(this.dataset.section);
        });
    });
    // Search
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        items.forEach(item => {
            const label = item.querySelector('.nav-label').textContent.toLowerCase();
            item.style.display = label.includes(q) ? '' : 'none';
        });
    });
    // Show first section
    if (items.length > 0) show(items[0].dataset.section);
})();
</script>
</body>
</html>`;
}

function sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
}

const LANG_COLORS: Record<string, string> = {
    typescript: '#3178c6', javascript: '#f7df1e', python: '#3572A5', rust: '#dea584',
    csharp: '#178600', sql: '#e38c00', markdown: '#083fa1', json: '#292929',
    yaml: '#cb171e', html: '#e34c26', css: '#563d7c', unknown: '#475569',
};

function buildLanguageChart(files: Array<{ language: string }>): string {
    const counts = new Map<string, number>();
    for (const f of files) {
        const lang = f.language.toLowerCase();
        counts.set(lang, (counts.get(lang) || 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const total = files.length || 1;

    const bars = sorted.map(([lang, count]) => {
        const pct = ((count / total) * 100).toFixed(1);
        const color = LANG_COLORS[lang] || LANG_COLORS.unknown;
        return `<div class="lang-bar" style="width:${pct}%;background:${color}" title="${lang}: ${count} files (${pct}%)"></div>`;
    }).join('');

    const legend = sorted.map(([lang, count]) => {
        const color = LANG_COLORS[lang] || LANG_COLORS.unknown;
        return `<span><span class="lang-dot" style="background:${color}"></span>${lang} (${count})</span>`;
    }).join('');

    return `<div class="lang-chart">${bars}</div><div class="lang-legend">${legend}</div>`;
}
