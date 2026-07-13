import type { listEvents } from './family-runtime-store.ts';
import { stringValue as optionalString } from '../../kernel/json-record.ts';
import { isRecord } from '../atlas/index.ts';
import { OBSERVABILITY_RUNTIME_LEDGER_LABEL } from '../../kernel/observability-projection-vocabulary.ts';
import {
  buildProviderLongSoakEvidenceProjection,
} from '../ledger/index.ts';

const DEFAULT_PROVIDER_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_PROVIDER_PROOF_WINDOW_SECONDS = 7 * 24 * 60 * 60;
const PRODUCTION_PROOF_COMMAND = 'opl family-runtime residency proof --provider temporal --production';

type ProviderRuntimeEvent = ReturnType<typeof listEvents>[number];

export function providerProofStatusIsCurrentlyProven(status: string | null | undefined) {
  return status === 'all_observed_proofs_proven' || status === 'latest_proof_proven';
}

function providerProofMaxAgeSeconds() {
  const raw = process.env.OPL_PROVIDER_PROOF_MAX_AGE_SECONDS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PROVIDER_PROOF_MAX_AGE_SECONDS;
}

function providerProofWindowSeconds() {
  const raw = process.env.OPL_PROVIDER_PROOF_WINDOW_SECONDS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PROVIDER_PROOF_WINDOW_SECONDS;
}

function eventAgeSeconds(createdAt: string | null) {
  if (!createdAt) {
    return null;
  }
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - createdTime) / 1000));
}

function eventTimeMs(event: ProviderRuntimeEvent | undefined) {
  if (!event?.created_at) {
    return null;
  }
  const time = Date.parse(event.created_at);
  return Number.isFinite(time) ? time : null;
}

function nextProofDueAt(createdAt: string | null, maxAgeSeconds: number) {
  if (!createdAt) {
    return null;
  }
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) {
    return null;
  }
  return new Date(createdTime + maxAgeSeconds * 1000).toISOString();
}

function proofFreshnessStatus(input: {
  proofEventCount: number;
  latestEventAgeSeconds: number | null;
  maxAgeSeconds: number;
}) {
  if (input.proofEventCount === 0) {
    return 'not_observed';
  }
  if (input.latestEventAgeSeconds === null) {
    return 'unknown';
  }
  return input.latestEventAgeSeconds <= input.maxAgeSeconds ? 'fresh' : 'stale';
}

function proofSloStatus(input: {
  continuousProofStatus: string;
  proofFreshnessStatus: string;
}) {
  if (input.continuousProofStatus === 'no_proof_observed') {
    return 'no_proof_observed';
  }
  if (!providerProofStatusIsCurrentlyProven(input.continuousProofStatus)) {
    return 'proof_blocker_observed';
  }
  if (input.proofFreshnessStatus === 'stale') {
    return 'proof_stale';
  }
  if (input.proofFreshnessStatus === 'unknown') {
    return 'proof_freshness_unknown';
  }
  return 'proof_fresh';
}

function proofRepairState(input: {
  continuousProofStatus: string;
  proofFreshnessStatus: string;
}) {
  if (input.continuousProofStatus === 'no_proof_observed') {
    return 'needs_initial_production_proof';
  }
  if (!providerProofStatusIsCurrentlyProven(input.continuousProofStatus)) {
    return 'needs_provider_repair_then_proof_rerun';
  }
  if (input.proofFreshnessStatus === 'stale') {
    return 'needs_operator_cadence_refresh';
  }
  if (input.proofFreshnessStatus === 'unknown') {
    return 'needs_timestamp_repair_then_proof_rerun';
  }
  return 'cadence_current';
}

function receiptSummary(input: {
  latestPayload: Record<string, unknown> | null;
  latestProofReceipt: Record<string, unknown> | null;
}) {
  if (!input.latestPayload && !input.latestProofReceipt) {
    return null;
  }
  return {
    proof_mode: optionalString(input.latestPayload?.proof_mode),
    closeout_status: optionalString(input.latestPayload?.closeout_status),
    receipt_kind: optionalString(input.latestProofReceipt?.receipt_kind),
    receipt_status: optionalString(input.latestProofReceipt?.receipt_status),
    provider_kind: optionalString(input.latestProofReceipt?.provider_kind),
  };
}

function executionReceiptSummary(input: {
  latestExecutionPayload: Record<string, unknown> | null;
}) {
  if (!input.latestExecutionPayload) {
    return null;
  }
  return {
    command: optionalString(input.latestExecutionPayload.command),
    execution_owner: optionalString(input.latestExecutionPayload.execution_owner),
    execution_policy: optionalString(input.latestExecutionPayload.execution_policy),
    closeout_status: optionalString(input.latestExecutionPayload.closeout_status),
    receipt_kind: optionalString(input.latestExecutionPayload.receipt_kind),
    receipt_status: optionalString(input.latestExecutionPayload.receipt_status),
    persisted_proof_ref: optionalString(input.latestExecutionPayload.persisted_proof_ref),
  };
}

function repairReceiptSummary(input: {
  latestExecutionPayload: Record<string, unknown> | null;
}) {
  const repairReceipt = isRecord(input.latestExecutionPayload?.repair_receipt)
    ? input.latestExecutionPayload.repair_receipt
    : null;
  if (!repairReceipt) {
    return null;
  }
  return {
    trigger: optionalString(repairReceipt.trigger),
    repair_status: optionalString(repairReceipt.repair_status),
    cadence_owner: optionalString(repairReceipt.cadence_owner),
    next_repair_command: optionalString(repairReceipt.next_repair_command),
    can_execute_domain_repair: repairReceipt.can_execute_domain_repair === true,
  };
}

function providerCapabilitySlo(input: {
  executionEvents: ProviderRuntimeEvent[];
}) {
  let latestCapabilityEvent: ProviderRuntimeEvent | undefined;
  for (let index = input.executionEvents.length - 1; index >= 0; index -= 1) {
    const event = input.executionEvents[index];
    if (isRecord(eventPayload(event)?.production_capability_receipt)) {
      latestCapabilityEvent = event;
      break;
    }
  }
  const latestCapabilityPayload = eventPayload(latestCapabilityEvent);
  const receipt = isRecord(latestCapabilityPayload?.production_capability_receipt)
    ? latestCapabilityPayload.production_capability_receipt
    : null;
  const checks = isRecord(receipt?.checks) ? receipt.checks : {};
  const checkReady = (checkId: string) => checks[checkId] === true;
  const failedCheckIds = Array.isArray(receipt?.failed_check_ids)
    ? receipt.failed_check_ids.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const receiptStatus = optionalString(receipt?.receipt_status);
  const capabilityStatus = optionalString(receipt?.capability_status);
  const satisfied = receiptStatus === 'proven' && capabilityStatus === 'capability_proven';
  return {
    surface_kind: 'opl_temporal_provider_capability_slo_projection',
    provider_kind: 'temporal',
    status: satisfied ? 'capability_slo_satisfied' : receipt ? 'capability_slo_blocked' : 'capability_slo_not_observed',
    latest_receipt_status: receiptStatus,
    latest_capability_status: capabilityStatus,
    latest_capability_event_id: latestCapabilityEvent?.event_id ?? null,
    latest_capability_event_created_at: latestCapabilityEvent?.created_at ?? null,
    latest_capability_event_age_seconds: eventAgeSeconds(latestCapabilityEvent?.created_at ?? null),
    required_check_count: typeof receipt?.required_check_count === 'number'
      ? receipt.required_check_count
      : 0,
    proven_check_count: typeof receipt?.proven_check_count === 'number'
      ? receipt.proven_check_count
      : 0,
    failed_check_ids: failedCheckIds,
    restart_requery_ready: checkReady('worker_restart_requery'),
    signal_history_ready: checkReady('signal_history_preserved'),
    typed_closeout_required_ready: checkReady('typed_closeout_required_for_completed'),
    missing_closeout_diagnostic_ready: checkReady('missing_closeout_advances_with_diagnostic'),
    no_output_diagnostic_boundary_ready: checkReady('no_output_diagnostic_boundary_observed'),
    worker_completed_attempt_ready: checkReady('worker_completed_attempt'),
    service_worker_ready:
      checkReady('external_temporal_server_reachable') && checkReady('managed_worker_ready'),
    domain_truth_boundary_preserved: checkReady('domain_truth_boundary_preserved'),
    completed_workflow_id: optionalString(receipt?.completed_workflow_id),
    diagnostic_workflow_id: optionalString(receipt?.diagnostic_workflow_id),
    restarted_worker_requery_status: optionalString(receipt?.restarted_worker_requery_status),
    evidence_policy:
      'projection_reads_latest_provider_slo_execution_receipt_capability_checks',
    authority_boundary: {
      opl: 'temporal_provider_capability_slo_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}

function countReceiptField(events: ProviderRuntimeEvent[], fieldName: string, expected: string) {
  return events.filter((event) => {
    const payload = eventPayload(event);
    return optionalString(payload?.[fieldName]) === expected;
  }).length;
}

function eventPayload(event: ProviderRuntimeEvent | undefined) {
  return isRecord(event?.payload) ? event.payload : null;
}

function proofReceiptStatus(event: ProviderRuntimeEvent) {
  const payload = eventPayload(event);
  const receipt = isRecord(payload?.proof_receipt) ? payload.proof_receipt : null;
  return optionalString(receipt?.receipt_status);
}

function proofCloseoutStatus(event: ProviderRuntimeEvent) {
  return optionalString(eventPayload(event)?.closeout_status);
}

function executionStatus(event: ProviderRuntimeEvent) {
  return optionalString(eventPayload(event)?.execution_status);
}

function executionReceiptStatus(event: ProviderRuntimeEvent) {
  return optionalString(eventPayload(event)?.receipt_status);
}

function repairStatus(event: ProviderRuntimeEvent) {
  const repairReceipt = isRecord(eventPayload(event)?.repair_receipt)
    ? eventPayload(event)?.repair_receipt as Record<string, unknown>
    : null;
  return optionalString(repairReceipt?.repair_status);
}

function firstCreatedAt(events: ProviderRuntimeEvent[]) {
  return events[0]?.created_at ?? null;
}

function latestCreatedAt(events: ProviderRuntimeEvent[]) {
  return events.at(-1)?.created_at ?? null;
}

function providerCadenceWindow(input: {
  proofEvents: ProviderRuntimeEvent[];
  executionEvents: ProviderRuntimeEvent[];
  maxAgeSeconds: number;
}) {
  const windowSeconds = providerProofWindowSeconds();
  const nowMs = Date.now();
  const windowStartMs = nowMs - windowSeconds * 1000;
  const inWindow = (event: ProviderRuntimeEvent) => {
    const time = eventTimeMs(event);
    return time !== null && time >= windowStartMs && time <= nowMs;
  };
  const proofEvents = input.proofEvents.filter(inWindow);
  const executionEvents = input.executionEvents.filter(inWindow);
  const allWindowEvents = [...proofEvents, ...executionEvents].sort((a, b) =>
    (eventTimeMs(a) ?? 0) - (eventTimeMs(b) ?? 0)
  );
  const expectedExecutionCount = Math.max(1, Math.ceil(windowSeconds / input.maxAgeSeconds));
  const executedCount = executionEvents.filter((event) => executionStatus(event) === 'executed').length;
  const skippedCount = executionEvents.filter((event) => executionStatus(event) === 'skipped').length;
  const blockedExecutionCount = executionEvents.filter((event) => executionReceiptStatus(event) === 'blocked').length;
  const provenExecutionCount = executionEvents.filter((event) => executionReceiptStatus(event) === 'proven').length;
  const blockedRepairCount = executionEvents.filter((event) => repairStatus(event) === 'blocked').length;
  const provenProofCount = proofEvents.filter((event) =>
    proofCloseoutStatus(event) === 'production_residency_proven'
    && proofReceiptStatus(event) === 'proven'
  ).length;
  const blockedProofCount = proofEvents.filter((event) =>
    proofCloseoutStatus(event) !== 'production_residency_proven'
    || proofReceiptStatus(event) !== 'proven'
  ).length;
  const missingExecutionCount = Math.max(0, expectedExecutionCount - executionEvents.length);
  const latestProof = proofEvents.at(-1);
  const latestExecution = executionEvents.at(-1);
  const latestProofProven = latestProof
    ? proofCloseoutStatus(latestProof) === 'production_residency_proven'
      && proofReceiptStatus(latestProof) === 'proven'
    : false;
  const latestExecutionBlocked = latestExecution
    ? executionReceiptStatus(latestExecution) === 'blocked' || repairStatus(latestExecution) === 'blocked'
    : false;
  const cadenceCovered = missingExecutionCount === 0 && provenProofCount > 0;
  const unrepairedCurrentBlocker = !latestProofProven || latestExecutionBlocked;
  const windowStatus =
    proofEvents.length === 0 && executionEvents.length === 0
      ? 'no_window_evidence'
      : unrepairedCurrentBlocker
        ? 'window_repair_receipt_observed'
        : missingExecutionCount > 0
          ? 'window_evidence_incomplete'
          : cadenceCovered
          ? 'window_cadence_satisfied'
          : blockedProofCount > 0 || blockedExecutionCount > 0 || blockedRepairCount > 0
            ? 'window_repair_receipt_observed'
            : 'window_evidence_observed';
  const requiredNextAction = windowStatus === 'window_cadence_satisfied'
    ? 'Keep supervised Temporal provider SLO ticks running for the full operator evidence window.'
    : windowStatus === 'window_repair_receipt_observed'
      ? `Repair Temporal provider blockers, rerun provider SLO tick, and keep the repair receipt in the ${OBSERVABILITY_RUNTIME_LEDGER_LABEL}.`
      : `Run opl family-runtime provider-slo tick --provider temporal on cadence until the ${windowSeconds}s window has enough execution receipts.`;
  return {
    surface_kind: 'opl_temporal_provider_cadence_window_projection',
    provider_kind: 'temporal',
    window_seconds: windowSeconds,
    window_started_at: new Date(windowStartMs).toISOString(),
    window_ended_at: new Date(nowMs).toISOString(),
    first_observed_event_created_at: firstCreatedAt(allWindowEvents),
    latest_observed_event_created_at: latestCreatedAt(allWindowEvents),
    expected_slo_execution_receipt_count: expectedExecutionCount,
    observed_slo_execution_receipt_count: executionEvents.length,
    missing_slo_execution_receipt_count: missingExecutionCount,
    proof_event_count: proofEvents.length,
    proven_proof_event_count: provenProofCount,
    blocked_proof_event_count: blockedProofCount,
    executed_slo_execution_receipt_count: executedCount,
    skipped_slo_execution_receipt_count: skippedCount,
    proven_slo_execution_receipt_count: provenExecutionCount,
    blocked_slo_execution_receipt_count: blockedExecutionCount,
    blocked_repair_receipt_count: blockedRepairCount,
    window_status: windowStatus,
    long_window_evidence_ready: windowStatus === 'window_cadence_satisfied',
    required_next_action: requiredNextAction,
    evidence_policy:
      'continuous_window_requires_slo_execution_receipts_not_just_latest_provider_proof',
    authority_boundary: {
      opl: 'provider_slo_window_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}

function continuousProofStatus(input: {
  proofEventCount: number;
  provenCount: number;
  latestCloseoutStatus: string | null;
  latestProofReceiptStatus: string | null;
}) {
  if (input.proofEventCount === 0) {
    return 'no_proof_observed';
  }
  if (
    input.latestCloseoutStatus === 'production_residency_proven'
    && input.latestProofReceiptStatus === 'proven'
  ) {
    return input.provenCount === input.proofEventCount
      ? 'all_observed_proofs_proven'
      : 'latest_proof_proven';
  }
  return input.provenCount === input.proofEventCount
    ? 'all_observed_proofs_proven'
    : 'proof_blocker_observed';
}

function providerProofState(events: ReturnType<typeof listEvents>) {
  const proofEvents = events.filter((event) => event.event_type === 'temporal_residency_proof');
  const executionEvents = events.filter((event) => event.event_type === 'temporal_provider_slo_execution_receipt');
  const latest = proofEvents.at(-1);
  const latestExecution = executionEvents.at(-1);
  const latestPayload = eventPayload(latest);
  const latestExecutionPayload = eventPayload(latestExecution);
  const provenCount = proofEvents.filter((event) =>
    isRecord(event.payload) && event.payload.closeout_status === 'production_residency_proven'
  ).length;
  const latestProofReceipt = isRecord(latestPayload?.proof_receipt) ? latestPayload.proof_receipt : null;

  return {
    proofEvents,
    executionEvents,
    latest,
    latestExecution,
    latestPayload,
    latestExecutionPayload,
    latestProofReceipt,
    provenCount,
  };
}

function requiredNextAction(input: {
  proofEventCount: number;
  freshnessStatus: string;
  continuousProofStatus: string;
}) {
  if (input.proofEventCount === 0) {
    return `Run ${PRODUCTION_PROOF_COMMAND} and keep the receipt in the ${OBSERVABILITY_RUNTIME_LEDGER_LABEL}.`;
  }
  if (input.freshnessStatus === 'stale') {
    return 'Rerun production proof; the latest proven Temporal provider receipt is older than the configured operator cadence.';
  }
  if (input.freshnessStatus === 'unknown') {
    return 'Rerun production proof; the latest Temporal provider receipt has no parseable timestamp.';
  }
  if (providerProofStatusIsCurrentlyProven(input.continuousProofStatus)) {
    return 'Keep rerunning production proof on the operator cadence while domain owner chains mature.';
  }
  return 'Repair Temporal service/worker readiness, rerun production proof, and keep failed receipts visible.';
}

function operatorCadence(input: {
  maxAgeSeconds: number;
  latestAgeSeconds: number | null;
  latestCreatedAt: string | null;
}) {
  const freshnessMarginSeconds = input.latestAgeSeconds === null
    ? null
    : input.maxAgeSeconds - input.latestAgeSeconds;
  return {
    max_proof_age_seconds: input.maxAgeSeconds,
    latest_event_age_seconds: input.latestAgeSeconds,
    freshness_margin_seconds: freshnessMarginSeconds,
    overdue_by_seconds: freshnessMarginSeconds !== null && freshnessMarginSeconds < 0
      ? Math.abs(freshnessMarginSeconds)
      : 0,
    next_proof_due_at: nextProofDueAt(input.latestCreatedAt, input.maxAgeSeconds),
    cadence_policy: 'latest_temporal_production_proof_must_stay_within_max_age',
  };
}

function operatorCommands(repairState: string) {
  return [
    {
      command_id: 'temporal-production-residency-proof',
      command: PRODUCTION_PROOF_COMMAND,
      command_role: repairState === 'cadence_current' ? 'cadence_refresh' : 'repair_or_initial_proof',
      execution_owner: 'operator_or_infrastructure',
      execution_policy: 'manual_or_supervised_no_auto_execution',
    },
  ];
}

function operatorCadenceAction(input: {
  repairState: string;
  cadence: ReturnType<typeof operatorCadence>;
}) {
  const commandRole = input.repairState === 'cadence_current'
    ? 'cadence_refresh'
    : 'repair_or_initial_proof';
  return {
    action_id: 'temporal-provider-production-proof-cadence',
    action_kind: 'provider_slo_cadence_execution',
    provider_kind: 'temporal',
    command: PRODUCTION_PROOF_COMMAND,
    command_role: commandRole,
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'manual_or_supervised_no_auto_execution',
    dispatch_status: input.repairState === 'cadence_current' && input.cadence.overdue_by_seconds === 0
      ? 'cadence_current'
      : 'execution_due_or_repair_required',
    expected_event_type: 'temporal_provider_slo_execution_receipt',
    expected_receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
    max_proof_age_seconds: input.cadence.max_proof_age_seconds,
    next_proof_due_at: input.cadence.next_proof_due_at,
    overdue_by_seconds: input.cadence.overdue_by_seconds,
    authority_boundary: {
      can_auto_execute: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}

function executionReceiptProjection(input: {
  executionEvents: ProviderRuntimeEvent[];
  latestExecution: ProviderRuntimeEvent | undefined;
  latestExecutionPayload: Record<string, unknown> | null;
}) {
  return {
    event_count: input.executionEvents.length,
    latest_event_id: input.latestExecution?.event_id ?? null,
    latest_event_created_at: input.latestExecution?.created_at ?? null,
    latest_event_age_seconds: eventAgeSeconds(input.latestExecution?.created_at ?? null),
    latest_receipt_summary: executionReceiptSummary({
      latestExecutionPayload: input.latestExecutionPayload,
    }),
    latest_repair_receipt: repairReceiptSummary({
      latestExecutionPayload: input.latestExecutionPayload,
    }),
    executed_count: countReceiptField(input.executionEvents, 'execution_status', 'executed'),
    skipped_count: countReceiptField(input.executionEvents, 'execution_status', 'skipped'),
    blocked_count: countReceiptField(input.executionEvents, 'receipt_status', 'blocked'),
    proven_count: countReceiptField(input.executionEvents, 'receipt_status', 'proven'),
    receipt_policy: 'proof_command_execution_receipt_only_no_auto_repair',
  };
}

function operatorSloRepairLoop(input: {
  continuousProofStatus: string;
  freshnessStatus: string;
  sloStatus: string;
  latest: ProviderRuntimeEvent | undefined;
  latestAgeSeconds: number | null;
  latestPayload: Record<string, unknown> | null;
  latestProofReceipt: Record<string, unknown> | null;
  executionEvents: ProviderRuntimeEvent[];
  latestExecution: ProviderRuntimeEvent | undefined;
  latestExecutionPayload: Record<string, unknown> | null;
  maxAgeSeconds: number;
  requiredNextAction: string;
  cadenceWindow: ReturnType<typeof providerCadenceWindow>;
}) {
  const repairState = proofRepairState({
    continuousProofStatus: input.continuousProofStatus,
    proofFreshnessStatus: input.freshnessStatus,
  });
  const cadence = operatorCadence({
    maxAgeSeconds: input.maxAgeSeconds,
    latestAgeSeconds: input.latestAgeSeconds,
    latestCreatedAt: input.latest?.created_at ?? null,
  });
  return {
    surface_kind: 'opl_provider_slo_repair_loop_projection',
    provider_kind: 'temporal',
    projection_role: 'operator_drilldown_read_model',
    repair_state: repairState,
    continuous_proof_status: input.continuousProofStatus,
    proof_freshness_status: input.freshnessStatus,
    proof_slo_status: input.sloStatus,
    latest_event_id: input.latest?.event_id ?? null,
    latest_event_created_at: input.latest?.created_at ?? null,
    latest_event_age_seconds: input.latestAgeSeconds,
    latest_receipt_summary: receiptSummary({
      latestPayload: input.latestPayload,
      latestProofReceipt: input.latestProofReceipt,
    }),
    execution_receipts: executionReceiptProjection({
      executionEvents: input.executionEvents,
      latestExecution: input.latestExecution,
      latestExecutionPayload: input.latestExecutionPayload,
    }),
    cadence_window: input.cadenceWindow,
    operator_cadence: cadence,
    operator_cadence_action: operatorCadenceAction({
      repairState,
      cadence,
    }),
    operator_commands: operatorCommands(repairState),
    required_next_action: input.requiredNextAction,
    authority_boundary: {
      opl: 'provider_slo_projection_and_repair_command_ref_only',
      provider_proof_only_proves: 'temporal_service_worker_residency',
      domain: 'truth_quality_artifact_gate_owner',
      can_execute_repair_command: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}

export function buildProviderContinuousProof(events: ReturnType<typeof listEvents>) {
  const state = providerProofState(events);
  const maxAgeSeconds = providerProofMaxAgeSeconds();
  const latestAgeSeconds = eventAgeSeconds(state.latest?.created_at ?? null);
  const proofStatus = continuousProofStatus({
    proofEventCount: state.proofEvents.length,
    provenCount: state.provenCount,
    latestCloseoutStatus: optionalString(state.latestPayload?.closeout_status),
    latestProofReceiptStatus: optionalString(state.latestProofReceipt?.receipt_status),
  });
  const freshnessStatus = proofFreshnessStatus({
    proofEventCount: state.proofEvents.length,
    latestEventAgeSeconds: latestAgeSeconds,
    maxAgeSeconds,
  });
  const sloStatus = proofSloStatus({
    continuousProofStatus: proofStatus,
    proofFreshnessStatus: freshnessStatus,
  });
  const nextAction = requiredNextAction({
    proofEventCount: state.proofEvents.length,
    freshnessStatus,
    continuousProofStatus: proofStatus,
  });
  const cadenceWindow = providerCadenceWindow({
    proofEvents: state.proofEvents,
    executionEvents: state.executionEvents,
    maxAgeSeconds,
  });
  return {
    surface_kind: 'opl_temporal_provider_continuous_proof_projection',
    provider_kind: 'temporal',
    proof_event_count: state.proofEvents.length,
    proven_event_count: state.provenCount,
    slo_execution_receipt_event_count: state.executionEvents.length,
    latest_slo_execution_event_id: state.latestExecution?.event_id ?? null,
    latest_slo_execution_event_created_at: state.latestExecution?.created_at ?? null,
    latest_slo_execution_event_age_seconds: eventAgeSeconds(state.latestExecution?.created_at ?? null),
    latest_slo_execution_receipt: state.latestExecutionPayload,
    latest_event_id: state.latest?.event_id ?? null,
    latest_event_created_at: state.latest?.created_at ?? null,
    latest_event_age_seconds: latestAgeSeconds,
    max_proof_age_seconds: maxAgeSeconds,
    proof_freshness_status: freshnessStatus,
    latest_proof_mode: optionalString(state.latestPayload?.proof_mode),
    latest_closeout_status: optionalString(state.latestPayload?.closeout_status),
    latest_proof_receipt: state.latestProofReceipt,
    continuous_proof_status: proofStatus,
    proof_slo_status: sloStatus,
    cadence_window: cadenceWindow,
    provider_capability_slo: providerCapabilitySlo({
      executionEvents: state.executionEvents,
    }),
    provider_long_soak_evidence: buildProviderLongSoakEvidenceProjection(),
    operator_slo_repair_loop: operatorSloRepairLoop({
      continuousProofStatus: proofStatus,
      freshnessStatus,
      sloStatus,
      latest: state.latest,
      latestAgeSeconds,
      latestPayload: state.latestPayload,
      latestProofReceipt: state.latestProofReceipt,
      executionEvents: state.executionEvents,
      latestExecution: state.latestExecution,
      latestExecutionPayload: state.latestExecutionPayload,
      maxAgeSeconds,
      requiredNextAction: nextAction,
      cadenceWindow,
    }),
    required_next_action: nextAction,
    authority_boundary: {
      opl: 'provider_residency_receipt_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
}
