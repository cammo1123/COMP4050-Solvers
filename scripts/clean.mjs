#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { log, repoRoot } from './shared.mjs'

const generatedPaths = [
	'build',
	'src/gen',
	'.flatc',
	'node/build',
	'node/dist',
	'node/src/gen',
]

for (const relativePath of generatedPaths) {
	const target = path.join(repoRoot, relativePath)
	fs.rmSync(target, { recursive: true, force: true })
	log("clean", `removed ${relativePath}`)
}
