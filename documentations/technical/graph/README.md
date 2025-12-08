# @genome/graph

Couche de persistance gerant les interactions avec Neo4j.

## Fonctionnalites

- **Schema Management** : Auto-initialise contraintes (unicite) et indexes (performance) au demarrage
- **Driver Abstraction** : Wrapper type-safe autour de `neo4j-driver`
- **Batch UNWIND Upserts** : Nodes et edges groupes par type et envoyes en un seul `UNWIND` Cypher par groupe
- **Query Modules** :
  - `write.ts` : Upsert nodes (UNWIND batch), creation edges (UNWIND batch), cleanup fichier
  - `read.ts` : Impact analysis, dependency chain, dead code, god objects, stats

## Requetes cles

### Upsert par lots (UNWIND)

Les nodes sont groupes par type (`File`, `Function`, `Class`, etc.) et envoyes en batch :

```cypher
UNWIND $batch AS item
MERGE (n:Function {id: item.id})
SET n += item.props, n.updatedAt = datetime()
```

Les edges sont aussi groupes par type de relation (`CONTAINS`, `CALLS`, etc.) :

```cypher
UNWIND $batch AS item
MATCH (a {id: item.sourceId}), (b {id: item.targetId})
MERGE (a)-[r:CALLS {id: item.edgeId}]->(b)
SET r += item.props
```

### Analyse d'impact

Utilise `apoc.path.subgraphNodes` pour traverser `CALLS`, `DEPENDS_ON`, `HANDLES`, `TRIGGERS`, `LISTENS_TO` jusqu'a une profondeur configurable (defaut : 5).

### Pattern de merge

Utilise `MERGE` pour assurer l'idempotence. Les nodes sont identifies par un hash ID deterministe genere par le parser.

## Configuration

Necessite une instance Neo4j active.

- **Variables** : `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- **Defaut** : `bolt://localhost:7687`, `neo4j`, `genome_local`

## Service API

```typescript
interface GraphService {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    initSchema(): Promise<void>;
    ingestFileData(nodes, edges, filePath): Promise<void>;
    getImpact(symbolName, depth?): Promise<ImpactResult[]>;
    getDeadCode(): Promise<Array<{ name, filePath }>>;
    getGodObjects(threshold?): Promise<Array<{ name, filePath, depCount }>>;
    getStats(): Promise<{ nodeCount, edgeCount, fileCount, functionCount, classCount, routeCount }>;
    getDependencyChain(from, to): Promise<string[][]>;
    healthCheck(): Promise<boolean>;
    executeQuery<T>(query, params?): Promise<T[]>;
}
```
