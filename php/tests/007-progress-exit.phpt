--TEST--
Bionic\Solver\solve() ends the request when the progress callback calls exit()
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

Bionic\Solver\solve($request, function (int $done, int $total) {
    exit("bye");
});

echo "NOT REACHED\n";
?>
--EXPECT--
bye
