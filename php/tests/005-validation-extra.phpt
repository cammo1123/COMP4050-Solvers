--TEST--
Bionic\Solver\solve() validates onProgress up front and rejects padded enum names
--EXTENSIONS--
bionic_solver
--FILE--
<?php
$request = [
    'boxes' => [['reference' => 'B', 'width' => 1000, 'length' => 1000, 'depth' => 1000]],
    'items' => [[
        'itemCode' => 'A', 'itemReference' => 'REF-A',
        'width' => 100, 'length' => 100, 'depth' => 100, 'weight' => 1.0,
    ]],
];

// A value that is not callable is a TypeError raised while the arguments are
// parsed, not a surprise at the first progress tick.
foreach (['nope', 42, ['nope']] as $bad) {
    try {
        Bionic\Solver\solve($request, $bad);
        echo "NO ERROR\n";
    } catch (TypeError $e) {
        echo get_class($e), "\n";
    }
}

// null still means "no callback".
$response = Bionic\Solver\solve($request, null);
var_dump(count($response['results']));

// An enum name is matched on its exact length, so a trailing NUL byte does
// not pass as a valid name.
try {
    Bionic\Solver\solve($request + ['algorithm' => "ExtremePoint\0junk"]);
    echo "NO ERROR\n";
} catch (ValueError $e) {
    echo $e->getMessage(), "\n";
}
?>
--EXPECT--
TypeError
TypeError
TypeError
int(1)
request.algorithm must be one of ExtremePoint, StackBased, PHPSolver, Guillotine, Auto
