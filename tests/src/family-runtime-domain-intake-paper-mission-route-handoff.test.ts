import assert from 'node:assert/strict';
import test from 'node:test';

import {
  intakeMasPaperMissionRouteHandoff,
  intakeMasPaperMissionRouteHandoffsFromExport,
} from '../../src/family-runtime-domain-intake-parts/paper-mission-route-handoff.ts';

function readyHandoff(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'mas_paper_mission_opl_route_handoff_record',
    schema_version: 1,
    source: 'paper-mission-consumption-ledger',
    study_id: '001-paper',
    mission_id: 'paper-mission::001-paper::gate-clearing::manual',
    candidate_ref: 'ops/medautoscience/paper_mission_consumption_ledger/001-paper/candidate.json',
    workspace_root: '/tmp/yang-workspace',
    domain_workspace_root: '/tmp/yang-workspace',
    status: 'accepted_candidate',
    selected_outcome: 'accepted',
    handoff_status: 'ready_for_opl_route_command',
    next_owner: 'one-person-lab',
    paper_mission_transaction_ref: 'paper-mission-transaction:001-paper:1',
    route_identity_key: 'paper-mission-transaction:001-paper:1::route',
    attempt_idempotency_key: '001-paper::gate-clearing::accepted_candidate::opl-attempt',
    request_idempotency_key: '001-paper::gate-clearing::accepted_candidate::opl-request',
    transaction_state: 'materialized',
    opl_route_command_ref: 'ops/medautoscience/paper_mission_consumption_ledger/001-paper/opl_route_command.json',
    opl_route_command: {
      command_kind: 'start_next_stage',
      target: 'paper_mission/gate_clearing',
      runtime_owner: 'one-person-lab',
    },
    route_command_kind: 'start_next_stage',
    route_target: 'paper_mission/gate_clearing',
    transaction_materialized: true,
    can_submit_to_opl_runtime: true,
    can_claim_opl_runtime_enqueued: false,
    can_claim_opl_stage_run_created: false,
    can_claim_provider_running: false,
    can_claim_paper_progress: false,
    can_claim_runtime_ready: false,
    authority_boundary: {
      can_write_owner_receipt: false,
      can_write_typed_blocker: false,
      can_write_human_gate: false,
      can_write_current_package: false,
      can_write_paper_body: false,
      can_write_runtime_queue: false,
      can_write_opl_outbox: false,
      can_write_opl_event: false,
      can_write_opl_stage_run: false,
    },
    forbidden_authority_writes: [
      'owner receipt',
      'typed blocker',
      'human gate',
      'current package',
      'paper body',
      'runtime queue',
      'OPL outbox',
      'OPL event',
      'StageRun',
      'provider attempt',
    ],
    forbidden_authority_claims: [
      'paper progress',
      'runtime ready',
      'OPL StageRun created',
      'provider running',
    ],
    ...overrides,
  };
}

function materializedReadback(overrides: Record<string, unknown> = {}) {
  const studyId = '002-dm-china-us-mortality-attribution';
  const missionId = `paper-mission::${studyId}::gate_clearing_claim_evidence_repair::one-shot-migration`;
  const transactionRef = `paper-mission-transaction::${studyId}::gate_clearing_claim_evidence_repair::${missionId}`;
  return {
    surface_kind: 'paper_mission_materialized_readback',
    schema_version: 1,
    source: 'paper_mission_default_tasks',
    study_id: studyId,
    mission_id: missionId,
    materialized_mission_ref: 'ops/medautoscience/paper_mission_one_shot_migration/dm002/paper_mission_run.json',
    candidate_manifest_ref: 'ops/medautoscience/paper_mission_one_shot_migration/dm002/candidate_manifest.json',
    workspace_root: '/tmp/yang-workspace',
    domain_workspace_root: '/tmp/yang-workspace',
    transaction_state: 'accepted',
    stage_terminal_decision: {
      decision_kind: 'advance',
      status: 'accepted',
      reason: 'accepted',
      next_owner: 'analysis-campaign',
      next_stage_id: 'publication_gate_replay',
      accepted_result: 'accepted_candidate',
    },
    opl_route_command: {
      command_kind: 'start_next_stage',
      target: 'publication_gate_replay',
      reason: 'accepted',
      source_terminal_decision_ref: `${transactionRef}#stage_terminal_decision`,
      stage_run_ref: 'opl-stage-run://paper-mission-materialized/dm002/gate-clearing',
      runtime_owner: 'one-person-lab',
    },
    opl_runtime_carrier: {
      surface_kind: 'mas_domain_progress_transition_request',
      paper_mission_transaction_ref: transactionRef,
      stage_terminal_decision_ref: `${transactionRef}#stage_terminal_decision`,
      opl_route_command_ref: `${transactionRef}#opl_route_command`,
      study_id: studyId,
      work_unit_id: 'gate_clearing_claim_evidence_repair',
      work_unit_fingerprint: `${missionId}::gate_clearing_claim_evidence_repair::advance::accepted`,
      route_identity_key: `${transactionRef}::route`,
      attempt_idempotency_key: `${studyId}::gate_clearing_claim_evidence_repair::accepted_candidate::opl-attempt`,
      request_idempotency_key: `${studyId}::gate_clearing_claim_evidence_repair::accepted_candidate::opl-request`,
      opl_route_command: {
        command_kind: 'start_next_stage',
        target: 'publication_gate_replay',
        reason: 'accepted',
        source_terminal_decision_ref: `${transactionRef}#stage_terminal_decision`,
        runtime_owner: 'one-person-lab',
      },
      authority_boundary: {
        mas_can_create_opl_outbox_record: false,
        mas_can_create_opl_event: false,
        mas_can_create_opl_stage_run: false,
        mas_can_authorize_provider_admission: false,
        mas_can_mark_provider_attempt_running: false,
        provider_completion_is_domain_completion: false,
      },
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
      can_write_opl_outbox: false,
      can_write_opl_event: false,
      can_write_opl_stage_run: false,
      can_write_provider_attempt: false,
    },
    paper_mission_transaction: {
      transaction_id: transactionRef,
      authority_boundary: {
        mas_authority_owner: 'MedAutoScience',
        runtime_owner: 'one-person-lab',
        writes_authority_surface: false,
        writes_publication_eval: false,
        writes_controller_decision: false,
        writes_owner_receipt: false,
        writes_typed_blocker: false,
        writes_human_gate: false,
        writes_current_package: false,
        writes_runtime_queue: false,
        writes_provider_attempt: false,
        writes_yang_authority: false,
      },
    },
    ...overrides,
  };
}

test('MAS paper mission route handoff accepts ready command as OPL runtime request without StageRun or provider claims', () => {
  const readback = intakeMasPaperMissionRouteHandoff(readyHandoff({
    domain_workspace_root: '/tmp/yang-workspace',
  }), {
    commandCwd: '/tmp/opl-repo',
  });

  assert.equal(readback.surface_kind, 'opl_mas_paper_mission_route_handoff_intake_readback');
  assert.equal(readback.status, 'accepted_for_runtime_intake');
  assert.equal(readback.command_kind, 'start_next_stage');
  assert.equal(readback.can_submit_to_opl_runtime, true);
  assert.equal(readback.runtime_start_requested, false);
  assert.equal(readback.writes_opl_outbox, false);
  assert.equal(readback.writes_opl_event, false);
  assert.equal(readback.writes_opl_stage_run, false);
  assert.equal(readback.can_claim_runtime_enqueued, false);
  assert.equal(readback.can_claim_stage_run_created, false);
  assert.equal(readback.can_claim_provider_running, false);
  assert.equal(readback.can_claim_paper_progress, false);
  assert.equal(readback.can_claim_runtime_ready, false);
  assert.equal(readback.accepted_command_packet.surface_kind, 'mas_paper_mission_opl_route_command_packet');
  assert.equal(readback.accepted_command_packet.command_kind, 'start_next_stage');
  assert.equal(readback.accepted_command_packet.route_command_materialized, true);
  assert.equal(readback.accepted_command_packet.writes_opl_outbox, false);
  assert.equal(readback.runtime_request_input?.taskKind, 'paper_mission/stage-route');
  assert.equal(
    readback.runtime_request_input?.dedupeKey,
    'paper-mission-route:001-paper:paper-mission-transaction:001-paper:1:start_next_stage',
  );
  assert.equal(readback.runtime_request_input?.payload.study_id, '001-paper');
  assert.equal(readback.runtime_request_input?.payload.command_kind, 'start_next_stage');
  assert.equal(
    readback.runtime_request_input?.payload.route_identity_key,
    'paper-mission-transaction:001-paper:1::route',
  );
  assert.equal(
    readback.runtime_request_input?.payload.attempt_idempotency_key,
    '001-paper::gate-clearing::accepted_candidate::opl-attempt',
  );
  assert.equal(
    readback.runtime_request_input?.payload.request_idempotency_key,
    '001-paper::gate-clearing::accepted_candidate::opl-request',
  );
  assert.equal(
    (readback.runtime_request_input?.payload.stage_run_request as Record<string, unknown>).route_identity_key,
    'paper-mission-transaction:001-paper:1::route',
  );
  assert.equal(
    (readback.runtime_request_input?.payload.stage_run_request as Record<string, unknown>).attempt_idempotency_key,
    '001-paper::gate-clearing::accepted_candidate::opl-attempt',
  );
  assert.equal(readback.runtime_request_input?.payload.workspace_root, '/tmp/yang-workspace');
  assert.equal(readback.runtime_request_input?.payload.domain_workspace_root, '/tmp/yang-workspace');
  assert.equal(readback.runtime_request_input?.payload.command_cwd, '/tmp/opl-repo');
  const requestAuthority = readback.runtime_request_input?.payload.authority_boundary as Record<string, unknown>;
  assert.equal(requestAuthority.can_claim_opl_runtime_enqueued, false);
  assert.equal(requestAuthority.can_claim_provider_running, false);
  assert.equal(requestAuthority.can_claim_paper_progress, false);
  assert.deepEqual(readback.blockers, []);
});

test('MAS paper mission route handoff fails closed without route attempt identity', () => {
  const missingRouteTarget = intakeMasPaperMissionRouteHandoff(readyHandoff({
    route_target: '',
    opl_route_command: {
      command_kind: 'start_next_stage',
      target: '',
      runtime_owner: 'one-person-lab',
    },
  }));
  assert.equal(missingRouteTarget.status, 'rejected');
  assert.equal(missingRouteTarget.runtime_request_input, null);
  assert.equal(missingRouteTarget.blockers[0].reason, 'missing_route_target');

  const missingRouteIdentity = intakeMasPaperMissionRouteHandoff(readyHandoff({
    route_identity_key: '',
  }));
  assert.equal(missingRouteIdentity.status, 'rejected');
  assert.equal(missingRouteIdentity.runtime_request_input, null);
  assert.equal(missingRouteIdentity.blockers[0].reason, 'missing_route_identity_key');

  const missingAttemptIdentity = intakeMasPaperMissionRouteHandoff(readyHandoff({
    attempt_idempotency_key: '',
  }));
  assert.equal(missingAttemptIdentity.status, 'rejected');
  assert.equal(missingAttemptIdentity.runtime_request_input, null);
  assert.equal(missingAttemptIdentity.blockers[0].reason, 'missing_attempt_idempotency_key');
});

test('MAS paper mission route handoff fails closed instead of using OPL command cwd as domain workspace', () => {
  const readback = intakeMasPaperMissionRouteHandoff(readyHandoff({
    candidate_ref: 'ops/medautoscience/paper_mission_consumption_ledger/001-paper/package_manifest.json',
    workspace_root: '',
    domain_workspace_root: '',
  }), {
    commandCwd: '/tmp/one-person-lab',
  });

  assert.equal(readback.status, 'rejected');
  assert.equal(readback.runtime_request_input, null);
  assert.equal(readback.blockers[0].reason, 'missing_domain_workspace_root');
});

test('MAS paper mission route handoff can derive domain workspace from absolute candidate ref', () => {
  const readback = intakeMasPaperMissionRouteHandoff(readyHandoff({
    candidate_ref:
      '/tmp/yang-workspace/ops/medautoscience/paper_mission_candidate_package/run/001-paper/package_manifest.json',
  }), {
    commandCwd: '/tmp/one-person-lab',
  });

  assert.equal(readback.status, 'accepted_for_runtime_intake');
  assert.equal(readback.runtime_request_input?.payload.workspace_root, '/tmp/yang-workspace');
  assert.equal(readback.runtime_request_input?.payload.domain_workspace_root, '/tmp/yang-workspace');
  assert.equal(readback.runtime_request_input?.payload.command_cwd, '/tmp/one-person-lab');
});

test('MAS paper mission materialized readback is normalized into OPL runtime request', () => {
  const readback = intakeMasPaperMissionRouteHandoff(materializedReadback(), {
    source: 'profile-export',
  });

  assert.equal(readback.source_surface_kind, 'paper_mission_materialized_readback');
  assert.equal(readback.status, 'accepted_for_runtime_intake');
  assert.equal(readback.study_id, '002-dm-china-us-mortality-attribution');
  assert.equal(readback.command_kind, 'start_next_stage');
  assert.equal(readback.route_target, 'publication_gate_replay');
  assert.equal(readback.runtime_start_requested, false);
  assert.equal(readback.writes_opl_stage_run, false);
  assert.equal(readback.can_claim_runtime_enqueued, false);
  assert.equal(readback.can_claim_provider_running, false);
  assert.equal(readback.can_claim_paper_progress, false);
  assert.equal(readback.runtime_request_input?.source, 'profile-export');
  assert.equal(readback.runtime_request_input?.taskKind, 'paper_mission/stage-route');
  assert.equal(
    readback.runtime_request_input?.dedupeKey,
    [
      'paper-mission-route',
      '002-dm-china-us-mortality-attribution',
      'paper-mission-transaction::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::paper-mission::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::one-shot-migration',
      'start_next_stage',
    ].join(':'),
  );
  const requestPayload = readback.runtime_request_input?.payload as Record<string, unknown>;
  const sourceHandoff = requestPayload.opl_route_handoff_record as Record<string, unknown>;
  const stageRunRequest = requestPayload.stage_run_request as Record<string, unknown>;
  assert.equal(requestPayload.route_identity_key, sourceHandoff.route_identity_key);
  assert.equal(requestPayload.attempt_idempotency_key, sourceHandoff.attempt_idempotency_key);
  assert.equal(
    requestPayload.route_identity_key,
    'paper-mission-transaction::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::paper-mission::002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::one-shot-migration::route',
  );
  assert.equal(
    requestPayload.attempt_idempotency_key,
    '002-dm-china-us-mortality-attribution::gate_clearing_claim_evidence_repair::accepted_candidate::opl-attempt',
  );
  assert.equal(stageRunRequest.route_identity_key, requestPayload.route_identity_key);
  assert.equal(stageRunRequest.attempt_idempotency_key, requestPayload.attempt_idempotency_key);
  assert.equal(sourceHandoff.source_surface_kind, 'paper_mission_materialized_readback');
  assert.equal(stageRunRequest.stage_run_created, false);
  assert.equal(stageRunRequest.provider_attempt_requested, false);
  assert.deepEqual(readback.blockers, []);
});

test('MAS paper mission materialized readback keeps typed blocker out of runtime queue', () => {
  const readback = intakeMasPaperMissionRouteHandoff(materializedReadback({
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    transaction_state: 'typed_blocker',
    stage_terminal_decision: {
      decision_kind: 'typed_blocker',
      status: 'typed_blocker',
      reason: 'typed_blocker',
      next_owner: 'one-person-lab',
      blocker_id: 'current_owner_route_superseded_by_existing_typed_blocker',
      unblock_condition: 'MAS authority kernel consumes this mission candidate',
    },
    opl_route_command: {
      command_kind: 'stop_with_typed_blocker',
      target: 'current_owner_route_superseded_by_existing_typed_blocker',
      reason: 'typed_blocker',
      source_terminal_decision_ref: 'paper-mission-transaction::dm003#stage_terminal_decision',
      runtime_owner: 'one-person-lab',
    },
    opl_runtime_carrier: {
      surface_kind: 'mas_domain_progress_transition_request',
      paper_mission_transaction_ref: 'paper-mission-transaction::dm003',
      stage_terminal_decision_ref: 'paper-mission-transaction::dm003#stage_terminal_decision',
      opl_route_command_ref: 'paper-mission-transaction::dm003#opl_route_command',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      opl_route_command: {
        command_kind: 'stop_with_typed_blocker',
        target: 'current_owner_route_superseded_by_existing_typed_blocker',
        reason: 'typed_blocker',
        source_terminal_decision_ref: 'paper-mission-transaction::dm003#stage_terminal_decision',
        runtime_owner: 'one-person-lab',
      },
      authority_boundary: {
        mas_can_create_opl_outbox_record: false,
        mas_can_create_opl_event: false,
        mas_can_create_opl_stage_run: false,
        mas_can_authorize_provider_admission: false,
        mas_can_mark_provider_attempt_running: false,
        provider_completion_is_domain_completion: false,
      },
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
      can_write_opl_outbox: false,
      can_write_opl_event: false,
      can_write_opl_stage_run: false,
      can_write_provider_attempt: false,
    },
  }));

  assert.equal(readback.source_surface_kind, 'paper_mission_materialized_readback');
  assert.equal(readback.status, 'typed_wait');
  assert.equal(readback.wait_kind, 'typed_blocker_authority');
  assert.equal(readback.runtime_request_input, null);
  assert.equal(readback.runtime_start_requested, false);
  assert.equal(readback.can_claim_paper_progress, false);
});

test('MAS paper mission materialized readback fails closed without authority boundary', () => {
  const payload = materializedReadback({
    opl_runtime_carrier: {
      surface_kind: 'mas_domain_progress_transition_request',
      paper_mission_transaction_ref: 'paper-mission-transaction::dm002',
      opl_route_command: {
        command_kind: 'start_next_stage',
        target: 'publication_gate_replay',
      },
    },
    paper_mission_transaction: {
      transaction_id: 'paper-mission-transaction::dm002',
    },
  });
  const readback = intakeMasPaperMissionRouteHandoff(payload);

  assert.equal(readback.status, 'rejected');
  assert.equal(readback.blockers[0].reason, 'missing_authority_boundary');
  assert.equal(readback.runtime_request_input, null);
});

test('MAS paper mission route handoff emits typed waits for blocker human gate and mission complete outcomes', () => {
  const typedBlocker = intakeMasPaperMissionRouteHandoff(readyHandoff({
    handoff_status: 'waiting_for_typed_blocker_authority',
    selected_outcome: 'typed_blocker_required',
    can_submit_to_opl_runtime: false,
    route_command_kind: 'resume_stage',
    opl_route_command: {
      command_kind: 'resume_stage',
      target: 'paper_mission/gate_clearing',
    },
  }));
  assert.equal(typedBlocker.status, 'typed_wait');
  assert.equal(typedBlocker.wait_kind, 'typed_blocker_authority');
  assert.equal(typedBlocker.runtime_start_requested, false);
  assert.equal(typedBlocker.writes_opl_outbox, false);

  const humanGate = intakeMasPaperMissionRouteHandoff(readyHandoff({
    handoff_status: 'waiting_for_human_gate_authority',
    selected_outcome: 'human_gate_required',
    can_submit_to_opl_runtime: false,
    route_command_kind: 'wait_for_human',
    opl_route_command: {
      command_kind: 'wait_for_human',
      target: 'paper_mission/operator_decision',
    },
  }));
  assert.equal(humanGate.status, 'typed_wait');
  assert.equal(humanGate.wait_kind, 'human_gate_authority');
  assert.equal(humanGate.runtime_start_requested, false);

  const complete = intakeMasPaperMissionRouteHandoff(readyHandoff({
    handoff_status: 'mission_complete',
    selected_outcome: 'accepted',
    can_submit_to_opl_runtime: false,
    route_command_kind: 'complete_mission',
    opl_route_command: {
      command_kind: 'complete_mission',
      target: 'paper_mission/complete',
    },
  }));
  assert.equal(complete.status, 'terminal_no_runtime');
  assert.equal(complete.wait_kind, 'mission_complete');
  assert.equal(complete.runtime_start_requested, false);
});

test('MAS paper mission route handoff fails closed on unknown missing forbidden and unsupported payloads', () => {
  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      surface_kind: 'mas_other_surface',
    }).blockers[0].reason,
    'unknown_surface_kind',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      paper_mission_transaction_ref: '',
    }).blockers[0].reason,
    'missing_paper_mission_transaction',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      can_claim_opl_stage_run_created: true,
    }).blockers[0].reason,
    'forbidden_authority_claim',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      authority_boundary: {
        can_write_owner_receipt: false,
        can_write_typed_blocker: false,
        can_write_human_gate: false,
        can_write_current_package: false,
        can_write_paper_body: false,
        can_write_runtime_queue: false,
        can_write_opl_outbox: true,
        can_write_opl_event: false,
        can_write_opl_stage_run: false,
      },
    }).blockers[0].reason,
    'forbidden_authority_write',
  );

  assert.equal(
    intakeMasPaperMissionRouteHandoff({
      ...readyHandoff(),
      route_command_kind: 'launch_provider_now',
      opl_route_command: {
        command_kind: 'launch_provider_now',
      },
    }).blockers[0].reason,
    'unsupported_route_command',
  );
});

test('MAS paper mission route handoff export intake prefers paper_mission_default_tasks over legacy mixed pending queue', () => {
  const exportReadback = intakeMasPaperMissionRouteHandoffsFromExport({
    paper_mission_default_tasks: [
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        opl_route_handoff: readyHandoff(),
      },
    ],
    pending_family_tasks_policy: {
      default_paper_mission_queue_source: '/paper_mission_default_tasks',
      legacy_mixed_queue_source: '/pending_family_tasks',
    },
    pending_family_tasks: [
      {
        task_kind: 'paper_mission/start_or_resume',
        default_paper_mission_entry: true,
        opl_route_handoff: readyHandoff({
          paper_mission_transaction_ref: '',
        }),
      },
    ],
  });

  assert.equal(exportReadback.source_path, '/paper_mission_default_tasks');
  assert.equal(exportReadback.readbacks.length, 1);
  assert.equal(exportReadback.readbacks[0].status, 'accepted_for_runtime_intake');
  assert.equal(exportReadback.legacy_pending_family_tasks_considered, false);
  assert.equal(exportReadback.authority_boundary.writes_opl_outbox, false);
  assert.equal(exportReadback.authority_boundary.writes_opl_stage_run, false);
});

test('MAS paper mission route handoff export intake can consume explicit legacy handoff when default queue is empty', () => {
  const exportReadback = intakeMasPaperMissionRouteHandoffsFromExport({
    paper_mission_default_tasks: [],
    pending_family_tasks_policy: {
      default_paper_mission_queue_source: '/paper_mission_default_tasks',
      legacy_mixed_queue_source: '/pending_family_tasks',
    },
    pending_family_tasks: [
      {
        task_kind: 'domain_owner/default-executor-dispatch',
        default_paper_mission_entry: false,
        paper_mission_default_role: 'diagnostic_or_explicit_owner_handoff',
        opl_route_handoff: readyHandoff({
          route_command_kind: 'route_back',
          opl_route_command: {
            command_kind: 'route_back',
            target: 'paper_mission/corrected_candidate',
          },
        }),
      },
    ],
  });

  assert.equal(exportReadback.source_path, '/pending_family_tasks');
  assert.equal(exportReadback.legacy_pending_family_tasks_considered, true);
  assert.equal(exportReadback.readbacks.length, 1);
  assert.equal(exportReadback.readbacks[0].status, 'accepted_for_runtime_intake');
  assert.equal(exportReadback.readbacks[0].command_kind, 'route_back');
  assert.equal(exportReadback.readbacks[0].writes_opl_stage_run, false);
});
