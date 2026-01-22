import { Command } from 'commander';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfigFromEnv, validateConfig, createLogger, setLogger } from '@nomik/core';
import { createParserEngine, getGitDiff, isSupportedFile } from '@nomik/parser';
import { createGraphService } from '@nomik/graph';
import { readProjectConfig } from '../utils/project-config.js';

/** Auto-detect the default branch (master or main) */
function detectDefaultBranch(): string {
    try {
        // Check remote HEAD first
        const ref = execSync('git symbolic-ref refs/remotes/origin/HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        return ref.replace('refs/remotes/origin/', '');
    } catch {
        // Fallback: check if master or main exists locally
        try {
            execSync('git rev-parse --verify master', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
            return 'master';
        } catch {
            return 'main';
        }
    }
}

// ────────────────────────────────────────────────────────────────────────
// PR Impact Analyzer
//
// Workflow:
//   1. git diff <base> → list of changed files + changed line ranges
//   2. Re-parse changed files → find which functions/classes were modified
//   3. Query graph for each changed symbol → blast radius (callers, dependents)
//   4. Aggregate and print risk report
// ────────────────────────────────────────────────────────────────────────

interface ChangedSymbol {
    name: string;
    type: 'function' | 'class';
    filePath: string;
    id: string;
}

interface ImpactEntry {
    name: string;
    type: string;
    filePath: string;
    depth: number;
    relationship: string;
}

export const prImpactCommand = new Command('pr-impact')
    .description('Analyze the blast radius of a PR (git diff → graph traversal → risk report)')
    .option('-b, --base <branch>', 'Base branch to diff against (auto-detects master/main)')
    .option('--depth <n>', 'Maximum traversal depth', '3')
    .option('-j, --json', 'Output raw JSON')
    .action(async (opts: { base?: string; depth: string; json?: boolean }) => {
        const logger = createLogger({ level: 'info', pretty: true });
        setLogger(logger);

        // ── Step 1: Git diff ──
        const base = opts.base ?? detectDefaultBranch();
        const diff = getGitDiff(base);

        if (diff.files.length === 0) {
            console.log(`\n  No changes found against ${base}\n`);
            return;
        }

        // Filter to supported source files only
        const sourceFiles = diff.files.filter(f => f.status !== 'deleted' && isSupportedFile(f.filePath));

        console.log(`\n🔍 PR Impact Analysis (base: ${base})`);
        console.log(`   ${diff.totalChangedFiles} files changed, ${diff.totalChangedLines} lines modified`);
        console.log(`   ${sourceFiles.length} parseable source files\n`);

        if (sourceFiles.length === 0) {
            console.log('  No parseable source files changed.\n');
            return;
        }

        // ── Step 2: Re-parse changed files ──
        const parser = createParserEngine();
        const filePaths = sourceFiles.map(f => f.filePath);
        const results = await parser.parseFiles(filePaths);

        // Find which functions/classes overlap with changed lines
        const changedSymbols: ChangedSymbol[] = [];
        for (const result of results) {
            const diffFile = sourceFiles.find(f => path.resolve(f.filePath) === result.file.path);
            if (!diffFile) continue;
            const changedLineSet = new Set(diffFile.changedLines);

            for (const node of result.nodes) {
                if (node.type !== 'function' && node.type !== 'class') continue;

                // FunctionNode/ClassNode use startLine/endLine
                const sl = 'startLine' in node ? (node as any).startLine as number : undefined;
                const el = 'endLine' in node ? (node as any).endLine as number : undefined;

                if (sl && el) {
                    for (let l = sl; l <= el; l++) {
                        if (changedLineSet.has(l)) {
                            changedSymbols.push({
                                name: node.name,
                                type: node.type as 'function' | 'class',
                                filePath: result.file.path,
                                id: node.id,
                            });
                            break;
                        }
                    }
                } else if (sl && changedLineSet.size > 0) {
                    if (changedLineSet.has(sl)) {
                        changedSymbols.push({
                            name: node.name,
                            type: node.type as 'function' | 'class',
                            filePath: result.file.path,
                            id: node.id,
                        });
                    }
                }
            }
        }

        // Deduplicate by name+filePath
        const seen = new Set<string>();
        const uniqueSymbols = changedSymbols.filter(s => {
            const key = `${s.name}:${s.filePath}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`   ${uniqueSymbols.length} changed symbols detected:\n`);
        for (const s of uniqueSymbols) {
            const relPath = path.relative(process.cwd(), s.filePath);
            console.log(`     ${s.type === 'function' ? '⚡' : '🏗️'}  ${s.name}  (${relPath})`);
        }

        if (uniqueSymbols.length === 0) {
            console.log('  No function/class changes detected in diff.\n');
            return;
        }

        // ── Step 3: Query graph for blast radius ──
        const envConfig = loadConfigFromEnv();
        const config = validateConfig({ ...envConfig, target: { root: '.' } });
        const graph = createGraphService(config.graph);
        const projectId = readProjectConfig()?.projectId;
        const depth = parseInt(opts.depth, 10);

        try {
            await graph.connect();
        } catch {
            console.log('\n  ⚠️  Cannot connect to Neo4j. Showing diff-only analysis (no graph traversal).\n');
            printSummary(uniqueSymbols, [], opts.json);
            return;
        }

        const allImpacts = new Map<string, { symbol: ChangedSymbol; impacts: ImpactEntry[] }>();
        let totalImpacted = 0;

        for (const symbol of uniqueSymbols) {
            try {
                const impacts = await graph.getImpact(symbol.name, depth, projectId);
                allImpacts.set(symbol.name, { symbol, impacts });
                totalImpacted += impacts.length;
            } catch {
                allImpacts.set(symbol.name, { symbol, impacts: [] });
            }
        }

        await graph.disconnect();

        // ── Step 4: Risk report ──
        printReport(uniqueSymbols, allImpacts, totalImpacted, opts.json);
    });

function printReport(
    symbols: ChangedSymbol[],
    allImpacts: Map<string, { symbol: ChangedSymbol; impacts: ImpactEntry[] }>,
    totalImpacted: number,
    json?: boolean,
): void {
    if (json) {
        const data = {
            changedSymbols: symbols.length,
            totalImpacted,
            riskLevel: getRiskLevel(totalImpacted, symbols.length),
            symbols: [...allImpacts.entries()].map(([name, { symbol, impacts }]) => ({
                name,
                type: symbol.type,
                filePath: path.relative(process.cwd(), symbol.filePath),
                impactCount: impacts.length,
                impacts: impacts.map(i => ({
                    name: i.name,
                    type: i.type,
                    filePath: i.filePath,
                    depth: i.depth,
                    relationship: i.relationship,
                })),
            })),
        };
        console.log(JSON.stringify(data, null, 2));
        return;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('  📊 PR IMPACT REPORT');
    console.log('═'.repeat(60));

    const risk = getRiskLevel(totalImpacted, symbols.length);
    const riskEmoji = risk === 'HIGH' ? '🔴' : risk === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`\n  Risk Level: ${riskEmoji} ${risk}`);
    console.log(`  Changed Symbols: ${symbols.length}`);
    console.log(`  Total Impacted: ${totalImpacted}`);

    for (const [name, { symbol, impacts }] of allImpacts) {
        console.log(`\n  ─── ${symbol.type === 'function' ? '⚡' : '🏗️'} ${name} (${impacts.length} dependents) ───`);
        const relPath = path.relative(process.cwd(), symbol.filePath);
        console.log(`      file: ${relPath}`);

        if (impacts.length === 0) {
            console.log('      (no dependents in graph)');
            continue;
        }

        // Group by depth
        const byDepth = new Map<number, ImpactEntry[]>();
        for (const i of impacts) {
            const arr = byDepth.get(i.depth) ?? [];
            arr.push(i);
            byDepth.set(i.depth, arr);
        }

        for (const [d, entries] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
            console.log(`      depth ${d}:`);
            for (const e of entries.slice(0, 10)) {
                const eRelPath = e.filePath ? path.relative(process.cwd(), e.filePath) : '';
                console.log(`        ${e.relationship.padEnd(12)} ${e.type.padEnd(10)} ${e.name}  ${eRelPath ? `(${eRelPath})` : ''}`);
            }
            if (entries.length > 10) {
                console.log(`        ... and ${entries.length - 10} more`);
            }
        }
    }

    console.log('\n' + '═'.repeat(60) + '\n');
}

function printSummary(symbols: ChangedSymbol[], _impacts: ImpactEntry[], json?: boolean): void {
    if (json) {
        console.log(JSON.stringify({ changedSymbols: symbols.length, graphAvailable: false }, null, 2));
        return;
    }
    console.log(`  Changed ${symbols.length} symbols. Run "nomik scan" first to enable graph-based impact analysis.\n`);
}

function getRiskLevel(totalImpacted: number, changedSymbols: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    const avgImpact = changedSymbols > 0 ? totalImpacted / changedSymbols : 0;
    if (totalImpacted > 20 || avgImpact > 10) return 'HIGH';
    if (totalImpacted > 5 || avgImpact > 3) return 'MEDIUM';
    return 'LOW';
}
