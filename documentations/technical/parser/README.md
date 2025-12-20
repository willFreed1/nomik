# @genome/parser

Intelligence engine responsible for converting source code into nodes and edges for the knowledge graph.

## Supported languages

| Language | Grammar | Extensions | Extractors |
|---|---|---|---|
| TypeScript | `tree-sitter-typescript` | `.ts`, `.tsx` | functions, classes, imports, exports, routes, calls |
| JavaScript | `tree-sitter-typescript` | `.js`, `.jsx`, `.mjs`, `.cjs` | functions, classes, imports, exports, routes, calls |
| Python | `tree-sitter-python` | `.py`, `.pyw` | functions, classes, imports, calls |
| Rust | `tree-sitter-rust` | `.rs` | functions, structs/enums/traits, use, calls |
| Markdown | Custom parser (regex) | `.md` | sections (h1-h6 headings, truncated content) |

Tree-sitter grammars are loaded on demand via `src/languages/registry.ts`.

## Architecture

```mermaid
graph LR
    File -->|Read| TreeSitter
    TreeSitter -->|AST| Extractors
    Extractors -->|Nodes+Edges| Pipeline
    Pipeline -->|Result| Output
```

## Extractors

### TypeScript / JavaScript (`src/extractors/`)

| Extractor | File | Produces |
|---|---|---|
| Functions | `functions.ts` | `FunctionNode` (params, returnType, async, decorators) |
| Classes | `classes.ts` | `ClassNode` (extends, implements, methods, properties) |
| Imports | `imports.ts` | `ImportInfo` (source, specifiers, isDynamic) |
| Exports | `exports.ts` | `ExportInfo` (name, isDefault) |
| Routes | `routes.ts` | `RouteNode` (method, path, handler, middleware) |
| Calls | `calls.ts` | `CallInfo` (callerName, calleeName, line, column) |

### Python (`src/extractors/python.ts`)

Extracts: functions (with typed parameters, without self/cls), classes (with inheritance), imports (`import` and `from...import`), function calls.

### Rust (`src/extractors/rust.ts`)

Extracts: functions (`fn`, `pub fn`, `async fn`), structs (fields), enums (variants), traits (as abstract classes), `use` declarations, function calls.

### Markdown (`src/extractors/markdown.ts`)

Extracts: sections (h1-h6 headings), content truncated to 500 characters per section. Each section becomes a `FunctionNode` contained in a `FileNode`.

## Produced types

- `FunctionNode`: id, name, filePath, startLine, endLine, params (`ParameterInfo[]`), returnType, isAsync, isExported, isGenerator, decorators, confidence
- `ClassNode`: id, name, filePath, startLine, endLine, isExported, isAbstract, superClass, interfaces, decorators, methods, properties
- `ImportInfo`: source, specifiers, isDefault, isDynamic, isTypeOnly, line
- `CallInfo`: callerName, calleeName, line, column, isMethodCall, isConstructor
- `RouteNode`: id, method, path, handlerName, filePath, middleware

## Discovery (`src/discovery.ts`)

Discovers supported files in a directory via `glob`, respects include/exclude patterns from configuration.

## Tests

- `python.test.ts`: 8 tests (functions, classes, imports, calls)
- `rust.test.ts`: 8 tests (functions, structs, enums, traits, imports, calls)
- `markdown.test.ts`: 7 tests (sections, edges, empty file, levels)
- `discovery.test.ts`: 6 tests (glob, exclusions, markdown)
- `utils.test.ts`: 7 tests (hash, node ID)
