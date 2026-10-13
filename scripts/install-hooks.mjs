#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fail, log, repoRoot } from './shared.mjs'

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
	cwd: repoRoot,
	stdio: 'inherit'
})

if (result.error || result.status !== 0) {
	fail('hooks', 'failed to configure core.hooksPath')
}

if (process.platform !== 'win32') {
	fs.chmodSync(path.join(repoRoot, '.githooks', 'pre-commit'), 0o755)
}

log('hooks', 'installed .githooks/pre-commit')
