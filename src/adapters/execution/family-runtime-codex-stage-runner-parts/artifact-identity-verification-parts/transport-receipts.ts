import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stringValue as optionalString } from '../../../../kernel/json-record.ts';
import { ensureOplStateDir } from '../../../../kernel/runtime-state-paths.ts';
import {
  readStableWorkItemFile,
  type WorkItemRootIdentity,
  WorkItemFileBoundaryError,
} from '../../../../authority/workspace/index.ts';
import { isRecord } from '../shared.ts';
import {
  artifactIdentityError,
  canonicalSha256,
  type ArtifactExecutionIdentity,
  type OplTransportArtifactIdentityReceipt,
} from './identity-contract.ts';
import {
  localPathForRef,
  observeStableFile,
  type StableFileObservation,
} from './file-observation.ts';

const RECEIPT_FILENAME_PATTERN = /^([a-f0-9]{64})\.json$/i;
const MAX_RECEIPT_BYTES = 1024 * 1024;
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

export function prepareTransportIdentityReceipt(input: OplTransportArtifactIdentityReceipt) {
  const receiptDir = path.join(
    transportIdentityReceiptRoot(),
    safeIdentityDirectory(input.stage_attempt_id, 'attempt'),
  );
  fs.mkdirSync(receiptDir, { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(input, null, 2)}\n`, 'utf8');
  const receiptDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  const receiptPath = path.join(receiptDir, `${receiptDigest}.json`);
  return {
    commit() {
      let created = false;
      if (!fs.existsSync(receiptPath)) {
        const temporaryPath = `${receiptPath}.${process.pid}.tmp`;
        fs.writeFileSync(temporaryPath, bytes);
        fs.renameSync(temporaryPath, receiptPath);
        created = true;
      }
      return {
        receiptRef: pathToFileURL(receiptPath).href,
        rollback() {
          if (created) fs.rmSync(receiptPath, { force: true });
        },
      };
    },
  };
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

export function verifyIdentityReceipt(input: {
  receiptRef: string;
  workspaceRoot: string;
  domainId: string;
  expectedAttemptId?: string;
  expectedIdentity: ArtifactExecutionIdentity;
  artifactRef: string;
  artifactSha256: string;
}) {
  const receipt = readTrustedIdentityReceipt(input);
  const isTransportReceipt = receipt.surface_kind === 'opl_transport_artifact_identity_receipt';
  const expectedVersion = isTransportReceipt
    ? 'opl-transport-artifact-identity-receipt.v1'
    : 'domain-artifact-identity-receipt.v1';
  const receiptAttemptId = optionalString(receipt.stage_attempt_id);
  const receiptStageRunId = optionalString(receipt.stage_run_id);
  const receiptScopeKind = optionalString(receipt.scope_kind)
    ?? (optionalString(receipt.scope_digest) || optionalString(receipt.work_item_scope_id)
      ? 'work_item'
      : 'domain');
  const expectedScope = input.expectedIdentity.executionScope;
  const receiptScopeMatches = expectedScope
    ? receiptScopeKind === 'work_item'
      && receipt.work_item_scope_id === expectedScope.work_item_scope_id
      && receipt.scope_digest === expectedScope.scope_digest
    : receiptScopeKind === input.expectedIdentity.scopeKind
      && !optionalString(receipt.work_item_scope_id)
      && !optionalString(receipt.scope_digest);
  const valid = receipt.version === expectedVersion
    && receipt.domain_id === input.domainId
    && Boolean(receiptAttemptId)
    && (!input.expectedAttemptId || receiptAttemptId === input.expectedAttemptId)
    && receiptStageRunId === input.expectedIdentity.stageRunId
    && receiptScopeMatches
    && receipt.artifact_ref === input.artifactRef
    && canonicalSha256(receipt.sha256, 'artifact_identity_receipt.sha256') === input.artifactSha256
    && (receipt.size_bytes === null
      || receipt.size_bytes === undefined
      || (typeof receipt.size_bytes === 'number' && Number.isSafeInteger(receipt.size_bytes) && receipt.size_bytes >= 0));
  if (!valid) {
    throw artifactIdentityError({
      message: 'Artifact identity receipt does not exactly bind the domain, StageRun, scope, producing Attempt, ref, and hash.',
      blockedReason: 'artifact_identity_receipt_mismatch_authority_violation',
      hardStopClass: 'authority_boundary_violation',
      artifactRef: input.artifactRef,
      details: {
        artifact_identity_receipt_ref: input.receiptRef,
        expected_stage_run_id: input.expectedIdentity.stageRunId,
        actual_stage_run_id: receiptStageRunId,
        expected_scope_kind: input.expectedIdentity.scopeKind,
        actual_scope_kind: receiptScopeKind,
        expected_work_item_scope_id: expectedScope?.work_item_scope_id ?? null,
        actual_work_item_scope_id: optionalString(receipt.work_item_scope_id),
        expected_scope_digest: expectedScope?.scope_digest ?? null,
        actual_scope_digest: optionalString(receipt.scope_digest),
      },
    });
  }
  return receipt;
}

export function exactArtifactPairs(input: {
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

export function verifyCurrentArtifactBytes(input: {
  artifactRef: string;
  artifactSha256: string;
  workspaceRoot: string;
  declaredSizeBytes?: number | null;
  canonicalWorkItemRoot?: string | null;
  canonicalWorkItemRootIdentity?: WorkItemRootIdentity | null;
  scopeWorkspaceRoot?: string | null;
}) {
  const localPath = localPathForRef(input.artifactRef, input.workspaceRoot);
  if (!localPath) return null;
  let observed: StableFileObservation;
  if (input.canonicalWorkItemRoot) {
    if (!input.canonicalWorkItemRootIdentity) {
      throw artifactIdentityError({
        message: 'Canonical work-item root is missing its frozen physical identity.',
        blockedReason: 'artifact_work_item_root_identity_drift_authority_violation',
        hardStopClass: 'authority_boundary_violation',
        artifactRef: input.artifactRef,
        details: { canonical_work_item_root: input.canonicalWorkItemRoot },
      });
    }
    try {
      const scoped = readStableWorkItemFile({
        workspaceRoot: input.scopeWorkspaceRoot ?? input.workspaceRoot,
        canonicalWorkItemRoot: input.canonicalWorkItemRoot,
        expectedRootIdentity: input.canonicalWorkItemRootIdentity,
        filePath: localPath,
        ref: input.artifactRef,
      });
      observed = {
        sha256: scoped.sha256.slice('sha256:'.length),
        sizeBytes: scoped.byte_size,
        bytes: null,
      };
    } catch (error) {
      if (!(error instanceof WorkItemFileBoundaryError)) throw error;
      if (
        error.failureCode === 'work_item_file_boundary_escape'
        || error.failureCode === 'work_item_file_boundary_ref_invalid'
      ) {
        throw artifactIdentityError({
          message: 'Work-item artifact bytes are outside the canonical work-item root.',
          blockedReason: 'artifact_ref_outside_work_item_root_authority_violation',
          hardStopClass: 'authority_boundary_violation',
          artifactRef: input.artifactRef,
          details: {
            resolved_path: localPath,
            canonical_work_item_root: input.canonicalWorkItemRoot,
            boundary_failure_code: error.failureCode,
          },
        });
      }
      if (error.failureCode === 'work_item_file_boundary_ref_unreadable') {
        throw artifactIdentityError({
          message: 'Artifact identity points to an unreadable local file.',
          blockedReason: 'artifact_ref_unreadable',
          artifactRef: input.artifactRef,
          details: {
            resolved_path: localPath,
            boundary_failure_code: error.failureCode,
          },
        });
      }
      if (error.failureCode === 'work_item_file_boundary_ref_drift') {
        throw artifactIdentityError({
          message: 'Artifact bytes changed while their identity was being verified.',
          blockedReason: 'artifact_changed_during_identity_verification',
          artifactRef: input.artifactRef,
          details: {
            resolved_path: localPath,
            boundary_failure_code: error.failureCode,
          },
        });
      }
      throw artifactIdentityError({
        message: 'Canonical work-item root or artifact path changed after execution scope freeze.',
        blockedReason: 'artifact_work_item_root_identity_drift_authority_violation',
        hardStopClass: 'authority_boundary_violation',
        artifactRef: input.artifactRef,
        details: {
          resolved_path: localPath,
          canonical_work_item_root: input.canonicalWorkItemRoot,
          boundary_failure_code: error.failureCode,
        },
      });
    }
  } else {
    observed = observeStableFile({ filePath: localPath, artifactRef: input.artifactRef });
  }
  if (observed.sha256 !== input.artifactSha256) {
    throw artifactIdentityError({
      message: 'Stage quality artifact SHA does not match the current stable local file bytes.',
      blockedReason: 'artifact_byte_identity_mismatch',
      artifactRef: input.artifactRef,
      details: { declared_sha256: input.artifactSha256, observed_sha256: observed.sha256 },
    });
  }
  // A model-declared size_bytes is derived metadata, not identity. sha256 is the
  // identity anchor: when the declared hash matches the current stable local bytes,
  // the bytes are proven complete and a stale size declaration (run ibd-oma-create-20:
  // producer declared 26486/6075 vs actual 20063/3831 with identical hashes) must not
  // fail the closeout. Callers record the observed size into the verified metadata and
  // the transport identity receipt, so the stale value never propagates downstream.
  // Same contract family as the reviewer snapshot fix: stale declared sizes are
  // metadata, not tampering.
  return observed;
}
