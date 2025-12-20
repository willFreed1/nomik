# @genome/parser

Moteur d'intelligence responsable de la conversion du code source en noeuds et edges pour le knowledge graph.

## Langages supportes

| Langage | Grammaire | Extensions | Extracteurs |
|---|---|---|---|
| TypeScript | `tree-sitter-typescript` | `.ts`, `.tsx` | functions, classes, imports, exports, routes, calls |
| JavaScript | `tree-sitter-typescript` | `.js`, `.jsx`, `.mjs`, `.cjs` | functions, classes, imports, exports, routes, calls |
| Python | `tree-sitter-python` | `.py`, `.pyw` | functions, classes, imports, calls |
| Rust | `tree-sitter-rust` | `.rs` | functions, structs/enums/traits, use, calls |
| Markdown | Parser custom (regex) | `.md` | sections (titres h1-h6, contenu tronque) |

Les grammaires Tree-sitter sont chargees a la demande via `src/languages/registry.ts`.

## Architecture

```mermaid
graph LR
    File -->|Read| TreeSitter
    TreeSitter -->|AST| Extractors
    Extractors -->|Nodes+Edges| Pipeline
    Pipeline -->|Result| Output
```

## Extracteurs

### TypeScript / JavaScript (`src/extractors/`)

| Extracteur | Fichier | Produit |
|---|---|---|
| Functions | `functions.ts` | `FunctionNode` (params, returnType, async, decorators) |
| Classes | `classes.ts` | `ClassNode` (extends, implements, methods, properties) |
| Imports | `imports.ts` | `ImportInfo` (source, specifiers, isDynamic) |
| Exports | `exports.ts` | `ExportInfo` (name, isDefault) |
| Routes | `routes.ts` | `RouteNode` (method, path, handler, middleware) |
| Calls | `calls.ts` | `CallInfo` (callerName, calleeName, line, column) |

### Python (`src/extractors/python.ts`)

Extrait : fonctions (avec parametres types, sans self/cls), classes (avec heritage), imports (`import` et `from...import`), appels de fonctions.

### Rust (`src/extractors/rust.ts`)

Extrait : fonctions (`fn`, `pub fn`, `async fn`), structs (champs), enums (variantes), traits (comme classes abstraites), `use` declarations, appels de fonctions.

### Markdown (`src/extractors/markdown.ts`)

Extrait : sections (titres h1-h6), contenu tronque a 500 caracteres par section. Chaque section devient un `FunctionNode` contenu dans un `FileNode`.

## Types produits

- `FunctionNode` : id, name, filePath, startLine, endLine, params (`ParameterInfo[]`), returnType, isAsync, isExported, isGenerator, decorators, confidence
- `ClassNode` : id, name, filePath, startLine, endLine, isExported, isAbstract, superClass, interfaces, decorators, methods, properties
- `ImportInfo` : source, specifiers, isDefault, isDynamic, isTypeOnly, line
- `CallInfo` : callerName, calleeName, line, column, isMethodCall, isConstructor
- `RouteNode` : id, method, path, handlerName, filePath, middleware

## Discovery (`src/discovery.ts`)

Decouvre les fichiers supportes dans un repertoire via `glob`, respecte les patterns include/exclude de la configuration.

## Tests

- `python.test.ts` : 8 tests (fonctions, classes, imports, calls)
- `rust.test.ts` : 8 tests (fonctions, structs, enums, traits, imports, calls)
- `markdown.test.ts` : 7 tests (sections, edges, fichier vide, niveaux)
- `discovery.test.ts` : 6 tests (glob, exclusions, markdown)
- `utils.test.ts` : 7 tests (hash, node ID)
