#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

const binary = path.join(repoRoot, 'build', 'core', process.platform === 'win32' ? 'solvers.exe' : 'solvers')

if (!fs.existsSync(binary)) {
  console.error(`[run] ${binary} not found; run "pnpm build:core" first`)
  process.exit(1)
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  console.error(`[run] failed to run ${binary}: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
