# NOMIK — Technology Stack Decision

## The Verdict: **TypeScript (Node.js)**

### Why TypeScript Wins for the MVP

| Factor | TypeScript | Python | Go | Rust |
|---|---|---|---|---|
| **Tree-sitter bindings** | ✅ Official, mature | ⚠️ Community | ⚠️ Community | ✅ Native (TS is overkill) |
| **MCP SDK** | ✅ **Reference impl** (Anthropic) | ⚠️ Exists, secondary | ❌ Community only | ❌ Community only |
| **Frontend/Viz (Three.js / Cytoscape.js)** | ✅ Native | ❌ Needs separate app | ❌ Needs separate app | ❌ Needs separate app |
| **Neo4j driver** | ✅ Official | ✅ Official | ✅ Official | ⚠️ Community |
| **Iteration speed** | ✅ Fast | ✅ Fast | ⚠️ Medium | ❌ Slow |
| **Type safety** | ✅ Yes | ⚠️ Optional (mypy) | ✅ Yes | ✅ Yes |
| **Ecosystem (npm)** | ✅ Largest | ✅ Large | ⚠️ Smaller | ⚠️ Smaller |
| **Monorepo tooling** | ✅ Turborepo/Nx | ⚠️ Poetry workspaces | ⚠️ Go workspaces | ⚠️ Cargo workspaces |
| **Deployment** | ✅ Docker, serverless | ✅ Docker, serverless | ✅ Single binary | ✅ Single binary |

### The Decisive Factors

#### 1. MCP SDK Is TypeScript-First
Anthropic's **official MCP SDK** (`@modelcontextprotocol/sdk`) is the **reference implementation** in TypeScript. Every MCP feature lands here first. Building NOMIK's MCP server in TypeScript means:
- Zero lag on protocol updates
- Battle-tested patterns from the official examples
- Direct compatibility with Cursor, Claude Desktop, and every MCP client

#### 2. Single-Language Stack
TypeScript covers **every layer** of NOMIK:
- **Parser** → Tree-sitter Node bindings (`tree-sitter`, `tree-sitter-typescript`, etc.)
- **Graph** → Neo4j official driver (`neo4j-driver`)
- **MCP Server** → `@modelcontextprotocol/sdk`
- **CLI** → `commander` or `yargs`
- **Visualization** → Three.js (3d-force-graph) / Cytoscape.js (native JavaScript)
- **File Watcher** → `chokidar`

One language = one team can own everything. No polyglot overhead for the MVP.

#### 3. Type Safety for Graph Schemas
TypeScript's type system lets you define **strict interfaces** for graph nodes and edges:

```typescript
interface FunctionNode {
  type: 'function';
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  params: string[];
  returnType?: string;
  decorators?: string[];
  confidence: number; // 0-1
}

interface DependsOnEdge {
  type: 'DEPENDS_ON';
  source: string; // node ID
  target: string; // node ID
  kind: 'import' | 'call' | 'http' | 'event';
  confidence: number;
}
```

### Languages supported by the parser

NOMIK already analyzes several languages via Tree-sitter:

| Language | Grammar | Extractors | Status |
|---|---|---|---|
| TypeScript / JavaScript | `tree-sitter-typescript` | functions, classes, imports, exports, routes, calls | **Done** |
| Python | `tree-sitter-python` | functions, classes, imports, calls | **Done** |
| Rust | `tree-sitter-rust` | functions, structs/enums/traits, use, calls | **Done** |
| Markdown | Custom parser (regex) | sections, headings | **Done** |
| Go | `tree-sitter-go` | Not started | Backlog |

### Planned languages (Roadmap Q2 2026)

| Phase | Language | Goal | Status |
|---|---|---|---|
| **Q2 2026** | **C# / .NET** | Enterprise ecosystems (banks, government) | Planned |
| **Q2 2026** | **Go** | Cloud/infra (K8s, microservices) | Planned |
| Scale | **Java** | Enterprise JVM ecosystem | Backlog |
| Scale | **Native Rust** | High-performance parser for repos >1M lines | Backlog |

### Runtime Requirements

| Component | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 LTS | Required for Tree-sitter native bindings |
| TypeScript | ≥ 5.4 | Strict mode, `satisfies` operator |
| Package Manager | pnpm ≥ 9 | Workspace support, disk-efficient |
| Build Tool | tsup or esbuild | Fast bundling for CLI |
| Monorepo | Turborepo | Task orchestration, caching |
