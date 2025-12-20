# GENOME Technical Architecture

> Ce document fournit une vue d'ensemble technique du systeme GENOME. Pour les details de chaque package, voir les sous-repertoires.

## Vue d'ensemble

GENOME est un knowledge graph sidecar qui analyse le code source, construit un graphe de dependances dans Neo4j, et expose ces donnees via un serveur MCP ou une CLI.

```mermaid
graph TD
    User[User / IDE] -->|MCP / CLI| Core
    subgraph GENOME
        Core[Core Logic]
        Parser[Tree-sitter Parser]
        Graph[Neo4j Graph Database]
        
        Core --> Parser
        Core --> Graph
        Parser -->|Nodes + Edges| Core
    end
    Source[Source Code] -->|Read| Parser
```

## Packages (7)

Le monorepo est divise en packages strictement scopes :

### 1. [CLI](./cli/README.md) (`@genome-ai/cli`)
Interface en ligne de commande.
- **Commandes** : `init`, `scan`, `status`, `impact`, `watch`, `serve`, `query`, `recent`, `setup-cursor`, `project` (list/create/switch/delete/info).
- **Isolation** : Lit `.genome/project.json` pour scoper les operations par projet.

### 2. [Core](./core/README.md) (`@genome/core`)
Infrastructure partagee et types.
- **Responsabilites** : Configuration (Zod), gestion d'erreurs typees (`GenomeError`), logging structure (Pino), types (`GraphNode`, `GraphEdge`, `ProjectNode`).

### 3. [Parser](./parser/README.md) (`@genome/parser`)
Moteur d'intelligence qui convertit le code source en noeuds de graphe.
- **Langages** : TypeScript, JavaScript, Python, Rust, Markdown.
- **Tech** : Tree-sitter (TS/JS/Python/Rust), parser custom (Markdown).
- **Extracteurs** : functions, classes, imports, exports, routes, calls (TS/JS), python.ts, rust.ts, markdown.ts.

### 4. [Graph](./graph/README.md) (`@genome/graph`)
Couche de persistance et de requetes.
- **Tech** : Neo4j Community (Bolt), driver abstrait, `scopedDriver` pour injection automatique de `projectId`.
- **Features** : Batch UNWIND upserts, QueryCache TTL 30s, retry backoff exponentiel, CRUD projet.
- **Queries** : Impact analysis, dead code, god objects, dependency chain, stats, recent changes — tous filtres par `projectId`.

### 5. [MCP Server](./mcp-server/README.md) (`@genome/mcp-server`)
Interface AI via Model Context Protocol.
- **Tools** (8) : `kb_search`, `kb_impact`, `kb_dependency_trace`, `kb_get_context`, `kb_graph_stats`, `kb_find_path`, `kb_recent_changes`, `kb_list_projects`.
- **Resources** : `genome://stats`.
- **Isolation** : Lit `GENOME_PROJECT_ID` depuis l'environnement pour scoper toutes les requetes.

### 6. [Visualization](./viz/README.md) (`@genome/viz`)
Dashboard interactif d'exploration du graphe.
- **Tech** : React + Vite, Cytoscape.js (2D), 3d-force-graph/Three.js (3D), TailwindCSS.
- **Composants** : GraphViewer, Graph3DViewer, SearchBar, FilterPanel, NodeDetail, HelpModal, LayoutSelector.
- **Layouts** : Force (cose), Arbre (breadthfirst), Radial (concentric), Cercle (circle).

### 7. [Watcher](./watcher/) (`@genome/watcher`)
Surveillance de fichiers pour reindexation incrementale.
- **Tech** : chokidar, debounce configurable, support `projectId`.
- **Integration** : Utilise `@genome/parser` pour re-parser et `@genome/graph` pour re-ingerer.

## Multi-projet

Chaque noeud et chaque relation porte un `projectId` pour l'isolation logique dans une seule base Neo4j Community. Le projet courant est stocke dans `.genome/project.json` (commitable dans git).

## Principes de conception

1. **Boundaries strictes** : Pas de dependances circulaires. `core` est la dependance feuille.
2. **Pipeline** : Parsing et ingestion sont des etapes separees (backpressure).
3. **Observabilite** : Logging structure (Pino) partout.
4. **Erreurs typees** : `GenomeError` avec `code`, `severity`, `recoverable`.
5. **Isolation** : `projectId` injecte a chaque couche via `scopedDriver` et parametres explicites.
