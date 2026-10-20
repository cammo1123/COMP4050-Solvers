# Data reference and examples

The public Node.js and PHP APIs use **camelCase** field names. The C++ domain
model and FlatBuffers schemas use snake_case. The authoritative definitions are
[`types.fbs`](../fbs/types.fbs) and [`solve.fbs`](../fbs/operations/solve.fbs);
[`packer_schemas.yaml`](packer_schemas.yaml) mirrors their public data shapes
as OpenAPI components. It describes in-process data, with no HTTP endpoints.
Algorithm-specific behavior and defaults are in the
[root README](../README.md#package-api).

## JSON examples

- [`boxes.json`](boxes.json) supplies sample box types, including an inactive type.
- [`items.json`](items.json) supplies sample items with required weights and
  optional grouping. Dimensions are whole millimetres; weights are kilograms.

From a built checkout, save this as `example.mjs` in the repository root and
run `node example.mjs`:

```js
import { readFile } from "node:fs/promises";
import { solve, SolveAlgorithm } from "@bionic/solver";

const boxes = JSON.parse(await readFile(new URL("./docs/boxes.json", import.meta.url), "utf8"));
const items = JSON.parse(await readFile(new URL("./docs/items.json", import.meta.url), "utf8"));
const response = await solve({ boxes, items, algorithm: SolveAlgorithm.ExtremePoint });
console.log(JSON.stringify(response, null, 2));
```

For PHP, load the compiled extension first and run from the repository root:

```php
$response = Bionic\Solver\solve([
    "boxes" => json_decode(file_get_contents("docs/boxes.json"), true, 512, JSON_THROW_ON_ERROR),
    "items" => json_decode(file_get_contents("docs/items.json"), true, 512, JSON_THROW_ON_ERROR),
    "algorithm" => Bionic\Solver\Algorithm::EXTREME_POINT,
]);
echo json_encode($response, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
```

Each item without `quantity` represents one instance. Non-empty `boxGroup`
values keep different groups apart; they do not force an entire group into
one box. These examples are inputs to the library; the standalone CLI runs
its own compiled demo rather than reading these files.
