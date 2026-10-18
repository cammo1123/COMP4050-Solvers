#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fail, findOnPath, log, repoRoot } from './shared.mjs'

// run-tests.php ships with the PHP source tree and the Windows SDK rather than
// with a PHP install, so it has to be pointed at explicitly.
const runTests = process.argv[2] ?? process.env.PHP_RUN_TESTS
if (!runTests) {
	fail('test:php', 'pass the path to run-tests.php, or set PHP_RUN_TESTS')
}
if (!fs.existsSync(runTests)) {
	fail('test:php', `run-tests.php not found at ${runTests}`)
}

const php = process.env.PHP_BINARY ?? findOnPath('php')
if (!php) fail('test:php', 'php not found on PATH; set PHP_BINARY')

const isWin = process.platform === 'win32'
const extension = path.join(repoRoot, 'php', isWin ? 'bionic_solver.dll' : 'bionic_solver.so')
if (!fs.existsSync(extension)) {
	fail('test:php', `${extension} not found. Run "pnpm build:php" first.`)
}

// The extension is loaded through an ini scan dir rather than extension_dir so
// that the test run needs no write access to the PHP installation. The PHP
// directory itself must not join the scan dir: on a standard Windows install
// php.ini lives there, so scanning it would load every module a second time.
const iniDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bionic-php-ini-'))
fs.writeFileSync(path.join(iniDir, '20-bionic.ini'), `extension=${extension}\n`)

const separator = isWin ? ';' : ':'
const env = {
	...process.env,
	PHP_INI_SCAN_DIR: [iniDir, process.env.PHP_INI_SCAN_DIR].filter(Boolean).join(separator),
}

log('test:php', `php ${php}`)

// run-tests.php reports a missing extension as a skip and still exits 0, so a
// load failure would otherwise pass silently. Probe the module first, under
// the same ini scan dir the suite will run with.
const probe = spawnSync(php, ['-r', 'exit(extension_loaded("bionic_solver") ? 0 : 1);'], {
	env,
	stdio: 'ignore',
})
if (probe.status !== 0) {
	fs.rmSync(iniDir, { recursive: true, force: true })
	fail('test:php', `${extension} failed to load into ${php}; was it built against this PHP version?`)
}

const result = spawnSync(php, [runTests, '-q', '--show-diff', path.join(repoRoot, 'php', 'tests')], {
	cwd: repoRoot,
	stdio: 'inherit',
	env,
})

fs.rmSync(iniDir, { recursive: true, force: true })
process.exit(result.status ?? 1)
