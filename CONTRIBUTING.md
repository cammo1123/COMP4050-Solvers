# Contributing

## Branching strategy

Three branches matter:

- `main` — **stable**. Never developed on directly. It only ever moves to a
  commit that already exists on `dev` (a fast-forward).
- `dev` — **development**. All feature work lands here. It must always be
  **strictly ahead** of `main`, except during the promotion steps below.
- `feature/*` — short-lived branches cut from `dev`, merged back into `dev`
  via a pull request.

### Rules

1. **Only rebase.** Merge commits and squash merges are disabled; history stays
   linear.
2. **Feature changes go through a pull request into `dev`.** The maintainer
   promotion procedure below and the prebuild workflow are exceptions: promotion
   fast-forwards `main`, and the workflow commits generated artifacts to `dev`.
3. **Pull requests target `dev`**, never `main`.
4. **Never merge `main` into `dev`.** If `dev` is missing something on `main`,
   re-apply it onto `dev` (e.g. `git cherry-pick`).
5. **Restore `dev` ahead after promotion.** The branches briefly point to the
   same commit during promotion; immediately add a commit on `dev` afterward.

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
3. Protect `main` — restrict writes to the maintainer promotion path and block
   force pushes. Permit that path to fast-forward `main`; a blanket PR-only rule
   without a bypass would block the promotion commands above.
4. The prebuild workflow writes generated artifacts directly to `dev`. Ensure
   branch rules permit that automation if using the checked-in workflow.

Working practices: always `git pull --rebase`, delete feature branches after
merge, rebase stale feature branches rather than merging `dev` into them.

## Development

Follow the [README build requirements](README.md#requirements). Install with
`pnpm install --frozen-lockfile`, then run `pnpm build`.

- **IntelliSense** — CMake exports `build/compile_commands.json`; clangd
  picks it up via `.clangd`. Both the addon and core-only builds configure
  into `build/`, so the compilation database is always fresh.
- **Formatting** — `.clang-format` defines the project style (tabs, Allman
  braces). `pnpm lint:fix` applies it; `pnpm lint:check` validates it.
- **Debugging** — The checked-in VS Code tasks target Windows with `clang-cl`;
  **Run > Start Debugging (F5)** builds a Debug standalone binary and launches
  `build/solver.exe`. On Linux/macOS, adapt the compiler and executable path
  to the local toolchain.
- **Dependencies** — Use Node.js >=22.12 and pnpm 11 or newer. Run
  `pnpm install --frozen-lockfile` from the repository root before building or testing.
- **Build outputs** — `pnpm build` generates bindings, builds the addon, and
  compiles the TypeScript package. The addon is copied to
  `node/build/Release/addon.node`; standalone binaries are written under
  `build/`.

### Optional Git hook

`pnpm hooks:install` sets `core.hooksPath` to `.githooks`. The pre-commit hook
runs `pnpm precommit`: C++ formatting validation, TypeScript compilation, and
type checking. It does not run the native test suite. Hooks are installed only
when you run this command.

## Testing

```sh
pnpm test          # run the suite once (builds the addon on demand)
pnpm test:watch    # watch mode
pnpm test:php php/run-tests.php # run the .phpt suite (after pnpm build:php)
pnpm typecheck     # TypeScript checker over src/ and tests
```

The suite covers native addon loading, `info()`, the public typed API, algorithm
dispatch, progress callbacks, and the `solve()` binary boundary. It also tests
FlatBuffers marshalling, malformed-payload errors at the native layer, and
wrapper-side TypeScript checks.

The PHP suite is `php/tests/*.phpt`, run by `php/run-tests.php`. See the
[README](README.md#testing-and-checks) for PHP binary and runner overrides.
The upstream CSV fixture test is skipped when the sibling
`../BoxPacker/tests/data/{boxes,items}.csv` files are absent; bundled JSON
fixtures remain available.

### CI

The `test` workflow (`.github/workflows/test.yml`) installs deps, materialises
`flatc` (cached under `.flatc/`), builds the addon with CMake/Ninja, and
runs `pnpm test` on every pull request into `dev` or `main` and every push to
`dev`. The `prebuild` workflow snapshots the built binaries; the Linux prebuild
is built in the `manylinux_2_28` container so that it stays loadable on older
hosts. The `php` workflow builds the extension and runs the `.phpt` suite across
non-thread-safe PHP 8.3–8.5 (excluding Windows PHP 8.3) without going through
Node. The separate `CI` workflow (`.github/workflows/ci.yml`) runs on all pushes
and pull requests on Ubuntu: it checks formatting, runs the Node tests, and
runs clang-tidy with Clang 22 on non-PHP C++ sources. The PHP workflow runs
clang-tidy on the extension translation unit on Linux.

The shared setup action currently pins pnpm 11.21.0 and Node.js 22; `CI` uses
pnpm 10 and Node.js 22. These workflow pins differ from the recommended local
pnpm 11 toolchain.

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
- Domain headers define structs with standard C++ member types, plus
  `toDomain`/`fromDomain` conversions. They include FlatBuffers headers; the core
  and CLI consume domain structs while binary marshalling stays at the addon
  boundary (`decodeRequest`, `encodeResponse`).
- The TypeScript wrapper handles progress and timing, and the native addon
  queues work and translates errors. Schema marshalling is generated; schema
  changes require regeneration to keep committed outputs current.

### Adding a language

`scripts/codegen/targets/` holds one module per output language. A target is
`{ id, flatcArgs, outputDir, emit(schema, context), emitBarrel? }`; a target
that consumes the parsed IR instead of flatc output sets `flatcArgs` to `null`.
Register it with one line in `targets/index.mjs`. The parser, schema analysis,
and CLI need no changes.

`php.mjs` emits `src/php/gen/*_php_generated.h`: zval readers and writers for
every table and enum, bridging PHP arrays directly onto the C++ domain structs.
That is why the PHP extension needs no FlatBuffers at runtime and why
`src/php/bionic_solver.cpp` handles module wiring, progress callbacks, timing,
and exception translation.

See [the code generation guide](scripts/codegen/README.md) for commands and
output paths.

Note that a field which is `optional` but not `nullable` — for example
`algorithm: SolveAlgorithm = ExtremePoint` — has a default rather than an
optional domain representation. The generated reader must treat its key as
absent-able and leave the domain default alone, rather than clearing it.

### Node independence

The generated headers under `src/gen/` and `src/php/gen/` are committed, so the
CLI and the PHP extension build without Node when the addon target is disabled
(`-DCOMP4050_BUILD_ADDON=OFF`). CMake still downloads the FlatBuffers C++
headers on a fresh build, so Node independence does not imply an offline
build. CMake drops the code-generation step when Node is not on `PATH`, and
fails if a required generated header is missing. Pass `-DCOMP4050_CODEGEN=OFF` to build from the committed
headers explicitly.

## Pull Request Checklist

- Update `README.md` or `docs/` when public fields, algorithms, scripts, or
  build behavior changes.
- Update the relevant FlatBuffers schema before changing generated bindings.
- Run `pnpm typecheck`, `pnpm lint:check`, and `pnpm test` locally when the
  required toolchains are available.
- Do not edit generated files manually; regenerate them with `pnpm build`.
