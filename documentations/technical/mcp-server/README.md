# @nomik/mcp-server

Model Context Protocol (MCP) server for NOMIK. Exposes the knowledge graph to AI agents (Cursor, Claude) via the standard MCP protocol.

## Features

### Resources
- `nomik://stats`: Real-time knowledge graph statistics

### Tools (8 tools)

| Tool | Description | Parameters |
|---|---|---|
| `nm_search` | Search for nodes by name, path or id | `query` (string), `limit` (number) |
| `nm_impact` | Impact analysis of a symbol (APOC traversal) | `symbolId` (string), `depth` (number) |
| `nm_trace` | Dependency chain between two symbols | `from` (string), `to` (string) |
| `nm_context` | Rich context of a file or function | `name` (string) |
| `nm_health` | Health metrics (dead code, god objects, counts) | `includeDeadCode` (bool), `includeGodObjects` (bool), `godObjectThreshold` (number) |
| `nm_path` | Shortest path between two entities | `from` (string), `to` (string) |
| `nm_changes` | Recently modified nodes | `since` (ISO date), `limit` (number) |
| `nm_projects` | List all projects in the graph | none |

### Multi-project isolation

The server reads the `NOMIK_PROJECT_ID` environment variable and automatically filters all requests by project. This ensures an AI agent only sees data for the current project.

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
- `tools.ts`: Definition and handlers for the 8 tools
- `resources.ts`: MCP resources (stats)
