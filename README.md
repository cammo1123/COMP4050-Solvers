# COMP4050-Solvers

C++ solver core exposed through a Node.js addon. The binary boundary between the
TypeScript wrapper and the native addon is defined by a single FlatBuffers
schema.

## Layout

- **`src/`** — C++ core: solver logic (`solvers.h` / `solvers.cpp`), a
  standalone CLI (`main.cpp`), and the N-API addon (`addon.cpp`).
- **`fbs/`** — FlatBuffers schemas. Each `*.fbs` generates C++ and TypeScript
  bindings, so it is the single source of truth for the binary boundary.
- **`native/gen/`** — generated C++ bindings and translation layer, included by
  the addon.
- **`node/`** — the npm package: TypeScript wrapper, generated TS bindings,
  Vitest tests, and the scripts that drive flatc/CMake.
- **`build/`** — CMake build dirs (`build/core` = standalone binary,
  `build/addon` = addon).

## Prerequisites

- CMake >= 3.18, Ninja, and a C++17 compiler
- Node.js and pnpm
- flatc — optional; a pinned release is downloaded and cached automatically if
  not on `PATH`

## Build

Addon (everything; the first configure fetches Node headers, node-addon-api,
and the header-only FlatBuffers runtime):

```sh
pnpm build
```

Standalone CLI only (no addon; fetches the header-only FlatBuffers runtime):

```sh
pnpm --dir node build:core
# binary: build/core/solvers (solvers.exe on Windows)
```

## Usage

```ts
import addon from "COMP4050-Solvers";
// or: import { hello, solve } from "COMP4050-Solvers";

addon.hello();

addon.solve({
  boxes: [
    { reference: "a1", width: 120, length: 80, depth: 60, maxWeight: 25, active: true },
  ],
});
```

`solve(request)` marshals a `SolveRequest` into a FlatBuffers buffer, runs the
native addon, and returns the decoded `SolveResponse`.

## Testing

```sh
pnpm test        # one-shot run (builds the addon on demand if needed)
pnpm test:watch  # watch mode
pnpm typecheck   # TypeScript checker
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch rules, build details, and
CI workflows.
