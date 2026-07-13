import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

export const QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS = [
  'owner_receipt',
  'quality_gate_receipt',
  'typed_blocker',
  'human_gate',
  'route_back_evidence',
] as const;

export type QualityGateRuntimeReceiptKind =
  typeof QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS[number];

export type QualityGateRuntimeBinding = {
  surface_kind: 'opl_quality_gate_runtime_binding';
  schema_version: 'quality-gate-runtime-binding.v1';
  stage_run_ref: string;
  stage_manifest_ref: string;
  current_pointer_ref: string;
  source_fingerprint: string;
  idempotency_key: string;
  provider_attempt_ref: string;
  quality_gate_attempt_ref: string;
  receipt_ref: string;
  receipt_kind: QualityGateRuntimeReceiptKind;
  receipt_owner: string;
  owner_answer_kind: QualityGateRuntimeReceiptKind;
  next_owner: string;
  binding_status: 'bound';
  authority_boundary: ReturnType<typeof qualityGateRuntimeAuthorityBoundary>;
};

export type QualityGateRuntimeBindingInput = Omit<
  QualityGateRuntimeBinding,
  'surface_kind' | 'schema_version' | 'owner_answer_kind' | 'binding_status' | 'authority_boundary'
>;

function nonEmptyString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `QualityGateRuntime binding requires ${field}.`, {
      field,
    });
  }
  return value.trim();
}

function receiptKind(value: unknown) {
  if (
    typeof value !== 'string'
    || !QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS.includes(value as QualityGateRuntimeReceiptKind)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'QualityGateRuntime binding requires a known receipt_kind.',
      {
        field: 'receipt_kind',
        expected: [...QUALITY_GATE_RUNTIME_ALLOWED_RECEIPT_KINDS],
        actual: value,
      },
    );
  }
  return value as QualityGateRuntimeReceiptKind;
}

function qualityGateRuntimeAuthorityBoundary() {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_claim_publication_ready: false,
    can_claim_package_ready: false,
    can_claim_production_ready: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    quality_gate_receipt_is_domain_owned_answer_ref: true,
  } as const;
}

export function buildQualityGateRuntimeBinding(
  input: QualityGateRuntimeBindingInput,
): QualityGateRuntimeBinding {
  return validateQualityGateRuntimeBinding({
    surface_kind: 'opl_quality_gate_runtime_binding',
    schema_version: 'quality-gate-runtime-binding.v1',
    stage_run_ref: input.stage_run_ref,
    stage_manifest_ref: input.stage_manifest_ref,
    current_pointer_ref: input.current_pointer_ref,
    source_fingerprint: input.source_fingerprint,
    idempotency_key: input.idempotency_key,
    provider_attempt_ref: input.provider_attempt_ref,
    quality_gate_attempt_ref: input.quality_gate_attempt_ref,
    receipt_ref: input.receipt_ref,
    receipt_kind: input.receipt_kind,
    receipt_owner: input.receipt_owner,
    owner_answer_kind: input.receipt_kind,
    next_owner: input.next_owner,
    binding_status: 'bound',
    authority_boundary: qualityGateRuntimeAuthorityBoundary(),
  });
}

export function validateQualityGateRuntimeBinding(value: unknown): QualityGateRuntimeBinding {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'QualityGateRuntime binding must be an object.');
  }
  const surfaceKind = nonEmptyString(value.surface_kind, 'surface_kind');
  if (surfaceKind !== 'opl_quality_gate_runtime_binding') {
    throw new FrameworkContractError('contract_shape_invalid', 'QualityGateRuntime binding surface_kind must be canonical.', {
      field: 'surface_kind',
      actual: surfaceKind,
    });
  }
  const schemaVersion = nonEmptyString(value.schema_version, 'schema_version');
  if (schemaVersion !== 'quality-gate-runtime-binding.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'QualityGateRuntime binding schema_version must be canonical.', {
      field: 'schema_version',
      actual: schemaVersion,
    });
  }
  const kind = receiptKind(value.receipt_kind);
  const ownerAnswerKind = receiptKind(value.owner_answer_kind);
  if (ownerAnswerKind !== kind) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'QualityGateRuntime binding owner_answer_kind must match receipt_kind.',
      {
        field: 'owner_answer_kind',
        receipt_kind: kind,
        actual: ownerAnswerKind,
      },
    );
  }
  if (value.binding_status !== 'bound') {
    throw new FrameworkContractError('contract_shape_invalid', 'QualityGateRuntime binding_status must be bound.', {
      field: 'binding_status',
      actual: value.binding_status,
    });
  }
  const providerAttemptRef = nonEmptyString(value.provider_attempt_ref, 'provider_attempt_ref');
  const qualityGateAttemptRef = nonEmptyString(value.quality_gate_attempt_ref, 'quality_gate_attempt_ref');
  if (kind === 'quality_gate_receipt' && qualityGateAttemptRef === providerAttemptRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'QualityGateRuntime binding requires an independent quality_gate_attempt_ref for quality gate receipts.',
      {
        field: 'quality_gate_attempt_ref',
        provider_attempt_ref: providerAttemptRef,
        same_attempt_self_review_can_close_quality_gate: false,
      },
    );
  }
  return {
    surface_kind: 'opl_quality_gate_runtime_binding',
    schema_version: 'quality-gate-runtime-binding.v1',
    stage_run_ref: nonEmptyString(value.stage_run_ref, 'stage_run_ref'),
    stage_manifest_ref: nonEmptyString(value.stage_manifest_ref, 'stage_manifest_ref'),
    current_pointer_ref: nonEmptyString(value.current_pointer_ref, 'current_pointer_ref'),
    source_fingerprint: nonEmptyString(value.source_fingerprint, 'source_fingerprint'),
    idempotency_key: nonEmptyString(value.idempotency_key, 'idempotency_key'),
    provider_attempt_ref: providerAttemptRef,
    quality_gate_attempt_ref: qualityGateAttemptRef,
    receipt_ref: nonEmptyString(value.receipt_ref, 'receipt_ref'),
    receipt_kind: kind,
    receipt_owner: nonEmptyString(value.receipt_owner, 'receipt_owner'),
    owner_answer_kind: ownerAnswerKind,
    next_owner: nonEmptyString(value.next_owner, 'next_owner'),
    binding_status: 'bound',
    authority_boundary: qualityGateRuntimeAuthorityBoundary(),
  };
}
