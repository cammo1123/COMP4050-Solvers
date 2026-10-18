--TEST--
Bionic\Solver\solve() invokes onProgress and surfaces core exceptions
--EXTENSIONS--
bionic_solver
--FILE--
<?php
$seen = [];
Bionic\Solver\solve([
    'boxes' => [['reference' => 'B', 'width' => 1000, 'length' => 1000, 'depth' => 1000]],
    'items' => array_map(fn($i) => [
        'itemCode' => "I$i", 'itemReference' => "R$i",
        'width' => 100, 'length' => 100, 'depth' => 100, 'weight' => 1.0,
    ], range(1, 5)),
], function (int $done, int $total) use (&$seen) {
    $seen[] = "$done/$total";
});

var_dump(count($seen) > 0);
var_dump(end($seen));
var_dump(str_ends_with(end($seen), '/5'));

// A C++ exception from the core becomes Bionic\Solver\Exception, not a crash.
try {
    Bionic\Solver\solve([
        'boxes' => [['reference' => 'B', 'width' => 10, 'length' => 10, 'depth' => 10]],
        'items' => [[
            'itemCode' => 'X', 'itemReference' => 'RX',
            'width' => 1, 'length' => 1, 'depth' => 1, 'weight' => 1,
            'quantity' => 2000000,
        ]],
    ]);
    echo "NO ERROR\n";
} catch (Bionic\Solver\Exception $e) {
    echo "caught: ", $e->getMessage(), "\n";
}

echo "still running\n";
?>
--EXPECTF--
bool(true)
string(%d) "%d/5"
bool(true)
caught: %s1000000 instances
still running
