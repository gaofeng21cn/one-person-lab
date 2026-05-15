import fs from 'node:fs';

import type { buildTemporalResidencyProof } from './family-runtime-residency-proof.ts';
import { residencyProofReceipt } from './family-runtime-residency-proof-events.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';

const TEMPORAL_PRODUCTION_PROOF_COMMAND = 'opl family-runtime residency proof --provider temporal --production';
const TEMPORAL_PRODUCTION_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60;

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

export function temporalProviderSloExecutionReceipt(input: {
  proof: TemporalResidencyProof;
  persistedProofRef: string | null;
}) {
  const receipt = residencyProofReceipt(input.proof);
  return {
    surface_kind: 'opl_temporal_provider_slo_execution_receipt',
    provider_kind: 'temporal',
    command: TEMPORAL_PRODUCTION_PROOF_COMMAND,
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
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
