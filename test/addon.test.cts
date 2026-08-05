import assert from 'node:assert/strict';
import addon from '../index.cjs';

const message = addon.hello();
assert.equal(message, 'Hello from the native C++ side!');

console.log(message);
console.log('All tests passed');
