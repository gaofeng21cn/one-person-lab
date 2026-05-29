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
    usage_ref: 'codex_session_usage:session-usage-projection#sha256:abc123',
    session_usage_refs: {
      session_ref: 'codex_session:session-usage-projection',
      time_window: {
        started_at: '2026-05-16T00:00:00.000Z',
        completed_at: '2026-05-16T00:05:00.000Z'
      },
      token_delta: {
        input_tokens: 1200,
        output_tokens: 340,
        total_tokens: 1540
      },
      source_path: '/tmp/codex-home/sessions/2026/05/16/session-usage-projection.jsonl',
      source_hash: 'sha256:abc123',
      billing_boundary: 'refs_only_absolute_cumulative_total_delta'
    },
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
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:usage-closeout'],
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'continue',
          model_route: {
            selected_model_ref: 'model-profile:codex/gpt-5.3-codex-high',
            selected_model: 'gpt-5.3-codex',
            executor_route_ref: 'executor-route:codex-cli/default',
            route_ref: 'model-route:pilotdeck/clean-room-intake',
            route_reason: 'pilotdeck_clean_room_intake_requires_high_context',
            route_reason_ref: 'route-reason:pilotdeck/clean-room-intake',
            route_tier: 'premium_reasoning',
            route_tier_ref: 'route-tier:premium-reasoning',
            fallback_refs: ['fallback-route:disabled/no-auto-degrade'],
          },
          usage_projection: {
            usage_ref: 'usage:closeout',
            token_usage: { input_tokens: 200, output_tokens: 80, total_tokens: 280 },
            estimated_cost_usd: 0.09,
            api_call_count: 1,
            duration_ms: 30000,
            cadence_ref: 'cadence:closeout-retro',
          },
        },
      }),
    ], familyRuntimeEnv(stateRoot));

    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const projection = query.family_runtime_stage_attempt_query.stage_attempt_query.usage_projection;
    const modelRouteCost =
      query.family_runtime_stage_attempt_query.stage_attempt_query.model_route_cost_projection;
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
    assert.equal(projection.token.source_refs.includes('codex_session_usage:session-usage-projection#sha256:abc123'), true);
    assert.equal(projection.source_refs.includes('codex_session:session-usage-projection'), true);
    assert.equal(projection.authority_boundary.can_change_executor, false);
    assert.equal(projection.authority_boundary.can_auto_degrade, false);
    assert.equal(modelRouteCost.surface_kind, 'opl_model_route_cost_projection');
    assert.equal(modelRouteCost.projection_scope, 'stage_attempt');
    assert.equal(modelRouteCost.availability, 'model_route_cost_observed');
    assert.equal(modelRouteCost.selected_model.model_ref, 'model-profile:codex/gpt-5.3-codex-high');
    assert.equal(modelRouteCost.selected_model.model, 'gpt-5.3-codex');
    assert.equal(modelRouteCost.selected_executor.executor_kind, 'codex_cli');
    assert.deepEqual(modelRouteCost.selected_executor.route_refs, ['executor-route:codex-cli/default']);
    assert.deepEqual(modelRouteCost.route.route_refs, ['model-route:pilotdeck/clean-room-intake']);
    assert.equal(modelRouteCost.route.reason, 'pilotdeck_clean_room_intake_requires_high_context');
    assert.deepEqual(modelRouteCost.route.reason_refs, ['route-reason:pilotdeck/clean-room-intake']);
    assert.equal(modelRouteCost.route.tier, 'premium_reasoning');
    assert.deepEqual(modelRouteCost.route.tier_refs, ['route-tier:premium-reasoning']);
    assert.deepEqual(modelRouteCost.route.fallback_refs, ['fallback-route:disabled/no-auto-degrade']);
    assert.equal(modelRouteCost.observed_usage_linkage.token.total_tokens_observed, 1820);
    assert.equal(modelRouteCost.observed_usage_linkage.cost.estimated_cost_usd_observed, 0.51);
    assert.deepEqual(modelRouteCost.observed_usage_linkage.token.source_refs, projection.token.source_refs);
    assert.deepEqual(modelRouteCost.observed_usage_linkage.cost.source_refs, projection.cost.source_refs);
    assert.equal(modelRouteCost.authority_boundary.can_change_executor, false);
    assert.equal(modelRouteCost.authority_boundary.can_auto_degrade, false);
    assert.equal(modelRouteCost.authority_boundary.can_replace_quality_gate, false);
    assert.equal(visibility.usage_projection.token.total_tokens_observed, 1820);
    assert.equal(
      visibility.model_route_cost_projection.selected_model.model_ref,
      'model-profile:codex/gpt-5.3-codex-high',
    );
    assert.equal(
      query.family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log
        .model_route_cost_projection.observed_usage_linkage.cost.estimated_cost_usd_observed,
      0.51,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query marks missing resource telemetry as retry-budget-only instead of zero usage', () => {
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

    assert.equal(projection.availability, 'retry_budget_observed');
    assert.equal(projection.telemetry_status, 'missing');
    assert.equal(projection.missing_usage_telemetry_reason, 'no_stage_attempt_usage_telemetry_observed');
    assert.equal(projection.token.total_tokens_observed, null);
    assert.equal(projection.cost.estimated_cost_usd_observed, null);
    assert.equal(projection.duration.duration_ms_observed, null);
    assert.equal(projection.token.observed_count, 0);
    assert.equal(projection.cost.observed_count, 0);
    assert.equal(projection.duration.observed_count, 0);
    assert.equal(projection.retry_budget.pressure_status, 'retry_budget_available');

    const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
    const updateAttemptClockSql = `
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
db.prepare('UPDATE stage_attempts SET created_at = ?, updated_at = ? WHERE stage_attempt_id = ?').run('2026-05-27T01:00:00.000Z', '2026-05-27T01:10:00.000Z', ${JSON.stringify(attemptId)});
db.close();`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '-e', updateAttemptClockSql], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
      },
    });
    assert.equal(result.status, 0, result.stderr);

    const stageProgressQuery = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const userStageLog =
      stageProgressQuery.family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log.user_stage_log;

    assert.equal(userStageLog.surface_kind, 'opl_user_stage_log');
    assert.equal(userStageLog.semantic_status, 'missing_domain_semantic_summary');
    assert.equal(userStageLog.stage_name, 'medautoscience/paper-repair');
    assert.equal(userStageLog.problem_summary, null);
    assert.equal(userStageLog.progress_delta_classification, 'typed_blocker');
    assert.deepEqual(userStageLog.deliverable_progress_delta, {
      delta_count: 0,
      delta_refs: [],
      delta_summary: null,
      has_deliverable_delta: false,
    });
    assert.deepEqual(userStageLog.platform_repair_delta, {
      delta_count: 0,
      delta_refs: [],
      delta_summary: null,
      has_platform_repair_delta: false,
    });
    assert.equal(userStageLog.next_forced_delta, 'domain_user_stage_log_or_typed_blocker_with_lineage_required');
    assert.deepEqual(userStageLog.stage_work_done, []);
    assert.deepEqual(userStageLog.paper_work_done, []);
    assert.deepEqual(userStageLog.semantic_gap.required_domain_fields, [
      'stage_name',
      'problem_summary',
      'stage_goal',
      'stage_work_done',
      'changed_stage_surfaces',
      'outcome',
      'remaining_blockers',
    ]);
    assert.equal(userStageLog.duration.duration_ms, 600000);
    assert.equal(userStageLog.duration.duration_source, 'stage_attempt_created_updated_at_fallback');
    assert.equal(userStageLog.duration.telemetry_fallback_used, true);
    assert.equal(userStageLog.observability_status, 'missing');
    assert.deepEqual(userStageLog.missing_observability_fields, ['duration', 'token_usage', 'cost']);
    assert.equal(userStageLog.token_usage.status, 'missing');
    assert.equal(userStageLog.token_usage.total_tokens, null);
    assert.equal(
      userStageLog.semantic_gap.reason,
      'domain_closeout_did_not_provide_user_stage_log',
    );
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
        consumed_memory_refs: ['memory:dm002-review-feedback', 'memory:dm002-review-feedback'],
        writeback_receipt_refs: ['memory-writeback:dm002-paper-repair'],
        rejected_writes: [
          {
            ref: 'memory-rejected-write:dm002-paper-repair/unsafe-body',
            memory_body: 'domain-owned rejected write body must not be projected',
            reason: 'domain_truth_write_forbidden',
          },
        ],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        paper_stage_log: {
          stage_name: 'DM002 manuscript reporting consistency repair',
          problem_summary: 'The manuscript had inconsistent Methods and Results reporting around model validation, display provenance, and Figure 5/Table support.',
          stage_goal: 'Make the current manuscript explain the fixed validation cohort and align the paper-facing displays with the same evidence base.',
          progress_delta_classification: 'deliverable_progress',
          deliverable_progress_delta: {
            delta_count: 3,
            delta_refs: [
              'manuscript:methods-validation-cohort',
              'manuscript:results-table-figure-alignment',
              'manuscript:deployment-language-boundary',
            ],
            delta_summary: 'Canonical manuscript and display-provenance surfaces changed.',
          },
          platform_repair_delta: {
            delta_count: 0,
            delta_refs: [],
            delta_summary: null,
          },
          next_forced_delta: 'ai_reviewer_current_record_or_stable_typed_blocker',
          paper_work_done: [
            'Clarified the complete-case validation sample and fixed predictor set in Methods.',
            'Aligned Table 1, Table 2, and Figure 5 claims to the same validation evidence.',
            'Kept absolute-risk and deployment language bounded until recalibration evidence is available.',
          ],
          changed_paper_surfaces: [
            'manuscript draft',
            'review manuscript',
            'display provenance ledger',
          ],
          outcome: 'paper_repair_completed_but_reviewer_refresh_required',
          remaining_blockers: [
            'AI reviewer re-check must confirm publication readiness after the repair.',
          ],
          evidence_refs: [
            'evidence:figure5-layout',
            'receipt:dm002-paper-repair-closeout',
          ],
        },
        route_impact: {
          decision: 'bounded_repair',
          owner_receipt_refs: ['owner-receipt:mas/dm002/paper-repair'],
          typed_blocker_refs: ['typed-blocker:mas/dm002/reviewer-refresh-required'],
          memory_recall_trace_refs: ['memory-recall-trace:dm002/reviewer-feedback'],
          memory_retrieval_trace_refs: ['memory-retrieval-trace:dm002/reviewer-feedback'],
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
    assert.deepEqual(log.intended_work.dispatch_refs, ['dispatch:dm002/paper-repair']);
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
    assert.equal(log.memory_trace_projection.surface_kind, 'opl_memory_trace_projection');
    assert.equal(log.memory_trace_projection.projection_scope, 'stage_attempt');
    assert.deepEqual(log.memory_trace_projection.consumed_memory_refs, ['memory:dm002-review-feedback']);
    assert.deepEqual(log.memory_trace_projection.recall_trace_refs, ['memory-recall-trace:dm002/reviewer-feedback']);
    assert.deepEqual(log.memory_trace_projection.retrieval_trace_refs, ['memory-retrieval-trace:dm002/reviewer-feedback']);
    assert.deepEqual(log.memory_trace_projection.writeback_receipt_refs, ['memory-writeback:dm002-paper-repair']);
    assert.deepEqual(log.memory_trace_projection.rejected_write_refs, ['memory-rejected-write:dm002-paper-repair/unsafe-body']);
    assert.deepEqual(log.memory_trace_projection.source_refs, ['source:dm002/manuscript']);
    assert.equal(log.memory_trace_projection.summary.rejected_write_ref_count, 1);
    assert.equal(log.memory_trace_projection.false_authority_flags.can_read_memory_body, false);
    assert.equal(log.memory_trace_projection.false_authority_flags.can_write_domain_memory_body, false);
    assert.equal(log.memory_trace_projection.false_authority_flags.can_accept_or_reject_memory_writeback, false);
    assert.equal(log.memory_trace_projection.false_authority_flags.can_authorize_quality_verdict, false);
    assert.equal(JSON.stringify(log.memory_trace_projection).includes('domain-owned rejected write body'), false);
    assert.equal(
      query.family_runtime_stage_attempt_query.stage_attempt_query.memory_locator_index.memory_trace_projection
        .surface_kind,
      'opl_memory_trace_projection',
    );
    assert.deepEqual(
      query.family_runtime_stage_attempt_query.stage_attempt_query.memory_locator_index.memory_trace_projection
        .retrieval_trace_refs,
      ['memory-retrieval-trace:dm002/reviewer-feedback'],
    );
    assert.equal(log.user_stage_log.surface_kind, 'opl_user_stage_log');
    assert.equal(log.user_stage_log.semantic_status, 'provided_by_domain');
    assert.equal(log.user_stage_log.semantic_source, 'latest_closeout');
    assert.equal(log.user_stage_log.stage_name, 'DM002 manuscript reporting consistency repair');
    assert.equal(log.user_stage_log.progress_delta_classification, 'deliverable_progress');
    assert.deepEqual(log.user_stage_log.deliverable_progress_delta, {
      delta_count: 3,
      delta_refs: [
        'manuscript:methods-validation-cohort',
        'manuscript:results-table-figure-alignment',
        'manuscript:deployment-language-boundary',
      ],
      delta_summary: 'Canonical manuscript and display-provenance surfaces changed.',
      has_deliverable_delta: true,
    });
    assert.deepEqual(log.user_stage_log.platform_repair_delta, {
      delta_count: 0,
      delta_refs: [],
      delta_summary: null,
      has_platform_repair_delta: false,
    });
    assert.equal(log.user_stage_log.next_forced_delta, 'ai_reviewer_current_record_or_stable_typed_blocker');
    assert.equal(
      log.user_stage_log.problem_summary,
      'The manuscript had inconsistent Methods and Results reporting around model validation, display provenance, and Figure 5/Table support.',
    );
    assert.equal(
      log.user_stage_log.stage_goal,
      'Make the current manuscript explain the fixed validation cohort and align the paper-facing displays with the same evidence base.',
    );
    assert.deepEqual(log.user_stage_log.paper_work_done, [
      'Clarified the complete-case validation sample and fixed predictor set in Methods.',
      'Aligned Table 1, Table 2, and Figure 5 claims to the same validation evidence.',
      'Kept absolute-risk and deployment language bounded until recalibration evidence is available.',
    ]);
    assert.deepEqual(log.user_stage_log.stage_work_done, [
      'Clarified the complete-case validation sample and fixed predictor set in Methods.',
      'Aligned Table 1, Table 2, and Figure 5 claims to the same validation evidence.',
      'Kept absolute-risk and deployment language bounded until recalibration evidence is available.',
    ]);
    assert.deepEqual(log.user_stage_log.changed_paper_surfaces, [
      'manuscript draft',
      'review manuscript',
      'display provenance ledger',
    ]);
    assert.deepEqual(log.user_stage_log.changed_stage_surfaces, [
      'manuscript draft',
      'review manuscript',
      'display provenance ledger',
    ]);
    assert.equal(log.user_stage_log.duration.duration_ms, 1800000);
    assert.equal(log.user_stage_log.duration.duration_source, 'usage_projection');
    assert.equal(log.user_stage_log.token_usage.total_tokens, 3040);
    assert.equal(log.user_stage_log.cost.estimated_cost_usd, 0.39);
    assert.equal(
      log.user_stage_log.outcome,
      'paper_repair_completed_but_reviewer_refresh_required',
    );
    assert.deepEqual(log.user_stage_log.remaining_blockers, [
      'AI reviewer re-check must confirm publication readiness after the repair.',
      'typed-blocker:mas/dm002/reviewer-refresh-required',
    ]);
    assert.deepEqual(log.user_stage_log.evidence_refs, [
      'evidence:figure5-layout',
      'receipt:dm002-paper-repair-closeout',
      'memory-writeback:dm002-paper-repair',
    ]);
    assert.equal(log.authority_boundary.can_execute_domain_action, false);
    assert.equal(log.authority_boundary.can_write_domain_truth, false);
    assert.equal(log.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(
      query.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.stage_progress_log.stage_attempt_id,
      attemptId,
    );
    const visibility = query.family_runtime_stage_attempt_query.stage_attempt_query;
    assert.equal(visibility.stage_progress_log.surface_kind, 'opl_stage_progress_log');
    assert.equal(
      visibility.stage_progress_log.projection_policy,
      'temporal_backed_opl_refs_only_stage_observability_no_domain_truth',
    );
    assert.equal(['stage', 'execution', 'log'].join('_') in visibility, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime stage progress log accepts standard domain human summaries for MAG and RCA', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cross-domain-stage-log-'));
  try {
    const grantAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'grant-revision',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag","artifact_root":"/tmp/mag/artifacts"}',
      '--retry-budget',
      '{"max_attempts":2}',
      '--source-fingerprint',
      'sha256:mag-stage-log',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      grantAttempt,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:mag-grant-revision-closeout'],
        domain_ready_verdict: 'domain_gate_pending',
        human_stage_log: {
          stage_name: 'MAG grant revision',
          problem_summary: 'Specific Aims and review response did not yet align with fundability blockers.',
          stage_goal: 'Revise proposal surfaces and route unresolved fundability blockers to the grant owner.',
          progress_delta_classification: 'mixed',
          grant_work_progress: {
            delta_count: 2,
            delta_refs: ['grant:specific-aims', 'grant:review-response'],
            delta_summary: 'Grant narrative and response surfaces changed.',
          },
          platform_evidence_progress: {
            delta_count: 1,
            delta_refs: ['platform:fundability-blocker-routing'],
            delta_summary: 'Evidence routing metadata updated.',
          },
          next_forced_delta: 'grant_owner_receipt_or_fundability_blocker',
          stage_work_done: [
            'Revised Specific Aims significance and approach rationale.',
            'Aligned critique response with fundability blocker refs.',
          ],
          changed_stage_surfaces: ['specific_aims', 'strategy_narrative', 'review_response'],
          outcome: 'grant_revision_completed_with_blockers',
          remaining_blockers: ['PI biosketch still needs owner confirmation.'],
        },
      }),
    ], familyRuntimeEnv(stateRoot));

    const visualAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'visual-refresh',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca","artifact_root":"/tmp/rca/artifacts"}',
      '--retry-budget',
      '{"max_attempts":2}',
      '--source-fingerprint',
      'sha256:rca-stage-log',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      visualAttempt,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:rca-visual-refresh-closeout'],
        domain_ready_verdict: 'domain_gate_pending',
        stage_log_summary: {
          stage_name: 'RCA visual refresh',
          problem_summary: 'The deck export and review package needed clearer visual provenance.',
          stage_goal: 'Refresh deck surfaces and route unresolved visual blockers to the RedCube owner.',
          progress_delta_classification: 'platform_repair',
          deliverable_progress_delta: {
            delta_count: 0,
            delta_refs: [],
            delta_summary: null,
          },
          platform_repair_delta: {
            delta_count: 2,
            delta_refs: ['platform:export-manifest', 'platform:review-provenance'],
            delta_summary: 'Visual provenance and export metadata changed without new deck body.',
          },
          next_forced_delta: 'visual_deliverable_delta_or_operator_typed_blocker',
          stage_work_done: [
            'Refreshed deck visual system, slide hierarchy, export package, and review refs.',
            'Routed unresolved visual-review blockers back to the deliverable owner.',
          ],
          changed_stage_surfaces: ['pptx_deck', 'rendered_page_images', 'export_manifest'],
          outcome: 'visual_refresh_completed_with_review_blocker',
          remaining_blockers: ['Operator review gate still open.'],
        },
      }),
    ], familyRuntimeEnv(stateRoot));

    const grantLog = runCli(['family-runtime', 'attempt', 'query', grantAttempt], familyRuntimeEnv(stateRoot))
      .family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log.user_stage_log;
    const visualLog = runCli(['family-runtime', 'attempt', 'query', visualAttempt], familyRuntimeEnv(stateRoot))
      .family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log.user_stage_log;

    assert.equal(grantLog.semantic_status, 'provided_by_domain');
    assert.equal(grantLog.stage_name, 'MAG grant revision');
    assert.equal(grantLog.progress_delta_classification, 'mixed');
    assert.deepEqual(grantLog.deliverable_progress_delta, {
      delta_count: 2,
      delta_refs: ['grant:specific-aims', 'grant:review-response'],
      delta_summary: 'Grant narrative and response surfaces changed.',
      has_deliverable_delta: true,
    });
    assert.deepEqual(grantLog.platform_repair_delta, {
      delta_count: 1,
      delta_refs: ['platform:fundability-blocker-routing'],
      delta_summary: 'Evidence routing metadata updated.',
      has_platform_repair_delta: true,
    });
    assert.equal(grantLog.next_forced_delta, 'grant_owner_receipt_or_fundability_blocker');
    assert.deepEqual(grantLog.stage_work_done, [
      'Revised Specific Aims significance and approach rationale.',
      'Aligned critique response with fundability blocker refs.',
    ]);
    assert.deepEqual(grantLog.changed_stage_surfaces, ['specific_aims', 'strategy_narrative', 'review_response']);
    assert.deepEqual(grantLog.paper_work_done, grantLog.stage_work_done);
    assert.deepEqual(grantLog.changed_paper_surfaces, grantLog.changed_stage_surfaces);

    assert.equal(visualLog.semantic_status, 'provided_by_domain');
    assert.equal(visualLog.stage_name, 'RCA visual refresh');
    assert.equal(visualLog.progress_delta_classification, 'platform_repair');
    assert.deepEqual(visualLog.deliverable_progress_delta, {
      delta_count: 0,
      delta_refs: [],
      delta_summary: null,
      has_deliverable_delta: false,
    });
    assert.deepEqual(visualLog.platform_repair_delta, {
      delta_count: 2,
      delta_refs: ['platform:export-manifest', 'platform:review-provenance'],
      delta_summary: 'Visual provenance and export metadata changed without new deck body.',
      has_platform_repair_delta: true,
    });
    assert.equal(visualLog.next_forced_delta, 'visual_deliverable_delta_or_operator_typed_blocker');
    assert.deepEqual(visualLog.stage_work_done, [
      'Refreshed deck visual system, slide hierarchy, export package, and review refs.',
      'Routed unresolved visual-review blockers back to the deliverable owner.',
    ]);
    assert.deepEqual(visualLog.changed_stage_surfaces, ['pptx_deck', 'rendered_page_images', 'export_manifest']);
    assert.equal(visualLog.authority_boundary.can_infer_domain_semantics, false);
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
    assert.equal(workbench.summary.stage_progress_log.user_duration_observed_attempt_count, 1);
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
    assert.equal(deadLetterHistoryEntry.observability_status, 'missing');
    assert.deepEqual(deadLetterHistoryEntry.missing_observability_fields, ['duration', 'token_usage', 'cost']);
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
