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
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
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
db.close();`,
    ], {
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
