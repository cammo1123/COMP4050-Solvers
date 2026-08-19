import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const nodeRoot = path.resolve(__dirname, '..')
export const repoRoot = path.resolve(nodeRoot, '..')

export const CPP_OUT = path.join(repoRoot, 'native', 'gen')
export const TS_OUT = path.join(nodeRoot, 'src', 'gen')
export const FBS_DIR = path.join(repoRoot, 'fbs')

export function fail(prefix, message) {
	console.error(`[ ${prefix.padEnd(9) }] ${message}`)
	process.exit(1)
}

export function log(prefix, message) {
	console.log(`[ ${prefix.padEnd(9) }] ${message}`)
}

export function warn(prefix, message) {
	console.warn(`[ ${prefix.padEnd(9) }] ${message}`)
}

export function findOnPath(name) {
	const found = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8' })
	if (found.status === 0 && found.stdout) {
		return found.stdout.split(/\r?\n/)[0].trim()
	}
	return undefined
}
