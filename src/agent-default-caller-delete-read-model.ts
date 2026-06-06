import {
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
} from './default-caller-retirement-guard.ts';

type JsonRecord = Record<string, unknown>;

interface DefaultCallerPhysicalDeleteAuthorityPolicy {
  physical_delete_blocked_by: string[];
  not_authorized_claims: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function statusIsObserved(section: unknown) {
  return optionalString(record(section).status) === 'observed';
}

function compactSurfaceDeletionGate(worklist: JsonRecord) {
  return {
    surface_id: optionalString(worklist.surface_id) ?? 'unknown_surface',
    status: optionalString(worklist.status) ?? 'unknown',
    replacement_parity_observed: statusIsObserved(worklist.replacement_parity),
    active_caller_cutover_observed: statusIsObserved(worklist.active_caller_cutover),
    no_active_caller_proof_observed: statusIsObserved(worklist.no_active_caller_proof),
    domain_owner_receipt_or_typed_blocker_observed:
      statusIsObserved(worklist.domain_owner_receipt_or_typed_blocker),
    no_forbidden_write_proof_observed: statusIsObserved(worklist.no_forbidden_write_proof),
    tombstone_or_provenance_ref_observed: statusIsObserved(worklist.tombstone_or_provenance_ref),
    physical_delete_authorized: false,
    default_caller_delete_ready: false,
    needs_drilldown_for_surface_refs: true,
    next_required_owner_action: DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    accepted_refs_only_result_shapes: [
      ...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
    ],
    owner_decision_required_after_all_refs_observed: true,
  };
}

function repoDeletionGateSummary(
  report: JsonRecord,
  policy: DefaultCallerPhysicalDeleteAuthorityPolicy,
) {
  const summary = record(report.summary);
  const deletionGate = record(report.deletion_gate);
  const worklists = recordList(report.deletion_evidence_worklists);
  const physicalDeleteBlockedBy =
    stringList(deletionGate.physical_delete_blocked_by).length > 0
      ? stringList(deletionGate.physical_delete_blocked_by)
      : policy.physical_delete_blocked_by;
  const notAuthorizedClaims =
    stringList(deletionGate.not_authorized_claims).length > 0
      ? stringList(deletionGate.not_authorized_claims)
      : policy.not_authorized_claims;
  const missingDomainOwnerReceiptOrTypedBlockerCount =
    numberValue(summary.missing_domain_owner_receipt_or_typed_blocker_count);
  const missingNoActiveCallerProofCount =
    numberValue(summary.missing_no_active_caller_proof_count);
  const missingNoForbiddenWriteProofCount =
    numberValue(summary.missing_no_forbidden_write_proof_count);
  const missingTombstoneOrProvenanceRefCount =
    numberValue(summary.missing_tombstone_or_provenance_ref_count);
  const allRequirementsObserved = worklists.length > 0
    && missingDomainOwnerReceiptOrTypedBlockerCount === 0
    && missingNoActiveCallerProofCount === 0
    && missingNoForbiddenWriteProofCount === 0
    && missingTombstoneOrProvenanceRefCount === 0;

  const domainId = optionalString(report.domain_id) ?? 'unknown_domain';
  return {
    repo_id: domainId,
    domain_id: domainId,
    requested_agent_id: optionalString(report.requested_agent_id),
    repo_dir: optionalString(report.repo_dir),
    status: optionalString(report.status) ?? 'unknown',
    generated_default_caller_surface_count:
      numberValue(summary.generated_default_caller_surface_count),
    ready_surface_count: numberValue(summary.ready_surface_count),
    blocked_surface_count: numberValue(summary.blocked_surface_count),
    deletion_evidence_worklist_count: worklists.length,
    all_deletion_evidence_requirements_observed: allRequirementsObserved,
    missing_domain_owner_receipt_or_typed_blocker_count:
      missingDomainOwnerReceiptOrTypedBlockerCount,
    missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
    missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
    missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
    physical_delete_authorized: false,
    default_caller_delete_ready: false,
    generated_default_caller_readiness_can_authorize_physical_delete: false,
    physical_delete_authorization_status:
      optionalString(deletionGate.physical_delete_authorization_status)
      ?? 'not_authorized_by_opl_projection',
    physical_delete_authority_owner:
      optionalString(deletionGate.physical_delete_authority_owner)
      ?? 'domain_repo_owner_after_receipt_parity',
    retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
    mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    next_required_owner_action: DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    accepted_refs_only_result_shapes: [
      ...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
    ],
    owner_decision_required_after_all_refs_observed: true,
    physical_delete_blocked_by: physicalDeleteBlockedBy,
    not_authorized_claims: notAuthorizedClaims,
    needs_drilldown_for_surface_refs: worklists.length > 0,
    surface_deletion_gate_summary: worklists.map(compactSurfaceDeletionGate),
  };
}

export function buildDefaultCallerPhysicalDeleteAuthorityReadModel(
  reports: JsonRecord[],
  policy: DefaultCallerPhysicalDeleteAuthorityPolicy,
) {
  const repoSummaries = reports.map((report) => repoDeletionGateSummary(report, policy));
  const deletionEvidenceWorklistCount = repoSummaries.reduce(
    (total, repo) => total + repo.deletion_evidence_worklist_count,
    0,
  );
  const missingDomainOwnerReceiptOrTypedBlockerCount = repoSummaries.reduce(
    (total, repo) => total + repo.missing_domain_owner_receipt_or_typed_blocker_count,
    0,
  );
  const missingNoActiveCallerProofCount = repoSummaries.reduce(
    (total, repo) => total + repo.missing_no_active_caller_proof_count,
    0,
  );
  const missingNoForbiddenWriteProofCount = repoSummaries.reduce(
    (total, repo) => total + repo.missing_no_forbidden_write_proof_count,
    0,
  );
  const missingTombstoneOrProvenanceRefCount = repoSummaries.reduce(
    (total, repo) => total + repo.missing_tombstone_or_provenance_ref_count,
    0,
  );
  return {
    surface_kind: 'opl_default_caller_physical_delete_authority_read_model',
    projection_policy:
      'compact_refs_only_repo_summary_over_default_caller_deletion_evidence_worklists',
    status: 'not_authorized_by_opl_projection',
    total_repo_count: repoSummaries.length,
    deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
    all_repos_all_deletion_evidence_requirements_observed:
      repoSummaries.length > 0
      && repoSummaries.every((repo) => repo.all_deletion_evidence_requirements_observed),
    missing_domain_owner_receipt_or_typed_blocker_count:
      missingDomainOwnerReceiptOrTypedBlockerCount,
    missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
    missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
    missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
    zero_missing_deletion_evidence_is_not_delete_ready: true,
    observed_deletion_evidence_refs_are_refs_only_inputs: true,
    retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
    mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
    physical_delete_authorized: false,
    default_caller_delete_ready: false,
    generated_default_caller_readiness_can_authorize_physical_delete: false,
    physical_delete_authorization_status: 'not_authorized_by_opl_projection',
    physical_delete_authority_owner: 'domain_repo_owner_after_receipt_parity',
    next_required_owner_action: DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    accepted_refs_only_result_shapes: [
      ...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
    ],
    owner_decision_required_after_all_refs_observed: true,
    physical_delete_blocked_by: policy.physical_delete_blocked_by,
    not_authorized_claims: policy.not_authorized_claims,
    needs_drilldown_for_surface_refs: deletionEvidenceWorklistCount > 0,
    repo_deletion_gate_summary: repoSummaries,
    authority_boundary: {
      read_model_can_write_domain_truth: false,
      read_model_can_sign_domain_owner_receipt: false,
      read_model_can_authorize_quality_or_export: false,
      read_model_can_mutate_domain_artifacts: false,
      read_model_can_authorize_domain_repo_physical_delete: false,
      read_model_can_claim_domain_ready: false,
      read_model_can_claim_production_ready: false,
    },
  };
}
