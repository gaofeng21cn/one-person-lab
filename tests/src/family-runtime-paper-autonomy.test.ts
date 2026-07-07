import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  appendPaperAutonomyCloseoutInboxPending,
  appendPaperAutonomyCloseoutInboxJsonl,
  appendPaperAutonomyRecoveryObligation,
  appendPaperAutonomyRecoveryObligationStoreJsonl,
  appendPaperAutonomySupervisorDecisionLedgerJsonl,
  applyPaperAutonomySupervisorDecision,
  applyPaperAutonomySupervisorDecisionFromLedger,
  buildPaperAutonomySupervisorDecisionReadback,
  consumePaperAutonomyCloseoutInboxEntry,
  currentPaperAutonomySupervisorDecision,
  domainAutonomyProjection,
  listCurrentPaperAutonomySupervisorDecisions,
  PAPER_AUTONOMY_SUPERVISOR_DECISION_KINDS,
  readPaperAutonomySupervisorDecisionFromObligation,
  readPaperAutonomyCloseoutInboxEntry,
  readPaperAutonomyCloseoutInboxJsonl,
  readPaperAutonomyRecoveryObligationStoreJsonl,
  readPaperAutonomySupervisorDecisionLedgerJsonl,
  recordPaperAutonomySupervisorDecision,
  rejectPaperAutonomyCloseoutInboxEntry,
  selectPaperAutonomyRecoveryObligation,
  type PaperAutonomyCloseoutInboxEntry,
  type PaperAutonomyRecoveryObligation,
  type PaperAutonomyRecoveryObligationStoreEntry,
  type PaperAutonomyStageRunIdentity,
  type PaperAutonomySupervisorDecisionKind,
  type PaperAutonomySupervisorDecisionLedgerEntry,
} from '../../src/modules/runway/family-runtime-paper-autonomy.ts';

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
    owner_receipt_ref: 'mas://DM002/owner-receipts/stopped.json',
    budget_or_missing_evidence_ref: 'opl://runway/budget-exhausted',
    evidence_refs: [
      'mas://DM002/evidence/current-owner-delta.json',
    ],
    observability_refs: [
      'trace://dm002/paper-autonomy',
    ],
  };
}

test('paper autonomy supervisor readback emits all six closed decision packets', () => {
  assert.deepEqual(PAPER_AUTONOMY_SUPERVISOR_DECISION_KINDS, [
    'execute_current_owner_delta',
    'consume_terminal_closeout',
    'materialize_recovery_action',
    'wait_for_owner_with_resume_token',
    'stop_with_stable_typed_blocker',
    'stop_with_owner_receipt',
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
    assert.equal(packet.surface_id, 'opl_domain_autonomy_supervisor_decision_readback');
    assert.equal(packet.canonical_surface_kind, 'opl_domain_autonomy_supervisor_decision_readback');
    assert.equal(packet.legacy_surface_kind, 'opl_paper_autonomy_supervisor_decision_readback');
    assert.deepEqual(packet.compatibility_profile, {
      profile_id: 'mas-paper-autonomy',
      source_domain: 'medautoscience',
      compatibility_only: true,
    });
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
  assert.equal(applied.transition.surface_kind, 'opl_paper_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.surface_id, 'opl_domain_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.canonical_surface_kind, 'opl_domain_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.legacy_surface_kind, 'opl_paper_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.transition_kind, 'materialize_recovery_action');
  assert.equal(applied.transition.transition_ref, 'opl://recovery-actions/dm002/materialize.json');
  assert.equal(applied.transition.current_identity.route_identity_key, currentIdentity.route_identity_key);
  assert.equal(applied.transition.authority_boundary.opl_can_write_mas_truth, false);
  assert.equal(applied.transition.authority_boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(applied.transition.authority_boundary.opl_can_create_domain_typed_blocker, false);
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

test('domain autonomy projection keeps MAS paper autonomy as a compatibility profile', () => {
  const projection = domainAutonomyProjection({
    domain_id: 'medautoscience',
    task_kind: 'paper_autonomy/guarded-apply',
    dedupe_key: 'paper-autonomy:dm002:1',
  }, {
    study_id: 'DM002',
    source_fingerprint: 'sha256:source',
  });

  assert.equal(projection?.surface_kind, 'opl_mas_paper_autonomy_task_projection');
  assert.equal(projection?.surface_id, 'opl_domain_autonomy_task_projection');
  assert.equal(projection?.canonical_surface_kind, 'opl_domain_autonomy_task_projection');
  assert.equal(projection?.legacy_surface_kind, 'opl_mas_paper_autonomy_task_projection');
  assert.deepEqual(projection?.compatibility_profile, {
    profile_id: 'mas-paper-autonomy',
    source_domain: 'medautoscience',
    compatibility_only: true,
  });
  assert.equal(projection?.domain_truth_owner, 'med-autoscience');
  assert.equal(projection?.queue_owner, 'one-person-lab');
  assert.equal(projection?.authority_boundary.writes_mas_truth, false);
});

test('paper autonomy supervisor execute decision produces provider admission transition packet', () => {
  const currentIdentity = identity();
  const obligation: PaperAutonomyRecoveryObligation = {
    obligation_id: 'obligation:execute-current-owner-delta',
    desired_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };
  const packet = buildPaperAutonomySupervisorDecisionReadback({
    ...decisionInput('execute_current_owner_delta'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  });
  const applied = applyPaperAutonomySupervisorDecision(obligation, packet);

  assert.equal(applied.applied, true);
  assert.equal(applied.transition.surface_kind, 'opl_paper_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.transition_kind, 'execute_current_owner_delta');
  assert.equal(applied.transition.transition_ref, 'mas://DM002/current-owner-delta/latest.json');
  assert.equal(applied.transition.provider_admission_identity_ref, 'opl://provider-admission/dm002');
  assert.equal(applied.transition.runtime_apply_target.kind, 'provider_attempt_or_owner_callable');
  assert.equal(applied.transition.runtime_apply_target.provider_admission_required, true);
  assert.equal(applied.transition.runtime_apply_target.owner_callable_required, true);
  assert.equal(applied.transition.runtime_apply_target.domain_truth_owner, 'med-autoscience');
  assert.equal(applied.transition.state_index_projection.payload_refs_only, true);
  assert.equal(applied.transition.state_index_projection.indexed_refs.supervisor_decision_ref, packet.decision_id);
});

test('paper autonomy supervisor owner receipt stop produces refs-only owner receipt consumption transition packet', () => {
  const currentIdentity = identity();
  const obligation: PaperAutonomyRecoveryObligation = {
    obligation_id: 'obligation:owner-receipt-stop',
    desired_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };
  const packet = buildPaperAutonomySupervisorDecisionReadback({
    ...decisionInput('stop_with_owner_receipt'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    provider_admission_identity_ref: undefined,
  });
  const applied = applyPaperAutonomySupervisorDecision(obligation, packet);

  assert.equal(packet.transition_ref, 'mas://DM002/owner-receipts/stopped.json');
  assert.equal(packet.owner_receipt_ref, 'mas://DM002/owner-receipts/stopped.json');
  assert.equal(packet.provider_admission_identity_ref, null);
  assert.equal(packet.authority_boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(packet.state_index_projection.indexed_refs.owner_receipt_ref, 'mas://DM002/owner-receipts/stopped.json');
  assert.equal(packet.state_index_projection.indexed_refs.owner_answer_ref, 'mas://DM002/owner-receipts/stopped.json');
  assert.equal(applied.applied, true);
  assert.equal(applied.obligation.status, 'stopped_with_owner_receipt');
  assert.equal(applied.transition.transition_kind, 'stop_with_owner_receipt');
  assert.equal(applied.transition.transition_ref, 'mas://DM002/owner-receipts/stopped.json');
  assert.equal(applied.transition.provider_admission_identity_ref, null);
  assert.equal(applied.transition.runtime_apply_target.kind, 'owner_receipt_consumption');
  assert.equal(applied.transition.runtime_apply_target.provider_admission_required, false);
  assert.equal(applied.transition.runtime_apply_target.owner_callable_required, false);
  assert.equal(applied.transition.runtime_apply_target.owner_receipt_consumption_required, true);
  assert.equal(applied.transition.runtime_apply_target.stable_typed_blocker_required, false);
  assert.equal(applied.transition.authority_boundary.opl_can_create_domain_owner_receipt, false);
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
  assert.throws(
    () => buildPaperAutonomySupervisorDecisionReadback({
      ...decisionInput('stop_with_owner_receipt'),
      owner_receipt_ref: undefined,
    }),
    /owner_receipt_ref/,
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

  const ownerReceiptDecision = readPaperAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:owner-receipt',
    current_identity: identity(),
    owner_receipt_ref: 'mas://DM002/owner-receipts/stopped.json',
    evidence_refs: ['mas://DM002/evidence/owner-receipt.json'],
  });
  assert.equal(ownerReceiptDecision.decision_kind, 'stop_with_owner_receipt');
  assert.equal(ownerReceiptDecision.transition_ref, 'mas://DM002/owner-receipts/stopped.json');
  assert.equal(ownerReceiptDecision.state_index_projection.indexed_refs.owner_receipt_ref, 'mas://DM002/owner-receipts/stopped.json');

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

  assert.throws(
    () => readPaperAutonomySupervisorDecisionFromObligation({
      obligation_id: 'obligation:queue-empty-alone',
      current_identity: identity(),
      action_queue: [],
      provider_admission_pending_count: 0,
      evidence_refs: [
        'opl://runway/action-queue-empty',
        'opl://runway/provider-admission-pending-count-zero',
      ],
    }),
    /action_queue and provider_admission_pending_count are not terminal evidence/,
  );
});

test('paper autonomy durable decision ledger keeps exactly one current latest decision per identity', () => {
  const currentIdentity = identity();
  const obligation: PaperAutonomyRecoveryObligation = {
    obligation_id: 'obligation:durable-current-latest',
    desired_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };
  let obligationEntries: PaperAutonomyRecoveryObligationStoreEntry[] = [];
  obligationEntries = appendPaperAutonomyRecoveryObligation(obligationEntries, {
    obligation,
    appended_at: '2026-06-15T00:00:00.000Z',
  }).entries;

  const firstDecision = buildPaperAutonomySupervisorDecisionReadback({
    ...decisionInput('execute_current_owner_delta'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  });
  const secondDecision = buildPaperAutonomySupervisorDecisionReadback({
    ...decisionInput('consume_terminal_closeout'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  });

  let decisionEntries: PaperAutonomySupervisorDecisionLedgerEntry[] = [];
  let recorded = recordPaperAutonomySupervisorDecision(decisionEntries, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    decision: firstDecision,
    appended_at: '2026-06-15T00:00:01.000Z',
  });
  assert.equal(recorded.accepted, true);
  decisionEntries = recorded.entries;

  recorded = recordPaperAutonomySupervisorDecision(decisionEntries, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    decision: secondDecision,
    appended_at: '2026-06-15T00:00:02.000Z',
  });
  assert.equal(recorded.accepted, true);
  decisionEntries = recorded.entries;

  const currentDecisions = listCurrentPaperAutonomySupervisorDecisions(decisionEntries, {
    obligation_id: obligation.obligation_id,
  });
  assert.equal(currentDecisions.length, 1);
  assert.equal(currentDecisions[0].decision_id, secondDecision.decision_id);
  assert.equal(currentPaperAutonomySupervisorDecision(decisionEntries, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  })?.decision_id, secondDecision.decision_id);

  const staleApply = applyPaperAutonomySupervisorDecisionFromLedger({
    obligation_entries: obligationEntries,
    decision_entries: decisionEntries,
    decision: firstDecision,
    applied_at: '2026-06-15T00:00:03.000Z',
  });
  assert.equal(staleApply.applied, false);
  assert.equal(staleApply.reason, 'stale_supervisor_decision');
  assert.equal(staleApply.entries.at(-1)?.entry_kind, 'obligation_apply_rejected');

  const latestApply = applyPaperAutonomySupervisorDecisionFromLedger({
    obligation_entries: staleApply.entries,
    decision_entries: decisionEntries,
    decision: secondDecision,
    applied_at: '2026-06-15T00:00:04.000Z',
  });
  assert.equal(latestApply.applied, true);
  assert.equal(latestApply.obligation.status, 'terminal_closeout_consumed');
  assert.equal(latestApply.obligation.supervisor_decision_ref, secondDecision.decision_id);
});

test('paper autonomy durable decision ledger rejects identity mismatches without changing current latest', () => {
  const currentIdentity = identity();
  const mismatchedDecision = buildPaperAutonomySupervisorDecisionReadback({
    ...decisionInput('materialize_recovery_action'),
    obligation_id: 'obligation:identity-mismatch',
    current_identity: identity({
      route_identity_key: 'route:dm002:stale',
      source_fingerprint: 'mas-source:dm002:stale',
    }),
  });

  const recorded = recordPaperAutonomySupervisorDecision([], {
    obligation_id: 'obligation:identity-mismatch',
    current_identity: currentIdentity,
    decision: mismatchedDecision,
    appended_at: '2026-06-15T00:01:00.000Z',
  });

  assert.equal(recorded.accepted, false);
  assert.equal(recorded.reason, 'identity_mismatch');
  assert.equal(recorded.entries.at(-1)?.entry_kind, 'supervisor_decision_rejected');
  assert.equal(currentPaperAutonomySupervisorDecision(recorded.entries, {
    obligation_id: 'obligation:identity-mismatch',
    current_identity: currentIdentity,
  }), null);
});

test('paper autonomy closeout inbox records pending closeouts as consumed or rejected by identity', () => {
  const currentIdentity = identity();
  let inboxEntries: PaperAutonomyCloseoutInboxEntry[] = [];
  inboxEntries = appendPaperAutonomyCloseoutInboxPending(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-consumed.json',
    obligation_id: 'obligation:closeout-consumed',
    current_identity: currentIdentity,
    terminal_closeout_ref: 'opl://stage-attempts/dm002/closeout-consumed.json',
    appended_at: '2026-06-15T00:02:00.000Z',
  }).entries;

  assert.equal(readPaperAutonomyCloseoutInboxEntry(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-consumed.json',
    current_identity: currentIdentity,
  })?.status, 'pending');

  const consumed = consumePaperAutonomyCloseoutInboxEntry(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-consumed.json',
    current_identity: currentIdentity,
    supervisor_decision_ref: 'supervisor-decision:consume-closeout',
    consumed_at: '2026-06-15T00:02:01.000Z',
  });
  assert.equal(consumed.consumed, true);
  assert.equal(readPaperAutonomyCloseoutInboxEntry(consumed.entries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-consumed.json',
    current_identity: currentIdentity,
  })?.status, 'consumed');

  inboxEntries = appendPaperAutonomyCloseoutInboxPending(consumed.entries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-rejected.json',
    obligation_id: 'obligation:closeout-rejected',
    current_identity: currentIdentity,
    terminal_closeout_ref: 'opl://stage-attempts/dm002/closeout-rejected.json',
    appended_at: '2026-06-15T00:03:00.000Z',
  }).entries;

  const rejected = rejectPaperAutonomyCloseoutInboxEntry(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-rejected.json',
    current_identity: currentIdentity,
    reason: 'domain_closeout_identity_mismatch',
    rejected_at: '2026-06-15T00:03:01.000Z',
  });
  assert.equal(rejected.rejected, true);
  assert.equal(readPaperAutonomyCloseoutInboxEntry(rejected.entries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-rejected.json',
    current_identity: currentIdentity,
  })?.status, 'rejected');
});

test('paper autonomy physical JSONL ledgers replay obligation, decision, and closeout inbox state', () => {
  const currentIdentity = identity();
  const root = mkdtempSync(join(tmpdir(), 'opl-paper-autonomy-jsonl-'));
  const obligationLedgerPath = join(root, 'obligations.jsonl');
  const decisionLedgerPath = join(root, 'decisions.jsonl');
  const closeoutInboxPath = join(root, 'closeout-inbox.jsonl');
  const obligation: PaperAutonomyRecoveryObligation = {
    obligation_id: 'obligation:physical-jsonl',
    desired_delta_ref: 'mas://DM002/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };

  const appendedObligation = appendPaperAutonomyRecoveryObligation([], {
    obligation,
    appended_at: '2026-06-15T00:04:00.000Z',
  });
  appendPaperAutonomyRecoveryObligationStoreJsonl(
    obligationLedgerPath,
    appendedObligation.entry,
  );

  const decision = buildPaperAutonomySupervisorDecisionReadback({
    ...decisionInput('stop_with_owner_receipt'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    provider_admission_identity_ref: undefined,
  });
  const recordedDecision = recordPaperAutonomySupervisorDecision([], {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    decision,
    appended_at: '2026-06-15T00:04:01.000Z',
  });
  assert.equal(recordedDecision.accepted, true);
  appendPaperAutonomySupervisorDecisionLedgerJsonl(
    decisionLedgerPath,
    recordedDecision.entry,
  );

  let closeoutEntries: PaperAutonomyCloseoutInboxEntry[] = [];
  closeoutEntries = appendPaperAutonomyCloseoutInboxPending(closeoutEntries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-physical.json',
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    terminal_closeout_ref: 'opl://stage-attempts/dm002/closeout-physical.json',
    appended_at: '2026-06-15T00:04:02.000Z',
  }).entries;
  appendPaperAutonomyCloseoutInboxJsonl(closeoutInboxPath, closeoutEntries.at(-1)!);
  const consumed = consumePaperAutonomyCloseoutInboxEntry(closeoutEntries, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-physical.json',
    current_identity: currentIdentity,
    supervisor_decision_ref: decision.decision_id,
    consumed_at: '2026-06-15T00:04:03.000Z',
  });
  assert.equal(consumed.consumed, true);
  appendPaperAutonomyCloseoutInboxJsonl(closeoutInboxPath, consumed.entry);

  const replayedObligations = readPaperAutonomyRecoveryObligationStoreJsonl(obligationLedgerPath);
  const replayedDecisions = readPaperAutonomySupervisorDecisionLedgerJsonl(decisionLedgerPath);
  const replayedCloseouts = readPaperAutonomyCloseoutInboxJsonl(closeoutInboxPath);

  assert.equal(replayedObligations.length, 1);
  assert.equal(replayedObligations[0].projection.append_only_jsonl_compatible, true);
  assert.equal(currentPaperAutonomySupervisorDecision(replayedDecisions, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  })?.decision_id, decision.decision_id);
  assert.equal(readPaperAutonomyCloseoutInboxEntry(replayedCloseouts, {
    closeout_ref: 'opl://stage-attempts/dm002/closeout-physical.json',
    current_identity: currentIdentity,
  })?.status, 'consumed');

  assert.throws(
    () => appendPaperAutonomyCloseoutInboxJsonl(
      closeoutInboxPath,
      replayedObligations[0] as unknown as PaperAutonomyCloseoutInboxEntry,
    ),
    /Unexpected paper autonomy JSONL append surface/,
  );
  assert.throws(
    () => readPaperAutonomySupervisorDecisionLedgerJsonl(closeoutInboxPath),
    /Unexpected paper autonomy JSONL surface/,
  );
});
