import fs from 'node:fs'
import path from 'node:path'
import { runFlatc } from '../flatc.mjs'
import { cppTarget } from './cpp.mjs'
import { typescriptTarget } from './typescript.mjs'

export const targets = [cppTarget, typescriptTarget]

export function runTarget (target, schema, context) {
	fs.mkdirSync(target.outputDir, { recursive: true })
	runFlatc([...target.flatcArgs, '-I', context.fbsDir, '-o', target.outputDir, context.schemaPath])
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
//   flatcArgs: string[],                 // e.g. ['--cpp', '--gen-object-api']
//   outputDir: string,
//   emit(schema, { basename, label }): string[], // returns written paths
//   emitBarrel?(symbols): string | null,  // e.g. TS fbs.ts
// }
