import progressDeltaReceiptSchema from '../../../contracts/opl-framework/progress-delta-receipt.schema.json' with { type: 'json' };
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';

export const PROGRESS_DELTA_RECEIPT_DELTA_CLASSES = [
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

const PROGRESS_DELTA_RECEIPT_SCHEMA_ENTRY = {
  schemaId: 'opl.progress_delta_receipt.v1',
  schema: progressDeltaReceiptSchema,
  sourceRef: 'contracts/opl-framework/progress-delta-receipt.schema.json',
};

function canonicalString(value: string) {
  return value.trim();
}

function canonicalRefList(value: string[]) {
  return [...new Set(value.map((entry) => entry.trim()).filter(Boolean))];
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
    receipt_id: canonicalString(input.receipt_id),
    domain_id: canonicalString(input.domain_id),
    task_or_study_ref: canonicalString(input.task_or_study_ref),
    stage_ref: canonicalString(input.stage_ref),
    producer: canonicalString(input.producer),
    delta_classification: input.delta_classification,
    changed_surfaces: canonicalRefList(input.changed_surfaces),
    produced_refs: canonicalRefList(input.produced_refs),
    consumed_refs: canonicalRefList(input.consumed_refs),
    next_owner: canonicalString(input.next_owner),
    next_required_delta: canonicalString(input.next_required_delta),
    authority_boundary: progressDeltaReceiptAuthorityBoundary(),
  });
}

export function validateProgressDeltaReceipt(value: unknown): ProgressDeltaReceipt {
  assertJsonSchemaPayload(PROGRESS_DELTA_RECEIPT_SCHEMA_ENTRY, value);
  const receipt = value as ProgressDeltaReceipt;
  return {
    surface_kind: 'opl_progress_delta_receipt',
    schema_version: 'progress-delta-receipt.v1',
    receipt_id: canonicalString(receipt.receipt_id),
    domain_id: canonicalString(receipt.domain_id),
    task_or_study_ref: canonicalString(receipt.task_or_study_ref),
    stage_ref: canonicalString(receipt.stage_ref),
    producer: canonicalString(receipt.producer),
    delta_classification: receipt.delta_classification,
    changed_surfaces: canonicalRefList(receipt.changed_surfaces),
    produced_refs: canonicalRefList(receipt.produced_refs),
    consumed_refs: canonicalRefList(receipt.consumed_refs),
    next_owner: canonicalString(receipt.next_owner),
    next_required_delta: canonicalString(receipt.next_required_delta),
    authority_boundary: progressDeltaReceiptAuthorityBoundary(),
  };
}
