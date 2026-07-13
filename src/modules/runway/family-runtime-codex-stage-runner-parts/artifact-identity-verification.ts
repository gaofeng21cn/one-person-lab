import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { stringValue as optionalString } from '../../../kernel/json-record.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import type { TypedStageCloseoutPacket } from './closeout-normalization.ts';
import { isRecord, type JsonRecord } from './shared.ts';

const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

type OplTransportArtifactIdentityReceipt = {
  surface_kind: 'opl_transport_artifact_identity_receipt';
  version: 'opl-transport-artifact-identity-receipt.v1';
  domain_id: string;
  stage_attempt_id: string;
  artifact_ref: string;
  sha256: string;
  size_bytes: number | null;
};

function canonicalSha256(value: unknown, field: string) {
  const normalized = optionalString(value);
  const match = normalized?.match(SHA256_PATTERN);
  if (!match) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a canonical SHA-256 digest.`, {
      field,
      hard_stop_class: 'stale_or_mismatched_stage_identity',
      blocked_reason: 'artifact_byte_identity_mismatch',
    });
  }
  return match[1].toLowerCase();
}

function artifactIdentityError(input: {
  message: string;
  blockedReason: string;
  hardStopClass?: 'authority_boundary_violation' | 'stale_or_mismatched_stage_identity';
  artifactRef: string;
  details?: Record<string, unknown>;
}) {
  return new FrameworkContractError('contract_shape_invalid', input.message, {
    hard_stop_class: input.hardStopClass ?? 'stale_or_mismatched_stage_identity',
    blocked_reason: input.blockedReason,
    artifact_ref: input.artifactRef,
    ...(input.details ?? {}),
  });
}

function localPathForRef(ref: string, workspaceRoot: string) {
  if (ref.startsWith('file://')) {
    try {
      return fileURLToPath(ref);
    } catch {
      throw artifactIdentityError({
        message: 'Artifact file URL is invalid.',
        blockedReason: 'artifact_ref_unreadable',
        artifactRef: ref,
      });
    }
  }
  if (path.isAbsolute(ref)) return ref;
  if (URI_SCHEME_PATTERN.test(ref)) return null;
  return path.resolve(workspaceRoot, ref);
}

function readBoundedFile(filePath: string, artifactRef: string) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw artifactIdentityError({
      message: 'Artifact identity points to an unreadable local file.',
      blockedReason: 'artifact_ref_unreadable',
      artifactRef,
      details: { resolved_path: filePath },
    });
  }
  if (!stat.isFile()) {
    throw artifactIdentityError({
      message: 'Artifact identity must point to a regular local file.',
      blockedReason: 'artifact_ref_unreadable',
      artifactRef,
      details: { resolved_path: filePath },
    });
  }
  return fs.readFileSync(filePath);
}

function safeAttemptDirectory(attemptId: string) {
  const readable = attemptId.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'attempt';
  const digest = crypto.createHash('sha256').update(attemptId).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

function persistTransportIdentityReceipt(input: OplTransportArtifactIdentityReceipt) {
  const state = ensureOplStateDir();
  const receiptDir = path.join(
    state.state_dir,
    'runtime-state',
    'stage-artifact-identities',
    safeAttemptDirectory(input.stage_attempt_id),
  );
  fs.mkdirSync(receiptDir, { recursive: true });
  const refDigest = crypto.createHash('sha256').update(input.artifact_ref).digest('hex');
  const receiptPath = path.join(receiptDir, `${refDigest}-${input.sha256}.json`);
  const temporaryPath = `${receiptPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, receiptPath);
  return pathToFileURL(receiptPath).href;
}

function readDomainIdentityReceipt(input: {
  receiptRef: string;
  workspaceRoot: string;
  artifactRef: string;
}) {
  const receiptPath = localPathForRef(input.receiptRef, input.workspaceRoot);
  if (!receiptPath) {
    throw artifactIdentityError({
      message: 'External artifact identity receipt must be locally readable by the transport.',
      blockedReason: 'artifact_identity_receipt_unverifiable_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: { artifact_identity_receipt_ref: input.receiptRef },
    });
  }
  const bytes = readBoundedFile(receiptPath, input.artifactRef);
  if (bytes.length > 1024 * 1024) {
    throw artifactIdentityError({
      message: 'External artifact identity receipt exceeds the transport verification limit.',
      blockedReason: 'artifact_identity_receipt_unverifiable_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: { artifact_identity_receipt_ref: input.receiptRef },
    });
  }
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isRecord(parsed)) throw new Error('receipt is not an object');
    return parsed;
  } catch (error) {
    throw artifactIdentityError({
      message: 'External artifact identity receipt is not valid JSON.',
      blockedReason: 'artifact_identity_receipt_unverifiable_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: {
        artifact_identity_receipt_ref: input.receiptRef,
        receipt_error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function verifyExternalIdentityReceipt(input: {
  receiptRef: string;
  workspaceRoot: string;
  attempt: JsonRecord;
  artifactRef: string;
  artifactSha256: string;
}) {
  const receipt = readDomainIdentityReceipt(input);
  const expectedDomainId = optionalString(input.attempt.domain_id) ?? 'unknown-domain';
  const expectedAttemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';
  const valid = receipt.surface_kind === 'domain_artifact_identity_receipt'
    && receipt.version === 'domain-artifact-identity-receipt.v1'
    && receipt.domain_id === expectedDomainId
    && receipt.stage_attempt_id === expectedAttemptId
    && receipt.artifact_ref === input.artifactRef
    && canonicalSha256(receipt.sha256, 'artifact_identity_receipt.sha256') === input.artifactSha256
    && (receipt.size_bytes === undefined
      || (typeof receipt.size_bytes === 'number' && Number.isSafeInteger(receipt.size_bytes) && receipt.size_bytes >= 0));
  if (!valid) {
    throw artifactIdentityError({
      message: 'External artifact identity receipt does not exactly bind the producing Attempt and artifact identity.',
      blockedReason: 'artifact_identity_receipt_mismatch_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: { artifact_identity_receipt_ref: input.receiptRef },
    });
  }
}

export function verifyStageQualityCloseoutArtifactIdentity(input: {
  closeoutPacket: TypedStageCloseoutPacket | null;
  attempt: JsonRecord;
  workspaceRoot: string;
}) {
  const closeoutPacket = input.closeoutPacket;
  const attemptRole = optionalString(input.attempt.attempt_role);
  if (!closeoutPacket || (attemptRole !== 'producer' && attemptRole !== 'repairer')) {
    return closeoutPacket;
  }
  const routeImpact = isRecord(closeoutPacket.route_impact) ? closeoutPacket.route_impact : {};
  const qualityEnvelope = isRecord(routeImpact.stage_quality_cycle) ? routeImpact.stage_quality_cycle : {};
  const artifactRefs = Array.isArray(qualityEnvelope.artifact_refs)
    ? qualityEnvelope.artifact_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      .map((entry) => entry.trim())
    : [];
  const artifactHashes = Array.isArray(qualityEnvelope.artifact_hashes)
    ? qualityEnvelope.artifact_hashes.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      .map((entry) => entry.trim())
    : [];
  if (artifactRefs.length === 0 && artifactHashes.length === 0) return closeoutPacket;
  if (artifactRefs.length !== artifactHashes.length) {
    throw artifactIdentityError({
      message: 'Stage quality artifact refs and hashes must have equal cardinality.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: artifactRefs[0] ?? 'missing',
      details: { artifact_ref_count: artifactRefs.length, artifact_hash_count: artifactHashes.length },
    });
  }

  const metadata = [...(closeoutPacket.closeout_ref_metadata ?? [])];
  const nextMetadata = artifactRefs.map((artifactRef, index) => {
    const declaredSha256 = canonicalSha256(artifactHashes[index], 'route_impact.stage_quality_cycle.artifact_hashes');
    const metadataIndex = metadata.findIndex((entry) => entry.ref === artifactRef || entry.uri === artifactRef);
    const entry = metadataIndex >= 0 ? metadata[metadataIndex] : null;
    if (!entry || canonicalSha256(entry.sha256, 'closeout_ref_metadata.sha256') !== declaredSha256) {
      throw artifactIdentityError({
        message: 'Stage quality artifact identity must match closeout metadata before transport verification.',
        blockedReason: 'artifact_byte_identity_mismatch',
        artifactRef,
      });
    }

    const localPath = localPathForRef(artifactRef, input.workspaceRoot);
    if (localPath) {
      const bytes = readBoundedFile(localPath, artifactRef);
      const observedSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if (observedSha256 !== declaredSha256) {
        throw artifactIdentityError({
          message: 'Stage quality artifact SHA does not match the final local file bytes.',
          blockedReason: 'artifact_byte_identity_mismatch',
          artifactRef,
          details: { declared_sha256: declaredSha256, observed_sha256: observedSha256 },
        });
      }
      if (typeof entry.size_bytes === 'number' && entry.size_bytes !== bytes.length) {
        throw artifactIdentityError({
          message: 'Stage quality artifact size does not match the final local file bytes.',
          blockedReason: 'artifact_byte_identity_mismatch',
          artifactRef,
          details: { declared_size_bytes: entry.size_bytes, observed_size_bytes: bytes.length },
        });
      }
      const receiptRef = persistTransportIdentityReceipt({
        surface_kind: 'opl_transport_artifact_identity_receipt',
        version: 'opl-transport-artifact-identity-receipt.v1',
        domain_id: optionalString(input.attempt.domain_id) ?? 'unknown-domain',
        stage_attempt_id: optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt',
        artifact_ref: artifactRef,
        sha256: observedSha256,
        size_bytes: bytes.length,
      });
      return {
        ...entry,
        ref: artifactRef,
        sha256: observedSha256,
        size_bytes: bytes.length,
        artifact_identity_receipt_ref: receiptRef,
      };
    }

    const receiptRef = optionalString(entry.artifact_identity_receipt_ref);
    if (!receiptRef) {
      throw artifactIdentityError({
        message: 'External Stage quality artifact requires an independent domain artifact identity receipt.',
        blockedReason: 'artifact_identity_receipt_missing_authority_violation',
        hardStopClass: 'authority_boundary_violation',
        artifactRef,
      });
    }
    verifyExternalIdentityReceipt({
      receiptRef,
      workspaceRoot: input.workspaceRoot,
      attempt: input.attempt,
      artifactRef,
      artifactSha256: declaredSha256,
    });
    return entry;
  });

  for (let index = 0; index < artifactRefs.length; index += 1) {
    const metadataIndex = metadata.findIndex(
      (entry) => entry.ref === artifactRefs[index] || entry.uri === artifactRefs[index],
    );
    metadata[metadataIndex] = nextMetadata[index];
  }
  return {
    ...closeoutPacket,
    closeout_ref_metadata: metadata,
  };
}
