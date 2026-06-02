import { DatabaseSync } from 'node:sqlite';

import { assert, createGitModuleRemoteFixture, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';

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

test('family-runtime hydrate keeps succeeded MAS default executor dispatch terminal after module owner update', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-succeeded-owner-redrive-home-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-profile-succeeded-owner-redrive-'));
  const profilePath = path.join(fixtureRoot, 'dm-cvd.workspace.toml');
  const uvPath = path.join(fixtureRoot, 'uv');
  const uvArgvPath = path.join(fixtureRoot, 'uv.argv');
  const uvCwdPath = path.join(fixtureRoot, 'uv.cwd');
  const masFixture = createGitModuleRemoteFixture('med-autoscience');
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  writeNodeScript(uvPath, `
const fs = require('node:fs');
const args = process.argv.slice(1);
fs.writeFileSync(${jsString(uvCwdPath)}, process.cwd() + '\\n');
fs.writeFileSync(${jsString(uvArgvPath)}, args.map(String).join('\\n') + '\\n');
const joined = \` \${args.join(' ')} \`;
if (joined.includes(' domain-handler export ')) {
  process.stdout.write(JSON.stringify({
    surface_kind: 'mas_family_domain_handler_export',
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        priority: 70,
        source: 'mas-domain-handler-export',
        dedupe_key: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:owner-update',
        dispatch_owner: 'one-person-lab',
        profile_name: 'dm-cvd',
        domain_truth_owner: 'med-autoscience',
        queue_owner: 'one-person-lab',
        payload: {
          profile: 'dm-cvd.workspace.toml',
          study_id: '002-dm-china-us-mortality-attribution',
          quest_id: '002-dm-china-us-mortality-attribution',
          action_type: 'return_to_ai_reviewer_workflow',
          work_unit_id: 'ai_reviewer_medical_prose_quality_review',
          dispatch_authority: 'consumer_default_executor_dispatch',
          next_executable_owner: 'ai_reviewer',
          executor_kind: 'codex_cli_default',
          dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
          authority_boundary: 'mas_default_executor_dispatch_request_only',
          source_fingerprint: 'truth-snapshot::1076da525000e7809211865d',
        },
      },
    ],
  }) + '\\n');
  process.exit(0);
}
if (joined.includes(' domain-handler dispatch ')) {
  process.stdout.write(JSON.stringify({
    accepted: true,
    surface_kind: 'mas_family_domain_handler_dispatch_receipt',
    receipt_ref: 'receipt:dm002/ai-reviewer-owner',
  }) + '\\n');
  process.exit(0);
}
process.stderr.write(\`unexpected uv command: \${args.join(' ')}\\n\`);
process.exit(64);
`);
  const env = familyRuntimeEnv(path.join(homeRoot, 'opl-state'), {
    HOME: homeRoot,
    PATH: `${fixtureRoot}:${process.env.PATH ?? ''}`,
    OPL_MODULES_ROOT: path.join(homeRoot, 'managed-modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: masFixture.sourceRoot,
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_PROFILE: profilePath,
  });
  try {
    const firstTick = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-owner-v1',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const taskId = firstTick.family_runtime_tick.dispatches[0].task_id;
    const firstTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const firstOwnerFingerprint = firstTask.family_runtime_task.task.payload.opl_domain_export_context.owner_fingerprint;
    assert.equal(firstTick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(firstTick.family_runtime_tick.selected_count, 1);
    assert.equal(firstTick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(firstTask.family_runtime_task.task.status, 'blocked');
    assert.equal(firstTask.family_runtime_task.stage_attempts.length, 1);
    const firstAttemptId = firstTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      firstAttemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'domain_stage_closeout_packet',
        closeout_refs: ['receipt:dm002/ai-reviewer-owner-v1'],
        domain_ready_verdict: 'domain_gate_pending',
      }),
    ], env);
    const db = new DatabaseSync(path.join(homeRoot, 'opl-state', 'family-runtime', 'queue.sqlite'));
    try {
      db.prepare(`
        UPDATE tasks
        SET status = 'succeeded', last_error = NULL, dead_letter_reason = NULL,
          lease_owner = NULL, lease_expires_at = NULL
        WHERE task_id = ?
      `).run(taskId);
    } finally {
      db.close();
    }
    const succeededTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(succeededTask.family_runtime_task.task.status, 'succeeded');

    const sameOwner = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-owner-v1-repeat',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    assert.equal(sameOwner.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(sameOwner.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(sameOwner.family_runtime_tick.selected_count, 0);

    const nextSha = masFixture.advance('owner-surface.txt', 'ai reviewer validator restored\n', 'Restore reviewer owner');
    const updatedOwner = runCli([
      'family-runtime',
      'tick',
      '--source',
      'dm002-owner-v2',
      '--hydrate',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const refreshed = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const task = refreshed.family_runtime_task.task;
    const attempts = refreshed.family_runtime_task.stage_attempts;
    const events = refreshed.family_runtime_task.events;

    assert.equal(updatedOwner.family_runtime_tick.hydration.enqueued_count, 0);
    assert.equal(updatedOwner.family_runtime_tick.hydration.idempotent_noop_count, 1);
    assert.equal(updatedOwner.family_runtime_tick.selected_count, 0);
    assert.equal(updatedOwner.family_runtime_tick.dispatches.length, 0);
    assert.equal(task.status, 'succeeded');
    assert.equal(attempts.length, 1);
    assert.notEqual(task.payload.opl_domain_export_context.owner_fingerprint, firstOwnerFingerprint);
    assert.match(task.payload.opl_domain_export_context.owner_fingerprint, new RegExp(nextSha));
    assert.equal(
      events.some((event: { event_type: string; payload: { reason?: string } }) =>
        event.event_type === 'task_metadata_refreshed_from_domain_export'
        && event.payload.reason === 'domain_export_owner_fingerprint_changed_after_succeeded'
      ),
      true,
    );
    assert.equal(
      fs.realpathSync(fs.readFileSync(uvCwdPath, 'utf8').trim()),
      fs.realpathSync(masFixture.sourceRoot),
    );
  } finally {
    fs.rmSync(masFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
