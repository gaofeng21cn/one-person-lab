import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './closeout-normalization.ts';
import { isRecord, type JsonRecord } from './shared.ts';

const SHA256_PATTERN = /^sha256:([a-f0-9]{64})$/;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const MAX_REFERENCED_CLOSEOUT_BYTES = 1024 * 1024;

type ReferencedCloseoutObservation = {
  ref: string;
  sha256: string;
  size_bytes: number;
  bytes: Buffer;
};

function hydrationError(input: {
  message: string;
  blockedReason: string;
  ref: string;
  hardStopClass?: 'authority_boundary_violation' | 'stale_or_mismatched_stage_identity';
  details?: Record<string, unknown>;
}): never {
  throw new FrameworkContractError('contract_shape_invalid', input.message, {
    hard_stop_class: input.hardStopClass ?? 'stale_or_mismatched_stage_identity',
    blocked_reason: input.blockedReason,
    referenced_closeout_ref: input.ref,
    ...(input.details ?? {}),
  });
}

function canonicalSha256(value: unknown, ref: string) {
  const normalized = optionalString(value)?.toLowerCase();
  if (!normalized || !SHA256_PATTERN.test(normalized)) {
    hydrationError({
      message: 'Referenced closeout metadata must declare a canonical SHA-256 digest.',
      blockedReason: 'referenced_closeout_sha256_missing_or_invalid',
      ref,
    });
  }
  return normalized;
}

function stableStatIdentity(stat: fs.Stats) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}

function localPathForRef(ref: string, workspaceRoot: string) {
  if (ref.startsWith('file://')) {
    try {
      return fileURLToPath(ref);
    } catch {
      hydrationError({
        message: 'Referenced closeout file URL is invalid.',
        blockedReason: 'referenced_closeout_ref_invalid',
        ref,
      });
    }
  }
  if (URI_SCHEME_PATTERN.test(ref)) {
    hydrationError({
      message: 'Referenced closeout hydration accepts only local workspace files.',
      blockedReason: 'referenced_closeout_ref_not_local',
      hardStopClass: 'authority_boundary_violation',
      ref,
    });
  }
  return path.isAbsolute(ref) ? ref : path.resolve(workspaceRoot, ref);
}

function observeReferencedCloseout(input: {
  ref: string;
  sha256: string;
  sizeBytes?: number;
  workspaceRoot: string;
}): ReferencedCloseoutObservation {
  let realWorkspaceRoot: string;
  let realFilePath: string;
  try {
    realWorkspaceRoot = fs.realpathSync.native(input.workspaceRoot);
    realFilePath = fs.realpathSync.native(localPathForRef(input.ref, realWorkspaceRoot));
  } catch (error) {
    hydrationError({
      message: 'Referenced closeout file could not be resolved.',
      blockedReason: 'referenced_closeout_ref_unreadable',
      ref: input.ref,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }
  const relative = path.relative(realWorkspaceRoot, realFilePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    hydrationError({
      message: 'Referenced closeout file must remain inside the exact Attempt workspace.',
      blockedReason: 'referenced_closeout_ref_outside_workspace',
      hardStopClass: 'authority_boundary_violation',
      ref: input.ref,
      details: { resolved_path: realFilePath, workspace_root: realWorkspaceRoot },
    });
  }

  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(realFilePath, 'r');
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) {
      hydrationError({
        message: 'Referenced closeout must be a regular local file.',
        blockedReason: 'referenced_closeout_ref_not_regular_file',
        ref: input.ref,
      });
    }
    if (before.size <= 0 || before.size > MAX_REFERENCED_CLOSEOUT_BYTES) {
      hydrationError({
        message: 'Referenced closeout file size is outside the transport verification limit.',
        blockedReason: 'referenced_closeout_size_invalid',
        ref: input.ref,
        details: { size_bytes: before.size, max_size_bytes: MAX_REFERENCED_CLOSEOUT_BYTES },
      });
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (bytes.length !== before.size || stableStatIdentity(before) !== stableStatIdentity(after)) {
      hydrationError({
        message: 'Referenced closeout file changed while its bytes were observed.',
        blockedReason: 'referenced_closeout_ref_not_stable',
        ref: input.ref,
      });
    }
    const observedSha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
    if (observedSha256 !== input.sha256) {
      hydrationError({
        message: 'Referenced closeout SHA does not match the stable local file bytes.',
        blockedReason: 'referenced_closeout_sha256_mismatch',
        ref: input.ref,
        details: { declared_sha256: input.sha256, observed_sha256: observedSha256 },
      });
    }
    if (input.sizeBytes !== undefined && input.sizeBytes !== bytes.length) {
      hydrationError({
        message: 'Referenced closeout size does not match the stable local file bytes.',
        blockedReason: 'referenced_closeout_size_mismatch',
        ref: input.ref,
        details: { declared_size_bytes: input.sizeBytes, observed_size_bytes: bytes.length },
      });
    }
    return {
      ref: input.ref,
      sha256: observedSha256,
      size_bytes: bytes.length,
      bytes,
    };
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function referenceMetadata(closeout: TypedStageCloseoutPacket) {
  return (closeout.closeout_ref_metadata ?? []).filter(
    (entry) => optionalString(entry.kind) === 'stage_attempt_closeout_packet',
  );
}

function metadataRef(entry: JsonRecord) {
  return optionalString(entry.ref) ?? optionalString(entry.uri);
}

function mergeCloseoutMetadata(lists: JsonRecord[][], observation: ReferencedCloseoutObservation) {
  const merged = new Map<string, JsonRecord>();
  for (const entry of lists.flat()) {
    const ref = metadataRef(entry);
    if (!ref) continue;
    const observedEntry: JsonRecord = ref === observation.ref
      ? { ...entry, sha256: observation.sha256, size_bytes: observation.size_bytes, ref }
      : { ...entry, ref };
    const existing = merged.get(ref);
    if (!existing) {
      merged.set(ref, observedEntry);
      continue;
    }
    for (const field of new Set([...Object.keys(existing), ...Object.keys(observedEntry)])) {
      if (
        field in existing
        && field in observedEntry
        && canonicalJsonText(existing[field]) !== canonicalJsonText(observedEntry[field])
      ) {
        hydrationError({
          message: 'Referenced closeout metadata conflicts with the protocol resume packet.',
          blockedReason: 'referenced_closeout_metadata_conflict',
          ref,
          details: { field },
        });
      }
    }
    merged.set(ref, { ...existing, ...observedEntry, ref });
  }
  return [...merged.values()];
}

function uniqueStrings(...lists: string[][]) {
  return [...new Set(lists.flat())];
}

function uniqueRecords(...lists: JsonRecord[][]) {
  const records = new Map<string, JsonRecord>();
  for (const entry of lists.flat()) records.set(canonicalJsonText(entry), entry);
  return [...records.values()];
}

function assertExplicitFieldCompatibility(input: {
  hydratedCandidate: JsonRecord;
  resumedCandidate: JsonRecord | null;
  ref: string;
}) {
  if (!input.resumedCandidate) return;
  for (const field of [
    'route_impact',
    'authority_boundary',
    'domain_output',
    'next_owner',
    'domain_ready_verdict',
    'idempotency_key',
    'closeout_id',
  ]) {
    if (
      Object.hasOwn(input.hydratedCandidate, field)
      && Object.hasOwn(input.resumedCandidate, field)
      && canonicalJsonText(input.hydratedCandidate[field]) !== canonicalJsonText(input.resumedCandidate[field])
    ) {
      hydrationError({
        message: 'Referenced closeout conflicts with an explicit protocol resume field.',
        blockedReason: 'referenced_closeout_packet_conflict',
        ref: input.ref,
        details: { field },
      });
    }
  }
}

function assertPreservedRouteCompatibility(input: {
  hydratedCandidate: JsonRecord;
  preservedRouteImpact?: JsonRecord | null;
  ref: string;
}) {
  if (
    !input.preservedRouteImpact
    || !Object.hasOwn(input.hydratedCandidate, 'route_impact')
    || canonicalJsonText(input.hydratedCandidate.route_impact) === canonicalJsonText(input.preservedRouteImpact)
  ) {
    return;
  }
  hydrationError({
    message: 'Referenced closeout conflicts with the route preserved from the initial response.',
    blockedReason: 'referenced_closeout_packet_conflict',
    ref: input.ref,
    details: { field: 'route_impact', source: 'initial_response' },
  });
}

function assertAttemptIdentity(input: {
  candidate: JsonRecord;
  attempt: JsonRecord;
  ref: string;
  source: 'referenced_packet' | 'resume_packet';
}) {
  const attemptId = optionalString(input.attempt.stage_attempt_id);
  const candidateAttemptId = optionalString(input.candidate.stage_attempt_id);
  if (!attemptId || candidateAttemptId !== attemptId) {
    hydrationError({
      message: 'Referenced closeout must bind the exact current Stage Attempt.',
      blockedReason: 'referenced_closeout_stage_attempt_id_mismatch',
      ref: input.ref,
      details: {
        source: input.source,
        expected_stage_attempt_id: attemptId,
        actual_stage_attempt_id: candidateAttemptId,
      },
    });
  }
  for (const field of ['stage_id', 'stage_run_id', 'quality_cycle_id', 'attempt_role']) {
    const expected = optionalString(input.attempt[field]);
    const actual = optionalString(input.candidate[field]);
    if (expected && actual && expected !== actual) {
      hydrationError({
        message: 'Referenced closeout carries stale or mismatched Stage identity.',
        blockedReason: 'referenced_closeout_stage_identity_mismatch',
        ref: input.ref,
        details: { source: input.source, field, expected, actual },
      });
    }
  }
  const expectedIdempotencyKey = optionalString(input.attempt.idempotency_key);
  const actualIdempotencyKey = optionalString(input.candidate.idempotency_key);
  if (expectedIdempotencyKey && actualIdempotencyKey && expectedIdempotencyKey !== actualIdempotencyKey) {
    hydrationError({
      message: 'Referenced closeout carries a mismatched Attempt idempotency identity.',
      blockedReason: 'referenced_closeout_idempotency_key_mismatch',
      ref: input.ref,
      details: {
        source: input.source,
        expected_idempotency_key: expectedIdempotencyKey,
        actual_idempotency_key: actualIdempotencyKey,
      },
    });
  }
}

function mergeInitialRouteImpact(input: {
  initialCandidate: JsonRecord | null;
  resumedCloseout: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
}) {
  const initialRouteImpact = isRecord(input.initialCandidate?.route_impact)
    ? input.initialCandidate.route_impact
    : null;
  const attemptId = optionalString(input.attempt.stage_attempt_id);
  const candidateAttemptId = optionalString(input.initialCandidate?.stage_attempt_id);
  const attemptIdempotencyKey = optionalString(input.attempt.idempotency_key);
  const candidateIdempotencyKey = optionalString(input.initialCandidate?.idempotency_key);
  if (
    !input.initialCandidate
    || !input.resumedCloseout
    || !optionalString(input.initialCandidate.surface_kind)
    || !initialRouteImpact
    || Object.keys(initialRouteImpact).length === 0
    || (attemptId && candidateAttemptId !== attemptId)
    || (
      attemptIdempotencyKey
      && candidateIdempotencyKey
      && candidateIdempotencyKey !== attemptIdempotencyKey
    )
  ) {
    return { closeoutPacket: input.resumedCloseout, initialRouteImpactPreserved: false };
  }
  return {
    closeoutPacket: { ...input.resumedCloseout, route_impact: initialRouteImpact },
    initialRouteImpactPreserved: true,
  };
}

export function hydrateReferencedStageAttemptCloseout(input: {
  resumedCloseout: TypedStageCloseoutPacket | null;
  resumedCandidate: JsonRecord | null;
  attempt: JsonRecord;
  workspaceRoot: string;
  preservedRouteImpact?: JsonRecord | null;
}) {
  if (!input.resumedCloseout) {
    return { status: 'not_applicable' as const, closeoutPacket: null, observation: null };
  }
  const references = referenceMetadata(input.resumedCloseout);
  if (references.length === 0) {
    return {
      status: 'not_applicable' as const,
      closeoutPacket: input.resumedCloseout,
      observation: null,
    };
  }
  if (references.length !== 1) {
    hydrationError({
      message: 'Protocol resume must identify exactly one referenced Stage Attempt closeout packet.',
      blockedReason: 'referenced_closeout_ref_ambiguous',
      ref: metadataRef(references[0] ?? {}) ?? 'missing',
      details: { reference_count: references.length },
    });
  }
  const reference = references[0];
  const ref = metadataRef(reference);
  if (!ref) {
    hydrationError({
      message: 'Referenced closeout metadata must include an exact ref.',
      blockedReason: 'referenced_closeout_ref_missing',
      ref: 'missing',
    });
  }
  const declaredSize = reference.size_bytes;
  if (
    declaredSize !== undefined
    && (!Number.isSafeInteger(declaredSize) || (declaredSize as number) < 0)
  ) {
    hydrationError({
      message: 'Referenced closeout metadata size must be a non-negative safe integer.',
      blockedReason: 'referenced_closeout_size_invalid',
      ref,
    });
  }
  const observation = observeReferencedCloseout({
    ref,
    sha256: canonicalSha256(reference.sha256, ref),
    sizeBytes: declaredSize as number | undefined,
    workspaceRoot: input.workspaceRoot,
  });

  let hydratedCandidate: unknown;
  let hydratedCloseout: TypedStageCloseoutPacket;
  try {
    hydratedCandidate = parseJsonText(observation.bytes.toString('utf8'));
    hydratedCloseout = normalizeTypedStageCloseoutPacket(hydratedCandidate);
  } catch (error) {
    hydrationError({
      message: 'Referenced closeout file is not a valid typed Stage Attempt closeout packet.',
      blockedReason: 'referenced_closeout_packet_invalid',
      ref,
      details: { cause: error instanceof Error ? error.message : String(error) },
    });
  }
  if (!isRecord(hydratedCandidate) || hydratedCloseout.surface_kind !== 'stage_attempt_closeout_packet') {
    hydrationError({
      message: 'Referenced closeout file must use surface_kind=stage_attempt_closeout_packet.',
      blockedReason: 'referenced_closeout_surface_kind_invalid',
      ref,
    });
  }
  assertAttemptIdentity({ candidate: hydratedCandidate, attempt: input.attempt, ref, source: 'referenced_packet' });
  if (input.resumedCandidate) {
    assertAttemptIdentity({ candidate: input.resumedCandidate, attempt: input.attempt, ref, source: 'resume_packet' });
  }
  assertExplicitFieldCompatibility({ hydratedCandidate, resumedCandidate: input.resumedCandidate, ref });
  assertPreservedRouteCompatibility({
    hydratedCandidate,
    preservedRouteImpact: input.preservedRouteImpact,
    ref,
  });

  const routeImpact = Object.hasOwn(hydratedCandidate, 'route_impact')
    ? hydratedCloseout.route_impact
    : input.resumedCloseout.route_impact;
  const authorityBoundary = Object.hasOwn(hydratedCandidate, 'authority_boundary')
    ? hydratedCloseout.authority_boundary
    : input.resumedCloseout.authority_boundary;
  const mergedCloseout = normalizeTypedStageCloseoutPacket({
    ...input.resumedCloseout,
    ...hydratedCloseout,
    stage_attempt_id: optionalString(input.attempt.stage_attempt_id),
    closeout_refs: uniqueStrings(hydratedCloseout.closeout_refs, input.resumedCloseout.closeout_refs),
    closeout_ref_metadata: mergeCloseoutMetadata([
      hydratedCloseout.closeout_ref_metadata ?? [],
      input.resumedCloseout.closeout_ref_metadata ?? [],
    ], observation),
    consumed_refs: uniqueStrings(hydratedCloseout.consumed_refs, input.resumedCloseout.consumed_refs),
    consumed_memory_refs: uniqueStrings(
      hydratedCloseout.consumed_memory_refs,
      input.resumedCloseout.consumed_memory_refs,
    ),
    writeback_receipt_refs: uniqueStrings(
      hydratedCloseout.writeback_receipt_refs,
      input.resumedCloseout.writeback_receipt_refs,
    ),
    rejected_writes: uniqueRecords(hydratedCloseout.rejected_writes, input.resumedCloseout.rejected_writes),
    ...(routeImpact ? { route_impact: routeImpact } : {}),
    authority_boundary: authorityBoundary,
  });
  return {
    status: 'hydrated' as const,
    closeoutPacket: mergedCloseout,
    observation: {
      ref: observation.ref,
      sha256: observation.sha256,
      size_bytes: observation.size_bytes,
    },
  };
}

export function resolveProtocolCloseoutResumePacket(input: {
  initialCandidate: JsonRecord | null;
  resumedCandidate: JsonRecord | null;
  resumedCloseout: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
  workspaceRoot: string;
  protocolViolation: boolean;
}) {
  const merged = mergeInitialRouteImpact(input);
  const hydrated = input.protocolViolation
    ? { status: 'not_applicable' as const, closeoutPacket: merged.closeoutPacket, observation: null }
    : hydrateReferencedStageAttemptCloseout({
        resumedCloseout: merged.closeoutPacket,
        resumedCandidate: input.resumedCandidate,
        attempt: input.attempt,
        workspaceRoot: input.workspaceRoot,
        preservedRouteImpact: merged.initialRouteImpactPreserved
          ? merged.closeoutPacket?.route_impact
          : null,
      });
  return {
    closeoutPacket: hydrated.closeoutPacket,
    hydrationStatus: hydrated.status,
    observation: hydrated.observation,
    initialRouteImpactPreserved: merged.initialRouteImpactPreserved
      || (hydrated.status === 'hydrated' && Boolean(hydrated.closeoutPacket?.route_impact)),
  };
}
