const native = require('./native.cjs');

let wrapper;

async function solve(input) {
	wrapper ??= import('./dist/addon.js');
	return (await wrapper).solve(input);
}

module.exports = { info: native.info, solve };
