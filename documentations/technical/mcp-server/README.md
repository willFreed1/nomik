# @genome/mcp-server

Serveur Model Context Protocol (MCP) pour GENOME. Expose le knowledge graph aux agents AI (Cursor, Claude) via le protocole MCP standard.

## Fonctionnalites

### Resources
- `genome://stats` : Statistiques temps reel du knowledge graph

### Tools (8 outils)

| Outil | Description | Parametres |
|---|---|---|
| `kb_search` | Recherche de noeuds par nom, path ou id | `query` (string), `limit` (number) |
| `kb_impact` | Analyse d'impact d'un symbole (traversee APOC) | `symbolId` (string), `depth` (number) |
| `kb_dependency_trace` | Chaine de dependances entre deux symboles | `from` (string), `to` (string) |
| `kb_get_context` | Contexte riche d'un fichier ou fonction | `name` (string) |
| `kb_graph_stats` | Metriques de sante (dead code, god objects, counts) | `includeDeadCode` (bool), `includeGodObjects` (bool), `godObjectThreshold` (number) |
| `kb_find_path` | Plus court chemin entre deux entites | `from` (string), `to` (string) |
| `kb_recent_changes` | Noeuds modifies recemment | `since` (ISO date), `limit` (number) |
| `kb_list_projects` | Liste tous les projets dans le graphe | aucun |

### Isolation multi-projet

Le serveur lit la variable d'environnement `GENOME_PROJECT_ID` et filtre automatiquement toutes les requetes par projet. Cela garantit qu'un agent AI ne voit que les donnees du projet courant.

## Configuration

### Via `genome setup-cursor` (recommande)

```bash
genome setup-cursor
```

Cree automatiquement `.cursor/mcp.json` avec le bon chemin et les variables d'environnement, incluant `GENOME_PROJECT_ID` si un projet est configure localement.

### Configuration manuelle

Ajouter a `.cursor/mcp.json` :

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

### Developpement

```bash
cd packages/mcp-server
pnpm dev
```

### Via CLI

```bash
genome serve
```

## Architecture interne

- `index.ts` : Bootstrap du serveur MCP (stdio transport)
- `tools.ts` : Definition et handler des 8 outils
- `resources.ts` : Resources MCP (stats)
