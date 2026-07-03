import fs from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import {
  buildProviderContinuousProof,
  providerProofStatusIsCurrentlyProven,
} from './family-runtime-provider-continuous-proof.ts';
import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import { familyRuntimePaths, listEvents } from './family-runtime-store.ts';

function tableExists(db: DatabaseSync, tableName: string) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

export function readProviderContinuousProof() {
  const paths = familyRuntimePaths();
  if (!fs.existsSync(paths.queue_db)) {
    return buildProviderContinuousProof([]);
  }
  const db = openFamilyRuntimeSqlite(paths.queue_db, { readOnly: true });
  try {
    if (!tableExists(db, 'events')) {
      return buildProviderContinuousProof([]);
    }
    return buildProviderContinuousProof(listEvents(db));
  } finally {
    db.close();
  }
}

export type ProviderContinuousProof = ReturnType<typeof buildProviderContinuousProof>;

export function providerResidencyGapStatus(proof: ProviderContinuousProof) {
  if (providerProofStatusIsCurrentlyProven(proof.continuous_proof_status) && proof.proof_slo_status === 'proof_fresh') {
    return 'closed_by_fresh_proven_proof';
  }
  if (proof.continuous_proof_status === 'no_proof_observed') {
    return 'requires_fresh_production_proof';
  }
  if (proof.proof_slo_status === 'proof_stale' || proof.proof_slo_status === 'proof_freshness_unknown') {
    return 'requires_current_production_proof';
  }
  return 'requires_provider_repair';
}

export function providerClosureEvidence(proof: ProviderContinuousProof) {
  return {
    external_temporal_production_residency_proof: {
      status: providerResidencyGapStatus(proof),
      provider_kind: proof.provider_kind,
      proof_slo_status: proof.proof_slo_status,
      latest_closeout_status: proof.latest_closeout_status,
      provider_completion_is_domain_ready: proof.authority_boundary.provider_completion_is_domain_ready,
    },
  };
}

type ProductionClosureGap = {
  gap_id: string;
  [key: string]: unknown;
};

export function applyProviderClosureEvidence<T extends ProductionClosureGap>(
  gaps: T[],
  proof: ProviderContinuousProof,
) {
  const providerGapStatus = providerResidencyGapStatus(proof);
  if (providerGapStatus === 'closed_by_fresh_proven_proof') {
    return gaps.filter((gap) => gap.gap_id !== 'external_temporal_production_residency_proof');
  }
  return gaps.map((gap) =>
    gap.gap_id === 'external_temporal_production_residency_proof'
      ? {
          ...gap,
          projection_status: providerGapStatus,
          proof_slo_status: proof.proof_slo_status,
          latest_closeout_status: proof.latest_closeout_status,
        }
      : gap
  );
}
