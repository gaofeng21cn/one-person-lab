import { fs, os, path } from '../helpers.ts';

export function createDispatchFixture(body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
TASK_PATH="$1"
${body}
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, dispatchPath };
}

export function createJsonExportFixture(payload: Record<string, unknown>) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-'));
  const exportPath = path.join(fixtureRoot, 'export.mjs');
  fs.writeFileSync(
    exportPath,
    `process.stdout.write(${JSON.stringify(`${JSON.stringify(payload)}\n`)});\n`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath: `${process.execPath} ${exportPath}` };
}

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}
