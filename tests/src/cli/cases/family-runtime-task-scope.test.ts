import {
  assert,
  fs,
  os,
  path,
  runCli,
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

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime tick can scope hydration and dispatch to selected MAS studies', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-study-scope-'));
  const exportFixture = createExportFixture(`
cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM001:resume",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM001"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM002:resume",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM002"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM003:resume",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM003"}
    },
    {
      "domain_id": "medautoscience",
      "task_kind": "domain_route/reconcile-apply",
      "dedupe_key": "mas:test:DM004:resume",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM004"}
    }
  ]
}
JSON
`);
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
