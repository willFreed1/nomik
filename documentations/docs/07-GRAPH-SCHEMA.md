# GENOME — Schéma du graphe Neo4j

> Tous les nœuds et arêtes possèdent une propriété `projectId` pour l’isolation multi-projet.

---

## Types de nœuds

### Nœud Project (racine par projet)

| Propriété | Type | Description |
|-----------|------|-------------|
| `id` | string | Identifiant unique du projet |
| `name` | string | Nom du projet |
| `rootPath` | string | Chemin racine du projet |
| `createdAt` | datetime | Date de création |
| `updatedAt` | datetime | Dernière mise à jour |

> **Note :** Le nœud `Project` n’a pas de propriété `projectId` — son `id` sert d’identifiant de projet.

### Nœud ScanMeta (métadonnées de scan)

| Propriété | Type | Description |
|-----------|------|-------------|
| `sha` | string | SHA complet du commit Git |
| `shortSha` | string | SHA court (7 caractères) |
| `message` | string | Message du commit |
| `author` | string | Auteur du commit |
| `gitDate` | string | Date du commit Git |
| `scannedAt` | datetime | Date/heure du scan |
| `fileCount` | number | Nombre de fichiers scannés |
| `nodeCount` | number | Nombre de nœuds créés |
| `edgeCount` | number | Nombre d’arêtes créées |
| `projectId` | string | Projet associé |

### Tableau récapitulatif des types de nœuds

| Label | Propriétés principales | Description |
|-------|------------------------|-------------|
| `File` | `id`, `type='file'`, `path`, `language`, `hash`, `size`, `lastParsed`, `projectId` | Fichier source |
| `Function` | `id`, `type='function'`, `name`, `filePath`, `startLine`, `endLine`, `params`, `returnType?`, `isAsync`, `isExported`, `isGenerator`, `decorators[]`, `confidence`, `projectId` | Fonction ou méthode |
| `Class` | `id`, `type='class'`, `name`, `filePath`, `startLine`, `endLine`, `isExported`, `isAbstract`, `superClass?`, `interfaces[]`, `decorators[]`, `methods[]`, `properties[]`, `projectId` | Classe ou interface |
| `Variable` | `id`, `type='variable'`, `name`, `filePath`, `line`, `kind` (const/let/var), `isExported`, `valueType?`, `projectId` | Variable ou constante de niveau top |
| `Module` | `id`, `type='module'`, `name`, `path`, `moduleType` (file/package/external), `projectId` | Module logique |
| `Route` | `id`, `type='route'`, `method`, `path`, `handlerName`, `filePath`, `middleware[]`, `projectId` | Endpoint HTTP |
| `DBTable` | `id`, `type='db_table'`, `name`, `schema?`, `operations[]`, `projectId` | Référence à une table de base de données |
| `ExternalAPI` | `id`, `type='external_api'`, `name`, `baseUrl?`, `methods[]`, `projectId` | API externe (Stripe, AWS, etc.) |
| `CronJob` | `id`, `type='cron_job'`, `name`, `schedule`, `handlerName`, `filePath`, `projectId` | Tâche planifiée |
| `Event` | `id`, `type='event'`, `name`, `eventKind` (emit/listen), `filePath`, `projectId` | Publication/abonnement sur bus d’événements |
| `EnvVar` | `id`, `type='env_var'`, `name`, `required`, `defaultValue?`, `projectId` | Variable d’environnement |

---

## Types d’arêtes

Toutes les arêtes ont une propriété `projectId` pour l’isolation multi-projet.

### Tableau récapitulatif des types d’arêtes

| Type | De → Vers | Propriétés | Description |
|------|-----------|------------|-------------|
| `CONTAINS` | File → Function/Class/Variable | — | Le fichier définit ce symbole |
| `IMPORTS` | File → Module | `specifiers[]`, `isDefault`, `isDynamic` | Le fichier importe depuis le module |
| `EXPORTS` | Module → Function/Class/Variable | `isDefault`, `alias?` | Le module exporte ce symbole |
| `EXTENDS` | Class → Class | — | Héritage de classe |
| `IMPLEMENTS` | Class → Class | — | Implémentation d’interface |
| `CALLS` | Function → Function | `line`, `column?` | Invocation de fonction |
| `DEPENDS_ON` | Function → Module | `kind` (import/call/http/event/env) | Dépendance |
| `HANDLES` | Route → Function | `middleware[]` | Liaison du handler de route |
| `READS_FROM` | Function → DBTable | `query?` | Lecture en base |
| `WRITES_TO` | Function → DBTable | `operation` | Écriture en base |
| `CALLS_EXTERNAL` | Function → ExternalAPI | `method`, `endpoint?` | Appel API externe |
| `TRIGGERS` | CronJob → Function | `schedule?` | Le cron déclenche la fonction |
| `EMITS` | Function → Event | `payload?` | Émission d’événement |
| `LISTENS_TO` | Function → Event | `handler` | Abonnement à un événement |
| `USES_ENV` | Function → EnvVar | — | Utilisation d’une variable d’environnement |

---

## Exemple Cypher

```cypher
// Création d'un sous-graphe de paiement (avec projectId)
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

## Requêtes clés

### Analyse d’impact

```cypher
// Qu'est-ce qui casse si je modifie processPayment ?
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

### Détection de God Objects

```cypher
// Fonctions avec > 10 dépendances (code smell)
MATCH (f:Function)-[r:CALLS|DEPENDS_ON]->()
WHERE f.projectId = $projectId
WITH f, count(r) as depCount
WHERE depCount > $threshold
RETURN f.name as name, f.filePath as filePath, depCount
ORDER BY depCount DESC
```

### Détection de code mort

```cypher
// Fonctions exportées jamais appelées
MATCH (f:Function {isExported: true})
WHERE NOT (f)<-[:CALLS]-() AND NOT (f)<-[:HANDLES]-() AND f.projectId = $projectId
RETURN f.name as name, f.filePath as filePath
ORDER BY f.filePath
```

### Cycles de dépendances

```cypher
// Détection des dépendances circulaires entre modules
MATCH cycle = (a:Module)-[:IMPORTS*2..6]->(a)
WHERE a.projectId = $projectId
RETURN [n IN nodes(cycle) | n.name] as cyclePath
```

---

## Contraintes (schema/init.ts)

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

## Index (schema/init.ts)

### Index de recherche

```cypher
CREATE INDEX file_path IF NOT EXISTS FOR (f:File) ON (f.path);
CREATE INDEX function_name IF NOT EXISTS FOR (f:Function) ON (f.name);
CREATE INDEX function_filepath IF NOT EXISTS FOR (f:Function) ON (f.filePath);
CREATE INDEX class_name IF NOT EXISTS FOR (c:Class) ON (c.name);
CREATE INDEX route_path IF NOT EXISTS FOR (r:Route) ON (r.path);
```

### Index projectId (isolation multi-projet)

```cypher
CREATE INDEX file_project IF NOT EXISTS FOR (f:File) ON (f.projectId);
CREATE INDEX function_project IF NOT EXISTS FOR (f:Function) ON (f.projectId);
CREATE INDEX class_project IF NOT EXISTS FOR (c:Class) ON (c.projectId);
CREATE INDEX module_project IF NOT EXISTS FOR (m:Module) ON (m.projectId);
CREATE INDEX route_project IF NOT EXISTS FOR (r:Route) ON (r.projectId);
CREATE INDEX variable_project IF NOT EXISTS FOR (v:Variable) ON (v.projectId);
```
