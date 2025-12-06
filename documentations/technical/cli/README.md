# @genome/cli

The command-line interface for the GENOME system.

## Installation

```bash
pnpm add -g @genome/cli
# or run locally
pnpm run dev
```

## Commands

### `genome init`
Initializes a `genome.config.ts` in the current directory.

```bash
genome init
```

### `genome scan <path>`
Scans the specified directory, parses supported files, and ingests them into the configured graph database.

```bash
genome scan . --language typescript
```

- **Arguments**:
  - `<path>`: Root directory to scan.
- **Options**:
  - `--language`: Language to use (default: `typescript`).

### `genome status`
Checks the connection to the Neo4j database and displays graph statistics (node counts, edge counts).

```bash
genome status
```

### `genome impact <symbol>`
Performs impact analysis on a specific symbol (function, class) to find what depends on it.

```bash
genome impact "AuthService" --depth 5
```

## Architecture

The CLI uses `commander` for argument parsing and delegating logic to the core services (`parser`, `graph`). It includes a robust error handling wrapper and structured logging via `pino`.
