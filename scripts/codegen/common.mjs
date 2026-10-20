// Shared source-emission helpers. Keeping indentation here prevents individual
// language targets from accumulating subtly different formatting rules.

/**
 * Indents every non-empty line of a source block by the given number of tabs.
 *
 * @param {string} source the block to indent
 * @param {number} [level] how many tabs to prefix each line with
 * @returns {string} the indented block
 */
export function indent (source, level = 1) {
	const prefix = '\t'.repeat(level)
	return source
		.split('\n')
		.map(line => line.length === 0 ? line : prefix + line)
		.join('\n')
}

/**
 * Joins source fragments into a single block of lines.
 *
 * Arrays are flattened, so a list of lines and a list of blocks can be mixed
 * freely.
 *
 * @param {...(string|string[])} parts the fragments to join
 * @returns {string} the joined block
 */
export function lines (...parts) {
	return parts.flatMap(part => Array.isArray(part) ? part : [part]).join('\n')
}
