import type { listEvents } from './family-runtime-store.ts';
import { isRecord, optionalString } from './domain-manifest/shared-utils.ts';

const DEFAULT_PROVIDER_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60;
const PRODUCTION_PROOF_COMMAND = 'opl family-runtime residency proof --provider temporal --production';

type ProviderRuntimeEvent = ReturnType<typeof listEvents>[number];

function providerProofMaxAgeSeconds() {
  const raw = process.env.OPL_PROVIDER_PROOF_MAX_AGE_SECONDS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_PROVIDER_PROOF_MAX_AGE_SECONDS;
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
  if (input.continuousProofStatus !== 'all_observed_proofs_proven') {
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
  if (input.continuousProofStatus !== 'all_observed_proofs_proven') {
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

function countReceiptField(events: ProviderRuntimeEvent[], fieldName: string, expected: string) {
  return events.filter((event) => {
    const payload = eventPayload(event);
    return optionalString(payload?.[fieldName]) === expected;
  }).length;
}

function eventPayload(event: ProviderRuntimeEvent | undefined) {
  return isRecord(event?.payload) ? event.payload : null;
}

function continuousProofStatus(input: {
  proofEventCount: number;
  provenCount: number;
}) {
  if (input.proofEventCount === 0) {
    return 'no_proof_observed';
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
  provenCount: number;
}) {
  if (input.proofEventCount === 0) {
    return `Run ${PRODUCTION_PROOF_COMMAND} and keep the receipt in the runtime ledger.`;
  }
  if (input.freshnessStatus === 'stale') {
    return 'Rerun production proof; the latest proven Temporal provider receipt is older than the configured operator cadence.';
  }
  if (input.freshnessStatus === 'unknown') {
    return 'Rerun production proof; the latest Temporal provider receipt has no parseable timestamp.';
  }
  if (input.provenCount === input.proofEventCount) {
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
    provenCount: state.provenCount,
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
    }),
    required_next_action: nextAction,
    authority_boundary: {
      opl: 'provider_residency_receipt_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
}
