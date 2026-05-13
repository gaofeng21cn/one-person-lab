import type { listEvents } from './family-runtime-store.ts';
import { isRecord, optionalString } from './domain-manifest/shared-utils.ts';

const DEFAULT_PROVIDER_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60;

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

export function buildProviderContinuousProof(events: ReturnType<typeof listEvents>) {
  const proofEvents = events.filter((event) => event.event_type === 'temporal_residency_proof');
  const latest = proofEvents.at(-1);
  const latestPayload = isRecord(latest?.payload) ? latest.payload : null;
  const provenCount = proofEvents.filter((event) =>
    isRecord(event.payload) && event.payload.closeout_status === 'production_residency_proven'
  ).length;
  const maxAgeSeconds = providerProofMaxAgeSeconds();
  const latestAgeSeconds = eventAgeSeconds(latest?.created_at ?? null);
  const continuousProofStatus =
    proofEvents.length === 0
      ? 'no_proof_observed'
      : provenCount === proofEvents.length
        ? 'all_observed_proofs_proven'
        : 'proof_blocker_observed';
  const freshnessStatus = proofFreshnessStatus({
    proofEventCount: proofEvents.length,
    latestEventAgeSeconds: latestAgeSeconds,
    maxAgeSeconds,
  });
  const sloStatus = proofSloStatus({
    continuousProofStatus,
    proofFreshnessStatus: freshnessStatus,
  });
  return {
    surface_kind: 'opl_temporal_provider_continuous_proof_projection',
    provider_kind: 'temporal',
    proof_event_count: proofEvents.length,
    proven_event_count: provenCount,
    latest_event_id: latest?.event_id ?? null,
    latest_event_created_at: latest?.created_at ?? null,
    latest_event_age_seconds: latestAgeSeconds,
    max_proof_age_seconds: maxAgeSeconds,
    proof_freshness_status: freshnessStatus,
    latest_proof_mode: optionalString(latestPayload?.proof_mode),
    latest_closeout_status: optionalString(latestPayload?.closeout_status),
    latest_proof_receipt: isRecord(latestPayload?.proof_receipt) ? latestPayload.proof_receipt : null,
    continuous_proof_status: continuousProofStatus,
    proof_slo_status: sloStatus,
    required_next_action:
      proofEvents.length === 0
        ? 'Run opl family-runtime residency proof --provider temporal --production and keep the receipt in the runtime ledger.'
        : freshnessStatus === 'stale'
          ? 'Rerun production proof; the latest proven Temporal provider receipt is older than the configured operator cadence.'
          : freshnessStatus === 'unknown'
            ? 'Rerun production proof; the latest Temporal provider receipt has no parseable timestamp.'
            : provenCount === proofEvents.length
              ? 'Keep rerunning production proof on the operator cadence while domain owner chains mature.'
              : 'Repair Temporal service/worker readiness, rerun production proof, and keep failed receipts visible.',
    authority_boundary: {
      opl: 'provider_residency_receipt_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
}
