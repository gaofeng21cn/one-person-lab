import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  parseTerminalJsonRecordFromCodexMessages,
} from '../family-runtime-codex-stage-runner/session-closeout-recovery.ts';
import {
  hydrateReferencedStageAttemptCloseout,
} from '../family-runtime-codex-stage-runner/referenced-closeout-hydration.ts';
import {
  normalizeTypedStageCloseoutPacket,
} from '../family-runtime-codex-stage-runner/closeout-normalization.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function canonicalHash(value: unknown, field: string) {
  const text = requireString(value, field).toLowerCase();
  const match = text.match(/^(?:sha256:)?([a-f0-9]{64})$/);
  if (!match) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a canonical SHA-256 digest.`, { field });
  }
  return `sha256:${match[1]}`;
}

function canonicalArtifactRef(value: unknown, attempt: JsonRecord) {
  const ref = requireString(value, 'artifact_refs[]');
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return ref;
  }
  const executionScope = record(attempt.execution_scope);
  const root = requireString(
    executionScope.canonical_work_item_root,
    'attempt.execution_scope.canonical_work_item_root',
  );
  const resolved = path.resolve(root, ref);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered artifact ref escapes the canonical work-item root.',
      { artifact_ref: ref, canonical_work_item_root: root },
    );
  }
  return pathToFileURL(resolved).href;
}

export function artifactIdentity(candidate: JsonRecord, attempt: JsonRecord) {
  const routeImpact = record(candidate.route_impact);
  const quality = record(routeImpact.stage_quality_cycle);
  let refs = Array.isArray(quality.artifact_refs) ? quality.artifact_refs : [];
  let hashes = Array.isArray(quality.artifact_hashes) ? quality.artifact_hashes : [];
  // A typed closeout may already be accepted and carry the producer artifact
  // identity in its refs-only metadata, without duplicating a quality envelope.
  // Treat that persisted identity as the recovery input, then let the normal
  // byte verification path issue fresh transport receipts.
  if (refs.length === 0 && hashes.length === 0) {
    const closeoutRefs = Array.isArray(candidate.closeout_refs) ? candidate.closeout_refs : [];
    const metadata = Array.isArray(candidate.closeout_ref_metadata)
      ? candidate.closeout_ref_metadata.filter((entry): entry is JsonRecord => (
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
      ))
      : [];
    const pairs = closeoutRefs.map((ref) => {
      const entry = metadata.find((item) => item.ref === ref || item.uri === ref);
      return {
        ref,
        hash: entry?.sha256,
      };
    });
    if (pairs.length > 0 && pairs.every((pair) => typeof pair.ref === 'string' && typeof pair.hash === 'string')) {
      refs = pairs.map((pair) => pair.ref);
      hashes = pairs.map((pair) => pair.hash);
    }
  }
  if (refs.length === 0 && hashes.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered closeout does not contain producer artifact identity.',
      { failure_code: 'stage_quality_attempt_without_consumable_artifact' },
    );
  }
  if (refs.length !== hashes.length || refs.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovered producer artifact refs and hashes must have equal non-zero cardinality.',
      { artifact_ref_count: refs.length, artifact_hash_count: hashes.length },
    );
  }
  return {
    artifact_refs: refs.map((ref) => canonicalArtifactRef(ref, attempt)),
    artifact_hashes: hashes.map((hash) => canonicalHash(hash, 'artifact_hashes[]')),
  };
}

export function canonicalCloseoutMetadata(
  packet: JsonRecord,
  identity: { artifact_refs: string[]; artifact_hashes: string[] },
) {
  const existing = Array.isArray(packet.closeout_ref_metadata)
    ? packet.closeout_ref_metadata.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
  const metadata = existing.map((entry) => ({ ...entry }));
  const used = new Set<number>();
  for (let index = 0; index < identity.artifact_refs.length; index += 1) {
    const ref = identity.artifact_refs[index];
    const hash = identity.artifact_hashes[index];
    let metadataIndex = metadata.findIndex((entry, candidateIndex) => (
      !used.has(candidateIndex)
      && (entry.ref === ref || entry.uri === ref)
    ));
    if (metadataIndex < 0) {
      metadataIndex = metadata.findIndex((entry, candidateIndex) => (
        !used.has(candidateIndex)
        && typeof entry.sha256 === 'string'
        && canonicalHash(entry.sha256, 'closeout_ref_metadata.sha256') === hash
      ));
    }
    if (metadataIndex < 0) {
      metadata.push({ ref_kind: 'artifact', kind: 'stage_artifact', ref, sha256: hash });
      metadataIndex = metadata.length - 1;
    } else {
      metadata[metadataIndex] = {
        ...metadata[metadataIndex],
        ref,
        sha256: hash,
      };
    }
    used.add(metadataIndex);
  }
  return metadata;
}

function parseRawOutput(rawOutputRef: string, input: {
  attempt: JsonRecord;
  latestCloseoutPacket: JsonRecord;
}) {
  let filePath: string;
  try {
    filePath = fileURLToPath(rawOutputRef);
  } catch {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output ref is not a local file URL.', {
      failure_code: 'raw_executor_output_recovery_failed',
      artifact_ref: rawOutputRef,
    });
  }
  let bytes: string;
  try {
    bytes = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output bytes could not be read.', {
      failure_code: 'raw_executor_output_recovery_failed',
      artifact_ref: rawOutputRef,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let parsed: unknown;
  try {
    parsed = parseJsonText(bytes);
  } catch (error) {
    // Codex may return a readable conclusion around one terminal JSON object.
    // Recovery is byte-bound to the immutable raw artifact, so select only the
    // single JSON object embedded in that same artifact; never rewrite it or
    // infer fields from the surrounding prose.
    parsed = parseTerminalJsonRecordFromCodexMessages([bytes]);
    if (!parsed) {
      // The Attempt runner may already have accepted a typed closeout through
      // protocol_closeout_resume while the immutable raw artifact remains the
      // producer's earlier readable summary. In that case the persisted
      // closeout is already byte- and Attempt-bound by ingest, so it is the
      // narrow recovery source of truth. Referenced-packet hydration remains
      // available when the persisted packet intentionally carries only that
      // reference.
      const persistedMetadata = Array.isArray(input.latestCloseoutPacket.closeout_ref_metadata)
        ? input.latestCloseoutPacket.closeout_ref_metadata
        : [];
      const referencedPacketMetadata = persistedMetadata.filter((entry) => (
        record(entry).kind === 'stage_attempt_closeout_packet'
      ));
      const persistedCloseout = normalizeTypedStageCloseoutPacket({
        ...input.latestCloseoutPacket,
        // Keep the accepted typed closeout's artifact metadata when it does
        // not reference another packet. For a referenced packet, retain the
        // existing isolation rule and hydrate that packet separately.
        closeout_ref_metadata: referencedPacketMetadata.length > 0
          ? referencedPacketMetadata
          : persistedMetadata,
      });
      const hydrated = hydrateReferencedStageAttemptCloseout({
        resumedCloseout: persistedCloseout,
        // The persisted transport packet already contains OPL-added artifact
        // identities, while the referenced packet is the producer-owned body.
        // Re-verify the reference and Attempt identity without treating those
        // transport additions as a conflicting second semantic assertion.
        resumedCandidate: null,
        attempt: input.attempt,
        workspaceRoot: requireString(
          record(input.attempt.execution_scope).workspace_root,
          'attempt.execution_scope.workspace_root',
        ),
      });
      if (hydrated.status === 'hydrated' && hydrated.closeoutPacket) {
        parsed = hydrated.closeoutPacket;
      } else if (hydrated.status === 'not_applicable' && persistedCloseout) {
        parsed = persistedCloseout;
      }
    }
    if (!parsed) {
      throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output is not valid JSON.', {
        failure_code: 'raw_executor_output_recovery_failed',
        artifact_ref: rawOutputRef,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Recovered raw output must be a JSON object.', {
      failure_code: 'raw_executor_output_recovery_failed',
      artifact_ref: rawOutputRef,
    });
  }
  const pointer = parsed as JsonRecord;
  const quality = record(record(pointer.route_impact).stage_quality_cycle);
  const recoveryRefs = Array.isArray(quality.artifact_refs) && quality.artifact_refs.length > 0
    ? quality.artifact_refs
    : Array.isArray(pointer.closeout_refs) ? pointer.closeout_refs : [];
  // A persisted transport projection may replace the raw envelope's authority
  // marker. Its verified raw bytes still cannot become a domain repair artifact.
  if (recoveryRefs.length > 0 && recoveryRefs.every((ref) => ref === rawOutputRef)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Recovery requires a domain closeout; raw executor progress is not a domain artifact. Recover the existing domain-artifact Attempt or obtain its owner closeout.',
      {
        failure_code: 'stage_run_recovery_domain_closeout_required',
        stage_attempt_id: input.attempt.stage_attempt_id,
        next_owner: input.attempt.domain_id,
        artifact_ref: rawOutputRef,
        raw_artifact_is_domain_evidence: false,
      },
    );
  }
  const typedReferenceEntries = [
    ...(Array.isArray(pointer.closeout_refs) ? pointer.closeout_refs : []),
    ...(Array.isArray(pointer.closeout_ref_metadata) ? pointer.closeout_ref_metadata : []),
  ];
  if (typedReferenceEntries.some((entry) => record(entry).kind === 'stage_attempt_closeout_packet')) {
    // A typed terminal envelope may carry only exact packet metadata. Its
    // successful JSON parse does not make it the producer artifact body.
    // Normalization includes metadata refs in the transport refs; hydration
    // then verifies the same bytes and Attempt identity as ordinary closeout.
    const hydrated = hydrateReferencedStageAttemptCloseout({
      resumedCloseout: normalizeTypedStageCloseoutPacket(pointer),
      resumedCandidate: pointer,
      attempt: input.attempt,
      workspaceRoot: requireString(
        record(input.attempt.execution_scope).workspace_root,
        'attempt.execution_scope.workspace_root',
      ),
    });
    if (hydrated.status === 'hydrated' && hydrated.closeoutPacket) {
      return hydrated.closeoutPacket as JsonRecord;
    }
  }
  if ('closeout_packet_ref' in pointer || 'closeout_packet_sha256' in pointer) {
    const packetRef = requireString(pointer.closeout_packet_ref, 'closeout_packet_ref');
    const hydrated = hydrateReferencedStageAttemptCloseout({
      resumedCloseout: normalizeTypedStageCloseoutPacket({
        ...input.latestCloseoutPacket,
        closeout_refs: [...new Set([
          ...(Array.isArray(input.latestCloseoutPacket.closeout_refs) ? input.latestCloseoutPacket.closeout_refs : []),
          packetRef,
        ])],
        closeout_ref_metadata: [{
          kind: 'stage_attempt_closeout_packet',
          ref: packetRef,
          sha256: canonicalHash(pointer.closeout_packet_sha256, 'closeout_packet_sha256'),
        }],
      }),
      resumedCandidate: null,
      attempt: input.attempt,
      workspaceRoot: requireString(
        record(input.attempt.execution_scope).workspace_root,
        'attempt.execution_scope.workspace_root',
      ),
    });
    if (hydrated.status === 'hydrated' && hydrated.closeoutPacket) {
      return hydrated.closeoutPacket as JsonRecord;
    }
  }
  return parsed as JsonRecord;
}

export function parseRawOutputForCloseoutRecovery(rawOutputRef: string, input: {
  attempt: JsonRecord;
  latestCloseoutPacket: JsonRecord;
}) {
  return parseRawOutput(rawOutputRef, input);
}
