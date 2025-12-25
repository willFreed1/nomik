# @nomik/viz

Visualization dashboard for NOMIK. React application to interactively explore the knowledge graph in 2D and 3D.

## Features

- **2D Graph**: Cytoscape.js with force-directed layout (`cose`)
- **3D Graph**: 3d-force-graph (Three.js) — DNA/neural network style rotation, animated particles on edges
- **2D/3D Toggle**: Button to switch between the two modes
- **4 Layouts**: Force (cose), Tree (breadthfirst), Radial (concentric), Circle (circle)
- **Search bar**: Node search by name, automatic focus
- **Filters**: Toggle by node type (File/Function/Class) and edge type (CONTAINS/CALLS/DEPENDS_ON)
- **Impact Overlay**: Click on a node = highlight callees (amber), callers (blue), source (red), fade the rest
- **Detail panel**: Click on a node opens a side panel with properties, calls, calledBy, contains
- **Edge labels on hover**: Hovering over an edge displays its type
- **Help Modal**: `? Help` button with complete guide
- **Legend**: Bottom bar with node and edge types
- **Dark theme**: Professional style, dark mode
- **Project filtering**: `fetchGraphData(projectId?)` to isolate data for a project

## Components

| Component | File | Role |
|---|---|---|
| `GraphViewer` | `components/GraphViewer.tsx` | 2D Cytoscape graph, event handlers |
| `Graph3DViewer` | `components/Graph3DViewer.tsx` | 3D Three.js graph, rotation, particles |
| `SearchBar` | `components/SearchBar.tsx` | Node search with focus |
| `FilterPanel` | `components/FilterPanel.tsx` | Toggle filters by type |
| `NodeDetail` | `components/NodeDetail.tsx` | Detail panel for selected node |
| `HelpModal` | `components/HelpModal.tsx` | Interactive help popup |
| `LayoutSelector` | `components/LayoutSelector.tsx` | Layout selector (Force/Tree/Radial/Circle) |

## Neo4j connection

The viz connects directly to Neo4j via `neo4j-driver` (Bolt). Queries are filtered by `projectId` if provided.

- `fetchGraphData(projectId?)`: Retrieves the full graph (excluding ScanMeta and Project)
- `fetchProjects()`: Lists available projects

## Color coding

| Element | Color | Meaning |
|---|---|---|
| File node | Cyan (`#06b6d4`) | Source file |
| Function node | Emerald (`#10b981`) | Function, method |
| Class node | Purple (`#a855f7`) | Class, interface, struct, trait |
| CONTAINS edge | Slate (`#334155`) | File contains Function/Class |
| CALLS edge | Amber (`#f59e0b`) | Function call (particles in 3D) |
| DEPENDS_ON edge | Sky dashed (`#0ea5e9`) | Inter-file dependency |
| Impact source | Red (`#ef4444`) | Selected node |
| Impact callee | Amber (`#f59e0b`) | Called functions |
| Impact caller | Blue (`#3b82f6`) | Functions that call |

## Tech Stack

- **React** + **Vite** (fast build)
- **Cytoscape.js** (2D graph)
- **3d-force-graph** / **Three.js** (3D graph)
- **TailwindCSS** (styles)
- **neo4j-driver** (direct connection)

## Setup

```bash
cd packages/viz
pnpm dev
```

Dashboard at **http://localhost:3000**.
