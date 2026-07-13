import fs from 'node:fs';

import type { buildTemporalResidencyProof } from './family-runtime-residency-proof.ts';
import { residencyProofReceipt } from './family-runtime-residency-proof-events.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

const TEMPORAL_PRODUCTION_PROOF_COMMAND = 'opl family-runtime residency proof --provider temporal --production';
const TEMPORAL_PRODUCTION_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60;
const TEMPORAL_PRODUCTION_CAPABILITY_CHECK_IDS = [
  'external_temporal_server_reachable',
  'managed_worker_ready',
  'worker_completed_attempt',
  'worker_restart_requery',
  'signal_history_preserved',
  'typed_closeout_required_for_completed',
  'missing_closeout_advances_with_diagnostic',
  'no_output_diagnostic_boundary_observed',
  'domain_truth_boundary_preserved',
] as const;

type TemporalResidencyProof = Awaited<ReturnType<typeof buildTemporalResidencyProof>>;
type RuntimePaths = ReturnType<typeof familyRuntimePaths>;

export function persistTemporalProductionProof(paths: RuntimePaths, proof: TemporalResidencyProof) {
  if (proof.provider_kind !== 'temporal' || proof.proof_mode !== 'external_temporal_service_worker') {
    return null;
  }
  fs.mkdirSync(paths.proof_dir, { recursive: true });
  fs.writeFileSync(paths.latest_temporal_production_proof, `${JSON.stringify({
    version: 'g2',
    family_runtime_residency_proof: {
      surface_id: 'opl_family_runtime_residency_proof',
      ...proof,
    },
  }, null, 2)}\n`, 'utf8');
  return paths.latest_temporal_production_proof;
}

function recordOrNull(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function booleanRecord(value: Record<string, unknown> | null) {
  return Object.fromEntries(TEMPORAL_PRODUCTION_CAPABILITY_CHECK_IDS.map((checkId) => [
    checkId,
    value?.[checkId] === true,
  ]));
}

function temporalProductionCapabilityReceipt(proof: TemporalResidencyProof) {
  const productionProof = recordOrNull(proof.production_residency_proof);
  const checks = booleanRecord(recordOrNull(productionProof?.checks));
  const failedCheckIds = TEMPORAL_PRODUCTION_CAPABILITY_CHECK_IDS.filter((checkId) => checks[checkId] !== true);
  const completedAttempt = recordOrNull(productionProof?.completed_attempt);
  const diagnosticAttempt = recordOrNull(productionProof?.diagnostic_attempt);
  const restartedWorkerRequery = recordOrNull(productionProof?.restarted_worker_requery);
  const capabilityProven =
    proof.closeout_status === 'production_residency_proven'
    && failedCheckIds.length === 0;
  return {
    surface_kind: 'opl_temporal_provider_production_capability_receipt',
    provider_kind: 'temporal',
    receipt_status: capabilityProven ? 'proven' : 'blocked',
    capability_status: capabilityProven ? 'capability_proven' : 'capability_blocked',
    required_check_ids: [...TEMPORAL_PRODUCTION_CAPABILITY_CHECK_IDS],
    checks,
    failed_check_ids: failedCheckIds,
    proven_check_count: TEMPORAL_PRODUCTION_CAPABILITY_CHECK_IDS.length - failedCheckIds.length,
    required_check_count: TEMPORAL_PRODUCTION_CAPABILITY_CHECK_IDS.length,
    completed_workflow_id: typeof completedAttempt?.workflow_id === 'string'
      ? completedAttempt.workflow_id
      : null,
    diagnostic_workflow_id: typeof diagnosticAttempt?.workflow_id === 'string'
      ? diagnosticAttempt.workflow_id
      : null,
    restarted_worker_requery_status:
      typeof restartedWorkerRequery?.requery_status === 'string'
        ? restartedWorkerRequery.requery_status
        : null,
    evidence_policy:
      'production_capability_receipt_requires_restart_requery_signal_history_typed_closeout_and_boundary_checks',
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}

function productionProofRepairAction(proof: TemporalResidencyProof) {
  const productionProof = recordOrNull(proof.production_residency_proof);
  const blocker = recordOrNull(productionProof?.blocker);
  const repairAction = recordOrNull(blocker?.repair_action);
  return {
    action_id: typeof repairAction?.action_id === 'string' ? repairAction.action_id : null,
    next_command: typeof repairAction?.next_command === 'string' ? repairAction.next_command : null,
  };
}

function temporalProviderSloRepairReceipt(input: {
  proof: TemporalResidencyProof;
  trigger: string;
  force?: boolean;
}) {
  const receipt = residencyProofReceipt(input.proof);
  const productionProof = recordOrNull(input.proof.production_residency_proof);
  const repairAction = productionProofRepairAction(input.proof);
  const receiptStatus = typeof receipt.receipt_status === 'string' ? receipt.receipt_status : null;
  const blocked = receiptStatus !== 'proven';
  return {
    surface_kind: 'opl_temporal_provider_slo_repair_receipt',
    provider_kind: 'temporal',
    trigger: input.force ? 'forced' : input.trigger,
    repair_status: blocked ? 'blocked' : 'executed',
    cadence_owner: 'provider_backed_family_runtime',
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
    command: TEMPORAL_PRODUCTION_PROOF_COMMAND,
    closeout_status: input.proof.closeout_status,
    receipt_status: receiptStatus,
    blocker_ids: stringArray(productionProof?.blockers),
    next_repair_command: blocked ? repairAction.next_command : null,
    repair_action_id: blocked ? repairAction.action_id : 'none',
    can_execute_domain_repair: false,
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
      can_execute_domain_repair: false,
    },
  };
}

export function temporalProviderSloExecutionReceipt(input: {
  proof: TemporalResidencyProof;
  persistedProofRef: string | null;
  trigger?: string;
  force?: boolean;
}) {
  const receipt = residencyProofReceipt(input.proof);
  const repairReceipt = temporalProviderSloRepairReceipt({
    proof: input.proof,
    trigger: input.trigger ?? 'proof_slo_due',
    force: input.force,
  });
  return {
    surface_kind: 'opl_temporal_provider_slo_execution_receipt',
    provider_kind: 'temporal',
    command: TEMPORAL_PRODUCTION_PROOF_COMMAND,
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
    supervised_cadence_receipt: true,
    cadence_action: {
      action_id: 'temporal-provider-production-proof-cadence',
      action_kind: 'provider_slo_cadence_execution',
      provider_kind: 'temporal',
      command: TEMPORAL_PRODUCTION_PROOF_COMMAND,
      execution_owner: 'operator_or_infrastructure',
      execution_policy: 'manual_or_supervised_no_auto_execution',
      expected_event_type: 'temporal_provider_slo_execution_receipt',
      expected_receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
      max_proof_age_seconds: TEMPORAL_PRODUCTION_PROOF_MAX_AGE_SECONDS,
      authority_boundary: {
        can_auto_execute: false,
        can_authorize_domain_ready: false,
        can_authorize_quality_verdict: false,
        can_authorize_artifact_export: false,
        can_write_domain_truth: false,
      },
    },
    proof_mode: input.proof.proof_mode,
    closeout_status: input.proof.closeout_status,
    receipt_status: receipt.receipt_status,
    receipt_kind: receipt.receipt_kind,
    production_capability_receipt: temporalProductionCapabilityReceipt(input.proof),
    repair_receipt: repairReceipt,
    persisted_proof_ref: input.persistedProofRef,
    proves_only: 'temporal_service_worker_residency_cadence_execution',
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}
