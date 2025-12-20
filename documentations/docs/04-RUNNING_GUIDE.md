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

### Or via CLI
```bash
pnpm genome serve
```

### Configuration automatique Cursor

La methode recommandee est d'utiliser la commande dediee :

```bash
pnpm genome setup-cursor
```

Cela cree automatiquement `.cursor/mcp.json` avec le bon chemin vers le MCP server et les variables Neo4j.

### Configuration manuelle (Claude Desktop)

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

Le watcher utilise `chokidar` avec debounce (500ms par defaut) pour re-parser et re-ingerer les fichiers modifies. Les donnees sont isolees par projet via `projectId`.

---

## Step 7: Query the Graph (Optional)

```bash
# Format tableau
pnpm genome query "MATCH (n:Function) RETURN n.name, n.filePath LIMIT 10"

# Format JSON
pnpm genome query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json
```

---

## Step 8: Gestion des projets (Optional)

GENOME isole les donnees par projet. Chaque noeud et chaque relation porte un `projectId`.

```bash
# Lister les projets
pnpm genome project list

# Creer un nouveau projet
pnpm genome project create my-api

# Voir les stats du projet courant
pnpm genome project info

# Changer de projet
pnpm genome project switch other-project

# Supprimer un projet et ses donnees
pnpm genome project delete old-project
```

Le projet courant est stocke dans `.genome/project.json` (a committer dans git pour partager avec l'equipe).
