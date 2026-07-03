import { isRecord } from '../../kernel/contract-validation.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';

export interface FamilyMemoryRefValue {
  ref_kind?: string;
  ref: string;
  role?: string;
  label?: string;
}

export interface FamilyDomainMemoryRef {
  surface_kind: 'family_domain_memory_ref';
  version: 'family-domain-memory-ref.v1';
  memory_ref_id: string;
  target_domain_id: string;
  owner: string;
  memory_family: string;
  memory_pack_ref: FamilyMemoryRefValue;
  stage_applicability: string[];
  retrieval_contract_ref: FamilyMemoryRefValue | null;
  writeback_contract_ref: FamilyMemoryRefValue | null;
  receipt_contract_ref: FamilyMemoryRefValue | null;
  recall_projection_ref: FamilyMemoryRefValue | null;
  migration_plan_ref: FamilyMemoryRefValue | null;
  seed_corpus_ref: FamilyMemoryRefValue | null;
  writeback_receipt_locator_ref: FamilyMemoryRefValue | null;
  provenance_refs: FamilyMemoryRefValue[];
  freshness: JsonRecord | null;
  migration_readiness: JsonRecord | null;
  receipt_projection: JsonRecord | null;
  status: string | null;
  authority_boundary: JsonRecord;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeRef(value: unknown, field: string): FamilyMemoryRefValue | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ...(optionalString(value.ref_kind) ? { ref_kind: optionalString(value.ref_kind)! } : {}),
    ref: requireString(value.ref, `${field}.ref`),
    ...(optionalString(value.role) ? { role: optionalString(value.role)! } : {}),
    ...(optionalString(value.label) ? { label: optionalString(value.label)! } : {}),
  };
}

function normalizeRefRequired(value: unknown, field: string) {
  const ref = normalizeRef(value, field);
  if (!ref) {
    throw new Error(`${field} must be an object.`);
  }
  return ref;
}

function normalizeRefs(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) => normalizeRef(entry, `${field}[${index}]`))
    .filter((entry): entry is FamilyMemoryRefValue => Boolean(entry));
}

export function normalizeFamilyDomainMemoryRef(
  value: unknown,
  field = 'domain_memory_descriptor',
): FamilyDomainMemoryRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const surfaceKind = requireString(value.surface_kind, `${field}.surface_kind`);
  if (surfaceKind !== 'family_domain_memory_ref') {
    throw new Error(`${field}.surface_kind must be family_domain_memory_ref.`);
  }
  const version = requireString(value.version, `${field}.version`);
  if (version !== 'family-domain-memory-ref.v1') {
    throw new Error(`${field}.version must be family-domain-memory-ref.v1.`);
  }
  const authorityBoundary = isRecord(value.authority_boundary) ? value.authority_boundary : null;
  if (!authorityBoundary) {
    throw new Error(`${field}.authority_boundary must be an object.`);
  }
  const domainMemoryOwner = requireString(
    authorityBoundary.domain_memory_owner,
    `${field}.authority_boundary.domain_memory_owner`,
  );
  if (domainMemoryOwner.trim().toLowerCase() === 'opl') {
    throw new Error(`${field}.authority_boundary.domain_memory_owner must remain a domain owner, not OPL.`);
  }
  const forbidden = readStringList(authorityBoundary.forbidden_opl_authority);
  if (!forbidden.includes('memory_store_owner')) {
    throw new Error(`${field}.authority_boundary.forbidden_opl_authority must include memory_store_owner.`);
  }
  if (authorityBoundary.can_accept_memory_write === true) {
    throw new Error(`${field}.authority_boundary.can_accept_memory_write must remain false when provided.`);
  }
  if (authorityBoundary.can_write_domain_truth === true) {
    throw new Error(`${field}.authority_boundary.can_write_domain_truth must remain false when provided.`);
  }
  const stageApplicability = readStringList(value.stage_applicability);
  if (stageApplicability.length === 0) {
    throw new Error(`${field}.stage_applicability must contain at least one stage.`);
  }

  return {
    surface_kind: 'family_domain_memory_ref',
    version: 'family-domain-memory-ref.v1',
    memory_ref_id: requireString(value.memory_ref_id, `${field}.memory_ref_id`),
    target_domain_id: requireString(value.target_domain_id, `${field}.target_domain_id`),
    owner: requireString(value.owner, `${field}.owner`),
    memory_family: requireString(value.memory_family, `${field}.memory_family`),
    memory_pack_ref: normalizeRefRequired(value.memory_pack_ref, `${field}.memory_pack_ref`),
    stage_applicability: stageApplicability,
    retrieval_contract_ref: normalizeRef(value.retrieval_contract_ref, `${field}.retrieval_contract_ref`),
    writeback_contract_ref: normalizeRef(value.writeback_contract_ref, `${field}.writeback_contract_ref`),
    receipt_contract_ref: normalizeRef(value.receipt_contract_ref, `${field}.receipt_contract_ref`),
    recall_projection_ref: normalizeRef(value.recall_projection_ref, `${field}.recall_projection_ref`),
    migration_plan_ref: normalizeRef(value.migration_plan_ref, `${field}.migration_plan_ref`),
    seed_corpus_ref: normalizeRef(value.seed_corpus_ref, `${field}.seed_corpus_ref`),
    writeback_receipt_locator_ref: normalizeRef(
      value.writeback_receipt_locator_ref,
      `${field}.writeback_receipt_locator_ref`,
    ),
    provenance_refs: normalizeRefs(value.provenance_refs, `${field}.provenance_refs`),
    freshness: isRecord(value.freshness) ? value.freshness : null,
    migration_readiness: isRecord(value.migration_readiness) ? value.migration_readiness : null,
    receipt_projection: isRecord(value.receipt_projection) ? value.receipt_projection : null,
    status: optionalString(value.status),
    authority_boundary: authorityBoundary,
  };
}
