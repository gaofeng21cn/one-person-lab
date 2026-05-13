import type { buildTemporalResidencyProof } from './family-runtime-residency-proof.ts';

function recordOrNull(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function residencyProofReceipt(proof: Awaited<ReturnType<typeof buildTemporalResidencyProof>>) {
  const productionProof = recordOrNull(proof.production_residency_proof);
  const liveProof = recordOrNull(proof.live_residency_proof);
  const productionReceipt = recordOrNull(productionProof?.proof_receipt);
  if (productionReceipt) {
    return productionReceipt;
  }
  return {
    receipt_kind: 'temporal_residency_projection',
    receipt_status:
      proof.closeout_status === 'production_residency_proven'
      || proof.closeout_status === 'production_residency_code_path_proven'
        ? 'proven'
        : 'blocked',
    provider_kind: 'temporal',
    live_closeout_status: typeof liveProof?.closeout_status === 'string'
      ? liveProof.closeout_status
      : null,
  };
}
