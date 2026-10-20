import fs from 'node:fs'
import path from 'node:path'
import { runFlatc } from '../flatc.mjs'
import { cppTarget } from './cpp.mjs'
import { phpTarget } from './php.mjs'
import { typescriptTarget } from './typescript.mjs'

export const targets = [cppTarget, typescriptTarget, phpTarget]

/**
 * Runs one code generation target and returns the paths it wrote.
 *
 * A target that consumes the parsed IR on its own emits no flatc output, so
 * flatc is only run for the targets that ask for it.
 *
 * @param {{ flatcArgs: string[]|null, outputDir: string, emit: Function, emitBarrel?: Function }} target the target to run
 * @param {object} schema the parsed schema IR
 * @param {{ fbsDir: string, schemaPath: string, symbols?: object }} context the generation context
 * @returns {string[]} the written paths
 */
export function runTarget (target, schema, context) {
	fs.mkdirSync(target.outputDir, { recursive: true })
	// A target may consume the IR on its own and emit no flatc output.
	if (target.flatcArgs) {
		runFlatc([...target.flatcArgs, '-I', context.fbsDir, '-o', target.outputDir, context.schemaPath])
	}
	const paths = target.emit(schema, context)
	if (target.emitBarrel) {
		const content = target.emitBarrel(context.symbols)
		if (content !== null) fs.writeFileSync(path.join(target.outputDir, 'fbs.ts'), content)
	}
	return paths
}

// A target is an object with this interface:
// {
//   id: string,
//   flatcArgs: string[] | null,           // e.g. ['--cpp', '--gen-object-api']
//   outputDir: string,
//   emit(schema, { basename, label }): string[], // returns written paths
//   emitBarrel?(symbols): string | null,  // e.g. TS fbs.ts
// }
