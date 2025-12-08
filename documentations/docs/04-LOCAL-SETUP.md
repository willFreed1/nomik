# GENOME — Local Development Setup (Zero Cost)

## Overview

Everything runs **100% locally** using Docker. No cloud subscriptions, no paid services.

| Component | Tool | Cost | License |
|---|---|---|---|
| Graph Database | Neo4j Community Edition | **Free** | GPL v3 |
| Alternative Graph DB | FalkorDB | **Free** | Server Side Public License |
| Container Runtime | Docker Desktop | **Free** (personal use) | Apache 2.0 (engine) |
| Runtime | Node.js 20 LTS | **Free** | MIT |
| Package Manager | pnpm | **Free** | MIT |
| Build Pipeline | Turborepo | **Free** | MIT |
| Code Parser | Tree-sitter | **Free** | MIT |
| MCP SDK | @modelcontextprotocol/sdk | **Free** | MIT |

## Prerequisites

```powershell
# 1. Install Node.js 20 LTS (if not installed)
winget install OpenJS.NodeJS.LTS

# 2. Install pnpm
npm install -g pnpm

# 3. Install Docker Desktop
winget install Docker.DockerDesktop

# 4. Verify
node --version    # >= 20.x
pnpm --version    # >= 9.x
docker --version  # >= 24.x
```

## Docker Compose — Neo4j Setup

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  neo4j:
    image: neo4j:5-community          # FREE Community Edition
    container_name: genome-neo4j
    ports:
      - "7474:7474"                    # Browser UI
      - "7687:7687"                    # Bolt protocol
    environment:
      NEO4J_AUTH: neo4j/genome_local   # Local dev credentials
      NEO4J_PLUGINS: '["apoc"]'        # Utility procedures
      NEO4J_dbms_memory_heap_max__size: 512M
      NEO4J_dbms_memory_pagecache_size: 256M
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  neo4j_data:
  neo4j_logs:
```

### Alternative: FalkorDB (Even Lighter)

```yaml
# docker/docker-compose.falkordb.yml
version: '3.8'

services:
  falkordb:
    image: falkordb/falkordb:latest
    container_name: genome-falkordb
    ports:
      - "6379:6379"                    # Redis protocol
    volumes:
      - falkordb_data:/data
    restart: unless-stopped

volumes:
  falkordb_data:
```

> [!TIP]
> **FalkorDB** is a Redis-based graph database. It's lighter than Neo4j (~50MB vs ~500MB RAM), uses the Cypher query language, and is perfect for MVPs. If resources are tight, start here.

## Quick Start

```powershell
# 1. Clone and setup
git clone <your-repo> genome
cd genome
pnpm install

# 2. Start Neo4j
docker compose -f docker/docker-compose.yml up -d

# 3. Verify Neo4j is running
# Open http://localhost:7474 in browser
# Login: neo4j / genome_local

# 4. Initial scan
pnpm genome scan ./path/to/your/project

# 5. Start MCP server + Viz dashboard
pnpm genome serve

# 6. Open visualization
# Dashboard at http://localhost:3000
```

## Environment Configuration

```typescript
// genome.config.ts — user-facing project config
import { defineConfig } from '@genome/core';

export default defineConfig({
  // Project to analyze
  target: {
    root: './src',
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.*'],
  },

  // Graph database connection
  graph: {
    driver: 'neo4j',              // or 'falkordb'
    uri: 'bolt://localhost:7687',
    auth: {
      username: 'neo4j',
      password: 'genome_local',
    },
  },

  // Parser configuration
  parser: {
    languages: ['typescript'],     // MVP: TypeScript only
    extractors: {
      routes: true,                // Extract HTTP routes
      externalCalls: true,         // Track external API calls
      dbOperations: true,          // Track database reads/writes
    },
  },

  // Watcher configuration
  watcher: {
    enabled: true,
    debounceMs: 500,               // Wait 500ms after last change
    strategy: 'incremental',       // 'full' or 'incremental'
  },

  // MCP server configuration
  mcp: {
    transport: 'stdio',            // 'stdio' for Cursor, 'sse' for web
    port: 3334,                    // SSE port (if using SSE transport)
  },

  // Visualization dashboard
  viz: {
    port: 3000,
    theme: 'dark',
  },
});
```

## Resource Requirements

| Codebase Size | RAM (Neo4j) | RAM (FalkorDB) | Disk | Scan Time |
|---|---|---|---|---|
| Small (<10K lines) | ~256MB | ~50MB | <100MB | <10s |
| Medium (10-100K lines) | ~512MB | ~128MB | <500MB | <60s |
| Large (100K-500K lines) | ~1GB | ~256MB | <2GB | <5min |
| Huge (>500K lines) | ~2GB | ~512MB | <5GB | <15min |
