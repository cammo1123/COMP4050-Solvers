# COMP4050-Solvers

## Layout

- **C++ (repo root)** — the core solver logic in `src/`, built by CMake/Ninja:
  - `solvers_core` — static library (`src/solvers.cpp`, `src/solvers.h`)
  - `solvers` — standalone CLI (`src/main.cpp`)
  - `solvers_addon` — Node.js N-API addon (`src/addon.cpp` → `addon.node`)
- **`node/`** — everything JavaScript/npm: `package.json`, `index.cjs`,
  `index.d.cts`, TypeScript types, Vitest tests, and the npm scripts that drive
  CMake. `node-gyp` is not used; CMake builds the addon directly.

## Branching strategy

Three branches matter:

- `main` — **stable**. Never developed on directly. It only ever moves to a
  commit that already exists on `dev` (a fast-forward).
- `dev` — **development**. All feature work lands here. It must always be
  **strictly ahead** of `main`: everything on `main` is also on `dev`, plus
  more. It is never allowed to fall behind `main`.
- `feature/*` — short-lived branches cut from `dev`, merged back into `dev`
  via a pull request.

### Rules

1. **Only rebase.** Merge commits and squash merges are disabled; the only
   merge button is "Rebase and merge". History stays linear.
2. **Never commit directly to `main` or `dev`.** Everything goes through a
   pull request into `dev`.
3. **Pull requests target `dev`**, never `main`. `main` only ever receives
   `dev` itself, and only occasionally (releases).
4. **Never merge `main` into `dev`.** If `dev` is missing something that is on
   `main`, the invariant was broken — fix it by re-applying that commit onto
   `dev` (e.g. `git cherry-pick`), not by merging.
5. **`dev` is always ahead.** After every `dev` → `main` promotion, immediately
   add a commit on `dev` (e.g. a version bump) so it is strictly ahead again.

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

### Promoting `dev` → `main` (occasional)

Because `dev` is always ahead, the promotion is a **fast-forward**: `main`
moves to exactly the commit `dev` points at, no new commits are created, and
`dev` keeps its history.

Do **not** use the "Rebase and merge" button for this. GitHub's rebase-and-merge
rewrites commit SHAs even when a fast-forward is possible, which would leave
`dev` "behind" `main` (two branches with equivalent but different commits).
Fast-forward from the command line instead:

```sh
git checkout main
git fetch origin
git merge --ff-only origin/dev   # fails loudly if main is not behind dev
git push origin main
```

Then restore the "dev is ahead" invariant immediately:

```sh
git checkout dev
git commit --allow-empty -m "chore: dev is ahead of main"
git push origin dev
```

### Enforcing it (GitHub settings)

1. **Merge button** — Settings → General → Pull requests: uncheck "Allow merge
   commits" and "Allow squash merging", check "Allow rebase merging". That makes
   rebase the only merge method.
2. **Protect `dev`** — Settings → Branches → rule for `dev`:
   - Require a pull request before merging.
   - Require status checks to pass before merging (the `test` workflow).
   - Require branches to be up to date before merging.
   - Block force pushes (never rewrite `dev` history).
3. **Protect `main`** — the same rule for `main`, plus only a maintainer with
   push rights runs the `--ff-only` promotion. Block force pushes.

Working practices that keep the model intact:

- Always `git pull --rebase`, never a plain `git pull` (it creates merge commits).
- Delete a feature branch once its PR merges.
- If a PR into `dev` is behind, rebase the feature branch onto the latest `dev`
  again and force-push *it* — never open a PR from `dev` into the feature branch.

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

### CI

The `test` workflow (`.github/workflows/test.yml`) installs deps, builds the
addon with CMake/Ninja, and runs `pnpm test` on every pull request into `dev`
or `main` and on every push to `dev`. Add it as a required status check on
`dev` and `main` so nothing unreviewed or failing can merge.
