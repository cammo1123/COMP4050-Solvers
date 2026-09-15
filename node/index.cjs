const native = require('./native.cjs');
const { decodeResponse } = require('./dist/gen/info_translation.js');
const { RotationPolicy, SolveAlgorithm } = require('./dist/gen/fbs.js');
const addon = require('./dist/addon.js');

function info() {
	return decodeResponse(native.info());
}

module.exports = {
	info,
	solve: addon.solve,
	SolveAlgorithm,
	RotationPolicy,
};