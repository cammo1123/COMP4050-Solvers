--TEST--
Bionic\Solver\solve() surfaces an exception thrown by the progress callback
--EXTENSIONS--
bionic_solver
--FILE--
<?php
$request = [
    'boxes' => [['reference' => 'B', 'width' => 1000, 'length' => 1000, 'depth' => 1000]],
    'items' => array_map(fn($i) => [
        'itemCode' => "I$i", 'itemReference' => "R$i",
        'width' => 100, 'length' => 100, 'depth' => 100, 'weight' => 1.0,
    ], range(1, 5)),
];

$calls = 0;
try {
    Bionic\Solver\solve($request, function (int $done, int $total) use (&$calls) {
        $calls++;
        throw new RuntimeException("stop here");
    });
    echo "NO ERROR\n";
} catch (RuntimeException $e) {
    echo "caught: ", get_class($e), ": ", $e->getMessage(), "\n";
}

// The callback raised on its first invocation, so the solve was abandoned
// there and the callback was never asked again.
echo "calls: $calls\n";
echo "still running\n";
?>
--EXPECT--
caught: RuntimeException: stop here
calls: 1
still running
