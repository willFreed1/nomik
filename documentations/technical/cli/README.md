# @genome-ai/cli

Command-line interface for the GENOME system. 10 commands, multi-project isolation, standalone bundle via tsup.

## Installation

```bash
# Global (npm)
npm install -g @genome-ai/cli

# Or local (monorepo dev)
pnpm build
pnpm genome <command>
```

## Commands

### `genome init`
Initializes the project: creates `genome.config.ts`, starts Neo4j via Docker, creates `.genome/project.json`.

```bash
genome init
genome init --no-docker   # Without Docker
```

### `genome scan <path>`
Scans the directory, parses files and ingests them into Neo4j. Automatically creates the project if it does not exist.

```bash
genome scan .
genome scan . --project my-api   # Explicit project name
```

- **Options**: `--language`, `--project`
- **Auto-detection**: Detects and updates `rootPath` if the folder has been renamed.

### `genome status`
Verifies Neo4j connection and displays statistics for the current project.

```bash
genome status
```

### `genome impact <symbol>`
Impact analysis on a symbol (function, class) — scoped by project.

```bash
genome impact "AuthService" --depth 5
```

### `genome watch [path]`
Watches files and re-indexes automatically (chokidar, 500ms debounce).

```bash
genome watch .
genome watch . --debounce 1000
```

### `genome serve`
Starts the MCP server and visualization dashboard.

```bash
genome serve
```

### `genome query <cypher>`
Executes a raw Cypher query against the knowledge graph.

```bash
genome query "MATCH (n:Function) RETURN n.name LIMIT 10"
genome query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json
```

### `genome recent`
Displays recently modified nodes — scoped by project.

```bash
genome recent
genome recent --since 2026-02-10T00:00:00Z --limit 50 --json
```

### `genome setup-cursor`
Auto-configures `.cursor/mcp.json` to connect Cursor AI to GENOME. Injects `GENOME_PROJECT_ID` automatically.

```bash
genome setup-cursor
genome setup-cursor --global   # Global config (all projects)
```

### `genome project <subcommand>`
Project management — data isolation in Neo4j.

```bash
genome project list              # List all projects
genome project create my-api     # Create a project
genome project switch my-api     # Switch project (with atomic validation)
genome project delete my-api     # Delete a project and its data
genome project info              # Stats for current project
```

The current project is stored in `.genome/project.json` (version, projectId, projectName, createdAt).

## Architecture

The CLI uses `commander` for argument parsing and delegates to services (`@genome/parser`, `@genome/graph`, `@genome/watcher`). Entry point: `src/index.ts`. Standalone bundle via `tsup` with the MCP server included in `dist/mcp-server.js`.
