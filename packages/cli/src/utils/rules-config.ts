import fs from 'node:fs';
import path from 'node:path';
import type { RulesConfig } from '@nomik/graph';

const NOMIK_DIR = '.nomik';
const RULES_FILE = 'rules.yaml';

/**
 * Load rules config from .nomik/rules.yaml (simple YAML parser — no dependency needed).
 *
 * Supported keys (same as RulesConfig):
 *   maxDeadCode: 5
 *   maxGodFiles: 3
 *   maxGodFileThreshold: 10
 *   maxDuplicates: 2
 *   maxFunctionCallers: 50
 *   maxDbWritesPerRoute: 3
 *   noCircularImports: true
 *   maxFunctionLines: 200
 *   maxFileLines: 1000
 *   requireEnvVarDefaults: false
 *   maxSecurityIssues: 0
 */
export function loadRulesConfig(cwd: string = process.cwd()): RulesConfig | null {
    const filePath = path.join(cwd, NOMIK_DIR, RULES_FILE);
    if (!fs.existsSync(filePath)) return null;

    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return parseSimpleYaml(raw);
    } catch {
        return null;
    }
}

/**
 * Create a default .nomik/rules.yaml with sensible defaults.
 */
export function createDefaultRulesConfig(cwd: string = process.cwd()): string {
    const dir = path.join(cwd, NOMIK_DIR);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const filePath = path.join(dir, RULES_FILE);
    const content = `# NOMIK Architecture Rules
# These rules are evaluated by \`nomik rules\` and the nm_rules MCP tool.
# Adjust thresholds to match your team's quality standards.

# Maximum allowed dead code functions
maxDeadCode: 5

# Maximum allowed god files (files with too many functions)
maxGodFiles: 3

# Function count threshold for god file detection
maxGodFileThreshold: 10

# Maximum allowed duplicate function groups
maxDuplicates: 2

# Maximum callers per function (high fan-in = coupling risk)
maxFunctionCallers: 50

# Maximum DB write functions triggered per route
maxDbWritesPerRoute: 3

# Disallow circular file-level imports
noCircularImports: true

# Maximum lines per function
maxFunctionLines: 200

# Maximum lines per file
maxFileLines: 1000

# Maximum security issues allowed
maxSecurityIssues: 0
`;

    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

/**
 * Minimal YAML parser — handles key: value pairs (flat, no nesting).
 * Supports: strings, numbers, booleans. Ignores comments (#) and blank lines.
 */
function parseSimpleYaml(raw: string): RulesConfig {
    const config: Record<string, unknown> = {};

    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) continue;

        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();

        // Remove inline comments
        const commentIdx = value.indexOf('#');
        const cleanValue = commentIdx >= 0 ? value.slice(0, commentIdx).trim() : value;

        if (cleanValue === 'true') config[key] = true;
        else if (cleanValue === 'false') config[key] = false;
        else if (/^\d+$/.test(cleanValue)) config[key] = Number(cleanValue);
        else if (/^\d+\.\d+$/.test(cleanValue)) config[key] = Number(cleanValue);
        else config[key] = cleanValue;
    }

    return config as RulesConfig;
}
