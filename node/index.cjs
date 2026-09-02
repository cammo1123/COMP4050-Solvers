const native = require('./native.cjs');

let wrapper;
let enums;
let decodeInfoResponse;

import('./dist/gen/fbs.js').then(m => { enums = m; });
import('./dist/gen/info_translation.js').then(m => { decodeInfoResponse = m.decodeResponse; });

async function solve(input) {
	wrapper ??= import('./dist/addon.js');
	return (await wrapper).solve(input);
}

function info() {
	return decodeInfoResponse(native.info());
}

module.exports = {
	info,
	solve,
	get SolveAlgorithm() { return enums.SolveAlgorithm; },
	get RotationPolicy() { return enums.RotationPolicy; },
};
