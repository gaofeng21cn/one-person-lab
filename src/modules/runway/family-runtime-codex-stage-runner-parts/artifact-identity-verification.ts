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
const RECEIPT_FILENAME_PATTERN = /^([a-f0-9]{64})\.json$/i;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const FILE_READ_CHUNK_BYTES = 64 * 1024;

type OplTransportArtifactIdentityReceipt = {
  surface_kind: 'opl_transport_artifact_identity_receipt';
  version: 'opl-transport-artifact-identity-receipt.v1';
  domain_id: string;
  stage_attempt_id: string;
  artifact_ref: string;
  sha256: string;
  size_bytes: number | null;
};

type StableFileObservation = {
  sha256: string;
  sizeBytes: number;
  bytes: Buffer | null;
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

function stableStatIdentity(stat: fs.Stats) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}

function observeStableFile(input: {
  filePath: string;
  artifactRef: string;
  captureBytes?: boolean;
  maxBytes?: number;
  authorityReceipt?: boolean;
}): StableFileObservation {
  let descriptor: number | null = null;
  const blockedReason = input.authorityReceipt
    ? 'artifact_identity_receipt_unverifiable_authority_violation'
    : 'artifact_ref_unreadable';
  const hardStopClass = input.authorityReceipt ? 'authority_boundary_violation' as const : undefined;
  try {
    descriptor = fs.openSync(input.filePath, 'r');
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) {
      throw artifactIdentityError({
        message: input.authorityReceipt
          ? 'Artifact identity receipt must be a regular file.'
          : 'Artifact identity must point to a regular local file.',
        blockedReason,
        hardStopClass,
        artifactRef: input.artifactRef,
        details: { resolved_path: input.filePath },
      });
    }
    if (input.maxBytes !== undefined && before.size > input.maxBytes) {
      throw artifactIdentityError({
        message: 'Artifact identity receipt exceeds the transport verification limit.',
        blockedReason,
        hardStopClass,
        artifactRef: input.artifactRef,
        details: { resolved_path: input.filePath, size_bytes: before.size, max_bytes: input.maxBytes },
      });
    }

    const hash = crypto.createHash('sha256');
    const captured: Buffer[] = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(FILE_READ_CHUNK_BYTES);
      const read = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      const bytes = chunk.subarray(0, read);
      total += read;
      if (input.maxBytes !== undefined && total > input.maxBytes) {
        throw artifactIdentityError({
          message: 'Artifact identity receipt exceeds the transport verification limit.',
          blockedReason,
          hardStopClass,
          artifactRef: input.artifactRef,
          details: { resolved_path: input.filePath, observed_size_bytes: total, max_bytes: input.maxBytes },
        });
      }
      hash.update(bytes);
      if (input.captureBytes) captured.push(Buffer.from(bytes));
    }
    const after = fs.fstatSync(descriptor);
    if (total !== before.size || stableStatIdentity(before) !== stableStatIdentity(after)) {
      throw artifactIdentityError({
        message: input.authorityReceipt
          ? 'Artifact identity receipt changed while it was being verified.'
          : 'Artifact bytes changed while their identity was being verified.',
        blockedReason: input.authorityReceipt
          ? 'artifact_identity_receipt_changed_during_verification'
          : 'artifact_changed_during_identity_verification',
        hardStopClass,
        artifactRef: input.artifactRef,
        details: { resolved_path: input.filePath },
      });
    }
    return {
      sha256: hash.digest('hex'),
      sizeBytes: total,
      bytes: input.captureBytes ? Buffer.concat(captured, total) : null,
    };
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    throw artifactIdentityError({
      message: input.authorityReceipt
        ? 'Artifact identity receipt is not readable by the transport.'
        : 'Artifact identity points to an unreadable local file.',
      blockedReason,
      hardStopClass,
      artifactRef: input.artifactRef,
      details: {
        resolved_path: input.filePath,
        read_error: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function safeIdentityDirectory(value: string, fallback: string) {
  const readable = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || fallback;
  const digest = crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

function transportIdentityReceiptRoot() {
  const state = ensureOplStateDir();
  return path.join(state.state_dir, 'runtime-state', 'stage-artifact-identities');
}

function domainAuthorityReceiptRoot(domainId: string) {
  const state = ensureOplStateDir();
  const configuredRoot = process.env.OPL_DOMAIN_ARTIFACT_IDENTITY_RECEIPT_ROOT?.trim();
  const root = configuredRoot
    ? path.resolve(configuredRoot)
    : path.join(state.state_dir, 'runtime-state', 'domain-artifact-identity-receipts');
  return path.join(root, safeIdentityDirectory(domainId, 'domain'));
}

function persistTransportIdentityReceipt(input: OplTransportArtifactIdentityReceipt) {
  const receiptDir = path.join(
    transportIdentityReceiptRoot(),
    safeIdentityDirectory(input.stage_attempt_id, 'attempt'),
  );
  fs.mkdirSync(receiptDir, { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(input, null, 2)}\n`, 'utf8');
  const receiptDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  const receiptPath = path.join(receiptDir, `${receiptDigest}.json`);
  if (!fs.existsSync(receiptPath)) {
    const temporaryPath = `${receiptPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, bytes);
    fs.renameSync(temporaryPath, receiptPath);
  }
  return pathToFileURL(receiptPath).href;
}

function pathIsInside(filePath: string, rootPath: string) {
  let realFile: string;
  let realRoot: string;
  try {
    realFile = fs.realpathSync(filePath);
    realRoot = fs.realpathSync(rootPath);
  } catch {
    return false;
  }
  const relative = path.relative(realRoot, realFile);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function readTrustedIdentityReceipt(input: {
  receiptRef: string;
  workspaceRoot: string;
  domainId: string;
  artifactRef: string;
}) {
  const receiptPath = localPathForRef(input.receiptRef, input.workspaceRoot);
  if (!receiptPath) {
    throw artifactIdentityError({
      message: 'Artifact identity receipt must be locally readable by the transport.',
      blockedReason: 'artifact_identity_receipt_unverifiable_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: { artifact_identity_receipt_ref: input.receiptRef },
    });
  }
  const inTransportRoot = pathIsInside(receiptPath, transportIdentityReceiptRoot());
  const inDomainRoot = pathIsInside(receiptPath, domainAuthorityReceiptRoot(input.domainId));
  if (!inTransportRoot && !inDomainRoot) {
    throw artifactIdentityError({
      message: 'Artifact identity receipt is outside the trusted transport or configured domain authority root.',
      blockedReason: 'artifact_identity_receipt_untrusted_root_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: {
        artifact_identity_receipt_ref: input.receiptRef,
        expected_domain_authority_root: domainAuthorityReceiptRoot(input.domainId),
      },
    });
  }
  const observed = observeStableFile({
    filePath: receiptPath,
    artifactRef: input.artifactRef,
    captureBytes: true,
    maxBytes: MAX_RECEIPT_BYTES,
    authorityReceipt: true,
  });
  const filenameDigest = path.basename(receiptPath).match(RECEIPT_FILENAME_PATTERN)?.[1]?.toLowerCase();
  if (!filenameDigest || filenameDigest !== observed.sha256) {
    throw artifactIdentityError({
      message: 'Artifact identity receipt filename must bind the exact receipt bytes by SHA-256.',
      blockedReason: 'artifact_identity_receipt_byte_digest_mismatch_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: {
        artifact_identity_receipt_ref: input.receiptRef,
        filename_sha256: filenameDigest ?? null,
        observed_sha256: observed.sha256,
      },
    });
  }
  try {
    const parsed: unknown = JSON.parse(observed.bytes!.toString('utf8'));
    if (!isRecord(parsed)) throw new Error('receipt is not an object');
    const expectedSurface = inTransportRoot
      ? 'opl_transport_artifact_identity_receipt'
      : 'domain_artifact_identity_receipt';
    if (parsed.surface_kind !== expectedSurface) {
      throw new Error(`trusted root requires surface_kind=${expectedSurface}`);
    }
    return parsed;
  } catch (error) {
    throw artifactIdentityError({
      message: 'Artifact identity receipt is not valid authority-bound JSON.',
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

function verifyIdentityReceipt(input: {
  receiptRef: string;
  workspaceRoot: string;
  domainId: string;
  expectedAttemptId?: string;
  artifactRef: string;
  artifactSha256: string;
}) {
  const receipt = readTrustedIdentityReceipt(input);
  const isTransportReceipt = receipt.surface_kind === 'opl_transport_artifact_identity_receipt';
  const expectedVersion = isTransportReceipt
    ? 'opl-transport-artifact-identity-receipt.v1'
    : 'domain-artifact-identity-receipt.v1';
  const receiptAttemptId = optionalString(receipt.stage_attempt_id);
  const valid = receipt.version === expectedVersion
    && receipt.domain_id === input.domainId
    && Boolean(receiptAttemptId)
    && (!input.expectedAttemptId || receiptAttemptId === input.expectedAttemptId)
    && receipt.artifact_ref === input.artifactRef
    && canonicalSha256(receipt.sha256, 'artifact_identity_receipt.sha256') === input.artifactSha256
    && (receipt.size_bytes === null
      || receipt.size_bytes === undefined
      || (typeof receipt.size_bytes === 'number' && Number.isSafeInteger(receipt.size_bytes) && receipt.size_bytes >= 0));
  if (!valid) {
    throw artifactIdentityError({
      message: 'Artifact identity receipt does not exactly bind the domain, producing Attempt, ref, and hash.',
      blockedReason: 'artifact_identity_receipt_mismatch_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: { artifact_identity_receipt_ref: input.receiptRef },
    });
  }
  return receipt;
}

function exactArtifactPairs(input: {
  artifactRefs: unknown;
  artifactHashes: unknown;
  allowEmpty?: boolean;
}) {
  if (!Array.isArray(input.artifactRefs) || !Array.isArray(input.artifactHashes)) {
    throw artifactIdentityError({
      message: 'Stage quality artifact refs and hashes must be arrays of exact pairs.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: 'missing',
    });
  }
  const artifactRefs = input.artifactRefs;
  const artifactHashes = input.artifactHashes;
  if (artifactRefs.length !== artifactHashes.length) {
    throw artifactIdentityError({
      message: 'Stage quality artifact refs and hashes must have equal cardinality.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: optionalString(artifactRefs[0]) ?? 'missing',
      details: {
        artifact_ref_count: artifactRefs.length,
        artifact_hash_count: artifactHashes.length,
      },
    });
  }
  if (!input.allowEmpty && artifactRefs.length === 0) {
    throw artifactIdentityError({
      message: 'Stage quality artifact identity requires at least one exact ref and hash pair.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: 'missing',
    });
  }
  const seenRefs = new Set<string>();
  return artifactRefs.map((rawRef, index) => {
    const artifactRef = optionalString(rawRef);
    if (!artifactRef || seenRefs.has(artifactRef)) {
      throw artifactIdentityError({
        message: 'Stage quality artifact refs must be non-empty and unique while preserving pair order.',
        blockedReason: 'artifact_byte_identity_mismatch',
        artifactRef: artifactRef ?? 'missing',
      });
    }
    seenRefs.add(artifactRef);
    return {
      artifactRef,
      artifactSha256: canonicalSha256(
        artifactHashes[index],
        `artifact_hashes[${index}]`,
      ),
    };
  });
}

function verifyCurrentArtifactBytes(input: {
  artifactRef: string;
  artifactSha256: string;
  workspaceRoot: string;
  declaredSizeBytes?: number | null;
}) {
  const localPath = localPathForRef(input.artifactRef, input.workspaceRoot);
  if (!localPath) return null;
  const observed = observeStableFile({ filePath: localPath, artifactRef: input.artifactRef });
  if (observed.sha256 !== input.artifactSha256) {
    throw artifactIdentityError({
      message: 'Stage quality artifact SHA does not match the current stable local file bytes.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: input.artifactRef,
      details: { declared_sha256: input.artifactSha256, observed_sha256: observed.sha256 },
    });
  }
  if (typeof input.declaredSizeBytes === 'number' && input.declaredSizeBytes !== observed.sizeBytes) {
    throw artifactIdentityError({
      message: 'Stage quality artifact size does not match the current stable local file bytes.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: input.artifactRef,
      details: {
        declared_size_bytes: input.declaredSizeBytes,
        observed_size_bytes: observed.sizeBytes,
      },
    });
  }
  return observed;
}

export function verifyStageQualityArtifactIdentityAtAttemptBoundary(input: {
  artifactRefs: unknown;
  artifactHashes: unknown;
  artifactIdentityReceiptRefs: unknown;
  domainId: string;
  workspaceRoot: string;
  expectedProducingAttemptId: string;
}) {
  const expectedProducingAttemptId = optionalString(input.expectedProducingAttemptId);
  if (!expectedProducingAttemptId) {
    throw artifactIdentityError({
      message: 'Stage quality artifact verification requires the exact producing Attempt identity.',
      blockedReason: 'artifact_identity_producing_attempt_missing_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: optionalString(Array.isArray(input.artifactRefs) ? input.artifactRefs[0] : null) ?? 'missing',
    });
  }
  const pairs = exactArtifactPairs({
    artifactRefs: input.artifactRefs,
    artifactHashes: input.artifactHashes,
    allowEmpty: true,
  });
  if (!Array.isArray(input.artifactIdentityReceiptRefs)
    || input.artifactIdentityReceiptRefs.length !== pairs.length) {
    throw artifactIdentityError({
      message: 'Every Stage quality artifact pair requires exactly one trusted identity receipt.',
      blockedReason: 'artifact_identity_receipt_missing_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: pairs[0]?.artifactRef ?? 'missing',
      details: {
        artifact_pair_count: pairs.length,
        artifact_identity_receipt_count: Array.isArray(input.artifactIdentityReceiptRefs)
          ? input.artifactIdentityReceiptRefs.length
          : null,
      },
    });
  }
  const artifactIdentityReceiptRefs = input.artifactIdentityReceiptRefs;
  const receiptRefs = pairs.map((pair, index) => {
    const receiptRef = optionalString(artifactIdentityReceiptRefs[index]);
    if (!receiptRef) {
      throw artifactIdentityError({
        message: 'Stage quality artifact identity receipt ref must be non-empty.',
        blockedReason: 'artifact_identity_receipt_missing_authority_violation',
        hardStopClass: 'authority_boundary_violation',
        artifactRef: pair.artifactRef,
      });
    }
    const receipt = verifyIdentityReceipt({
      receiptRef,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      expectedAttemptId: expectedProducingAttemptId,
      artifactRef: pair.artifactRef,
      artifactSha256: pair.artifactSha256,
    });
    verifyCurrentArtifactBytes({
      artifactRef: pair.artifactRef,
      artifactSha256: pair.artifactSha256,
      workspaceRoot: input.workspaceRoot,
      declaredSizeBytes: typeof receipt.size_bytes === 'number' ? receipt.size_bytes : null,
    });
    return receiptRef;
  });
  return {
    artifact_refs: pairs.map((pair) => pair.artifactRef),
    artifact_hashes: pairs.map((pair) => pair.artifactSha256),
    artifact_identity_receipt_refs: receiptRefs,
  };
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
  const metadata = [...(closeoutPacket.closeout_ref_metadata ?? [])];
  const rawArtifactMetadata = optionalString(closeoutPacket.authority_boundary.opl)
    === 'raw_executor_output_progress_envelope_only'
    ? metadata.filter((entry) => optionalString(entry.ref_kind) === 'raw_executor_output')
    : [];
  const declaredRefs = Array.isArray(qualityEnvelope.artifact_refs)
    ? qualityEnvelope.artifact_refs
    : rawArtifactMetadata.map((entry) => entry.ref ?? entry.uri);
  const declaredHashes = Array.isArray(qualityEnvelope.artifact_hashes)
    ? qualityEnvelope.artifact_hashes
    : rawArtifactMetadata.map((entry) => entry.sha256);
  if (declaredRefs.length === 0 && declaredHashes.length === 0) return closeoutPacket;
  const pairs = exactArtifactPairs({ artifactRefs: declaredRefs, artifactHashes: declaredHashes });
  const domainId = optionalString(input.attempt.domain_id) ?? 'unknown-domain';
  const attemptId = optionalString(input.attempt.stage_attempt_id) ?? 'unknown-attempt';

  const nextMetadata = pairs.map(({ artifactRef, artifactSha256 }) => {
    const metadataIndex = metadata.findIndex((entry) => entry.ref === artifactRef || entry.uri === artifactRef);
    const entry = metadataIndex >= 0 ? metadata[metadataIndex] : null;
    if (!entry || canonicalSha256(entry.sha256, 'closeout_ref_metadata.sha256') !== artifactSha256) {
      throw artifactIdentityError({
        message: 'Stage quality artifact identity must match closeout metadata before transport verification.',
        blockedReason: 'artifact_byte_identity_mismatch',
        artifactRef,
      });
    }

    const observed = verifyCurrentArtifactBytes({
      artifactRef,
      artifactSha256,
      workspaceRoot: input.workspaceRoot,
      declaredSizeBytes: typeof entry.size_bytes === 'number' ? entry.size_bytes : null,
    });
    if (observed) {
      const receiptRef = persistTransportIdentityReceipt({
        surface_kind: 'opl_transport_artifact_identity_receipt',
        version: 'opl-transport-artifact-identity-receipt.v1',
        domain_id: domainId,
        stage_attempt_id: attemptId,
        artifact_ref: artifactRef,
        sha256: observed.sha256,
        size_bytes: observed.sizeBytes,
      });
      return {
        ...entry,
        ref: artifactRef,
        sha256: observed.sha256,
        size_bytes: observed.sizeBytes,
        artifact_identity_receipt_ref: receiptRef,
      };
    }

    const receiptRef = optionalString(entry.artifact_identity_receipt_ref);
    if (!receiptRef) {
      throw artifactIdentityError({
        message: 'External Stage quality artifact requires an independent domain authority identity receipt.',
        blockedReason: 'artifact_identity_receipt_missing_authority_violation',
        hardStopClass: 'authority_boundary_violation',
        artifactRef,
      });
    }
    verifyIdentityReceipt({
      receiptRef,
      workspaceRoot: input.workspaceRoot,
      domainId,
      expectedAttemptId: attemptId,
      artifactRef,
      artifactSha256,
    });
    return entry;
  });

  for (let index = 0; index < pairs.length; index += 1) {
    const metadataIndex = metadata.findIndex(
      (entry) => entry.ref === pairs[index].artifactRef || entry.uri === pairs[index].artifactRef,
    );
    metadata[metadataIndex] = nextMetadata[index];
  }
  return {
    ...closeoutPacket,
    closeout_ref_metadata: metadata,
    ...(isRecord(routeImpact.stage_quality_cycle)
      ? {
          route_impact: {
            ...routeImpact,
            stage_quality_cycle: {
              ...qualityEnvelope,
              artifact_refs: pairs.map((pair) => pair.artifactRef),
              artifact_hashes: pairs.map((pair) => pair.artifactSha256),
            },
          },
        }
      : {}),
  };
}
