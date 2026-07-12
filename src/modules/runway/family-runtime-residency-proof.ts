import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stageAttemptSummary } from './family-runtime-stage-attempts.ts';
import type { familyRuntimePaths } from './family-runtime-store.ts';
import {
  runTemporalProductionResidencyProofForWorker,
} from './family-runtime-temporal-provider-parts/production-proof.ts';
import {
  inspectTemporalWorkerLifecycle,
} from './family-runtime-temporal-worker-lifecycle.ts';

type RuntimePaths = ReturnType<typeof familyRuntimePaths>;

function countStageAttemptsWhere(db: DatabaseSync, whereSql: string) {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM stage_attempts ${whereSql}`).get() as { count: number };
  return row.count;
}

async function runTemporalLiveResidencyProof() {
  const extension = path.extname(fileURLToPath(import.meta.url)) === '.ts' ? '.ts' : '.js';
  const moduleUrl = new URL(`./family-runtime-temporal-residency-proof${extension}`, import.meta.url).href;
  const proofModule = await import(moduleUrl) as {
    runTemporalResidencyProof?: () => Promise<Record<string, unknown>>;
  };
  if (typeof proofModule.runTemporalResidencyProof !== 'function') {
    throw new FrameworkContractError('contract_shape_invalid', 'Temporal live residency proof module is invalid.', {
      module_url: moduleUrl,
    });
  }
  return await proofModule.runTemporalResidencyProof();
}

export async function buildTemporalResidencyProof(
  db: DatabaseSync,
  paths: RuntimePaths,
  input: { live?: boolean; production?: boolean } = {},
) {
  const worker = await inspectTemporalWorkerLifecycle(paths);
  const liveProof = input.live ? await runTemporalLiveResidencyProof() : null;
  const productionProof = input.production ? await runTemporalProductionResidencyProofForWorker(worker) : null;
  const attemptSummary = stageAttemptSummary(db);
  const temporalAttemptsTotal = countStageAttemptsWhere(db, "WHERE provider_kind = 'temporal'");
  const temporalTypedCloseoutAccepted = countStageAttemptsWhere(
    db,
    "WHERE provider_kind = 'temporal' AND closeout_receipt_status = 'accepted_typed_closeout'",
  );
  const temporalCompleted = countStageAttemptsWhere(db, "WHERE provider_kind = 'temporal' AND status = 'completed'");
  const temporalBlocked = countStageAttemptsWhere(db, "WHERE provider_kind = 'temporal' AND status = 'blocked'");
  const temporalDeadLettered = countStageAttemptsWhere(
    db,
    "WHERE provider_kind = 'temporal' AND status = 'dead_lettered'",
  );
  const temporalHumanGate = countStageAttemptsWhere(db, "WHERE provider_kind = 'temporal' AND status = 'human_gate'");
  const signalRows = db.prepare(`
    SELECT s.signal_kind AS signal_kind, COUNT(*) AS count
    FROM stage_attempt_signals s
    JOIN stage_attempts a ON a.stage_attempt_id = s.stage_attempt_id
    WHERE a.provider_kind = 'temporal'
    GROUP BY s.signal_kind
  `).all() as Array<{ signal_kind: string; count: number }>;
  const signalCounts = Object.fromEntries(signalRows.map((row) => [row.signal_kind, row.count]));
  const progressCloseoutProof = {
    typed_closeout_required_for_progress: false,
    raw_artifact_sufficient_for_progress: true,
    framework_derives_minimal_progress_envelope: true,
    temporal_completed_attempts: temporalCompleted,
    temporal_typed_closeout_accepted_attempts: temporalTypedCloseoutAccepted,
    temporal_blocked_attempts: temporalBlocked,
    proof_status:
      temporalCompleted === temporalTypedCloseoutAccepted
        ? 'proven'
        : 'needs_more_evidence',
  };
  const lifecycleProof = {
    temporal_server_reachable: worker.server_reachable === true,
    temporal_worker_ready: worker.worker_ready === true,
    lifecycle_status: worker.lifecycle_status,
    managed_worker_pid: worker.managed_worker_pid,
    managed_worker_state_path: worker.managed_worker_state_path,
    blockers: worker.blockers,
    proof_status: worker.lifecycle_status === 'ready' ? 'proven' : 'needs_live_residency',
  };
  const attemptProof = {
    temporal_attempts_total: temporalAttemptsTotal,
    temporal_attempts_by_status: attemptSummary.by_status,
    temporal_signal_counts: signalCounts,
    has_start_query_signal_surface: true,
    restart_requery_surface: 'family-runtime worker status/start/stop plus attempt query',
    retry_dead_letter_blocked: {
      dead_lettered_attempts: temporalDeadLettered,
      blocked_attempts: temporalBlocked,
      human_gate_attempts: temporalHumanGate,
      proof_status:
        temporalDeadLettered > 0 || temporalBlocked > 0 || temporalHumanGate > 0
          ? 'proven'
          : 'needs_blocked_or_dead_letter_evidence',
    },
  };
  return {
    surface_kind: 'opl_temporal_production_residency_proof',
    provider_kind: 'temporal',
    closeout_status:
      productionProof?.closeout_status === 'production_residency_proven'
        ? 'production_residency_proven'
        : productionProof
          ? 'production_residency_needs_live_evidence'
          : liveProof?.closeout_status === 'production_residency_code_path_proven'
            ? 'production_residency_code_path_proven'
            : (lifecycleProof.proof_status === 'proven'
              && progressCloseoutProof.proof_status === 'proven'
              && attemptProof.retry_dead_letter_blocked.proof_status === 'proven')
              ? 'production_residency_proven'
              : 'production_residency_needs_live_evidence',
    proof_mode: input.production
      ? 'external_temporal_service_worker'
      : input.live
        ? 'temporal_live_test_server_worker'
        : 'configured_runtime_ledger_projection',
    live_residency_proof: liveProof,
    production_residency_proof: productionProof,
    temporal_worker_lifecycle: worker,
    proofs: {
      lifecycle: lifecycleProof,
      attempt_start_query_signal: attemptProof,
      progress_closeout: progressCloseoutProof,
    },
    authority_boundary: {
      opl: 'temporal_residency_and_attempt_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}
