# @genome/mcp-server

Serveur Model Context Protocol (MCP) pour GENOME. Expose le knowledge graph aux agents AI (Cursor, Claude) via le protocole MCP standard.

## Fonctionnalites

### Resources
- `genome://stats` : Statistiques temps reel du knowledge graph

### Tools (6 outils)

| Outil | Description | Parametres |
|---|---|---|
| `kb_search` | Recherche de noeuds par nom, path ou id | `query` (string), `labels` (array), `limit` (number) |
| `kb_impact` | Analyse d'impact d'un symbole (traversee APOC) | `symbolName` (string), `depth` (number) |
| `kb_dependency_trace` | Chaine de dependances entre deux symboles | `from` (string), `to` (string) |
| `kb_get_context` | Contexte riche d'un fichier ou fonction | `name` (string) |
| `kb_graph_stats` | Metriques de sante (dead code, god objects, counts) | `includeDeadCode` (bool), `includeGodObjects` (bool), `godObjectThreshold` (number) |
| `kb_find_path` | Plus court chemin entre deux entites | `from` (string), `to` (string) |

## Configuration

Le serveur est configure via `genome.config.ts` ou variables d'environnement.

```typescript
export default defineConfig({
  mcp: {
    transport: 'stdio',  // ou 'sse'
    port: 3334           // port SSE si utilise
  }
});
```

## Utilisation

### Stdio (par defaut — Cursor / Claude Desktop)

Ajouter a `.cursor/mcp.json` :

```json
{
  "mcpServers": {
    "genome": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"]
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
pnpm genome serve
```
