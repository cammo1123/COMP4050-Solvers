// Shared source-emission helpers. Keeping indentation here prevents individual
// language targets from accumulating subtly different formatting rules.
export function indent (source, level = 1) {
	const prefix = '\t'.repeat(level)
	return source
		.split('\n')
		.map(line => line.length === 0 ? line : prefix + line)
		.join('\n')
}

export function lines (...parts) {
	return parts.flatMap(part => Array.isArray(part) ? part : [part]).join('\n')
}
