import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type MpcClient = 'cursor' | 'windsurf' | 'antigravity' | 'claude';

export interface SetupMcpClientOptions {
    client: MpcClient;
    global?: boolean;
    graphUri: string;
    graphUser: string;
    graphPass: string;
    projectId?: string;
    configPath?: string;
}

export interface SetupMcpClientResult {
    configPath: string;
    configDir: string;
    mcpPath: string;
}

/** Detect the MCP server path (globally installed or local) */
export function findMcpServerPath(): string {
    // Prefer paths relative to the running CLI bundle.
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const entryDir = process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : cliDir;
    const candidates = [
        // Bundled alongside CLI dist by tsup (`dist/mcp-server.js`).
        path.resolve(entryDir, 'mcp-server.js'),
        path.resolve(cliDir, 'mcp-server.js'),
        // Monorepo dev layout from GENOME root.
        path.resolve(cliDir, '..', '..', '..', 'packages', 'mcp-server', 'dist', 'index.js'),
        path.resolve(process.cwd(), 'packages', 'mcp-server', 'dist', 'index.js'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    // Fallback — resolve from node_modules when available.
    try {
        const resolved = import.meta.resolve?.('@nomik/mcp-server');
        if (resolved) return new URL(resolved).pathname.replace(/^\/([A-Z]:)/, '$1');
    } catch {
        // ignore
    }

    return candidates[0] ?? path.resolve(process.cwd(), 'mcp-server.js');
}

export function setupMcpClientConfig(opts: SetupMcpClientOptions): SetupMcpClientResult {
    const mcpPath = findMcpServerPath();

    const envBlock: Record<string, string> = {
        NOMIK_GRAPH_URI: opts.graphUri,
        NOMIK_GRAPH_USER: opts.graphUser,
        NOMIK_GRAPH_PASS: opts.graphPass,
    };
    if (opts.projectId) {
        envBlock.NOMIK_PROJECT_ID = opts.projectId;
    }

    const config = {
        mcpServers: {
            nomik: {
                command: 'node',
                args: [mcpPath],
                env: envBlock,
            },
        },
    };

    const configPath = resolveMcpConfigPath(opts.client, !!opts.global, opts.configPath);

    // Antigravity uses a flat mcpServers format inside mcp_config.json
    // identical to the standard format, so no special handling needed.
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    // Merge with existing config if present
    let existing: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
        try {
            existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {
            existing = {};
        }
    }

    const merged = {
        ...existing,
        mcpServers: {
            ...(existing.mcpServers ?? {}),
            ...config.mcpServers,
        },
    };

    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    return { configPath, configDir, mcpPath };
}

function resolveMcpConfigPath(client: MpcClient, isGlobal: boolean, overridePath?: string): string {
    if (overridePath) return path.resolve(overridePath);

    if (client === 'windsurf') {
        return resolveWindsurfConfigPath();
    }

    if (client === 'antigravity') {
        return resolveAntigravityConfigPath();
    }

    if (client === 'claude') {
        return resolveClaudeConfigPath();
    }

    if (!isGlobal) {
        const localDir = '.cursor';
        return path.resolve(localDir, 'mcp.json');
    }

    const home = os.homedir();
    const appName = client === 'cursor' ? 'Cursor' : 'Windsurf';
    const platform = process.platform;
    if (platform === 'win32') {
        return path.join(home, 'AppData', 'Roaming', appName, 'User', 'globalStorage', 'mcp.json');
    }
    if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', appName, 'User', 'globalStorage', 'mcp.json');
    }
    return path.join(home, '.config', appName, 'User', 'globalStorage', 'mcp.json');
}

function resolveWindsurfConfigPath(): string {
    const home = os.homedir();
    // Official Windsurf/Cascade path.
    const official = path.join(home, '.codeium', 'windsurf', 'mcp_config.json');
    if (fs.existsSync(official)) return official;

    // Legacy fallback kept for compatibility with older local assumptions.
    const platform = process.platform;
    const legacy = platform === 'win32'
        ? path.join(home, 'AppData', 'Roaming', 'Windsurf', 'User', 'globalStorage', 'mcp.json')
        : platform === 'darwin'
            ? path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'globalStorage', 'mcp.json')
            : path.join(home, '.config', 'Windsurf', 'User', 'globalStorage', 'mcp.json');
    if (fs.existsSync(legacy)) return legacy;

    // If nothing exists yet, create official path by default.
    return official;
}

function resolveClaudeConfigPath(): string {
    const home = os.homedir();
    const platform = process.platform;

    // Claude Desktop config paths (from official docs)
    // macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
    // Windows: %APPDATA%\Claude\claude_desktop_config.json
    // Linux: ~/.config/Claude/claude_desktop_config.json
    const candidates = [
        ...(platform === 'win32' ? [
            path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
        ] : []),
        ...(platform === 'darwin' ? [
            path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        ] : []),
        ...(platform === 'linux' ? [
            path.join(home, '.config', 'Claude', 'claude_desktop_config.json'),
        ] : []),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    // Default: create in the standard config location
    if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
}

function resolveAntigravityConfigPath(): string {
    const home = os.homedir();
    const platform = process.platform;

    // Antigravity stores MCP config in mcp_config.json
    // Try known paths, then fall back to a sensible default
    const candidates = [
        // Windows
        ...(platform === 'win32' ? [
            path.join(home, 'AppData', 'Roaming', 'Antigravity', 'mcp_config.json'),
            path.join(home, '.antigravity', 'mcp_config.json'),
        ] : []),
        // macOS
        ...(platform === 'darwin' ? [
            path.join(home, 'Library', 'Application Support', 'Antigravity', 'mcp_config.json'),
            path.join(home, '.antigravity', 'mcp_config.json'),
        ] : []),
        // Linux
        ...(platform === 'linux' ? [
            path.join(home, '.config', 'antigravity', 'mcp_config.json'),
            path.join(home, '.antigravity', 'mcp_config.json'),
        ] : []),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    // Default: create in the standard config location
    if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Antigravity', 'mcp_config.json');
    if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Antigravity', 'mcp_config.json');
    return path.join(home, '.config', 'antigravity', 'mcp_config.json');
}
