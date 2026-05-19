import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';

type RequiredValidityRefKind =
  | 'domain_contract_review_ref'
  | 'intent_validation_ref'
  | 'owner_acceptance_ref';

export type FamilyStageDomainValidityStatus =
  | 'validated'
  | 'needs_domain_review'
  | 'blocked_invalid_or_stale_review';

export interface FamilyStageDomainValidityCounterexample {
  stage_id: string;
  blocker_kind: 'missing_domain_validity_refs' | 'invalid_or_stale_domain_validity_ref';
  missing_ref_kinds?: RequiredValidityRefKind[];
  invalid_or_stale_refs?: string[];
  reason: string;
}

export interface FamilyStageDomainValidityStage {
  stage_id: string;
  owner: string;
  review_status: FamilyStageDomainValidityStatus;
  domain_validity_required: boolean;
  domain_contract_review_refs: FamilyStageSurfaceRef[];
  intent_validation_refs: FamilyStageSurfaceRef[];
  owner_acceptance_refs: FamilyStageSurfaceRef[];
  invalid_or_stale_refs: string[];
  minimal_counterexamples: FamilyStageDomainValidityCounterexample[];
}

export interface FamilyStageDomainValidityProjection {
  surface_kind: 'opl_family_stage_domain_validity_projection';
  version: 'family-stage-domain-validity.v1';
  plane_id: string;
  target_domain_id: string;
  summary: {
    stage_count: number;
    validated_count: number;
    needs_domain_review_count: number;
    blocked_invalid_or_stale_review_count: number;
    blocker_count: number;
  };
  stages: FamilyStageDomainValidityStage[];
  authority_boundary: {
    opl_role: 'domain_validity_refs_projection_only';
    refs_only: true;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refs(stage: FamilyStageDescriptor, field: keyof NonNullable<FamilyStageDescriptor['stage_contract']>) {
  const value = stage.stage_contract?.[field];
  return Array.isArray(value)
    ? value.filter((entry): entry is FamilyStageSurfaceRef => isRecord(entry) && 'ref' in entry)
    : [];
}

function refText(value: FamilyStageSurfaceRef) {
  return Array.isArray(value.ref) ? value.ref.join(' ') : value.ref;
}

function refFromProperty(value: string, kind: RequiredValidityRefKind): FamilyStageSurfaceRef | null {
  const marker = `${kind}:`;
  if (!value.startsWith(marker)) {
    return null;
  }
  const ref = value.slice(marker.length).trim();
  return ref ? { ref_kind: 'property_ref', ref, role: kind } : null;
}

function matchesKind(value: FamilyStageSurfaceRef, kinds: string[]) {
  const role = typeof value.role === 'string' ? value.role.trim().toLowerCase() : '';
  const refKind = typeof value.ref_kind === 'string' ? value.ref_kind.trim().toLowerCase() : '';
  const kindSet = new Set(kinds.map((entry) => entry.toLowerCase()));
  return kindSet.has(role) || kindSet.has(refKind);
}

function collectKindRefs(
  stage: FamilyStageDescriptor,
  kind: RequiredValidityRefKind,
  aliases: string[],
) {
  const propertyRefs = (stage.stage_contract?.properties ?? [])
    .map((value) => refFromProperty(value, kind))
    .filter((value): value is FamilyStageSurfaceRef => value !== null);
  const surfaceRefs = [
    ...refs(stage, 'monitor_refs'),
    ...refs(stage, 'metric_refs'),
    ...refs(stage, 'dashboard_metric_refs'),
    ...(stage.evaluation ?? []),
    ...(stage.source_refs ?? []),
  ].filter((value) => matchesKind(value, [kind, ...aliases]));
  return uniqueRefs([...propertyRefs, ...surfaceRefs]);
}

function uniqueRefs(values: FamilyStageSurfaceRef[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.ref_kind ?? ''}:${value.role ?? ''}:${refText(value)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function domainValidityRequired(stage: FamilyStageDescriptor) {
  const trust = stage.trust_boundary;
  return Boolean(
    stage.stage_kind === 'review'
    || (stage.stage_contract?.boundary_assumptions.length ?? 0) > 0
    || trust?.effect_boundary === true
    || trust?.records_runtime_events === true
    || trust?.human_gate_required === true
    || trust?.owner_receipt_required === true
    || stage.authority_boundary.independent_gate_receipt_required === true,
  );
}

function collectInvalidOrStaleRefs(stage: FamilyStageDescriptor) {
  const propertyRefs = (stage.stage_contract?.properties ?? [])
    .filter((value) => value.startsWith('stale_') || value.startsWith('invalid_'))
    .map((value) => value.split(':').slice(1).join(':').trim())
    .filter(Boolean);
  const surfaceRefs = [
    ...refs(stage, 'monitor_refs'),
    ...refs(stage, 'metric_refs'),
    ...refs(stage, 'dashboard_metric_refs'),
    ...(stage.evaluation ?? []),
    ...(stage.source_refs ?? []),
  ].filter((value) => {
    const kind = typeof value.ref_kind === 'string' ? value.ref_kind.toLowerCase() : '';
    const role = typeof value.role === 'string' ? value.role.toLowerCase() : '';
    return kind.startsWith('stale_') || kind.startsWith('invalid_') || role.startsWith('stale_') || role.startsWith('invalid_');
  }).map(refText);
  return [...new Set([...propertyRefs, ...surfaceRefs])];
}

function buildStage(stage: FamilyStageDescriptor): FamilyStageDomainValidityStage {
  const domainContractReviewRefs = collectKindRefs(stage, 'domain_contract_review_ref', ['domain_contract_review']);
  const intentValidationRefs = collectKindRefs(stage, 'intent_validation_ref', ['intent_validation']);
  const ownerAcceptanceRefs = collectKindRefs(stage, 'owner_acceptance_ref', ['owner_acceptance']);
  const invalidOrStaleRefs = collectInvalidOrStaleRefs(stage);
  const required = domainValidityRequired(stage);
  const missingRefKinds: RequiredValidityRefKind[] = [];
  if (domainContractReviewRefs.length === 0) {
    missingRefKinds.push('domain_contract_review_ref');
  }
  if (intentValidationRefs.length === 0) {
    missingRefKinds.push('intent_validation_ref');
  }
  if (ownerAcceptanceRefs.length === 0) {
    missingRefKinds.push('owner_acceptance_ref');
  }

  const counterexamples: FamilyStageDomainValidityCounterexample[] = [];
  if (invalidOrStaleRefs.length > 0) {
    counterexamples.push({
      stage_id: stage.stage_id,
      blocker_kind: 'invalid_or_stale_domain_validity_ref',
      invalid_or_stale_refs: invalidOrStaleRefs,
      reason: 'domain validity review refs are explicitly marked invalid or stale',
    });
  } else if (required && missingRefKinds.length > 0) {
    counterexamples.push({
      stage_id: stage.stage_id,
      blocker_kind: 'missing_domain_validity_refs',
      missing_ref_kinds: missingRefKinds,
      reason: 'stage contract can be admitted or launchable while its business intent has no domain-owner review refs',
    });
  }

  const reviewStatus: FamilyStageDomainValidityStatus = invalidOrStaleRefs.length > 0
    ? 'blocked_invalid_or_stale_review'
    : required && missingRefKinds.length > 0
      ? 'needs_domain_review'
      : 'validated';

  return {
    stage_id: stage.stage_id,
    owner: stage.owner,
    review_status: reviewStatus,
    domain_validity_required: required,
    domain_contract_review_refs: domainContractReviewRefs,
    intent_validation_refs: intentValidationRefs,
    owner_acceptance_refs: ownerAcceptanceRefs,
    invalid_or_stale_refs: invalidOrStaleRefs,
    minimal_counterexamples: counterexamples,
  };
}

export function buildFamilyStageDomainValidityProjection(
  plane: FamilyStageControlPlane,
): FamilyStageDomainValidityProjection {
  const stages = plane.stages.map(buildStage);
  return {
    surface_kind: 'opl_family_stage_domain_validity_projection',
    version: 'family-stage-domain-validity.v1',
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    summary: {
      stage_count: stages.length,
      validated_count: stages.filter((stage) => stage.review_status === 'validated').length,
      needs_domain_review_count: stages.filter((stage) => stage.review_status === 'needs_domain_review').length,
      blocked_invalid_or_stale_review_count: stages.filter((stage) => stage.review_status === 'blocked_invalid_or_stale_review').length,
      blocker_count: stages.filter((stage) => stage.review_status !== 'validated').length,
    },
    stages,
    authority_boundary: {
      opl_role: 'domain_validity_refs_projection_only',
      refs_only: true,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}
