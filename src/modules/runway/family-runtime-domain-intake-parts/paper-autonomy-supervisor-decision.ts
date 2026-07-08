import path from 'node:path';

import { record, recordList, stringValue as optionalString } from '../../../kernel/json-record.ts';
import type { StageAttemptProjectionInput } from '../family-runtime-command.ts';
import type { familyRuntimePaths } from '../family-runtime-store.ts';
import {
  appendPaperAutonomyRecoveryObligation,
  appendPaperAutonomyRecoveryObligationStoreJsonl,
  appendPaperAutonomySupervisorDecisionLedgerJsonl,
  currentPaperAutonomyRecoveryObligation,
  currentPaperAutonomySupervisorDecision,
  readPaperAutonomyRecoveryObligationStoreJsonl,
  readPaperAutonomySupervisorDecisionFromObligation,
  readPaperAutonomySupervisorDecisionLedgerJsonl,
  recordPaperAutonomySupervisorDecision,
  type PaperAutonomyRecoveryObligation,
  type PaperAutonomyStageRunIdentity,
} from '../family-runtime-paper-autonomy.ts';

type PaperAutonomySupervisorDecisionConsumeResult = {
  status: 'consumed' | 'idempotent_noop';
  task_kind: 'paper_autonomy/supervisor-decision';
  dedupe_key: string | null;
  obligation_id: string;
  obligation_appended: boolean;
  decision_appended: boolean;
  decision_readback: Record<string, unknown>;
  obligation_ledger_entry: Record<string, unknown> | null;
  decision_ledger_entry: Record<string, unknown> | null;
  ledger_paths: {
    obligation_ledger_path: string;
    decision_ledger_path: string;
  };
  authority_boundary: {
    request_consumed_by: 'one-person-lab';
    domain_truth_owner: 'med-autoscience';
    opl_can_write_mas_truth: false;
    opl_can_create_domain_owner_receipt: false;
    opl_can_create_domain_typed_blocker: false;
    request_is_provider_admission: false;
  };
};

type PaperAutonomySupervisorDecisionBlocked = {
  reason: string;
  task: unknown;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function ledgerPaths(paths: ReturnType<typeof familyRuntimePaths>) {
  const root = path.join(paths.root, 'paper-autonomy', 'supervisor');
  return {
    obligation_ledger_path: path.join(root, 'recovery-obligations.jsonl'),
    decision_ledger_path: path.join(root, 'supervisor-decisions.jsonl'),
  };
}

function stageRunIdentityFrom(value: unknown): PaperAutonomyStageRunIdentity | null {
  const identityValue = recordList([value])[0];
  if (!identityValue) {
    return null;
  }
  const identity = {
    stage_run_id: optionalString(identityValue.stage_run_id),
    route_identity_key: optionalString(identityValue.route_identity_key),
    attempt_idempotency_key: optionalString(identityValue.attempt_idempotency_key),
    selected_dispatch_ref: optionalString(identityValue.selected_dispatch_ref),
    stage_packet_ref: optionalString(identityValue.stage_packet_ref),
    stage_packet_refs: stringList(identityValue.stage_packet_refs),
    provider_attempt_ref: optionalString(identityValue.provider_attempt_ref),
    attempt_lease_ref: optionalString(identityValue.attempt_lease_ref),
    workflow_ref: optionalString(identityValue.workflow_ref),
    source_fingerprint: optionalString(identityValue.source_fingerprint),
    truth_epoch: optionalString(identityValue.truth_epoch),
    runtime_health_epoch: optionalString(identityValue.runtime_health_epoch),
    work_unit_fingerprint: optionalString(identityValue.work_unit_fingerprint),
  };
  if (
    !identity.stage_run_id
    || !identity.route_identity_key
    || !identity.attempt_idempotency_key
    || !identity.selected_dispatch_ref
    || !identity.stage_packet_ref
    || identity.stage_packet_refs.length === 0
    || !identity.provider_attempt_ref
    || !identity.attempt_lease_ref
    || !identity.workflow_ref
    || !identity.source_fingerprint
    || !identity.truth_epoch
    || !identity.runtime_health_epoch
    || !identity.work_unit_fingerprint
  ) {
    return null;
  }
  return identity as PaperAutonomyStageRunIdentity;
}

function validAuthorityBoundary(value: unknown) {
  const boundary = recordList([value])[0];
  if (!boundary) {
    return false;
  }
  return boundary.request_owner === 'med-autoscience'
    && boundary.decision_engine_owner === 'one-person-lab'
    && boundary.recovery_obligation_store_owner === 'one-person-lab'
    && boundary.decision_authority === false
    && boundary.mas_can_run_supervisor_decision_engine === false
    && boundary.mas_can_store_recovery_obligation === false
    && boundary.opl_can_write_mas_truth === false
    && boundary.opl_can_create_domain_owner_receipt === false
    && boundary.opl_can_create_domain_typed_blocker === false;
}

function requestFrom(input: StageAttemptProjectionInput) {
  if (input.domainId !== 'medautoscience' || input.taskKind !== 'paper_autonomy/supervisor-decision') {
    return null;
  }
  const request = recordList([input.payload.paper_autonomy_supervisor_decision_request])[0] ?? null;
  if (!request || request.surface_kind !== 'mas_opl_paper_autonomy_supervisor_decision_request') {
    return null;
  }
  return request;
}

function recoveryObligation(input: {
  obligation_id: string;
  current_identity: PaperAutonomyStageRunIdentity;
  request: Record<string, unknown>;
  evidence_refs: string[];
  budget_or_missing_evidence_ref: string | null;
}): PaperAutonomyRecoveryObligation {
  return {
    obligation_id: input.obligation_id,
    desired_delta_ref: optionalString(input.request.requested_decision_readback_shape)
      ?? `opl://paper-autonomy/supervisor-decision/${input.obligation_id}`,
    current_identity: input.current_identity,
    status: 'open',
    last_evidence_refs: input.evidence_refs,
    ...(input.budget_or_missing_evidence_ref
      ? { no_progress_budget_state: input.budget_or_missing_evidence_ref }
      : {}),
  };
}

function consumeSupervisorDecisionRequest(input: {
  taskInput: StageAttemptProjectionInput;
  paths: ReturnType<typeof familyRuntimePaths>;
  recordedAt: string;
}): PaperAutonomySupervisorDecisionConsumeResult | PaperAutonomySupervisorDecisionBlocked | null {
  const request = requestFrom(input.taskInput);
  if (!request) {
    return null;
  }
  if (!validAuthorityBoundary(request.authority_boundary)) {
    return {
      reason: 'invalid_paper_autonomy_supervisor_decision_authority_boundary',
      task: input.taskInput,
    };
  }
  const obligationId = optionalString(request.obligation_id);
  const currentIdentity = stageRunIdentityFrom(request.current_identity);
  const recommendedEvidence = record(request.recommended_decision_evidence);
  const typedBlockerRef = optionalString(recommendedEvidence.typed_blocker_ref);
  const ownerReceiptRef = optionalString(recommendedEvidence.owner_receipt_ref);
  const humanGateRef = optionalString(recommendedEvidence.human_gate_ref);
  const resumeToken = optionalString(recommendedEvidence.resume_token);
  const currentOwnerDeltaRef = optionalString(recommendedEvidence.current_owner_delta_ref);
  const providerAdmissionIdentityRef = optionalString(recommendedEvidence.provider_admission_identity_ref);
  const terminalCloseoutRef = optionalString(recommendedEvidence.terminal_closeout_ref);
  const recoveryActionRef = optionalString(recommendedEvidence.recovery_action_ref);
  const noProgressOrInconsistencyRef = optionalString(recommendedEvidence.no_progress_or_inconsistency_ref);
  const budgetOrMissingEvidenceRef = optionalString(recommendedEvidence.budget_or_missing_evidence_ref);
  if (!obligationId || !currentIdentity) {
    return {
      reason: 'invalid_paper_autonomy_supervisor_decision_identity',
      task: input.taskInput,
    };
  }

  const ledgers = ledgerPaths(input.paths);
  const obligationEntries = readPaperAutonomyRecoveryObligationStoreJsonl(ledgers.obligation_ledger_path);
  const decisionEntries = readPaperAutonomySupervisorDecisionLedgerJsonl(ledgers.decision_ledger_path);
  const evidenceRefs = stringList(recommendedEvidence.evidence_refs);
  const observabilityRefs = stringList(recommendedEvidence.observability_refs);
  const existingObligation = currentPaperAutonomyRecoveryObligation(obligationEntries, {
    obligation_id: obligationId,
    current_identity: currentIdentity,
  });
  const obligationAppend = existingObligation
    ? null
    : appendPaperAutonomyRecoveryObligation(obligationEntries, {
      obligation: recoveryObligation({
        obligation_id: obligationId,
        current_identity: currentIdentity,
        request,
        evidence_refs: evidenceRefs,
        budget_or_missing_evidence_ref: budgetOrMissingEvidenceRef,
      }),
      appended_at: input.recordedAt,
    });
  if (obligationAppend) {
    appendPaperAutonomyRecoveryObligationStoreJsonl(
      ledgers.obligation_ledger_path,
      obligationAppend.entry,
    );
  }

  const decision = readPaperAutonomySupervisorDecisionFromObligation({
    obligation_id: obligationId,
    current_identity: currentIdentity,
    ...(currentOwnerDeltaRef ? { current_owner_delta_ref: currentOwnerDeltaRef } : {}),
    ...(providerAdmissionIdentityRef ? { provider_admission_identity_ref: providerAdmissionIdentityRef } : {}),
    ...(terminalCloseoutRef ? { terminal_closeout_ref: terminalCloseoutRef } : {}),
    ...(recoveryActionRef ? { recovery_action_ref: recoveryActionRef } : {}),
    ...(noProgressOrInconsistencyRef ? { no_progress_or_inconsistency_ref: noProgressOrInconsistencyRef } : {}),
    ...(humanGateRef ? { human_gate_ref: humanGateRef } : {}),
    ...(resumeToken ? { resume_token: resumeToken } : {}),
    ...(typedBlockerRef ? { typed_blocker_ref: typedBlockerRef } : {}),
    ...(ownerReceiptRef ? { owner_receipt_ref: ownerReceiptRef } : {}),
    ...(budgetOrMissingEvidenceRef ? { budget_or_missing_evidence_ref: budgetOrMissingEvidenceRef } : {}),
    evidence_refs: evidenceRefs,
    observability_refs: observabilityRefs,
  });
  const existingDecision = currentPaperAutonomySupervisorDecision(decisionEntries, {
    obligation_id: obligationId,
    current_identity: currentIdentity,
  });
  const decisionAppend = existingDecision?.decision_id === decision.decision_id
    ? null
    : recordPaperAutonomySupervisorDecision(decisionEntries, {
      obligation_id: obligationId,
      current_identity: currentIdentity,
      decision,
      appended_at: input.recordedAt,
    });
  if (decisionAppend) {
    appendPaperAutonomySupervisorDecisionLedgerJsonl(
      ledgers.decision_ledger_path,
      decisionAppend.entry,
    );
  }

  return {
    status: obligationAppend || decisionAppend ? 'consumed' : 'idempotent_noop',
    task_kind: 'paper_autonomy/supervisor-decision',
    dedupe_key: input.taskInput.dedupeKey ?? null,
    obligation_id: obligationId,
    obligation_appended: Boolean(obligationAppend),
    decision_appended: Boolean(decisionAppend?.accepted),
    decision_readback: decision as unknown as Record<string, unknown>,
    obligation_ledger_entry: obligationAppend?.entry as unknown as Record<string, unknown> ?? null,
    decision_ledger_entry: decisionAppend?.entry as unknown as Record<string, unknown> ?? null,
    ledger_paths: ledgers,
    authority_boundary: {
      request_consumed_by: 'one-person-lab',
      domain_truth_owner: 'med-autoscience',
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      request_is_provider_admission: false,
    },
  };
}

export function consumePaperAutonomySupervisorDecisionRequests(input: {
  inputs: StageAttemptProjectionInput[];
  paths: ReturnType<typeof familyRuntimePaths>;
  recordedAt?: string;
}) {
  const remainingInputs: StageAttemptProjectionInput[] = [];
  const consumed: PaperAutonomySupervisorDecisionConsumeResult[] = [];
  const blocked: PaperAutonomySupervisorDecisionBlocked[] = [];
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  for (const taskInput of input.inputs) {
    const result = consumeSupervisorDecisionRequest({
      taskInput,
      paths: input.paths,
      recordedAt,
    });
    if (result === null) {
      remainingInputs.push(taskInput);
    } else if ('decision_readback' in result) {
      consumed.push(result);
    } else {
      blocked.push(result);
    }
  }
  return {
    inputs: remainingInputs,
    consumed,
    blocked,
  };
}
