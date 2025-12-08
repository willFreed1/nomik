# @genome/viz

Dashboard de visualisation pour GENOME. Application React pour explorer interactivement le knowledge graph.

## Fonctionnalites

- **Graph Explorer** : Visualisation force-directed avec `cytoscape.js` (layout `cose`)
- **Connexion directe** : Se connecte a Neo4j via Bolt protocol
- **Barre de recherche** : Recherche de noeuds par nom, focus automatique
- **Filtres** : Toggle par type de noeud (File/Function/Class) et type d'edge (CONTAINS/CALLS)
- **Impact Overlay** : Click sur un noeud = highlight callees (amber), callers (bleu), source (rouge), fade le reste
- **Panneau detail** : Click sur un noeud ouvre un panneau lateral avec proprietes, calls, calledBy, contains
- **Edge labels au hover** : Survoler un edge affiche son type (CONTAINS/CALLS)
- **Help Modal** : Bouton `? Help` avec guide complet (couleurs, interactions, raccourcis)
- **Legende** : Barre en bas avec types de noeuds et edges

## Composants

| Composant | Fichier | Role |
|---|---|---|
| `GraphViewer` | `components/GraphViewer.tsx` | Composant principal, Cytoscape, event handlers |
| `SearchBar` | `components/SearchBar.tsx` | Recherche de noeuds avec focus |
| `FilterPanel` | `components/FilterPanel.tsx` | Toggle filtres par type |
| `NodeDetail` | `components/NodeDetail.tsx` | Panneau detail d'un noeud selectionne |
| `HelpModal` | `components/HelpModal.tsx` | Popup d'aide interactive |

## Styles

| Fichier | Role |
|---|---|
| `styles/graphStyles.ts` | Styles Cytoscape (couleurs noeuds/edges, impact, selection, faded) |
| `styles/graphLayout.ts` | Parametres du layout `cose` (repulsion, gravite, iterations) |

## Code couleur

| Element | Couleur | Signification |
|---|---|---|
| Noeud File | Cyan (`#06b6d4`) | Fichier source |
| Noeud Function | Emerald (`#10b981`) | Fonction, methode, arrow function |
| Noeud Class | Purple (`#a855f7`) | Declaration de classe |
| Edge CONTAINS | Slate (`#334155`) | File contient Function/Class |
| Edge CALLS | Amber (`#f59e0b`) | Fonction appelle une autre |
| Impact source | Rouge (`#ef4444`) | Noeud selectionne |
| Impact callee | Amber (`#f59e0b`) | Fonctions appelees par le noeud |
| Impact caller | Bleu (`#3b82f6`) | Fonctions qui appellent le noeud |

## Prerequis

- **Neo4j** actif localement (via Docker)
  - URL : `bolt://localhost:7687`
  - Auth : `neo4j` / `genome_local`

## Setup

```bash
pnpm install
pnpm dev
```

Dashboard sur **http://localhost:3000**.
