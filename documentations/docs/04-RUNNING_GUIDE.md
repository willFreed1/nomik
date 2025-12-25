# Running NOMIK

This guide explains how to run the NOMIK system from scratch.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker

## Step 1: Start the Graph Database

NOMIK uses Neo4j to store the code relationship graph.

```bash
docker compose up -d
```
> The `docker-compose.yml` file is at the project root.

## Step 2: Build the System

Ensure all packages are compiled and type-safe.

```bash
pnpm install
pnpm build
```

## Step 3: Populate the Graph (Scan)

The CLI scans your source code and builds the graph in Neo4j.

```bash
# Scan the NOMIK project itself
pnpm nomik scan .
```

To verify the data is in the database, visit `http://localhost:7474` (User: `neo4j`, Pass: `nomik_local`) and run:
```cypher
MATCH (n) RETURN n LIMIT 25
```

## Step 4: Launch the Visualization Dashboard

Interact with your knowledge graph visually.

```bash
cd packages/viz
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000).

## Step 5: Connect AI Agents (MCP)

To let AI assistants (like Cursor or Claude) use your knowledge graph:

### Development Mode
```bash
cd packages/mcp-server
pnpm dev
```

### Or via CLI
```bash
pnpm nomik serve
```

### Automatic Cursor Configuration

The recommended method is to use the dedicated command:

```bash
pnpm nomik setup-cursor
```

This automatically creates `.cursor/mcp.json` with the correct path to the MCP server and Neo4j variables.

### Manual Configuration (Claude Desktop)

```json
{
  "mcpServers": {
    "nomik": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "NOMIK_GRAPH_URI": "bolt://localhost:7687",
        "NOMIK_GRAPH_USER": "neo4j",
        "NOMIK_GRAPH_PASS": "nomik_local",
        "NOMIK_PROJECT_ID": "nomik"
      }
    }
  }
}
```

---

## Step 6: Watch for Changes (Optional)

Auto-reindex files as you edit them:

```bash
pnpm nomik watch .
```

The watcher uses `chokidar` with debounce (500ms by default) to re-parse and re-ingest modified files. Data is isolated per project via `projectId`.

---

## Step 7: Query the Graph (Optional)

```bash
# Format tableau
pnpm nomik query "MATCH (n:Function) RETURN n.name, n.filePath LIMIT 10"

# Format JSON
pnpm nomik query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json
```

---

## Step 8: Project Management (Optional)

NOMIK isolates data per project. Each node and each relationship carries a `projectId`.

```bash
# List projects
pnpm nomik project list

# Create a new project
pnpm nomik project create my-api

# View current project stats
pnpm nomik project info

# Switch project
pnpm nomik project switch other-project

# Delete a project and its data
pnpm nomik project delete old-project
```

The current project is stored in `.nomik/project.json` (to be committed in git for team sharing).
