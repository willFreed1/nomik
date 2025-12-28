# NOMIK Technical Architecture

> This document provides a technical overview of the NOMIK system. For details on each package, see the subdirectories.

## Overview

NOMIK is a knowledge graph sidecar that analyzes source code, builds a dependency graph in Neo4j, and exposes this data via an MCP server or CLI.

```mermaid
graph TD
    User[User / IDE] -->|MCP / CLI| Core
    subgraph NOMIK
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

The monorepo is divided into strictly scoped packages:

### 1. [CLI](./cli/README.md) (`@nomik-ai/cli`)
Command-line interface.
- **Commands**: `init`, `scan`, `status`, `impact`, `watch`, `serve`, `query`, `recent`, `setup-cursor`, `project` (list/create/switch/delete/info).
- **Isolation**: Reads `.nomik/project.json` to scope operations per project.

### 2. [Core](./core/README.md) (`@nomik/core`)
Shared infrastructure and types.
- **Responsibilities**: Configuration (Zod), typed error handling (`NomikError`), structured logging (Pino), types (`GraphNode`, `GraphEdge`, `ProjectNode`).

### 3. [Parser](./parser/README.md) (`@nomik/parser`)
Intelligence engine that converts source code into graph nodes.
- **Languages**: TypeScript, JavaScript, Python, Rust, Markdown.
- **Tech**: Tree-sitter (TS/JS/Python/Rust), custom parser (Markdown).
- **Extractors**: functions, classes, imports, exports, routes, calls (TS/JS), python.ts, rust.ts, markdown.ts.

### 4. [Graph](./graph/README.md) (`@nomik/graph`)
Persistence and query layer.
- **Tech**: Neo4j Community (Bolt), abstract `GraphDriver` interface with Neo4j implementation.
- **Features**: Batch UNWIND upserts, QueryCache TTL 30s, exponential retry backoff, project CRUD.
- **Queries**: Impact analysis, dead code, god objects, dependency chain, stats, recent changes — all filtered by `projectId`.

### 5. [MCP Server](./mcp-server/README.md) (`@nomik/mcp-server`)
AI interface via Model Context Protocol.
- **Tools** (8): `nm_search`, `nm_impact`, `nm_dependency_trace`, `nm_get_context`, `nm_graph_stats`, `nm_find_path`, `nm_recent_changes`, `nm_list_projects`.
- **Resources**: `nomik://stats`.
- **Isolation**: Reads `NOMIK_PROJECT_ID` from the environment to scope all requests.

### 6. [Visualization](./viz/README.md) (`@nomik/viz`)
Interactive graph exploration dashboard.
- **Tech**: React + Vite, Cytoscape.js (2D), 3d-force-graph/Three.js (3D), TailwindCSS.
- **Components**: GraphViewer, Graph3DViewer, SearchBar, FilterPanel, NodeDetail, HelpModal, LayoutSelector.
- **Layouts**: Force (cose), Tree (breadthfirst), Radial (concentric), Circle (circle).

### 7. [Watcher](./watcher/) (`@nomik/watcher`)
File watching for incremental reindexing.
- **Tech**: chokidar, configurable debounce, `projectId` support.
- **Integration**: Uses `@nomik/parser` for re-parsing and `@nomik/graph` for re-ingestion.

## Multi-project

Each node and each relation carries a `projectId` for logical isolation in a single Neo4j Community database. The current project is stored in `.nomik/project.json` (committable in git).

## Design Principles

1. **Strict boundaries**: No circular dependencies. `core` is the leaf dependency.
2. **Pipeline**: Parsing and ingestion are separate steps (backpressure).
3. **Observability**: Structured logging (Pino) everywhere.
4. **Typed errors**: `NomikError` with `code`, `severity`, `recoverable`.
5. **Isolation**: `projectId` injected at each layer via explicit parameters on all queries and mutations.
