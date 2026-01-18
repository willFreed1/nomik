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

NOMIK already tracks **code → code** relationships across TypeScript, JavaScript, Python, Rust, Markdown, SQL, and C# migrations. The knowledge graph includes functions, classes, interfaces, imports, call chains, file dependencies, **external API calls**, **database operations**, and **content hashing** (bodyHash for duplicate detection). Health detection: dead code, god objects, god files, duplicate code. **144 tests passing (14 test files)**, modular parser architecture (481 lines, down from 1369).

### Phase 1 — Database Tracking (Q1 2026) — Complete

**Goal**: Complete full-stack visibility: `UI → API → Function → DB Table → Column`.

The #1 question every engineering team asks: *"What breaks if I change this database column?"* Without DB tracking, NOMIK can't answer it.

| Feature | Detail | Status |
|---|---|---|
| ORM detection (dynamic, import-aware) | Prisma, Supabase, Knex, TypeORM — receiver resolved from imports | **Done** |
| `DBTable` nodes + `READS_FROM`/`WRITES_TO` edges | Created per file, linked to caller functions | **Done** |
| External API detection (dynamic, import-aware) | axios, ky, got, fetch + URL heuristic | **Done** |
| `ExternalAPI` nodes + `CALLS_EXTERNAL` edges | Created per file, linked to caller functions | **Done** |
| SQL migration parser | Parse `.sql` files + C# Entity Framework migration schemas (DB schema only, not full C# language) | **Done** |
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