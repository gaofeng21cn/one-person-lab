import { spawnSync } from 'node:child_process';

import { assert, createGitModuleRemoteFixture, fs, os, path, repoRoot, runCli, shellSingleQuote, test } from '../helpers.ts';
import { runFamilyRuntimeDomainHandlerCommand } from '../../../../src/family-runtime-domain-handler-process.ts';

function runGit(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return result.stdout.trim();
}

function cloneGitModuleCheckout(remoteRoot: string, checkoutRoot: string) {
  runGit(path.dirname(checkoutRoot), ['clone', remoteRoot, checkoutRoot]);
  return checkoutRoot;
}

function readDomainHandlerCheckoutPreflight(result: unknown) {
  return (result as { checkout_currentness_preflight?: Record<string, unknown> }).checkout_currentness_preflight;
}

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS: '100',
    OPL_FAMILY_RUNTIME_MANAGED_PROVIDER_PROJECTION_TIMEOUT_MS: '100',
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

test('family-runtime domain-handler separates dispatch and export default timeouts', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-default-timeout-'));
  const dispatchDomainHandlerPath = path.join(fixtureRoot, 'dispatch');
  const exportDomainHandlerPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    dispatchDomainHandlerPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '{"accepted":true}'
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    exportDomainHandlerPath,
    `#!/usr/bin/env bash
set -euo pipefail
sleep 1.5
printf '{"surface_kind":"mas_family_domain_handler_export","pending_family_tasks":[],"domain_progress_transition_requests":[]}'
`,
    { mode: 0o755 },
  );
  const previous = process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS;
  const previousExport = process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS;
  delete process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS;
  process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS = '1000';
  try {
    const dispatchResult = runFamilyRuntimeDomainHandlerCommand([dispatchDomainHandlerPath], {
      cwd: fixtureRoot,
    });
    const exportResult = runFamilyRuntimeDomainHandlerCommand([exportDomainHandlerPath], {
      cwd: fixtureRoot,
    }, 'export');

    assert.equal(dispatchResult.exit_code, 0);
    assert.equal(dispatchResult.timed_out, false);
    assert.equal(dispatchResult.domain_handler_timeout_ms, 1000);
    assert.equal(exportResult.exit_code, 0);
    assert.equal(exportResult.timed_out, false);
    assert.equal(exportResult.domain_handler_timeout_ms, 600_000);
  } finally {
    if (previous === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS;
    } else {
      process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS = previous;
    }
    if (previousExport === undefined) {
      delete process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS;
    } else {
      process.env.OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS = previousExport;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS: '5000',
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS: '100',
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

test('family-runtime profile module export fails closed when module exec hangs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-timeout-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-timeout-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'sleep 30',
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'module-timeout-test',
    ], familyRuntimeEnv(stateRoot, {
      PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_TIMEOUT_MS: '5000',
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS: '100',
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
    }));
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(exportResult.status, 'timeout');
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.match(exportResult.error, /Domain export timed out after 100ms/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime profile module hydrate fails closed on dirty managed module checkout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-dirty-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-module-dirty-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const runnerHitPath = path.join(fixtureRoot, 'runner-hit');
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'scripts/run-python-clean.sh': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `printf 'runner executed\\n' > ${shellSingleQuote(runnerHitPath)}`,
        `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(`process.stdout.write(${JSON.stringify(`${JSON.stringify({
          surface_kind: 'mas_family_domain_handler_export',
          pending_family_tasks: [
            {
              domain_id: 'medautoscience',
              task_kind: 'domain_route/reconcile-apply',
              dedupe_key: 'mas:dirty:should-not-enqueue',
              payload: { study_id: 'DM002' },
            },
          ],
        })}\n`)});`)}`,
        '',
      ].join('\n'),
    },
    executableFiles: ['scripts/run-python-clean.sh'],
  });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(path.join(masFixture.sourceRoot, 'dirty-uncommitted.txt'), 'dirty\n', 'utf8');
  try {
    const env = familyRuntimeEnv(stateRoot, {
      PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
      OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
    });
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'module-dirty-test',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const exportResult = intake.family_runtime_intake.exports[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(exportResult.status, 'blocked');
    assert.equal(exportResult.reason, 'dirty_checkout');
    assert.equal(exportResult.command_source, 'module_exec_profile');
    assert.equal(exportResult.command_cwd, masFixture.sourceRoot);
    assert.equal(fs.existsSync(runnerHitPath), false);
    assert.equal(queue.family_runtime_queue.queue.total, 0);
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain handler command fast-forwards a clean checkout before running', () => {
  const masFixture = createGitModuleRemoteFixture('med-autoscience', {
    extraFiles: {
      'domain-handler': [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'git rev-parse HEAD > "$OPL_TEST_OBSERVED_HEAD_PATH"',
        'printf \'{"surface_kind":"mas_family_domain_handler_export","pending_family_tasks":[]}\'',
        '',
      ].join('\n'),
    },
    executableFiles: ['domain-handler'],
  });
  const checkoutRoot = cloneGitModuleCheckout(masFixture.remoteRoot, path.join(masFixture.fixtureRoot, 'clean-behind-checkout'));
  const observedHeadPath = path.join(masFixture.fixtureRoot, 'handler-head.txt');
  const commandPath = path.join(checkoutRoot, 'domain-handler');
  const targetSha = masFixture.advance('CURRENTNESS.md', 'target\n', 'Advance target ref');

  try {
    const result = runFamilyRuntimeDomainHandlerCommand([commandPath], {
      cwd: checkoutRoot,
      env: { OPL_TEST_OBSERVED_HEAD_PATH: observedHeadPath },
    }, 'export');
    const preflight = readDomainHandlerCheckoutPreflight(result);

    assert.equal(result.exit_code, 0);
    assert.equal(preflight?.status, 'fast_forwarded');
    assert.equal(preflight?.currentness_status, 'fast_forwarded');
    assert.equal(preflight?.workspace_path, checkoutRoot);
    assert.equal(preflight?.target_ref, 'origin/main');
    assert.equal(runGit(checkoutRoot, ['rev-parse', 'HEAD']), targetSha);
    assert.equal(fs.readFileSync(observedHeadPath, 'utf8').trim(), targetSha);
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('domain handler command blocks dirty or diverged checkouts before running', () => {
  const cases: Array<{
    name: string;
    reason: string;
    prepare: (checkoutRoot: string) => void;
  }> = [
    {
      name: 'dirty',
      reason: 'dirty_checkout',
      prepare(checkoutRoot) {
        fs.writeFileSync(path.join(checkoutRoot, 'dirty-uncommitted.txt'), 'dirty\n', 'utf8');
      },
    },
    {
      name: 'diverged',
      reason: 'diverged_checkout',
      prepare(checkoutRoot) {
        fs.writeFileSync(path.join(checkoutRoot, 'LOCAL.md'), 'local\n', 'utf8');
        runGit(checkoutRoot, ['add', 'LOCAL.md']);
        runGit(checkoutRoot, [
          '-c',
          'user.name=OPL Test',
          '-c',
          'user.email=opl@example.test',
          'commit',
          '-m',
          'Local divergent change',
        ]);
      },
    },
  ];

  for (const testCase of cases) {
    const masFixture = createGitModuleRemoteFixture('med-autoscience', {
      extraFiles: {
        'domain-handler': [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'printf "ran\\n" > "$OPL_TEST_MARKER_PATH"',
          'printf \'{"surface_kind":"mas_family_domain_handler_export","pending_family_tasks":[]}\'',
          '',
        ].join('\n'),
      },
      executableFiles: ['domain-handler'],
    });
    const checkoutRoot = cloneGitModuleCheckout(
      masFixture.remoteRoot,
      path.join(masFixture.fixtureRoot, `${testCase.name}-checkout`),
    );
    const markerPath = path.join(masFixture.fixtureRoot, `${testCase.name}-domain-handler-ran.txt`);
    const commandPath = path.join(checkoutRoot, 'domain-handler');
    masFixture.advance(`${testCase.name}-REMOTE.md`, 'remote\n', `Advance remote for ${testCase.name}`);
    testCase.prepare(checkoutRoot);

    try {
      const result = runFamilyRuntimeDomainHandlerCommand([commandPath], {
        cwd: checkoutRoot,
        env: { OPL_TEST_MARKER_PATH: markerPath },
      }, 'export');
      const preflight = readDomainHandlerCheckoutPreflight(result);

      assert.notEqual(result.exit_code, 0, testCase.name);
      assert.equal(preflight?.status, 'blocked', testCase.name);
      assert.equal(
        preflight?.currentness_status,
        testCase.reason === 'dirty_checkout' ? 'dirty_fail_closed' : 'diverged_fail_closed',
        testCase.name,
      );
      assert.equal(preflight?.workspace_path, checkoutRoot, testCase.name);
      assert.equal(preflight?.reason, testCase.reason, testCase.name);
      assert.equal(fs.existsSync(markerPath), false, testCase.name);
    } finally {
      fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    }
  }
});

test('family-runtime dispatch fails closed when a domain dispatch handler times out', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dispatch-timeout-state-'));
  const dispatchDomainHandler = hangingDomainHandlerFixture('dispatch');
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS: '5000',
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

test('family-runtime status does not hang on a timed-out MAS managed provider projection export', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-managed-projection-timeout-state-'));
  const exportDomainHandler = hangingDomainHandlerFixture('managed-projection-export');
  try {
    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportDomainHandler.domainHandlerPath,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_STATUS: '',
        OPL_TEMPORAL_WORKER_ENABLED: '',
      }),
    );
    const provider = output.family_runtime.provider_runtime.providers.temporal;

    assert.equal(output.family_runtime.readiness.provider_ready, false);
    assert.equal(provider.ready, false);
    assert.notEqual(provider.details.adapter_mode, 'mas_managed_temporal_projection_ready');
    assert.equal(provider.details.managed_domain_projection_summary, null);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportDomainHandler.fixtureRoot, { recursive: true, force: true });
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

test('domain handler command stops reusing a corrupt uv cache root after recovery succeeds', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-domain-cache-persist-'));
  const commandPath = path.join(fixtureRoot, 'domain-handler');
  const attemptsPath = path.join(fixtureRoot, 'attempts.txt');
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$OPL_DOMAIN_COMMAND_TMP_ROOT" >> ${JSON.stringify(attemptsPath)}
case "$OPL_DOMAIN_COMMAND_TMP_ROOT" in
  */recovery/*)
    cat <<'JSON'
{"surface_kind":"mas_family_domain_handler_export","pending_family_tasks":[]}
JSON
    ;;
  *)
    echo 'error: Failed to install: opl_harness_shared-0.1.0-py3-none-any.whl' >&2
    echo "  Caused by: failed to open file $UV_CACHE_DIR/archive-v0/broken/opl_harness_shared-0.1.0.dist-info/METADATA: No such file or directory (os error 2)" >&2
    exit 1
    ;;
esac
`,
    { mode: 0o755 },
  );
  try {
    const env = {
      OPL_DOMAIN_COMMAND_TMP_ROOT: path.join(os.tmpdir(), 'opl-family-runtime-domain-cache-persist-root'),
    };
    const first = runFamilyRuntimeDomainHandlerCommand([commandPath], { cwd: fixtureRoot, env });
    const second = runFamilyRuntimeDomainHandlerCommand([commandPath], { cwd: fixtureRoot, env });
    const attempts = fs.readFileSync(attemptsPath, 'utf8').trim().split('\n');

    assert.equal(first.exit_code, 0);
    assert.equal(first.recovery?.trigger_kind, 'uv_cache_archive_missing');
    assert.equal(second.exit_code, 0);
    assert.equal(second.recovery, undefined);
    assert.deepEqual(attempts.map((entry) => entry.includes('/recovery/')), [false, true, true]);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('domain handler command retries stale managed python env missing dependency with a fresh root', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-domain-python-env-stale-'));
  const commandPath = path.join(fixtureRoot, 'domain-handler');
  const attemptsPath = path.join(fixtureRoot, 'attempts.txt');
  fs.writeFileSync(
    commandPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$OPL_DOMAIN_COMMAND_TMP_ROOT" >> ${JSON.stringify(attemptsPath)}
case "$OPL_DOMAIN_COMMAND_TMP_ROOT" in
  */recovery/*)
    cat <<'JSON'
{"surface_kind":"mas_family_domain_handler_export","pending_family_tasks":[]}
JSON
    ;;
  *)
    echo 'Audited 29 packages in 0.09ms' >&2
    echo 'Traceback (most recent call last):' >&2
    echo "ModuleNotFoundError: No module named 'yaml'" >&2
    exit 1
    ;;
esac
`,
    { mode: 0o755 },
  );
  try {
    const env = {
      OPL_DOMAIN_COMMAND_TMP_ROOT: path.join(os.tmpdir(), 'opl-family-runtime-domain-python-env-stale-root'),
    };
    const first = runFamilyRuntimeDomainHandlerCommand([commandPath], { cwd: fixtureRoot, env });
    const second = runFamilyRuntimeDomainHandlerCommand([commandPath], { cwd: fixtureRoot, env });
    const attempts = fs.readFileSync(attemptsPath, 'utf8').trim().split('\n');

    assert.equal(first.exit_code, 0);
    assert.equal(first.recovery?.trigger_kind, 'managed_python_env_missing_dependency');
    assert.equal(first.recovery?.first_exit_code, 1);
    assert.equal(first.recovery?.retry_exit_code, 0);
    assert.equal(second.exit_code, 0);
    assert.equal(second.recovery, undefined);
    assert.deepEqual(attempts.map((entry) => entry.includes('/recovery/')), [false, true, true]);
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
      OPL_FAMILY_RUNTIME_DOMAIN_HANDLER_EXPORT_TIMEOUT_MS: '5000',
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
