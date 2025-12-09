# @genome/cli

Interface en ligne de commande du systeme GENOME.

## Installation

```bash
pnpm add -g @genome/cli
# ou en local
pnpm run dev
```

## Commandes

### `genome init`
Initialise un fichier `genome.config.ts` dans le repertoire courant.

```bash
genome init
```

### `genome scan <path>`
Scanne le repertoire, parse les fichiers supportes et les ingere dans Neo4j.

```bash
genome scan . --language typescript
```

- **Arguments** : `<path>` — repertoire racine a scanner
- **Options** : `--language` — langage cible (defaut : `typescript`)

### `genome status`
Verifie la connexion Neo4j et affiche les statistiques du graphe (nodes, edges, types).

```bash
genome status
```

### `genome impact <symbol>`
Analyse d'impact sur un symbole (fonction, classe) pour trouver ce qui en depend.

```bash
genome impact "AuthService" --depth 5
```

- **Arguments** : `<symbol>` — nom du symbole a analyser
- **Options** : `--depth` — profondeur de traversee (defaut : 5)

### `genome watch <path>`
Surveille les fichiers et re-indexe automatiquement les modifications.

```bash
genome watch .
```

Utilise `chokidar` avec debounce (500ms). Re-parse et re-ingere les fichiers modifies en temps reel.

### `genome serve`
Demarre le serveur MCP (pour integration AI via Cursor/Claude).

```bash
genome serve
```

### `genome query <cypher>`
Execute une requete Cypher brute contre le knowledge graph.

```bash
# Format tableau
genome query "MATCH (n:Function) RETURN n.name, n.filePath LIMIT 10"

# Format JSON
genome query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json
```

- **Arguments** : `<cypher>` — requete Cypher
- **Options** : `--json` / `-j` — sortie JSON brute

### `genome recent`
Affiche les noeuds recemment modifies dans le knowledge graph.

```bash
# Changements des 24 dernieres heures
genome recent

# Changements depuis une date
genome recent --since 2026-02-10T00:00:00Z

# Format JSON
genome recent --json --limit 50
```

- **Options** :
  - `--since` / `-s` — date ISO (defaut : 24h ago)
  - `--limit` / `-l` — nombre max de resultats (defaut : 30)
  - `--json` / `-j` — sortie JSON brute

## Architecture

Le CLI utilise `commander` pour le parsing d'arguments et delegue la logique aux services (`@genome/parser`, `@genome/graph`, `@genome/watcher`). Logging structure via `pino`.
