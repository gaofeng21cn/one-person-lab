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

test('family-runtime runs cross-repo notification approval retry and dead-letter E2E', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cross-repo-'));
  const masExport = createExportFixture(`cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautoscience",
      "task_kind": "paper_autonomy/gate-replay",
      "dedupe_key": "mas:e2e:gate-replay",
      "priority": 90,
      "source": "mas-sidecar-export",
      "payload": {"profile": "/tmp/profile.toml", "study_id": "DM002"}
    }
  ]
}
JSON
`);
  const magExport = createExportFixture(`cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "medautogrant",
      "task_kind": "user-loop/wakeup",
      "dedupe_key": "mag:e2e:user-loop",
      "priority": 80,
      "source": "mag-sidecar-export",
      "requires_approval": true,
      "payload": {"input_path": "/tmp/mag/input.json", "task_intent": "continue grant user loop"}
    }
  ]
}
JSON
`);
  const rcaExport = createExportFixture(`cat <<'JSON'
{
  "pending_family_tasks": [
    {
      "domain_id": "redcube",
      "task_kind": "runtime_watch",
      "dedupe_key": "rca:e2e:runtime-watch",
      "priority": 70,
      "source": "rca-sidecar-export",
      "payload": {"workspace_root": "/tmp/rca"}
    }
  ]
}
JSON
`);
  const masDispatch = createDispatchFixture('echo \'{"accepted":true,"surface_kind":"mas_dispatch_receipt"}\'');
  const magDispatch = createDispatchFixture('echo \'{"accepted":true,"surface_kind":"mag_dispatch_receipt"}\'');
  const rcaDispatch = createDispatchFixture('echo "rca planned failure" >&2\nexit 19');
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: masExport.exportPath,
    OPL_FAMILY_RUNTIME_MEDAUTOGRANT_EXPORT: magExport.exportPath,
    OPL_FAMILY_RUNTIME_REDCUBE_EXPORT: rcaExport.exportPath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: masDispatch.dispatchPath,
    OPL_FAMILY_RUNTIME_MEDAUTOGRANT_DISPATCH: magDispatch.dispatchPath,
    OPL_FAMILY_RUNTIME_REDCUBE_DISPATCH: rcaDispatch.dispatchPath,
  });
  try {
    const firstTick = runCli(['family-runtime', 'tick', '--source', 'test-hydrate', '--hydrate'], env);
    let queue = runCli(['family-runtime', 'queue', 'list'], env);
    const approvedTask = queue.family_runtime_queue.tasks.find(
      (task: { domain_id: string }) => task.domain_id === 'medautogrant',
    );
    assert.equal(firstTick.family_runtime_tick.hydration.enqueued_count, 3);
    assert.equal(firstTick.family_runtime_tick.selected_count, 2);
    assert.equal(queue.family_runtime_queue.queue.by_status.succeeded, 1);
    assert.equal(queue.family_runtime_queue.queue.by_status.waiting_approval, 1);
    assert.equal(queue.family_runtime_queue.queue.by_status.retry_waiting, 1);
    assert.ok(approvedTask?.requires_approval);

    runCli([
      'family-runtime',
      'approve',
      '--task',
      approvedTask.task_id,
      '--decision',
      'approve',
    ], env);
    const secondTick = runCli(['family-runtime', 'tick', '--source', 'test-runner'], env);
    const thirdTick = runCli(['family-runtime', 'tick', '--source', 'test-runner'], env);
    queue = runCli(['family-runtime', 'queue', 'list'], env);
    const notifications = runCli(['family-runtime', 'notify', 'list'], env);
    const events = runCli(['family-runtime', 'events', 'export'], env);

    assert.equal(secondTick.family_runtime_tick.selected_count, 2);
    assert.equal(thirdTick.family_runtime_tick.selected_count, 1);
    assert.equal(queue.family_runtime_queue.queue.total, 3);
    assert.equal(queue.family_runtime_queue.queue.by_status.succeeded, 2);
    assert.equal(queue.family_runtime_queue.queue.by_status.dead_letter, 1);
    assert.deepEqual(
      queue.family_runtime_queue.tasks.map((task: { domain_id: string; status: string }) => [task.domain_id, task.status]),
      [
        ['medautoscience', 'succeeded'],
        ['medautogrant', 'succeeded'],
        ['redcube', 'dead_letter'],
      ],
    );
    assert.equal(
      notifications.family_runtime_notifications.notifications.every(
        (notification: { channel: string }) => notification.channel === 'local_inbox',
      ),
      true,
    );
    assert.ok(
      notifications.family_runtime_notifications.notifications.some(
        (notification: { title: string }) => notification.title === 'Family runtime task dead-lettered',
      ),
    );
    assert.ok(
      events.family_runtime_events.events.some(
        (event: { event_type: string; domain_id: string }) =>
          event.event_type === 'task_approved' && event.domain_id === 'medautogrant',
      ),
    );
    assert.ok(
      events.family_runtime_events.events.some(
        (event: { event_type: string; domain_id: string }) =>
          event.event_type === 'task_dead_lettered' && event.domain_id === 'redcube',
      ),
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    for (const fixture of [masExport, magExport, rcaExport, masDispatch, magDispatch, rcaDispatch]) {
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
  }
});
