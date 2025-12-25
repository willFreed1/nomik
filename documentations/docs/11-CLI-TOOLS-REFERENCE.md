# NOMIK — Reference complete CLI & outils MCP

> Toutes les commandes CLI et tous les outils MCP avec exemples d'utilisation.

---

## CLI — 10 commandes

### `nomik init`

Initialise un nouveau projet NOMIK : cree la config, demarre Neo4j via Docker, cree `.nomik/project.json`.

```bash
nomik init
nomik init --no-docker   # Sans Docker
```

---

### `nomik scan <path>`

Scanne un repertoire, parse les fichiers (TS/JS/Python/Rust/Markdown) et ingere les noeuds/edges dans Neo4j. Rafraichit les donnees par fichier (supprime l'ancien contenu avant re-insertion).

```bash
nomik scan .
nomik scan ./src --project my-api
```

**Comportement** : pour chaque fichier, `clearFileData()` supprime les anciens noeuds, puis re-insere. Ce n'est pas un append — c'est un refresh par fichier.

---

### `nomik status`

Verifie la connexion Neo4j et affiche les statistiques du projet courant (noeuds, edges, fichiers, fonctions, classes, routes).

```bash
nomik status
```

---

### `nomik impact <symbol>`

Analyse d'impact : quels noeuds sont affectes si on modifie un symbole. Utilise APOC `expandConfig` pour traverser le graphe en profondeur avec les types de relation reels.

```bash
nomik impact "parseFile" --depth 5
nomik impact "GraphService" --depth 3
```

**Sortie** : liste de noeuds impactes avec profondeur reelle et type de relation (`CALLS`, `DEPENDS_ON`, etc.).

---

### `nomik watch [path]`

Surveillance continue des fichiers. Re-indexe automatiquement les fichiers modifies (chokidar, debounce 500ms par defaut).

```bash
nomik watch .
nomik watch ./src --debounce 1000
```

---

### `nomik serve`

Demarre le serveur MCP et le dashboard de visualisation.

```bash
nomik serve
```

---

### `nomik query "<cypher>"`

Execute une requete Cypher brute contre le graphe.

```bash
# Format tableau
nomik query "MATCH (n:Function) RETURN n.name, n.filePath LIMIT 10"

# Format JSON
nomik query "MATCH (n)-[r]->(m) RETURN type(r), count(*)" --json

# Dead code — fonctions jamais appelees (exclut constructeurs, methodes de classes, React, barrel re-exports)
nomik query "MATCH (f:Function) WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-() AND f.name <> 'constructor' WITH f WHERE NOT f.filePath ENDS WITH '.tsx' AND NOT f.filePath ENDS WITH '.jsx' OPTIONAL MATCH (parent:File)-[:CONTAINS]->(f) WITH f, parent WHERE parent IS NULL OR (NOT parent.path ENDS WITH 'index.ts' AND NOT parent.path ENDS WITH 'index.js') RETURN f.name, f.filePath ORDER BY f.filePath"

# God objects — couplage cross-fichier inattendu (seuil: 15)
nomik query "MATCH (f:Function)-[:CALLS]->(target) MATCH (ff:File)-[:CONTAINS]->(f) WHERE NOT (ff)-[:CONTAINS]->(target) MATCH (tf:File)-[:CONTAINS]->(target) WHERE NOT (ff)-[:DEPENDS_ON]->(tf) WITH f, count(DISTINCT target) as deps WHERE deps > 15 RETURN f.name, f.filePath, deps ORDER BY deps DESC"

# Chemin le plus court entre deux symboles
nomik query "MATCH (a {name: 'parseFile'}), (b {name: 'GraphService'}) MATCH path = shortestPath((a)-[*..10]-(b)) RETURN [n IN nodes(path) | n.name] as chain"
```

---

### `nomik recent`

Affiche les noeuds recemment modifies (scope par projet).

```bash
nomik recent
nomik recent --since 2026-02-10T00:00:00Z --limit 50 --json
```

---

### `nomik setup-cursor`

Configure automatiquement `.cursor/mcp.json` pour connecter Cursor AI a NOMIK. Injecte `NOMIK_PROJECT_ID` automatiquement.

```bash
nomik setup-cursor
nomik setup-cursor --global   # Config globale (tous les projets)
```

---

### `nomik project <subcommand>`

Gestion multi-projet — isolation des donnees dans Neo4j via `projectId`.

```bash
nomik project list              # Liste tous les projets
nomik project create my-api     # Cree un projet
nomik project switch my-api     # Change de projet actif
nomik project delete my-api     # Supprime un projet et ses donnees
nomik project info              # Stats du projet courant
```

Le projet courant est stocke dans `.nomik/project.json`.

---

## Outils MCP — 8 outils

Ces outils sont exposes automatiquement quand le serveur MCP est connecte a Cursor ou Claude.

### `kb_search`

Recherche de noeuds par nom, chemin ou pattern. Supporte les wildcards.

| Parametre | Type | Requis | Description |
|---|---|---|---|
| `query` | string | oui | Terme de recherche (nom du symbole) |
| `limit` | number | non | Nombre max de resultats (defaut: 10) |

**Exemples de prompts Cursor** :
- "Find all auth-related functions"
- "Search for GraphService"
- "Show me all route handlers"

---

### `kb_impact`

Analyse d'impact descendante. Retourne les noeuds dependants avec la **profondeur reelle** et le **type de relation reel** (pas de donnees hardcodees).

| Parametre | Type | Requis | Description |
|---|---|---|---|
| `symbolId` | string | oui | ID ou nom du noeud source |
| `depth` | number | non | Profondeur de traversee (defaut: 3) |

**Exemples de prompts Cursor** :
- "What breaks if I change parseFile?"
- "Impact analysis for GraphService with depth 5"

**Reponse** :
```json
[
  { "name": "scanCommand", "type": "Function", "filePath": "cli/scan.ts", "depth": 1, "relationship": "CALLS" },
  { "name": "watchCommand", "type": "Function", "filePath": "cli/watch.ts", "depth": 2, "relationship": "DEPENDS_ON" }
]
```

---

### `kb_dependency_trace`

Chaine de dependance complete entre deux symboles. Retourne le chemin le plus court sous forme de liste de noms.

| Parametre | Type | Requis | Description |
|---|---|---|---|
| `from` | string | oui | Nom du symbole source |
| `to` | string | oui | Nom du symbole cible |

**Exemples de prompts Cursor** :
- "Show the dependency chain from scanCommand to neo4j"
- "How does parseFile depend on createNodeId?"

---

### `kb_find_path`

Chemin le plus court entre deux entites avec **detail complet** : types de noeuds, types de relations a chaque etape.

| Parametre | Type | Requis | Description |
|---|---|---|---|
| `from` | string | oui | Nom du noeud source |
| `to` | string | oui | Nom du noeud cible |

> **Difference avec `kb_dependency_trace`** : `kb_find_path` retourne les types de noeuds et de relations a chaque etape. `kb_dependency_trace` retourne uniquement les noms.

**Reponse** :
```json
{
  "from": "parseFile",
  "to": "neo4j",
  "paths": [
    {
      "steps": [
        { "nodeName": "parseFile", "nodeType": "Function", "filePath": "parser.ts" },
        { "nodeName": "parser.ts", "nodeType": "File", "filePath": "parser.ts" },
        { "nodeName": "graph.service.ts", "nodeType": "File", "filePath": "graph.service.ts" }
      ],
      "relationships": ["CONTAINS", "DEPENDS_ON"],
      "length": 2
    }
  ]
}
```

---

### `kb_get_context`

Contexte riche pour un fichier ou une fonction : ce qu'il contient, ce qu'il appelle, qui l'appelle, ses imports, ses heritages.

| Parametre | Type | Requis | Description |
|---|---|---|---|
| `name` | string | oui | Nom du fichier (chemin) ou de la fonction/classe |

**Exemples de prompts Cursor** :
- "Give me context for graph.service.ts"
- "What does parseFile call and who calls it?"

---

### `kb_graph_stats`

Metriques de sante du graphe : comptages, dead code, god objects, types d'edges.

| Parametre | Type | Requis | Description |
|---|---|---|---|
| `includeDeadCode` | boolean | non | Inclure la liste du dead code (defaut: false) |
| `includeGodObjects` | boolean | non | Inclure la liste des god objects (defaut: false) |
| `godObjectThreshold` | number | non | Seuil de couplage cross-fichier pour god objects (defaut: 15) |

**Exemples de prompts Cursor** :
- "Are there any dead code or god objects?"
- "Give me full graph health stats with dead code details"

---

### `kb_recent_changes`

Noeuds modifies recemment (par `updatedAt`).

| Parametre | Type | Requis | Description |
|---|---|---|---|
| `since` | string | non | Date ISO (defaut: 24h) |
| `limit` | number | non | Max resultats (defaut: 30) |

**Exemples de prompts Cursor** :
- "What changed in the last hour?"
- "Show me recent changes since yesterday"

---

### `kb_list_projects`

Liste tous les projets dans le graphe Neo4j.

| Parametre | Type | Requis | Description |
|---|---|---|---|
| _(aucun)_ | — | — | — |

**Exemple de prompt Cursor** :
- "What projects does NOMIK track?"

---

## Requetes Cypher utiles

```cypher
-- Tous les types d'edges et leurs comptages
MATCH ()-[r]->() RETURN type(r) as type, count(r) as count ORDER BY count DESC

-- Fonctions les plus appelees (hotspots)
MATCH (f:Function)<-[r:CALLS]-()
RETURN f.name, f.filePath, count(r) as callers
ORDER BY callers DESC LIMIT 10

-- Fichiers les plus connectes
MATCH (f:File)-[r]-()
RETURN f.path, count(r) as connections
ORDER BY connections DESC LIMIT 10

-- Fonctions orphelines (ni appelees ni appelantes)
MATCH (f:Function)
WHERE NOT (f)-[:CALLS]->() AND NOT (f)<-[:CALLS]-()
RETURN f.name, f.filePath

-- Chaine d'appels complete depuis une fonction
MATCH path = (start:Function {name: "parseFile"})-[:CALLS*1..5]->(end)
RETURN [n IN nodes(path) | n.name] as chain, length(path) as depth
ORDER BY depth DESC
```

---

## Variables d'environnement

| Variable | Utilisation | Defaut |
|---|---|---|
| `NOMIK_GRAPH_DRIVER` | Driver de base de donnees (`neo4j`) | `neo4j` |
| `NOMIK_GRAPH_URI` | URI de connexion Neo4j | `bolt://localhost:7687` |
| `NOMIK_GRAPH_USER` | Utilisateur Neo4j | `neo4j` |
| `NOMIK_GRAPH_PASS` | Mot de passe Neo4j | `nomik_local` |
| `NOMIK_LOG_LEVEL` | Niveau de log (`debug`, `info`, `warn`, `error`) | `info` |
| `NOMIK_MCP_PORT` | Port du serveur MCP (mode SSE) | `3334` |
| `NOMIK_VIZ_PORT` | Port du dashboard de visualisation | `3333` |
| `NOMIK_PROJECT_ID` | ID du projet pour le scope MCP | _(non defini = tous les projets)_ |
