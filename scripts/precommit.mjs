#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fail, repoRoot } from './shared.mjs'

function run(command, args) {
	const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' })
	if (result.error) fail('pre-commit', `${command} failed: ${result.error.message}`)
	if (result.status !== 0) fail('pre-commit', `${command} exited with code ${result.status}`)
}

function runPnpm(args) {
	if (process.platform === 'win32') {
		run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`])
		return
	}
	run('pnpm', args)
}

runPnpm(['run', 'lint:check'])
runPnpm(['run', 'build:ts'])
