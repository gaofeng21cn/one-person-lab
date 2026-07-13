import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { ensureOplStateDir } from '../../../kernel/runtime-state-paths.ts';
import { readStandardAgentQualityRolePromptFile } from '../../pack/index.ts';

const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/i;
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const RECEIPT_FILENAME_PATTERN = /^([a-f0-9]{64})\.json$/i;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_RECEIPT_BYTES = 1024 * 1024;

export type StageRunContentPurpose =
  | 'stage_manifest'
  | 'quality_policy'
  | 'stage_prompt'
  | 'role_prompt'
  | 'quality_rubric'
  | 'stage_goal'
  | 'source'
  | 'lineage'
  | 'stage_packet'
  | 'checkpoint'
  | 'input_artifact';

export type StageRunImmutableContentBinding = {
  purpose: StageRunContentPurpose;
  ref: string;
  sha256: string;
  byte_size: number | null;
  effective_content_sha256: string | null;
  effective_content_byte_size: number | null;
  verification_kind:
    | 'managed_pack_file_bytes'
    | 'workspace_file_bytes'
    | 'trusted_artifact_identity_receipt';
  identity_receipt_ref: string | null;
  producing_attempt_ref: string | null;
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
    path.join(stateRoot, 'runtime-state', 'stage-artifact-identities'),
    path.join(domainRoot, safeIdentityDirectory(domainId)),
  ];
}

function verifyTrustedReceipt(input: {
  receiptRef: string;
  workspaceRoot: string | null;
  domainId: string;
  artifact: ArtifactIdentity;
}) {
  const receiptPath = localFileForRef(input.receiptRef, input.workspaceRoot);
  if (!receiptPath || !trustedReceiptRoots(input.domainId).some((root) => pathInside(receiptPath, root))) {
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
  const producingAttempt = requiredText(receipt.stage_attempt_id, 'artifact_identity_receipt.stage_attempt_id');
  const validSurface = (
    surfaceKind === 'opl_transport_artifact_identity_receipt'
    && version === 'opl-transport-artifact-identity-receipt.v1'
  ) || (
    surfaceKind === 'domain_artifact_identity_receipt'
    && version === 'domain-artifact-identity-receipt.v1'
  );
  if (
    !validSurface
    || receipt.domain_id !== input.domainId
    || receipt.artifact_ref !== input.artifact.ref
    || canonicalStageRunSha256(receipt.sha256, 'artifact_identity_receipt.sha256') !== input.artifact.sha256
  ) {
    fail('StageRun artifact identity receipt does not bind the expected domain, producer, ref, and hash.', {
      failure_code: 'stage_run_artifact_identity_receipt_mismatch',
      artifact_ref: input.artifact.ref,
      identity_receipt_ref: input.receiptRef,
      domain_id: input.domainId,
    });
  }
  return {
    byteSize: typeof receipt.size_bytes === 'number' && Number.isSafeInteger(receipt.size_bytes)
      ? receipt.size_bytes
      : null,
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
    producing_attempt_ref: null,
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
    producing_attempt_ref: null,
  };
}

function bindArtifact(input: {
  purpose: StageRunContentPurpose;
  artifact: ArtifactIdentity;
  domainId: string;
  workspaceRoot: string | null;
}) {
  const filePath = localFileForRef(input.artifact.ref, input.workspaceRoot);
  if (filePath) {
    const observed = observeStableFile({ filePath, ref: input.artifact.ref });
    if (observed.sha256 !== input.artifact.sha256) {
      fail('StageRun input artifact hash does not match its current stable local bytes.', {
        failure_code: 'stage_run_artifact_byte_identity_mismatch',
        artifact_ref: input.artifact.ref,
        declared_sha256: input.artifact.sha256,
        observed_sha256: observed.sha256,
      });
    }
    return {
      purpose: input.purpose,
      ref: input.artifact.ref,
      sha256: input.artifact.sha256,
      byte_size: observed.byteSize,
      effective_content_sha256: null,
      effective_content_byte_size: null,
      verification_kind: 'workspace_file_bytes' as const,
      identity_receipt_ref: input.artifact.identity_receipt_ref,
      producing_attempt_ref: null,
    };
  }
  if (!input.artifact.identity_receipt_ref) {
    fail('StageRun external artifact requires a trusted content-addressed identity receipt.', {
      failure_code: 'stage_run_artifact_identity_receipt_missing',
      artifact_ref: input.artifact.ref,
      domain_id: input.domainId,
    });
  }
  const receipt = verifyTrustedReceipt({
    receiptRef: input.artifact.identity_receipt_ref,
    workspaceRoot: input.workspaceRoot,
    domainId: input.domainId,
    artifact: input.artifact,
  });
  return {
    purpose: input.purpose,
    ref: input.artifact.ref,
    sha256: input.artifact.sha256,
    byte_size: receipt.byteSize,
    effective_content_sha256: null,
    effective_content_byte_size: null,
    verification_kind: 'trusted_artifact_identity_receipt' as const,
    identity_receipt_ref: input.artifact.identity_receipt_ref,
    producing_attempt_ref: receipt.producingAttemptRef,
  };
}

export function buildStageRunImmutableContentBindings(input: {
  domainId: string;
  domainPackRoot: string;
  workspaceRoot: string | null;
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
      ? bindArtifact({ purpose, artifact, domainId: input.domainId, workspaceRoot: input.workspaceRoot })
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
  input.inputArtifacts.forEach((artifact) => {
    if (!result.some((binding) => binding.ref === artifact.ref && binding.sha256 === artifact.sha256)) {
      result.push(bindArtifact({
        purpose: 'input_artifact',
        artifact,
        domainId: input.domainId,
        workspaceRoot: input.workspaceRoot,
      }));
    }
  });
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
  bindings: StageRunImmutableContentBinding[];
}) {
  if (!Array.isArray(input.bindings) || input.bindings.length === 0) {
    fail('StageRun immutable spec requires executable byte bindings.', {
      failure_code: 'stage_run_content_bindings_missing',
    });
  }
  const seen = new Set<string>();
  for (const binding of input.bindings) {
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
      verifyTrustedReceipt({
        receiptRef: requiredText(binding.identity_receipt_ref, 'content_binding.identity_receipt_ref'),
        workspaceRoot: input.workspaceRoot,
        domainId: input.domainId,
        artifact: {
          ref: binding.ref,
          sha256,
          identity_receipt_ref: binding.identity_receipt_ref,
        },
      });
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
    const observed = observeStableFile({ filePath, ref: binding.ref });
    if (observed.sha256 !== sha256 || observed.byteSize !== binding.byte_size) {
      fail('StageRun immutable content bytes changed after the spec was created.', {
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
  return input.bindings;
}
