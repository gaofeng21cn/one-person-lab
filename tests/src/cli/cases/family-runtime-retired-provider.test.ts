import { DatabaseSync } from 'node:sqlite';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { createFamilyRuntimeQueueTables } from '../../../../src/modules/runway/family-runtime-store.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime attempt list keeps retired local_sqlite attempts as diagnostics', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-retired-provider-'));
  const queueDbPath = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  try {
    fs.mkdirSync(path.dirname(queueDbPath), { recursive: true });
    const db = new DatabaseSync(queueDbPath);
    createFamilyRuntimeQueueTables(db);
    const now = '2026-01-01T00:00:00.000Z';
    db.prepare(`
      INSERT INTO stage_attempts (
        stage_attempt_id, idempotency_key, provider_kind, workflow_id,
        domain_id, stage_id, workspace_locator_json, source_fingerprint,
        executor_kind, stage_attempt_executor_policy_json, status,
        checkpoint_refs_json, closeout_refs_json, human_gate_refs_json,
        retry_budget_json, attempt_count, task_id, blocked_reason,
        provider_receipt_json, provider_run_json, activity_events_json,
        route_impact_json, closeout_receipt_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sat_retired_local_sqlite',
      'idem_retired_local_sqlite',
      'local_sqlite',
      'wf_retired_local_sqlite',
      'medautoscience',
      'legacy-local-stage',
      '{"workspace_root":"/tmp/mas"}',
      null,
      'codex_cli',
      null,
      'blocked',
      '[]',
      '[]',
      '[]',
      '{"max_attempts":3,"used_attempts":1,"remaining_attempts":2}',
      1,
      null,
      'operator_retired_stale_runtime_residue:probe',
      '{}',
      '{}',
      '[]',
      '{}',
      null,
      now,
      now,
    );
    db.close();

    const output = runCli(['family-runtime', 'attempt', 'list', '--full'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    }));
    const metadata = output.family_runtime_stage_attempts.provider_runtime_metadata;
    const attempt = output.family_runtime_stage_attempts.attempts[0];

    assert.equal(metadata.selected_runtime_provider, 'temporal');
    assert.equal(metadata.retired_env_diagnostic.configured_provider, 'local_sqlite');
    assert.equal(
      metadata.retired_env_diagnostic.diagnostic_status,
      'retired_env_provider_ignored_for_attempt_projection',
    );
    assert.equal(output.family_runtime_stage_attempts.summary.total, 1);
    assert.equal(attempt.provider_kind, 'local_sqlite');
    assert.equal(attempt.current_provider_readiness.provider_kind, 'local_sqlite');
    assert.equal(attempt.current_provider_readiness.status, 'retired_runtime_provider');
    assert.equal(attempt.current_provider_readiness.degraded_reason, 'local_sqlite_retired_runtime_provider');
    assert.equal(attempt.provider_liveness_attention.reason, 'local_sqlite_retired_runtime_provider');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
