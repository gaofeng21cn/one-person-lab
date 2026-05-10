import { spawnSync } from 'node:child_process';

import { assert, createFakeHermesFixture, fs, os, path, repoRoot, runCli, shellSingleQuote, test } from '../helpers.ts';

function createDispatchFixture(body: string) {
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

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_DISABLE_HERMES_ONLINE: '1',
    ...extra,
  };
}

test('family-runtime status exposes Hermes-first online substrate and SQLite queue path', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-state-'));
  try {
    const output = runCli(['family-runtime', 'status'], familyRuntimeEnv(stateRoot));
    assert.equal(output.family_runtime.hermes_runtime_provider, 'required_for_online_family_runtime');
    assert.equal(output.family_runtime.readiness.full_online_ready, false);
    assert.equal(output.family_runtime.readiness.degraded_reason, 'hermes_online_disabled_for_development_or_offline_diagnostics');
    assert.equal(output.family_runtime.state.queue_db, path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    assert.equal(fs.existsSync(output.family_runtime.state.queue_db), true);
    assert.equal(output.family_runtime.domain_adapters.medautogrant.truth_owner, 'med-autogrant');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('bin/opl routes family-runtime commands into the OPL CLI instead of Codex passthrough', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-entry-'));
  try {
    const result = spawnSync(
      path.join(repoRoot, 'bin', 'opl'),
      ['family-runtime', 'status'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_SKIP_SKILL_SYNC: '1',
          ...familyRuntimeEnv(stateRoot),
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.family_runtime.surface_id, 'opl_family_runtime');
    assert.equal(output.family_runtime.hermes_runtime_provider, 'required_for_online_family_runtime');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime enqueue is idempotent by dedupe key and writes local inbox notification', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dedupe-'));
  try {
    const first = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'user-loop/wakeup',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:wakeup:1',
    ], familyRuntimeEnv(stateRoot));
    const second = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'user-loop/wakeup',
      '--payload',
      '{"workspace":"/tmp/mag"}',
      '--dedupe-key',
      'mag:wakeup:1',
    ], familyRuntimeEnv(stateRoot));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const notifications = runCli(['family-runtime', 'notify', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_enqueue.accepted, true);
    assert.equal(second.family_runtime_enqueue.accepted, false);
    assert.equal(second.family_runtime_enqueue.idempotent_noop, true);
    assert.equal(second.family_runtime_enqueue.task.task_id, first.family_runtime_enqueue.task.task_id);
    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(notifications.family_runtime_notifications.notifications.length, 1);
    assert.equal(notifications.family_runtime_notifications.notifications[0].channel, 'local_inbox');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime approval pauses dispatch until approved', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-approval-'));
  const dispatch = createDispatchFixture('echo \'{"accepted":true,"surface_kind":"test_dispatch"}\'');
  try {
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'redcube',
      '--task-kind',
      'runtime_watch',
      '--payload',
      '{"workspace_root":"/tmp/rca"}',
      '--requires-approval',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const firstTick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));
    const approval = runCli([
      'family-runtime',
      'approve',
      '--task',
      taskId,
      '--decision',
      'approve',
    ], familyRuntimeEnv(stateRoot));
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: dispatch.dispatchPath,
    }));

    assert.equal(enqueue.family_runtime_enqueue.task.status, 'waiting_approval');
    assert.equal(firstTick.family_runtime_tick.selected_count, 0);
    assert.equal(approval.family_runtime_approval.task.status, 'queued');
    assert.equal(secondTick.family_runtime_tick.dispatches[0].status, 'succeeded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime retries failed domain dispatch and then dead-letters', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-dead-letter-'));
  const dispatch = createDispatchFixture('echo "planned failure" >&2\nexit 17');
  try {
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'runtime_supervision/recover',
      '--payload',
      '{"profile":"/tmp/profile.toml"}',
    ], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    }));
    for (let index = 0; index < 3; index += 1) {
      runCli(['family-runtime', 'tick', '--source', `test-${index}`], familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      }));
    }
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(task.status, 'dead_letter');
    assert.equal(task.attempts, 3);
    assert.equal(task.dead_letter_reason, 'retry_budget_exhausted');
    assert.match(task.last_error, /planned failure/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick hydrates MAS sidecar pending tasks before dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hydrate-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task-path');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "surface_kind": "mas_family_sidecar_export",
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "runtime_supervisor/reconcile-apply",
      "priority": 50,
      "source": "mas-sidecar-export",
      "dedupe_key": "mas:test:DM002:autonomy-continuation:slo_breach",
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "continuation_reason": "slo_breach"
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    dispatchPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$1" > ${shellSingleQuote(dispatchedTaskPath)}
echo '{"accepted":true,"surface_kind":"mas_family_sidecar_dispatch_receipt","will_start_llm_worker":true}'
`,
    { mode: 0o755 },
  );
  try {
    const tick = runCli(['family-runtime', 'tick', '--source', 'test', '--hydrate'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const notifications = runCli(['family-runtime', 'notify', 'list'], familyRuntimeEnv(stateRoot));
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(queue.family_runtime_queue.queue.by_status.succeeded, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].dedupe_key, 'mas:test:DM002:autonomy-continuation:slo_breach');
    assert.equal(dispatchedTask.task_kind, 'runtime_supervisor/reconcile-apply');
    assert.equal(dispatchedTask.payload.study_id, 'DM002');
    assert.equal(notifications.family_runtime_notifications.notifications.length, 2);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydration is idempotent and blocks exported forbidden writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hydrate-idempotent-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-export-idempotent-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "runtime_supervisor/reconcile-apply",
      "dedupe_key": "mas:test:DM003:autonomy-continuation:slo_breach",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM003"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "artifact/override",
      "dedupe_key": "mas:test:bad-write",
      "payload": {"domain_truth_write": true}
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const first = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const second = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_intake.enqueued_count, 1);
    assert.equal(first.family_runtime_intake.blocked_count, 1);
    assert.equal(second.family_runtime_intake.enqueued_count, 0);
    assert.equal(second.family_runtime_intake.idempotent_noop_count, 1);
    assert.equal(queue.family_runtime_queue.queue.total, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].dedupe_key, 'mas:test:DM003:autonomy-continuation:slo_breach');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks domain truth writes before dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-forbidden-'));
  try {
    runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautogrant',
      '--task-kind',
      'artifact/override',
      '--payload',
      '{"domain_truth_write":true}',
    ], familyRuntimeEnv(stateRoot));
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], familyRuntimeEnv(stateRoot));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'domain_forbidden_write');
    assert.equal(queue.family_runtime_queue.tasks[0].status, 'blocked');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime repair registers Hermes cron and webhook bridge', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hermes-'));
  const cronState = path.join(stateRoot, 'cron-ready');
  const webhookState = path.join(stateRoot, 'webhook-ready');
  const hermes = createFakeHermesFixture(`
if [[ "$1" == "version" ]]; then
  echo "Hermes Agent v9.9.9-test"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "install" ]]; then
  echo "gateway installed"
  exit 0
fi
if [[ "$1" == "gateway" && "$2" == "status" ]]; then
  echo "Gateway service is loaded"
  exit 0
fi
if [[ "$1" == "cron" && "$2" == "list" ]]; then
  if [[ -f ${shellSingleQuote(cronState)} ]]; then
    echo "Name: opl-family-runtime-tick"
  fi
  exit 0
fi
if [[ "$1" == "cron" && "$2" == "create" ]]; then
  touch ${shellSingleQuote(cronState)}
  printf '%s\\n' "$*" > ${shellSingleQuote(path.join(stateRoot, 'cron.args'))}
  exit 0
fi
if [[ "$1" == "webhook" && "$2" == "list" ]]; then
  if [[ -f ${shellSingleQuote(webhookState)} ]]; then
    echo "opl-family-runtime-webhook"
  fi
  exit 0
fi
if [[ "$1" == "webhook" && "$2" == "subscribe" ]]; then
  touch ${shellSingleQuote(webhookState)}
  printf '%s\\n' "$*" > ${shellSingleQuote(path.join(stateRoot, 'webhook.args'))}
  exit 0
fi
echo "unexpected fake-hermes args: $*" >&2
exit 1
`);
  try {
    const output = runCli(['family-runtime', 'repair'], {
      OPL_STATE_DIR: stateRoot,
      OPL_HERMES_BIN: hermes.hermesPath,
    });

    assert.equal(output.family_runtime_bridge.status, 'ready');
    assert.equal(output.family_runtime_bridge.bridge.cron_registered, true);
    assert.equal(output.family_runtime_bridge.bridge.webhook_registered, true);
    assert.match(fs.readFileSync(path.join(stateRoot, 'cron.args'), 'utf8'), /opl family-runtime tick --source hermes-cron --hydrate/);
    assert.match(fs.readFileSync(path.join(stateRoot, 'cron.args'), 'utf8'), /create every 1m .* --name opl-family-runtime-tick/);
    assert.match(fs.readFileSync(path.join(stateRoot, 'webhook.args'), 'utf8'), /opl-family-runtime-webhook/);
    assert.match(
      fs.readFileSync(path.join(stateRoot, 'webhook.args'), 'utf8'),
      /subscribe opl-family-runtime-webhook --prompt opl-family-runtime-webhook/,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(hermes.fixtureRoot, { recursive: true, force: true });
  }
});
