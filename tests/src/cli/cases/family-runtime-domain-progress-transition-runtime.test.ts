import {
  assert,
  currentControlCommandOutboxRecord,
  fs,
  os,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeJsonEmitterScript,
} from './family-runtime-current-control-provider-admission-cases/shared.ts';
import {
  buildNonAdvancingApplyRuntimeResult,
  normalizeDomainProgressTransitionCommand,
  replayDomainProgressTransitionTrace,
} from '../../../../src/family-runtime-domain-progress-transition-runtime.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('DomainProgressTransitionRuntime normalizes MAS command into exactly-one event, outbox, StageRun identity, and projection metadata', () => {
  const command = currentControlCommandOutboxRecord({
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:transition-runtime',
    sourceGeneration: 'truth-event-transition-runtime',
    idempotencyKey: 'owner-route-attempt::dm003::transition-runtime',
  });
  const normalized = normalizeDomainProgressTransitionCommand(command, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:transition-runtime',
    nextOwner: 'ai_reviewer',
  });

  assert.equal(normalized.blocked, undefined);
  assert.equal(normalized.command?.surface_kind, 'opl_domain_progress_transition_command');
  assert.equal(normalized.command?.transition_kind, 'StartProviderAttempt');
  assert.equal((normalized.command?.stage_run_identity as Record<string, unknown>).stage_run_id, 'stage-run:003-dpcc-primary-care-phenotype-treatment-gap:produce_ai_reviewer_publication_eval_record_against_current_inputs');

  const result = buildNonAdvancingApplyRuntimeResult({
    command: normalized.command!,
    reason: 'same_aggregate_no_postcondition_progress',
  });

  assert.equal(result.transition_event.transition_kind, 'NonAdvancingApply');
  assert.equal(result.transition_event.exactly_one_transition, true);
  assert.equal(result.replay_evidence.non_advancing_apply, true);
  assert.equal(result.projection_metadata.authority, false);
  assert.equal(result.projection_metadata.derived_from_event_id, result.transition_event.event_id);
});

test('DomainProgressTransitionRuntime replay accepts stable steps and records NonAdvancingApply for no-outcome history', () => {
  const command = normalizeDomainProgressTransitionCommand(
    currentControlCommandOutboxRecord({
      studyId: '002-dm-china-us-mortality-attribution',
      actionType: 'return_to_ai_reviewer_workflow',
      workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      workUnitFingerprint: 'sha256:dm002-replay',
      sourceGeneration: 'truth-event-dm002-replay',
      idempotencyKey: 'owner-route-attempt::dm002::replay',
    }),
    {
      studyId: '002-dm-china-us-mortality-attribution',
      actionType: 'return_to_ai_reviewer_workflow',
      workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      workUnitFingerprint: 'sha256:dm002-replay',
      nextOwner: 'ai_reviewer',
    },
  ).command!;
  const replay = replayDomainProgressTransitionTrace({
    traceId: 'dm002-owner-receipt-recorded-no-progress',
    steps: [
      {
        command,
        observed_outcome: {
          kind: 'provider_admission_accepted',
          provider_completion_is_domain_completion: false,
        },
      },
      {
        command: {
          ...command,
          expected_version: 'truth-event-dm002-replay-repeat',
        },
        observed_outcome: null,
      },
    ],
  });

  assert.equal(replay.replay_status, 'accepted');
  assert.equal(replay.exactly_one_transition_per_step, true);
  assert.equal(replay.non_advancing_apply_count, 1);
  assert.equal(replay.results[1].transition_event.transition_kind, 'NonAdvancingApply');
});

test('family-runtime intake exposes OPL transition event, outbox, and read-model metadata for provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-domain-progress-transition-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-domain-progress-transition-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:transition-runtime-readback',
        action_fingerprint: 'sha256:transition-runtime-readback',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        dispatch_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
        stage_packet_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/return_to_ai_reviewer_workflow.stage-packet.json',
        route_identity_key: 'owner-route::dm003::transition-runtime-readback',
        attempt_idempotency_key: 'owner-route-attempt::dm003::transition-runtime-readback',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:transition-runtime-readback',
          sourceGeneration: 'truth-event-transition-runtime-readback',
          idempotencyKey: 'owner-route-attempt::dm003::transition-runtime-readback',
        }),
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  try {
    runCli(['family-runtime', 'intake', '--domain', 'medautoscience'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const payload = queue.family_runtime_queue.tasks[0].payload;

    assert.equal(payload.domain_progress_transition_runtime.runtime_id, 'opl_domain_progress_transition_runtime');
    assert.equal(payload.opl_transition_event.transition_kind, 'StartProviderAttempt');
    assert.equal(payload.opl_transition_event.exactly_one_transition, true);
    assert.equal(payload.opl_transition_outbox_item.outbox_kind, 'start_provider_attempt');
    assert.equal(payload.opl_transition_outbox_item.stage_run_identity.stage_run_id, 'stage-run:003-dpcc-primary-care-phenotype-treatment-gap:produce_ai_reviewer_publication_eval_record_against_current_inputs');
    assert.equal(payload.projection_metadata.authority, false);
    assert.equal(payload.projection_metadata.observed_generation, 'truth-event-transition-runtime-readback');
    assert.equal(payload.domain_progress_transition_runtime.brand_module_allocation.not_a_new_brand_module, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
