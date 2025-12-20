# @genome/viz

Dashboard de visualisation pour GENOME. Application React pour explorer interactivement le knowledge graph en 2D et 3D.

## Fonctionnalites

- **Graph 2D** : Cytoscape.js avec layout force-directed (`cose`)
- **Graph 3D** : 3d-force-graph (Three.js) — rotation style ADN/reseau neuronal, particules animees sur les edges
- **Toggle 2D/3D** : Bouton pour basculer entre les deux modes
- **4 Layouts** : Force (cose), Arbre (breadthfirst), Radial (concentric), Cercle (circle)
- **Barre de recherche** : Recherche de noeuds par nom, focus automatique
- **Filtres** : Toggle par type de noeud (File/Function/Class) et type d'edge (CONTAINS/CALLS/DEPENDS_ON)
- **Impact Overlay** : Click sur un noeud = highlight callees (amber), callers (bleu), source (rouge), fade le reste
- **Panneau detail** : Click sur un noeud ouvre un panneau lateral avec proprietes, calls, calledBy, contains
- **Edge labels au hover** : Survoler un edge affiche son type
- **Help Modal** : Bouton `? Help` avec guide complet
- **Legende** : Barre en bas avec types de noeuds et edges
- **Theme sombre** : Style professionnel, dark mode
- **Filtrage par projet** : `fetchGraphData(projectId?)` pour isoler les donnees d'un projet

## Composants

| Composant | Fichier | Role |
|---|---|---|
| `GraphViewer` | `components/GraphViewer.tsx` | Graphe 2D Cytoscape, event handlers |
| `Graph3DViewer` | `components/Graph3DViewer.tsx` | Graphe 3D Three.js, rotation, particules |
| `SearchBar` | `components/SearchBar.tsx` | Recherche de noeuds avec focus |
| `FilterPanel` | `components/FilterPanel.tsx` | Toggle filtres par type |
| `NodeDetail` | `components/NodeDetail.tsx` | Panneau detail d'un noeud selectionne |
| `HelpModal` | `components/HelpModal.tsx` | Popup d'aide interactive |
| `LayoutSelector` | `components/LayoutSelector.tsx` | Selecteur de layout (Force/Arbre/Radial/Cercle) |

## Connexion Neo4j

Le viz se connecte directement a Neo4j via `neo4j-driver` (Bolt). Les requetes sont filtrees par `projectId` si fourni.

- `fetchGraphData(projectId?)` : Recupere le graphe complet (hors ScanMeta et Project)
- `fetchProjects()` : Liste les projets disponibles

## Code couleur

| Element | Couleur | Signification |
|---|---|---|
| Noeud File | Cyan (`#06b6d4`) | Fichier source |
| Noeud Function | Emerald (`#10b981`) | Fonction, methode |
| Noeud Class | Purple (`#a855f7`) | Classe, interface, struct, trait |
| Edge CONTAINS | Slate (`#334155`) | File contient Function/Class |
| Edge CALLS | Amber (`#f59e0b`) | Appel de fonction (particules en 3D) |
| Edge DEPENDS_ON | Sky dashed (`#0ea5e9`) | Dependance inter-fichier |
| Impact source | Rouge (`#ef4444`) | Noeud selectionne |
| Impact callee | Amber (`#f59e0b`) | Fonctions appelees |
| Impact caller | Bleu (`#3b82f6`) | Fonctions qui appellent |

## Tech Stack

- **React** + **Vite** (build rapide)
- **Cytoscape.js** (2D graph)
- **3d-force-graph** / **Three.js** (3D graph)
- **TailwindCSS** (styles)
- **neo4j-driver** (connexion directe)

## Setup

```bash
cd packages/viz
pnpm dev
```

Dashboard sur **http://localhost:3000**.
