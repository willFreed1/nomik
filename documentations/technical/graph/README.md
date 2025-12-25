# @nomik/graph

Persistence layer managing interactions with Neo4j Community Edition.

## Features

- **Schema Management**: Auto-initializes constraints (uniqueness by `id`) and indexes (performance + `projectId`) on startup
- **Driver Abstraction**: `GraphDriver` interface with Neo4j implementation (`neo4j.driver.ts`)
- **Batch UNWIND Upserts**: Nodes and edges grouped by type, sent in a single `UNWIND` Cypher per group
- **QueryCache**: TTL cache 30s (max 200 entries) on all reads, automatic invalidation after writes, LRU eviction
- **Retry**: Exponential backoff on Neo4j operations (3 attempts, transient error detection)
- **Timestamps**: `createdAt` and `updatedAt` on all nodes and edges
- **Multi-project**: `projectId` on all nodes and edges, full project CRUD

## Modules

### `queries/write.ts`
- `upsertNodes(driver, nodes, projectId)`: Batch upsert with UNWIND
- `createEdges(driver, edges, projectId)`: Batch edge creation
- `clearFileData(driver, filePath, projectId)`: Delete data for a file
- `upsertProject(driver, project)`: Create or update a Project node
- `deleteProjectData(driver, projectId)`: Delete all data for a project (DETACH DELETE)
- `listProjects(driver)`: List all projects
- `getProject(driver, projectId)`: Retrieve a project by ID

### `queries/read.ts`
- `impactAnalysis(driver, symbolName, maxDepth, projectId?)`: APOC upstream traversal
- `findDependencyChain(driver, from, to, projectId?)`: Shortest path
- `findDeadCode(driver, projectId?)`: Functions never called — excludes constructors, class methods (called via `obj.method()`), React components, barrel re-exports
- `findGodObjects(driver, threshold, projectId?)`: Functions with unexpected cross-file coupling (excludes intra-file dispatch and calls to directly imported files). Default threshold: 15
- `graphStats(driver, projectId?)`: Counts (nodes, edges, files, functions, classes, routes)
- `recentChanges(driver, since, limit, projectId?)`: Nodes modified since a date

### `drivers/`
- `driver.interface.ts`: `GraphDriver` interface (connect, disconnect, runQuery, runWrite, getSession, isConnected, healthCheck)
- `neo4j.driver.ts`: Neo4j implementation (Bolt protocol)

### `schema/init.ts`
Uniqueness constraints + search indexes + `projectId` indexes for multi-project isolation.

### `cache.ts`
`QueryCache` with configurable TTL, `invalidateAll()`, `invalidateByPattern()`, LRU eviction.

## Service API

```typescript
interface GraphService {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    initSchema(): Promise<void>;
    ingestFileData(nodes, edges, filePath, projectId): Promise<void>;
    ingestBatch(results, projectId): Promise<void>;
    getImpact(symbolName, depth?, projectId?): Promise<ImpactResult[]>;
    getDeadCode(projectId?): Promise<Array<{ name, filePath }>>;
    getGodObjects(threshold?, projectId?): Promise<Array<{ name, filePath, depCount }>>;
    getStats(projectId?): Promise<{ nodeCount, edgeCount, fileCount, functionCount, classCount, routeCount }>;
    getDependencyChain(from, to, projectId?): Promise<string[][]>;
    getDetailedPath(from, to, projectId?): Promise<DetailedPath[]>;
    getRecentChanges(since, limit?, projectId?): Promise<Array<{ name, type, filePath, updatedAt, createdAt }>>;
    healthCheck(): Promise<boolean>;
    executeQuery<T>(query, params?): Promise<T[]>;
    // Project management
    createProject(project): Promise<void>;
    listProjects(): Promise<ProjectNode[]>;
    getProject(projectId): Promise<ProjectNode | null>;
    deleteProject(projectId): Promise<void>;
}
```

## Configuration

- **Variables**: `NOMIK_GRAPH_URI`, `NOMIK_GRAPH_USER`, `NOMIK_GRAPH_PASS`
- **Default**: `bolt://localhost:7687`, `neo4j`, `nomik_local`
