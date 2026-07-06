import { assert, fs, os, path, runCli, shellSingleQuote, test, parseJsonText } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function jsString(value: string) {
  return JSON.stringify(value);
}

function writeNodeScript(scriptPath: string, source: string) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(source)} "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

test('family-runtime requeues dead-lettered MAS repair exports when nested work-unit fingerprint changes under same owner', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-nested-source-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-deadletter-nested-source-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchCountPath = path.join(fixtureRoot, 'dispatch.count');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task.json');
  writeNodeScript(exportPath, `
const fs = require('node:fs');
const fingerprint = fs.readFileSync(${jsString(path.join(fixtureRoot, 'fingerprint'))}, 'utf8').trim();
const contextVersion = fs.readFileSync(${jsString(path.join(fixtureRoot, 'context-version'))}, 'utf8').trim();
process.stdout.write(JSON.stringify({
  surface_kind: 'mas_family_domain_handler_export',
  pending_family_tasks: [
    {
      domain_id: 'medautoscience',
      task_kind: 'paper_autonomy/repair-recheck',
      priority: 60,
      source: 'mas-runtime-owner-route',
      dedupe_key: 'mas:dm002:repair-recheck:nested-source-fingerprint',
      dispatch_owner: 'med-autoscience',
      owner_route_ref: 'owner-route:mas/DM002/nested-source-fingerprint',
      payload: {
        profile: 'dm-cvd.workspace.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        repair_work_unit: {
          work_unit_id: 'unit_harmonized_validation_uncertainty_and_grouped_calibration',
          source_fingerprint: fingerprint,
          context_refs: [\`context:\${contextVersion}\`],
        },
      },
    },
  ],
}, null, 2) + '\\n');
`);
  writeNodeScript(dispatchPath, `
const fs = require('node:fs');
const taskPath = process.argv[1];
fs.copyFileSync(taskPath, ${jsString(dispatchedTaskPath)});
let count = 0;
if (fs.existsSync(${jsString(dispatchCountPath)})) {
  count = Number(fs.readFileSync(${jsString(dispatchCountPath)}, 'utf8').trim() || '0');
}
count += 1;
fs.writeFileSync(${jsString(dispatchCountPath)}, String(count) + '\\n');
if (count <= 3) {
  process.stderr.write('repair work-unit owner receipt missing\\n');
  process.exit(42);
}
process.stdout.write(JSON.stringify({
  accepted: true,
  surface_kind: 'mas_family_domain_handler_dispatch_receipt',
  receipt_ref: 'receipt:dm002/nested-repair-redrive',
}) + '\\n');
`);
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
  });
  try {
    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'repair-work-unit-fingerprint-v1\n', 'utf8');
    fs.writeFileSync(path.join(fixtureRoot, 'context-version'), 'v1\n', 'utf8');
    for (let index = 0; index < 3; index += 1) {
      runCli(['family-runtime', 'tick', '--source', `dm002-repair-v1-${index}`, '--hydrate'], env);
    }
    const deadLetterQueue = runCli(['family-runtime', 'queue', 'list'], env);
    const deadLetterTask = deadLetterQueue.family_runtime_queue.tasks[0];
    assert.equal(deadLetterTask.status, 'dead_letter');
    assert.equal(deadLetterTask.attempts, 3);
    assert.equal(
      deadLetterTask.payload.repair_work_unit.source_fingerprint,
      'repair-work-unit-fingerprint-v1',
    );

    fs.writeFileSync(path.join(fixtureRoot, 'context-version'), 'v2\n', 'utf8');
    const sameFingerprint = runCli(['family-runtime', 'tick', '--source', 'dm002-repair-v1-repeat', '--hydrate'], env);
    assert.equal(sameFingerprint.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(sameFingerprint.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(sameFingerprint.family_runtime_tick.selected_count, 0);

    fs.writeFileSync(path.join(fixtureRoot, 'fingerprint'), 'repair-work-unit-fingerprint-v2\n', 'utf8');
    const updatedFingerprint = runCli(['family-runtime', 'tick', '--source', 'dm002-repair-v2', '--hydrate'], env);
    const refreshed = runCli(['family-runtime', 'queue', 'inspect', deadLetterTask.task_id], env);
    const task = refreshed.family_runtime_task.task;
    const events = refreshed.family_runtime_task.events;
    const dispatchedTask = parseJsonText(fs.readFileSync(dispatchedTaskPath, 'utf8')) as any;

    assert.equal(updatedFingerprint.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(updatedFingerprint.family_runtime_tick.hydration.requeued_count, 1);
    assert.equal(updatedFingerprint.family_runtime_tick.selected_count, 1);
    assert.equal(updatedFingerprint.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.attempts, 1);
    assert.equal(
      task.payload.repair_work_unit.source_fingerprint,
      'repair-work-unit-fingerprint-v2',
    );
    assert.equal(
      dispatchedTask.payload.repair_work_unit.source_fingerprint,
      'repair-work-unit-fingerprint-v2',
    );
    assert.equal(
      events.some((event: { event_type: string; payload: { reason?: string } }) =>
        event.event_type === 'task_requeued_from_dead_letter_after_domain_owner_update'
        && event.payload.reason === 'domain_export_source_fingerprint_changed_after_dead_letter'
      ),
      true,
    );
    assert.equal(fs.readFileSync(dispatchCountPath, 'utf8').trim(), '4');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
