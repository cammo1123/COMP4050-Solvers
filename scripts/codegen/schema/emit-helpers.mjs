import { INT_RANGES } from './ir.mjs'

/**
 * Converts a schema name to the SCREAMING_SNAKE_CASE used for PHP constants.
 *
 * @param {string} name the schema name, e.g. "PHPSolver"
 * @returns {string} the constant name, e.g. "PHP_SOLVER"
 */
export function toScreamingSnake (name) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toUpperCase()
}

/**
 * Reports whether a field's key may be absent from a request.
 *
 * A guarded field has a default, so an omitted key must leave the domain
 * default alone rather than clear it.
 *
 * @param {{ optional: boolean }} field the resolved field
 * @returns {boolean} true when the key may be absent
 */
export function isGuarded (field) {
	return field.optional
}

/**
 * Returns the numeric range of a scalar field, if it has one.
 *
 * @param {{ scalar?: string }} field the resolved field
 * @returns {{ min: number, max: number, cppMin: string, cppMax: string, label: string }|undefined} the range
 */
export function rangeFor (field) {
	return INT_RANGES[field.scalar]
}
