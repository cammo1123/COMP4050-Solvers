import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const nodeRoot = path.resolve(__dirname, '..')
export const repoRoot = path.resolve(nodeRoot, '..')

export const CPP_OUT = path.join(repoRoot, 'native', 'gen')
export const TS_OUT = path.join(nodeRoot, 'src', 'gen')
export const FBS_DIR = path.join(repoRoot, 'fbs')

export function fail (message) {
	console.error(`[generate] ${message}`)
	process.exit(1)
}
