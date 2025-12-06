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
> Le fichier `docker-compose.yml` est a la racine du projet.

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

### AI Client Configuration
Add the following to your AI client's MCP configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "genome": {
      "command": "node",
      "args": ["C:/Users/GP78HX/Documents/GENOME/packages/mcp-server/dist/index.js"]
    }
  }
}
```
