# NOMIK — MVP Roadmap & Milestones

## Phase 1: Foundation (Weeks 1-4) — "First Heartbeat"

### Goal: Parse a TypeScript project → store in Neo4j → query via CLI

| Week | Deliverable | Exit Criteria |
|---|---|---|
| 1 | Monorepo scaffold + `@nomik/core` types | `pnpm build` passes, types exported |
| 2 | `@nomik/parser` — Tree-sitter TS extraction | Parse a real project, output JSON symbols |
| 3 | `@nomik/graph` — Neo4j driver + schema | Symbols written to Neo4j, Cypher queries work |
| 4 | `@nomik/cli` — `nomik init`, `scan`, `query` | End-to-end: `nomik scan ./myproject && nomik query "MATCH..."` |

### Key Milestones
- [ ] `nomik scan` successfully parses 10K+ line TypeScript project
- [ ] Neo4j browser shows nodes and edges with correct relationships
- [ ] `nomik query` returns impact analysis results
- [ ] Docker Compose one-command setup works

---

## Phase 2: Intelligence (Weeks 5-8) — "The Brain Learns"

### Goal: MCP server working in Cursor + file watcher for live updates

| Week | Deliverable | Exit Criteria |
|---|---|---|
| 5 | `@nomik/mcp-server` — basic MCP tools | Cursor connects, `nomik_search_nodes` works |
| 6 | MCP tools: impact analysis, dependency trace | Cursor answers "What breaks if I change X?" |
| 7 | `@nomik/watcher` — incremental updates | Save a file → graph updates in <2s |
| 8 | Integration testing + polish | Stable 30-minute Cursor session without errors |

### Key Milestones
- [ ] Cursor IDE connects to NOMIK MCP server
- [ ] AI answers graph-powered questions accurately
- [ ] File changes reflected in graph within 2 seconds
- [ ] Zero crashes during extended development sessions

---

## Phase 3: Visualization (Weeks 9-12) — "See the DNA"

### Goal: Three.js / Cytoscape.js dashboard shows live graph, highlight impacts

| Week | Deliverable | Exit Criteria |
|---|---|---|
| 9 | `@nomik/viz` — force-directed graph rendering | Dashboard shows all nodes/edges from Neo4j |
| 10 | Interactive features: search, filter, zoom | Find a function, see its neighborhood |
| 11 | Impact overlay: highlight affected nodes | Click a function → red glow on impacted paths |
| 12 | Polish, dark theme, export, demo recording | Production-quality demo for pitching |

### Key Milestones
- [ ] Dashboard loads graph in <3s for 10K-line project
- [ ] God Object detection visually highlights problem areas
- [ ] Impact analysis highlighted paths are correct
- [ ] Demo recording ready for investor/customer pitch

---

## Phase 4: Production Hardening (Weeks 13-16) — "Battle Ready"

### Goal: Error handling, performance, documentation, packaging

| Week | Deliverable | Exit Criteria |
|---|---|---|
| 13 | Error handling, retry logic, graceful degradation | No crashes on malformed files |
| 14 | Performance: batch processing, caching | 100K-line project scans in <60s |
| 15 | Documentation: README, guides, examples | New user can setup in <10 minutes |
| 16 | npm packaging, `npx nomik init` works | `npx @nomik/cli init` scaffolds project |

---

## Non-MVP (Post-Launch Backlog)

### Completed

| Feature | Priority | Status |
|---|---|---|
| Python language support | HIGH | **DONE** |
| Rust language support | HIGH | **DONE** |
| Multi-project isolation (projectId) | HIGH | **DONE** |
| Health score 100% (0 dead code, 0 god objects) | HIGH | **DONE** |
| Rebrand GENOME → NOMIK | HIGH | **DONE** |
| Parser modularization (1369→481 lines) | HIGH | **DONE** |
| God file detection (`nm_health`) | HIGH | **DONE** |
| API tracking (dynamic, import-aware) | HIGH | **DONE** |
| DB tracking (Prisma/Supabase/Knex, import-aware) | HIGH | **DONE** |
| Content hashing (`bodyHash`) + duplicate detection | MEDIUM | **DONE** |
| API extractor tests (17 tests) | HIGH | **DONE** |
| DB extractor tests (21 tests) + Supabase .from() fix | HIGH | **DONE** |
| Dead code audit v8-v9 (137/137 tests) | HIGH | **DONE** |

### Planned Roadmap (Q1–Q3 2026)

| Timeline | Feature | Priority | Status | Impact |
|---|---|---|---|---|
| **Q1 2026** | Database Tracking (SQL/Prisma/TypeORM) | 🔥 CRITICAL | **In Progress (75%)** | Prisma/Supabase/Knex done (21 tests). Supabase `.from()` fix. Missing: SQL migration parser, TypeORM/EF, `DBColumn` nodes |
| **Q2 2026** | C# / .NET Language Support | HIGH | Not started | Opens Fortune 500 (banks, insurance, government) |
| **Q2 2026** | Go Language Support | HIGH | Not started | Cloud/infra visibility (K8s operators, microservices) |
| **Q2–Q3 2026** | PR Impact Analyzer | HIGH | Not started | Production safety, GitHub Actions integration |
| **Q3–Q4 2026** | Logic Intent Parser | MEDIUM | Not started | Proprietary moat — business logic understanding |

### Enterprise Backlog

| Feature | Priority | Status |
|---|---|---|
| Cross-language edge resolution | HIGH | Not started |
| Graph time-travel (per-commit snapshots) | MEDIUM | Not started |
| Observability integration (OpenTelemetry) | HIGH | Not started |
| Infrastructure tracking (Terraform/K8s) | MEDIUM | Not started |
| Cross-project duplicate detection | MEDIUM | **Done** — `bodyHash` on FunctionNode/ClassNode, `findDuplicates` query, `includeDuplicates` in `nm_health` |
| Multi-repo federated graph | HIGH | Not started |
| RBAC + multi-tenancy | HIGH | Not started |
| SSO (OIDC/SAML) | MEDIUM | Not started |
| Cloud-hosted SaaS offering | HIGH | Not started |
| Business logic linking (Jira/ADRs) | MEDIUM | Not started |
