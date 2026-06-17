import {
  assert,
  currentControlCommandOutboxRecord,
  fs,
  masDomainProgressTransitionRequest,
  os,
  path,
  providerObservationBoundary,
  record,
  runCli,
  test,
  writeJsonEmitterScript,
} from './family-runtime-current-control-provider-admission-cases/shared.ts';
import {
  buildNonAdvancingApplyRuntimeResult,
  appendDomainProgressTransitionRuntimeResult,
  appendDomainProgressTransitionRuntimeResultJsonl,
  consumeDomainProgressHumanGateResumeToken,
  createDomainProgressTransitionRuntimeLog,
  currentDomainProgressTransitionAggregateVersion,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressHumanGateResumeToken,
  readDomainProgressTransitionIdempotency,
  readDomainProgressTransitionIdempotencyJsonl,
  readDomainProgressTransitionRuntimeLogJsonl,
  rebuildDomainProgressTransitionReadModel,
  reconcileDomainProgressTransitionFixedPoint,
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
  assert.equal(result.transactional_outbox.committed_together, true);
  assert.equal(result.transactional_outbox.event_id, result.transition_event.event_id);
  assert.equal(result.transactional_outbox.outbox_item_id, result.transactional_outbox_item.outbox_item_id);
  assert.equal(result.idempotency_readback.same_transaction_event_and_outbox, true);
  assert.equal(result.read_model_rebuild_metadata.derived_from_event_id, result.transition_event.event_id);
  assert.equal(result.replay_evidence.non_advancing_apply, true);
  assert.equal(result.projection_metadata.authority, false);
  assert.equal(result.projection_metadata.derived_from_event_id, result.transition_event.event_id);
});

test('DomainProgressTransitionRuntime appends JSONL-friendly command/event/outbox log with aggregate version and idempotency readback', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:append-log',
    sourceGeneration: 'truth-event-append-log',
    idempotencyKey: 'owner-route-attempt::dm002::append-log',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:append-log',
    nextOwner: 'ai_reviewer',
  }).command!;

  const first = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const secondCommand = {
    ...command,
    idempotency_key: 'owner-route-attempt::dm002::append-log-repeat',
    command_id: 'dptc_repeat',
    expected_version: 'truth-event-append-log-repeat',
  };
  const second = appendDomainProgressTransitionRuntimeResult({
    log: first.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command: secondCommand,
      observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm002/blocked' }],
    }).result,
  });
  const readback = readDomainProgressTransitionIdempotency({
    log: second.log,
    idempotencyKey: 'owner-route-attempt::dm002::append-log',
  });

  assert.equal(first.appended_entry_count, 3);
  assert.equal(first.append_status, 'appended');
  assert.equal(second.current_aggregate_version, 2);
  assert.equal(second.read_model_readback.aggregate_version, 2);
  assert.ok(second.read_model_readback.latest_transition_identity);
  assert.equal(second.read_model_readback.latest_transition_identity.event_id, second.result.transition_event.event_id);
  assert.equal(currentDomainProgressTransitionAggregateVersion({
    log: second.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  }), 2);
  assert.equal(readback.found, true);
  assert.equal(readback.current_aggregate_version, 2);
  assert.equal(readback.same_transaction_event_and_outbox, true);
  assert.equal(second.log.storage_contract, 'jsonl_friendly_append_only');
});

test('DomainProgressTransitionRuntime enforces idempotent replay and fail-closes reused keys with different intent', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:idempotent-intent',
    sourceGeneration: 'truth-event-idempotent-intent',
    idempotencyKey: 'owner-route-attempt::dm002::idempotent-intent',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:idempotent-intent',
    nextOwner: 'ai_reviewer',
  }).command!;
  const initial = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const replayed = appendDomainProgressTransitionRuntimeResult({
    log: initial.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const differentIntent = appendDomainProgressTransitionRuntimeResult({
    log: initial.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command: {
        ...command,
        expected_version: 'truth-event-idempotent-intent-different',
      },
      observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm002/idempotent-intent' }],
    }).result,
  });

  assert.equal(initial.appended, true);
  assert.equal(replayed.appended, false);
  assert.equal(replayed.append_status, 'idempotent_replay');
  assert.equal(replayed.idempotent_replay, true);
  assert.equal(replayed.log.entries.length, initial.log.entries.length);
  assert.equal(replayed.result.transition_event.event_id, initial.result.transition_event.event_id);
  assert.equal(replayed.read_model_readback.aggregate_version, 1);
  assert.equal(differentIntent.appended, false);
  assert.equal(differentIntent.append_status, 'blocked');
  assert.ok(differentIntent.blocked);
  assert.equal(
    differentIntent.blocked.reason,
    'domain_progress_transition_idempotency_key_reused_for_different_intent',
  );
  assert.equal(differentIntent.log.entries.length, initial.log.entries.length);
});

test('DomainProgressTransitionRuntime persists append-only JSONL log and replays idempotency readback from disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-progress-transition-jsonl-'));
  const logPath = path.join(root, 'domain-progress-transition.jsonl');
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:durable-jsonl',
    sourceGeneration: 'truth-event-durable-jsonl',
    idempotencyKey: 'owner-route-attempt::dm003::durable-jsonl',
  }), {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:durable-jsonl',
    nextOwner: 'ai_reviewer',
  }).command!;

  try {
    const first = appendDomainProgressTransitionRuntimeResultJsonl({
      logPath,
      result: reconcileDomainProgressTransitionFixedPoint({
        command,
        observations: [{ kind: 'provider_admission_accepted' }],
      }).result,
    });
    const second = appendDomainProgressTransitionRuntimeResultJsonl({
      logPath,
      result: reconcileDomainProgressTransitionFixedPoint({
        command: {
          ...command,
          idempotency_key: 'owner-route-attempt::dm003::durable-jsonl-repeat',
          command_id: 'dptc_dm003_durable_jsonl_repeat',
          expected_version: 'truth-event-durable-jsonl-repeat',
        },
        observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm003/durable-jsonl' }],
      }).result,
    });
    const replayed = readDomainProgressTransitionRuntimeLogJsonl(logPath);
    const readback = readDomainProgressTransitionIdempotencyJsonl({
      logPath,
      idempotencyKey: 'owner-route-attempt::dm003::durable-jsonl',
    });

    assert.equal(first.storage_contract, 'append_only_physical_jsonl');
    assert.equal(second.current_aggregate_version, 2);
    assert.equal(replayed.entries.length, 6);
    assert.equal(currentDomainProgressTransitionAggregateVersion({
      log: replayed,
      aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
    }), 2);
    assert.equal(readback.found, true);
    assert.equal(readback.current_aggregate_version, 2);
    assert.equal(readback.same_transaction_event_and_outbox, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DomainProgressTransitionRuntime rebuilds read model from append-only command/event/outbox log', () => {
  const command = normalizeDomainProgressTransitionCommand(currentControlCommandOutboxRecord({
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:read-model-rebuild',
    sourceGeneration: 'truth-event-read-model-rebuild-1',
    idempotencyKey: 'owner-route-attempt::dm002::read-model-rebuild-1',
  }), {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:read-model-rebuild',
    nextOwner: 'ai_reviewer',
  }).command!;
  const first = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'provider_admission_accepted' }],
    }).result,
  });
  const secondCommand = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'RecordTypedBlocker',
    aggregate_identity: command.aggregate_identity,
    action_type: 'return_to_ai_reviewer_workflow',
    next_owner: 'ai_reviewer',
    idempotency_key: 'owner-route-attempt::dm002::read-model-rebuild-2',
    source_generation: 'truth-event-read-model-rebuild-2',
    expected_version: 'truth-event-read-model-rebuild-2',
    postcondition: {
      kind: 'typed_blocker_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
  }, {
    studyId: '002-dm-china-us-mortality-attribution',
    actionType: 'return_to_ai_reviewer_workflow',
    workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    workUnitFingerprint: 'sha256:read-model-rebuild',
    nextOwner: 'ai_reviewer',
  }).command!;
  const second = appendDomainProgressTransitionRuntimeResult({
    log: first.log,
    result: reconcileDomainProgressTransitionFixedPoint({
      command: secondCommand,
      observations: [{ kind: 'typed_blocker_ref', typed_blocker_ref: 'typed-blocker:dm002/read-model-rebuild' }],
    }).result,
  });
  const readModel = rebuildDomainProgressTransitionReadModel({
    log: second.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  });

  assert.equal(readModel.surface_kind, 'opl_domain_progress_transition_read_model');
  assert.equal(readModel.aggregate_version, 2);
  assert.ok(readModel.latest_transition_identity);
  assert.ok(readModel.latest_outbox_identity);
  assert.ok(readModel.latest_stage_run_identity);
  assert.ok(readModel.latest_transaction_identity);
  assert.equal(readModel.latest_transition_identity.event_id, second.result.transition_event.event_id);
  assert.equal(readModel.latest_transition_identity.transition_kind, 'RecordTypedBlocker');
  assert.equal(readModel.latest_outbox_identity.outbox_item_id, second.result.transactional_outbox_item.outbox_item_id);
  assert.equal(readModel.latest_stage_run_identity.stage_run_id, (secondCommand.stage_run_identity as Record<string, unknown>).stage_run_id);
  assert.equal(readModel.projection_metadata.authority, false);
  assert.equal(readModel.projection_metadata.derived_from_event_id, second.result.transition_event.event_id);
  assert.equal(readModel.projection_metadata.observed_generation, 'truth-event-read-model-rebuild-2');
  assert.equal(readModel.projection_metadata.lag_status, 'current');
  assert.equal(readModel.read_model_rebuild_metadata.derived_from_event_id, second.result.transition_event.event_id);
  assert.equal(readModel.latest_transaction_identity.same_transaction_event_and_outbox, true);
});

test('DomainProgressTransitionRuntime normalizes MAS policy request without accepting legacy supervisor apply alias', () => {
  const request = {
    surface_kind: 'mas_domain_progress_transition_request',
    target_runtime_kind: 'DomainProgressTransitionRuntime',
    target_runtime_owner: 'one-person-lab',
    request_owner: 'med-autoscience',
    authority_role: 'domain_policy_request_only',
    mas_can_create_opl_outbox_record: false,
    runtime_kind: 'DomainProgressTransitionRuntime',
    recommended_transition_kind: 'StartProviderAttempt',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::medical_prose_write_repair',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'medical_prose_write_repair',
      work_unit_fingerprint: 'publication-blockers::0915410f804b3697',
    },
    action_type: 'run_quality_repair_batch',
    next_owner: 'write',
    idempotency_key: 'paper-policy-request::dm003::write-repair',
    source_generation: 'truth-event-dm003-write-repair',
    expected_version: 'truth-event-dm003-write-repair',
    required_postcondition: {
      kind: 'provider_admission_enqueued_or_blocked',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
  };

  const normalized = normalizeDomainProgressTransitionCommand(request, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'run_quality_repair_batch',
    workUnitId: 'medical_prose_write_repair',
    workUnitFingerprint: 'publication-blockers::0915410f804b3697',
    nextOwner: 'write',
  });
  assert.equal(normalized.blocked, undefined);
  assert.equal(normalized.command?.surface_kind, 'opl_domain_progress_transition_command');
  assert.equal(normalized.command?.transition_kind, 'StartProviderAttempt');
  assert.equal((normalized.command?.postcondition as Record<string, unknown>).kind, 'provider_admission_enqueued_or_blocked');

  const forbidden = normalizeDomainProgressTransitionCommand({
    ...request,
    paper_autonomy_supervisor_apply: { legacy_alias: true },
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'run_quality_repair_batch',
    workUnitId: 'medical_prose_write_repair',
    workUnitFingerprint: 'publication-blockers::0915410f804b3697',
    nextOwner: 'write',
  });
  assert.equal(
    forbidden.blocked?.reason,
    'domain_progress_transition_legacy_supervisor_apply_alias_forbidden',
  );

  const runtimeArtifactPolluted = normalizeDomainProgressTransitionCommand({
    ...request,
    opl_domain_progress_transition_outbox_item: { surface_kind: 'opl_domain_progress_transition_outbox_item' },
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'run_quality_repair_batch',
    workUnitId: 'medical_prose_write_repair',
    workUnitFingerprint: 'publication-blockers::0915410f804b3697',
    nextOwner: 'write',
  });
  assert.equal(
    runtimeArtifactPolluted.blocked?.reason,
    'domain_progress_transition_request_runtime_field_forbidden',
  );
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
  assert.equal(replay.replay_evidence.exactly_one_or_non_advancing_per_step, true);
  assert.equal(replay.replay_evidence.step_evidence[1].non_advancing_apply, true);
  assert.equal(replay.results[1].transition_event.transition_kind, 'NonAdvancingApply');
});

test('DomainProgressTransitionRuntime fixed-point helper chooses exactly one transition or NonAdvancingApply and exposes human gate token', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate',
      work_unit_fingerprint: 'sha256:human-gate',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate',
    source_generation: 'truth-event-human-gate',
    expected_version: 'truth-event-human-gate',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate',
    workUnitFingerprint: 'sha256:human-gate',
    nextOwner: 'human_operator',
  }).command!;
  const stable = reconcileDomainProgressTransitionFixedPoint({
    command,
    observations: [{ kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/operator' }],
  });
  const nonAdvancing = reconcileDomainProgressTransitionFixedPoint({
    command,
    observations: [{ kind: 'provider_admission_requested' }],
  });

  assert.equal(stable.exactly_one_transition, true);
  assert.equal(stable.result.transition_event.transition_kind, 'OpenHumanGate');
  const resumeToken = stable.result.human_gate_resume_token as Record<string, unknown>;
  assert.equal(resumeToken.owner, 'human_operator');
  assert.deepEqual(resumeToken.allowed_decisions, ['approve', 'route_back']);
  assert.equal(record(resumeToken.authority_boundary).opl_can_supply_human_answer, false);
  assert.equal(nonAdvancing.non_advancing_apply, true);
  assert.equal(nonAdvancing.result.transition_event.transition_kind, 'NonAdvancingApply');
});

test('DomainProgressTransitionRuntime stores, reads back, consumes, and idempotently replays human gate resume token', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate_resume',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate_resume',
      work_unit_fingerprint: 'sha256:human-gate-resume',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate-resume',
    source_generation: 'truth-event-human-gate-resume',
    expected_version: 'truth-event-human-gate-resume',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate_resume',
    workUnitFingerprint: 'sha256:human-gate-resume',
    nextOwner: 'human_operator',
  }).command!;
  const appended = appendDomainProgressTransitionRuntimeResult({
    log: createDomainProgressTransitionRuntimeLog(),
    result: reconcileDomainProgressTransitionFixedPoint({
      command,
      observations: [{ kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/resume' }],
    }).result,
  });
  const token = appended.result.human_gate_resume_token as Record<string, unknown>;
  const issuedReadback = readDomainProgressHumanGateResumeToken({
    log: appended.log,
    resumeToken: String(token.resume_token),
  });

  assert.equal(issuedReadback.found, true);
  assert.equal(issuedReadback.lifecycle_status, 'issued');
  assert.equal(issuedReadback.issued_event_id, appended.result.transition_event.event_id);
  assert.equal(issuedReadback.issued_outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.ok(issuedReadback.stage_run_identity);
  assert.equal(issuedReadback.stage_run_identity.stage_run_id, (command.stage_run_identity as Record<string, unknown>).stage_run_id);

  const consumed = consumeDomainProgressHumanGateResumeToken({
    log: appended.log,
    resumeToken: String(token.resume_token),
    decision: 'approve',
    evidenceRef: 'owner-answer:dm003/human-gate-resume',
    consumedBy: 'human_operator',
  });
  assert.equal(consumed.consumption_status, 'consumed');
  assert.equal(consumed.appended, true);
  assert.equal(consumed.token_readback.lifecycle_status, 'consumed');
  assert.ok(consumed.consumption_event);
  assert.equal(consumed.token_readback.consumed_event_id, consumed.consumption_event.event_id);
  assert.equal(consumed.token_readback.consumed_outbox_item_id, appended.result.transactional_outbox_item.outbox_item_id);
  assert.ok(consumed.token_readback.stage_run_identity);
  assert.equal(consumed.token_readback.stage_run_identity.stage_run_id, (command.stage_run_identity as Record<string, unknown>).stage_run_id);

  const repeated = consumeDomainProgressHumanGateResumeToken({
    log: consumed.log,
    resumeToken: String(token.resume_token),
    decision: 'approve',
    evidenceRef: 'owner-answer:dm003/human-gate-resume',
    consumedBy: 'human_operator',
  });
  assert.equal(repeated.consumption_status, 'already_consumed');
  assert.equal(repeated.idempotent_replay, true);
  assert.equal(repeated.appended, false);
  assert.equal(repeated.log.entries.length, consumed.log.entries.length);

  const readModel = rebuildDomainProgressTransitionReadModel({
    log: consumed.log,
    aggregateIdentity: command.aggregate_identity as Record<string, unknown>,
  });
  assert.ok(readModel.latest_human_gate_resume_token);
  assert.equal(readModel.latest_human_gate_resume_token.lifecycle_status, 'consumed');
  assert.equal(readModel.latest_human_gate_resume_token.consumed_event_id, consumed.consumption_event.event_id);
});

test('DomainProgressTransitionRuntime replay consumes human resume token and rebuilds read model', () => {
  const command = normalizeDomainProgressTransitionCommand({
    surface_kind: 'opl_generic_current_control_command_outbox_record',
    runtime_kind: 'DomainProgressTransitionRuntime',
    command_kind: 'OpenHumanGate',
    aggregate_identity: {
      aggregate_kind: 'study_work_unit',
      aggregate_id: '003-dpcc-primary-care-phenotype-treatment-gap::human_gate_replay_resume',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      work_unit_id: 'human_gate_replay_resume',
      work_unit_fingerprint: 'sha256:human-gate-replay-resume',
    },
    action_type: 'manual_owner_decision',
    next_owner: 'human_operator',
    idempotency_key: 'owner-route-attempt::dm003::human-gate-replay-resume',
    source_generation: 'truth-event-human-gate-replay-resume',
    expected_version: 'truth-event-human-gate-replay-resume',
    postcondition: {
      kind: 'human_gate_ref',
      outcome_owner: 'one-person-lab',
      domain_state_owner: 'med-autoscience',
    },
    allowed_decisions: ['approve', 'route_back'],
  }, {
    studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
    actionType: 'manual_owner_decision',
    workUnitId: 'human_gate_replay_resume',
    workUnitFingerprint: 'sha256:human-gate-replay-resume',
    nextOwner: 'human_operator',
  }).command!;
  const replay = replayDomainProgressTransitionTrace({
    traceId: 'dm003-human-gate-resume-token-consumed',
    steps: [
      {
        command,
        observed_outcome: { kind: 'human_gate_ref', human_gate_ref: 'human-gate:dm003/replay-resume' },
        consume_human_gate_resume: {
          decision: 'approve',
          evidence_ref: 'owner-answer:dm003/human-gate-replay-resume',
          consumed_by: 'human_operator',
        },
      },
    ],
  });

  assert.equal(replay.replay_status, 'accepted');
  assert.equal(replay.replay_evidence.human_gate_resume_consumption_count, 1);
  assert.equal(replay.replay_evidence.step_evidence[0].human_gate_resume_token_consumed, true);
  assert.equal(replay.replay_evidence.step_evidence[0].read_model_rebuilt_after_human_gate_resume, true);
  assert.equal(replay.read_model_rebuilds[0].latest_human_gate_resume_token?.lifecycle_status, 'consumed');
  assert.equal(replay.read_model_rebuilds[0].projection_metadata.derived_from_event_id, replay.results[0].transition_event.event_id);
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
        opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
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
    assert.equal(payload.domain_progress_transition_runtime.transactional_outbox.committed_together, true);
    assert.equal(payload.domain_progress_transition_runtime.idempotency_readback.idempotency_key, 'owner-route-attempt::dm003::transition-runtime-readback');
    assert.equal(payload.domain_progress_transition_runtime.read_model_readback.aggregate_version, 1);
    assert.equal(
      payload.domain_progress_transition_runtime.read_model_readback.latest_transition_identity.event_id,
      payload.opl_transition_event.event_id,
    );
    assert.equal(payload.opl_transition_outbox_item.stage_run_identity.stage_run_id, 'stage-run:003-dpcc-primary-care-phenotype-treatment-gap:produce_ai_reviewer_publication_eval_record_against_current_inputs');
    assert.equal(payload.projection_metadata.authority, false);
    assert.equal(payload.projection_metadata.observed_generation, 'truth-event-transition-runtime-readback');
    assert.equal(payload.read_model_rebuild_metadata.derived_from_event_id, payload.opl_transition_event.event_id);
    assert.equal(payload.transition_idempotency_readback.same_transaction_event_and_outbox, true);
    assert.equal(payload.domain_progress_transition_runtime.brand_module_allocation.not_a_new_brand_module, true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
