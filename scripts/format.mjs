#!/usr/bin/env node
//
// Runs clang-format over the project's C/C++ sources (as tracked by git).
// Usage: node scripts/format.mjs            (format in place)
//        node scripts/format.mjs --check    (only report violations)

import { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const check = process.argv.includes('--check')
const cwd = process.cwd()

let files
try {
  files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', cwd })
    .split(/\r?\n/)
    .filter((f) => /\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/.test(f))
} catch {
  // Not a git repo; fall back to walking src/.
  files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(full)
      else if (/\.(c|cc|cpp|cxx|h|hh|hpp|hxx)$/.test(entry.name)) files.push(full)
    }
  }
  if (fs.existsSync('src')) walk('src')
}

if (files.length === 0) {
  console.log('No C/C++ files found in src/.')
  process.exit(0)
}

const args = check ? ['--dry-run', '--Werror', ...files] : ['-i', ...files]
const result = spawnSync('clang-format', args, { cwd, stdio: 'inherit' })

if (result.error) {
  console.error(`Failed to run clang-format: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
