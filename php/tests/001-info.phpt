--TEST--
Bionic\Solver\info() reports build metadata
--EXTENSIONS--
bionic_solver
--FILE--
<?php
$info = Bionic\Solver\info();

$expected = [
    'projectName', 'projectVersion', 'buildType', 'gitHash', 'gitBranch',
    'buildTime', 'platform', 'arch', 'compiler',
];

var_dump(array_keys($info) === $expected);
var_dump($info['projectName']);
var_dump(is_string($info['gitHash']) && $info['gitHash'] !== '');
?>
--EXPECT--
bool(true)
string(13) "bionic-solver"
bool(true)
