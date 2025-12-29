# NOMIK — The Living Blueprint

> **AI-native code intelligence graph. Scan once, query everything.**

NOMIK builds a persistent **Knowledge Graph** of your codebase (functions, classes, interfaces, imports, call chains) in Neo4j, then exposes it to AI assistants via **MCP** (Model Context Protocol). Instead of dumping files into a prompt, the AI queries a graph to retrieve exactly what it needs.

## Quick Start (2 minutes)

```bash
# Prerequisites: Node.js 20+, Docker

# 1. Install
npm install -g @nomik-ai/cli

# 2. Initialize (creates config + starts Neo4j)
cd your-project/
nomik init

# 3. Scan your codebase
nomik scan .

# 4. Connect to Cursor AI
nomik setup-cursor

# 5. (Optional) Live graph updates
nomik watch .
```

**That's it.** Restart Cursor and the AI now has full graph-powered context of your codebase.

## What Can the AI Do With NOMIK?

Once connected, Cursor AI gets these tools automatically:

| Tool | What it does | Example prompt |
|---|---|---|
| `nm_search` | Find nodes by name/path | "Find all auth-related functions" |
| `nm_impact` | Impact analysis | "What breaks if I change `parseFile`?" |
| `nm_context` | Full context for a symbol | "Show me everything about `GraphService`" |
| `nm_health` | Codebase health metrics | "Any dead code or god objects?" |
| `nm_path` | Shortest path between symbols | "How does `scanCommand` connect to `neo4j`?" |
| `nm_changes` | Recently modified nodes | "What changed in the last hour?" |
| `nm_trace` | Full dependency chain | "Show me the path from A to B" |
| `nm_projects` | List all tracked projects | "What projects does NOMIK know about?" |

## CLI Commands

```bash
nomik init                    # Setup config + Neo4j Docker + create project
nomik scan <path>             # Parse & index codebase into graph
nomik watch [path]            # Live file watcher, auto-reindex
nomik status                  # Graph health & stats (project-scoped)
nomik impact <symbol>         # Impact analysis for a symbol
nomik query "<cypher>"        # Raw Cypher query
nomik recent                  # Recently changed nodes
nomik setup-cursor            # Auto-configure Cursor MCP
nomik serve                   # Start MCP server + viz dashboard
nomik project list            # List all projects in Neo4j
nomik project create <name>   # Create a new project
nomik project switch <name>   # Switch to another project
nomik project delete <name>   # Delete project and all its data
nomik project info            # Show current project stats
```

## 3D Visualization

NOMIK includes a **3D interactive graph** (Three.js) with rotating neural-network style visualization:

- **Cyan** = Files, **Green** = Functions, **Purple** = Classes/Interfaces
- **Amber lines** = CALLS (animated particles), **Blue dashed** = DEPENDS_ON
- Click any node to zoom + inspect, toggle between 3D/2D modes

```bash
# Start the dashboard
cd packages/viz && pnpm dev
# Open http://localhost:3000
```

## Architecture

```
@nomik/core        - Types, config (Zod), errors, logger (Pino)
@nomik/parser      - Tree-sitter extraction (TS/JS/Python/Rust/MD), file discovery
@nomik/graph       - Neo4j driver, read/write queries, cache, retry
@nomik/watcher     - Chokidar file watcher, incremental reindex
@nomik/mcp-server  - MCP protocol server (stdio), 8 AI tools
@nomik/viz         - React + 3d-force-graph + Cytoscape.js dashboard
@nomik-ai/cli      - Commander CLI, all commands, standalone bundle
```

## Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript (ESM) |
| Supported Languages | TypeScript, JavaScript, Python, Rust, Markdown |
| Graph DB | Neo4j 5 Community + APOC |
| Parser | Tree-sitter (multi-lang) |
| AI Protocol | MCP (Model Context Protocol) |
| Monorepo | Turborepo + pnpm |
| 3D Viz | Three.js (3d-force-graph) |
| 2D Viz | Cytoscape.js |
| Tests | Vitest (78 tests) |
| Project Isolation | projectId on all nodes/edges, `.nomik/project.json` |

## Development (contributors)

```bash
# Clone & setup
git clone https://github.com/willFreed1/NOMIK.git
cd NOMIK
pnpm install
docker compose up -d
pnpm build

# Run all tests
pnpm test

# Dev mode (watch)
pnpm nomik scan .
pnpm nomik watch .
```

## Documentation

| Doc | Description |
|---|---|
| [Vision](documentations/docs/01-VISION.md) | Problem statement, core concepts |
| [Architecture](documentations/docs/03-ARCHITECTURE.md) | System diagram, module boundaries |
| [Running Guide](documentations/docs/04-RUNNING_GUIDE.md) | Step-by-step local setup |
| [MCP Integration](documentations/docs/05-MCP-INTEGRATION.md) | Cursor/Claude connection |
| [Graph Schema](documentations/docs/07-GRAPH-SCHEMA.md) | Node/edge types, Cypher examples |
| [CLI & Tools Reference](documentations/docs/11-CLI-TOOLS-REFERENCE.md) | All commands, MCP tools, Cypher queries |
| [Progress Tracker](documentations/docs/10-PROGRESS-TRACKER.md) | Living MVP progress (~97%) |

## License

MIT
