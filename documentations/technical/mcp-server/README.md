# @nomik/mcp-server

Model Context Protocol (MCP) server for NOMIK. Exposes the knowledge graph to AI agents (Cursor, Claude) via the standard MCP protocol.

## Features

### Resources
- `nomik://stats`: Real-time knowledge graph statistics

### Tools (9 tools)

All tools accept an optional `project` parameter that overrides the `NOMIK_PROJECT_ID` env var for per-call project scoping.

| Tool | Description | Key Parameters |
|---|---|---|
| `nm_search` | Search for nodes by name, path or id | `query`, `limit`, `project` |
| `nm_impact` | Impact analysis of a symbol (APOC traversal) | `symbolId`, `depth`, `project` |
| `nm_trace` | Dependency chain between two symbols | `from`, `to`, `project` |
| `nm_context` | Rich context of a file or function | `name`, `project` |
| `nm_health` | Health metrics (dead code, god objects, god files, duplicates, counts) | `includeDeadCode`, `includeGodObjects`, `includeGodFiles`, `includeDuplicates`, `project` |
| `nm_db_impact` | DB table/column read-write analysis | `table`, `column?`, `limit`, `project` |
| `nm_path` | Shortest path between two entities | `from`, `to`, `project` |
| `nm_changes` | Recently modified nodes | `since`, `limit`, `project` |
| `nm_projects` | List all projects in the graph | none |

### Multi-project isolation

The server reads the `NOMIK_PROJECT_ID` environment variable and automatically filters all requests by project. Every tool also accepts an explicit `project` parameter that overrides the env var — useful when querying multiple projects in the same AI session.

## Configuration

### Via `nomik setup-cursor` (recommended)

```bash
nomik setup-cursor
```

Automatically creates `.cursor/mcp.json` with the correct path and environment variables, including `NOMIK_PROJECT_ID` if a project is configured locally.

### Manual configuration

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nomik": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "NOMIK_GRAPH_URI": "bolt://localhost:7687",
        "NOMIK_GRAPH_USER": "neo4j",
        "NOMIK_GRAPH_PASS": "nomik_local",
        "NOMIK_PROJECT_ID": "my-project"
      }
    }
  }
}
```

### Development

```bash
cd packages/mcp-server
pnpm dev
```

### Via CLI

```bash
nomik serve
```

## Internal architecture

- `index.ts`: MCP server bootstrap (stdio transport)
- `tools.ts`: Definition and handlers for the 9 tools (all with `project` param + path normalization in nm_search/nm_context)
- `resources.ts`: MCP resources (stats)
