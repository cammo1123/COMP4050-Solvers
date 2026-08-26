import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fail, findOnPath, log, nodeRoot, repoRoot } from './shared.mjs'

export const FLATC_VERSION = '25.12.19'

const DOWNLOADS = {
	'win32/x64': ['Windows.flatc.binary.zip', 'flatc.exe'],
	'linux/x64': ['Linux.flatc.binary.g++-13.zip', 'flatc'],
	'darwin/arm64': ['Mac.flatc.binary.zip', 'flatc'],
	'darwin/x64': ['MacIntel.flatc.binary.zip', 'flatc'],
}

function run (command, args, options) {
	const result = spawnSync(command, args, options)
	if (result.error) return { status: -1, stdout: '', stderr: result.error.message }
	return { status: result.status ?? -1, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') }
}

function isUsable (binary) {
	if (!binary || !fs.existsSync(binary)) return false
	return run(binary, ['--version']).status === 0
}


function extractArchive(archive, extractDir) {
  fs.mkdirSync(extractDir, { recursive: true })

  const isWindows = process.platform === 'win32'

  if (archive.endsWith('.zip')) {
    if (!isWindows) {
      if (!findOnPath('unzip')) {
        fail(
          'generated',
          '`unzip` is required to extract .zip archives but was not found on PATH'
        )
      }
      const result = run('unzip', ['-o', '-q', archive, '-d', extractDir])
      if (result.status === 0) return result
    }

    // Windows 10+ ships `tar.exe` (bsdtar), which can extract .zip files.
    return run('tar', ['-xf', archive, '-C', extractDir])
  }

  // Handles .tar, .tar.gz, .tgz, etc. on both platforms.
  return run('tar', ['-xf', archive, '-C', extractDir])
}

function downloadAsset (platform, arch) {
	const spec = DOWNLOADS[`${platform}/${arch}`]
	if (!spec) {
		fail("generated", `no flatc release asset known for ${platform}/${arch}; install flatc on PATH instead`)
	}
	const [asset, executable] = spec
	const cacheDir = path.join(nodeRoot, '.flatc', FLATC_VERSION)
	const binary = path.join(cacheDir, executable)
	if (fs.existsSync(binary)) return binary

	const archive = path.join(cacheDir, asset)
	const url = `https://github.com/google/flatbuffers/releases/download/v${FLATC_VERSION}/${asset}`
	log("generate", `downloading ${url}`)
	fs.mkdirSync(cacheDir, { recursive: true })
	const download = run('curl', ['-fL', '--retry', '3', '-o', archive, url])
	if (download.status !== 0) {
		fail("generated", `failed to download ${url}: ${download.stderr.trim() || `curl exited ${download.status}`}`)
	}

	const extractDir = path.join(cacheDir, 'x')
	fs.mkdirSync(extractDir, { recursive: true })
	const extract = extractArchive(archive, extractDir)
	if (extract.status !== 0) {
		fail("generated", `failed to extract ${archive}: ${extract.stderr.trim() || `tar exited ${extract.status}`}`)
	}

	const candidates = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (entry.name === executable) candidates.push(full)
		}
	}
	walk(extractDir)

	const found = candidates[0]
	if (!found || !isUsable(found)) {
		fail("generated", `flatc ${FLATC_VERSION} downloaded from ${url} but could not be executed`)
	}
	try {
		fs.renameSync(found, binary)
	} catch (err) {
		if (err.code !== 'EXDEV') throw err
		fs.copyFileSync(found, binary)
		fs.unlinkSync(found)
	}
	return binary
}

export function resolveFlatc () {
	if (process.env.FLATC_BYPASS_PATH !== '1') {
		const onPath = findOnPath('flatc')
		if (onPath && isUsable(onPath)) return onPath
	}
	return downloadAsset(process.platform, process.arch)
}

export function runFlatc (args) {
	const result = spawnSync(resolveFlatc(), args, { cwd: repoRoot, stdio: 'inherit' })
	if (result.error) fail("generated", `failed to run flatc: ${result.error.message}`)
	if (result.status !== 0) fail("generated", `flatc exited with code ${result.status}`)
}
