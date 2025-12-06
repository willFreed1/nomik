# GENOME — Architecture & Project Structure

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      GENOME SYSTEM                           │
│                                                              │
│  ┌────────────┐   ┌────────────┐   ┌────────────────────┐   │
│  │   Parser    │──▶│   Graph    │◀──│    MCP Server      │   │
│  │ (Tree-sit)  │   │  (Neo4j)   │   │ (stdio/SSE/HTTP)   │   │
│  └─────▲──────┘   └─────┬──────┘   └────────▲───────────┘   │
│        │                 │                    │               │
│  ┌─────┴──────┐   ┌─────▼──────┐   ┌────────┴───────────┐   │
│  │  Watcher    │   │  Viz Web   │   │  Cursor / Claude   │   │
│  │ (chokidar)  │   │  (D3.js)   │   │  Desktop / CLI     │   │
│  └────────────┘   └────────────┘   └────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │               CLI  (genome scan / query / serve)      │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow

```mermaid
graph LR
    A[Source Code] -->|chokidar watch| B[File Watcher]
    B -->|changed files| C[Parser Engine]
    C -->|AST + symbols| D[Relationship Resolver]
    D -->|nodes + edges| E[Graph Writer]
    E -->|Cypher| F[(Neo4j)]
    F -->|query results| G[MCP Server]
    G -->|MCP protocol| H[Cursor AI / Claude]
    F -->|query results| I[D3 Viz Dashboard]
    F -->|query results| J[CLI]
```

## Monorepo Structure (Turborepo + pnpm)

```
genome/
├── packages/
│   ├── core/                    # Shared kernel (types, config, logger)
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── nodes.ts          # Graph node type definitions
│   │   │   │   ├── edges.ts          # Graph edge type definitions
│   │   │   │   ├── config.ts         # Configuration schema
│   │   │   │   └── index.ts          # Re-exports
│   │   │   ├── config/
│   │   │   │   ├── loader.ts         # Config file discovery & parsing
│   │   │   │   ├── defaults.ts       # Default configuration values
│   │   │   │   └── validator.ts      # Zod schema validation
│   │   │   ├── logger/
│   │   │   │   ├── logger.ts         # Structured JSON logger (pino)
│   │   │   │   └── transports.ts     # Console, file, remote transports
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── parser/                  # Tree-sitter parsing engine
│   │   ├── src/
│   │   │   ├── languages/
│   │   │   │   ├── typescript.ts     # TS/JS grammar + queries
│   │   │   │   ├── python.ts         # Python grammar + queries (Phase 2)
│   │   │   │   ├── go.ts             # Go grammar + queries (Phase 3)
│   │   │   │   └── registry.ts       # Language auto-detection
│   │   │   ├── extractors/
│   │   │   │   ├── functions.ts      # Function/method extraction
│   │   │   │   ├── classes.ts        # Class/interface extraction
│   │   │   │   ├── imports.ts        # Import/require extraction
│   │   │   │   ├── routes.ts         # HTTP route/decorator extraction
│   │   │   │   ├── exports.ts        # Export extraction
│   │   │   │   └── index.ts          # Extractor orchestrator
│   │   │   ├── resolvers/
│   │   │   │   ├── imports.ts        # Import → file resolution
│   │   │   │   ├── calls.ts          # Function call → definition resolution
│   │   │   │   ├── types.ts          # Type reference resolution
│   │   │   │   └── index.ts          # Resolver pipeline
│   │   │   ├── parser.ts             # Main parser orchestrator
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── graph/                   # Graph database abstraction layer
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── nodes.cypher      # Node constraint definitions
│   │   │   │   ├── edges.cypher      # Edge definitions
│   │   │   │   └── indexes.cypher    # Performance indexes
│   │   │   ├── drivers/
│   │   │   │   ├── neo4j.driver.ts   # Neo4j connection & session mgmt
│   │   │   │   ├── falkordb.driver.ts# FalkorDB alternative driver
│   │   │   │   └── driver.interface.ts# Abstract driver contract
│   │   │   ├── queries/
│   │   │   │   ├── write.ts          # Upsert nodes, create edges
│   │   │   │   ├── read.ts           # Traversal, path finding, search
│   │   │   │   ├── impact.ts         # Impact analysis queries
│   │   │   │   ├── delete.ts         # Cleanup, orphan removal
│   │   │   │   └── analytics.ts      # God objects, cycles, metrics
│   │   │   ├── migrations/
│   │   │   │   ├── runner.ts         # Migration executor
│   │   │   │   ├── 001-init.ts       # Initial schema
│   │   │   │   └── 002-indexes.ts    # Performance indexes
│   │   │   ├── graph.service.ts      # High-level graph operations
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── watcher/                 # File system watcher + change detection
│   │   ├── src/
│   │   │   ├── watcher.ts            # chokidar file watcher
│   │   │   ├── differ.ts             # Detect what changed in a file
│   │   │   ├── queue.ts              # Debounced update queue
│   │   │   ├── strategy.ts           # Full-scan vs incremental strategy
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── mcp-server/              # MCP protocol server
│   │   ├── src/
│   │   │   ├── tools/
│   │   │   │   ├── impact-analysis.ts # "What breaks if I change X?"
│   │   │   │   ├── dependency-trace.ts# "Show me the dep chain for X"
│   │   │   │   ├── search-nodes.ts    # "Find all auth-related functions"
│   │   │   │   ├── get-context.ts     # "Get me context for this file"
│   │   │   │   └── graph-stats.ts     # "How healthy is the codebase?"
│   │   │   ├── resources/
│   │   │   │   ├── graph-summary.ts   # Resource: full graph summary
│   │   │   │   └── file-context.ts    # Resource: per-file context
│   │   │   ├── server.ts             # MCP server bootstrap
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── viz/                     # D3.js visualization dashboard
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── GraphCanvas.ts     # Main D3 force-directed graph
│   │   │   │   ├── NodeDetail.ts      # Node inspector panel
│   │   │   │   ├── SearchBar.ts       # Graph search interface
│   │   │   │   ├── FilterPanel.ts     # Node/edge type filters
│   │   │   │   └── ImpactOverlay.ts   # Impact analysis highlight
│   │   │   ├── layouts/
│   │   │   │   ├── force.ts           # Force-directed layout
│   │   │   │   ├── hierarchical.ts    # Tree/DAG layout
│   │   │   │   └── radial.ts          # Radial dependency layout
│   │   │   ├── api/
│   │   │   │   └── client.ts          # REST client to graph API
│   │   │   ├── styles/
│   │   │   │   └── dashboard.css      # Dashboard styles
│   │   │   └── index.html
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/                     # Command-line interface
│       ├── src/
│       │   ├── commands/
│       │   │   ├── init.ts            # genome init — setup config
│       │   │   ├── scan.ts            # genome scan — parse & index
│       │   │   ├── query.ts           # genome query — Cypher query
│       │   │   ├── impact.ts          # genome impact <function>
│       │   │   ├── serve.ts           # genome serve — start MCP + Viz
│       │   │   ├── status.ts          # genome status — graph health
│       │   │   └── watch.ts           # genome watch — incremental mode
│       │   ├── cli.ts                 # CLI entry point (commander)
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docker/
│   ├── docker-compose.yml             # Neo4j + GENOME services
│   ├── docker-compose.dev.yml         # Dev overrides (hot-reload)
│   └── neo4j/
│       └── neo4j.conf                 # Custom Neo4j configuration
│
├── .github/
│   └── workflows/
│       └── ci.yml                     # Lint + test + build
│
├── genome.config.ts                   # User-facing project config
├── turbo.json                         # Turborepo pipeline config
├── pnpm-workspace.yaml                # pnpm workspace definition
├── tsconfig.base.json                 # Shared TS config
├── .eslintrc.json                     # Shared lint config
├── .prettierrc                        # Code formatting
├── package.json                       # Root package
├── LICENSE
└── README.md
```

## Module Responsibilities (Strict Boundaries)

| Module | Responsibility | Depends On | Exposes |
|---|---|---|---|
| `@genome/core` | Types, config, logging | Nothing | Types, Config, Logger |
| `@genome/parser` | Code → structured symbols | `core` | `parseFile()`, `parseProject()` |
| `@genome/graph` | Symbol storage & queries | `core` | `GraphService` |
| `@genome/watcher` | File change detection | `core`, `parser`, `graph` | `WatcherService` |
| `@genome/mcp-server` | AI protocol interface | `core`, `graph` | MCP tools/resources |
| `@genome/viz` | Browser dashboard | `core` (types only) | Web app |
| `@genome/cli` | User command interface | All packages | CLI binary |

> [!CAUTION]
> **No circular dependencies.** The dependency graph is strictly uni-directional: `core` → `parser`/`graph` → `watcher`/`mcp-server` → `cli`. The `viz` package is isolated and communicates via HTTP API only.
