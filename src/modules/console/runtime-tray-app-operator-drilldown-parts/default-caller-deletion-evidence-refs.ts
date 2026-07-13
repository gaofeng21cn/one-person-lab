import fs from 'node:fs';
import path from 'node:path';

import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from '../../atlas/index.ts';
import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildGeneratedInterfaceBundle,
} from '../../pack/index.ts';
import {
  buildAgentDefaultCallerReadinessForRepo,
} from '../../foundry-lab/index.ts';
import { defaultCallerSurfaceGates } from '../../foundry-lab/index.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
  DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
  defaultCallerOwnerDecisionCloseoutReadout,
} from '../../foundry-lab/index.ts';

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((entry) => entry.trim().length > 0))];
}

const DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS = [
  'domain_repo_physical_delete_authorization',
  'default_caller_delete_ready',
  'domain_ready',
  'production_ready',
  'quality_verdict',
  'artifact_authority',
] as const;

function refsOnlyAuthorityBoundary() {
  return {
    ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
    projection_can_sign_domain_owner_receipt: false,
    projection_can_authorize_domain_repo_physical_delete: false,
    projection_can_claim_default_caller_delete_ready: false,
  };
}

function descriptorStatus(value: unknown) {
  return isRecord(value) ? 'resolved' : 'missing';
}

function descriptorForManifest(project: DomainManifestCatalogEntry, manifest: NormalizedDomainManifest) {
  return {
    project_id: project.project_id,
    project: project.project,
    target_domain_id: manifest.target_domain_id,
    agent_id: manifest.target_domain_id,
    entry: {
      status: 'resolved',
      raw_descriptor: {
        target_domain_id: manifest.target_domain_id,
        formal_entry: manifest.formal_entry,
      },
    },
    family_action_catalog: {
      status: descriptorStatus(manifest.family_action_catalog),
      raw_descriptor: manifest.family_action_catalog,
    },
    family_stage_control_plane: {
      status: descriptorStatus(manifest.family_stage_control_plane),
      raw_descriptor: manifest.family_stage_control_plane,
    },
    domain_memory_descriptor: {
      status: descriptorStatus(manifest.domain_memory_descriptor),
      raw_descriptor: manifest.domain_memory_descriptor,
    },
    generated_surface_handoff_contract: manifest.generated_surface_handoff,
    functional_privatization_audit: {
      status: stringValue(manifest.functional_privatization_audit?.status) ?? 'resolved',
      summary: record(manifest.functional_privatization_audit?.summary),
      modules: recordList(manifest.functional_privatization_audit?.modules),
    },
    session_continuity_contract: manifest.session_continuity,
    source_contract_consumption: {
      source: 'domain_manifest_projection',
      project_id: project.project_id,
      binding_id: project.binding_id,
      workspace_path: project.workspace_path,
    },
  };
}

function compilerStatusForManifest(manifest: NormalizedDomainManifest) {
  return manifest.family_action_catalog && manifest.family_stage_control_plane
    ? 'ready'
    : 'blocked';
}

function requirementStatus(worklist: JsonRecord, requirementId: string) {
  return stringValue(record(worklist[requirementId]).status);
}

function requirementEvidenceRefs(worklist: JsonRecord, requirementId: string) {
  return stringList(record(worklist[requirementId]).evidence_refs);
}

function missingRequirementIds(worklist: JsonRecord) {
  return stringList(worklist.requirement_ids).filter((requirementId) => (
    requirementStatus(worklist, requirementId) !== 'observed'
  ));
}

function ownerDecisionStatus(deleteOrKeepPrerequisitesObserved: boolean, allRequirementsObserved: boolean) {
  if (!deleteOrKeepPrerequisitesObserved) {
    return 'waiting_for_structural_prerequisites';
  }
  if (!allRequirementsObserved) {
    return 'owner_decision_required';
  }
  return 'owner_decision_observed_refs_only_not_delete_authorized';
}

function ownerDecisionShapeFromWorklist(worklist: JsonRecord) {
  const domainDecision = record(worklist.domain_owner_receipt_or_typed_blocker);
  return stringValue(worklist.owner_decision_result_shape)
    ?? stringValue(domainDecision.owner_decision_result_shape);
}

function compactDeletionEvidenceWorklist(worklist: JsonRecord) {
  const surfaceId = stringValue(worklist.surface_id) ?? 'unknown_surface';
  const missingIds = missingRequirementIds(worklist);
  const deleteOrKeepPrerequisitesObserved =
    requirementStatus(worklist, 'replacement_parity') === 'observed'
    && requirementStatus(worklist, 'active_caller_cutover') === 'observed'
    && requirementStatus(worklist, 'no_active_caller_proof') === 'observed'
    && requirementStatus(worklist, 'no_forbidden_write_proof') === 'observed'
    && requirementStatus(worklist, 'tombstone_or_provenance_ref') === 'observed';
  const allRequirementsObserved =
    stringList(worklist.requirement_ids).length > 0
    && missingIds.length === 0;
  const structuralOwnerDecisionMissingCount =
    deleteOrKeepPrerequisitesObserved && !allRequirementsObserved ? 1 : 0;
  const ownerDecisionResultShape = ownerDecisionShapeFromWorklist(worklist);
  const acceptedRefsOnlyResultShapes = deleteOrKeepPrerequisitesObserved
    ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
    : ['typed_blocker_ref'];
  return {
    ref: `opl://default-callers/${surfaceId}/deletion-evidence`,
    role: 'default_caller_deletion_evidence_worklist_ref',
    surface_kind: stringValue(worklist.surface_kind),
    surface_id: surfaceId,
    status: stringValue(worklist.status),
    requirement_ids: stringList(worklist.requirement_ids),
    missing_requirement_ids: missingIds,
    missing_requirement_count: missingIds.length,
    requirements: Object.fromEntries(stringList(worklist.requirement_ids).map((requirementId) => [
      requirementId,
      {
        status: requirementStatus(worklist, requirementId),
        evidence_refs: requirementEvidenceRefs(worklist, requirementId),
      },
    ])),
    replacement_parity_source_refs: stringList(record(worklist.replacement_parity).source_refs),
    active_caller_cutover: {
      status: requirementStatus(worklist, 'active_caller_cutover'),
      proof_status: stringValue(record(worklist.active_caller_cutover).proof_status),
      target_kind: stringValue(record(worklist.active_caller_cutover).target_kind),
      active_caller_module_id: stringValue(record(worklist.active_caller_cutover).active_caller_module_id),
    },
    retention_reason: stringValue(worklist.retention_reason),
    cannot_absorb_reason: stringValue(worklist.cannot_absorb_reason),
    audit_visibility: stringValue(worklist.audit_visibility),
    semantic_equivalence_status: stringValue(worklist.semantic_equivalence_status),
    retirement_guard: {
      target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      static_retirement_prerequisite_gate_ids: [
        ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
      ],
      non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
      same_work_unit_live_evidence_scope: {
        ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
      },
      physical_delete_authorized: false,
      refs_only_receipt_can_authorize_physical_delete: false,
    },
    physical_delete_authorized: false,
    default_caller_delete_ready: false,
    worklist_item_is_completion_claim: false,
    physical_delete_authorization_status: 'not_authorized_by_opl_projection',
    owner_decision_result_shape: ownerDecisionResultShape,
    ...defaultCallerOwnerDecisionCloseoutReadout({
      prerequisitesObserved: deleteOrKeepPrerequisitesObserved,
      ownerDecisionObserved: allRequirementsObserved,
      ownerDecisionResultShape,
    }),
    owner_decision_status: ownerDecisionStatus(
      deleteOrKeepPrerequisitesObserved,
      allRequirementsObserved,
    ),
    structural_prerequisites_observed_but_domain_owner_decision_missing_count:
      structuralOwnerDecisionMissingCount,
    missing_gate_groups: {
      structural_prerequisites: {
        status: missingIds.some((missingId) => [
          'no_active_caller_proof',
          'no_forbidden_write_proof',
          'tombstone_or_provenance_ref',
        ].includes(missingId)) ? 'missing' : 'observed',
        missing_gate_ids: missingIds.filter((missingId) => [
          'no_active_caller_proof',
          'no_forbidden_write_proof',
          'tombstone_or_provenance_ref',
        ].includes(missingId)),
      },
      domain_owner_decision: {
        status: ownerDecisionStatus(deleteOrKeepPrerequisitesObserved, allRequirementsObserved),
        gate_id: 'domain_owner_receipt_or_typed_blocker',
        missing_count: structuralOwnerDecisionMissingCount,
      },
    },
    delete_or_keep_prerequisites_observed: deleteOrKeepPrerequisitesObserved,
    owner_decision_required_after_prerequisites_observed: deleteOrKeepPrerequisitesObserved,
    next_required_owner_action: deleteOrKeepPrerequisitesObserved
      ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
      : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
    accepted_refs_only_result_shapes: acceptedRefsOnlyResultShapes,
    owner_decision_required_after_all_refs_observed: allRequirementsObserved,
    non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
    not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function repoPathForProject(project: DomainManifestCatalogEntry) {
  const workspacePath = stringValue(project.workspace_path);
  if (!workspacePath) {
    return null;
  }
  const repoDir = path.resolve(workspacePath);
  return fs.existsSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'))
    ? repoDir
    : null;
}

function buildDomainDefaultCallerDeletionRefsFromReadinessReport(
  project: DomainManifestCatalogEntry,
  report: JsonRecord,
) {
  const domainId = stringValue(report.domain_id) ?? project.manifest?.target_domain_id ?? project.project_id;
  const deletionWorklists = recordList(report.deletion_evidence_worklists)
    .map((worklist) => compactDeletionEvidenceWorklist(worklist));
  const readyWorklists = deletionWorklists.filter((worklist) =>
    worklist.status === 'domain_evidence_required'
  );
  const openRequirementCount = readyWorklists.reduce(
    (total, worklist) => total + worklist.missing_requirement_count,
    0,
  );
  const countMissing = (requirementId: string) => readyWorklists.filter((worklist) =>
    worklist.missing_requirement_ids.includes(requirementId)
  ).length;
  const deleteOrKeepPrerequisitesObserved = readyWorklists.length > 0
    && countMissing('no_active_caller_proof') === 0
    && countMissing('no_forbidden_write_proof') === 0
    && countMissing('tombstone_or_provenance_ref') === 0;
  const allReadyWorklistsObserved = readyWorklists.length > 0 && openRequirementCount === 0;
  const structuralOwnerDecisionMissingCount = readyWorklists.reduce((total, worklist) => (
    total + Number(
      worklist.structural_prerequisites_observed_but_domain_owner_decision_missing_count || 0,
    )
  ), 0);
  const reportSummary = record(report.summary);
  const reportDeletionGate = record(report.deletion_gate);
  const reportDeleteOrKeepPrerequisitesObserved =
    reportDeletionGate.delete_or_keep_prerequisites_observed === true
    || reportSummary.delete_or_keep_prerequisites_observed === true;
  const reportAllRequirementsObserved =
    reportDeletionGate.all_deletion_evidence_requirements_observed === true
    || reportSummary.no_further_opl_default_caller_delete_work === true
    || reportDeletionGate.no_further_opl_default_caller_delete_work === true;
  const effectiveDeleteOrKeepPrerequisitesObserved =
    deleteOrKeepPrerequisitesObserved || reportDeleteOrKeepPrerequisitesObserved;
  const effectiveAllRequirementsObserved =
    allReadyWorklistsObserved || reportAllRequirementsObserved;
  const ownerDecisionResultShape =
    stringValue(reportDeletionGate.owner_decision_result_shape)
    ?? stringValue(reportSummary.owner_decision_result_shape);
  const acceptedRefsOnlyResultShapes = deleteOrKeepPrerequisitesObserved
    ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
    : ['typed_blocker_ref'];
  return {
    ref: `opl://agents/${domainId}/default-caller-deletion-evidence`,
    role: 'default_caller_deletion_evidence_domain_refs',
    domain_id: domainId,
    project_id: project.project_id,
    binding_id: project.binding_id,
    workspace_path: project.workspace_path,
    status: openRequirementCount > 0
      ? 'domain_evidence_required'
      : 'structural_projection_clear_no_physical_delete_authorized',
    source: 'agent_default_caller_readiness_repo_projection',
    source_command: `opl agents default-callers --agent ${domainId}=${project.workspace_path ?? '<repo>'} --json`,
    generated_interface_status: stringValue(report.generated_interface_status),
    active_caller_cutover_proof_status:
      stringValue(report.active_caller_cutover_proof_status),
    active_caller_target_proof_status:
      stringValue(report.active_caller_target_proof_status),
    generated_wrapper_bundle_status:
      stringValue(report.generated_wrapper_bundle_status),
    deletion_evidence_worklists: deletionWorklists,
    summary: {
      deletion_evidence_worklist_count: deletionWorklists.length,
      ready_domain_evidence_worklist_count: readyWorklists.length,
      blocked_until_replacement_ready_count:
        deletionWorklists.filter((worklist) => worklist.status !== 'domain_evidence_required').length,
      open_deletion_evidence_requirement_count: openRequirementCount,
      missing_domain_owner_receipt_or_typed_blocker_count:
        countMissing('domain_owner_receipt_or_typed_blocker'),
      missing_no_active_caller_proof_count:
        countMissing('no_active_caller_proof'),
      missing_no_forbidden_write_proof_count:
        countMissing('no_forbidden_write_proof'),
      missing_tombstone_or_provenance_ref_count:
        countMissing('tombstone_or_provenance_ref'),
      mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      static_retirement_prerequisite_gate_ids: [
        ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
      ],
      retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
      same_work_unit_live_evidence_scope: {
        ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
      },
      physical_delete_authorized: false,
      default_caller_delete_ready: false,
      deletion_evidence_requirements_are_completion_claims: false,
      owner_decision_result_shape: ownerDecisionResultShape,
      ...defaultCallerOwnerDecisionCloseoutReadout({
        prerequisitesObserved: effectiveDeleteOrKeepPrerequisitesObserved,
        ownerDecisionObserved: effectiveAllRequirementsObserved,
        ownerDecisionResultShape,
      }),
      owner_decision_status: ownerDecisionStatus(
        effectiveDeleteOrKeepPrerequisitesObserved,
        effectiveAllRequirementsObserved,
      ),
      structural_prerequisites_observed_but_domain_owner_decision_missing_count:
        structuralOwnerDecisionMissingCount,
      delete_or_keep_prerequisites_observed: effectiveDeleteOrKeepPrerequisitesObserved,
      owner_decision_required_after_prerequisites_observed:
        effectiveDeleteOrKeepPrerequisitesObserved,
      next_required_owner_action: effectiveDeleteOrKeepPrerequisitesObserved
        ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
        : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
      accepted_refs_only_result_shapes: acceptedRefsOnlyResultShapes,
      owner_decision_required_after_all_refs_observed: effectiveAllRequirementsObserved,
      not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function buildDomainDefaultCallerDeletionRefs(project: DomainManifestCatalogEntry) {
  const repoDir = repoPathForProject(project);
  if (repoDir) {
    const report = buildAgentDefaultCallerReadinessForRepo(repoDir, project.project_id);
    return buildDomainDefaultCallerDeletionRefsFromReadinessReport(project, report);
  }
  if (project.status !== 'resolved' || !project.manifest) {
    return null;
  }
  const domainId = project.manifest.target_domain_id ?? project.project_id;
  const descriptor = descriptorForManifest(project, project.manifest);
  const bundle = buildGeneratedInterfaceBundle(
    descriptor,
    compilerStatusForManifest(project.manifest),
    'all',
  );
  const surfaceGates = defaultCallerSurfaceGates(bundle);
  const deletionWorklists = surfaceGates
    .map((gate) => compactDeletionEvidenceWorklist(record(gate.deletion_evidence_worklist)));
  const readyWorklists = deletionWorklists.filter((worklist) =>
    worklist.status === 'domain_evidence_required'
  );
  const openRequirementCount = readyWorklists.reduce(
    (total, worklist) => total + worklist.missing_requirement_count,
    0,
  );
  const countMissing = (requirementId: string) => readyWorklists.filter((worklist) =>
    worklist.missing_requirement_ids.includes(requirementId)
  ).length;
  const deleteOrKeepPrerequisitesObserved = readyWorklists.length > 0
    && countMissing('no_active_caller_proof') === 0
    && countMissing('no_forbidden_write_proof') === 0
    && countMissing('tombstone_or_provenance_ref') === 0;
  const allReadyWorklistsObserved = readyWorklists.length > 0 && openRequirementCount === 0;
  const structuralOwnerDecisionMissingCount = readyWorklists.reduce((total, worklist) => (
    total + Number(
      worklist.structural_prerequisites_observed_but_domain_owner_decision_missing_count || 0,
    )
  ), 0);
  const allDeletionWorklistsObserved = deletionWorklists.length > 0
    && deletionWorklists.every((worklist) =>
      worklist.no_further_opl_default_caller_delete_work === true
      || Number(worklist.missing_requirement_count || 0) === 0
    );
  const effectiveDeleteOrKeepPrerequisitesObserved =
    deleteOrKeepPrerequisitesObserved || allDeletionWorklistsObserved;
  const effectiveAllRequirementsObserved =
    allReadyWorklistsObserved || allDeletionWorklistsObserved;
  const ownerDecisionResultShapes = uniqueStrings(
    deletionWorklists
      .map((worklist) => stringValue(worklist.owner_decision_result_shape))
      .filter((entry): entry is string => Boolean(entry)),
  );
  const ownerDecisionResultShape =
    ownerDecisionResultShapes.includes('keep_as_authority_adapter_ref')
      ? 'keep_as_authority_adapter_ref'
      : ownerDecisionResultShapes.includes('typed_blocker_ref')
        ? 'typed_blocker_ref'
        : ownerDecisionResultShapes.includes('owner_receipt_ref')
          ? 'owner_receipt_ref'
          : null;
  const acceptedRefsOnlyResultShapes = effectiveDeleteOrKeepPrerequisitesObserved
    ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
    : ['typed_blocker_ref'];
  return {
    ref: `opl://agents/${domainId}/default-caller-deletion-evidence`,
    role: 'default_caller_deletion_evidence_domain_refs',
    domain_id: domainId,
    project_id: project.project_id,
    binding_id: project.binding_id,
    workspace_path: project.workspace_path,
    status: openRequirementCount > 0
      ? 'domain_evidence_required'
      : 'structural_projection_clear_no_physical_delete_authorized',
    source: 'domain_manifest_projection',
    generated_interface_status: stringValue(bundle.status),
    active_caller_cutover_proof_status:
      stringValue(record(bundle.active_caller_cutover_proof).status),
    active_caller_target_proof_status:
      stringValue(record(bundle.active_caller_target_proof).status),
    generated_wrapper_bundle_status:
      stringValue(record(bundle.generated_wrapper_bundle).status),
    deletion_evidence_worklists: deletionWorklists,
    summary: {
      deletion_evidence_worklist_count: deletionWorklists.length,
      ready_domain_evidence_worklist_count: readyWorklists.length,
      blocked_until_replacement_ready_count:
        deletionWorklists.filter((worklist) => worklist.status !== 'domain_evidence_required').length,
      open_deletion_evidence_requirement_count: openRequirementCount,
      missing_domain_owner_receipt_or_typed_blocker_count:
        countMissing('domain_owner_receipt_or_typed_blocker'),
      missing_no_active_caller_proof_count:
        countMissing('no_active_caller_proof'),
      missing_no_forbidden_write_proof_count:
        countMissing('no_forbidden_write_proof'),
      missing_tombstone_or_provenance_ref_count:
        countMissing('tombstone_or_provenance_ref'),
      mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      static_retirement_prerequisite_gate_ids: [
        ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
      ],
      retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
      same_work_unit_live_evidence_scope: {
        ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
      },
      physical_delete_authorized: false,
      default_caller_delete_ready: false,
      deletion_evidence_requirements_are_completion_claims: false,
      owner_decision_result_shape: ownerDecisionResultShape,
      ...defaultCallerOwnerDecisionCloseoutReadout({
        prerequisitesObserved: effectiveDeleteOrKeepPrerequisitesObserved,
        ownerDecisionObserved: effectiveAllRequirementsObserved,
        ownerDecisionResultShape,
      }),
      owner_decision_status: ownerDecisionStatus(
        effectiveDeleteOrKeepPrerequisitesObserved,
        effectiveAllRequirementsObserved,
      ),
      structural_prerequisites_observed_but_domain_owner_decision_missing_count:
        structuralOwnerDecisionMissingCount,
      delete_or_keep_prerequisites_observed: effectiveDeleteOrKeepPrerequisitesObserved,
      owner_decision_required_after_prerequisites_observed:
        effectiveDeleteOrKeepPrerequisitesObserved,
      next_required_owner_action: effectiveDeleteOrKeepPrerequisitesObserved
        ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
        : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
      accepted_refs_only_result_shapes: acceptedRefsOnlyResultShapes,
      owner_decision_required_after_all_refs_observed: effectiveAllRequirementsObserved,
      not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function buildDefaultCallerDeletionEvidenceRefs(projects: DomainManifestCatalogEntry[]) {
  const domains = projects
    .map(buildDomainDefaultCallerDeletionRefs)
    .filter((entry): entry is NonNullable<ReturnType<typeof buildDomainDefaultCallerDeletionRefs>> =>
      Boolean(entry)
    );
  const sum = (field: string) => domains.reduce((total, domain) => (
    total + Number(record(domain.summary)[field] || 0)
  ), 0);
  const resolvedDomainCount = domains.length;
  const allDomainsReadyForOwnerDecision = resolvedDomainCount > 0
    && domains.every((domain) =>
      record(domain.summary).owner_decision_required_after_all_refs_observed === true
    );
  const allDomainsWithDeleteOrKeepPrerequisites = resolvedDomainCount > 0
    && domains.every((domain) =>
      record(domain.summary).owner_decision_required_after_prerequisites_observed === true
    );
  const acceptedRefsOnlyResultShapes = allDomainsWithDeleteOrKeepPrerequisites
    ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
    : ['typed_blocker_ref'];
  const structuralOwnerDecisionMissingCount = domains.reduce((total, domain) => (
    total + Number(
      record(domain.summary)
        .structural_prerequisites_observed_but_domain_owner_decision_missing_count || 0,
    )
  ), 0);
  const allDomainsNoFurtherOplDeleteWork = resolvedDomainCount > 0
    && domains.every((domain) =>
      record(domain.summary).no_further_opl_default_caller_delete_work === true
    );
  const ownerDecisionResultShapes = uniqueStrings(
    domains
      .map((domain) => stringValue(record(domain.summary).owner_decision_result_shape))
      .filter((entry): entry is string => Boolean(entry)),
  );
  const ownerDecisionResultShape =
    ownerDecisionResultShapes.includes('keep_as_authority_adapter_ref')
      ? 'keep_as_authority_adapter_ref'
      : ownerDecisionResultShapes.includes('typed_blocker_ref')
        ? 'typed_blocker_ref'
        : ownerDecisionResultShapes.includes('owner_receipt_ref')
          ? 'owner_receipt_ref'
          : null;
  return {
    surface_kind: 'opl_default_caller_deletion_evidence_refs',
    projection_policy:
      'refs_only_default_caller_delete_evidence_requirements_no_domain_truth_or_physical_delete_authority',
    domains,
    summary: {
      resolved_domain_count: resolvedDomainCount,
      domain_ids: uniqueStrings(domains.map((domain) => domain.domain_id)),
      deletion_evidence_worklist_count: sum('deletion_evidence_worklist_count'),
      ready_domain_evidence_worklist_count: sum('ready_domain_evidence_worklist_count'),
      blocked_until_replacement_ready_count: sum('blocked_until_replacement_ready_count'),
      open_deletion_evidence_requirement_count: sum('open_deletion_evidence_requirement_count'),
      missing_domain_owner_receipt_or_typed_blocker_count:
        sum('missing_domain_owner_receipt_or_typed_blocker_count'),
      missing_no_active_caller_proof_count:
        sum('missing_no_active_caller_proof_count'),
      missing_no_forbidden_write_proof_count:
        sum('missing_no_forbidden_write_proof_count'),
      missing_tombstone_or_provenance_ref_count:
        sum('missing_tombstone_or_provenance_ref_count'),
      mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      static_retirement_prerequisite_gate_ids: [
        ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
      ],
      retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
      same_work_unit_live_evidence_scope: {
        ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
      },
      physical_delete_authorized: false,
      default_caller_delete_ready: false,
      deletion_evidence_requirements_are_completion_claims: false,
      owner_decision_result_shape: ownerDecisionResultShape,
      owner_decision_result_shapes: ownerDecisionResultShapes,
      ...defaultCallerOwnerDecisionCloseoutReadout({
        prerequisitesObserved: allDomainsWithDeleteOrKeepPrerequisites,
        ownerDecisionObserved: allDomainsReadyForOwnerDecision || allDomainsNoFurtherOplDeleteWork,
        ownerDecisionResultShape,
      }),
      owner_decision_status: ownerDecisionStatus(
        allDomainsWithDeleteOrKeepPrerequisites,
        allDomainsReadyForOwnerDecision || allDomainsNoFurtherOplDeleteWork,
      ),
      structural_prerequisites_observed_but_domain_owner_decision_missing_count:
        structuralOwnerDecisionMissingCount,
      owner_decision_required_after_prerequisites_observed:
        allDomainsWithDeleteOrKeepPrerequisites,
      delete_or_keep_prerequisites_observed:
        allDomainsWithDeleteOrKeepPrerequisites,
      next_required_owner_action: allDomainsWithDeleteOrKeepPrerequisites
        ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
        : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
      accepted_refs_only_result_shapes: acceptedRefsOnlyResultShapes,
      owner_decision_required_after_all_refs_observed: allDomainsReadyForOwnerDecision,
      not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
