import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../../helpers.ts';

function shellSingleQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function createDispatchFixture(body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const pythonFixture = body.match(/^\s*python3 - "\$TASK_PATH" <<'PY'\n([\s\S]*)\nPY\s*$/);
  if (pythonFixture) {
    const pythonPath = path.join(fixtureRoot, 'dispatch.py');
    fs.writeFileSync(pythonPath, pythonFixture[1]);
    fs.writeFileSync(
      dispatchPath,
      `#!/usr/bin/env bash
set -euo pipefail
TASK_PATH="$1"
exec python3 ${shellSingleQuote(pythonPath)} "$TASK_PATH"
`,
      { mode: 0o755 },
    );
    return { fixtureRoot, dispatchPath };
  }
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

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

export {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
};
