# Contributing

## Branching strategy

Three branches matter:

- `main` — **stable**. Never developed on directly. It only ever moves to a
  commit that already exists on `dev` (a fast-forward).
- `dev` — **development**. All feature work lands here. It must always be
  **strictly ahead** of `main`.
- `feature/*` — short-lived branches cut from `dev`, merged back into `dev`
  via a pull request.

### Rules

1. **Only rebase.** Merge commits and squash merges are disabled; history stays
   linear.
2. **Never commit directly to `main` or `dev`.** Everything goes through a pull
   request into `dev`.
3. **Pull requests target `dev`**, never `main`.
4. **Never merge `main` into `dev`.** If `dev` is missing something on `main`,
   re-apply it onto `dev` (e.g. `git cherry-pick`).
5. **`dev` is always ahead.** After every `dev` → `main` promotion, immediately
   add a commit on `dev` (e.g. a version bump).

### Day to day (feature → `dev`)

```sh
git checkout dev && git pull --rebase
git checkout -b feature/my-change
# ... work, commit ...
git fetch origin && git rebase origin/dev
git push -u origin feature/my-change
```

Open a pull request into `dev`, let CI (the `test` workflow) pass, then merge
with **Rebase and merge**.

### Promoting `dev` → `main`

`main` fast-forwards to exactly the commit `dev` points at — no new commits.

```sh
git checkout main
git fetch origin
git merge --ff-only origin/dev   # fails loudly if main is not behind dev
git push origin main
```

Then restore the "dev is ahead" invariant:

```sh
git checkout dev
git commit --allow-empty -m "chore: dev is ahead of main"
git push origin dev
```

### Enforcing it (GitHub settings)

1. Merge button — uncheck "Allow merge commits" and "Allow squash merging",
   check "Allow rebase merging".
2. Protect `dev` — require a PR, require status checks (the `test` workflow),
   require up-to-date branches, block force pushes.
3. Protect `main` — same rule; only a maintainer runs the `--ff-only` promotion.

Working practices: always `git pull --rebase`, delete feature branches after
merge, rebase stale feature branches rather than merging `dev` into them.

## Development

- **IntelliSense** — CMake exports `build/compile_commands.json`; clangd
  picks it up via `.clangd`. Both the addon and core-only builds configure
  into `build/`, so the compilation database is always fresh.
- **Formatting** — `.clang-format` defines the project style (tabs, Allman
  braces). `pnpm lint:fix` applies it; `pnpm lint:check` validates it.
- **Debugging** — **Run > Start Debugging (F5)** rebuilds the standalone binary
  (`build:core`) and points the debugger at `build/solver.exe`.
- **Pre-commit hook** — `pnpm hooks:install` points git at `.githooks/`,
  whose `pre-commit` runs `pnpm precommit` (`lint:check`, `build:ts`, and
  `typecheck`).
- **Dependencies** — Use Node.js 22.12+ and pnpm 12 (the exact version is
  pinned in `packageManager` in `package.json`; Corepack or pnpm itself will
  switch to it). Run `pnpm install` from the
  repository root before building or testing.
- **Build outputs** — `pnpm build` generates bindings, builds the addon, and
  compiles the TypeScript package. The addon is copied to
  `node/build/Release/addon.node`; standalone binaries are written under
  `build/`.

## Testing

```sh
pnpm test          # run the suite once (builds the addon on demand)
pnpm test:watch    # watch mode
pnpm test:php      # run the .phpt suite
pnpm typecheck     # TypeScript checker over src/ and tests
```

The suite covers native addon loading, `info()`, the public typed API, algorithm
dispatch (including `Auto`), per-algorithm behaviour and fixture packings
(`ExtremePoint`, `Guillotine` with golden outputs), progress callbacks, and the `solve()` binary boundary. It also tests
FlatBuffers marshalling, malformed-payload errors at the native layer, and
wrapper-side TypeScript checks.

The PHP suite is `php/tests/*.phpt`, run by `run-tests.php`. See the README for
how to point `pnpm test:php` at a `php` binary and a `run-tests.php`.

### CI

The `test` workflow (`.github/workflows/test.yml`) installs deps, materialises
`flatc` (cached under `.flatc/`), builds the addon with CMake/Ninja, and
runs `pnpm test` on every pull request into `dev` or `main` and every push to
`dev`. The `CI` workflow (`.github/workflows/ci.yml`) runs on every push and
pull request with Clang 22 and additionally enforces `clang-format` and
`clang-tidy` (warnings as errors, `src/php/` excluded), so run
`pnpm lint:check` before pushing. The `prebuild` workflow snapshots the built
binaries and commits them back on pushes to `dev`; the Linux prebuild
is built in the `manylinux_2_28` container so that it stays loadable on older
hosts. The `php` workflow builds the extension and runs the `.phpt` suite across
PHP versions without going through node.

## Generated code

Bindings are generated, committed, and regenerated on `pnpm build` (or by CMake
via `add_custom_command`) whenever a schema or generator changes. Schemas under
`fbs/` and `fbs/operations/` are picked up automatically; file names are not
hardcoded.

- `fbs/types.fbs` contains shared tables and produces
  `src/gen/types_generated.h` and `src/gen/types_domain_generated.h`.
- Operation schemas under `fbs/operations/` produce their own generated C++
  headers, domain headers, translation headers, and TypeScript translation
  layer.
- `scripts/generate.mjs` follows schema includes and runs flatc for both the
  shared and operation schemas.
- The domain header defines pure-C++ structs (no FlatBuffers types) for every
  table, plus `toDomain`/`fromDomain` per type. The core and CLI only ever see
  domain types; FlatBuffers stays at the addon boundary (`decodeRequest`,
  `encodeResponse`).
- The hand-written code (`node/src/addon.ts`, `src/addon.cpp`) only validates
  input and applies the domain transform; marshalling is entirely generated, so
  the schema cannot drift from the code.

### Adding a language

`scripts/codegen/targets/` holds one module per output language. A target is
`{ id, flatcArgs, outputDir, emit(schema, context), emitBarrel? }`; a target
that consumes the parsed IR instead of flatc output sets `flatcArgs` to `null`.
Register it with one line in `targets/index.mjs`. The parser, schema analysis,
and CLI need no changes.

`php.mjs` emits `src/php/gen/*_php_generated.h`: zval readers and writers for
every table and enum, bridging PHP arrays directly onto the C++ domain structs.
That is why the PHP extension needs no FlatBuffers at runtime and why
`src/php/bionic_solver.cpp` contains only module wiring.

Note that a field which is `optional` but not `nullable` — for example
`algorithm: SolveAlgorithm = Auto` — has a default rather than an
optional domain representation. The generated reader must treat its key as
absent-able and leave the domain default alone, rather than clearing it.

### Node independence

The generated headers under `src/gen/` and `src/php/gen/` are committed, so the
CLI and the PHP extension build without node. CMake drops the code-generation
step when node is not on `PATH`, and fails only if a generated header is
actually missing. Pass `-DCOMP4050_CODEGEN=OFF` to build from the committed
headers explicitly.

## Pull Request Checklist

- Update `README.md` or `docs/` when public fields, algorithms, scripts, or
  build behavior changes.
- Update the relevant FlatBuffers schema before changing generated bindings.
- Run `pnpm typecheck`, `pnpm lint:check`, and `pnpm test` locally when the
  required toolchains are available.
- Do not edit generated files manually; regenerate them with `pnpm build`.
