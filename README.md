# COMP4050-Solvers

## Layout

- **`src/`** — C++ solver logic. Built by CMake/Ninja into:
  - `solvers_core` — static library (`solvers.cpp`, `solvers.h`)
  - `solvers` — standalone CLI (`main.cpp`)
  - `solvers_addon` — Node.js N-API addon (`addon.cpp` → `addon.node`)
- **`fbs/doublevalue.fbs`** — FlatBuffers IDL schema. Single source of truth for
  the binary boundary between the addon and the TypeScript wrapper.
- **`native/gen/`** — generated C++ bindings and translation layer, included by
  the addon.
- **`node/`** — the npm package: TS sources + generated bindings, Vitest tests,
  and the scripts that drive CMake. `node-gyp` is not used; CMake builds the
  addon directly.
- **`build/addon`** / **`build/core`** — CMake build dirs (addon enabled /
  addon disabled).

## Binary interface

`node/src/addon.ts` ↔ `src/addon.cpp` talk through a single binary boundary:

- `doubleValue(buf: Buffer): Buffer` — the TS wrapper encodes a
  `DoubleValueRequest` to a FlatBuffers buffer, passes it to the native addon,
  and decodes the `DoubleValueResponse` buffer.
- `hello()` — returns the greeting string.

`version` is `short` (int16) in the schema and is range-checked in **both** the
TypeScript wrapper and the C++ addon.

### Generated translation layers

`node/scripts/generate.mjs` generates the flatc bindings (C++ object API and TS
object API) plus a translation layer on each side that marshals between plain
objects/structs and the FlatBuffers buffer:

- **TypeScript** — `node/src/gen/doublevalue_translation.ts` exposes
  `encodeRequest()` / `decodeResponse()` plus the structural types.
- **C++** — `native/gen/doublevalue_translation_generated.h` exposes
  `decodeRequest()` / `encodeResponse()`.

The hand-written files (`node/src/addon.ts`, `src/addon.cpp`) only validate
input and apply the domain transform; marshalling is entirely generated, so the
schema cannot drift from the code. Generated code is committed but regenerated
on `pnpm build` or automatically by CMake (`add_custom_command`) whenever the
schema or generator changes.

### Why FlatBuffers

Header-only C++ runtime (no `libprotobuf` to link), zero-copy access, and a
single `.fbs` file generating both sides. `flatc` is only needed at codegen
time; it is used from PATH when present, otherwise a pinned release is
downloaded into `node/.flatc/`.

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

## Prerequisites

- CMake >= 3.18, Ninja, and a C++17 compiler.
- Node.js (to build the addon) and pnpm for the `node/` package.
- flatc (FlatBuffers compiler) — optional if a pinned download works on your
  platform; otherwise install it (e.g. `brew install flatbuffers` or from the
  FlatBuffers GitHub releases) and add it to `PATH`.

## Build

Core (standalone binary only):

```sh
cmake -S . -B build/core -DCOMP4050_BUILD_ADDON=OFF
cmake --build build/core
build/core/solvers 21
```

Addon (builds everything; first configure downloads Node headers,
node-addon-api, and the header-only FlatBuffers runtime):

```sh
cmake -S . -B build/addon
cmake --build build/addon
build/addon/addon.node
```

## Node package

From the repo root:

```sh
cd node
pnpm install
pnpm build           # IDL codegen + CMake build (addon target) + copy addon.node into build/Release
```

Available scripts:

- `pnpm build` — regenerate the IDL and build the addon target
- `pnpm build:core` — standalone binary only (no addon, no header download)
- `pnpm prebuild:binaries` — snapshot `build/addon/addon.node` into
  `node/prebuilds/<platform>-<arch>/` (used by CI)
- `pnpm test` / `pnpm test:watch` — Vitest suite; builds the addon on demand if
  no built/prebuilt `addon.node` exists
- `pnpm typecheck` — TypeScript checker over `src/` and the tests
- `pnpm format` / `pnpm format:check` — clang-format over `src/`

## Development

- **IntelliSense** — CMake exports `build/*/compile_commands.json`; clangd
  picks it up via `.clangd`.
- **Formatting** — `.clang-format` defines the project style (tabs, Allman
  braces).
- **Debugging** — **Run > Start Debugging (F5)** rebuilds the standalone binary
  (`build:core`) and points the debugger at `build/core/solvers.exe`.

## Testing

```sh
cd node
pnpm test          # run the test suite once
pnpm test:watch    # watch mode
```

The suite covers native addon loading, `hello()`, and the `doubleValue()`
binary boundary: doubling semantics, Buffer/non-Buffer and malformed-payload
errors at the native boundary, and int16 version enforcement in the TypeScript
wrapper.

### CI

The `test` workflow (`.github/workflows/test.yml`) installs deps, materialises
`flatc` (cached under `node/.flatc/`), builds the addon with CMake/Ninja, and
runs `pnpm test` on every pull request into `dev` or `main` and every push to
`dev`. The `prebuild` workflow does the same across Ubuntu/macOS/Windows and
snapshots the built binaries.
