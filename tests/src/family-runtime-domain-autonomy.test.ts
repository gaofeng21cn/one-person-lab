import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  appendDomainAutonomyCloseoutInboxPending,
  appendDomainAutonomyCloseoutInboxJsonl,
  appendDomainAutonomyRecoveryObligation,
  appendDomainAutonomyRecoveryObligationStoreJsonl,
  appendDomainAutonomySupervisorDecisionLedgerJsonl,
  applyDomainAutonomySupervisorDecision,
  applyDomainAutonomySupervisorDecisionFromLedger,
  buildDomainAutonomySupervisorDecisionReadback,
  consumeDomainAutonomyCloseoutInboxEntry,
  currentDomainAutonomySupervisorDecision,
  domainAutonomyProjection,
  listCurrentDomainAutonomySupervisorDecisions,
  DOMAIN_AUTONOMY_SUPERVISOR_DECISION_KINDS,
  readDomainAutonomySupervisorDecisionFromObligation,
  readDomainAutonomyCloseoutInboxEntry,
  readDomainAutonomyCloseoutInboxJsonl,
  readDomainAutonomyRecoveryObligationStoreJsonl,
  readDomainAutonomySupervisorDecisionLedgerJsonl,
  recordDomainAutonomySupervisorDecision,
  rejectDomainAutonomyCloseoutInboxEntry,
  selectDomainAutonomyRecoveryObligation,
  type DomainAutonomyCloseoutInboxEntry,
  type DomainAutonomyRecoveryObligation,
  type DomainAutonomyRecoveryObligationStoreEntry,
  type DomainAutonomyStageRunIdentity,
  type DomainAutonomySupervisorDecisionKind,
  type DomainAutonomySupervisorDecisionLedgerEntry,
} from '../../src/modules/runway/family-runtime-domain-autonomy.ts';

function identity(overrides: Partial<DomainAutonomyStageRunIdentity> = {}): DomainAutonomyStageRunIdentity {
  return {
    stage_run_id: 'stage-run:example:owner-supervision',
    route_identity_key: 'route:example:current-owner-delta',
    attempt_idempotency_key: 'attempt:example:domain-autonomy:1',
    selected_dispatch_ref: 'domain://example/current-owner-delta/latest.json',
    stage_packet_ref: 'opl://stage-packets/example/owner-supervision.json',
    stage_packet_refs: [
      'opl://stage-packets/example/owner-supervision.json',
    ],
    provider_attempt_ref: 'temporal://workflow/opl-example-domain-autonomy',
    attempt_lease_ref: 'lease://opl-example-domain-autonomy',
    workflow_ref: 'temporal://workflow/opl-example-domain-autonomy',
    source_fingerprint: 'domain-source:example:fresh',
    truth_epoch: 'truth:example:7',
    runtime_health_epoch: 'runtime:healthy:3',
    work_unit_fingerprint: 'sha256:example-work-unit',
    ...overrides,
  };
}

function decisionInput(decision_kind: DomainAutonomySupervisorDecisionKind) {
  return {
    obligation_id: `obligation:${decision_kind}`,
    decision_kind,
    current_identity: identity(),
    domain_id: 'example-domain',
    domain_truth_owner: 'example-domain-owner',
    current_owner_delta_ref: 'domain://example/current-owner-delta/latest.json',
    provider_admission_identity_ref: 'opl://provider-admission/example',
    terminal_closeout_ref: 'opl://stage-attempts/example/closeout.json',
    recovery_action_ref: 'opl://recovery-actions/example/materialize.json',
    human_gate_ref: 'human-gate://example/domain-autonomy',
    resume_token: 'resume-token:example:domain-autonomy',
    typed_blocker_ref: 'domain://example/typed-blockers/stable.json',
    owner_receipt_ref: 'domain://example/owner-receipts/stopped.json',
    budget_or_missing_evidence_ref: 'opl://runway/budget-exhausted',
    evidence_refs: [
      'domain://example/evidence/current-owner-delta.json',
    ],
    observability_refs: [
      'trace://example/domain-autonomy',
    ],
  };
}

test('domain autonomy supervisor readback emits all six closed decision packets', () => {
  assert.deepEqual(DOMAIN_AUTONOMY_SUPERVISOR_DECISION_KINDS, [
    'execute_current_owner_delta',
    'consume_terminal_closeout',
    'materialize_recovery_action',
    'wait_for_owner_with_resume_token',
    'stop_with_stable_typed_blocker',
    'stop_with_owner_receipt',
  ]);

  const packets = DOMAIN_AUTONOMY_SUPERVISOR_DECISION_KINDS.map((decisionKind) =>
    buildDomainAutonomySupervisorDecisionReadback(decisionInput(decisionKind))
  );

  assert.deepEqual(
    packets.map((packet) => packet.decision_kind),
    DOMAIN_AUTONOMY_SUPERVISOR_DECISION_KINDS,
  );

  for (const packet of packets) {
    assert.equal(packet.surface_kind, 'opl_domain_autonomy_supervisor_decision_readback');
    assert.equal(packet.surface_id, 'opl_domain_autonomy_supervisor_decision_readback');
    assert.equal(packet.canonical_surface_kind, 'opl_domain_autonomy_supervisor_decision_readback');
    assert.equal(packet.domain_id, 'example-domain');
    assert.equal(packet.domain_truth_owner, 'example-domain-owner');
    assert.equal(packet.substrate_owner, 'one-person-lab');
    assert.equal(packet.status, 'decision_ready_for_identity_bound_transition');
    assert.match(packet.decision_id, new RegExp(packet.obligation_id));
    assert.match(packet.decision_id, /stage-run:example:owner-supervision/);
    assert.match(packet.decision_id, /route:example:current-owner-delta/);
    assert.match(packet.decision_id, /attempt:example:domain-autonomy:1/);
    assert.equal(packet.authority_boundary.read_model_can_execute, false);
    assert.equal(packet.authority_boundary.observability_can_close_owner_answer, false);
    assert.equal(packet.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(packet.authority_boundary.opl_can_create_domain_owner_receipt, false);
    assert.equal(packet.authority_boundary.opl_can_create_domain_typed_blocker, false);
    assert.equal(packet.authority_boundary.provider_completion_is_domain_ready, false);
    assert.equal(packet.state_index_projection.payload_refs_only, true);
    assert.equal(packet.state_index_projection.forbidden_body_access, true);
    assert.equal(Object.hasOwn(packet.state_index_projection.indexed_refs, 'artifact_body'), false);
    assert.deepEqual(packet.observability_refs, ['trace://example/domain-autonomy']);
  }
});

test('domain autonomy recovery obligation store query and update are identity-bound', () => {
  const currentIdentity = identity();
  const staleIdentity = identity({
    stage_run_id: 'stage-run:example:old',
    route_identity_key: 'route:example:old',
    attempt_idempotency_key: 'attempt:example:old',
  });
  const obligations: DomainAutonomyRecoveryObligation[] = [
    {
      obligation_id: 'obligation:old',
      desired_delta_ref: 'domain://example/current-owner-delta/old.json',
      current_identity: staleIdentity,
      status: 'open',
      last_evidence_refs: ['domain://example/evidence/old.json'],
    },
    {
      obligation_id: 'obligation:fresh',
      desired_delta_ref: 'domain://example/current-owner-delta/latest.json',
      current_identity: currentIdentity,
      status: 'open',
      last_evidence_refs: ['domain://example/evidence/current.json'],
    },
  ];

  assert.equal(selectDomainAutonomyRecoveryObligation(obligations, currentIdentity)?.obligation_id, 'obligation:fresh');
  assert.equal(selectDomainAutonomyRecoveryObligation(obligations, identity({
    source_fingerprint: 'domain-source:example:stale',
  })), null);

  const packet = buildDomainAutonomySupervisorDecisionReadback({
    ...decisionInput('materialize_recovery_action'),
    obligation_id: 'obligation:fresh',
    current_identity: currentIdentity,
  });
  const applied = applyDomainAutonomySupervisorDecision(obligations[1], packet);

  assert.equal(applied.applied, true);
  assert.equal(applied.obligation.status, 'recovery_materialized');
  assert.equal(applied.obligation.supervisor_decision_ref, packet.decision_id);
  assert.equal(applied.transition.surface_kind, 'opl_domain_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.surface_id, 'opl_domain_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.canonical_surface_kind, 'opl_domain_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.transition_kind, 'materialize_recovery_action');
  assert.equal(applied.transition.transition_ref, 'opl://recovery-actions/example/materialize.json');
  assert.equal(applied.transition.current_identity.route_identity_key, currentIdentity.route_identity_key);
  assert.equal(applied.transition.authority_boundary.opl_can_write_domain_truth, false);
  assert.equal(applied.transition.authority_boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(applied.transition.authority_boundary.opl_can_create_domain_typed_blocker, false);
  assert.equal(obligations[0].status, 'open');

  const wrongObligation = applyDomainAutonomySupervisorDecision({
    ...obligations[1],
    obligation_id: 'obligation:other',
  }, packet);
  assert.equal(wrongObligation.applied, false);
  assert.equal(wrongObligation.reason, 'identity_mismatch');
  assert.equal(wrongObligation.obligation.status, 'open');

  const mismatch = applyDomainAutonomySupervisorDecision(obligations[0], packet);
  assert.equal(mismatch.applied, false);
  assert.equal(mismatch.reason, 'identity_mismatch');
  assert.equal(mismatch.obligation.status, 'open');
});

test('domain autonomy projection uses canonical task kinds and domain-owned fields', () => {
  const projection = domainAutonomyProjection({
    domain_id: 'example-domain',
    task_kind: 'domain_autonomy/guarded-apply',
    dedupe_key: 'domain-autonomy:example:1',
  }, {
    domain_truth_owner: 'example-domain-owner',
    work_unit_ref: 'domain://example/work-units/current',
    source_fingerprint: 'sha256:source',
  });

  assert.equal(projection?.surface_kind, 'opl_domain_autonomy_task_projection');
  assert.equal(projection?.surface_id, 'opl_domain_autonomy_task_projection');
  assert.equal(projection?.canonical_surface_kind, 'opl_domain_autonomy_task_projection');
  assert.equal(projection?.projection_kind, 'domain_autonomy');
  assert.equal(projection?.domain_truth_owner, 'example-domain-owner');
  assert.equal(projection?.work_unit_ref, 'domain://example/work-units/current');
  assert.equal(projection?.queue_owner, 'one-person-lab');
  assert.equal(projection?.authority_boundary.writes_domain_truth, false);
});

test('domain autonomy supervisor execute decision produces provider admission transition packet', () => {
  const currentIdentity = identity();
  const obligation: DomainAutonomyRecoveryObligation = {
    obligation_id: 'obligation:execute-current-owner-delta',
    desired_delta_ref: 'domain://example/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };
  const packet = buildDomainAutonomySupervisorDecisionReadback({
    ...decisionInput('execute_current_owner_delta'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  });
  const applied = applyDomainAutonomySupervisorDecision(obligation, packet);

  assert.equal(applied.applied, true);
  assert.equal(applied.transition.surface_kind, 'opl_domain_autonomy_supervisor_transition_packet');
  assert.equal(applied.transition.transition_kind, 'execute_current_owner_delta');
  assert.equal(applied.transition.transition_ref, 'domain://example/current-owner-delta/latest.json');
  assert.equal(applied.transition.provider_admission_identity_ref, 'opl://provider-admission/example');
  assert.equal(applied.transition.runtime_apply_target.kind, 'provider_attempt_or_owner_callable');
  assert.equal(applied.transition.runtime_apply_target.provider_admission_required, true);
  assert.equal(applied.transition.runtime_apply_target.owner_callable_required, true);
  assert.equal(applied.transition.runtime_apply_target.domain_truth_owner, 'example-domain-owner');
  assert.equal(applied.transition.state_index_projection.payload_refs_only, true);
  assert.equal(applied.transition.state_index_projection.indexed_refs.supervisor_decision_ref, packet.decision_id);
});

test('domain autonomy supervisor owner receipt stop produces refs-only owner receipt consumption transition packet', () => {
  const currentIdentity = identity();
  const obligation: DomainAutonomyRecoveryObligation = {
    obligation_id: 'obligation:owner-receipt-stop',
    desired_delta_ref: 'domain://example/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };
  const packet = buildDomainAutonomySupervisorDecisionReadback({
    ...decisionInput('stop_with_owner_receipt'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    provider_admission_identity_ref: undefined,
  });
  const applied = applyDomainAutonomySupervisorDecision(obligation, packet);

  assert.equal(packet.transition_ref, 'domain://example/owner-receipts/stopped.json');
  assert.equal(packet.owner_receipt_ref, 'domain://example/owner-receipts/stopped.json');
  assert.equal(packet.provider_admission_identity_ref, null);
  assert.equal(packet.authority_boundary.opl_can_create_domain_owner_receipt, false);
  assert.equal(packet.state_index_projection.indexed_refs.owner_receipt_ref, 'domain://example/owner-receipts/stopped.json');
  assert.equal(packet.state_index_projection.indexed_refs.owner_answer_ref, 'domain://example/owner-receipts/stopped.json');
  assert.equal(applied.applied, true);
  assert.equal(applied.obligation.status, 'stopped_with_owner_receipt');
  assert.equal(applied.transition.transition_kind, 'stop_with_owner_receipt');
  assert.equal(applied.transition.transition_ref, 'domain://example/owner-receipts/stopped.json');
  assert.equal(applied.transition.provider_admission_identity_ref, null);
  assert.equal(applied.transition.runtime_apply_target.kind, 'owner_receipt_consumption');
  assert.equal(applied.transition.runtime_apply_target.provider_admission_required, false);
  assert.equal(applied.transition.runtime_apply_target.owner_callable_required, false);
  assert.equal(applied.transition.runtime_apply_target.owner_receipt_consumption_required, true);
  assert.equal(applied.transition.runtime_apply_target.stable_typed_blocker_required, false);
  assert.equal(applied.transition.authority_boundary.opl_can_create_domain_owner_receipt, false);
});

test('domain autonomy supervisor readback fails closed when required transition refs are missing', () => {
  assert.throws(
    () => buildDomainAutonomySupervisorDecisionReadback({
      ...decisionInput('wait_for_owner_with_resume_token'),
      resume_token: undefined,
    }),
    /resume_token/,
  );
  assert.throws(
    () => buildDomainAutonomySupervisorDecisionReadback({
      ...decisionInput('consume_terminal_closeout'),
      terminal_closeout_ref: undefined,
    }),
    /terminal_closeout_ref/,
  );
  assert.throws(
    () => buildDomainAutonomySupervisorDecisionReadback({
      ...decisionInput('execute_current_owner_delta'),
      current_identity: {
        ...identity(),
        stage_packet_refs: [],
      },
    }),
    /stage_packet_refs/,
  );
  assert.throws(
    () => buildDomainAutonomySupervisorDecisionReadback({
      ...decisionInput('stop_with_owner_receipt'),
      owner_receipt_ref: undefined,
    }),
    /owner_receipt_ref/,
  );
});

test('domain autonomy supervisor readback maps obligation state without idle or terminal queue shortcuts', () => {
  const noProgressDecision = readDomainAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:no-progress',
    current_identity: identity(),
    current_owner_delta_ref: 'domain://example/current-owner-delta/latest.json',
    no_progress_or_inconsistency_ref: 'opl://runway/no-progress/example',
    action_queue: [],
    provider_admission_pending_count: 0,
    evidence_refs: [
      'opl://runway/action-queue-empty',
      'opl://runway/provider-admission-pending-count-zero',
    ],
  });

  assert.equal(noProgressDecision.decision_kind, 'materialize_recovery_action');
  assert.equal(noProgressDecision.transition_ref, 'opl://runway/no-progress/example');
  assert.equal(noProgressDecision.state_index_projection.indexed_refs.terminal_closeout_ref, null);
  assert.equal(noProgressDecision.authority_boundary.provider_completion_is_domain_ready, false);

  const stopDecision = readDomainAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:typed-blocker',
    current_identity: identity(),
    typed_blocker_ref: 'domain://example/typed-blockers/stable.json',
    budget_or_missing_evidence_ref: 'opl://runway/budget-exhausted',
  });
  assert.equal(stopDecision.decision_kind, 'stop_with_stable_typed_blocker');
  assert.equal(stopDecision.transition_ref, 'domain://example/typed-blockers/stable.json');

  const ownerReceiptDecision = readDomainAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:owner-receipt',
    current_identity: identity(),
    owner_receipt_ref: 'domain://example/owner-receipts/stopped.json',
    evidence_refs: ['domain://example/evidence/owner-receipt.json'],
  });
  assert.equal(ownerReceiptDecision.decision_kind, 'stop_with_owner_receipt');
  assert.equal(ownerReceiptDecision.transition_ref, 'domain://example/owner-receipts/stopped.json');
  assert.equal(ownerReceiptDecision.state_index_projection.indexed_refs.owner_receipt_ref, 'domain://example/owner-receipts/stopped.json');

  const waitDecision = readDomainAutonomySupervisorDecisionFromObligation({
    obligation_id: 'obligation:human-gate',
    current_identity: identity(),
    human_gate_ref: 'human-gate://example/domain-autonomy',
    resume_token: 'resume-token:example:domain-autonomy',
  });
  assert.equal(waitDecision.decision_kind, 'wait_for_owner_with_resume_token');
  assert.equal(waitDecision.transition_ref, 'resume-token:example:domain-autonomy');
  assert.equal(
    waitDecision.state_index_projection.indexed_refs.human_gate_ref,
    'human-gate://example/domain-autonomy',
  );

  assert.throws(
    () => readDomainAutonomySupervisorDecisionFromObligation({
      obligation_id: 'obligation:execute-missing-identity',
      current_identity: identity({ stage_run_id: '' }),
      current_owner_delta_ref: 'domain://example/current-owner-delta/latest.json',
      provider_admission_identity_ref: 'opl://provider-admission/example',
    }),
    /stage_run_id/,
  );

  assert.throws(
    () => readDomainAutonomySupervisorDecisionFromObligation({
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

test('domain autonomy durable decision ledger keeps exactly one current latest decision per identity', () => {
  const currentIdentity = identity();
  const obligation: DomainAutonomyRecoveryObligation = {
    obligation_id: 'obligation:durable-current-latest',
    desired_delta_ref: 'domain://example/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };
  let obligationEntries: DomainAutonomyRecoveryObligationStoreEntry[] = [];
  obligationEntries = appendDomainAutonomyRecoveryObligation(obligationEntries, {
    obligation,
    appended_at: '2026-06-15T00:00:00.000Z',
  }).entries;

  const firstDecision = buildDomainAutonomySupervisorDecisionReadback({
    ...decisionInput('execute_current_owner_delta'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  });
  const secondDecision = buildDomainAutonomySupervisorDecisionReadback({
    ...decisionInput('consume_terminal_closeout'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  });

  let decisionEntries: DomainAutonomySupervisorDecisionLedgerEntry[] = [];
  let recorded = recordDomainAutonomySupervisorDecision(decisionEntries, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    decision: firstDecision,
    appended_at: '2026-06-15T00:00:01.000Z',
  });
  assert.equal(recorded.accepted, true);
  decisionEntries = recorded.entries;

  recorded = recordDomainAutonomySupervisorDecision(decisionEntries, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    decision: secondDecision,
    appended_at: '2026-06-15T00:00:02.000Z',
  });
  assert.equal(recorded.accepted, true);
  decisionEntries = recorded.entries;

  const currentDecisions = listCurrentDomainAutonomySupervisorDecisions(decisionEntries, {
    obligation_id: obligation.obligation_id,
  });
  assert.equal(currentDecisions.length, 1);
  assert.equal(currentDecisions[0].decision_id, secondDecision.decision_id);
  assert.equal(currentDomainAutonomySupervisorDecision(decisionEntries, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  })?.decision_id, secondDecision.decision_id);

  const staleApply = applyDomainAutonomySupervisorDecisionFromLedger({
    obligation_entries: obligationEntries,
    decision_entries: decisionEntries,
    decision: firstDecision,
    applied_at: '2026-06-15T00:00:03.000Z',
  });
  assert.equal(staleApply.applied, false);
  assert.equal(staleApply.reason, 'stale_supervisor_decision');
  assert.equal(staleApply.entries.at(-1)?.entry_kind, 'obligation_apply_rejected');

  const latestApply = applyDomainAutonomySupervisorDecisionFromLedger({
    obligation_entries: staleApply.entries,
    decision_entries: decisionEntries,
    decision: secondDecision,
    applied_at: '2026-06-15T00:00:04.000Z',
  });
  assert.equal(latestApply.applied, true);
  assert.equal(latestApply.obligation.status, 'terminal_closeout_consumed');
  assert.equal(latestApply.obligation.supervisor_decision_ref, secondDecision.decision_id);
});

test('domain autonomy durable decision ledger rejects identity mismatches without changing current latest', () => {
  const currentIdentity = identity();
  const mismatchedDecision = buildDomainAutonomySupervisorDecisionReadback({
    ...decisionInput('materialize_recovery_action'),
    obligation_id: 'obligation:identity-mismatch',
    current_identity: identity({
      route_identity_key: 'route:example:stale',
      source_fingerprint: 'domain-source:example:stale',
    }),
  });

  const recorded = recordDomainAutonomySupervisorDecision([], {
    obligation_id: 'obligation:identity-mismatch',
    current_identity: currentIdentity,
    decision: mismatchedDecision,
    appended_at: '2026-06-15T00:01:00.000Z',
  });

  assert.equal(recorded.accepted, false);
  assert.equal(recorded.reason, 'identity_mismatch');
  assert.equal(recorded.entries.at(-1)?.entry_kind, 'supervisor_decision_rejected');
  assert.equal(currentDomainAutonomySupervisorDecision(recorded.entries, {
    obligation_id: 'obligation:identity-mismatch',
    current_identity: currentIdentity,
  }), null);
});

test('domain autonomy closeout inbox records pending closeouts as consumed or rejected by identity', () => {
  const currentIdentity = identity();
  let inboxEntries: DomainAutonomyCloseoutInboxEntry[] = [];
  inboxEntries = appendDomainAutonomyCloseoutInboxPending(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-consumed.json',
    obligation_id: 'obligation:closeout-consumed',
    current_identity: currentIdentity,
    terminal_closeout_ref: 'opl://stage-attempts/example/closeout-consumed.json',
    appended_at: '2026-06-15T00:02:00.000Z',
  }).entries;

  assert.equal(readDomainAutonomyCloseoutInboxEntry(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-consumed.json',
    current_identity: currentIdentity,
  })?.status, 'pending');

  const consumed = consumeDomainAutonomyCloseoutInboxEntry(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-consumed.json',
    current_identity: currentIdentity,
    supervisor_decision_ref: 'supervisor-decision:consume-closeout',
    consumed_at: '2026-06-15T00:02:01.000Z',
  });
  assert.equal(consumed.consumed, true);
  assert.equal(readDomainAutonomyCloseoutInboxEntry(consumed.entries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-consumed.json',
    current_identity: currentIdentity,
  })?.status, 'consumed');

  inboxEntries = appendDomainAutonomyCloseoutInboxPending(consumed.entries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-rejected.json',
    obligation_id: 'obligation:closeout-rejected',
    current_identity: currentIdentity,
    terminal_closeout_ref: 'opl://stage-attempts/example/closeout-rejected.json',
    appended_at: '2026-06-15T00:03:00.000Z',
  }).entries;

  const rejected = rejectDomainAutonomyCloseoutInboxEntry(inboxEntries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-rejected.json',
    current_identity: currentIdentity,
    reason: 'domain_closeout_identity_mismatch',
    rejected_at: '2026-06-15T00:03:01.000Z',
  });
  assert.equal(rejected.rejected, true);
  assert.equal(readDomainAutonomyCloseoutInboxEntry(rejected.entries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-rejected.json',
    current_identity: currentIdentity,
  })?.status, 'rejected');
});

test('domain autonomy physical JSONL ledgers replay obligation, decision, and closeout inbox state', () => {
  const currentIdentity = identity();
  const root = mkdtempSync(join(tmpdir(), 'opl-domain-autonomy-jsonl-'));
  const obligationLedgerPath = join(root, 'obligations.jsonl');
  const decisionLedgerPath = join(root, 'decisions.jsonl');
  const closeoutInboxPath = join(root, 'closeout-inbox.jsonl');
  const obligation: DomainAutonomyRecoveryObligation = {
    obligation_id: 'obligation:physical-jsonl',
    desired_delta_ref: 'domain://example/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open',
    last_evidence_refs: [],
  };

  const appendedObligation = appendDomainAutonomyRecoveryObligation([], {
    obligation,
    appended_at: '2026-06-15T00:04:00.000Z',
  });
  appendDomainAutonomyRecoveryObligationStoreJsonl(
    obligationLedgerPath,
    appendedObligation.entry,
  );

  const decision = buildDomainAutonomySupervisorDecisionReadback({
    ...decisionInput('stop_with_owner_receipt'),
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    provider_admission_identity_ref: undefined,
  });
  const recordedDecision = recordDomainAutonomySupervisorDecision([], {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    decision,
    appended_at: '2026-06-15T00:04:01.000Z',
  });
  assert.equal(recordedDecision.accepted, true);
  appendDomainAutonomySupervisorDecisionLedgerJsonl(
    decisionLedgerPath,
    recordedDecision.entry,
  );

  let closeoutEntries: DomainAutonomyCloseoutInboxEntry[] = [];
  closeoutEntries = appendDomainAutonomyCloseoutInboxPending(closeoutEntries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-physical.json',
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
    terminal_closeout_ref: 'opl://stage-attempts/example/closeout-physical.json',
    appended_at: '2026-06-15T00:04:02.000Z',
  }).entries;
  appendDomainAutonomyCloseoutInboxJsonl(closeoutInboxPath, closeoutEntries.at(-1)!);
  const consumed = consumeDomainAutonomyCloseoutInboxEntry(closeoutEntries, {
    closeout_ref: 'opl://stage-attempts/example/closeout-physical.json',
    current_identity: currentIdentity,
    supervisor_decision_ref: decision.decision_id,
    consumed_at: '2026-06-15T00:04:03.000Z',
  });
  assert.equal(consumed.consumed, true);
  appendDomainAutonomyCloseoutInboxJsonl(closeoutInboxPath, consumed.entry);

  const replayedObligations = readDomainAutonomyRecoveryObligationStoreJsonl(obligationLedgerPath);
  const replayedDecisions = readDomainAutonomySupervisorDecisionLedgerJsonl(decisionLedgerPath);
  const replayedCloseouts = readDomainAutonomyCloseoutInboxJsonl(closeoutInboxPath);

  assert.equal(replayedObligations.length, 1);
  assert.equal(replayedObligations[0].projection.append_only_jsonl_compatible, true);
  assert.equal(currentDomainAutonomySupervisorDecision(replayedDecisions, {
    obligation_id: obligation.obligation_id,
    current_identity: currentIdentity,
  })?.decision_id, decision.decision_id);
  assert.equal(readDomainAutonomyCloseoutInboxEntry(replayedCloseouts, {
    closeout_ref: 'opl://stage-attempts/example/closeout-physical.json',
    current_identity: currentIdentity,
  })?.status, 'consumed');

  assert.throws(
    () => appendDomainAutonomyCloseoutInboxJsonl(
      closeoutInboxPath,
      replayedObligations[0] as unknown as DomainAutonomyCloseoutInboxEntry,
    ),
    /Unexpected domain autonomy JSONL append surface/,
  );
  assert.throws(
    () => readDomainAutonomySupervisorDecisionLedgerJsonl(closeoutInboxPath),
    /Unexpected domain autonomy JSONL surface/,
  );
});
