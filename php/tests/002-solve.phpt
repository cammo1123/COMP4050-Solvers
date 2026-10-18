--TEST--
Bionic\Solver\solve() packs items and returns placements
--EXTENSIONS--
bionic_solver
--FILE--
<?php
$response = Bionic\Solver\solve([
    'boxes' => [
        ['reference' => 'BOX-1', 'width' => 1200, 'length' => 800, 'depth' => 1000, 'outerWidth' => 1250],
    ],
    'items' => [
        ['itemCode' => 'A', 'itemReference' => 'REF-A', 'width' => 400, 'length' => 300, 'depth' => 200, 'weight' => 5.5],
        ['itemCode' => 'B', 'itemReference' => 'REF-B', 'width' => 400, 'length' => 300, 'depth' => 200, 'weight' => 5.5, 'quantity' => 3],
    ],
    'algorithm' => 'ExtremePoint',
    'options' => ['timeoutMs' => 5000],
]);

var_dump(count($response['results']));
var_dump(count($response['failed']));

$box = $response['results'][0];
var_dump($box['boxReference']);
var_dump($box['width'], $box['length'], $box['depth']);
var_dump(count($box['placements']));

// A placement carries the full item definition it was packed from.
$first = $box['placements'][0];
var_dump($first['item']['itemCode'], $first['item']['itemReference']);

// quantity expanded into three instances.
$codes = array_column(array_column($box['placements'], 'item'), 'itemCode');
sort($codes);
var_dump(array_count_values($codes));

var_dump(is_int($response['algorithmUs']), is_int($response['serverUs']));
?>
--EXPECT--
int(1)
int(0)
string(5) "BOX-1"
int(1200)
int(800)
int(1000)
int(4)
string(1) "A"
string(5) "REF-A"
array(2) {
  ["A"]=>
  int(1)
  ["B"]=>
  int(3)
}
bool(true)
bool(true)
