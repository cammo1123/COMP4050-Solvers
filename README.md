# COMP4050-Solvers

## Layout

- **C++ (repo root)** — the core solver logic in `src/`, built by CMake/Ninja:
  - `solvers_core` — static library (`src/solvers.cpp`, `src/solvers.h`)
  - `solvers` — standalone CLI (`src/main.cpp`)
  - `solvers_addon` — Node.js N-API addon (`src/addon.cpp` → `addon.node`)
- **`node/`** — everything JavaScript/npm: `package.json`, `index.cjs`,
  `index.d.cts`, TypeScript types, Vitest tests, and the npm scripts that drive
  CMake. `node-gyp` is not used; CMake builds the addon directly.

## Prerequisites

- CMake >= 3.21 (for presets), Ninja, and a C++17 compiler.
- Node.js (only needed to build the addon; it provides the version/arch used to
  fetch matching headers).
- pnpm for the `node/` package.

## Build (base build system: CMake/Ninja)

All C++ targets in one go:

```sh
cmake --preset debug          # or: cmake -S . -B build/cmake -G Ninja
cmake --build --preset debug
```

Outputs land in `build/cmake/`:

```sh
build/cmake/solvers 21        # standalone binary (Windows adds .exe)
build/cmake/addon.node        # N-API addon
```

The `release` preset builds Release; the `core` presets build only the
standalone binary and skip the addon (and its Node header download):

```sh
cmake --preset core
cmake --build --preset core
```

Pass `-DCOMP4050_BUILD_ADDON=OFF` to disable the addon on any preset. The
addon's first configure downloads the Node headers matching your `node`
version plus `node-addon-api` (cached under `build/cmake/`).

## Node package

All npm tooling lives in `node/`. From the repo root:

```sh
cd node
pnpm install
pnpm build           # CMake build (debug preset) + copy addon.node into build/Release
```

Available scripts:

- `pnpm build` / `pnpm build:release` — build everything, copy `addon.node` for local loading
- `pnpm build:core` — standalone binary only (no addon, no header download)
- `pnpm prebuild:binaries` — copy `addon.node` into `node/prebuilds/<platform>-<arch>/` (used by CI)
- `pnpm test` / `pnpm test:watch` — Vitest suite (native addon loading + API surface)
- `pnpm typecheck` — TypeScript checker over the tests
- `pnpm format` / `pnpm format:check` — clang-format over `src/`

## Development

- **Autocompletion / IntelliSense** — CMake exports `build/cmake/compile_commands.json`;
  clangd picks it up via `.clangd` (VS Code, Neovim, CLion, etc.). The database is
  machine-specific and not committed.
- **Formatting** — `.clang-format` defines the project style (tabs, Allman braces).
  Format with `pnpm format` or let clang-format handle it in your editor.
- **Debugging** — **Run > Start Debugging (F5)** rebuilds the standalone binary
  (`build:core`) and points the debugger at `build/cmake/solvers.exe`.

## Testing

```sh
cd node
pnpm test          # run the test suite once
pnpm test:watch    # watch mode
```

The suite covers native addon loading, the exported API surface, and the
behaviour of `hello()`.
