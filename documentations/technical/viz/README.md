# @genome/viz

The Visualization Dashboard for GENOME. A React-based web application to interactively explore the codebase knowledge graph.

## Features

- **Graph Explorer**: Visualize nodes and edges using `cytoscape.js`.
- **Direct Connection**: Connects directly to the local Neo4j database via Bolt protocol.
- **Node Inspection**: Click on nodes to see properties in the console (MVP).

## Prerequisites

- **Neo4j**: Must be running locally (usually via Docker).
  - URL: `bolt://localhost:7687`
  - Auth: `neo4j` / `genome_local` (Default)

## Setup

1.  **Install Dependencies**:
    ```bash
    pnpm install
    ```
2.  **Run Development Server**:
    ```bash
    pnpm dev
    ```
3.  **Open Dashboard**:
    Visit `http://localhost:5173`.

## Architecture

- **Frontend**: React, Vite, TailwindCSS.
- **Graph Lib**: `react-cytoscapejs` (Canvas rendering).
- **Data Source**: Neo4j Bolt driver (`neo4j-driver`).
