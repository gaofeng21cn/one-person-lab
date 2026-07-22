import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import { readStandardAgentQualityRolePromptFile } from '../../pack/index.ts';
import {
  readStableWorkItemFile,
  WorkItemFileBoundaryError,
} from '../../workspace/index.ts';
import type {
  FamilyRuntimeExecutionScopeKind,
  WorkItemExecutionScopeSnapshot,
} from '../family-runtime-execution-scope.ts';

const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const RECEIPT_FILENAME_PATTERN = /^([a-f0-9]{64})\.json$/i;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_RECEIPT_BYTES = 1024 * 1024;

const STAGE_RUN_CONTENT_PURPOSES = [
  'stage_manifest',
  'quality_policy',
  'stage_prompt',
  'role_prompt',
  'quality_rubric',
  'stage_goal',
  'source',
  'lineage',
  'stage_packet',
  'checkpoint',
  'input_artifact',
] as const;

const STAGE_RUN_CONTENT_VERIFICATION_KINDS = [
  'managed_pack_file_bytes',
  'workspace_file_bytes',
  'trusted_artifact_identity_receipt',
] as const;

const PACK_ONLY_CONTENT_PURPOSES = new Set<StageRunContentPurpose>([
  'stage_manifest',
  'quality_policy',
  'stage_prompt',
  'role_prompt',
  'quality_rubric',
  'stage_goal',
  'lineage',
]);

export type StageRunContentPurpose = typeof STAGE_RUN_CONTENT_PURPOSES[number];
export type StageRunContentVerificationKind = typeof STAGE_RUN_CONTENT_VERIFICATION_KINDS[number];

export type StageRunImmutableContentBinding = {
  purpose: StageRunContentPurpose;
  ref: string;
  sha256: string;
  byte_size: number | null;
  effective_content_sha256: string | null;
  effective_content_byte_size: number | null;
  verification_kind: StageRunContentVerificationKind;
  identity_receipt_ref: string | null;
  producing_stage_run_ref: string | null;
  producing_attempt_ref: string | null;
  scope_kind: FamilyRuntimeExecutionScopeKind | null;
  work_item_scope_id: string | null;
  scope_digest: string | null;
};

type ArtifactIdentity = {
  ref: string;
  sha256: string;
  identity_receipt_ref: string | null;
};

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`StageRun immutable content binding requires ${field}.`, {
      failure_code: 'stage_run_content_binding_field_missing',
      field,
    });
  }
  return value.trim();
}

export function canonicalStageRunSha256(value: unknown, field: string) {
  const candidate = requiredText(value, field);
  const match = candidate.match(SHA256_PATTERN);
  if (!match) {
    fail(`StageRun immutable content binding requires a canonical SHA-256 digest for ${field}.`, {
      failure_code: 'stage_run_content_digest_invalid',
      field,
      received_digest: candidate,
    });
  }
  return `sha256:${match[1]!.toLowerCase()}`;
}

function canonicalNullableText(value: unknown, field: string) {
  if (value === null) return null;
  const normalized = requiredText(value, field);
  if (normalized !== value) {
    fail(`StageRun immutable content binding field ${field} must be canonical.`, {
      failure_code: 'stage_run_content_binding_shape_invalid',
      field,
    });
  }
  return normalized;
}

function canonicalNullableSize(value: unknown, field: string) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`StageRun immutable content binding field ${field} must be a non-negative safe integer or null.`, {
      failure_code: 'stage_run_content_binding_shape_invalid',
      field,
      value,
    });
  }
  return value as number;
}

function requireStageRunImmutableContentBinding(
  value: unknown,
  index: number,
): StageRunImmutableContentBinding {
  const expectedKeys = [
    'purpose',
    'ref',
    'sha256',
    'byte_size',
    'effective_content_sha256',
    'effective_content_byte_size',
    'verification_kind',
    'identity_receipt_ref',
    'producing_stage_run_ref',
    'producing_attempt_ref',
    'scope_kind',
    'work_item_scope_id',
    'scope_digest',
  ].sort();
  const receivedKeys = isRecord(value) ? Object.keys(value).sort() : [];
  if (!isRecord(value) || JSON.stringify(receivedKeys) !== JSON.stringify(expectedKeys)) {
    fail('StageRun immutable content binding must use its exact canonical shape.', {
      failure_code: 'stage_run_content_binding_shape_invalid',
      binding_index: index,
      expected_fields: expectedKeys,
      received_fields: isRecord(value) ? receivedKeys : null,
    });
  }
  if (!STAGE_RUN_CONTENT_PURPOSES.includes(value.purpose as StageRunContentPurpose)) {
    fail('StageRun immutable content binding purpose is unsupported.', {
      failure_code: 'stage_run_content_purpose_invalid',
      binding_index: index,
      purpose: value.purpose,
      allowed_purposes: STAGE_RUN_CONTENT_PURPOSES,
    });
  }
  if (!STAGE_RUN_CONTENT_VERIFICATION_KINDS.includes(
    value.verification_kind as StageRunContentVerificationKind,
  )) {
    fail('StageRun immutable content binding verification kind is unsupported.', {
      failure_code: 'stage_run_content_verification_kind_invalid',
      binding_index: index,
      verification_kind: value.verification_kind,
      allowed_verification_kinds: STAGE_RUN_CONTENT_VERIFICATION_KINDS,
    });
  }

  const purpose = value.purpose as StageRunContentPurpose;
  const verificationKind = value.verification_kind as StageRunContentVerificationKind;
  const ref = requiredText(value.ref, `content_bindings[${index}].ref`);
  if (ref !== value.ref) {
    fail('StageRun immutable content binding ref must be canonical.', {
      failure_code: 'stage_run_content_binding_shape_invalid',
      binding_index: index,
      ref: value.ref,
    });
  }
  const sha256 = canonicalStageRunSha256(value.sha256, `content_bindings[${index}].sha256`);
  if (sha256 !== value.sha256) {
    fail('StageRun immutable content binding SHA-256 must use its canonical form.', {
      failure_code: 'stage_run_content_binding_shape_invalid',
      binding_index: index,
      sha256: value.sha256,
    });
  }
  const byteSize = canonicalNullableSize(value.byte_size, `content_bindings[${index}].byte_size`);
  const effectiveSha256 = value.effective_content_sha256 === null
    ? null
    : canonicalStageRunSha256(
        value.effective_content_sha256,
        `content_bindings[${index}].effective_content_sha256`,
      );
  if (effectiveSha256 !== value.effective_content_sha256) {
    fail('StageRun immutable effective content SHA-256 must use its canonical form.', {
      failure_code: 'stage_run_content_binding_shape_invalid',
      binding_index: index,
      effective_content_sha256: value.effective_content_sha256,
    });
  }
  const effectiveByteSize = canonicalNullableSize(
    value.effective_content_byte_size,
    `content_bindings[${index}].effective_content_byte_size`,
  );
  const identityReceiptRef = canonicalNullableText(
    value.identity_receipt_ref,
    `content_bindings[${index}].identity_receipt_ref`,
  );
  const producingStageRunRef = canonicalNullableText(
    value.producing_stage_run_ref,
    `content_bindings[${index}].producing_stage_run_ref`,
  );
  const producingAttemptRef = canonicalNullableText(
    value.producing_attempt_ref,
    `content_bindings[${index}].producing_attempt_ref`,
  );
  const scopeKind = value.scope_kind === null
    ? null
    : value.scope_kind === 'work_item' || value.scope_kind === 'domain' || value.scope_kind === 'system'
      ? value.scope_kind
      : fail('StageRun immutable content binding scope kind is unsupported.', {
          failure_code: 'stage_run_content_binding_scope_invalid',
          binding_index: index,
          scope_kind: value.scope_kind,
        });
  const workItemScopeId = canonicalNullableText(
    value.work_item_scope_id,
    `content_bindings[${index}].work_item_scope_id`,
  );
  const scopeDigest = value.scope_digest === null
    ? null
    : canonicalStageRunSha256(value.scope_digest, `content_bindings[${index}].scope_digest`);
  if (scopeDigest !== value.scope_digest) {
    fail('StageRun immutable content binding scope digest must use its canonical form.', {
      failure_code: 'stage_run_content_binding_scope_invalid',
      binding_index: index,
      scope_digest: value.scope_digest,
    });
  }

  if (purpose === 'role_prompt') {
    if (effectiveSha256 === null || effectiveByteSize === null || effectiveByteSize < 1) {
      fail('StageRun role prompt binding requires positive effective content identity.', {
        failure_code: 'stage_run_role_prompt_effective_identity_missing',
        binding_index: index,
      });
    }
  } else if (effectiveSha256 !== null || effectiveByteSize !== null) {
    fail('Only role prompt bindings may declare effective content identity.', {
      failure_code: 'stage_run_effective_content_binding_purpose_invalid',
      binding_index: index,
      purpose,
    });
  }

  if (verificationKind === 'managed_pack_file_bytes') {
    if (
      purpose === 'input_artifact'
      || byteSize === null
      || identityReceiptRef !== null
      || producingStageRunRef !== null
      || producingAttemptRef !== null
      || scopeKind !== null
      || workItemScopeId !== null
      || scopeDigest !== null
    ) {
      fail('Managed package bindings cannot impersonate scoped input artifact bindings.', {
        failure_code: 'stage_run_content_binding_authority_mismatch',
        binding_index: index,
        purpose,
        verification_kind: verificationKind,
      });
    }
  } else {
    if (PACK_ONLY_CONTENT_PURPOSES.has(purpose)) {
      fail('Pack-owned StageRun content must bind managed package bytes.', {
        failure_code: 'stage_run_pack_content_binding_authority_mismatch',
        binding_index: index,
        purpose,
        verification_kind: verificationKind,
      });
    }
    if (scopeKind === null) {
      fail('Non-managed StageRun content binding requires an explicit execution scope kind.', {
        failure_code: 'stage_run_content_binding_scope_invalid',
        binding_index: index,
        purpose,
      });
    }
    if (
      (scopeKind === 'work_item' && (!workItemScopeId || !scopeDigest))
      || (scopeKind !== 'work_item' && (workItemScopeId !== null || scopeDigest !== null))
    ) {
      fail('StageRun content binding scope fields must form one exact canonical scope identity.', {
        failure_code: 'stage_run_content_binding_scope_invalid',
        binding_index: index,
        purpose,
        scope_kind: scopeKind,
      });
    }
    if (
      verificationKind === 'workspace_file_bytes'
      && (
        byteSize === null
        || identityReceiptRef !== null
        || producingStageRunRef !== null
        || producingAttemptRef !== null
      )
    ) {
      fail('Workspace byte binding has incompatible receipt or size fields.', {
        failure_code: 'stage_run_content_binding_authority_mismatch',
        binding_index: index,
        purpose,
      });
    }
    if (
      verificationKind === 'trusted_artifact_identity_receipt'
      && (!identityReceiptRef || !producingStageRunRef || !producingAttemptRef)
    ) {
      fail('Trusted receipt binding requires receipt, producing StageRun, and producing Attempt refs.', {
        failure_code: 'stage_run_content_binding_authority_mismatch',
        binding_index: index,
        purpose,
      });
    }
  }

  return {
    purpose,
    ref,
    sha256,
    byte_size: byteSize,
    effective_content_sha256: effectiveSha256,
    effective_content_byte_size: effectiveByteSize,
    verification_kind: verificationKind,
    identity_receipt_ref: identityReceiptRef,
    producing_stage_run_ref: producingStageRunRef,
    producing_attempt_ref: producingAttemptRef,
    scope_kind: scopeKind,
    work_item_scope_id: workItemScopeId,
    scope_digest: scopeDigest,
  };
}

export function requireStageRunImmutableContentBindings(
  value: unknown,
): StageRunImmutableContentBinding[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail('StageRun immutable spec requires executable byte bindings.', {
      failure_code: 'stage_run_content_bindings_missing',
    });
  }
  return value.map((binding, index) => requireStageRunImmutableContentBinding(binding, index));
}

function failForWorkItemFileBoundary(input: {
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
  };
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

function observeStableFile(input: {
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

function containedFile(rootInput: string, ref: string) {
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

function localFileForRef(ref: string, workspaceRoot: string | null) {
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

function verifyTrustedReceipt(input: {
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

function bindManagedPackFile(input: {
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

function bindManagedRolePrompt(input: {
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

function observeArtifactBytes(input: {
  phase: 'bind' | 'revalidate';
  filePath: string;
  artifactRef: string;
  executionScope: WorkItemExecutionScopeSnapshot | null;
}) {
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

function bindArtifact(input: {
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

export function buildStageRunImmutableContentBindings(input: {
  domainId: string;
  domainPackRoot: string;
  workspaceRoot: string | null;
  scopeKind: FamilyRuntimeExecutionScopeKind;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  stageManifest: { ref: string; sha256: string };
  qualityPolicyRef: string;
  stagePromptRef: string;
  rolePromptRefs: string[];
  qualityRubricRefs: string[];
  stageGoalRefs: string[];
  sourceRefs: string[];
  lineageRefs: string[];
  stagePacketRef: string;
  checkpointRefs: string[];
  inputArtifacts: ArtifactIdentity[];
}) {
  const artifacts = new Map(input.inputArtifacts.map((artifact) => [artifact.ref, artifact]));
  const result: StageRunImmutableContentBinding[] = [];
  const bind = (
    purpose: StageRunContentPurpose,
    ref: string,
    expectedSha256?: string | null,
  ) => {
    const artifact = artifacts.get(ref);
    const binding = purpose === 'role_prompt' && !artifact
      ? bindManagedRolePrompt({ domainPackRoot: input.domainPackRoot, ref })
      : artifact
      ? bindArtifact({
          purpose,
          artifact,
          domainId: input.domainId,
          workspaceRoot: input.workspaceRoot,
          scopeKind: input.scopeKind,
          executionScope: input.executionScope,
        })
      : bindManagedPackFile({
          domainPackRoot: input.domainPackRoot,
          purpose,
          ref,
          expectedSha256,
        });
    if (!binding) {
      fail('StageRun executable ref is not bound to managed-pack bytes or an exact artifact receipt.', {
        failure_code: 'stage_run_content_ref_unbound',
        purpose,
        ref,
      });
    }
    const existing = result.find((entry) => entry.purpose === purpose && entry.ref === ref);
    if (existing) {
      if (existing.sha256 !== binding.sha256) {
        fail('StageRun executable ref resolved to conflicting byte identities.', {
          failure_code: 'stage_run_content_binding_conflict',
          purpose,
          ref,
          existing_sha256: existing.sha256,
          received_sha256: binding.sha256,
        });
      }
      return;
    }
    result.push(binding);
  };

  bind('stage_manifest', input.stageManifest.ref, input.stageManifest.sha256);
  bind('quality_policy', input.qualityPolicyRef);
  bind('stage_prompt', input.stagePromptRef);
  input.rolePromptRefs.forEach((ref) => bind('role_prompt', ref));
  input.qualityRubricRefs.forEach((ref) => bind('quality_rubric', ref));
  input.stageGoalRefs.forEach((ref) => bind('stage_goal', ref));
  input.sourceRefs.forEach((ref) => bind('source', ref));
  input.lineageRefs.forEach((ref) => bind('lineage', ref));
  bind('stage_packet', input.stagePacketRef);
  input.checkpointRefs.forEach((ref) => bind('checkpoint', ref));
  input.inputArtifacts.forEach((artifact) => bind('input_artifact', artifact.ref, artifact.sha256));
  return result.sort((left, right) => (
    left.purpose.localeCompare(right.purpose)
    || left.ref.localeCompare(right.ref)
    || left.sha256.localeCompare(right.sha256)
  ));
}

export function revalidateStageRunImmutableContentBindings(input: {
  domainId: string;
  domainPackRoot: string;
  workspaceRoot: string | null;
  scopeKind: FamilyRuntimeExecutionScopeKind;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  bindings: StageRunImmutableContentBinding[];
  skipManagedPackBytes?: boolean;
}) {
  const bindings = requireStageRunImmutableContentBindings(input.bindings);
  const seen = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.purpose}\0${binding.ref}`;
    if (seen.has(key)) {
      fail('StageRun immutable content bindings must be unique by purpose and ref.', {
        failure_code: 'stage_run_content_binding_duplicate',
        purpose: binding.purpose,
        ref: binding.ref,
      });
    }
    seen.add(key);
    const sha256 = canonicalStageRunSha256(binding.sha256, `content_bindings.${binding.purpose}.sha256`);
    if (binding.purpose === 'role_prompt') {
      if (binding.verification_kind !== 'managed_pack_file_bytes') {
        fail('StageRun role prompt binding must resolve from managed package bytes.', {
          failure_code: 'stage_run_role_prompt_binding_authority_mismatch',
          ref: binding.ref,
          verification_kind: binding.verification_kind,
        });
      }
      const effectiveSha256 = canonicalStageRunSha256(
        binding.effective_content_sha256,
        'content_bindings.role_prompt.effective_content_sha256',
      );
      if (!Number.isSafeInteger(binding.effective_content_byte_size) || binding.effective_content_byte_size! < 1) {
        fail('StageRun role prompt binding requires a positive effective content byte size.', {
          failure_code: 'stage_run_role_prompt_effective_size_invalid',
          ref: binding.ref,
          effective_content_byte_size: binding.effective_content_byte_size,
        });
      }
      if (input.skipManagedPackBytes) continue;
      const observedPrompt = readStandardAgentQualityRolePromptFile(input.domainPackRoot, binding.ref);
      const observedFileSha256 = `sha256:${observedPrompt.source_file_sha256}`;
      const observedEffectiveSha256 = `sha256:${observedPrompt.sha256}`;
      if (
        observedFileSha256 !== sha256
        || observedPrompt.source_file_size_bytes !== binding.byte_size
        || observedEffectiveSha256 !== effectiveSha256
        || observedPrompt.size_bytes !== binding.effective_content_byte_size
      ) {
        fail('StageRun role prompt source file or effective section changed after the spec was created.', {
          failure_code: 'stage_run_role_prompt_content_binding_stale',
          ref: binding.ref,
          expected_source_file_sha256: sha256,
          observed_source_file_sha256: observedFileSha256,
          expected_source_file_byte_size: binding.byte_size,
          observed_source_file_byte_size: observedPrompt.source_file_size_bytes,
          expected_effective_content_sha256: effectiveSha256,
          observed_effective_content_sha256: observedEffectiveSha256,
          expected_effective_content_byte_size: binding.effective_content_byte_size,
          observed_effective_content_byte_size: observedPrompt.size_bytes,
        });
      }
      continue;
    }
    if (binding.effective_content_sha256 !== null || binding.effective_content_byte_size !== null) {
      fail('Only role prompt bindings may declare an effective content digest.', {
        failure_code: 'stage_run_effective_content_binding_purpose_invalid',
        purpose: binding.purpose,
        ref: binding.ref,
      });
    }
    if (binding.verification_kind === 'trusted_artifact_identity_receipt') {
      if (
        binding.scope_kind !== input.scopeKind
        || binding.work_item_scope_id !== (input.executionScope?.work_item_scope_id ?? null)
        || binding.scope_digest !== (input.executionScope?.scope_digest ?? null)
      ) {
        fail('StageRun artifact binding execution scope no longer matches its runtime authority.', {
          failure_code: 'stage_run_artifact_scope_binding_mismatch',
          ref: binding.ref,
          expected_scope_kind: input.scopeKind,
          actual_scope_kind: binding.scope_kind ?? null,
          expected_work_item_scope_id: input.executionScope?.work_item_scope_id ?? null,
          actual_work_item_scope_id: binding.work_item_scope_id ?? null,
          expected_scope_digest: input.executionScope?.scope_digest ?? null,
          actual_scope_digest: binding.scope_digest ?? null,
        });
      }
      const receipt = verifyTrustedReceipt({
        receiptRef: requiredText(binding.identity_receipt_ref, 'content_binding.identity_receipt_ref'),
        workspaceRoot: input.workspaceRoot,
        domainId: input.domainId,
        scopeKind: input.scopeKind,
        executionScope: input.executionScope,
        artifact: {
          ref: binding.ref,
          sha256,
          identity_receipt_ref: binding.identity_receipt_ref,
        },
      });
      if (
        receipt.producingStageRunRef !== binding.producing_stage_run_ref
        || receipt.producingAttemptRef !== binding.producing_attempt_ref
        || receipt.byteSize !== binding.byte_size
      ) {
        fail('StageRun trusted receipt lineage no longer matches its immutable content binding.', {
          failure_code: 'stage_run_artifact_identity_receipt_binding_mismatch',
          ref: binding.ref,
          expected_producing_stage_run_ref: binding.producing_stage_run_ref,
          actual_producing_stage_run_ref: receipt.producingStageRunRef,
          expected_producing_attempt_ref: binding.producing_attempt_ref,
          actual_producing_attempt_ref: receipt.producingAttemptRef,
          expected_byte_size: binding.byte_size,
          actual_byte_size: receipt.byteSize,
        });
      }
      const localFilePath = localFileForRef(binding.ref, input.workspaceRoot);
      if (localFilePath) {
        const observed = observeArtifactBytes({
          phase: 'revalidate',
          filePath: localFilePath,
          artifactRef: binding.ref,
          executionScope: input.executionScope,
        });
        if (
          observed.sha256 !== sha256
          || (binding.byte_size !== null && observed.byteSize !== binding.byte_size)
        ) {
          fail('StageRun receipt-bound local artifact bytes changed after the spec was created.', {
            failure_code: 'stage_run_content_binding_stale',
            purpose: binding.purpose,
            ref: binding.ref,
            expected_sha256: sha256,
            observed_sha256: observed.sha256,
            expected_byte_size: binding.byte_size,
            observed_byte_size: observed.byteSize,
          });
        }
      }
      continue;
    }
    if (input.skipManagedPackBytes && binding.verification_kind === 'managed_pack_file_bytes') {
      continue;
    }
    const filePath = binding.verification_kind === 'managed_pack_file_bytes'
      ? containedFile(input.domainPackRoot, binding.ref)
      : localFileForRef(binding.ref, input.workspaceRoot);
    if (!filePath) {
      fail('StageRun immutable content binding can no longer resolve its file.', {
        failure_code: 'stage_run_content_ref_unreadable',
        purpose: binding.purpose,
        ref: binding.ref,
      });
    }
    const canonicalWorkItemRoot = input.executionScope?.canonical_work_item_root ?? null;
    if (
      binding.verification_kind === 'workspace_file_bytes'
      && (
        binding.scope_kind !== input.scopeKind
        || binding.work_item_scope_id !== (input.executionScope?.work_item_scope_id ?? null)
        || binding.scope_digest !== (input.executionScope?.scope_digest ?? null)
        || (input.executionScope && !canonicalWorkItemRoot)
      )
    ) {
      fail('StageRun workspace artifact binding crossed its canonical work-item root or execution scope.', {
        failure_code: 'stage_run_artifact_scope_binding_mismatch',
        ref: binding.ref,
        resolved_path: filePath,
        canonical_work_item_root: input.executionScope?.canonical_work_item_root ?? null,
      });
    }
    let observedSha256: string;
    let observedByteSize: number;
    if (binding.verification_kind === 'workspace_file_bytes' && input.executionScope) {
      try {
        const observed = readStableWorkItemFile({
          workspaceRoot: input.executionScope.workspace_root,
          canonicalWorkItemRoot: canonicalWorkItemRoot!,
          expectedRootIdentity: input.executionScope.canonical_work_item_root_identity!,
          filePath,
          ref: binding.ref,
        });
        observedSha256 = observed.sha256;
        observedByteSize = observed.byte_size;
      } catch (error) {
        if (!(error instanceof WorkItemFileBoundaryError)) throw error;
        failForWorkItemFileBoundary({
          error,
          phase: 'revalidate',
          ref: binding.ref,
          resolvedPath: filePath,
          canonicalWorkItemRoot: canonicalWorkItemRoot!,
          workItemScopeId: input.executionScope.work_item_scope_id,
        });
      }
    } else {
      const observed = observeStableFile({ filePath, ref: binding.ref });
      observedSha256 = observed.sha256;
      observedByteSize = observed.byteSize;
    }
    if (observedSha256 !== sha256 || observedByteSize !== binding.byte_size) {
      fail('StageRun immutable content bytes changed after the spec was created.', {
        failure_code: 'stage_run_content_binding_stale',
        purpose: binding.purpose,
        ref: binding.ref,
        expected_sha256: sha256,
        observed_sha256: observedSha256,
        expected_byte_size: binding.byte_size,
        observed_byte_size: observedByteSize,
      });
    }
  }
  return bindings;
}
