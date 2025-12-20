# @genome-ai/cli

Interface en ligne de commande du systeme GENOME. 11 commandes, isolation multi-projet, bundle standalone via tsup.

## Installation

```bash
# Global (npm)
npm install -g @genome-ai/cli

# Ou en local (monorepo dev)
pnpm build
pnpm genome <commande>
```

## Commandes

### `genome init`
Initialise le projet : cree `genome.config.ts`, demarre Neo4j via Docker, cree `.genome/project.json`.

```bash
genome init
genome init --no-docker   # Sans Docker
```

### `genome scan <path>`
Scanne le repertoire, parse les fichiers et les ingere dans Neo4j. Cree automatiquement le projet s'il n'existe pas.

```bash
genome scan .
genome scan . --project my-api   # Nom de projet explicite
```

- **Options** : `--language`, `--project`
- **Auto-detection** : Detecte et met a jour `rootPath` si le dossier a ete renomme.

### `genome status`
Verifie la connexion Neo4j et affiche les statistiques du projet courant.

```bash
genome status
```

### `genome impact <symbol>`
Analyse d'impact sur un symbole (fonction, classe) — scope par projet.

```bash
genome impact "AuthService" --depth 5
```

### `genome watch [path]`
Surveille les fichiers et re-indexe automatiquement (chokidar, debounce 500ms).

```bash
genome watch .
genome watch . --debounce 1000
```

### `genome serve`
Demarre le serveur MCP et le dashboard de visualisation.

```bash
genome serve
```

### `genome query <cypher>`
Execute une requete Cypher brute contre le knowledge graph.

```bash
genome query "MATCH (n:Function) RETURN n.name LIMIT 10"
genome query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json
```

### `genome recent`
Affiche les noeuds recemment modifies — scope par projet.

```bash
genome recent
genome recent --since 2026-02-10T00:00:00Z --limit 50 --json
```

### `genome setup-cursor`
Auto-configure `.cursor/mcp.json` pour connecter Cursor AI a GENOME. Injecte `GENOME_PROJECT_ID` automatiquement.

```bash
genome setup-cursor
genome setup-cursor --global   # Config globale (tous les projets)
```

### `genome project <sous-commande>`
Gestion des projets — isolation des donnees dans Neo4j.

```bash
genome project list              # Lister tous les projets
genome project create my-api     # Creer un projet
genome project switch my-api     # Changer de projet (avec validation atomique)
genome project delete my-api     # Supprimer un projet et ses donnees
genome project info              # Stats du projet courant
```

Le projet courant est stocke dans `.genome/project.json` (version, projectId, projectName, createdAt).

## Architecture

Le CLI utilise `commander` pour le parsing d'arguments et delegue aux services (`@genome/parser`, `@genome/graph`, `@genome/watcher`). Point d'entree : `src/index.ts`. Bundle standalone via `tsup` avec le MCP server inclus dans `dist/mcp-server.js`.
