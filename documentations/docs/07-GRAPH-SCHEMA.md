# GENOME — Neo4j Graph Schema

> All nodes and edges have a `projectId` property for multi-project isolation.

---

## Node Types

### Project Node (root per project)

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique project identifier |
| `name` | string | Project name |
| `rootPath` | string | Project root path |
| `createdAt` | datetime | Creation date |
| `updatedAt` | datetime | Last update |

> **Note:** The `Project` node has no `projectId` property — its `id` serves as the project identifier.

### ScanMeta Node (scan metadata)

| Property | Type | Description |
|----------|------|-------------|
| `sha` | string | Full Git commit SHA |
| `shortSha` | string | Short SHA (7 characters) |
| `message` | string | Commit message |
| `author` | string | Commit author |
| `gitDate` | string | Git commit date |
| `scannedAt` | datetime | Scan date/time |
| `fileCount` | number | Number of files scanned |
| `nodeCount` | number | Number of nodes created |
| `edgeCount` | number | Number of edges created |
| `projectId` | string | Associated project |

### Node types summary table

| Label | Main properties | Description |
|-------|-----------------|-------------|
| `File` | `id`, `type='file'`, `path`, `language`, `hash`, `size`, `lastParsed`, `projectId` | Source file |
| `Function` | `id`, `type='function'`, `name`, `filePath`, `startLine`, `endLine`, `params`, `returnType?`, `isAsync`, `isExported`, `isGenerator`, `decorators[]`, `confidence`, `projectId` | Function or method |
| `Class` | `id`, `type='class'`, `name`, `filePath`, `startLine`, `endLine`, `isExported`, `isAbstract`, `superClass?`, `interfaces[]`, `decorators[]`, `methods[]`, `properties[]`, `projectId` | Class or interface |
| `Variable` | `id`, `type='variable'`, `name`, `filePath`, `line`, `kind` (const/let/var), `isExported`, `valueType?`, `projectId` | Top-level variable or constant |
| `Module` | `id`, `type='module'`, `name`, `path`, `moduleType` (file/package/external), `projectId` | Logical module |
| `Route` | `id`, `type='route'`, `method`, `path`, `handlerName`, `filePath`, `middleware[]`, `projectId` | HTTP endpoint |
| `DBTable` | `id`, `type='db_table'`, `name`, `schema?`, `operations[]`, `projectId` | Database table reference |
| `ExternalAPI` | `id`, `type='external_api'`, `name`, `baseUrl?`, `methods[]`, `projectId` | External API (Stripe, AWS, etc.) |
| `CronJob` | `id`, `type='cron_job'`, `name`, `schedule`, `handlerName`, `filePath`, `projectId` | Scheduled task |
| `Event` | `id`, `type='event'`, `name`, `eventKind` (emit/listen), `filePath`, `projectId` | Event bus publish/subscribe |
| `EnvVar` | `id`, `type='env_var'`, `name`, `required`, `defaultValue?`, `projectId` | Environment variable |

---

## Edge Types

All edges have a `projectId` property for multi-project isolation.

### Edge types summary table

| Type | From → To | Properties | Description |
|------|-----------|------------|-------------|
| `CONTAINS` | File → Function/Class/Variable | — | The file defines this symbol |
| `IMPORTS` | File → Module | `specifiers[]`, `isDefault`, `isDynamic` | The file imports from the module |
| `EXPORTS` | Module → Function/Class/Variable | `isDefault`, `alias?` | The module exports this symbol |
| `EXTENDS` | Class → Class | — | Class inheritance |
| `IMPLEMENTS` | Class → Class | — | Interface implementation |
| `CALLS` | Function → Function | `line`, `column?` | Function invocation |
| `DEPENDS_ON` | Function → Module | `kind` (import/call/http/event/env) | Dependency |
| `HANDLES` | Route → Function | `middleware[]` | Route handler binding |
| `READS_FROM` | Function → DBTable | `query?` | Database read |
| `WRITES_TO` | Function → DBTable | `operation` | Database write |
| `CALLS_EXTERNAL` | Function → ExternalAPI | `method`, `endpoint?` | External API call |
| `TRIGGERS` | CronJob → Function | `schedule?` | The cron triggers the function |
| `EMITS` | Function → Event | `payload?` | Event emission |
| `LISTENS_TO` | Function → Event | `handler` | Event subscription |
| `USES_ENV` | Function → EnvVar | — | Environment variable usage |

---

## Cypher Example

```cypher
// Create a payment subgraph (with projectId)
CREATE (f:File {id: 'file:src/services/payment.ts', path: 'src/services/payment.ts',
                 language: 'typescript', hash: 'abc123', size: 2048, lastParsed: datetime(),
                 projectId: 'my-api'})
CREATE (fn:Function {id: 'fn:payment:processPayment', name: 'processPayment',
                     filePath: 'src/services/payment.ts', startLine: 42, endLine: 87,
                     isAsync: true, isExported: true, isGenerator: false, decorators: '[]',
                     confidence: 1.0, projectId: 'my-api'})
CREATE (route:Route {id: 'route:POST:/api/checkout', method: 'POST', path: '/api/checkout',
                     handlerName: 'checkoutHandler', filePath: 'src/routes.ts',
                     middleware: '[]', projectId: 'my-api'})
CREATE (stripe:ExternalAPI {id: 'ext:stripe', name: 'Stripe', baseUrl: 'https://api.stripe.com',
                            methods: '["POST"]', projectId: 'my-api'})
CREATE (txTable:DBTable {id: 'db:transactions', name: 'transactions', schema: 'public',
                         operations: '["INSERT"]', projectId: 'my-api'})
CREATE (cron:CronJob {id: 'cron:monthlyBilling', name: 'monthlyBilling',
                      schedule: '0 0 1 * *', handlerName: 'runBilling', filePath: 'src/jobs.ts',
                      projectId: 'my-api'})

CREATE (f)-[:CONTAINS {projectId: 'my-api'}]->(fn)
CREATE (route)-[:HANDLES {projectId: 'my-api'}]->(fn)
CREATE (fn)-[:CALLS_EXTERNAL {method: 'POST', endpoint: '/v1/charges', projectId: 'my-api'}]->(stripe)
CREATE (fn)-[:WRITES_TO {operation: 'INSERT', projectId: 'my-api'}]->(txTable)
CREATE (cron)-[:TRIGGERS {projectId: 'my-api'}]->(fn)
```

---

## Key Queries

### Impact analysis

```cypher
// What breaks if I modify processPayment?
MATCH (target)
WHERE (target.name = $name OR target.id = $name) AND target.projectId = $projectId
WITH target LIMIT 1
CALL apoc.path.subgraphNodes(target, {
  relationshipFilter: "<CALLS|<HANDLES|<TRIGGERS|<DEPENDS_ON|<LISTENS_TO",
  maxLevel: $maxDepth
}) YIELD node
WHERE node <> target AND node.projectId = $projectId
RETURN COALESCE(node.name, node.path) as name,
       labels(node)[0] as type,
       COALESCE(node.filePath, node.path) as filePath,
       1 as depth,
       "DEPENDS_ON" as relType
```

### God Object detection

```cypher
// Functions with > 10 dependencies (code smell)
MATCH (f:Function)-[r:CALLS|DEPENDS_ON]->()
WHERE f.projectId = $projectId
WITH f, count(r) as depCount
WHERE depCount > $threshold
RETURN f.name as name, f.filePath as filePath, depCount
ORDER BY depCount DESC
```

### Dead code detection

```cypher
// Exported functions never called
MATCH (f:Function {isExported: true})
WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-() AND f.projectId = $projectId
RETURN f.name as name, f.filePath as filePath
ORDER BY f.filePath
```

### Dependency cycles

```cypher
// Circular dependency detection between modules
MATCH cycle = (a:Module)-[:IMPORTS*2..6]->(a)
WHERE a.projectId = $projectId
RETURN [n IN nodes(cycle) | n.name] as cyclePath
```

---

## Constraints (schema/init.ts)

```cypher
CREATE CONSTRAINT file_id IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT function_id IF NOT EXISTS FOR (f:Function) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT class_id IF NOT EXISTS FOR (c:Class) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT route_id IF NOT EXISTS FOR (r:Route) REQUIRE r.id IS UNIQUE;
CREATE CONSTRAINT module_id IF NOT EXISTS FOR (m:Module) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT variable_id IF NOT EXISTS FOR (v:Variable) REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE;
```

---

## Indexes (schema/init.ts)

### Search indexes

```cypher
CREATE INDEX file_path IF NOT EXISTS FOR (f:File) ON (f.path);
CREATE INDEX function_name IF NOT EXISTS FOR (f:Function) ON (f.name);
CREATE INDEX function_filepath IF NOT EXISTS FOR (f:Function) ON (f.filePath);
CREATE INDEX class_name IF NOT EXISTS FOR (c:Class) ON (c.name);
CREATE INDEX route_path IF NOT EXISTS FOR (r:Route) ON (r.path);
```

### projectId indexes (multi-project isolation)

```cypher
CREATE INDEX file_project IF NOT EXISTS FOR (f:File) ON (f.projectId);
CREATE INDEX function_project IF NOT EXISTS FOR (f:Function) ON (f.projectId);
CREATE INDEX class_project IF NOT EXISTS FOR (c:Class) ON (c.projectId);
CREATE INDEX module_project IF NOT EXISTS FOR (m:Module) ON (m.projectId);
CREATE INDEX route_project IF NOT EXISTS FOR (r:Route) ON (r.projectId);
CREATE INDEX variable_project IF NOT EXISTS FOR (v:Variable) ON (v.projectId);
```
