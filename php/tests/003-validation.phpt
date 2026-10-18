--TEST--
Bionic\Solver\solve() reports invalid input as ValueError with a path
--EXTENSIONS--
bionic_solver
--FILE--
<?php
$cases = [
    'missing boxes'   => ['items' => []],
    'boxes not array' => ['boxes' => 'nope', 'items' => []],
    'unknown algo'    => ['boxes' => [], 'items' => [], 'algorithm' => 'Nope'],
    'nested field'    => ['boxes' => [['width' => 1]], 'items' => []],
    'item not array'  => ['boxes' => [], 'items' => ['nope']],
];

foreach ($cases as $label => $request) {
    try {
        Bionic\Solver\solve($request);
        echo "$label: NO ERROR\n";
    } catch (ValueError $e) {
        echo "$label: ", $e->getMessage(), "\n";
    }
}
?>
--EXPECT--
missing boxes: request.boxes is required
boxes not array: request.boxes must be an array, string given
unknown algo: request.algorithm must be one of ExtremePoint, StackBased, PHPSolver, HeightmapSolver
nested field: request.boxes[0].reference is required
item not array: request.items[0] must be an array, string given
