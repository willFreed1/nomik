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

### Setup in Cursor (recommande)

La methode la plus simple est d'utiliser la commande dediee :

```bash
genome setup-cursor
```

Cela cree automatiquement `.cursor/mcp.json` avec la bonne config. Sinon, manuellement :

```json
{
  "mcpServers": {
    "genome": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "genome_local",
        "GENOME_PROJECT_ID": "my-project"
    }
  }
}
```

### MCP Tools Exposed by GENOME

| Tool Name | Description | Example Prompt |
|---|---|---|
| `kb_search` | Recherche de noeuds par nom, type ou pattern | "Find all API route handlers" |
| `kb_impact` | Analyse d'impact : quoi casse si on modifie ce symbole ? | "What's the impact of changing `processPayment()`?" |
| `kb_dependency_trace` | Chaine de dependances complete entre deux symboles | "Show me everything that depends on `UserService`" |
| `kb_get_context` | Contexte riche d'un fichier ou fonction (calls, calledBy, imports, contains) | "Give me context for `auth.middleware.ts`" |
| `kb_graph_stats` | Metriques de sante du graphe (dead code, god objects, counts) | "Are there any God Objects or dependency cycles?" |
| `kb_find_path` | Plus court chemin entre deux entites du code | "How does `LoginButton` connect to `users` DB table?" |
| `kb_recent_changes` | Noeuds modifies recemment | "What changed in the last hour?" |
| `kb_list_projects` | Liste tous les projets dans le graphe | "What projects does GENOME track?" |

> **Note**: Toutes les requetes sont automatiquement filtrees par `projectId` via la variable d'environnement `GENOME_PROJECT_ID`. Cela garantit l'isolation entre projets.

### Example: What Cursor Sees

When you ask Cursor: *"What happens if I modify the payment processing function?"*

**Without GENOME** — Cursor searches files for "payment", finds 47 matches, stuffs them into context, likely misses the cron job dependency.

**With GENOME** — Cursor calls `kb_impact`:

```json
// Tool call from Cursor
{
  "tool": "kb_impact",
  "arguments": {
    "symbol": "processPayment",
    "depth": 3
  }
}

// GENOME response
{
  "impactedNodes": [
    {
      "name": "processPayment",
      "type": "function",
      "file": "src/services/payment.ts",
      "line": 42,
      "directDependents": [
        {
          "name": "POST /api/checkout",
          "type": "route",
          "file": "src/routes/checkout.ts",
          "relationship": "CALLS"
        },
        {
          "name": "handleRefund",
          "type": "function",
          "file": "src/services/refund.ts",
          "relationship": "CALLS"
        }
      ],
      "transitiveDependents": [
        {
          "name": "CheckoutForm",
          "type": "component",
          "file": "src/components/CheckoutForm.tsx",
          "relationship": "DEPENDS_ON → POST /api/checkout"
        },
        {
          "name": "monthlyBillingJob",
          "type": "cron",
          "file": "src/jobs/billing.ts",
          "relationship": "CALLS → processPayment"
        }
      ],
      "externalDeps": ["Stripe API"],
      "dbTables": ["transactions", "payment_logs"]
    }
  ],
  "riskLevel": "HIGH",
  "summary": "processPayment is called by 2 routes, 1 cron job, impacts 2 DB tables and the Stripe integration"
}
```

## Setup in Claude Desktop

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "genome": {
      "command": "genome",
      "args": ["mcp", "--transport", "stdio"],
      "env": {
        "GENOME_GRAPH_URI": "bolt://localhost:7687"
      }
    }
  }
}
```

## MCP Transport Options

| Transport | Use Case | How |
|---|---|---|
| **stdio** | Cursor, Claude Desktop (local) | Process spawned by the client |
| **SSE** | Remote access, web dashboards | HTTP server on configurable port |
| **Streamable HTTP** | Production / multi-client | Stateless HTTP with streaming |

For the MVP, **stdio** is all you need. It's the simplest and what Cursor expects.
