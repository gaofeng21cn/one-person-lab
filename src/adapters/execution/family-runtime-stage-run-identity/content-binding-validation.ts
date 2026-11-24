import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  PACK_ONLY_CONTENT_PURPOSES,
  STAGE_RUN_CONTENT_PURPOSES,
  STAGE_RUN_CONTENT_VERIFICATION_KINDS,
  type StageRunContentPurpose,
  type StageRunContentVerificationKind,
  type StageRunImmutableContentBinding,
} from './content-binding-types.ts';

const SHA256_PATTERN = /^(?:sha256:)?([a-f0-9]{64})$/i;

export function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function requiredText(value: unknown, field: string) {
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
