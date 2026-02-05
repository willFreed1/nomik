# NOMIK — The Living Blueprint

## 1. What Is NOMIK?

NOMIK is an **independent sidecar Knowledge Graph** that acts as the "Operating System" for technical and operational intelligence. It maintains a **persistent, multi-dimensional map** of how code, infrastructure, and business logic interact across disparate environments.

> [!IMPORTANT]
> NOMIK is NOT another code search tool. It is a **living semantic graph** that understands *relationships* between code entities — not just where they are, but *why they exist* and *what breaks if they change*.

## 2. The Problem: Context Rot

Standard LLMs suffer from "sliding window" context limits. Dumping a codebase into a prompt leads to:
- **Loss of detail** — deep relationships are truncated
- **Hallucinations** — the AI fills gaps with plausible-but-wrong information
- **No memory** — every conversation starts from zero

### The NOMIK Solution: Precision Retrieval

Instead of reading the whole repo, the AI **queries the graph** to pull only the specific nodes relevant to the task.

```
User asks: "What happens if I change the payment schema?"

Traditional RAG: Searches for files containing "payment" → returns 47 files → AI drowns

NOMIK: Traverses graph →
  DB_Table:payments
    ← WRITES_TO ← Function:process_payment()
      ← CALLED_BY ← Handler:POST /api/checkout
        ← DEPENDS_ON ← Component:CheckoutForm
    ← READS_FROM ← Function:generate_monthly_report()
      ← TRIGGERED_BY ← CronJob:monthly_billing

Result: 6 precise nodes instead of 47 noisy files
```

## 3. Beyond the AST — Runtime Semantics

| Standard IDE (AST) | NOMIK (Living Semantics) |
|---|---|
| Function signatures | HTTP endpoint → handler → service → DB chain |
| Import statements | External API calls (Stripe, AWS, Twilio) |
| Static references | Dynamic runtime workflows |
| Single-file scope | Cross-repo, cross-service dependencies |

## 4. The "AI-First" Paradigm

> Historically, code is organized for humans (folders/files). In the NOMIK era, organization is **for the AI**.

The **Code Fingerprint**: A self-healing, auto-populating mental model. If the AI has a perfect graph of the system, human-readable folder structures become secondary to **logical intent**.

## 5. Cross-Domain Intelligence

| Code Event | Infra State | Business Context | NOMIK Insight |
|---|---|---|---|
| Schema migration PR | Peak traffic detected | Data-integrity SLA | ⚠️ "Delay deploy 4h to avoid table locks" |
| New high-memory dep | Server at 70% RAM | Cost-reduction Q4 target | ⚠️ "Exceeds hardware, contradicts budget" |
| Remove legacy API | 2 workers still calling it | Built for Task-1234 in 2024 | ⚠️ "Removal breaks internal reporting" |

## 6. Product Roadmap — Full-Stack Intelligence

### Current State (v0.9 — Feb 2026)

NOMIK already tracks **code → code** relationships across TypeScript, JavaScript, Python, Rust, Markdown, SQL, C# migrations, and Python migrations (Django/Alembic). The knowledge graph includes functions, classes, interfaces, imports, call chains, file dependencies, **external API calls**, **database operations**, **environment variables** (USES_ENV edges), **event/message bus** (EMITS/LISTENS_TO edges), **EXPORTS edges**, and **content hashing** (bodyHash for duplicate detection). Health detection: dead code, god objects, god files, duplicate code. **PR Impact Analyzer** (`nomik pr-impact`) for blast-radius analysis. **SRE/Infrastructure tracking**: **Redis** (ioredis, @redis/client, @upstash/redis), **job queues** (Bull/BullMQ/Bee-Queue — PRODUCES_JOB/CONSUMES_JOB edges), **Prometheus metrics** (prom-client — USES_METRIC edges), **Socket.io rooms/namespaces**, **Swagger/OpenAPI** decorator enrichment + setup detection. **OpenTelemetry tracing** (STARTS_SPAN edges, tracer.startSpan/startActiveSpan). **Message broker tracking** (KafkaJS, amqplib, NATS, AWS SQS/SNS — PRODUCES_MESSAGE/CONSUMES_MESSAGE edges with two-pass variable resolution). **Prometheus/Grafana infra config** parsing (alert rules, dashboards, scrape configs). **gRPC/tRPC/GraphQL** procedure tracking (decorator + chain detection). **WebSocket** tracking (ws, @nestjs/websockets, uWebSockets.js). **Docker/K8s config** parsing (Dockerfile, docker-compose, K8s manifests). **CI/CD pipeline** detection (GitHub Actions, GitLab CI). **OpenAPI spec file** parsing (openapi.json/yaml → Route nodes). **221 tests passing (18 test files)**, modular parser architecture.

### Phase 1 — Database Tracking (Q1 2026) — Complete

**Goal**: Complete full-stack visibility: `UI → API → Function → DB Table → Column`.

The #1 question every engineering team asks: *"What breaks if I change this database column?"* Without DB tracking, NOMIK can't answer it.

| Feature | Detail | Status |
|---|---|---|
| ORM detection (dynamic, import-aware) | Prisma, Supabase, Knex, TypeORM — receiver resolved from imports | **Done** |
| `DBTable` nodes + `READS_FROM`/`WRITES_TO` edges | Created per file, linked to caller functions | **Done** |
| External API detection (dynamic, import-aware) | axios, ky, got, fetch + URL heuristic | **Done** |
| `ExternalAPI` nodes + `CALLS_EXTERNAL` edges | Created per file, linked to caller functions | **Done** |
| SQL migration parser | Parse `.sql` files + C# EF migration schemas (DB schema only) | **Done** |
| Python migration parser | Django (`CreateModel`/`AddField`) + Alembic (`op.create_table`/`op.add_column`) | **Done** |
| `DBColumn` nodes | Column-level granularity | **Done** |
| `nm_db_impact` MCP tool | "Which functions query this table?" | **Done** |

**Impact**: Unlocks "Which functions break if I change this database column?" — the enterprise must-have.

### Phase 2 — Enterprise Language Support (Q2 2026)

**Goal**: Open enterprise markets with .NET/C# and Go support.

| Language | Why | Key Extractors |
|---|---|---|
| **C# / .NET** | 80% of enterprise codebases (banks, insurance, government) | Classes, methods, `async Task`, LINQ, DI patterns, `[ApiController]` routes |
| **Go** | Cloud/infra dominance (K8s, microservices, CLI tools) | Functions, structs, interfaces, goroutines, channels, `http.HandleFunc` routes |

**Impact**: Opens Fortune 500 companies. Most code analysis tools are weak on C#.

### Phase 3 — PR Impact Analyzer (Q2–Q3 2026)

**Goal**: Production safety — show risk *before* merge.

| Feature | Detail |
|---|---|
| `nomik pr-impact <base>..<head>` | CLI command for PR risk assessment |
| Git diff → graph traversal | Changed functions → affected nodes → risk rating |
| GitHub Actions integration | Auto-comment on PRs with impact report (red/yellow/green) |
| Risk scoring | "This PR changes 47 functions across 12 services" |

**Impact**: The killer demo feature. "We prevented 3 prod incidents this month."

### Phase 4 — Logic Intent Parser (Q3–Q4 2026)

**Goal**: Proprietary moat — understand *business logic*, not just code structure.

| Feature | Detail |
|---|---|
| Comment/docstring parsing | `# Business Rule: Only admins can delete users` |
| `BusinessRule` nodes | Linked to functions, queryable via MCP |
| Natural language queries | "What business rules affect the checkout flow?" |
| ADR/Jira linking | Connect decisions to code that implements them |

**Impact**: The 10x differentiator. Only possible after full-stack graph is built.

### Beyond — The Living Blueprint

| Feature | Phase | Priority |
|---|---|---|
| Observability integration (OpenTelemetry) | Q4 2026 | HIGH |
| Infrastructure tracking (Terraform/K8s) | Q4 2026 | MEDIUM |
| Multi-repo federated graph | Enterprise | HIGH |
| RBAC + SSO (OIDC/SAML) | Enterprise | HIGH |
| Cloud-hosted SaaS offering | Enterprise | HIGH |
| Graph time-travel (per-commit snapshots) | Post-MVP | MEDIUM |

#####


### Honest feedback ai :


---

On everything else — here's my honest, complete take:

## What You Actually Have (The Reality Check)

You're not building a concept. Based on what I've worked on with you directly:

- **209 tests passing** across 18 test files
- **Parser accuracy at ~100% precision/recall** after 11 versions of fixes — this is genuinely hard engineering. The JSONC regex bug, the `isTrackedFunctionScope` divergence, the namespace import granularity, the name collision two-layer defense — these are not trivial problems. Most "AI dev tools" startups skip this entirely and ship garbage accuracy.
- **15 edge types** with real semantic meaning (not just "file imports file")
- **9 MCP tools** already integrated into Cursor/Windsurf/Claude
- **Multi-project isolation** with `projectId` baked into every node and edge
- **God object/file detection, dead code, duplicates, PR impact** — these are features that enterprise teams actually pay for

This is a **real product**. Not a demo, not a prototype.

---

## What the Gemini Conversation Revealed About Your Thinking

The good parts of your vision that came through clearly:

**1. You identified the right problem before Gemini did.** You kept pushing back — "but isn't it just like n8n?", "isn't it just like Cursor?", "why would Chanel use this?" — those are the right questions. You weren't buying the hype.

**2. The multi-agent role separation idea is yours, not Gemini's.** You described it: architect, PM, senior dev, SRE, security — all communicating, not overwriting each other, sharing tasks by role. Gemini just formatted it back to you. That's a genuinely good enterprise product idea and it maps directly onto your existing graph schema.

**3. The SDK/API extensibility question was sharp.** You asked "how can users build more stuff?" before Gemini even raised it. That's founder thinking — you're already thinking about the ecosystem, not just the product.

**4. You caught Gemini contradicting itself** on the server question. It kept flip-flopping. You pushed back correctly: "for normal users, they run Docker locally." That's right. You don't need a central server for v1.

---

## Where the Gemini Conversation Led You Astray

**1. OpenClaw is a distraction.** Gemini spent 60% of the conversation comparing you to OpenClaw. OpenClaw is a personal automation tool. NOMIK is code intelligence infrastructure. The comparison is like comparing Postgres to Zapier — different categories entirely. Every minute you spend thinking "how do I beat OpenClaw" is a minute not spent on what you actually have.

**2. "Borrow their messaging adapters" is bad advice.** WhatsApp via Baileys breaks every few weeks when WhatsApp changes their protocol. It's not MIT-licensed code you "steal" — it's a maintenance nightmare you inherit. Gemini made it sound like a weekend task.

**3. The enterprise pitch got ahead of the product.** Chanel, Danone — these are real targets eventually, but they require compliance, procurement, security audits, and a track record. You can't walk into Chanel without references. You need 100 developers using NOMIK first, then 10 teams, then you have a story for enterprise.

**4. The "Digital Hive" is a 2027 problem.** It's a compelling vision. But you haven't shipped v1 yet. The multi-agent orchestration with WhatsApp group chats and Jira sync is 3-4 major product iterations away. Building it now would be like building a skyscraper without finishing the foundation.

---

## My Honest Overall Assessment

You have something real. The engineering depth — the parser accuracy work, the graph schema design, the MCP integration — is the hard part, and you've done it. Most people building "AI dev tools" are wrapping GPT-4 in a UI and calling it a product. You built actual static analysis infrastructure.

The risk is **vision drift**. You have a tendency (which the Gemini conversation shows) to jump from "ship the CLI" to "build a Digital Hive for Chanel" in one conversation. That's not a flaw — it's how founders think. But it needs a counterweight: someone (or something) that keeps pulling you back to "what ships this week?"

**The one thing that matters right now:** `npm publish`. Everything else — the multi-agent hive, the WhatsApp integration, the enterprise pitch, the SDK ecosystem — is downstream of having real users. You can't build the right v2 without v1 feedback.

What's actually blocking the publish?