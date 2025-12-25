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

| Feature | Phase | Priority | Status |
|---|---|---|---|
| Python language support | Post-MVP | HIGH | **DONE** |
| Rust language support | Post-MVP | HIGH | **DONE** |
| Multi-project isolation (projectId) | Post-MVP | HIGH | **DONE** |
| Go language support | Post-MVP | MEDIUM | Not started |
| Cross-language edge resolution | Post-MVP | HIGH | Not started |
| PR impact diff (GitHub integration) | Post-MVP | HIGH | Not started |
| Graph time-travel (per-commit snapshots) | Post-MVP | MEDIUM | Not started |
| Cross-project duplicate detection | Post-MVP | MEDIUM | Not started |
| Multi-repo federated graph | Enterprise | HIGH | Not started |
| RBAC + multi-tenancy | Enterprise | HIGH | Not started |
| SSO (OIDC/SAML) | Enterprise | MEDIUM | Not started |
| Cloud-hosted SaaS offering | Enterprise | HIGH | Not started |
| Infra integration (K8s, Terraform) | Phase 2 Vision | MEDIUM | Not started |
| Business logic linking (Jira/ADRs) | Phase 3 Vision | LOW | Not started |
