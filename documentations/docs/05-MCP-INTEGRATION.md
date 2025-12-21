# GENOME — MCP Integration (Cursor AI, Claude Desktop, Claude CLI)

## What Is MCP?

The **Model Context Protocol (MCP)** is an open standard by Anthropic that lets AI assistants connect to external data sources and tools. Think of it as "USB for AI" — a universal plug that lets any AI client talk to any data provider.

GENOME exposes an **MCP Server** that gives AI assistants direct access to the code knowledge graph.

## How Cursor AI Uses GENOME

### Architecture

```
┌────────────────────┐     stdio/SSE      ┌──────────────────┐
│                    │◀──────────────────▶│                  │
│   Cursor IDE       │   MCP Protocol     │  GENOME MCP      │
│   (MCP Client)     │                    │  Server           │
│                    │                    │                  │
│  "What breaks if   │                    │  ┌─────────┐     │
│   I change X?"     │───── tool call ───▶│  │ Neo4j   │     │
│                    │                    │  │ Query   │     │
│  ◀─── structured   │◀── graph result ──│  └─────────┘     │
│       context       │                    │                  │
└────────────────────┘                    └──────────────────┘
```

### Setup in Cursor (recommended)

The simplest method is to use the dedicated command:

```bash
genome setup-cursor
```

This automatically creates `.cursor/mcp.json` with the correct config. Otherwise, manually:

```json
{
  "mcpServers": {
    "genome": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "GENOME_GRAPH_URI": "bolt://localhost:7687",
        "GENOME_GRAPH_USER": "neo4j",
        "GENOME_GRAPH_PASS": "genome_local",
        "GENOME_PROJECT_ID": "my-project"
      }
    }
  }
}
```

### MCP Tools Exposed by GENOME

| Tool Name | Description | Example Prompt |
|---|---|---|
| `kb_search` | Search for nodes by name, type or pattern | "Find all API route handlers" |
| `kb_impact` | Impact analysis: what breaks if we modify this symbol? | "What's the impact of changing `processPayment()`?" |
| `kb_dependency_trace` | Complete dependency chain between two symbols | "Show me everything that depends on `UserService`" |
| `kb_get_context` | Rich context for a file or function (calls, calledBy, imports, contains) | "Give me context for `auth.middleware.ts`" |
| `kb_graph_stats` | Graph health metrics (dead code, god objects, counts) | "Are there any God Objects or dependency cycles?" |
| `kb_find_path` | Shortest path between two code entities | "How does `LoginButton` connect to `users` DB table?" |
| `kb_recent_changes` | Recently modified nodes | "What changed in the last hour?" |
| `kb_list_projects` | List all projects in the graph | "What projects does GENOME track?" |

> **Note**: All queries are automatically filtered by `projectId` via the `GENOME_PROJECT_ID` environment variable. This ensures isolation between projects.

### Example: What Cursor Sees

When you ask Cursor: *"What happens if I modify the payment processing function?"*

**Without GENOME** — Cursor searches files for "payment", finds 47 matches, stuffs them into context, likely misses the cron job dependency.

**With GENOME** — Cursor calls `kb_impact`:

```json
// Tool call from Cursor
{
  "tool": "kb_impact",
  "arguments": {
    "symbolId": "processPayment",
    "depth": 3
  }
}

// GENOME response (liste plate, profondeur et relation reelles)
[
  {
    "name": "POST /api/checkout",
    "type": "Route",
    "filePath": "src/routes/checkout.ts",
    "depth": 1,
    "relationship": "CALLS"
  },
  {
    "name": "handleRefund",
    "type": "Function",
    "filePath": "src/services/refund.ts",
    "depth": 1,
    "relationship": "CALLS"
  },
  {
    "name": "CheckoutForm",
    "type": "Function",
    "filePath": "src/components/CheckoutForm.tsx",
    "depth": 2,
    "relationship": "DEPENDS_ON"
  }
]
```

> Les champs `depth` et `relationship` refletent la traversee APOC reelle (profondeur dans le graphe et type d'edge entrant).

## Setup in Claude Desktop

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "genome": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "GENOME_GRAPH_URI": "bolt://localhost:7687",
        "GENOME_GRAPH_USER": "neo4j",
        "GENOME_GRAPH_PASS": "genome_local",
        "GENOME_PROJECT_ID": "my-project"
      }
    }
  }
}
```

> **Note** : La commande `genome` globale sera disponible apres publication sur npm. En attendant, utilisez le chemin `node packages/mcp-server/dist/index.js`.

## MCP Transport Options

| Transport | Use Case | How |
|---|---|---|
| **stdio** | Cursor, Claude Desktop (local) | Process spawned by the client |
| **SSE** | Remote access, web dashboards | HTTP server on configurable port |
| **Streamable HTTP** | Production / multi-client | Stateless HTTP with streaming |

For the MVP, **stdio** is all you need. It's the simplest and what Cursor expects.
