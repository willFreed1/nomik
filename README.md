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
| `nm_health` | Full stats for all 17 node types + health checks | "Any dead code, god objects, or god files?" |
| `nm_path` | Shortest path between symbols | "How does `scanCommand` connect to `neo4j`?" |
| `nm_changes` | Recently modified nodes | "What changed in the last hour?" |
| `nm_trace` | Full dependency chain | "Show me the path from A to B" |
| `nm_explain` | Explain a symbol in detail | "Explain the `createGraphService` function" |
| `nm_onboard` | Full codebase briefing (incl. infrastructure) | "Give me an overview of this project" |
| `nm_wiki` | Generate structured documentation | "Generate docs for this codebase" |
| `nm_communities` | Detect functional clusters | "What are the main code communities?" |
| `nm_flows` | Trace execution flows | "Show me the request lifecycle for auth" |
| `nm_projects` | List all tracked projects | "What projects does NOMIK know about?" |
| `nm_guard` | Quality gate check (dead code, god files, dupes) | "Does the codebase pass quality checks?" |
| `nm_rename` | Graph-aware rename impact analysis | "What files change if I rename `createWatcher`?" |
| `nm_diff` | Architecture drift between two scans | "What changed between these two commits?" |
| `nm_service_links` | Cross-service dependencies | "How do our microservices communicate?" |
| `nm_test_impact` | Find affected test files after a change | "Which tests should I run after changing parseFile?" |
| `nm_audit` | Dependency vulnerability check + blast radius | "Are there any vulnerable packages?" |
| `nm_rules` | Architecture rules engine (9 configurable rules) | "Does the codebase follow our quality policies?" |

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

### gRPC / tRPC / GraphQL (dynamic, import-aware)
- **tRPC**: `t.procedure.query()`, `t.procedure.mutation()`, `t.procedure.subscription()` — procedure name from parent property key
- **gRPC**: `server.addService()`, `@GrpcMethod()`, `@GrpcStreamMethod()` decorators
- **GraphQL**: `@Query()`, `@Mutation()`, `@Subscription()`, `@Resolver()` decorators (type-graphql, @nestjs/graphql)
- Creates `Route` nodes (method=GET/POST/WS/RPC) with `apiTags: [framework]`

### WebSocket Tracking (dynamic, import-aware)
- **ws**: `new WebSocketServer()`, `wss.on('connection')`, `ws.on('message')`, `ws.send()`
- **@nestjs/websockets**: `@WebSocketGateway()`, `@SubscribeMessage('event')`
- **uWebSockets.js**: `app.ws('/path', { ... })`
- Variable resolution: `const wss = new WebSocketServer()` → `wss.on()`
- Creates `Event` nodes (namespace='websocket') + `EMITS`/`LISTENS_TO` edges

### Docker / Kubernetes Config Parsing
- **Dockerfile**: `FROM`, `EXPOSE`, `ENTRYPOINT`, `CMD`, multi-stage build detection
- **docker-compose.yml**: services, images, ports, `depends_on`, environment variables
- **Kubernetes manifests**: Deployment, Service, Ingress, ConfigMap — labels, container images, ports

### CI/CD Pipeline Detection
- **GitHub Actions**: jobs, steps, `uses` actions, `runs-on`, trigger events (`push`, `pull_request`)
- **GitLab CI**: stages, jobs, scripts, stage assignment

### OpenAPI Spec File Parsing
- Parses `openapi.json` / `swagger.json` (JSON) and `openapi.yaml` / `swagger.yaml` (YAML)
- Extracts all `paths` with HTTP methods, `operationId`, `summary`, `tags`, `responses`
- Creates `Route` nodes from spec definitions

### Feature Flag Tracking (dynamic, import-aware)
- **LaunchDarkly**: `ldClient.variation()`, `boolVariation()`, `stringVariation()`
- **Unleash**: `client.isEnabled()`, `isFeatureEnabled()`
- **Flagsmith**: `flagsmith.hasFeature()`, `flagsmith.getValue()`
- **Split.io**: `client.getTreatment()`
- **GrowthBook**: `growthbook.isOn()`, `growthbook.getFeatureValue()`
- **Custom**: `process.env.FEATURE_*`, `process.env.FF_*`, `process.env.FLAG_*`
- Variable resolution for `const ldClient = init('key')` chains
- Creates `EnvVar` nodes + `USES_ENV` edges

### GraphQL Schema File Parsing
- Parses `.graphql` / `.gql` schema files directly
- Extracts `type`, `input`, `interface`, `enum`, `union`, `scalar` definitions
- `Query`/`Mutation`/`Subscription` fields → Route nodes with `apiTags: ['graphql']`
- Type definitions → Class nodes for graph visibility

### Terraform / IaC Config Parsing
- Parses `.tf` files (HCL-like regex parsing)
- `resource` blocks: type, name, provider, key attributes
- `variable` blocks: name, type, default, description
- `module` blocks: name, source
- `data` blocks: data source extraction
- Creates Class nodes (resources), EnvVar nodes (variables), Module nodes (modules)

### Dependency Tracking
- **package.json**: dependencies, devDependencies, peerDependencies, optionalDependencies
- **requirements.txt**: Python packages with version constraints
- Creates Module nodes + DEPENDS_ON edges

### Secret / Credential Detection
- **AWS**: access keys (`AKIA...`), secret keys in variable assignments
- **GitHub**: personal access tokens (`ghp_`, `gho_`, `ghs_`, `ghr_`, `github_pat_`)
- **Stripe**: live secret keys (`sk_live_`, `rk_live_`)
- **Slack**: API tokens (`xoxb-`, `xoxp-`)
- **SendGrid**, **Twilio**: API key patterns
- **JWT**: hardcoded tokens (`eyJ...`)
- **Private keys**: RSA/EC/OPENSSH embedded in source
- **Basic auth in URLs**: `https://user:pass@host`
- **Generic**: `api_key`, `secret_key`, `password` variable assignments
- Creates `SecurityIssue` nodes + `HAS_SECURITY_ISSUE` edges
- Skips comments, test/mock files, placeholder values

### .env Config File Parsing
- Parses `.env`, `.env.local`, `.env.production`, `.env.development`
- Extracts variable definitions with values, detects empty vars
- Creates `EnvVar` nodes + `CONTAINS` edges linking definitions to usage

### Cron Job Detection (dynamic, import-aware)
- **node-cron**: `cron.schedule('*/5 * * * *', handler)`
- **node-schedule**: `schedule.scheduleJob('expr', handler)`
- **@nestjs/schedule**: `@Cron('45 * * * * *')` decorator
- **cron (npm)**: `new CronJob('expr', handler)`
- Creates `CronJob` nodes + `SCHEDULES` edges

### CloudFormation / SAM Template Parsing
- Parses CloudFormation YAML templates
- `Resources`: logical ID, Type, provider extraction
- `Parameters`: name, type, default, description
- `Outputs`: name, export name
- Creates Class nodes (resources), EnvVar nodes (parameters)

### Test Coverage Correlation
- Detects test files (`.test.ts`, `.spec.ts`, `__tests__/`)
- Extracts tested modules, mocked modules, describe blocks, test counts
- `jest.mock()` / `vi.mock()` target detection
- Creates `DEPENDS_ON` edges with `kind: 'test'`

### Python Runtime Tracking
- **Redis**: `redis.get/set/hget/lpush` operations → `DBTable` nodes
- **Celery**: `@shared_task`/`@app.task` definitions, `.delay()`/`.apply_async()` calls → `QueueJob` nodes
- **Prometheus**: `Counter/Gauge/Histogram/Summary` definitions → `Metric` nodes
- **OpenTelemetry**: `tracer.start_span()`/`start_as_current_span()` → `Span` nodes
- **Message brokers**: Kafka (`confluent_kafka`), RabbitMQ (`pika`), NATS → `Topic` nodes

### Codebase Health
- **Dead code detection** — functions never called (excludes constructors, class methods, React components, barrel exports)
- **God object detection** — functions with excessive cross-file coupling (configurable threshold)
- **God file detection** — files with too many functions, with accurate line counts (configurable threshold)
- **Duplicate code detection** — functions with identical body hash (excludes trivial <3-line stubs)

### Symbol Explanation (`nomik explain`)
- `nomik explain <symbol>` — full context report: type, file, lines, exported status
- Shows incoming edges (callers) grouped by edge type
- Shows outgoing edges (callees) grouped by edge type
- Summary: caller count, callee count, total edges
- `--json` flag for machine-readable output
- Also available as `nm_explain` MCP tool

### Cross-Service Correlation (`nomik service-links`)
- `nomik service-links` — discovers producer↔consumer pairs sharing topics/queues
- Scans `PRODUCES_MESSAGE`/`CONSUMES_MESSAGE` (Kafka, RabbitMQ, NATS, SQS, SNS)
- Scans `PRODUCES_JOB`/`CONSUMES_JOB` (Bull, BullMQ, Bee-Queue, Celery)
- Shows which functions/files produce and which consume each topic
- `--json` flag for machine-readable output

### Codebase Briefing (`nomik onboard`)
- `nomik onboard` — one-command architecture overview
- Shows functions/files/classes/routes counts, language distribution
- Lists DB tables (with reader/writer counts), external APIs, env vars
- Highlights high-risk functions (most callers)
- Health summary: dead code, god files, duplicates, security issues
- `--json` flag for machine-readable output

### Community Detection (`nomik communities`)
- `nomik communities` — detect functional clusters by CALLS edge density
- Union-Find algorithm: groups by directory affinity + cross-file call density (threshold: 3+ calls)
- Shows cohesion score (internal vs external edges), member count, top functions
- `--min-size <n>` to filter small clusters, `--json` flag

### Execution Flow Tracing (`nomik flows`)
- `nomik flows` — trace execution paths from entry points through the call graph
- Entry points: route handlers (HANDLES), event listeners (LISTENS_TO), queue consumers (CONSUMES_JOB)
- Terminators: DB operations (READS_FROM/WRITES_TO), external API calls (CALLS_API)
- Shows call chain depth, per-step file location, terminal operations
- `--depth <n>`, `--limit <n>`, `--json` flags

### Architecture Drift (`nomik diff`)
- `nomik diff <from-sha> <to-sha>` — compare two scan snapshots
- Shows new/removed/modified files, new/removed functions, new call edges
- Summary: file/function/edge deltas
- `--json` flag

### Quality Gate (`nomik guard`)
- `nomik guard` — CI/pre-commit quality gate with configurable thresholds
- Checks: dead code, god files, duplicates — exits 1 if thresholds exceeded
- `--dead-code <n>`, `--god-files <n>`, `--duplicates <n>` to set limits
- `--install-hook` installs as git pre-commit hook automatically
- `--ci` mode for CI pipelines (exit code only), `--json` for structured output

### Graph-Aware Rename (`nomik rename`)
- `nomik rename <old> <new>` — find all references to a symbol using the knowledge graph
- Shows definition location, callers, imports, exports across all files
- `--apply` to perform word-boundary-aware rename in source files
- Dry-run by default — safe to explore before applying

### Incremental Scan (`nomik scan:incremental`)
- `nomik scan:incremental <path>` — only re-parse files changed since last scan
- Uses `git diff` between last scan SHA and current HEAD
- Auto-detects last scan SHA from ScanMeta nodes in the graph
- Purges deleted files from graph, stores incremental scan metadata
- `--since <sha>` to override base SHA, `--project <name>`

### Real-time Watch Warnings
- `nomik watch` now emits real-time impact warnings after each file re-index
- Shows caller count for changed functions (⚠️ HIGH IMPACT for ≥10 callers)
- Detects DB table impact (READS_FROM/WRITES_TO) on changed functions
- Non-blocking — warnings don't interrupt the re-index pipeline

### MCP Prompts (6 pre-built conversation starters)
- `nomik-onboard` — full architecture briefing from the knowledge graph
- `nomik-review-change` — impact analysis before refactoring a symbol
- `nomik-health-check` — full health report with prioritized fixes
- `nomik-explain-module` — deep-dive into a specific file or module
- `nomik-migration-plan` — plan a safe migration with all affected files
- `nomik-infrastructure` — audit all infrastructure tracked in the codebase

### MCP Resources (9 browsable endpoints)
- `nomik://stats` — full stats for ALL 17 node types (files, functions, classes, routes, DB tables, columns, APIs, cron jobs, events, env vars, queues, metrics, spans, topics, security issues, variables, modules)
- `nomik://health` — dead code, god files, duplicates, security issues, edge type distribution + full node counts
- `nomik://files` — all tracked files with language, function count, line count
- `nomik://communities` — functional clusters by call-graph density
- `nomik://onboard` — full codebase briefing (incl. queues, metrics, spans, topics, crons, events)
- `nomik://schema` — all node labels and relationship types with counts
- `nomik://projects` — all tracked projects
- `nomik://infrastructure` — all infrastructure nodes: queues, metrics, spans, topics, crons, events, APIs, env vars
- `nomik://guard` — quality gate status with pass/fail thresholds

### GitHub App / PR Bot (`@nomik/github-bot`)
- New `@nomik/github-bot` package — webhook handler for GitHub pull_request events
- `analyzePR()` — queries graph for affected functions, blast radius, DB tables
- `formatPRComment()` — generates markdown comment with risk level, function table, recommendations
- `fetchPRFiles()` / `postPRComment()` — GitHub API helpers with comment deduplication
- Ready to deploy as Vercel/Lambda serverless function

### Antigravity MCP Setup (`nomik setup-antigravity`)
- `nomik setup-antigravity` — auto-configure Antigravity Editor's `mcp_config.json`
- Writes NOMIK MCP server config to the editor's config directory
- Cross-platform path resolution (Windows, macOS, Linux)
- `--config-path <path>` to override target config file
- Supports all 21 MCP tools out of the box (search, impact, context, health, wiki, flows, guard, rename, diff, rules, test-impact, audit, etc.)

### Claude Desktop MCP Setup (`nomik setup-claude`)
- `nomik setup-claude` — auto-configure Claude Desktop's `claude_desktop_config.json`
- Config path: `%APPDATA%\Claude\` (Windows), `~/Library/Application Support/Claude/` (macOS)
- Same format as Cursor/Windsurf — uses `mcpServers` key
- All 21 MCP tools + 9 resources + 6 prompts available after restart

### Health Badges (`nomik badge`)
- `nomik badge` — generate shields.io badges for README
- Badges: dead_code, god_files, duplicates, functions, files
- Color-coded: green (0), yellow (low), orange/red (high)
- `--json` flag for badge data

### Wiki Generation (`nomik wiki`)
- `nomik wiki` — generates markdown documentation from the knowledge graph
- `index.md`: overview stats + file listing (language, functions, lines)
- `functions.md`: top 100 functions by caller count with export status
- `health.md`: dead code, god files, duplicate functions report
- `service-links.md`: cross-service producer↔consumer connections
- `--out <dir>` to set output directory (default `./wiki`)
- `--json` flag for raw data output

## CLI Commands

```bash
nomik init                    # Setup config + Neo4j Docker + create project
nomik scan <path>             # Parse files under <path> and index into current/selected project
nomik watch [path]            # Live file watcher, auto-reindex
nomik status                  # Graph health & stats (project-scoped)
nomik impact <symbol>         # Impact analysis for a symbol
nomik query "<cypher>"        # Raw Cypher query
nomik recent                  # Recently changed nodes
nomik explain <symbol>        # Full context report for a function/class
nomik service-links           # Cross-service producer↔consumer mapping
nomik onboard                 # Codebase architecture briefing
nomik wiki                    # Generate markdown documentation from graph
nomik communities             # Detect functional code clusters
nomik flows                   # Trace execution paths from entry points
nomik diff <sha1> <sha2>      # Architecture drift between scans
nomik badge                   # Generate shields.io health badges
nomik setup-cursor            # Auto-configure Cursor MCP
nomik setup-windsurf          # Auto-configure Windsurf MCP
nomik setup-antigravity       # Auto-configure Antigravity MCP
nomik setup-claude            # Auto-configure Claude Desktop MCP
nomik guard                   # Quality gate (CI/pre-commit)
nomik rename <old> <new>      # Graph-aware symbol rename
nomik scan:incremental <path> # Incremental scan (git diff-based)
nomik rules                   # Architecture rules engine (9 rules)
nomik test-impact <symbol>    # Find affected tests after a change
nomik audit                   # Dependency vulnerability check + blast radius
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
