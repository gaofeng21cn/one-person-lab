import { FrameworkContractError } from '../charter/index.ts';

type JsonRecord = Record<string, unknown>;

export const PROGRESS_DELTA_RECEIPT_DELTA_CLASSES = [
  'paper_progress_delta',
  'deliverable_progress_delta',
  'platform_repair_delta',
  'advisory_delta',
  'typed_blocker',
  'human_gate',
] as const;

export type ProgressDeltaReceiptDeltaClass =
  typeof PROGRESS_DELTA_RECEIPT_DELTA_CLASSES[number];

export type ProgressDeltaReceipt = {
  surface_kind: 'opl_progress_delta_receipt';
  schema_version: 'progress-delta-receipt.v1';
  receipt_id: string;
  domain_id: string;
  task_or_study_ref: string;
  stage_ref: string;
  producer: string;
  delta_classification: ProgressDeltaReceiptDeltaClass;
  changed_surfaces: string[];
  produced_refs: string[];
  consumed_refs: string[];
  next_owner: string;
  next_required_delta: string;
  authority_boundary: ReturnType<typeof progressDeltaReceiptAuthorityBoundary>;
};

export type ProgressDeltaReceiptInput = Omit<
  ProgressDeltaReceipt,
  'surface_kind' | 'schema_version' | 'authority_boundary'
>;

export type StageProgressDeltaClassification =
  | 'deliverable_progress'
  | 'platform_repair'
  | 'mixed'
  | 'typed_blocker'
  | 'human_gate'
  | 'stop_loss';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `ProgressDeltaReceipt requires ${field}.`, {
      field,
    });
  }
  return value.trim();
}

function stringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', `ProgressDeltaReceipt requires ${field}.`, {
      field,
    });
  }
  const refs = [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim()),
    ),
  ];
  if (refs.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `ProgressDeltaReceipt requires non-empty ${field}.`, {
      field,
    });
  }
  return refs;
}

function deltaClass(value: unknown) {
  if (
    typeof value !== 'string'
    || !PROGRESS_DELTA_RECEIPT_DELTA_CLASSES.includes(value as ProgressDeltaReceiptDeltaClass)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'ProgressDeltaReceipt requires a known delta_classification.',
      {
        field: 'delta_classification',
        expected: [...PROGRESS_DELTA_RECEIPT_DELTA_CLASSES],
        actual: value,
      },
    );
  }
  return value as ProgressDeltaReceiptDeltaClass;
}

function progressDeltaReceiptAuthorityBoundary() {
  return {
    can_authorize_stage_complete: false,
    can_authorize_publication_ready: false,
    can_authorize_package_ready: false,
    can_mutate_artifact_body: false,
    can_accept_or_reject_memory: false,
    can_claim_production_ready: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    platform_repair_counts_as_deliverable_progress: false,
  } as const;
}

export function progressDeltaReceiptDeltaClassFromStageClassification(
  value: StageProgressDeltaClassification,
): ProgressDeltaReceiptDeltaClass {
  switch (value) {
    case 'deliverable_progress':
      return 'deliverable_progress_delta';
    case 'platform_repair':
      return 'platform_repair_delta';
    case 'mixed':
      return 'deliverable_progress_delta';
    case 'human_gate':
      return 'human_gate';
    case 'typed_blocker':
    case 'stop_loss':
      return 'typed_blocker';
  }
}

export function buildProgressDeltaReceipt(input: ProgressDeltaReceiptInput): ProgressDeltaReceipt {
  return validateProgressDeltaReceipt({
    surface_kind: 'opl_progress_delta_receipt',
    schema_version: 'progress-delta-receipt.v1',
    receipt_id: input.receipt_id,
    domain_id: input.domain_id,
    task_or_study_ref: input.task_or_study_ref,
    stage_ref: input.stage_ref,
    producer: input.producer,
    delta_classification: input.delta_classification,
    changed_surfaces: input.changed_surfaces,
    produced_refs: input.produced_refs,
    consumed_refs: input.consumed_refs,
    next_owner: input.next_owner,
    next_required_delta: input.next_required_delta,
    authority_boundary: progressDeltaReceiptAuthorityBoundary(),
  });
}

export function validateProgressDeltaReceipt(value: unknown): ProgressDeltaReceipt {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'ProgressDeltaReceipt must be an object.');
  }
  const surfaceKind = nonEmptyString(value.surface_kind, 'surface_kind');
  if (surfaceKind !== 'opl_progress_delta_receipt') {
    throw new FrameworkContractError('contract_shape_invalid', 'ProgressDeltaReceipt surface_kind must be canonical.', {
      field: 'surface_kind',
      actual: surfaceKind,
    });
  }
  const schemaVersion = nonEmptyString(value.schema_version, 'schema_version');
  if (schemaVersion !== 'progress-delta-receipt.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'ProgressDeltaReceipt schema_version must be canonical.', {
      field: 'schema_version',
      actual: schemaVersion,
    });
  }
  return {
    surface_kind: 'opl_progress_delta_receipt',
    schema_version: 'progress-delta-receipt.v1',
    receipt_id: nonEmptyString(value.receipt_id, 'receipt_id'),
    domain_id: nonEmptyString(value.domain_id, 'domain_id'),
    task_or_study_ref: nonEmptyString(value.task_or_study_ref, 'task_or_study_ref'),
    stage_ref: nonEmptyString(value.stage_ref, 'stage_ref'),
    producer: nonEmptyString(value.producer, 'producer'),
    delta_classification: deltaClass(value.delta_classification),
    changed_surfaces: stringList(value.changed_surfaces, 'changed_surfaces'),
    produced_refs: stringList(value.produced_refs, 'produced_refs'),
    consumed_refs: stringList(value.consumed_refs, 'consumed_refs'),
    next_owner: nonEmptyString(value.next_owner, 'next_owner'),
    next_required_delta: nonEmptyString(value.next_required_delta, 'next_required_delta'),
    authority_boundary: progressDeltaReceiptAuthorityBoundary(),
  };
}
