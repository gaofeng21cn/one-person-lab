import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';

const TEMPORAL_RUNTIME_OBSERVATION_MAX_FUTURE_SKEW_MS = 5_000;

type TemporalRuntimeObservationCheck =
  | { status: 'invalid' }
  | {
      status: 'expired' | 'not_running' | 'running';
      observed_at: string;
      expires_at: string;
      ttl_ms: number;
    };

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizedStatus(value: unknown) {
  return stringValue(value)?.toLowerCase().replace(/[\s-]+/g, '_') ?? 'unknown';
}

export function inspectTemporalRuntimeObservation(
  observation: JsonRecord,
  now = Date.now(),
): TemporalRuntimeObservationCheck {
  const observedAt = stringValue(observation.observed_at);
  const expiresAt = stringValue(observation.expires_at);
  const providerUpdatedAt = stringValue(observation.provider_updated_at);
  const observedTime = Date.parse(observedAt ?? '');
  const expiresTime = Date.parse(expiresAt ?? '');
  const providerUpdatedTime = Date.parse(providerUpdatedAt ?? '');
  const ttlMs = numberValue(observation.ttl_ms);
  if (
    !observedAt
    || !expiresAt
    || !providerUpdatedAt
    || !Number.isFinite(observedTime)
    || !Number.isFinite(expiresTime)
    || !Number.isFinite(providerUpdatedTime)
    || ttlMs === null
    || !Number.isSafeInteger(ttlMs)
    || ttlMs <= 0
    || ttlMs > 86_400_000
    || expiresTime - observedTime !== ttlMs
    || observedTime > now + TEMPORAL_RUNTIME_OBSERVATION_MAX_FUTURE_SKEW_MS
    || providerUpdatedTime > now + TEMPORAL_RUNTIME_OBSERVATION_MAX_FUTURE_SKEW_MS
  ) {
    return { status: 'invalid' };
  }
  const valid = {
    observed_at: observedAt,
    expires_at: expiresAt,
    ttl_ms: ttlMs,
  } as const;
  if (expiresTime <= now) {
    return { ...valid, status: 'expired' };
  }
  if (
    normalizedStatus(observation.workflow_status) !== 'running'
    || normalizedStatus(observation.query_status) !== 'running'
    || normalizedStatus(observation.effective_runtime_status) !== 'running'
    || !stringValue(observation.run_id)
    || observation.provider_completion_is_domain_ready !== false
  ) {
    return { ...valid, status: 'not_running' };
  }
  return { ...valid, status: 'running' };
}
