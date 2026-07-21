import type { DatabaseSync } from 'node:sqlite';

import { buildTemporalResidencyProof } from './family-runtime-residency-proof.ts';
import { residencyProofReceipt } from './family-runtime-residency-proof-events.ts';
import {
  buildProviderContinuousProof,
} from './family-runtime-provider-continuous-proof.ts';
import {
  persistTemporalProductionProof,
  temporalProviderSloExecutionReceipt,
} from './family-runtime-provider-proof-receipts.ts';
import {
  createFamilyRuntimeQueueTables,
  insertEvent,
  listEvents,
  type familyRuntimePaths,
} from './family-runtime-store.ts';
export {
  maybeRepairTemporalWorkerForProviderSlo,
  type TemporalWorkerRepairDeps,
} from './family-runtime-provider-worker-repair.ts';
import {
  maybeRepairTemporalWorkerForProviderSlo,
  type TemporalWorkerRepairDeps,
} from './family-runtime-provider-worker-repair.ts';
import {
  reconcileTemporalStageAttemptRuntimeObservations,
  type TemporalRuntimeObservationReconciliationDeps,
} from './family-runtime-temporal-runtime-observation-reconciliation.ts';

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;

function cadenceAction(projection: ReturnType<typeof buildProviderContinuousProof>) {
  return projection.operator_slo_repair_loop.operator_cadence_action;
}

function repairReceipt(input: {
  trigger: string;
  status: 'skipped' | 'blocked' | 'executed';
  nextRepairCommand?: string | null;
  blockerIds?: string[];
}) {
  return {
    surface_kind: 'opl_temporal_provider_slo_repair_receipt',
    provider_kind: 'temporal',
    trigger: input.trigger,
    repair_status: input.status,
    cadence_owner: 'provider_backed_family_runtime',
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
    command: 'opl family-runtime residency proof --provider temporal --production',
    blocker_ids: input.blockerIds ?? [],
    next_repair_command: input.nextRepairCommand ?? null,
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

function skippedReceipt(input: {
  projection: ReturnType<typeof buildProviderContinuousProof>;
  force: boolean;
}) {
  const action = cadenceAction(input.projection);
  return {
    surface_kind: 'opl_temporal_provider_slo_execution_receipt',
    provider_kind: 'temporal',
    command: action.command,
    execution_owner: 'operator_or_infrastructure',
    execution_policy: 'supervised_command_receipt_only',
    supervised_cadence_receipt: true,
    execution_status: 'skipped',
    receipt_status: 'skipped',
    receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
    skip_reason: input.force ? null : 'cadence_current',
    repair_receipt: repairReceipt({
      trigger: input.force ? 'forced' : 'cadence_current',
      status: 'skipped',
    }),
    proof_slo_status: input.projection.proof_slo_status,
    proof_freshness_status: input.projection.proof_freshness_status,
    continuous_proof_status: input.projection.continuous_proof_status,
    latest_proof_event_id: input.projection.latest_event_id,
    latest_proof_event_created_at: input.projection.latest_event_created_at,
    cadence_action: action,
    proves_only: 'temporal_service_worker_residency_cadence_execution',
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}

export async function runTemporalProviderSloTick(
  db: DatabaseSync,
  paths: RuntimePaths,
  input: {
    force?: boolean;
    workerRepairDeps?: TemporalWorkerRepairDeps;
    runtimeObservationReconciliationDeps?: TemporalRuntimeObservationReconciliationDeps;
  } = {},
) {
  createFamilyRuntimeQueueTables(db);
  const providerWorkerRepairReceipt = await maybeRepairTemporalWorkerForProviderSlo(
    paths,
    input.workerRepairDeps,
  );
  if (providerWorkerRepairReceipt.repair_status !== 'skipped') {
    insertEvent(db, {
      eventType: 'temporal_provider_worker_repair_receipt',
      source: 'opl-cli',
      payload: providerWorkerRepairReceipt,
    });
  }
  const stageAttemptRuntimeReconciliation = await reconcileTemporalStageAttemptRuntimeObservations(
    db,
    paths,
    {
      trigger: 'provider_slo_tick',
      ...input.runtimeObservationReconciliationDeps,
    },
  );
  const before = buildProviderContinuousProof(listEvents(db));
  const due = input.force === true || before.proof_slo_status !== 'proof_fresh';

  if (!due) {
    const receipt = skippedReceipt({ projection: before, force: input.force === true });
    const event = insertEvent(db, {
      eventType: 'temporal_provider_slo_execution_receipt',
      source: 'opl-cli',
      payload: receipt,
    });
    return {
      surface_id: 'opl_family_runtime_provider_slo_tick',
      provider_kind: 'temporal',
      execution_status: 'skipped',
      skipped: true,
      force: input.force === true,
      provider_worker_repair_receipt: providerWorkerRepairReceipt,
      stage_attempt_runtime_reconciliation: stageAttemptRuntimeReconciliation,
      before,
      after: buildProviderContinuousProof(listEvents(db)),
      provider_slo_execution_receipt: receipt,
      event_id: event.event_id,
      authority_boundary: {
        can_authorize_domain_ready: false,
        can_authorize_quality_verdict: false,
        can_authorize_artifact_export: false,
        can_write_domain_truth: false,
      },
    };
  }

  const proof = await buildTemporalResidencyProof(db, paths, {
    production: true,
  });
  const persistedProofRef = persistTemporalProductionProof(paths, proof);
  const receipt = temporalProviderSloExecutionReceipt({
    proof,
    persistedProofRef,
    trigger: before.proof_slo_status,
    force: input.force === true,
  });
  insertEvent(db, {
    eventType: 'temporal_residency_proof',
    source: 'opl-cli',
    payload: {
      provider_kind: 'temporal',
      proof_mode: proof.proof_mode,
      closeout_status: proof.closeout_status,
      proof_receipt: residencyProofReceipt(proof),
      persisted_proof_ref: persistedProofRef,
      provider_slo_execution_receipt: receipt,
      invoked_by: 'family_runtime_provider_slo_tick',
    },
  });
  const event = insertEvent(db, {
    eventType: 'temporal_provider_slo_execution_receipt',
    source: 'opl-cli',
    payload: {
      ...receipt,
      execution_status: 'executed',
    },
  });
  return {
    surface_id: 'opl_family_runtime_provider_slo_tick',
    provider_kind: 'temporal',
    execution_status: 'executed',
    skipped: false,
    force: input.force === true,
    provider_worker_repair_receipt: providerWorkerRepairReceipt,
    stage_attempt_runtime_reconciliation: stageAttemptRuntimeReconciliation,
    before,
    after: buildProviderContinuousProof(listEvents(db)),
    proof,
    persisted_proof_ref: persistedProofRef,
    provider_slo_execution_receipt: {
      ...receipt,
      execution_status: 'executed',
    },
    event_id: event.event_id,
    authority_boundary: {
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_artifact_export: false,
      can_write_domain_truth: false,
    },
  };
}
