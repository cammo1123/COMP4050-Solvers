import { INT_RANGES } from './ir.mjs'

export function toScreamingSnake (name) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.toUpperCase()
}

export function isGuarded (field) {
	return field.optional
}

export function rangeFor (field) {
	return INT_RANGES[field.scalar]
}
