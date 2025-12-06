# GENOME — Graph Schema Design

## Node Types

### Core Nodes

| Node Label | Properties | Description |
|---|---|---|
| `File` | `path`, `language`, `hash`, `lastParsed`, `size` | Source file |
| `Function` | `name`, `filePath`, `startLine`, `endLine`, `params`, `returnType`, `async`, `exported`, `confidence` | Function or method |
| `Class` | `name`, `filePath`, `startLine`, `endLine`, `exported`, `abstract` | Class or interface |
| `Variable` | `name`, `filePath`, `line`, `kind` (`const`/`let`/`var`), `exported` | Top-level variable or constant |
| `Module` | `name`, `path`, `type` (`file`/`package`/`external`) | Logical module |

### Semantic Nodes (Runtime Meaning)

| Node Label | Properties | Description |
|---|---|---|
| `Route` | `method`, `path`, `handlerName`, `middleware[]`, `filePath` | HTTP endpoint |
| `DBTable` | `name`, `schema`, `operations[]` | Database table reference |
| `ExternalAPI` | `name`, `baseUrl`, `methods[]` | 3rd-party API (Stripe, AWS, etc.) |
| `CronJob` | `name`, `schedule`, `handlerName`, `filePath` | Scheduled task |
| `Event` | `name`, `type` (`emit`/`listen`), `filePath` | Event bus publish/subscribe |
| `EnvVar` | `name`, `required`, `defaultValue` | Environment variable usage |

### Meta Nodes (Phase 2)

| Node Label | Properties | Description |
|---|---|---|
| `Ticket` | `id`, `title`, `url`, `status` | Jira/GitHub issue link |
| `Decision` | `title`, `date`, `rationale`, `author` | Architecture Decision Record |
| `Deployment` | `version`, `timestamp`, `environment` | Deploy event |

## Edge Types

### Structural Edges

| Edge Type | From → To | Description |
|---|---|---|
| `CONTAINS` | File → Function/Class/Variable | File defines this symbol |
| `IMPORTS` | File → Module | File imports from module |
| `EXTENDS` | Class → Class | Class inheritance |
| `IMPLEMENTS` | Class → Class | Interface implementation |
| `EXPORTS` | Module → Function/Class/Variable | Module exports symbol |

### Behavioral Edges

| Edge Type | From → To | Properties | Description |
|---|---|---|---|
| `CALLS` | Function → Function | `confidence`, `line` | Function invocation |
| `DEPENDS_ON` | Function → Module | `kind` | Dependency |
| `HANDLES` | Route → Function | `middleware[]` | Route handler binding |
| `READS_FROM` | Function → DBTable | `query` | Database read |
| `WRITES_TO` | Function → DBTable | `operation` | Database write |
| `CALLS_EXTERNAL` | Function → ExternalAPI | `method`, `endpoint` | External API call |
| `TRIGGERS` | CronJob → Function | `schedule` | Cron triggers function |
| `EMITS` | Function → Event | `payload` | Event emission |
| `LISTENS_TO` | Function → Event | `handler` | Event subscription |
| `USES_ENV` | Function → EnvVar | | Environment variable usage |

## Example Graph (Cypher)

```cypher
// Create a payment processing subgraph
CREATE (f:File {path: 'src/services/payment.ts', language: 'typescript', hash: 'abc123'})
CREATE (fn:Function {name: 'processPayment', filePath: 'src/services/payment.ts',
                     startLine: 42, endLine: 87, async: true, exported: true})
CREATE (route:Route {method: 'POST', path: '/api/checkout', handlerName: 'checkoutHandler'})
CREATE (stripe:ExternalAPI {name: 'Stripe', baseUrl: 'https://api.stripe.com'})
CREATE (txTable:DBTable {name: 'transactions', schema: 'public'})
CREATE (cron:CronJob {name: 'monthlyBilling', schedule: '0 0 1 * *'})

CREATE (f)-[:CONTAINS]->(fn)
CREATE (route)-[:HANDLES]->(fn)
CREATE (fn)-[:CALLS_EXTERNAL {method: 'POST', endpoint: '/v1/charges'}]->(stripe)
CREATE (fn)-[:WRITES_TO {operation: 'INSERT'}]->(txTable)
CREATE (cron)-[:TRIGGERS]->(fn)
```

## Key Queries

### Impact Analysis

```cypher
// What breaks if I change processPayment?
MATCH path = (n:Function {name: $functionName})<-[:CALLS|HANDLES|TRIGGERS*1..5]-(dependent)
RETURN dependent, relationships(path), length(path) as depth
ORDER BY depth
```

### God Object Detection

```cypher
// Find functions with > 10 dependencies (code smell)
MATCH (f:Function)-[r:CALLS|DEPENDS_ON]->()
WITH f, count(r) as depCount
WHERE depCount > 10
RETURN f.name, f.filePath, depCount
ORDER BY depCount DESC
```

### Dependency Cycles

```cypher
// Detect circular dependencies
MATCH cycle = (a:Module)-[:IMPORTS*2..6]->(a)
RETURN [n IN nodes(cycle) | n.name] as cyclePath
```

### Dead Code Detection

```cypher
// Find exported functions never called by anyone
MATCH (f:Function {exported: true})
WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-()
RETURN f.name, f.filePath
```

## Indexes (Performance)

```cypher
// Schema initialization
CREATE CONSTRAINT fn_unique IF NOT EXISTS FOR (f:Function) REQUIRE (f.filePath, f.name) IS UNIQUE;
CREATE CONSTRAINT file_unique IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE;
CREATE CONSTRAINT route_unique IF NOT EXISTS FOR (r:Route) REQUIRE (r.method, r.path) IS UNIQUE;

CREATE INDEX fn_name IF NOT EXISTS FOR (f:Function) ON (f.name);
CREATE INDEX file_path IF NOT EXISTS FOR (f:File) ON (f.path);
CREATE INDEX class_name IF NOT EXISTS FOR (c:Class) ON (c.name);
CREATE INDEX route_path IF NOT EXISTS FOR (r:Route) ON (r.path);
```
