import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPaperAutonomySupervisorDecision,
  buildPaperAutonomySupervisorDecisionReadback,
  PAPER_AUTONOMY_SUPERVISOR_DECISION_KINDS,
  readPaperAutonomySupervisorDecisionFromObligation,
  selectPaperAutonomyRecoveryObligation,
  type PaperAutonomyRecoveryObligation,
  type PaperAutonomyStageRunIdentity,
  type PaperAutonomySupervisorDecisionKind,
} from '../../src/family-runtime-paper-autonomy.ts';

function identity(overrides: Partial<PaperAutonomyStageRunIdentity> = {}): PaperAutonomyStageRunIdentity {
  return {
    stage_run_id: 'stage-run:dm002:publication-supervision',
    route_identity_key: 'route:dm002:current-owner-delta',
    attempt_idempotency_key: 'attempt:dm002:paper-autonomy:1',
    selected_dispatch_ref: 'mas://DM002/current-owner-delta/latest.json',
    stage_packet_ref: 'opl://stage-packets/dm002/publication-supervision.json',
    stage_packet_refs: [
      'opl://stage-packets/dm002/publication-supervision.json',
    ],
    provider_attempt_ref: 'temporal://workflow/opl-dm002-paper-autonomy',
    attempt_lease_ref: 'lease://opl-dm002-paper-autonomy',
    workflow_ref: 'temporal://workflow/opl-dm002-paper-autonomy',
    source_fingerprint: 'mas-source:dm002:fresh',
    truth_epoch: 'truth:dm002:7',
    runtime_health_epoch: 'runtime:healthy:3',
    work_unit_fingerprint: 'sha256:dm002-paper-work-unit',
    ...overrides,
  };
}

function decisionInput(decision_kind: PaperAutonomySupervisorDecisionKind) {
  return {
    obligation_id: `obligation:${decision_kind}`,
    decision_kind,
    current_identity: identity(),
    current_owner_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
    provider_admission_identity_ref: 'opl://provider-admission/dm002',
    terminal_closeout_ref: 'opl://stage-attempts/dm002/closeout.json',
    recovery_action_ref: 'opl://recovery-actions/dm002/materialize.json',
    human_gate_ref: 'human-gate://dm002/paper-autonomy',
    resume_token: 'resume-token:dm002:paper-autonomy',
    typed_blocker_ref: 'mas://DM002/typed-blockers/stable.json',
    budget_or_missing_evidence_ref: 'opl://runway/budget-exhausted',
    evidence_refs: [
      'mas://DM002/evidence/current-owner-delta.json',
    ],
    observability_refs: [
      'trace://dm002/paper-autonomy',
    ],
  };
}

test('paper autonomy supervisor readback emits all five closed decision packets', () => {
  assert.deepEqual(PAPER_AUTONOMY_SUPERVISOR_DECISION_KINDS, [
    'execute_current_owner_delta',
    'consume_terminal_closeout',
    'materialize_recovery_action',
    'wait_for_owner_with_resume_token',
    'stop_with_stable_typed_blocker',
  ]);

  const packets = PAPER_AUTONOMY_SUPERVISOR_DECISION_KINDS.map((decisionKind) =>
    buildPaperAutonomySupervisorDecisionReadback(decisionInput(decisionKind))
  );

  assert.deepEqual(
    packets.map((packet) => packet.decision_kind),
    PAPER_AUTONOMY_SUPERVISOR_DECISION_KINDS,
  );

  for (const packet of packets) {
    assert.equal(packet.surface_kind, 'opl_paper_autonomy_supervisor_decision_readback');
    assert.equal(packet.domain_truth_owner, 'med-autoscience');
    assert.equal(packet.substrate_owner, 'one-person-lab');
    assert.equal(packet.status, 'decision_ready_for_identity_bound_transition');
    assert.match(packet.decision_id, new RegExp(packet.obligation_id));
    assert.match(packet.decision_id, /stage-run:dm002:publication-supervision/);
    assert.match(packet.decision_id, /route:dm002:current-owner-delta/);
    assert.match(packet.decision_id, /attempt:dm002:paper-autonomy:1/);
    assert.equal(packet.authority_boundary.read_model_can_execute, false);
    assert.equal(packet.authority_boundary.observability_can_close_owner_answer, false);
    assert.equal(packet.authority_boundary.opl_can_write_mas_truth, false);
    assert.equal(packet.authority_boundary.opl_can_create_domain_owner_receipt, false);
    assert.equal(packet.authority_boundary.opl_can_create_domain_typed_blocker, false);
    assert.equal(packet.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(packet.state_index_projection.payload_refs_only, true);
    assert.equal(packet.state_index_projection.forbidden_body_access, true);
    assert.equal(Object.hasOwn(packet.state_index_projection.indexed_refs, 'paper_body'), false);
    assert.deepEqual(packet.observability_refs, ['trace://dm002/paper-autonomy']);
  }
});

test('paper autonomy recovery obligation store query and update are identity-bound', () => {
  const currentIdentity = identity();
  const staleIdentity = identity({
    stage_run_id: 'stage-run:dm002:old',
    route_identity_key: 'route:dm002:old',
    attempt_idempotency_key: 'attempt:dm002:old',
  });
  const obligations: PaperAutonomyRecoveryObligation[] = [
    {
      obligation_id: 'obligation:old',
      desired_delta_ref: 'mas://DM002/current-owner-delta/old.json',
      current_identity: staleIdentity,
      status: 'open',
      last_evidence_refs: ['mas://DM002/evidence/old.json'],
    },
    {
      obligation_id: 'obligation:fresh',
      desired_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
      current_identity: currentIdentity,
      status: 'open',
      last_evidence_refs: ['mas://DM002/evidence/current.json'],
    },
  ];

  assert.equal(selectPaperAutonomyRecoveryObligation(obligations, currentIdentity)?.obligation_id, 'obligation:fresh');
  assert.equal(selectPaperAutonomyRecoveryObligation(obligations, identity({
    source_fingerprint: 'mas-source:dm002:stale',
  })), null);

  const packet = buildPaperAutonomySupervisorDecisionReadback({
    ...decisionInput('materialize_recovery_action'),
    obligation_id: 'obligation:fresh',
    current_identity: currentIdentity,
  });
  const applied = applyPaperAutonomySupervisorDecision(obligations[1], packet);

  assert.equal(applied.applied, true);
  assert.equal(applied.obligation.status, 'recovery_materialized');
  assert.equal(applied.obligation.supervisor_decision_ref, packet.decision_id);
  assert.equal(obligations[0].status, 'open');

  const wrongObligation = applyPaperAutonomySupervisorDecision({
    ...obligations[1],
    obligation_id: 'obligation:other',
  }, packet);
  assert.equal(wrongObligation.applied, false);
  assert.equal(wrongObligation.reason, 'identity_mismatch');
  assert.equal(wrongObligation.obligation.status, 'open');

  const mismatch = applyPaperAutonomySupervisorDecision(obligations[0], packet);
  assert.equal(mismatch.applied, false);
  assert.equal(mismatch.reason, 'identity_mismatch');
  assert.equal(mismatch.obligation.status, 'open');
});

test('paper autonomy supervisor readback fails closed when required transition refs are missing', () => {
  assert.throws(
    () => buildPaperAutonomySupervisorDecisionReadback({
      ...decisionInput('wait_for_owner_with_resume_token'),
      resume_token: undefined,
    }),
    /resume_token/,
  );
  assert.throws(
    () => buildPaperAutonomySupervisorDecisionReadback({
      ...decisionInput('consume_terminal_closeout'),
      terminal_closeout_ref: undefined,
    }),
    /terminal_closeout_ref/,
  );
  assert.throws(
    () => buildPaperAutonomySupervisorDecisionReadback({
      ...decisionInput('execute_current_owner_delta'),
      current_identity: {
        ...identity(),
        stage_packet_refs: [],
      },
    }),
    /stage_packet_refs/,
  );
});

test('paper autonomy supervisor readback maps MAS obligation state without idle or terminal queue shortcuts', () => {
  const noProgressDecision = readPaperAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:no-progress',
    current_identity: identity(),
    current_owner_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
    no_progress_or_inconsistency_ref: 'opl://runway/no-progress/dm002',
    action_queue: [],
    provider_admission_pending_count: 0,
    evidence_refs: [
      'opl://runway/action-queue-empty',
      'opl://runway/provider-admission-pending-count-zero',
    ],
  });

  assert.equal(noProgressDecision.decision_kind, 'materialize_recovery_action');
  assert.equal(noProgressDecision.transition_ref, 'opl://runway/no-progress/dm002');
  assert.equal(noProgressDecision.state_index_projection.indexed_refs.terminal_closeout_ref, null);
  assert.equal(noProgressDecision.authority_boundary.provider_completion_is_domain_ready, false);

  const stopDecision = readPaperAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:typed-blocker',
    current_identity: identity(),
    typed_blocker_ref: 'mas://DM002/typed-blockers/stable.json',
    budget_or_missing_evidence_ref: 'opl://runway/budget-exhausted',
  });
  assert.equal(stopDecision.decision_kind, 'stop_with_stable_typed_blocker');
  assert.equal(stopDecision.transition_ref, 'mas://DM002/typed-blockers/stable.json');

  const waitDecision = readPaperAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:human-gate',
    current_identity: identity(),
    human_gate_ref: 'human-gate://dm002/paper-autonomy',
    resume_token: 'resume-token:dm002:paper-autonomy',
  });
  assert.equal(waitDecision.decision_kind, 'wait_for_owner_with_resume_token');
  assert.equal(waitDecision.transition_ref, 'resume-token:dm002:paper-autonomy');
  assert.equal(
    waitDecision.state_index_projection.indexed_refs.human_gate_ref,
    'human-gate://dm002/paper-autonomy',
  );

  assert.throws(
    () => readPaperAutonomySupervisorDecisionFromObligation({
      obligation_id: 'obligation:execute-missing-identity',
      current_identity: identity({ stage_run_id: '' }),
      current_owner_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
      provider_admission_identity_ref: 'opl://provider-admission/dm002',
    }),
    /stage_run_id/,
  );
});
