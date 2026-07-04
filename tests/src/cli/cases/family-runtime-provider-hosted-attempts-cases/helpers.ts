import {
  assert,
  createGitModuleRemoteFixture,
  fs,
  os,
  path,
  parseJsonText as parseJsonTextRaw,
  runCli,
  runCliFailure,
  test,
} from '../../helpers.ts';

export const parseJsonText = parseJsonTextRaw as (raw: string) => any;

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

export function createJsonDispatchFixture(payload: Record<string, unknown>) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch.mjs');
  fs.writeFileSync(
    dispatchPath,
    `process.stdout.write(${JSON.stringify(`${JSON.stringify(payload)}\n`)});\n`,
    { mode: 0o755 },
  );
  return { fixtureRoot, dispatchPath: `${process.execPath} ${dispatchPath}` };
}

export function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  const managedTemporalExportPath = path.join(stateRoot, 'managed-temporal-export');
  fs.mkdirSync(stateRoot, { recursive: true });
  if (!fs.existsSync(managedTemporalExportPath)) {
    const payload = {
      surface_kind: 'mas_family_domain_handler_export',
      managed_temporal_state_consistency: {
        surface_kind: 'managed_temporal_state_consistency',
        projection_status: 'ready',
        provider_kind: 'temporal',
        service_ready: true,
        managed_worker_ready: true,
        address: 'managed-temporal.example.test:7233',
        namespace: 'default',
        task_queue: 'opl-stage-attempts',
        source_refs: ['mas://domain-handler/managed_temporal_state_consistency/latest.json'],
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          paper_closure_authority: 'mas_only',
        },
      },
    };
    fs.writeFileSync(managedTemporalExportPath, `process.stdout.write(${JSON.stringify(`${JSON.stringify(payload)}\n`)});\n`);
  }
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: `${process.execPath} ${managedTemporalExportPath}`,
    OPL_TEMPORAL_CLIENT_CONNECT_TIMEOUT_MS: '50',
    ...extra,
  };
}

export {
  assert,
  createGitModuleRemoteFixture,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
};
