# COMP4050-Solvers

## Build

```sh
pnpm install
pnpm build
```

## Development

`pnpm build` automatically regenerates `build/compile_commands.json` after
each build (via the `postbuild` hook). To regenerate it on its own, run:

```sh
pnpm compile-commands
```

- **Autocompletion / IntelliSense** — `build/compile_commands.json` is picked up
  by clangd (the `.clangd` file points at it). Open the project in an editor
  with the clangd extension (VS Code, Neovim, CLion, etc.) and C++ completions
  work out of the box. The database is machine-specific and not committed.
- **Formatting** — `.clang-format` defines the project style (4-space indent,
  Allman braces). Format in place with `pnpm format` or check with
  `pnpm format:check`. Editors that support clang-format will also use
  `.clang-format` automatically.

## Test

Tests use [Vitest](https://vitest.dev/).

```sh
pnpm test          # run the test suite once
pnpm test:watch    # watch mode
```

The suite covers native addon loading, the exported API surface, and the
behaviour of `hello()`. `pnpm typecheck` runs the TypeScript checker over the
tests as well.