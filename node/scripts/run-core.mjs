#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fail, repoRoot } from './shared.mjs'

const binary = path.join(repoRoot, 'build', 'core', process.platform === 'win32' ? 'solver.exe' : 'solver')

if (!fs.existsSync(binary)) {
	fail("run", `${binary} not found; run "npm run build:core" first`)
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
	fail("run", `failed to run ${binary}: ${result.error.message}`)
}
process.exit(result.status ?? 1)
