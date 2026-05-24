import { assert, fs, os, path, runCli, test } from '../helpers.ts';

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
    ...extra,
  };
}

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
      'domain_route/recover',
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
      "task_kind": "domain_route/reconcile-apply",
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

test('family-runtime hydration preserves domain dispatch evidence record payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-hydrate-evidence-payload-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-export-evidence-payload-'));
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
      "task_kind": "domain_owner/default-executor-dispatch",
      "dedupe_key": "mas:test:DM002:default-executor:source-1",
      "source_fingerprint": "source-1",
      "domain_dispatch_evidence_record_payload": {
        "surface_kind": "mas_domain_dispatch_evidence_record_payload",
        "record_payload": {
          "domain_id": "medautoscience",
          "task_kind": "domain_owner/default-executor-dispatch",
          "study_id": "DM002",
          "domain_source_fingerprint": "source-1",
          "typed_blocker_refs": ["mas-typed-blocker:DM002"],
          "no_regression_refs": ["mas-no-forbidden-write:DM002"],
          "evidence_refs": ["dispatch.json"]
        }
      },
      "payload": {
        "profile": "/tmp/profile.toml",
        "study_id": "DM002",
        "dispatch_ref": "dispatch.json",
        "next_executable_owner": "write",
        "executor_kind": "codex_cli_default",
        "source_fingerprint": "truth-snapshot:DM002"
      }
    }
  ]
}
JSON
`,
    { mode: 0o755 },
  );
  try {
    const intake = runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(task.payload.domain_dispatch_evidence_record_payload.surface_kind, 'mas_domain_dispatch_evidence_record_payload');
    assert.deepEqual(
      task.payload.domain_dispatch_evidence_record_payload.record_payload.typed_blocker_refs,
      ['mas-typed-blocker:DM002'],
    );
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
