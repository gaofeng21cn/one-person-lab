import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import { readStandardAgentQualityRolePromptFile } from '../../../authority/packages/index.ts';
import {
  readStableWorkItemFile,
  WorkItemFileBoundaryError,
} from '../../../authority/workspace/index.ts';
import type {
  FamilyRuntimeExecutionScopeKind,
  WorkItemExecutionScopeSnapshot,
} from '../family-runtime-execution-scope.ts';
import { verifyFrameworkRawStageArtifactRef } from '../family-runtime-codex-stage-runner/raw-artifact-identity-verification.ts';
import {
  canonicalStageRunSha256,
  fail,
} from './content-binding-validation.ts';
import type {
  ArtifactIdentity,
  StageRunContentPurpose,
} from './content-binding-types.ts';

const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const RECEIPT_FILENAME_PATTERN = /^([a-f0-9]{64})\.json$/i;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_RECEIPT_BYTES = 1024 * 1024;

export function failForWorkItemFileBoundary(input: {
  error: WorkItemFileBoundaryError;
  phase: 'bind' | 'revalidate';
  ref: string;
  resolvedPath: string;
  canonicalWorkItemRoot: string;
  workItemScopeId: string;
}): never {
  const details = {
    artifact_ref: input.ref,
    ref: input.ref,
    resolved_path: input.resolvedPath,
    canonical_work_item_root: input.canonicalWorkItemRoot,
    work_item_scope_id: input.workItemScopeId,
    boundary_failure_code: input.error.failureCode,
    boundary_message: input.error.message,
    boundary_details: input.error.details,
  };
  if ([1, 13].includes(Number(input.error.details?.errno))) {
    fail('Work-item StageRun file access was denied by the execution host.', {
      failure_code: 'stage_run_artifact_access_denied', hard_stop_class: 'permission', ...details,
    });
  }
  if (input.error.failureCode === 'work_item_file_boundary_helper_unavailable') {
    fail('Work-item StageRun file observation is unavailable on the execution host.', {
      failure_code: 'stage_run_content_observation_unavailable', ...details,
    });
  }
  if (
    input.error.failureCode === 'work_item_file_boundary_escape'
    || input.error.failureCode === 'work_item_file_boundary_ref_invalid'
  ) {
    fail('Work-item StageRun local artifact is outside its physical canonical root.', {
      failure_code: input.phase === 'bind'
        ? 'stage_run_artifact_outside_work_item_root'
        : 'stage_run_artifact_scope_binding_mismatch',
      ...details,
    });
  }
  if (input.error.failureCode === 'work_item_file_boundary_ref_unreadable') {
    fail('StageRun immutable content ref is not readable.', {
      failure_code: 'stage_run_content_ref_unreadable',
      ...details,
    });
  }
  if (input.error.failureCode === 'work_item_file_boundary_ref_drift') {
    fail('StageRun immutable content changed while its bytes were being observed.', {
      failure_code: 'stage_run_content_changed_during_verification',
      ...details,
    });
  }
  fail('Work-item StageRun root changed after execution scope freeze.', {
    failure_code: input.phase === 'bind'
      ? 'stage_run_artifact_work_item_root_identity_drift'
      : 'stage_run_artifact_scope_binding_mismatch',
    ...details,
  });
}

function stableStatIdentity(stat: fs.Stats) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}

export function observeStableFile(input: {
  filePath: string;
  ref: string;
  captureBytes?: boolean;
  maxBytes?: number;
}) {
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(input.filePath, 'r');
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) {
      fail('StageRun immutable content ref must resolve to a regular file.', {
        failure_code: 'stage_run_content_ref_not_file',
        ref: input.ref,
        resolved_path: input.filePath,
      });
    }
    if (input.maxBytes !== undefined && before.size > input.maxBytes) {
      fail('StageRun artifact identity receipt exceeds the verification limit.', {
        failure_code: 'stage_run_identity_receipt_too_large',
        ref: input.ref,
        size_bytes: before.size,
        max_bytes: input.maxBytes,
      });
    }
    const digest = crypto.createHash('sha256');
    const captured: Buffer[] = [];
    let observedBytes = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(READ_CHUNK_BYTES);
      const read = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (read === 0) break;
      observedBytes += read;
      if (input.maxBytes !== undefined && observedBytes > input.maxBytes) {
        fail('StageRun artifact identity receipt exceeds the verification limit.', {
          failure_code: 'stage_run_identity_receipt_too_large',
          ref: input.ref,
          observed_size_bytes: observedBytes,
          max_bytes: input.maxBytes,
        });
      }
      const bytes = chunk.subarray(0, read);
      digest.update(bytes);
      if (input.captureBytes) captured.push(Buffer.from(bytes));
    }
    const after = fs.fstatSync(descriptor);
    if (observedBytes !== before.size || stableStatIdentity(before) !== stableStatIdentity(after)) {
      fail('StageRun immutable content changed while its bytes were being observed.', {
        failure_code: 'stage_run_content_changed_during_verification',
        ref: input.ref,
        resolved_path: input.filePath,
      });
    }
    return {
      sha256: `sha256:${digest.digest('hex')}`,
      byteSize: observedBytes,
      bytes: input.captureBytes ? Buffer.concat(captured, observedBytes) : null,
    };
  } catch (error) {
    if (error instanceof FrameworkContractError) throw error;
    fail('StageRun immutable content ref is not readable.', {
      failure_code: 'stage_run_content_ref_unreadable',
      ref: input.ref,
      resolved_path: input.filePath,
      read_error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function refPathPart(ref: string) {
  return ref.split('#', 1)[0]!.replace(/@sha256:[a-f0-9]{64}$/i, '');
}

export function containedFile(rootInput: string, ref: string) {
  const root = fs.realpathSync.native(rootInput);
  const candidateRef = refPathPart(ref);
  if (!candidateRef || path.isAbsolute(candidateRef) || URI_SCHEME_PATTERN.test(candidateRef)) return null;
  let realPath: string;
  try {
    realPath = fs.realpathSync.native(path.resolve(root, candidateRef));
  } catch {
    return null;
  }
  const relative = path.relative(root, realPath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return realPath;
}

export function localFileForRef(ref: string, workspaceRoot: string | null) {
  const fileRef = refPathPart(ref);
  if (fileRef.startsWith('file:')) {
    try {
      return fileURLToPath(fileRef);
    } catch {
      return null;
    }
  }
  if (path.isAbsolute(fileRef)) return fileRef;
  if (!workspaceRoot || URI_SCHEME_PATTERN.test(fileRef)) return null;
  return path.resolve(workspaceRoot, fileRef);
}

function pathInside(candidateInput: string, rootInput: string) {
  let candidate: string;
  let root: string;
  try {
    candidate = fs.realpathSync.native(candidateInput);
    root = fs.realpathSync.native(rootInput);
  } catch {
    return false;
  }
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function safeIdentityDirectory(value: string) {
  const readable = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    || 'domain';
  const digest = crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

function trustedReceiptRoots(domainId: string) {
  const stateRoot = ensureOplStateDir().state_dir;
  const domainRoot = process.env.OPL_DOMAIN_ARTIFACT_IDENTITY_RECEIPT_ROOT?.trim()
    ? path.resolve(process.env.OPL_DOMAIN_ARTIFACT_IDENTITY_RECEIPT_ROOT.trim())
    : path.join(stateRoot, 'runtime-state', 'domain-artifact-identity-receipts');
  return [
    {
      root: path.join(stateRoot, 'runtime-state', 'stage-artifact-identities'),
      surfaceKind: 'opl_transport_artifact_identity_receipt',
      version: 'opl-transport-artifact-identity-receipt.v1',
    },
    {
      root: path.join(domainRoot, safeIdentityDirectory(domainId)),
      surfaceKind: 'domain_artifact_identity_receipt',
      version: 'domain-artifact-identity-receipt.v1',
    },
  ];
}

export function verifyTrustedReceipt(input: {
  receiptRef: string;
  workspaceRoot: string | null;
  domainId: string;
  artifact: ArtifactIdentity;
  scopeKind: FamilyRuntimeExecutionScopeKind;
  executionScope: WorkItemExecutionScopeSnapshot | null;
}) {
  const receiptPath = localFileForRef(input.receiptRef, input.workspaceRoot);
  const receiptAuthority = receiptPath
    ? trustedReceiptRoots(input.domainId).find((authority) => pathInside(receiptPath, authority.root))
    : null;
  if (!receiptPath || !receiptAuthority) {
    fail('StageRun external artifact receipt is outside a trusted transport or domain authority root.', {
      failure_code: 'stage_run_artifact_identity_receipt_untrusted',
      artifact_ref: input.artifact.ref,
      identity_receipt_ref: input.receiptRef,
      domain_id: input.domainId,
    });
  }
  const observed = observeStableFile({
    filePath: receiptPath,
    ref: input.receiptRef,
    captureBytes: true,
    maxBytes: MAX_RECEIPT_BYTES,
  });
  const filenameSha = path.basename(receiptPath).match(RECEIPT_FILENAME_PATTERN)?.[1]?.toLowerCase();
  if (!filenameSha || observed.sha256 !== `sha256:${filenameSha}`) {
    fail('StageRun artifact identity receipt filename must bind the exact receipt bytes.', {
      failure_code: 'stage_run_artifact_identity_receipt_digest_mismatch',
      artifact_ref: input.artifact.ref,
      identity_receipt_ref: input.receiptRef,
      observed_receipt_sha256: observed.sha256,
    });
  }
  let receipt: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(observed.bytes!.toString('utf8'));
    if (!isRecord(parsed)) throw new Error('receipt is not an object');
    receipt = parsed;
  } catch (error) {
    fail('StageRun artifact identity receipt is not valid JSON.', {
      failure_code: 'stage_run_artifact_identity_receipt_invalid',
      artifact_ref: input.artifact.ref,
      identity_receipt_ref: input.receiptRef,
      parse_error: error instanceof Error ? error.message : String(error),
    });
  }
  const surfaceKind = receipt.surface_kind;
  const version = receipt.version;
  const producingStageRun = typeof receipt.stage_run_id === 'string'
    && receipt.stage_run_id.trim()
    && receipt.stage_run_id === receipt.stage_run_id.trim()
    ? receipt.stage_run_id
    : fail('StageRun artifact identity receipt requires one canonical producing StageRun id.', {
        failure_code: 'stage_run_artifact_identity_receipt_mismatch',
        artifact_ref: input.artifact.ref,
        identity_receipt_ref: input.receiptRef,
        stage_run_id: receipt.stage_run_id,
      });
  const producingAttempt = typeof receipt.stage_attempt_id === 'string'
    && receipt.stage_attempt_id.trim()
    && receipt.stage_attempt_id === receipt.stage_attempt_id.trim()
    ? receipt.stage_attempt_id
    : fail('StageRun artifact identity receipt requires one canonical producing Attempt id.', {
        failure_code: 'stage_run_artifact_identity_receipt_mismatch',
        artifact_ref: input.artifact.ref,
        identity_receipt_ref: input.receiptRef,
        stage_attempt_id: receipt.stage_attempt_id,
      });
  const byteSize = receipt.size_bytes === null
    ? null
    : typeof receipt.size_bytes === 'number'
      && Number.isSafeInteger(receipt.size_bytes)
      && receipt.size_bytes >= 0
      ? receipt.size_bytes
      : fail('StageRun artifact identity receipt size must be null or a non-negative safe integer.', {
          failure_code: 'stage_run_artifact_identity_receipt_mismatch',
          artifact_ref: input.artifact.ref,
          identity_receipt_ref: input.receiptRef,
          size_bytes: receipt.size_bytes,
        });
  const receiptScopeKind = typeof receipt.scope_kind === 'string' && receipt.scope_kind.trim()
    ? receipt.scope_kind.trim()
    : (receipt.scope_digest || receipt.work_item_scope_id ? 'work_item' : 'domain');
  const scopeMatches = input.executionScope
    ? receiptScopeKind === 'work_item'
      && receipt.work_item_scope_id === input.executionScope.work_item_scope_id
      && receipt.scope_digest === input.executionScope.scope_digest
    : receiptScopeKind === input.scopeKind
      && !receipt.work_item_scope_id
      && !receipt.scope_digest;
  const validSurface = surfaceKind === receiptAuthority.surfaceKind
    && version === receiptAuthority.version;
  if (
    !validSurface
    || receipt.domain_id !== input.domainId
    || !scopeMatches
    || receipt.artifact_ref !== input.artifact.ref
    || canonicalStageRunSha256(receipt.sha256, 'artifact_identity_receipt.sha256') !== input.artifact.sha256
  ) {
    fail('StageRun artifact identity receipt does not bind the expected domain, producer, ref, and hash.', {
      failure_code: 'stage_run_artifact_identity_receipt_mismatch',
      artifact_ref: input.artifact.ref,
      identity_receipt_ref: input.receiptRef,
      domain_id: input.domainId,
      expected_surface_kind: receiptAuthority.surfaceKind,
      actual_surface_kind: surfaceKind,
      expected_receipt_version: receiptAuthority.version,
      actual_receipt_version: version,
      expected_scope_kind: input.scopeKind,
      actual_scope_kind: receiptScopeKind,
      expected_work_item_scope_id: input.executionScope?.work_item_scope_id ?? null,
      actual_work_item_scope_id: receipt.work_item_scope_id ?? null,
      expected_scope_digest: input.executionScope?.scope_digest ?? null,
      actual_scope_digest: receipt.scope_digest ?? null,
    });
  }
  return {
    byteSize,
    producingStageRunRef: `opl://stage-runs/${encodeURIComponent(producingStageRun)}`,
    producingAttemptRef: `opl://stage-attempts/${encodeURIComponent(producingAttempt)}`,
  };
}

export function bindManagedPackFile(input: {
  domainPackRoot: string;
  purpose: StageRunContentPurpose;
  ref: string;
  expectedSha256?: string | null;
}) {
  const filePath = containedFile(input.domainPackRoot, input.ref);
  if (!filePath) return null;
  const observed = observeStableFile({ filePath, ref: input.ref });
  if (
    input.expectedSha256
    && canonicalStageRunSha256(input.expectedSha256, `${input.purpose}.expected_sha256`) !== observed.sha256
  ) {
    fail('StageRun managed-pack content bytes do not match their declared digest.', {
      failure_code: 'stage_run_content_digest_mismatch',
      purpose: input.purpose,
      ref: input.ref,
      expected_sha256: canonicalStageRunSha256(input.expectedSha256, `${input.purpose}.expected_sha256`),
      observed_sha256: observed.sha256,
    });
  }
  return {
    purpose: input.purpose,
    ref: input.ref,
    sha256: observed.sha256,
    byte_size: observed.byteSize,
    effective_content_sha256: null,
    effective_content_byte_size: null,
    verification_kind: 'managed_pack_file_bytes' as const,
    identity_receipt_ref: null,
    producing_stage_run_ref: null,
    producing_attempt_ref: null,
    scope_kind: null,
    work_item_scope_id: null,
    scope_digest: null,
  };
}

export function bindManagedRolePrompt(input: {
  domainPackRoot: string;
  ref: string;
}) {
  const prompt = readStandardAgentQualityRolePromptFile(input.domainPackRoot, input.ref);
  return {
    purpose: 'role_prompt' as const,
    ref: input.ref,
    sha256: `sha256:${prompt.source_file_sha256}`,
    byte_size: prompt.source_file_size_bytes,
    effective_content_sha256: `sha256:${prompt.sha256}`,
    effective_content_byte_size: prompt.size_bytes,
    verification_kind: 'managed_pack_file_bytes' as const,
    identity_receipt_ref: null,
    producing_stage_run_ref: null,
    producing_attempt_ref: null,
    scope_kind: null,
    work_item_scope_id: null,
    scope_digest: null,
  };
}

export function observeArtifactBytes(input: {
  phase: 'bind' | 'revalidate';
  filePath: string;
  artifactRef: string;
  executionScope: WorkItemExecutionScopeSnapshot | null;
}) {
  // A framework-owned raw executor output lives under the OPL runtime-state
  // root by design, so it can never satisfy the work-item boundary. Its
  // identity is verified through the framework raw artifact lineage instead;
  // domain artifacts keep the boundary unchanged.
  const frameworkRawStageArtifact = verifyFrameworkRawStageArtifactRef({
    artifactRef: input.artifactRef,
    filePath: input.filePath,
  });
  if (frameworkRawStageArtifact) {
    return { sha256: frameworkRawStageArtifact.sha256, byteSize: frameworkRawStageArtifact.byteSize };
  }
  const canonicalWorkItemRoot = input.executionScope?.canonical_work_item_root ?? null;
  if (input.executionScope && !canonicalWorkItemRoot) {
    fail('Work-item StageRun local artifacts must remain inside the canonical work-item root.', {
      failure_code: 'stage_run_artifact_outside_work_item_root',
      artifact_ref: input.artifactRef,
      resolved_path: input.filePath,
      canonical_work_item_root: canonicalWorkItemRoot,
      work_item_scope_id: input.executionScope.work_item_scope_id,
    });
  }
  if (!input.executionScope) {
    const observed = observeStableFile({ filePath: input.filePath, ref: input.artifactRef });
    return { sha256: observed.sha256, byteSize: observed.byteSize };
  }
  try {
    const observed = readStableWorkItemFile({
      workspaceRoot: input.executionScope.workspace_root,
      canonicalWorkItemRoot: canonicalWorkItemRoot!,
      expectedRootIdentity: input.executionScope.canonical_work_item_root_identity!,
      filePath: input.filePath,
      ref: input.artifactRef,
    });
    return { sha256: observed.sha256, byteSize: observed.byte_size };
  } catch (error) {
    if (!(error instanceof WorkItemFileBoundaryError)) throw error;
    failForWorkItemFileBoundary({
      error,
      phase: input.phase,
      ref: input.artifactRef,
      resolvedPath: input.filePath,
      canonicalWorkItemRoot: canonicalWorkItemRoot!,
      workItemScopeId: input.executionScope.work_item_scope_id,
    });
  }
}

export function bindArtifact(input: {
  purpose: StageRunContentPurpose;
  artifact: ArtifactIdentity;
  domainId: string;
  workspaceRoot: string | null;
  scopeKind: FamilyRuntimeExecutionScopeKind;
  executionScope: WorkItemExecutionScopeSnapshot | null;
}) {
  const filePath = localFileForRef(input.artifact.ref, input.workspaceRoot);
  const observed = filePath
    ? observeArtifactBytes({
        phase: 'bind',
        filePath,
        artifactRef: input.artifact.ref,
        executionScope: input.executionScope,
      })
    : null;
  if (observed && observed.sha256 !== input.artifact.sha256) {
    fail('StageRun input artifact hash does not match its current stable local bytes.', {
      failure_code: 'stage_run_artifact_byte_identity_mismatch',
      artifact_ref: input.artifact.ref,
      declared_sha256: input.artifact.sha256,
      observed_sha256: observed.sha256,
    });
  }
  if (input.artifact.identity_receipt_ref) {
    const receipt = verifyTrustedReceipt({
      receiptRef: input.artifact.identity_receipt_ref,
      workspaceRoot: input.workspaceRoot,
      domainId: input.domainId,
      artifact: input.artifact,
      scopeKind: input.scopeKind,
      executionScope: input.executionScope,
    });
    if (observed && receipt.byteSize !== null && observed.byteSize !== receipt.byteSize) {
      fail('StageRun local artifact bytes do not match the trusted receipt size.', {
        failure_code: 'stage_run_artifact_identity_receipt_mismatch',
        artifact_ref: input.artifact.ref,
        identity_receipt_ref: input.artifact.identity_receipt_ref,
        receipt_byte_size: receipt.byteSize,
        observed_byte_size: observed.byteSize,
      });
    }
    return {
      purpose: input.purpose,
      ref: input.artifact.ref,
      sha256: input.artifact.sha256,
      byte_size: receipt.byteSize,
      effective_content_sha256: null,
      effective_content_byte_size: null,
      verification_kind: 'trusted_artifact_identity_receipt' as const,
      identity_receipt_ref: input.artifact.identity_receipt_ref,
      producing_stage_run_ref: receipt.producingStageRunRef,
      producing_attempt_ref: receipt.producingAttemptRef,
      scope_kind: input.scopeKind,
      work_item_scope_id: input.executionScope?.work_item_scope_id ?? null,
      scope_digest: input.executionScope?.scope_digest ?? null,
    };
  }
  if (observed) {
    return {
      purpose: input.purpose,
      ref: input.artifact.ref,
      sha256: input.artifact.sha256,
      byte_size: observed.byteSize,
      effective_content_sha256: null,
      effective_content_byte_size: null,
      verification_kind: 'workspace_file_bytes' as const,
      identity_receipt_ref: null,
      producing_stage_run_ref: null,
      producing_attempt_ref: null,
      scope_kind: input.scopeKind,
      work_item_scope_id: input.executionScope?.work_item_scope_id ?? null,
      scope_digest: input.executionScope?.scope_digest ?? null,
    };
  }
  fail('StageRun external artifact requires a trusted content-addressed identity receipt.', {
    failure_code: 'stage_run_artifact_identity_receipt_missing',
    artifact_ref: input.artifact.ref,
    domain_id: input.domainId,
  });
}

export { readStandardAgentQualityRolePromptFile, readStableWorkItemFile, WorkItemFileBoundaryError };
