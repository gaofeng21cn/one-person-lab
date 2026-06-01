import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';
import { runFamilyRuntimeDomainHandlerCommand } from '../../../../src/family-runtime-domain-handler-process.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS: '100',
    ...extra,
  };
}

function stableWorkspaceId(cwd: string) {
  return path.basename(path.resolve(cwd)).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
}

function hangingDomainHandlerFixture(name: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-family-runtime-${name}-timeout-`));
  const domainHandlerPath = path.join(fixtureRoot, name);
  fs.writeFileSync(
    domainHandlerPath,
    `#!/usr/bin/env bash
set -euo pipefail
sleep 30
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, domainHandlerPath };
}

test('family-runtime intake fails closed when a domain export handler times out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-timeout-state-'));
  const exportDomainHandler = hangingDomainHandlerFixture('export');
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'timeout-test',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportDomainHandler.domainHandlerPath,
    }));
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(exportResult.status, 'timeout');
    assert.match(exportResult.error, /Domain export timed out after 100ms/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportDomainHandler.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch fails closed when a domain dispatch handler times out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-timeout-state-'));
  const dispatchDomainHandler = hangingDomainHandlerFixture('dispatch');
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchDomainHandler.domainHandlerPath,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      '{"study_id":"DM002"}',
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'timeout-test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', enqueue.family_runtime_enqueue.task.task_id], env)
      .family_runtime_task.task;

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'retry_waiting');
    assert.equal(tick.family_runtime_tick.dispatches[0].exit_code, 124);
    assert.match(tick.family_runtime_tick.dispatches[0].error, /Domain dispatch timed out after 100ms/);
    assert.equal(task.status, 'retry_waiting');
    assert.match(task.last_error, /Domain dispatch timed out after 100ms/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatchDomainHandler.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch surfaces structured domain-handler failure over stderr noise', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-structured-error-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-structured-error-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
echo "Uninstalled 1 package in 1ms" >&2
echo "Installed 1 package in 2ms" >&2
cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "accepted": false,
  "reason": "unsupported_task_kind",
  "detail": "Unsupported MAS domain-handler task kind: domain_route/reconcile-apply"
}
JSON
exit 1
`,
    { mode: 0o755 },
  );
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS: '5000',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_route/reconcile-apply',
      '--payload',
      '{"study_id":"DM002"}',
    ], env);
    const tick = runCli(['family-runtime', 'tick', '--source', 'structured-error-test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', enqueue.family_runtime_enqueue.task.task_id], env)
      .family_runtime_task.task;

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'retry_waiting');
    assert.match(tick.family_runtime_tick.dispatches[0].error, /unsupported_task_kind/);
    assert.match(
      tick.family_runtime_tick.dispatches[0].error,
      /Unsupported MAS domain-handler task kind: domain_route\/reconcile-apply/,
    );
    assert.doesNotMatch(tick.family_runtime_tick.dispatches[0].error, /Uninstalled 1 package/);
    assert.equal(task.status, 'retry_waiting');
    assert.match(task.last_error, /unsupported_task_kind/);
    assert.match(task.last_error, /Unsupported MAS domain-handler task kind: domain_route\/reconcile-apply/);
    assert.doesNotMatch(task.last_error, /Installed 1 package/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain handler command retries once with a fresh managed tmp root when uv archive cache is corrupt', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-domain-cache-retry-'));
  const commandPath = path.join(fixtureRoot, 'domain-handler');
  const markerPath = path.join(fixtureRoot, 'first-run.marker');
  const firstTmpRootPath = path.join(fixtureRoot, 'first-tmp-root.txt');
  const retryTmpRootPath = path.join(fixtureRoot, 'retry-tmp-root.txt');
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [ ! -f ${JSON.stringify(markerPath)} ]; then
  printf '%s\\n' "$OPL_DOMAIN_COMMAND_TMP_ROOT" > ${JSON.stringify(firstTmpRootPath)}
  : > ${JSON.stringify(markerPath)}
  echo 'error: Failed to install: opl_harness_shared-0.1.0-py3-none-any.whl' >&2
  echo "  Caused by: failed to open file \\\`$UV_CACHE_DIR/archive-v0/broken/opl_harness_shared-0.1.0.dist-info/METADATA\\\`: No such file or directory (os error 2)" >&2
  exit 1
fi
printf '%s\\n' "$OPL_DOMAIN_COMMAND_TMP_ROOT" > ${JSON.stringify(retryTmpRootPath)}
cat <<'JSON'
{"surface_kind":"mas_family_domain_handler_export","pending_family_tasks":[]}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const result = runFamilyRuntimeDomainHandlerCommand([commandPath], {
      cwd: fixtureRoot,
      env: {
        OPL_DOMAIN_COMMAND_TMP_ROOT: path.join(os.tmpdir(), 'opl-family-runtime-domain-cache-root'),
      },
    });

    assert.equal(result.exit_code, 0);
    assert.match(result.stdout ?? '', /mas_family_domain_handler_export/);
    assert.equal(result.recovery?.trigger_kind, 'uv_cache_archive_missing');
    assert.equal(result.recovery?.first_exit_code, 1);
    assert.equal(result.recovery?.retry_exit_code, 0);
    assert.notEqual(
      fs.readFileSync(firstTmpRootPath, 'utf8').trim(),
      fs.readFileSync(retryTmpRootPath, 'utf8').trim(),
    );
    assert.equal(
      fs.readFileSync(retryTmpRootPath, 'utf8').trim(),
      path.join(
        os.tmpdir(),
        'opl-family-runtime-domain-cache-root',
        path.basename(fixtureRoot),
        'recovery',
        path.basename(fixtureRoot),
      ),
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake exposes domain handler recovery receipts after uv cache retry', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-cache-retry-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-cache-retry-'));
  const commandPath = path.join(fixtureRoot, 'export');
  const markerPath = path.join(fixtureRoot, 'first-run.marker');
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env bash
set -euo pipefail
if [ ! -f ${JSON.stringify(markerPath)} ]; then
  : > ${JSON.stringify(markerPath)}
  echo 'error: Failed to install: opl_harness_shared-0.1.0-py3-none-any.whl' >&2
  echo "  Caused by: failed to open file \\\`$UV_CACHE_DIR/archive-v0/broken/opl_harness_shared-0.1.0.dist-info/METADATA\\\`: No such file or directory (os error 2)" >&2
  exit 1
fi
cat <<'JSON'
{
  "surface_kind": "mas_family_domain_handler_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "priority": 55,
      "dedupe_key": "cache-retry-task",
      "payload": {"study_id":"DM002"}
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'cache-retry-test',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS: '5000',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: commandPath,
    }));
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(exportResult.status, 'completed');
    assert.equal(exportResult.domain_handler_recovery.trigger_kind, 'uv_cache_archive_missing');
    assert.equal(exportResult.domain_handler_recovery.first_exit_code, 1);
    assert.equal(exportResult.domain_handler_recovery.retry_exit_code, 0);
    assert.equal(
      exportResult.domain_handler_recovery.retry_tmp_root,
      path.join(
        os.tmpdir(),
        'opl-domain-command',
        stableWorkspaceId(repoRoot),
        'recovery',
        stableWorkspaceId(repoRoot),
      ),
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
