# 🧬 GENOME — The Autonomous Knowledge Supervisor

> **"The Operating System for AI-Assisted Engineering"**

GENOME is an independent sidecar **Knowledge Graph** that gives AI assistants a persistent, semantic understanding of your codebase. Instead of dumping files into a prompt, the AI queries a graph to retrieve only the precise nodes it needs.

## 📖 Documentation

| # | Document | Description |
|---|---|---|
| 01 | [Vision](documentations/docs/01-VISION.md) | Problem statement, core concepts, value proposition |
| 02 | [Technology Stack](documentations/docs/02-TECHNOLOGY-STACK.md) | Why TypeScript — comparison with Python, Go, Rust |
| 03 | [Architecture](documentations/docs/03-ARCHITECTURE.md) | System diagram, monorepo structure, module boundaries |
| 04 | [Running Guide](documentations/docs/04-RUNNING_GUIDE.md) | Step-by-step: Docker, Scan, Viz, MCP |
| 05 | [MCP Integration](documentations/docs/05-MCP-INTEGRATION.md) | How Cursor AI, Claude Desktop connect to GENOME |
| 06 | [Security](documentations/docs/06-SECURITY.md) | Threat model, injection prevention, network isolation |
| 07 | [Graph Schema](documentations/docs/07-GRAPH-SCHEMA.md) | Node types, edge types, Cypher queries, indexes |
| 08 | [MVP Roadmap](documentations/docs/08-MVP-ROADMAP.md) | 16-week build plan with weekly milestones |
| 09 | [Go-To-Market](documentations/docs/09-GO-TO-MARKET.md) | Positioning, revenue model, pitch strategy |

## 🚀 Quick Start

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Docker

# 1. Clone & install
git clone <repo> genome && cd genome
pnpm install
pnpm build

# 2. Start graph database
docker compose up -d

# 3. Scan your project (populates the knowledge graph)
pnpm genome scan .

# 4. Start Visualization Dashboard (http://localhost:3000)
cd packages/viz && pnpm dev

# 5. Connect AI (Cursor/Claude)
# Add packages/mcp-server/dist/index.js to your MCP config
# (See .cursor/mcp.json or claude_desktop_config.json)
```

## 💡 Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** | MCP reference SDK, single-language stack, type-safe graph schema |
| Graph DB | **Neo4j Community** (free) | Industry standard, Cypher, APOC, visual browser |
| Parser | **Tree-sitter** | Battle-tested, multi-language, incremental parsing |
| Protocol | **MCP (stdio)** | Direct Cursor/Claude integration, Anthropic-backed standard |
| Monorepo | **Turborepo + pnpm** | Fast builds, workspace isolation, caching |
| Viz | **Cytoscape.js + React** | Force-directed layouts, rich interaction, React integration |

## 📜 License

MIT
