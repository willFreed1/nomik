# @genome/graph

Couche de persistance gerant les interactions avec Neo4j Community Edition.

## Fonctionnalites

- **Schema Management** : Auto-initialise contraintes (unicite par `id`) et indexes (performance + `projectId`) au demarrage
- **Driver Abstraction** : Interface `GraphDriver` avec implementation Neo4j (`neo4j.driver.ts`)
- **Scoped Driver** : Wrapper `createScopedDriver(driver, projectId)` qui injecte automatiquement `projectId` dans toutes les requetes — previent les fuites de contexte entre projets
- **Batch UNWIND Upserts** : Nodes et edges groupes par type, envoyes en un seul `UNWIND` Cypher par groupe
- **QueryCache** : Cache TTL 30s (max 200 entrees) sur toutes les lectures, invalidation automatique apres ecriture, eviction LRU
- **Retry** : Backoff exponentiel sur les operations Neo4j (3 tentatives, detection erreurs transientes)
- **Timestamps** : `createdAt` et `updatedAt` sur tous les noeuds et edges
- **Multi-projet** : `projectId` sur tous les noeuds et edges, CRUD projet complet

## Modules

### `queries/write.ts`
- `upsertNodes(driver, nodes, projectId)` : Upsert par lots avec UNWIND
- `createEdges(driver, edges, projectId)` : Creation d'edges par lots
- `clearFileData(driver, filePath, projectId)` : Suppression des donnees d'un fichier
- `upsertProject(driver, project)` : Cree ou met a jour un noeud Project
- `deleteProjectData(driver, projectId)` : Supprime toutes les donnees d'un projet (DETACH DELETE)
- `listProjects(driver)` : Liste tous les projets
- `getProject(driver, projectId)` : Recupere un projet par ID

### `queries/read.ts`
- `impactAnalysis(driver, symbolName, maxDepth, projectId?)` : Traversee APOC en amont
- `findDependencyChain(driver, from, to, projectId?)` : Plus court chemin
- `findDeadCode(driver, projectId?)` : Fonctions exportees jamais appelees
- `findGodObjects(driver, threshold, projectId?)` : Fonctions avec trop de dependances
- `graphStats(driver, projectId?)` : Comptages (noeuds, edges, fichiers, fonctions, classes, routes)
- `recentChanges(driver, since, limit, projectId?)` : Noeuds modifies depuis une date

### `drivers/`
- `driver.interface.ts` : Interface `GraphDriver` (connect, disconnect, runQuery, runWrite, getSession, isConnected, healthCheck)
- `neo4j.driver.ts` : Implementation Neo4j (Bolt protocol)
- `scoped.driver.ts` : Wrapper qui injecte `projectId` dans tous les params

### `schema/init.ts`
Contraintes d'unicite + indexes de recherche + indexes `projectId` pour l'isolation multi-projet.

### `cache.ts`
`QueryCache` avec TTL configurable, `invalidateAll()`, `invalidateByPattern()`, eviction LRU.

## Service API

```typescript
interface GraphService {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    initSchema(): Promise<void>;
    ingestFileData(nodes, edges, filePath, projectId): Promise<void>;
    getImpact(symbolName, depth?, projectId?): Promise<ImpactResult[]>;
    getDeadCode(projectId?): Promise<Array<{ name, filePath }>>;
    getGodObjects(threshold?, projectId?): Promise<Array<{ name, filePath, depCount }>>;
    getStats(projectId?): Promise<{ nodeCount, edgeCount, fileCount, functionCount, classCount, routeCount }>;
    getDependencyChain(from, to, projectId?): Promise<string[][]>;
    getRecentChanges(since, limit?, projectId?): Promise<Array<{ name, type, filePath, updatedAt, createdAt }>>;
    healthCheck(): Promise<boolean>;
    executeQuery<T>(query, params?): Promise<T[]>;
    // Gestion des projets
    createProject(project): Promise<void>;
    listProjects(): Promise<ProjectNode[]>;
    getProject(projectId): Promise<ProjectNode | null>;
    deleteProject(projectId): Promise<void>;
}
```

## Configuration

- **Variables** : `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- **Defaut** : `bolt://localhost:7687`, `neo4j`, `genome_local`
