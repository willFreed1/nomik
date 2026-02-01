# NOMIK — Complete CLI & MCP Tools Reference

> All CLI commands and MCP tools with usage examples.

---

## CLI — 12 Commands

### `nomik init`

Initializes a new NOMIK project: creates config, starts Neo4j via Docker, creates `.nomik/project.json`.

```bash
nomik init
nomik init --no-docker   # Without Docker
```

---

### `nomik scan <path>`

Scans a directory, parses files (TS/JS/Python/Rust/Markdown/SQL/C# EF/Django/Alembic migrations) and ingests nodes/edges into Neo4j. Refreshes data per file (deletes old content before re-insertion).

```bash
nomik scan .
nomik scan ./src --project my-api
```

**Behavior**: for each file, `clearFileData()` deletes old nodes, then re-inserts. This is not an append — it's a per-file refresh.

---

### `nomik status`

Checks the Neo4j connection and displays current project statistics (nodes, edges, files, functions, classes, routes).

```bash
nomik status
```

---

### `nomik impact <symbol>`

Impact analysis: which nodes are affected if a symbol is modified. Uses APOC `expandConfig` to traverse the graph in depth with real relationship types.

```bash
nomik impact "parseFile" --depth 5
nomik impact "GraphService" --depth 3
```

**Output**: list of impacted nodes with actual depth and relationship type (`CALLS`, `DEPENDS_ON`, etc.).

---

### `nomik watch [path]`

Continuous file monitoring. Automatically re-indexes modified files (chokidar, 500ms debounce by default).

```bash
nomik watch .
nomik watch ./src --debounce 1000
```

---

### `nomik serve`

Starts the visualization dashboard (and keeps a local MCP debug mode).

```bash
nomik serve
nomik serve --no-viz
```

> **MCP IDE Note**: for Cursor/Windsurf in stdio mode, `nomik serve` is not required.  
> After `setup-cursor` or `setup-windsurf`, the IDE launches the MCP server automatically.

---

### `nomik query "<cypher>"`

Executes a raw Cypher query against the graph.

```bash
# Table format
nomik query "MATCH (n:Function) RETURN n.name, n.filePath LIMIT 10"

# JSON format
nomik query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json

# Dead code — functions never called (excludes constructors, class methods, React, barrel re-exports)
nomik query "MATCH (f:Function) WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-() AND f.name <> 'constructor' WITH f WHERE NOT f.filePath ENDS WITH '.tsx' AND NOT f.filePath ENDS WITH '.jsx' OPTIONAL MATCH (parent:File)-[:CONTAINS]->(f) WITH f, parent WHERE parent IS NULL OR (NOT parent.path ENDS WITH 'index.ts' AND NOT parent.path ENDS WITH 'index.js') RETURN f.name, f.filePath ORDER BY f.filePath"

# God objects — unexpected cross-file coupling (threshold: 15)
nomik query "MATCH (f:Function)-[:CALLS]->(target) MATCH (ff:File)-[:CONTAINS]->(f) WHERE NOT (ff)-[:CONTAINS]->(target) MATCH (tf:File)-[:CONTAINS]->(target) WHERE NOT (ff)-[:DEPENDS_ON]->(tf) WITH f, count(DISTINCT target) as deps WHERE deps > 15 RETURN f.name, f.filePath, deps ORDER BY deps DESC"

# Shortest path between two symbols
nomik query "MATCH (a {name: 'parseFile'}), (b {name: 'GraphService'}) MATCH path = shortestPath((a)-[*..10]-(b)) RETURN [n IN nodes(path) | n.name] as chain"
```

---

### `nomik recent`

Displays recently modified nodes (scoped by project).

```bash
nomik recent
nomik recent --since 2026-02-10T00:00:00Z --limit 50 --json
```

---

### `nomik setup-cursor`

Automatically configures `.cursor/mcp.json` to connect Cursor AI to NOMIK. Injects `NOMIK_PROJECT_ID` automatically.

```bash
nomik setup-cursor
nomik setup-cursor --global   # Global config (all projects)
nomik setup-cursor --config-path ./custom-mcp.json
```

---

### `nomik setup-windsurf`

Automatically configures `~/.codeium/windsurf/mcp_config.json` to connect Windsurf AI to NOMIK. Injects `NOMIK_PROJECT_ID` automatically.

```bash
nomik setup-windsurf
nomik setup-windsurf --global   # Compatibility (Windsurf uses a user-level config)
nomik setup-windsurf --config-path ./custom-mcp_config.json
```

---

### `nomik project <subcommand>`

Multi-project management — data isolation in Neo4j via `projectId`.

```bash
nomik project list              # List all projects
nomik project create my-api     # Create a project
nomik project switch my-api     # Switch active project
nomik project delete my-api     # Delete a project and its data
nomik project info              # Current project stats
```

The current project is stored in `.nomik/project.json`.

---

### `nomik pr-impact`

PR blast-radius analyzer. Uses a **graph-vs-parse diff** to detect renamed, deleted, modified, and newly added symbols — then queries the knowledge graph to find all downstream dependents. Outputs a risk report.

**Tracked symbol types**: functions, classes, variables (exported consts), and routes (API endpoints).

```bash
# Auto-detects default branch (master or main)
nomik pr-impact

# Diff against a specific branch
nomik pr-impact --base develop

# Diff since a specific commit (no merge-base, direct diff)
nomik pr-impact --since abc1234
nomik pr-impact --since HEAD~3

# Limit graph traversal depth
nomik pr-impact --base main --depth 5

# JSON output (for CI/CD pipelines)
nomik pr-impact --json
```

**Flags**:
| Flag | Short | Description |
|------|-------|-------------|
| `--base <branch>` | `-b` | Base branch to diff against (auto-detects master/main) |
| `--since <commit>` | `-s` | Diff since a specific commit SHA (direct diff, skips merge-base) |
| `--depth <n>` | | Maximum graph traversal depth (default: 3) |
| `--json` | `-j` | Output raw JSON (for CI/CD pipelines) |

**Workflow**:
1. `git diff <base>` → list of changed files + changed line ranges
2. For each changed file: fetch **old symbols** from the graph, re-parse to get **new symbols**, diff to categorize:
   - 💀 **Disappeared** — symbol in graph but not in new parse (rename or deletion) → guaranteed breaking if it has callers
   - ⚡ **Modified** — same name in both, body overlaps changed lines
   - ✨ **Added** — new symbol not in graph yet
3. For **deleted files**: all graph symbols for that file are marked disappeared
4. Query Neo4j by **symbol ID** (not name) for each non-added symbol → blast radius
5. Aggregate into risk report: `LOW` / `MEDIUM` / `HIGH`
   - Any disappeared symbol with callers → automatic `HIGH` (guaranteed breakage)

**Tracked changes include**:
- **Functions** — renames, signature changes, body modifications, deletions
- **Classes** — renames, restructuring, deletions
- **Variables** — exported `const` renames/deletions (e.g. `export const API_URL` → `BASE_URL`)
- **Routes** — API endpoint path changes (e.g. `GET /users` → `GET /api/users`), handler renames, deletions

**Stale graph warning**: If changed files have no graph data but contain symbols, `pr-impact` warns you to run `nomik scan` first.

**Output example**:
```
🔍 PR Impact Analysis (base: main)
   3 files changed, 18 lines modified
   2 parseable source files

   3 changed symbols detected:
     💀 1 removed/renamed
     ⚡ 1 modified
     ✨ 1 added

     💀  isFunctionLike  (packages/parser/src/extractors/functions.ts)
     ⚡  extractFunctions  (packages/parser/src/extractors/functions.ts)
     ✨  isFunctionLikes  (packages/parser/src/extractors/functions.ts)

════════════════════════════════════════════════════════════
  📊 PR IMPACT REPORT
════════════════════════════════════════════════════════════

  🔴 HIGH — Careful review needed
  Changed: 3 symbols | Direct callers: 1 (1 from removed symbols)

  ─── 💀 isFunctionLike [REMOVED] ───
      file: packages/parser/src/extractors/functions.ts
      1 direct caller(s): 🚨 BREAKING
        CALLS        extractFunctions  (packages/parser/src/extractors/functions.ts)

  ─── ⚡ extractFunctions ───
      file: packages/parser/src/extractors/functions.ts
      ✅ No direct callers affected

  ─── ✨ isFunctionLikes [NEW] ───
      file: packages/parser/src/extractors/functions.ts
      ✨ New symbol — no callers yet
```

**Symbol icons**:
| Icon | Meaning |
|------|---------|
| 💀 | Removed/renamed symbol |
| ⚡ | Modified function |
| 🏗️ | Modified class |
| 📦 | Modified variable |
| 🌐 | Modified route |
| ✨ | New symbol |

> **Note**: Requires a recent `nomik scan` — the graph must be up-to-date for rename/deletion detection to work. Falls back to parse-only mode (no rename detection) if Neo4j is unavailable.

#### CI/CD Integration

Use `--json` to integrate `pr-impact` into your CI pipeline and block merges on high-risk PRs.

**GitHub Actions**:
```yaml
name: PR Impact Check
on: [pull_request]
jobs:
  impact:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git diff
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm build
      - name: Start Neo4j
        run: docker compose up -d neo4j && sleep 5
      - run: pnpm nomik scan .
      - name: Run PR Impact
        run: |
          RESULT=$(pnpm nomik pr-impact --base ${{ github.event.pull_request.base.ref }} --json)
          RISK=$(echo "$RESULT" | jq -r '.riskLevel')
          echo "$RESULT" | jq .
          if [ "$RISK" = "HIGH" ]; then
            echo "::error::PR Impact is HIGH — review required"
            exit 1
          fi
```

**GitLab CI**:
```yaml
pr-impact:
  stage: test
  script:
    - pnpm install && pnpm build
    - docker compose up -d neo4j && sleep 5
    - pnpm nomik scan .
    - |
      RESULT=$(pnpm nomik pr-impact --base $CI_MERGE_REQUEST_TARGET_BRANCH_NAME --json)
      RISK=$(echo "$RESULT" | jq -r '.riskLevel')
      echo "$RESULT" | jq .
      if [ "$RISK" = "HIGH" ]; then
        echo "PR Impact is HIGH — review required"
        exit 1
      fi
  only:
    - merge_requests
```

**JSON output schema** (from `--json`):
```json
{
  "changedSymbols": 3,
  "directCallers": 8,
  "disappearedWithCallers": 1,
  "riskLevel": "HIGH",
  "symbols": [
    {
      "name": "isFunctionLike",
      "type": "function",
      "changeKind": "disappeared",
      "filePath": "packages/parser/src/extractors/functions.ts",
      "directCallers": 1,
      "transitiveImports": 89,
      "callers": [
        { "name": "extractFunctions", "type": "Function", "filePath": "...", "depth": 1, "relationship": "CALLS" }
      ]
    }
  ]
}
```

---

## MCP Tools — 9 tools

These tools are automatically exposed when the MCP server is connected to Cursor or Claude.

### `nm_search`

Search for nodes by name, path, or pattern. Supports wildcards.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search term (symbol name) |
| `limit` | number | no | Max number of results (default: 10) |
| `project` | string | no | Project name to scope the search to. Overrides `NOMIK_PROJECT_ID` env var. |

**Cursor prompt examples**:
- "Find all auth-related functions"
- "Search for GraphService"
- "Show me all route handlers"

---

### `nm_impact`

Downstream impact analysis. Returns dependent nodes with **actual depth** and **real relationship type** (no hardcoded data).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `symbolId` | string | yes | ID or name of the source node |
| `depth` | number | no | Traversal depth (default: 3) |
| `project` | string | no | Project name to scope the analysis to. Overrides `NOMIK_PROJECT_ID` env var. |

**Cursor prompt examples**:
- "What breaks if I change parseFile?"
- "Impact analysis for GraphService with depth 5"

**Response**:
```json
[
  { "name": "scanCommand", "type": "Function", "filePath": "cli/scan.ts", "depth": 1, "relationship": "CALLS" },
  { "name": "watchCommand", "type": "Function", "filePath": "cli/watch.ts", "depth": 2, "relationship": "DEPENDS_ON" }
]
```

---

### `nm_trace`

Complete dependency chain between two symbols. Returns the shortest path as a list of names.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `from` | string | yes | Source symbol name |
| `to` | string | yes | Target symbol name |
| `project` | string | no | Project name to scope the trace to. Overrides `NOMIK_PROJECT_ID` env var. |

**Cursor prompt examples**:
- "Show the dependency chain from scanCommand to neo4j"
- "How does parseFile depend on createNodeId?"

---

### `nm_path`

Shortest path between two entities with **full detail**: node types and relationship types at each step.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `from` | string | yes | Source node name |
| `to` | string | yes | Target node name |
| `project` | string | no | Project name to scope the path search to. Overrides `NOMIK_PROJECT_ID` env var. |

> **Difference from `nm_trace`**: `nm_path` returns node types and relationship types at each step. `nm_trace` returns only names.

**Response**:
```json
{
  "from": "parseFile",
  "to": "neo4j",
  "paths": [
    {
      "steps": [
        { "nodeName": "parseFile", "nodeType": "Function", "filePath": "parser.ts" },
        { "nodeName": "parser.ts", "nodeType": "File", "filePath": "parser.ts" },
        { "nodeName": "graph.service.ts", "nodeType": "File", "filePath": "graph.service.ts" }
      ],
      "relationships": ["CONTAINS", "DEPENDS_ON"],
      "length": 2
    }
  ]
}
```

---

### `nm_context`

Rich context for a file or function: what it contains, what it calls, who calls it, its imports, its inheritance.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | File name (path) or function/class name |
| `project` | string | no | Project name to scope the context to. Overrides `NOMIK_PROJECT_ID` env var. |

**Cursor prompt examples**:
- "Give me context for graph.service.ts"
- "What does parseFile call and who calls it?"

---

### `nm_health`

Graph health metrics: counts, dead code, god objects, god files, duplicate code, edge types.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `project` | string | no | Project name to scope the analysis to. Overrides `NOMIK_PROJECT_ID` env var. |
| `includeDeadCode` | boolean | no | Include dead code list (default: false) |
| `includeGodObjects` | boolean | no | Include god objects list (default: false) |
| `godObjectThreshold` | number | no | Cross-file coupling threshold for god objects (default: 15) |
| `includeGodFiles` | boolean | no | Include god files list — files with too many functions (default: false). Reports accurate `totalLines` (actual line count, not byte size). |
| `godFileThreshold` | number | no | Functions per file threshold for god files (default: 10) |
| `includeDuplicates` | boolean | no | Include duplicate code detection — functions with identical bodyHash (default: false). Excludes trivial stubs (<3 lines). |

**Cursor prompt examples**:
- "Are there any dead code or god objects?"
- "Give me full graph health stats with dead code details"

---

### `nm_db_impact`

Analyzes DB impact for a table (and optionally a column): who reads, who writes, and known columns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `table` | string | yes | Table name (e.g., `users`) |
| `column` | string | no | Column name (e.g., `email`) |
| `limit` | number | no | Max rows per readers/writers list (default: 100) |
| `project` | string | no | Project name to scope the analysis to. Overrides `NOMIK_PROJECT_ID` env var. |

**Cursor prompt examples**:
- "Who reads table users?"
- "Who writes users.email?"

---

### `nm_changes`

Recently modified nodes (by `updatedAt`).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `since` | string | no | ISO date (default: 24h) |
| `limit` | number | no | Max results (default: 30) |
| `project` | string | no | Project name to scope the changes to. Overrides `NOMIK_PROJECT_ID` env var. |

**Cursor prompt examples**:
- "What changed in the last hour?"
- "Show me recent changes since yesterday"

---

### `nm_projects`

Lists all projects in the Neo4j graph.

| Parameter | Type | Required | Description |
|---|---|---|---|
| _(none)_ | — | — | — |

**Cursor prompt example**:
- "What projects does NOMIK track?"

---

## Useful Cypher Queries

```cypher
-- All edge types and their counts
MATCH ()-[r]->() RETURN type(r) as type, count(r) as count ORDER BY count DESC

-- Most-called functions (hotspots)
MATCH (f:Function)<-[r:CALLS]-()
RETURN f.name, f.filePath, count(r) as callers
ORDER BY callers DESC LIMIT 10

-- Most-connected files
MATCH (f:File)-[r]-()
RETURN f.path, count(r) as connections
ORDER BY connections DESC LIMIT 10

-- Orphan functions (neither called nor calling)
MATCH (f:Function)
WHERE NOT (f)-[:CALLS]->() AND NOT (f)<-[:CALLS]-()
RETURN f.name, f.filePath

-- Complete call chain from a function
MATCH path = (start:Function {name: "parseFile"})-[:CALLS*1..5]->(end)
RETURN [n IN nodes(path) | n.name] as chain, length(path) as depth
ORDER BY depth DESC
```

---

## Environment Variables

| Variable | Usage | Default |
|---|---|---|
| `NOMIK_GRAPH_DRIVER` | Database driver (`neo4j`) | `neo4j` |
| `NOMIK_GRAPH_URI` | Neo4j connection URI | `bolt://localhost:7687` |
| `NOMIK_GRAPH_USER` | Neo4j user | `neo4j` |
| `NOMIK_GRAPH_PASS` | Neo4j password | `nomik_local` |
| `NOMIK_LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | `info` |
| `NOMIK_MCP_PORT` | MCP server port (SSE mode) | `3334` |
| `NOMIK_VIZ_PORT` | Visualization dashboard port | `3333` |
| `NOMIK_PROJECT_ID` | Project ID for MCP scope | _(undefined = all projects)_ |
