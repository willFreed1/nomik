# NOMIK — The Living Blueprint

> **AI-native code intelligence graph. Scan once, query everything.**

NOMIK builds a persistent **Knowledge Graph** of your codebase — functions, classes, imports, call chains, external API calls, database operations — in Neo4j, then exposes it to AI assistants via **MCP** (Model Context Protocol). Instead of dumping files into a prompt, the AI queries a graph to retrieve exactly what it needs.

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
# Scans files under the provided path and tags them to the current
# project (.nomik/project.json), or use --project <name>

# 4. Connect to your IDE
nomik setup-cursor     # or: nomik setup-windsurf

# 5. (Optional) Live graph updates
nomik watch .
```

**That's it.** Restart your IDE and the AI now has full graph-powered context of your codebase.

## What Can the AI Do With NOMIK?

Once connected, your AI assistant gets these tools automatically:

| Tool | What it does | Example prompt |
|---|---|---|
| `nm_search` | Find nodes by name/path | "Find all auth-related functions" |
| `nm_db_impact` | Analyze read/write impact for a DB table/column | "Who writes to users.email?" |
| `nm_impact` | Impact analysis | "What breaks if I change `parseFile`?" |
| `nm_context` | Full context for a symbol | "Show me everything about `GraphService`" |
| `nm_health` | Codebase health metrics | "Any dead code, god objects, or god files?" |
| `nm_path` | Shortest path between symbols | "How does `scanCommand` connect to `neo4j`?" |
| `nm_changes` | Recently modified nodes | "What changed in the last hour?" |
| `nm_trace` | Full dependency chain | "Show me the path from A to B" |
| `nm_projects` | List all tracked projects | "What projects does NOMIK know about?" |

## What NOMIK Tracks

### Code Structure (all languages)
- **Functions** — params, return types, async, generators, decorators, exported/private
- **Classes** — inheritance (extends/implements), methods, properties, abstract
- **Imports/Exports** — static, dynamic `import()`, namespace, barrel re-exports
- **Call chains** — intra-file, cross-file, `obj.method()`, callbacks, shorthand refs
- **Routes** — Express/Fastify/NestJS HTTP endpoints → handler binding

### External API Calls (dynamic, import-aware)
- Detects calls through **any** HTTP client imported from known npm packages (axios, ky, got, node-fetch, ofetch, undici, superagent, etc.)
- **URL heuristic**: catches `customClient.get('/api/users')` regardless of the receiver name
- Built-in globals: `fetch()`, `$fetch()`
- Creates `ExternalAPI` nodes + `CALLS_EXTERNAL` edges

### Database Operations (dynamic, import-aware)
- **Prisma**: `prisma.user.findMany()` → detects table + read/write operation
- **Supabase**: `supabase.from('users').select()` / `.insert().select()` → detects table + correct write operation from chained calls
- **Knex/query-builders**: `knex('users').select()` → detects table from function call
- **TypeORM**: `dataSource.getRepository(User).find()` / `repo.update(...)` / `dataSource.manager.insert(User, ...)`
- **SQL + EF + Django/Alembic migrations**: `.sql`, C# EF, and Python migration files parsed into schema graph (`DBTable` + `DBColumn`)
- Receiver names resolved from **imports** (`@prisma/client`, `@supabase/supabase-js`, `knex`, etc.), not hardcoded
- Creates `DBTable` + `DBColumn` nodes, `CONTAINS`, `READS_FROM`, and `WRITES_TO` edges

### Redis Operations (dynamic, import-aware)
- Detects calls through **any** Redis client imported from known npm packages (`redis`, `ioredis`, `@redis/client`, `@upstash/redis`)
- Resolves `const client = new Redis()` patterns to track instance variables
- Classifies commands: reads (get, hget, lrange, etc.), writes (set, hset, lpush, etc.), deletes (del, hdel, etc.)
- Creates `DBTable` nodes (schema=redis) + `READS_FROM`/`WRITES_TO` edges

### Job Queues (dynamic, import-aware)
- **Bull/BullMQ**: `queue.add('job', data)` → producer, `new Worker('queue', handler)` → consumer
- **Bee-Queue/Agenda/pg-boss**: similar producer/consumer detection
- Creates `QueueJob` nodes + `PRODUCES_JOB`/`CONSUMES_JOB` edges

### Prometheus Metrics (dynamic, import-aware)
- Detects `prom-client` and `@opentelemetry/api` metric definitions (`new Counter/Gauge/Histogram/Summary()`)
- Tracks metric usage: `.inc()`, `.dec()`, `.set()`, `.observe()`, `.startTimer()` (including chained `.labels().inc()`)
- Creates `Metric` nodes + `USES_METRIC` edges

### Socket.io Enhanced
- Room detection: `socket.to('room').emit('event')`, `socket.join('room')`, `socket.leave('room')`
- Namespace detection: `io.of('/namespace').emit('event')`
- `namespace` and `room` fields on `Event` nodes

### Swagger/OpenAPI (decorators + setup detection)
- Detects `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()` decorators on routes
- Enriches `Route` nodes with `apiTags`, `apiSummary`, `apiDescription`, `apiResponseStatus`
- Detects `SwaggerModule.setup()` (NestJS), `swagger-ui-express`, `@fastify/swagger`, `swagger-jsdoc`
- Enriches routes in files with Swagger setup as `swagger-documented`

### OpenTelemetry Tracing (dynamic, import-aware)
- Detects `@opentelemetry/api`, `dd-trace`, `@sentry/node` tracing calls
- Tracks `tracer.startSpan('name')`, `tracer.startActiveSpan('name')`, `Sentry.startTransaction()`
- Resolves tracer variables: `const tracer = trace.getTracer('service')`
- Creates `Span` nodes + `STARTS_SPAN` edges

### Message Brokers (dynamic, import-aware)
- **KafkaJS**: `producer.send({ topic })` → producer, `consumer.subscribe({ topic })` → consumer
- **amqplib/RabbitMQ**: `channel.sendToQueue()`, `channel.publish()`, `channel.consume()`
- **NATS**: `nc.publish(subject)`, `nc.subscribe(subject)`
- **AWS SQS/SNS**: `SendMessageCommand`, `PublishCommand`, `ReceiveMessageCommand`
- **Google PubSub**: `topic.publish()`, `subscription.on('message')`
- Two-pass variable resolution for `new Kafka()` → `kafka.producer()` chains
- Creates `Topic` nodes + `PRODUCES_MESSAGE`/`CONSUMES_MESSAGE` edges

### Prometheus/Grafana Infra Config
- Parses `prometheus.yml` scrape configs (job names, metrics paths, targets)
- Parses alert rules (`.rules.yml`): alert names, PromQL expressions, severity
- Parses Grafana dashboards (`.json`): panel titles, PromQL targets, datasources
- Extracts metric names from PromQL and creates `Metric` node stubs

### Codebase Health
- **Dead code detection** — functions never called (excludes constructors, class methods, React components, barrel exports)
- **God object detection** — functions with excessive cross-file coupling (configurable threshold)
- **God file detection** — files with too many functions, with accurate line counts (configurable threshold)
- **Duplicate code detection** — functions with identical body hash (excludes trivial <3-line stubs)

## CLI Commands

```bash
nomik init                    # Setup config + Neo4j Docker + create project
nomik scan <path>             # Parse files under <path> and index into current/selected project
nomik watch [path]            # Live file watcher, auto-reindex
nomik status                  # Graph health & stats (project-scoped)
nomik impact <symbol>         # Impact analysis for a symbol
nomik query "<cypher>"        # Raw Cypher query
nomik recent                  # Recently changed nodes
nomik setup-cursor            # Auto-configure Cursor MCP
nomik setup-windsurf          # Auto-configure Windsurf MCP
nomik serve                   # Start MCP server + viz dashboard
nomik project list            # List all projects in Neo4j
nomik project create <name>   # Create a new project
nomik project switch <name>   # Switch to another project
nomik project delete <name>   # Delete project and all its data
nomik project info            # Show current project stats
```

## Supported Languages

| Language | Grammar | Extractors |
|---|---|---|
| **TypeScript / JavaScript** | `tree-sitter-typescript` | functions, classes, imports, exports, routes, calls, API calls, DB operations, Redis, queues, metrics, env vars, events |
| **Python** | `tree-sitter-python` | functions, classes, imports, calls |
| **Rust** | `tree-sitter-rust` | functions, structs/enums/traits, use, calls |
| **Markdown** | Custom parser (regex) | sections (h1-h6 headings) |
| **SQL** | Custom parser (regex) | schema extraction: CREATE/ALTER tables, columns |
| **C# migrations** | Custom parser (regex) | EF migration schema extraction (`migrationBuilder.CreateTable`/`AddColumn`) |
| **Python migrations** | Custom parser (regex) | Django (`CreateModel`/`AddField`) + Alembic (`op.create_table`/`op.add_column`) |

## 3D Visualization

NOMIK includes a **3D interactive graph** (Three.js) with rotating neural-network style visualization:

- **Cyan** = Files, **Green** = Functions, **Purple** = Classes/Interfaces
- **Amber lines** = CALLS (animated particles), **Blue dashed** = DEPENDS_ON
- Click any node to zoom + inspect, toggle between 3D/2D modes
- 4 layout modes: Force, Tree, Radial, Circle

```bash
# Start the dashboard
cd packages/viz && pnpm dev
# Open http://localhost:3000
```

## Architecture

```
nomik/
├── @nomik/core        — Types (Zod), config, errors, logger (Pino)
├── @nomik/parser      — Tree-sitter extraction, modular resolvers, API/DB tracking
│   ├── extractors/    — functions, classes, imports, exports, routes, calls,
│   │                    api-calls, db-operations, redis, queue, metrics, events, env-vars
│   ├── resolvers/     — cross-file, intra-file, route-handling
│   └── config/        — tsconfig/path alias resolution
├── @nomik/graph       — Neo4j driver, read/write queries, cache (TTL 30s), retry
├── @nomik/watcher     — Chokidar file watcher, incremental reindex
├── @nomik/mcp-server  — MCP protocol server (stdio), 9 AI tools
├── @nomik/viz         — React + 3d-force-graph + Cytoscape.js dashboard
└── @nomik-ai/cli      — Commander CLI, 11 commands, standalone bundle
```

## Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript (ESM, strict) |
| Parsed Languages | TypeScript, JavaScript, Python, Rust, Markdown, SQL, C# migrations |
| Graph DB | Neo4j 5 Community + APOC |
| Parser | Tree-sitter (multi-lang grammars) |
| AI Protocol | MCP (Model Context Protocol) |
| IDE Support | Cursor, Windsurf (auto-configured via CLI) |
| Monorepo | Turborepo + pnpm workspaces |
| 3D Viz | Three.js (3d-force-graph) |
| 2D Viz | Cytoscape.js |
| Tests | Vitest — 209 tests across 18 test files |
| Project Isolation | `projectId` on all nodes/edges, `.nomik/project.json` |
| JSONC Parsing | `jsonc-parser` (VS Code's parser) for tsconfig/jsconfig |

## Graph Schema (summary)

### Node Types
`File`, `Function`, `Class`, `Variable`, `Module`, `Route`, `ExternalAPI`, `DBTable`, `DBColumn`, `CronJob`, `Event`, `EnvVar`

### Edge Types
`CONTAINS`, `CALLS`, `DEPENDS_ON`, `EXTENDS`, `IMPLEMENTS`, `HANDLES`, `IMPORTS`, `CALLS_EXTERNAL`, `READS_FROM`, `WRITES_TO`, `TRIGGERS`, `EMITS`, `LISTENS_TO`, `USES_ENV`

See [Graph Schema](documentations/docs/07-GRAPH-SCHEMA.md) for full details and Cypher examples.

## Development (contributors)

```bash
# Clone & setup
git clone https://github.com/willFreed1/NOMIK.git
cd NOMIK
pnpm install
docker compose up -d
pnpm build

# Run all tests (209 tests, 18 files)
pnpm test

# Dev mode
pnpm nomik scan .
pnpm nomik watch .
```

## Documentation

| Doc | Description |
|---|---|
| [Vision & Roadmap](documentations/docs/01-VISION.md) | Problem statement, full-stack intelligence roadmap |
| [Technology Stack](documentations/docs/02-TECHNOLOGY-STACK.md) | Why TypeScript, supported languages |
| [Architecture](documentations/docs/03-ARCHITECTURE.md) | System diagram, module boundaries, monorepo structure |
| [Running Guide](documentations/docs/04-RUNNING_GUIDE.md) | Step-by-step local setup |
| [MCP Integration](documentations/docs/05-MCP-INTEGRATION.md) | Cursor/Windsurf connection |
| [Graph Schema](documentations/docs/07-GRAPH-SCHEMA.md) | Node/edge types, Cypher examples |
| [MVP Roadmap](documentations/docs/08-MVP-ROADMAP.md) | Phase milestones, completed features |
| [Progress Tracker](documentations/docs/10-PROGRESS-TRACKER.md) | Living progress (~99%), changelog |
| [CLI & Tools Reference](documentations/docs/11-CLI-TOOLS-REFERENCE.md) | All commands, MCP tools, Cypher queries |

## License

MIT
