import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string) {
  return {
    OPL_STATE_DIR: stateRoot,
  };
}

test('family-runtime attempt query exposes refs-only usage projection from observed attempt ledgers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-usage-projection-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--retry-budget',
      '{"max_attempts":4,"cadence_ref":"cadence:daily"}',
      '--source-fingerprint',
      'sha256:usage-projection',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const updateUsageSql = `
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
const row = db.prepare('SELECT provider_run_json, activity_events_json FROM stage_attempts WHERE stage_attempt_id = ?').get(${JSON.stringify(attemptId)});
const providerRun = {
  ...JSON.parse(row.provider_run_json),
  provider_status: 'running',
  started_at: '2026-05-16T00:00:00.000Z',
  completed_at: '2026-05-16T00:07:30.000Z',
  usage_projection: {
    api_call_count: 3,
    cadence_ref: 'cadence:provider-heartbeat'
  }
};
const events = JSON.parse(row.activity_events_json);
events.push({
  event_time: '2026-05-16T00:05:00.000Z',
  activity_kind: 'codex_stage_activity',
  activity_status: 'checkpointed',
  duration_ms: 420000,
  api_call_count: 2,
  cost_summary: {
    cost_status: 'observed',
    estimated_cost_usd: 0.42,
    token_usage: {
      input_tokens: 1200,
      output_tokens: 340,
      total_tokens: 1540
    }
  }
});
db.prepare('UPDATE stage_attempts SET provider_run_json = ?, activity_events_json = ? WHERE stage_attempt_id = ?').run(JSON.stringify(providerRun), JSON.stringify(events), ${JSON.stringify(attemptId)});
db.close();`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '-e', updateUsageSql], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--checkpoint-ref',
      'checkpoint:usage-midpoint',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:usage-closeout"],"domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"continue","usage_projection":{"usage_ref":"usage:closeout","token_usage":{"input_tokens":200,"output_tokens":80,"total_tokens":280},"estimated_cost_usd":0.09,"api_call_count":1,"duration_ms":30000,"cadence_ref":"cadence:closeout-retro"}}}',
    ], familyRuntimeEnv(stateRoot));

    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const projection = query.family_runtime_stage_attempt_query.stage_attempt_query.usage_projection;
    const visibility = query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility;

    assert.equal(projection.surface_kind, 'opl_stage_attempt_usage_projection');
    assert.equal(projection.projection_scope, 'stage_attempt');
    assert.equal(projection.availability, 'usage_observed');
    assert.equal(projection.token.observed_count, 2);
    assert.equal(projection.token.total_tokens_observed, 1820);
    assert.equal(projection.cost.estimated_cost_usd_observed, 0.51);
    assert.equal(projection.api_calls.count_observed, 6);
    assert.equal(projection.duration.observed_count, 3);
    assert.equal(projection.cadence.observed_count, 3);
    assert.equal(projection.retry_budget.max_attempts, 4);
    assert.equal(projection.retry_budget.used_attempts, 1);
    assert.equal(projection.retry_budget.remaining_attempts, 3);
    assert.equal(projection.retry_budget.pressure_status, 'retry_budget_available');
    assert.equal(projection.source_refs.includes(`stage_attempt:${attemptId}#retry_budget`), true);
    assert.equal(projection.source_refs.includes(`stage_attempt:${attemptId}#route_impact.usage_projection`), true);
    assert.equal(projection.authority_boundary.can_change_executor, false);
    assert.equal(projection.authority_boundary.can_auto_degrade, false);
    assert.equal(visibility.usage_projection.token.total_tokens_observed, 1820);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query marks missing telemetry as unavailable instead of zero observed usage', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-usage-unavailable-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'paper-repair',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--retry-budget',
      '{"max_attempts":2}',
      '--source-fingerprint',
      'sha256:usage-unavailable',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;

    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const projection = query.family_runtime_stage_attempt_query.stage_attempt_query.usage_projection;

    assert.equal(projection.availability, 'usage_unavailable');
    assert.equal(projection.telemetry_status, 'missing');
    assert.equal(projection.token.total_tokens_observed, null);
    assert.equal(projection.cost.estimated_cost_usd_observed, null);
    assert.equal(projection.duration.duration_ms_observed, null);
    assert.equal(projection.missing_usage_telemetry_reason, 'no_stage_attempt_usage_telemetry_observed');
    assert.equal(projection.retry_budget.pressure_status, 'retry_budget_available');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query exposes a unified stage progress log with intent actual usage and timeline', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-stage-progress-log-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'paper-repair',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        runtime_root: '/tmp/mas/runtime',
        artifact_root: '/tmp/mas/artifacts',
        profile_ref: 'profile:dm002',
        dispatch_ref: 'dispatch:dm002/paper-repair',
        source_refs: ['source:dm002/manuscript'],
        stage_packet_ref: 'packet:dm002/paper-repair',
      }),
      '--retry-budget',
      '{"max_attempts":3,"cadence_ref":"cadence:hourly"}',
      '--source-fingerprint',
      'sha256:dm002-paper-repair',
      '--task',
      'task-dm002-paper-repair',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--checkpoint-ref',
      'checkpoint:dm002-paper-repair-midpoint',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:dm002-paper-repair-closeout'],
        consumed_refs: ['evidence:figure5-layout'],
        consumed_memory_refs: ['memory:dm002-review-feedback'],
        writeback_receipt_refs: ['memory-writeback:dm002-paper-repair'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          owner_receipt_refs: ['owner-receipt:mas/dm002/paper-repair'],
          typed_blocker_refs: ['typed-blocker:mas/dm002/reviewer-refresh-required'],
          usage_projection: {
            token_usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
            estimated_cost_usd: 0.02,
            duration_ms: 120000,
          },
        },
      }),
    ], familyRuntimeEnv(stateRoot));
    const updateUsageSql = `
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
const row = db.prepare('SELECT provider_run_json, activity_events_json FROM stage_attempts WHERE stage_attempt_id = ?').get(${JSON.stringify(attemptId)});
const providerRun = {
  ...JSON.parse(row.provider_run_json),
  provider_status: 'completed',
  started_at: '2026-05-27T00:00:00.000Z',
  completed_at: '2026-05-27T00:18:00.000Z',
  last_heartbeat_at: '2026-05-27T00:17:00.000Z'
};
const events = JSON.parse(row.activity_events_json);
events.push({
  event_time: '2026-05-27T00:10:00.000Z',
  event_kind: 'codex_stage_progress',
  stage_packet_ref: 'packet:dm002/paper-repair',
  activity_kind: 'codex_stage_activity',
  activity_status: 'checkpointed',
  duration_ms: 600000,
  cost_summary: {
    token_usage: {
      input_tokens: 2000,
      output_tokens: 900,
      total_tokens: 2900
    },
    estimated_cost_usd: 0.37
  }
});
db.prepare('UPDATE stage_attempts SET provider_run_json = ?, activity_events_json = ? WHERE stage_attempt_id = ?').run(JSON.stringify(providerRun), JSON.stringify(events), ${JSON.stringify(attemptId)});
db.close();`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '-e', updateUsageSql], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const log = query.family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log;

    assert.equal(log.surface_kind, 'opl_stage_progress_log');
    assert.equal(log.projection_scope, 'stage_attempt');
    assert.equal(log.stage_attempt_id, attemptId);
    assert.equal(log.temporal_visibility, null);
    assert.equal(log.temporal_webui_ref, null);
    assert.equal(log.intended_work.domain_id, 'medautoscience');
    assert.equal(log.intended_work.stage_id, 'paper-repair');
    assert.equal(log.intended_work.task_id, 'task-dm002-paper-repair');
    assert.equal(log.intended_work.source_fingerprint, 'sha256:dm002-paper-repair');
    assert.deepEqual(log.intended_work.stage_packet_refs, ['packet:dm002/paper-repair']);
    assert.deepEqual(log.intended_work.source_refs, ['source:dm002/manuscript']);
    assert.equal(log.intended_work.retry_budget.max_attempts, 3);
    assert.equal(log.actual_work.status, 'completed');
    assert.equal(log.actual_work.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(log.actual_work.next_owner, 'med-autoscience');
    assert.equal(log.actual_work.domain_ready_verdict, 'domain_gate_pending');
    assert.deepEqual(log.actual_work.closeout_refs, ['receipt:dm002-paper-repair-closeout']);
    assert.deepEqual(log.evidence_refs.owner_receipt_refs, ['owner-receipt:mas/dm002/paper-repair']);
    assert.deepEqual(log.evidence_refs.typed_blocker_refs, ['typed-blocker:mas/dm002/reviewer-refresh-required']);
    assert.equal(log.evidence_refs.activity_event_count >= 2, true);
    assert.equal(log.timeline.provider_started_at, '2026-05-27T00:00:00.000Z');
    assert.equal(log.timeline.provider_completed_at, '2026-05-27T00:18:00.000Z');
    assert.equal(log.timeline.last_heartbeat_at, '2026-05-27T00:17:00.000Z');
    assert.equal(log.timeline.duration_ms_observed, 1800000);
    assert.equal(log.timeline.duration_telemetry_status, 'observed');
    assert.equal(log.usage.token.total_tokens_observed, 3040);
    assert.equal(log.usage.cost.estimated_cost_usd_observed, 0.39);
    assert.equal(log.authority_boundary.can_execute_domain_action, false);
    assert.equal(log.authority_boundary.can_write_domain_truth, false);
    assert.equal(log.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(
      query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.stage_progress_log.stage_attempt_id,
      attemptId,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot projects stage attempt usage pressure into workbench groups and tray items', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-usage-workbench-'));
  try {
    const completed = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--retry-budget',
      '{"max_attempts":3}',
    ], familyRuntimeEnv(stateRoot));
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      completed.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"domain_ready_verdict":"domain_gate_pending","route_impact":{"usage_projection":{"usage_ref":"usage:analysis","api_call_count":1}}}',
    ], familyRuntimeEnv(stateRoot));

    const deadLetter = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'draft',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
      '--retry-budget',
      '{"max_attempts":1}',
    ], familyRuntimeEnv(stateRoot));
    const deadLetterAttemptId = deadLetter.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const updateStatusSql = [
      "import { DatabaseSync } from 'node:sqlite';",
      `const db = new DatabaseSync(${JSON.stringify(queueDb)});`,
      `db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(deadLetterAttemptId)});`,
      'db.close();',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '-e', updateStatusSql], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const output = runCli(['runtime', 'snapshot'], familyRuntimeEnv(stateRoot));
    const workbench = output.runtime_tray_snapshot.stage_attempt_workbench;
    const deadLetterAttempt = workbench.attempts.find((attempt: { stage_attempt_id: string }) =>
      attempt.stage_attempt_id === deadLetterAttemptId
    );

    assert.equal(workbench.summary.usage_projection.surface_kind, 'opl_stage_attempt_usage_projection_summary');
    assert.equal(workbench.summary.usage_projection.observed_attempt_count, 2);
    assert.equal(workbench.summary.usage_projection.retry_pressure_attempt_count, 1);
    assert.equal(workbench.summary.usage_projection.retry_budget_exhausted_count, 1);
    assert.equal(workbench.stage_progress_log.surface_kind, 'opl_stage_progress_log_summary');
    assert.equal(workbench.stage_progress_log.summary.attempt_count, 2);
    assert.equal(workbench.stage_progress_log.summary.usage_unavailable_attempt_count, 1);
    assert.equal(workbench.stage_progress_log.summary.temporal_visibility_count, 0);
    assert.equal(workbench.stage_progress_log.summary.temporal_webui_ref_count, 0);
    assert.equal(workbench.groups.by_domain.medautoscience.usage_projection.observed_attempt_count, 1);
    assert.equal(workbench.groups.by_domain.medautogrant.usage_projection.retry_budget_exhausted_count, 1);
    assert.equal(deadLetterAttempt.usage_projection.retry_budget.pressure_status, 'retry_budget_exhausted');
    assert.equal(deadLetterAttempt.filter_keys.retry_budget_pressure, true);
    assert.equal(workbench.filter_metadata.usage_projection_flags.includes('retry_budget_pressure'), true);
    const deadLetterItem = [...output.runtime_tray_snapshot.attention_items, ...output.runtime_tray_snapshot.recent_items]
      .find((item: { item_id: string }) => item.item_id === `opl:stage-attempt:${deadLetterAttemptId}`);
    assert.equal(
      deadLetterItem.stage_attempt_workbench.usage_projection.retry_budget.pressure_status,
      'retry_budget_exhausted',
    );
    assert.equal(
      deadLetterItem.stage_attempt_workbench.stage_progress_log.stage_attempt_id,
      deadLetterAttemptId,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
