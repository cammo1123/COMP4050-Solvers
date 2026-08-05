import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const PACKAGE_DIR = resolve(import.meta.dirname, '..');

function describeBuild() {
  const hasBuildDir = existsSync(resolve(PACKAGE_DIR, 'build', 'Release'));
  const hasPrebuilds = existsSync(resolve(PACKAGE_DIR, 'prebuilds'));
  const detail = hasBuildDir
    ? 'A local build exists in node/build/Release.'
    : hasPrebuilds
      ? 'Committed prebuilds exist in node/prebuilds/.'
      : 'No build output was found at all.';

  return [
    detail,
    '',
    'The native addon could not be loaded. To build it locally run:',
    '',
    '  cd node',
    '  pnpm install',
    '  pnpm build',
    '',
  ].join('\n');
}

try {
  require('../index.cjs');
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  throw new Error(`Failed to load the native addon: ${message}\n\n${describeBuild()}`);
}
