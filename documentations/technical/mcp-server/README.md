# @genome/mcp-server

The Model Context Protocol (MCP) server for GENOME. This package exposes the knowledge graph to AI agents (like Claude) via the standard MCP protocol.

## Features

- **Resources**: Exposes graph data as read-only resources.
  - `genome://stats`: Real-time statistics about the knowledge graph.
- **Tools**: Executable functions for the AI to query the graph.
  - `kb_search`: Search for nodes (functions, classes, files) by name.
  - `kb_impact`: Analyze the downstream impact of changing a node.

## Configuration

The server is configured via `genome.config.ts` in the project root.

```typescript
// genome.config.ts
export default defineConfig({
  mcp: {
    transport: 'stdio', // or 'sse'
    port: 3000 // Only used for SSE/HTTP
  }
});
```

## Usage

### Stdio (Default)

Add to your AI client configuration (e.g., Claude Desktop config):

```json
{
  "mcpServers": {
    "genome": {
      "command": "node",
      "args": ["C:/Users/GP78HX/Documents/GENOME/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Development

```bash
pnpm dev
```
