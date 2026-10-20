# Code generation

The authoritative schemas live in [`fbs/`](../../fbs). The generator loads
schema includes, parses a language-neutral IR in `schema/ir.mjs`, and resolves
fields in `schema/analyze.mjs`. Language targets consume that analysis.

## Commands

Run from the repository root:

```sh
node scripts/generate.mjs --help
node scripts/generate.mjs --version
node scripts/generate.mjs
node scripts/generate.mjs fbs/operations/solve.fbs
```

With no schema arguments, all `.fbs` files below `fbs/` are discovered
recursively. Explicit arguments also load their includes. Use full generation
after schema changes: generating only one operation replaces the TypeScript
barrel with symbols from that operation and its includes.

`--version` resolves the compiler and prints its version; it can download the
compiler even though it does not generate bindings. Resolution prefers `flatc`
on `PATH`, otherwise caches FlatBuffers 25.12.19 under `.flatc/25.12.19/`.
The download path needs `curl` and archive extraction tools; platforms without
a configured release asset need `flatc` on `PATH`.

`pnpm build`, `pnpm build:debug`, `pnpm build:optimized`, and `pnpm build:php`
run full generation first. CMake also regenerates C++ and PHP headers when a
schema or generator dependency changes, unless `COMP4050_CODEGEN=OFF` or Node
is unavailable. Commit schema changes and regenerated source bindings together.

## Outputs

| Target | Outputs |
| --- | --- |
| C++ | `src/gen/*_generated.h` (flatc), `*_domain_generated.h` (domain structs and conversions), and operation `*_translation_generated.h` (binary boundary) |
| TypeScript | `node/src/gen/fbs/`, `fbs.ts` barrel, and operation `*_translation.ts` (typed camelCase API and encoding/decoding) |
| PHP | `src/php/gen/*_php_generated.h` (zval readers/writers and enum constants) |

Shared schemas emit types; operation schemas declare `root_type` and emit
request/response translation. The `algorithm_specific_options` attribute
flattens the schema union into keys such as `phpSolverOptions` and
`heightmapSolverOptions` in the public API. TypeScript also emits a discriminated
request type tying these options to `algorithm`.

Do not edit generated files by hand. C++ domain members use standard C++ types,
but their headers include FlatBuffers types and conversion helpers. PHP reads
and writes domain structs directly and sends no FlatBuffers payload at runtime.
Committed generated headers permit CLI/PHP builds without Node when the addon
is disabled; CMake still obtains the FlatBuffers C++ headers.

## Adding a target

Create `targets/<language>.mjs` and register it in `targets/index.mjs`. Targets
implement this interface:

```text
{
  id: string;
  flatcArgs: string[] | null;
  outputDir: string;
  emit(schema, { basename, label, schemaPath, fbsDir, symbols }): string[];
  emitBarrel?(symbols): string | null;
}
```

`emit` writes custom outputs and returns their paths. If `flatcArgs` is non-null,
`runTarget` first invokes flatc with those arguments, the include directory,
output directory, and schema path. `emitBarrel` optionally returns the contents
of `fbs.ts`; the current runner uses that filename for barrel output.

Set `flatcArgs` to `null` when the target consumes IR directly. `php.mjs` uses
this path to generate C++ that bridges PHP zvals to `fbs::domain` structs.
The parser and CLI need no language-specific changes for a new target.
