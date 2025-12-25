# @nomik-ai/cli

Command-line interface for the NOMIK system. 10 commands, multi-project isolation, standalone bundle via tsup.

## Installation

```bash
# Global (npm)
npm install -g @nomik-ai/cli

# Or local (monorepo dev)
pnpm build
pnpm nomik <command>
```

## Commands

### `nomik init`
Initializes the project: creates `nomik.config.ts`, starts Neo4j via Docker, creates `.nomik/project.json`.

```bash
nomik init
nomik init --no-docker   # Without Docker
```

### `nomik scan <path>`
Scans the directory, parses files and ingests them into Neo4j. Automatically creates the project if it does not exist.

```bash
nomik scan .
nomik scan . --project my-api   # Explicit project name
```

- **Options**: `--language`, `--project`
- **Auto-detection**: Detects and updates `rootPath` if the folder has been renamed.

### `nomik status`
Verifies Neo4j connection and displays statistics for the current project.

```bash
nomik status
```

### `nomik impact <symbol>`
Impact analysis on a symbol (function, class) — scoped by project.

```bash
nomik impact "AuthService" --depth 5
```

### `nomik watch [path]`
Watches files and re-indexes automatically (chokidar, 500ms debounce).

```bash
nomik watch .
nomik watch . --debounce 1000
```

### `nomik serve`
Starts the MCP server and visualization dashboard.

```bash
nomik serve
```

### `nomik query <cypher>`
Executes a raw Cypher query against the knowledge graph.

```bash
nomik query "MATCH (n:Function) RETURN n.name LIMIT 10"
nomik query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json
```

### `nomik recent`
Displays recently modified nodes — scoped by project.

```bash
nomik recent
nomik recent --since 2026-02-10T00:00:00Z --limit 50 --json
```

### `nomik setup-cursor`
Auto-configures `.cursor/mcp.json` to connect Cursor AI to NOMIK. Injects `NOMIK_PROJECT_ID` automatically.

```bash
nomik setup-cursor
nomik setup-cursor --global   # Global config (all projects)
```

### `nomik project <subcommand>`
Project management — data isolation in Neo4j.

```bash
nomik project list              # List all projects
nomik project create my-api     # Create a project
nomik project switch my-api     # Switch project (with atomic validation)
nomik project delete my-api     # Delete a project and its data
nomik project info              # Stats for current project
```

The current project is stored in `.nomik/project.json` (version, projectId, projectName, createdAt).

## Architecture

The CLI uses `commander` for argument parsing and delegates to services (`@nomik/parser`, `@nomik/graph`, `@nomik/watcher`). Entry point: `src/index.ts`. Standalone bundle via `tsup` with the MCP server included in `dist/mcp-server.js`.
