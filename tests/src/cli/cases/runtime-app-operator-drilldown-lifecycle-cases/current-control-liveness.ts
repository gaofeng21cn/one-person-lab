import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  fs,
  insertFamilyRuntimeTaskProjectionFixture,
  installRuntimePackageFixture,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';

const SUMMARY_COMMAND = ['runtime', 'app-operator-drilldown'];
const FULL_DETAIL_COMMAND = [...SUMMARY_COMMAND, '--detail', 'full'];

test('runtime operator summary exposes running provider attempts as liveness refs only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-live-control-'));
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const taskId = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        study_id: 'DM002',
        action_type: 'run_quality_repair_batch',
        dispatch_ref: 'studies/DM002/default-executor-dispatch.json',
        workspace_root: '/tmp/mas-live-control',
        source_fingerprint: 'mas-default-executor-source:live-control',
      },
      dedupeKey: 'mas:DM002:default-executor:live-control-summary',
    }).task_id;
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas-live-control',
        runtime_root: '/tmp/mas-live-control/runtime',
        artifact_root: '/tmp/mas-live-control/artifacts',
        domain_source_fingerprint: 'mas-default-executor-source:live-control',
        source_refs: ['source:dm002-live-control'],
      }),
      '--source-fingerprint',
      'sha256:mas-live-control',
      '--task',
      taskId,
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:mas-live-control',
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const summaryOutput = runCli(SUMMARY_COMMAND, {
      OPL_STATE_DIR: stateRoot,
    });
    const summary = summaryOutput.app_operator_drilldown.summary;

    assert.equal(summary.current_control_state_count, 1);
    assert.equal(summary.current_control_state_running_count, 1);
    assert.equal(summary.current_control_state_running_provider_attempt_count, 1);
    assert.deepEqual(summary.current_control_state_running_provider_attempt_domain_ids, [
      'medautoscience',
    ]);
    assert.deepEqual(summary.current_control_state_running_provider_attempt_task_kinds, [
      'domain_owner/default-executor-dispatch',
    ]);
    assert.deepEqual(summary.current_control_state_running_provider_attempt_stage_attempt_ids, [
      attemptId,
    ]);
    assert.equal(summary.current_control_state_running_provider_attempt_domain_id_omitted_count, 0);
    assert.equal(summary.current_control_state_running_provider_attempt_task_kind_omitted_count, 0);
    assert.equal(summary.current_control_state_running_provider_attempt_stage_attempt_id_omitted_count, 0);
    assert.equal(
      typeof summary.current_control_state_latest_running_provider_heartbeat_at,
      'string',
    );
    assert.equal(
      summary.current_control_state_running_provider_attempt_summary_policy,
      'refs_only_liveness_projection_no_domain_ready_publication_ready_or_artifact_ready',
    );
    assert.equal(Object.hasOwn(summary, 'domain_ready'), false);
    assert.equal(Object.hasOwn(summary, 'publication_ready'), false);
    assert.equal(Object.hasOwn(summary, 'artifact_ready'), false);

    const fullOutput = runCli(FULL_DETAIL_COMMAND, {
      OPL_STATE_DIR: stateRoot,
    });
    const full = fullOutput.app_operator_drilldown;

    assert.equal(full.current_control_state.summary.running_provider_attempt_count, 1);
    assert.equal(full.effective_current_context.surface_kind, 'opl_effective_current_context_packet');
    assert.equal(full.effective_current_context.packet_version, 'effective_current_context.v1');
    assert.equal(full.effective_current_context.summary.running_attempt_count, 1);
    assert.equal(full.effective_current_context.summary.latest_closeout_count, 0);
    assert.equal(full.effective_current_context.contexts[0].owner_route.next_owner, 'medautoscience');
    assert.equal(
      full.effective_current_context.contexts[0].source_fingerprint.stage_attempt_source_fingerprint,
      'sha256:mas-live-control',
    );
    assert.deepEqual(full.effective_current_context.contexts[0].stage_packet.stage_packet_refs, [
      'packet:mas-live-control',
    ]);
    assert.equal(full.effective_current_context.contexts[0].workspace_session.stage_attempt_id, attemptId);
    assert.equal(full.effective_current_context.contexts[0].running_attempt.running_provider_attempt, true);
    assert.equal(full.family_stall_lineage.surface_kind, 'opl_family_stall_lineage');
    assert.equal(full.family_stall_lineage.packet_version, 'family-stall-lineage.v1');
    assert.equal(full.family_stall_lineage.lineages.length, 0);
    assert.deepEqual(
      full.current_control_state.summary.running_provider_attempt_stage_attempt_ids,
      [attemptId],
    );
    assert.equal(full.current_control_state.states[0].running_provider_attempt, true);
    assert.equal(full.current_control_state.states[0].reconciliation_status, 'running');
    assert.equal(full.current_control_state.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(Object.hasOwn(full.current_control_state.states[0], 'domain_ready'), false);
    assert.equal(Object.hasOwn(full.current_control_state.states[0], 'publication_ready'), false);
    assert.equal(Object.hasOwn(full.current_control_state.states[0], 'artifact_ready'), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime full detail preserves domain-authored quality debt reasons without inferring quality', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-quality-debt-'));
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const taskId = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        study_id: 'DM003',
        action_type: 'finalize_and_publication_handoff',
        dispatch_ref: 'studies/DM003/finalize.json',
        workspace_root: '/tmp/mas-quality-debt',
        source_fingerprint: 'mas-source:quality-debt',
      },
      dedupeKey: 'mas:DM003:quality-debt-projection',
    }).task_id;
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'finalize_and_publication_handoff',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas-quality-debt',
        domain_source_fingerprint: 'mas-source:quality-debt',
      }),
      '--source-fingerprint',
      'sha256:mas-quality-debt',
      '--task',
      taskId,
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      db.prepare(`
        UPDATE stage_attempts
        SET route_impact_json = ?
        WHERE stage_attempt_id = ?
      `).run(JSON.stringify({
        transition_outcome: 'completed_with_quality_debt',
        reason_code: 'ordinary_route_reason_must_not_be_quality_debt',
        quality_debt_refs: ['mas://DM003/quality-debt/submission-role'],
        quality_debt: {
          reason_codes: [
            'professional_submission_prep_consumption_missing',
            'internal_review_artifact_exposed_to_journal',
          ],
        },
      }), attemptId);
    } finally {
      db.close();
    }

    const full = runCli(FULL_DETAIL_COMMAND, {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const state = full.current_control_state.states.find(
      (item: Record<string, unknown>) => item.current_stage_attempt_id === attemptId,
    );
    assert.ok(state);
    assert.deepEqual(state.quality_debt_refs, [
      'mas://DM003/quality-debt/submission-role',
    ]);
    assert.deepEqual(state.quality_debt_reason_codes, [
      'professional_submission_prep_consumption_missing',
      'internal_review_artifact_exposed_to_journal',
    ]);
    assert.equal(state.quality_summary.status, 'quality_debt_observed');
    assert.equal(state.quality_summary.domain_quality_verdict_inferred, false);
    assert.equal(state.quality_summary.quality_or_readiness_authorized, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime operator projection does not count stale MAS work-unit live attempt as current running', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-stale-workunit-'));
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const staleTaskId = insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        study_id: 'DM002',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_old_inputs',
        dispatch_ref: 'studies/DM002/default-executor-dispatch/old-ai-reviewer.json',
        next_executable_owner: 'ai_reviewer',
        executor_kind: 'codex_cli_default',
        workspace_root: '/tmp/mas-stale-workunit',
        source_fingerprint: 'mas-domain-source:old-work-unit',
      },
      dedupeKey: 'mas:DM002:default-executor:old-ai-reviewer-work-unit',
    }).task_id;
    const staleAttempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas-stale-workunit',
        study_id: 'DM002',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_old_inputs',
        dispatch_ref: 'studies/DM002/default-executor-dispatch/old-ai-reviewer.json',
        domain_source_fingerprint: 'mas-domain-source:old-work-unit',
      }),
      '--source-fingerprint',
      'opl-stage-source:old-work-unit',
      '--executor-kind',
      'codex_cli',
      '--task',
      staleTaskId,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).family_runtime_stage_attempt.attempt;
    insertFamilyRuntimeTaskProjectionFixture({
      stateRoot,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        study_id: 'DM002',
        action_type: 'run_quality_repair_batch',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_old_inputs',
        dispatch_ref: 'studies/DM002/default-executor-dispatch/current-writer.json',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        workspace_root: '/tmp/mas-stale-workunit',
        source_fingerprint: 'mas-domain-source:current-work-unit',
      },
      dedupeKey: 'mas:DM002:default-executor:current-writer-work-unit',
    });

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      db.prepare(`
        UPDATE tasks
        SET status = 'running', lease_owner = 'test-live-worker',
          lease_expires_at = '2999-01-01T00:00:00.000Z',
          created_at = '2026-06-02T00:00:00.000Z'
        WHERE task_id = ?
      `).run(staleTaskId);
      db.prepare(`
        UPDATE tasks
        SET created_at = '2026-06-02T00:00:01.000Z'
        WHERE dedupe_key = ?
      `).run('mas:DM002:default-executor:current-writer-work-unit');
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running'),
          updated_at = '2026-06-02T00:00:00.000Z'
        WHERE stage_attempt_id = ?
      `).run(staleAttempt.stage_attempt_id);
    } finally {
      db.close();
    }

    const projection = runCli(FULL_DETAIL_COMMAND, {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const staleState = projection.current_control_state.states.find((state: Record<string, unknown>) =>
      state.current_stage_attempt_id === staleAttempt.stage_attempt_id
    );

    assert.equal(projection.summary.current_control_state_running_provider_attempt_count, 0);
    assert.equal(projection.current_control_state.summary.running_provider_attempt_count, 0);
    assert.ok(staleState);
    assert.equal(staleState.reconciliation_status, 'blocked_stale_work_unit');
    assert.equal(staleState.running_provider_attempt, false);
    assert.equal(staleState.active_stage_attempt_id, null);
    const diagnostic = staleState.stale_work_unit_diagnostic as Record<string, unknown>;
    assert.equal(
      diagnostic.diagnostic,
      'stale/superseded_by_current_work_unit',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime operator projection exposes stall lineage for repeated typed blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-stall-lineage-'));
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const attemptIds: string[] = [];
    for (const index of [0, 1]) {
      const created = runCli([
        'family-runtime',
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        'write',
        '--provider',
        'temporal',
        '--workspace-locator',
        JSON.stringify({
          workspace_root: '/tmp/mas-stall-lineage',
          runtime_root: '/tmp/mas-stall-lineage/runtime',
          artifact_root: '/tmp/mas-stall-lineage/artifacts',
          study_id: 'DM002',
          action_type: 'reviewer_refresh',
          dispatch_ref: 'studies/DM002/reviewer-refresh.json',
          stage_packet_ref: `packet:mas-stall-${index}`,
        }),
        '--source-fingerprint',
        `sha256:mas-stall-${index}`,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
      const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
      attemptIds.push(attemptId);
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attemptId,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`receipt:stall-${index}`],
          consumed_refs: [`source:stall-${index}`],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            typed_blocker_refs: ['mas-blocker:reviewer-refresh-repeat'],
            typed_blockers: [{
              blocker_id: 'reviewer_refresh_currentness_blocked',
              blocker_family: 'reviewer_refresh_currentness',
              required_owner: 'med-autoscience',
            }],
            deliverable_progress_delta: index === 0 ? 'refs_only' : 'none',
            platform_repair_delta: index === 0 ? 'owner_route_recorded' : 'none',
            progress_delta_classification: index === 0 ? 'platform_repair' : 'typed_blocker',
          },
        }),
      ], {
        OPL_STATE_DIR: stateRoot,
      });
    }

    const full = runCli(FULL_DETAIL_COMMAND, {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;

    const lineage = full.family_stall_lineage.lineages.find(
      (entry: Record<string, unknown>) =>
        entry.blocker_family === 'reviewer_refresh_currentness',
    );
    assert.ok(lineage);
    assert.equal(lineage.repeat_count, 2);
    assert.deepEqual(lineage.attempt_refs, attemptIds.map((id) => `/stage_attempt_workbench/attempts/${id}`));
    assert.equal(lineage.last_deliverable_delta, 'none');
    assert.equal(lineage.next_forced_delta, 'domain_deliverable_or_owner_receipt_delta_required');
    assert.equal(lineage.escalation_owner, 'med-autoscience');
    assert.equal(lineage.terminal, false);
    assert.equal(full.summary.family_stall_lineage_count, 1);
    assert.equal(full.summary.family_stall_lineage_repeated_count, 1);
    assert.equal(full.summary.family_stall_lineage_terminal_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime operator summary bounds running provider attempt liveness samples', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-live-control-bounded-'));
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const attemptIds: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      const taskId = insertFamilyRuntimeTaskProjectionFixture({
        stateRoot,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: {
          study_id: `DM${String(index).padStart(3, '0')}`,
          action_type: 'run_quality_repair_batch',
          dispatch_ref: `studies/DM${String(index).padStart(3, '0')}/default-executor-dispatch.json`,
          workspace_root: `/tmp/mas-live-control-${index}`,
          source_fingerprint: `mas-default-executor-source:live-control-${index}`,
        },
        dedupeKey: `mas:DM${String(index).padStart(3, '0')}:default-executor:live-control-summary`,
      }).task_id;
      const created = runCli([
        'family-runtime',
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        'write',
        '--provider',
        'temporal',
        '--workspace-locator',
        JSON.stringify({
          workspace_root: `/tmp/mas-live-control-${index}`,
          runtime_root: `/tmp/mas-live-control-${index}/runtime`,
          artifact_root: `/tmp/mas-live-control-${index}/artifacts`,
          domain_source_fingerprint: `mas-default-executor-source:live-control-${index}`,
          source_refs: [`source:dm${index}-live-control`],
        }),
        '--source-fingerprint',
        `sha256:mas-live-control-${index}`,
        '--task',
        taskId,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
      const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
      attemptIds.push(attemptId);
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attemptId,
        '--stage-packet-ref',
        `packet:mas-live-control-${index}`,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
    }

    const summaryOutput = runCli(SUMMARY_COMMAND, {
      OPL_STATE_DIR: stateRoot,
    });
    const summary = summaryOutput.app_operator_drilldown.summary;

    assert.equal(summary.current_control_state_running_provider_attempt_count, 7);
    assert.deepEqual(summary.current_control_state_running_provider_attempt_domain_ids, [
      'medautoscience',
    ]);
    assert.equal(summary.current_control_state_running_provider_attempt_domain_id_omitted_count, 0);
    assert.deepEqual(summary.current_control_state_running_provider_attempt_task_kinds, [
      'domain_owner/default-executor-dispatch',
    ]);
    assert.equal(summary.current_control_state_running_provider_attempt_task_kind_omitted_count, 0);
    assert.equal(summary.current_control_state_running_provider_attempt_stage_attempt_ids.length, 5);
    assert.equal(summary.current_control_state_running_provider_attempt_stage_attempt_id_omitted_count, 2);
    assert.equal(
      summary.current_control_state_running_provider_attempt_stage_attempt_ids.every(
        (stageAttemptId: string) => attemptIds.includes(stageAttemptId),
      ),
      true,
    );

    const fullOutput = runCli(FULL_DETAIL_COMMAND, {
      OPL_STATE_DIR: stateRoot,
    });
    assert.equal(fullOutput.app_operator_drilldown.current_control_state.states.length, 7);
    const fullAttemptIds = fullOutput.app_operator_drilldown.current_control_state.states
      .map((state: Record<string, unknown>) => state.active_stage_attempt_id);
    assert.equal(attemptIds.every((attemptId) => fullAttemptIds.includes(attemptId)), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
