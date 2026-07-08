import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string) {
  return {
    OPL_STATE_DIR: stateRoot,
  };
}

test('family-runtime attempt query exposes cognitive kernel launch envelope and refs-only closeout boundary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-cognitive-kernel-boundary-'));
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
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        stage_goal: 'Repair the current manuscript evidence table and return an owner answer or typed blocker.',
        context_refs: ['context:dm002/current-manuscript', 'context:dm002/reviewer-note'],
        authority_boundary: {
          can_write_domain_truth: false,
          can_authorize_quality_verdict: false,
        },
        available_affordances: [
          {
            affordance_ref: 'tool:rg',
            capability: 'source_search',
            permission_boundary: 'read_only',
          },
          {
            affordance_ref: 'tool:apply_patch',
            capability: 'bounded_workspace_edit',
            permission_boundary: 'workspace_write',
          },
        ],
        quality_gate: {
          gate_ref: 'quality-gate:mas/ai-reviewer',
          owner: 'med-autoscience',
        },
      }),
      '--source-fingerprint',
      'sha256:cognitive-kernel-launch',
      '--task',
      'task-cognitive-kernel-launch',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['closeout:dm002/kernel-boundary'],
        consumed_refs: ['evidence:dm002/table-audit'],
        writeback_receipt_refs: ['artifact:dm002/manuscript-delta'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          tool_refs: ['tool:rg', 'tool:apply_patch'],
          evidence_refs: ['evidence:dm002/table-audit'],
          artifact_refs: ['artifact:dm002/manuscript-delta'],
          owner_answer_refs: ['owner-answer:mas/dm002/reviewer-refresh-required'],
          typed_blocker_refs: ['typed-blocker:mas/dm002/reviewer-refresh-required'],
        },
      }),
    ], familyRuntimeEnv(stateRoot));

    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const attemptQuery = query.family_runtime_stage_attempt_query.stage_attempt_query;

    assert.equal(attemptQuery.attempt_launch_envelope.surface_kind, 'opl_stage_attempt_launch_envelope');
    assert.equal(attemptQuery.attempt_launch_envelope.envelope_semantics, 'stage_goal_context_authority_boundary_available_affordances_quality_gate');
    assert.equal(
      attemptQuery.attempt_launch_envelope.stage_goal,
      'Repair the current manuscript evidence table and return an owner answer or typed blocker.',
    );
    assert.deepEqual(attemptQuery.attempt_launch_envelope.context_refs, [
      'context:dm002/current-manuscript',
      'context:dm002/reviewer-note',
    ]);
    assert.deepEqual(
      attemptQuery.attempt_launch_envelope.available_affordance_refs,
      ['tool:rg', 'tool:apply_patch'],
    );
    assert.equal(
      attemptQuery.attempt_launch_envelope.tool_affordance_policy,
      'available_affordances_not_mandatory_sequence_not_workflow_script',
    );
    assert.equal(attemptQuery.attempt_launch_envelope.quality_gate.gate_ref, 'quality-gate:mas/ai-reviewer');
    assert.equal(attemptQuery.attempt_launch_envelope.authority_boundary.can_write_domain_truth, false);
    assert.equal(attemptQuery.attempt_launch_envelope.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(attemptQuery.attempt_launch_envelope.authority_boundary.tool_affordance_can_override_stage_goal, false);

    assert.equal(attemptQuery.closeout_refs_only_contract.surface_kind, 'opl_stage_attempt_closeout_refs_only_contract');
    assert.deepEqual(attemptQuery.closeout_refs_only_contract.actual_tool_refs, ['tool:rg', 'tool:apply_patch']);
    assert.deepEqual(attemptQuery.closeout_refs_only_contract.actual_evidence_refs, ['evidence:dm002/table-audit']);
    assert.deepEqual(attemptQuery.closeout_refs_only_contract.actual_artifact_refs, ['artifact:dm002/manuscript-delta']);
    assert.deepEqual(attemptQuery.closeout_refs_only_contract.owner_answer_refs, ['owner-answer:mas/dm002/reviewer-refresh-required']);
    assert.deepEqual(attemptQuery.closeout_refs_only_contract.typed_blocker_refs, ['typed-blocker:mas/dm002/reviewer-refresh-required']);
    assert.equal(attemptQuery.closeout_refs_only_contract.closeout_policy, 'actual_tool_evidence_artifact_owner_answer_or_typed_blocker_refs_only');
    assert.equal(attemptQuery.closeout_refs_only_contract.authority_boundary.can_write_domain_truth, false);
    assert.equal(attemptQuery.closeout_refs_only_contract.authority_boundary.can_create_owner_answer, false);
    assert.equal(attemptQuery.closeout_refs_only_contract.authority_boundary.can_create_typed_blocker, false);
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
      'temporal',
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
    assert.equal(Object.hasOwn(userStageLog, 'paper_work_done'), false);
    assert.deepEqual(userStageLog.semantic_gap.required_domain_fields, [
      'stage_name',
      'problem_summary',
      'stage_goal',
      'progress_delta_classification',
      'deliverable_progress_delta',
      'platform_repair_delta',
      'next_forced_delta',
      'stage_work_done',
      'changed_stage_surfaces',
      'outcome',
      'remaining_blockers',
      'evidence_refs',
    ]);
    assert.equal(userStageLog.duration.duration_ms, 600000);
    assert.equal(userStageLog.duration.duration_source, 'stage_attempt_created_updated_at_fallback');
    assert.equal(userStageLog.duration.status, 'observed');
    assert.equal(userStageLog.duration.duration_telemetry_status, 'missing');
    assert.equal(userStageLog.duration.telemetry_fallback_used, true);
    assert.equal(
      userStageLog.duration.missing_duration_reason,
      'no_stage_attempt_duration_telemetry_observed',
    );
    assert.equal(userStageLog.observability_status, 'missing');
    assert.deepEqual(userStageLog.missing_observability_fields, ['token_usage', 'cost']);
    assert.equal(userStageLog.token_usage.status, 'missing');
    assert.equal(userStageLog.token_usage.total_tokens, null);
    assert.equal(
      userStageLog.token_usage.usage_projection_ref,
      `/stage_attempt_workbench/attempts/${attemptId}/usage_projection`,
    );
    assert.equal(
      userStageLog.cost.usage_projection_ref,
      `/stage_attempt_workbench/attempts/${attemptId}/usage_projection`,
    );
    assert.equal(
      userStageLog.semantic_gap.reason,
      'domain_closeout_did_not_provide_user_stage_log',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime stage progress log reports incomplete domain human summaries without inventing semantics', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-log-incomplete-summary-'));
  try {
    const attemptId = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'paper-repair',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--task',
      'task-incomplete-stage-log',
      '--source-fingerprint',
      'sha256:incomplete-stage-log',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:mas-incomplete-stage-log'],
        user_stage_log: {
          stage_name: 'DM003 write repair',
          problem_summary: 'The paper still had unresolved publishability blockers.',
          stage_goal: 'Repair manuscript prose and hand back a typed owner answer.',
          stage_work_done: ['Revised discussion wording and limitation framing.'],
          changed_stage_surfaces: ['manuscript draft'],
          outcome: 'partial_write_repair_observed',
          remaining_blockers: ['Publication gate must re-check the repair.'],
          evidence_refs: ['receipt:mas-incomplete-stage-log'],
        },
      }),
    ], familyRuntimeEnv(stateRoot));

    const userStageLog = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot))
      .family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log.user_stage_log;

    assert.equal(userStageLog.semantic_status, 'provided_by_domain');
    assert.equal(userStageLog.semantic_source, 'latest_closeout');
    assert.equal(userStageLog.stage_name, 'DM003 write repair');
    assert.equal(userStageLog.progress_delta_classification, 'typed_blocker');
    assert.equal(
      userStageLog.semantic_gap.reason,
      'domain_closeout_provided_incomplete_user_stage_log',
    );
    assert.deepEqual(userStageLog.semantic_gap.missing_domain_fields, [
      'progress_delta_classification',
      'deliverable_progress_delta',
      'platform_repair_delta',
      'next_forced_delta',
    ]);
    assert.deepEqual(userStageLog.semantic_gap.required_domain_fields, [
      'stage_name',
      'problem_summary',
      'stage_goal',
      'progress_delta_classification',
      'deliverable_progress_delta',
      'platform_repair_delta',
      'next_forced_delta',
      'stage_work_done',
      'changed_stage_surfaces',
      'outcome',
      'remaining_blockers',
      'evidence_refs',
    ]);
    assert.equal(userStageLog.authority_boundary.can_infer_domain_semantics, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime stage progress log fails closed on invalid progress delta classification', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-log-invalid-classification-'));
  try {
    const attemptId = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'grant-revision',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
      '--task',
      'task-invalid-classification',
      '--source-fingerprint',
      'sha256:invalid-classification',
    ], familyRuntimeEnv(stateRoot)).family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:mag-invalid-classification'],
        stage_log_summary: {
          stage_name: 'MAG grant revision',
          problem_summary: 'The grant revision returned a non-standard progress classification.',
          stage_goal: 'Produce grant deliverable progress or a typed blocker.',
          progress_delta_classification: 'grant_polish',
          deliverable_progress_delta: {
            delta_count: 1,
            delta_refs: ['grant:specific-aims'],
            delta_summary: 'Specific aims changed.',
          },
          platform_repair_delta: {
            delta_count: 0,
            delta_refs: [],
            delta_summary: null,
          },
          next_forced_delta: 'grant_owner_receipt_or_fundability_blocker',
          stage_work_done: ['Revised Specific Aims.'],
          changed_stage_surfaces: ['specific_aims'],
          outcome: 'invalid_progress_classification',
          remaining_blockers: [],
          evidence_refs: ['receipt:mag-invalid-classification'],
        },
      }),
    ], familyRuntimeEnv(stateRoot));

    const userStageLog = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot))
      .family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log.user_stage_log;

    assert.equal(userStageLog.semantic_status, 'provided_by_domain');
    assert.equal(userStageLog.progress_delta_classification, 'typed_blocker');
    assert.equal(
      userStageLog.semantic_gap.reason,
      'domain_closeout_provided_invalid_progress_delta_classification',
    );
    assert.equal(userStageLog.semantic_gap.raw_progress_delta_classification, 'grant_polish');
    assert.deepEqual(userStageLog.semantic_gap.required_domain_fields, [
      'progress_delta_classification',
      'deliverable_progress_delta',
      'platform_repair_delta',
      'next_forced_delta',
      'evidence_refs',
    ]);
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
      'temporal',
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
        stage_log_summary: {
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
          stage_work_done: [
            'Clarified the complete-case validation sample and fixed predictor set in Methods.',
            'Aligned Table 1, Table 2, and Figure 5 claims to the same validation evidence.',
            'Kept absolute-risk and deployment language bounded until recalibration evidence is available.',
          ],
          changed_stage_surfaces: [
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
  ...JSON.parse(row.provider_run_json), // reuse-first: allow embedded sqlite fixture JSON boundary.
  provider_status: 'completed',
  started_at: '2026-05-27T00:00:00.000Z',
  completed_at: '2026-05-27T00:18:00.000Z',
  last_heartbeat_at: '2026-05-27T00:17:00.000Z'
};
const events = JSON.parse(row.activity_events_json); // reuse-first: allow embedded sqlite fixture JSON boundary.
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
    assert.equal(log.temporal_visibility.surface_kind, 'temporal_stage_attempt_visibility');
    assert.equal(log.temporal_visibility.provider_kind, 'temporal');
    assert.equal(log.temporal_webui_ref.surface_kind, 'temporal_webui_ref');
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
    assert.deepEqual(log.user_stage_log.stage_work_done, [
      'Clarified the complete-case validation sample and fixed predictor set in Methods.',
      'Aligned Table 1, Table 2, and Figure 5 claims to the same validation evidence.',
      'Kept absolute-risk and deployment language bounded until recalibration evidence is available.',
    ]);
    assert.deepEqual(log.user_stage_log.changed_stage_surfaces, [
      'manuscript draft',
      'review manuscript',
      'display provenance ledger',
    ]);
    assert.equal(Object.hasOwn(log.user_stage_log, 'paper_work_done'), false);
    assert.equal(Object.hasOwn(log.user_stage_log, 'changed_paper_surfaces'), false);
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
      'temporal',
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
      'temporal',
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
    assert.equal(Object.hasOwn(grantLog, 'paper_work_done'), false);
    assert.equal(Object.hasOwn(grantLog, 'changed_paper_surfaces'), false);

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
