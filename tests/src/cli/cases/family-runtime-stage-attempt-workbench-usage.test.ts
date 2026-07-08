import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string) {
  return {
    OPL_STATE_DIR: stateRoot,
  };
}

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
      'temporal',
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
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:analysis-closeout'],
        domain_ready_verdict: 'domain_gate_pending',
        user_stage_log: {
          stage_name: 'Analysis campaign evidence projection',
          problem_summary: 'The analysis campaign needed a refs-only progress projection for the operator.',
          stage_goal: 'Project the attempt history without interpreting MAS study truth.',
          stage_work_done: ['Projected the completed analysis attempt into the workbench history.'],
          changed_stage_surfaces: ['stage_attempt_workbench'],
          outcome: 'completed_with_domain_gate_pending',
          remaining_blockers: ['MAS owner receipt still owns domain-ready status.'],
          evidence_refs: ['receipt:analysis-closeout'],
          usage_refs: ['usage:analysis'],
          cost_refs: ['cost:analysis'],
        },
        route_impact: {
          usage_projection: {
            usage_ref: 'usage:analysis',
            api_call_count: 1,
          },
          model_route: {
            selected_model_ref: 'model-profile:codex/gpt-5.3-codex-high',
            selected_model: 'gpt-5.3-codex',
            executor_route_ref: 'executor-route:codex-cli/default',
            route_ref: 'model-route:pilotdeck/clean-room-intake',
            route_reason_ref: 'route-reason:pilotdeck/clean-room-intake',
            route_tier_ref: 'route-tier:premium-reasoning',
            fallback_refs: ['fallback-route:disabled/no-auto-degrade'],
          },
        },
      }),
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
      'temporal',
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
    assert.equal(workbench.summary.model_route_cost_projection.surface_kind, 'opl_model_route_cost_projection_summary');
    assert.equal(workbench.summary.model_route_cost_projection.route_observed_attempt_count, 1);
    assert.equal(workbench.summary.model_route_cost_projection.token_linked_attempt_count, 0);
    assert.equal(workbench.summary.model_route_cost_projection.cost_linked_attempt_count, 0);
    assert.deepEqual(workbench.summary.model_route_cost_projection.selected_model_refs, [
      'model-profile:codex/gpt-5.3-codex-high',
    ]);
    assert.equal(workbench.summary.stage_progress_log.surface_kind, 'opl_stage_progress_log_summary');
    assert.equal(workbench.summary.stage_progress_log.attempt_count, 2);
    assert.equal(workbench.summary.stage_progress_log.duration_observed_attempt_count, 1);
    assert.equal(workbench.summary.stage_progress_log.user_duration_observed_attempt_count, 2);
    assert.equal(workbench.summary.stage_progress_log.user_duration_fallback_attempt_count, 1);
    assert.equal(workbench.summary.stage_progress_log.missing_usage_telemetry_attempt_count, 1);
    assert.equal(workbench.summary.stage_progress_log.temporal_attempt_count, 0);
    assert.equal(workbench.summary.stage_progress_log.temporal_webui_ref_count, 0);
    assert.equal(workbench.summary.attempt_history.surface_kind, 'opl_stage_attempt_history_projection');
    assert.equal(workbench.summary.attempt_history.attempt_count, 2);
    assert.equal(workbench.attempt_history.attempt_count, 2);
    const historyEntry = workbench.attempt_history.entries.find((entry: { stage_attempt_id: string }) =>
      entry.stage_attempt_id === completed.family_runtime_stage_attempt.attempt.stage_attempt_id
    );
    const deadLetterHistoryEntry = workbench.attempt_history.entries.find((entry: { stage_attempt_id: string }) =>
      entry.stage_attempt_id === deadLetterAttemptId
    );
    assert.equal(historyEntry.task_id, null);
    assert.equal(historyEntry.stage_name, 'Analysis campaign evidence projection');
    assert.equal(
      historyEntry.problem_summary,
      'The analysis campaign needed a refs-only progress projection for the operator.',
    );
    assert.deepEqual(historyEntry.stage_work_done, [
      'Projected the completed analysis attempt into the workbench history.',
    ]);
    assert.deepEqual(historyEntry.changed_stage_surfaces, ['stage_attempt_workbench']);
    assert.equal(historyEntry.token_usage.status, 'missing');
    assert.equal(historyEntry.cost.status, 'missing');
    assert.equal(historyEntry.observability_status, 'missing');
    assert.deepEqual(historyEntry.missing_observability_fields, ['token_usage', 'cost']);
    assert.equal(historyEntry.duration.status, 'observed');
    assert.equal(historyEntry.duration.duration_telemetry_status, 'observed');
    assert.equal(historyEntry.duration.telemetry_fallback_used, false);
    assert.equal(deadLetterHistoryEntry.observability_status, 'missing');
    assert.deepEqual(deadLetterHistoryEntry.missing_observability_fields, ['token_usage', 'cost']);
    assert.equal(deadLetterHistoryEntry.duration.status, 'observed');
    assert.equal(deadLetterHistoryEntry.duration.duration_telemetry_status, 'missing');
    assert.equal(deadLetterHistoryEntry.duration.telemetry_fallback_used, true);
    assert.equal(historyEntry.outcome, 'completed_with_domain_gate_pending');
    assert.deepEqual(historyEntry.remaining_blockers, ['MAS owner receipt still owns domain-ready status.']);
    assert.equal(historyEntry.usage_refs.includes('usage:analysis'), true);
    assert.equal(historyEntry.cost_refs.includes('cost:analysis'), true);
    assert.equal(
      historyEntry.stage_progress_log_ref,
      `/stage_attempt_workbench/attempts/${completed.family_runtime_stage_attempt.attempt.stage_attempt_id}/stage_progress_log`,
    );
    assert.equal(historyEntry.authority_boundary.can_write_domain_truth, false);
    assert.equal(workbench.attempt_history.authority_boundary.can_infer_domain_semantics, false);
    assert.equal(workbench.groups.by_domain.medautoscience.usage_projection.observed_attempt_count, 1);
    assert.deepEqual(workbench.groups.by_domain.medautoscience.model_route_cost_projection.route_refs, [
      'model-route:pilotdeck/clean-room-intake',
    ]);
    assert.equal(workbench.groups.by_domain.medautogrant.usage_projection.retry_budget_exhausted_count, 1);
    assert.equal(deadLetterAttempt.usage_projection.retry_budget.pressure_status, 'retry_budget_exhausted');
    assert.equal(deadLetterAttempt.model_route_cost_projection.availability, 'model_route_unavailable');
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
    assert.equal(
      deadLetterItem.stage_attempt_workbench.model_route_cost_projection.availability,
      'model_route_unavailable',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
