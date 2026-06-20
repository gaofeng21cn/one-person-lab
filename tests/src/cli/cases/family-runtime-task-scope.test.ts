import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

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

function createExportFixture(body: string) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  fs.writeFileSync(
    exportPath,
    `#!/usr/bin/env bash
set -euo pipefail
${body}
`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath };
}

function createJsonExportFixture(payload: Record<string, unknown>) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-export-'));
  const exportPath = path.join(fixtureRoot, 'export.mjs');
  fs.writeFileSync(
    exportPath,
    `process.stdout.write(${JSON.stringify(`${JSON.stringify(payload)}\n`)});\n`,
    { mode: 0o755 },
  );
  return { fixtureRoot, exportPath: `${process.execPath} ${exportPath}` };
}

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime tick can scope hydration and dispatch to selected MAS studies', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-study-scope-'));
  const exportFixture = createJsonExportFixture({
    pending_family_tasks: ['DM001', 'DM002', 'DM003', 'DM004'].map((studyId) => ({
      domain_id: 'medautoscience',
      task_kind: 'domain_route/reconcile-apply',
      dedupe_key: `mas:test:${studyId}:resume`,
      payload: { profile: '/tmp/profile.toml', study_id: studyId },
    })),
  });
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
print(json.dumps({
    "accepted": True,
    "surface_kind": "test_dispatch",
    "study_id": task["payload"].get("study_id")
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportFixture.exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    });
    const dm002Tick = runCli([
      'family-runtime',
      'tick',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--source',
      'test',
    ], env);
    const dm003Tick = runCli([
      'family-runtime',
      'tick',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--payload-match',
      'study_id=DM003',
      '--source',
      'test',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(dm002Tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(dm002Tick.family_runtime_tick.hydration.filtered_count, 3);
    assert.equal(dm002Tick.family_runtime_tick.selected_count, 1);
    assert.equal(dm002Tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(dm002Tick.family_runtime_tick.dispatches[0].output.study_id, 'DM002');
    assert.deepEqual(dm002Tick.family_runtime_tick.task_scope, {
      domainId: 'medautoscience',
      payloadMatches: [{ path: 'study_id', value: 'DM002' }],
    });
    assert.equal(dm003Tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(dm003Tick.family_runtime_tick.hydration.filtered_count, 3);
    assert.equal(dm003Tick.family_runtime_tick.selected_count, 1);
    assert.equal(dm003Tick.family_runtime_tick.dispatches[0].output.study_id, 'DM003');
    assert.deepEqual(
      queue.family_runtime_queue.tasks.map((task: { dedupe_key: string }) => task.dedupe_key).sort(),
      ['mas:test:DM002:resume', 'mas:test:DM003:resume'],
    );
    assert.equal(
      queue.family_runtime_queue.tasks.every((task: { status: string }) => task.status === 'succeeded'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime queue list treats repeated study selectors as same-path OR with other selectors as AND', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-study-scope-or-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    for (const task of [
      { studyId: 'DM001', workUnit: 'primary' },
      { studyId: 'DM002', workUnit: 'primary' },
      { studyId: 'DM003', workUnit: 'primary' },
      { studyId: 'DM003', workUnit: 'secondary' },
    ]) {
      runCli([
        'family-runtime',
        'enqueue',
        '--domain',
        'medautoscience',
        '--task-kind',
        'domain_route/reconcile-apply',
        '--dedupe-key',
        `mas:test:${task.studyId}:${task.workUnit}:resume`,
        '--payload',
        JSON.stringify({
          profile: '/tmp/profile.toml',
          study_id: task.studyId,
          work_unit: task.workUnit,
        }),
      ], env);
    }

    const studyOrQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--study',
      'DM003',
    ], env);
    const studyOrWithAndQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--study',
      'DM003',
      '--payload-match',
      'work_unit=secondary',
    ], env);

    assert.deepEqual(
      studyOrQueue.family_runtime_queue.tasks
        .map((task: { payload: { study_id: string; work_unit: string } }) =>
          `${task.payload.study_id}:${task.payload.work_unit}`
        )
        .sort(),
      ['DM002:primary', 'DM003:primary', 'DM003:secondary'],
    );
    assert.equal(studyOrQueue.family_runtime_queue.queue.total, 3);
    assert.deepEqual(
      studyOrWithAndQueue.family_runtime_queue.tasks.map((task: { payload: { study_id: string; work_unit: string } }) =>
        `${task.payload.study_id}:${task.payload.work_unit}`
      ),
      ['DM003:secondary'],
    );
    assert.equal(studyOrWithAndQueue.family_runtime_queue.queue.total, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime task scope rejects payload-root prefixes for payload-match paths', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-payload-match-prefix-'));
  try {
    for (const args of [
      ['family-runtime', 'queue', 'list', '--payload-match', 'payload.study_id=DM002'],
      ['family-runtime', 'tick', '--hydrate', '--payload-match', 'task.payload.study_id=DM002'],
      ['family-runtime', 'intake', '--domain', 'medautoscience', '--payload-match', 'payload.study_id=DM002'],
    ]) {
      const failure = runCliFailure(args, familyRuntimeEnv(stateRoot));

      assert.equal(failure.payload.error.code, 'cli_usage_error');
      assert.match(failure.payload.error.message, /relative to the task payload root/);
      assert.match(failure.payload.error.message, /do not prefix/);
      assert.equal(failure.payload.error.details.option, '--payload-match');
      assert.match(failure.payload.error.details.path, /^(payload|task\.payload)/);
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick hydrates and dispatches repeated study selectors as same-path OR', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-study-scope-or-tick-'));
  const exportFixture = createJsonExportFixture({
    pending_family_tasks: ['DM001', 'DM002', 'DM003', 'DM004'].map((studyId) => ({
      domain_id: 'medautoscience',
      task_kind: 'domain_route/reconcile-apply',
      dedupe_key: `mas:test:${studyId}:resume`,
      payload: { profile: '/tmp/profile.toml', study_id: studyId },
    })),
  });
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
print(json.dumps({
    "accepted": True,
    "surface_kind": "test_dispatch",
    "study_id": task["payload"].get("study_id")
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportFixture.exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    });
    const tick = runCli([
      'family-runtime',
      'tick',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--study',
      'DM003',
      '--source',
      'test',
    ], env);

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 2);
    assert.equal(tick.family_runtime_tick.hydration.filtered_count, 2);
    assert.equal(tick.family_runtime_tick.selected_count, 2);
    assert.deepEqual(
      tick.family_runtime_tick.dispatches
        .map((dispatchResult: { output: { study_id: string } }) => dispatchResult.output.study_id)
        .sort(),
      ['DM002', 'DM003'],
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake can scope hydration by top-level task kind', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-task-kind-scope-'));
  const exportFixture = createJsonExportFixture({
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_route/reconcile-apply',
        dedupe_key: 'mas:test:DM002:route',
        payload: { profile: '/tmp/profile.toml', study_id: 'DM002' },
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'publication_aftercare/reviewer-refresh',
        dedupe_key: 'mas:test:DM002:reviewer-refresh',
        payload: { profile: '/tmp/profile.toml', study_id: 'DM002' },
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'publication_aftercare/reviewer-refresh',
        dedupe_key: 'mas:test:DM003:reviewer-refresh',
        payload: { profile: '/tmp/profile.toml', study_id: 'DM003' },
      },
    ],
  });
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportFixture.exportPath,
    });
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--task-kind',
      'publication_aftercare/reviewer-refresh',
      '--source',
      'test',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.filtered_count, 2);
    assert.deepEqual(intake.family_runtime_intake.task_scope, {
      taskKind: 'publication_aftercare/reviewer-refresh',
      payloadMatches: [{ path: 'study_id', value: 'DM002' }],
    });
    assert.equal(queue.family_runtime_queue.tasks.length, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].task_kind, 'publication_aftercare/reviewer-refresh');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, 'DM002');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake payload-match idempotency_key matches provider-admission identity aliases', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-identity-alias-scope-'));
  const exportFixture = createJsonExportFixture({
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        dedupe_key: 'paper-policy-request:dm002-current',
        payload: {
          profile: '/tmp/profile.toml',
          study_id: 'DM002',
          action_type: 'return_to_ai_reviewer_workflow',
          work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          route_identity_key: 'paper-policy-request:dm002-current',
          attempt_idempotency_key: 'paper-policy-request:dm002-current',
          provider_admission_identity: {
            route_identity_key: 'paper-policy-request:dm002-current',
            attempt_idempotency_key: 'paper-policy-request:dm002-current',
          },
        },
      },
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        dedupe_key: 'paper-policy-request:dm003-other',
        payload: {
          profile: '/tmp/profile.toml',
          study_id: 'DM003',
          action_type: 'request_opl_stage_attempt',
          work_unit_id: 'medical_prose_write_repair',
          route_identity_key: 'paper-policy-request:dm003-other',
          attempt_idempotency_key: 'paper-policy-request:dm003-other',
        },
      },
    ],
  });
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportFixture.exportPath,
    });
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload-match',
      'idempotency_key=paper-policy-request:dm002-current',
      '--source',
      'test',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.filtered_count, 1);
    assert.deepEqual(intake.family_runtime_intake.task_scope, {
      taskKind: 'domain_owner/default-executor-dispatch',
      payloadMatches: [{ path: 'idempotency_key', value: 'paper-policy-request:dm002-current' }],
    });
    assert.equal(queue.family_runtime_queue.tasks.length, 1);
    assert.equal(queue.family_runtime_queue.tasks[0].payload.study_id, 'DM002');
    assert.equal(queue.family_runtime_queue.tasks[0].payload.attempt_idempotency_key, 'paper-policy-request:dm002-current');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(exportFixture.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick scope filtered count excludes limit overflow', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-study-scope-limit-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
print(json.dumps({
    "accepted": True,
    "surface_kind": "test_dispatch",
    "study_id": task["payload"].get("study_id")
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
    });
    for (const studyId of ['DM001', 'DM002-A', 'DM002-B']) {
      runCli([
        'family-runtime',
        'enqueue',
        '--domain',
        'medautoscience',
        '--task-kind',
        'domain_route/reconcile-apply',
        '--dedupe-key',
        `mas:test:${studyId}:resume`,
        '--payload',
        JSON.stringify({
          profile: '/tmp/profile.toml',
          study_id: studyId.startsWith('DM002') ? 'DM002' : studyId,
          work_unit: studyId,
        }),
      ], env);
    }

    const tick = runCli([
      'family-runtime',
      'tick',
      '--domain',
      'medautoscience',
      '--study',
      'DM002',
      '--limit',
      '1',
      '--source',
      'test',
    ], env);

    assert.equal(tick.family_runtime_tick.selected_count, 1);
    assert.equal(tick.family_runtime_tick.filtered_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].output.study_id, 'DM002');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
