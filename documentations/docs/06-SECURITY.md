# NOMIK — Security Architecture

## Threat Model

NOMIK operates as a **local sidecar** — it never touches production systems directly. However, it processes and stores sensitive information about your codebase, making security non-negotiable.

| Threat | Risk | Mitigation |
|---|---|---|
| Graph DB exposed to network | HIGH | Bind to `127.0.0.1` only, Docker network isolation |
| Credentials in config files | HIGH | Environment variables, `.env` files in `.gitignore` |
| MCP server accepts arbitrary queries | MEDIUM | Input validation, parameterized Cypher (no injection) |
| Source code stored in graph | MEDIUM | Graph stores metadata only, not raw source code |
| Viz dashboard exposes architecture | LOW | Localhost-only by default, optional auth for remote |
| Dependency supply chain | MEDIUM | Lockfile pinning, `pnpm audit`, Snyk/Socket integration |

## Security Rules (Non-Negotiable)

### 1. No Raw Source Code in the Graph
The graph stores **metadata** — function names, file paths, line numbers, relationships. It does **NOT** store raw source code. This means:
- A stolen graph DB reveals architecture, not implementation
- Compliance-friendly (no PII/secrets in the graph)

### 2. Parameterized Cypher Only
Every graph query MUST use parameters. Never concatenate user input into Cypher strings.

```typescript
// ✅ CORRECT — Parameterized
async function findNode(name: string) {
  return session.run(
    'MATCH (n:Function {name: $name}) RETURN n',
    { name }
  );
}

// ❌ NEVER — SQL/Cypher injection risk
async function findNode(name: string) {
  return session.run(`MATCH (n:Function {name: '${name}'}) RETURN n`);
}
```

### 3. Network Isolation

```yaml
# docker-compose.yml — security hardening
services:
  neo4j:
    ports:
      - "127.0.0.1:7474:7474"    # Bind to localhost ONLY
      - "127.0.0.1:7687:7687"    # No external access
```

> **Note** : Sur Docker Desktop (Windows/macOS), `networks: internal: true` peut bloquer le port-forwarding host→container. Le binding `127.0.0.1` suffit pour empecher l'acces externe. Ne pas utiliser `internal: true` sur Docker Desktop.

### 4. Environment-Based Secrets

```bash
# .env (NEVER committed to git)
NOMIK_GRAPH_URI=bolt://localhost:7687
NOMIK_GRAPH_USER=neo4j
NOMIK_GRAPH_PASS=nomik_local_$(openssl rand -hex 8)
NOMIK_MCP_SECRET=mcp_$(openssl rand -hex 16)
```

```gitignore
# .gitignore
.env
.env.local
.env.*.local
```

### 5. MCP Server Authentication (Phase 2)

For remote MCP access (SSE/HTTP transport), implement token-based auth:

```typescript
// MCP server middleware (Phase 2)
const server = new McpServer({
  authenticate: async (request) => {
    const token = request.headers['x-nomik-token'];
    if (!token || !verifyToken(token)) {
      throw new McpError('Unauthorized', 401);
    }
  },
});
```

### 6. Audit Logging

Every graph mutation is logged with timestamp, source, and actor:

```typescript
interface AuditEntry {
  timestamp: string;      // ISO 8601
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  nodeType: string;
  nodeId: string;
  source: 'parser' | 'watcher' | 'mcp' | 'manual';
  details?: Record<string, unknown>;
}
```

### 7. Dependency Security

```json
// package.json — security scripts
{
  "scripts": {
    "security:audit": "pnpm audit --audit-level=high",
    "security:licenses": "license-checker --failOn 'GPL-3.0'",
    "security:lockfile": "lockfile-lint --path pnpm-lock.yaml --type npm --allowed-hosts npm"
  }
}
```

## RBAC Model (Phase 2 — Multi-Tenant)

| Role | Read Graph | Write Graph | Run MCP Tools | Admin |
|---|---|---|---|---|
| `viewer` | ✅ | ❌ | ❌ | ❌ |
| `developer` | ✅ | ❌ | ✅ | ❌ |
| `maintainer` | ✅ | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ | ✅ |

## Automated Security Pipeline

```yaml
# .github/workflows/security.yml
name: Security
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm security:audit
      - run: pnpm security:licenses
```
