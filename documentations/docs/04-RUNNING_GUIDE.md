# Running GENOME

This guide explains how to run the GENOME system from scratch.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker

## Step 1: Start the Graph Database

GENOME uses Neo4j to store the code relationship graph.

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
# Scan the GENOME project itself
pnpm genome scan .
```

To verify the data is in the database, visit `http://localhost:7474` (User: `neo4j`, Pass: `genome_local`) and run:
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
pnpm genome serve
```

### Automatic Cursor Configuration

The recommended method is to use the dedicated command:

```bash
pnpm genome setup-cursor
```

This automatically creates `.cursor/mcp.json` with the correct path to the MCP server and Neo4j variables.

### Manual Configuration (Claude Desktop)

```json
{
  "mcpServers": {
    "genome": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "genome_local",
        "GENOME_PROJECT_ID": "my-project"
      }
    }
  }
}
```

---

## Step 6: Watch for Changes (Optional)

Auto-reindex files as you edit them:

```bash
pnpm genome watch .
```

The watcher uses `chokidar` with debounce (500ms by default) to re-parse and re-ingest modified files. Data is isolated per project via `projectId`.

---

## Step 7: Query the Graph (Optional)

```bash
# Format tableau
pnpm genome query "MATCH (n:Function) RETURN n.name, n.filePath LIMIT 10"

# Format JSON
pnpm genome query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json
```

---

## Step 8: Project Management (Optional)

GENOME isolates data per project. Each node and each relationship carries a `projectId`.

```bash
# List projects
pnpm genome project list

# Create a new project
pnpm genome project create my-api

# View current project stats
pnpm genome project info

# Switch project
pnpm genome project switch other-project

# Delete a project and its data
pnpm genome project delete old-project
```

The current project is stored in `.genome/project.json` (to be committed in git for team sharing).
