import assert from 'node:assert/strict';
import addon from '../build/Release/addon.node';

const message = addon.hello();
assert.equal(message, 'Hello from the native C++ side!');

console.log(message);
console.log('All tests passed');
