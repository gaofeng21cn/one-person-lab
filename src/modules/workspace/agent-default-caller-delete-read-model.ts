import {
  DEFAULT_CALLER_DEFAULT_ORDINARY_LANE_ID,
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS,
  DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
  DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
  DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
  aggregateDefaultCallerOwnerDecisionResultShape,
  buildDefaultCallerOwnerDecisionReadModel,
  defaultCallerOwnerDecisionCloseoutReadout,
} from './default-caller-retirement-guard.ts';
import { buildPrivatePlatformResidueDeletionGate } from '../pack/index.ts';
import {
  countValue as numberValue,
  type JsonRecord,
  record,
  recordList,
  stringList,
  stringValue as optionalString,
} from '../../kernel/json-record.ts';

interface DefaultCallerPhysicalDeleteAuthorityPolicy {
  physical_delete_blocked_by: string[];
  not_authorized_claims: string[];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function statusIsObserved(section: unknown) {
  return optionalString(record(section).status) === 'observed';
}

function deleteOrKeepPrerequisitesObserved(summary: {
  worklistCount: number;
  missingNoActiveCallerProofCount: number;
  missingNoForbiddenWriteProofCount: number;
  missingTombstoneOrProvenanceRefCount: number;
}) {
  return summary.worklistCount > 0
    && summary.missingNoActiveCallerProofCount === 0
    && summary.missingNoForbiddenWriteProofCount === 0
    && summary.missingTombstoneOrProvenanceRefCount === 0;
}

function ownerDecisionStatus(
  prerequisitesObserved: boolean,
  allRequirementsObserved: boolean,
  physicalDeleteAuthorized = false,
) {
  if (!prerequisitesObserved) {
    return 'waiting_for_structural_prerequisites';
  }
  if (!allRequirementsObserved) {
    return 'owner_decision_required';
  }
  if (physicalDeleteAuthorized) {
    return 'owner_decision_observed_physical_delete_authorized';
  }
  return 'owner_decision_observed_refs_only_not_delete_authorized';
}

function ownerDecisionShapeFromWorklist(worklist: JsonRecord) {
  const domainDecision = record(worklist.domain_owner_receipt_or_typed_blocker);
  return optionalString(worklist.owner_decision_result_shape)
    ?? optionalString(domainDecision.owner_decision_result_shape);
}

function structuralPrerequisiteGateGroup(input: {
  missingNoActiveCallerProofCount: number;
  missingNoForbiddenWriteProofCount: number;
  missingTombstoneOrProvenanceRefCount: number;
}) {
  const missingGateIds = [
    input.missingNoActiveCallerProofCount > 0 ? 'no_active_caller_proof' : null,
    input.missingNoForbiddenWriteProofCount > 0 ? 'no_forbidden_write_proof' : null,
    input.missingTombstoneOrProvenanceRefCount > 0 ? 'tombstone_or_provenance_ref' : null,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: missingGateIds.length === 0 ? 'observed' : 'missing',
    missing_gate_ids: missingGateIds,
    missing_no_active_caller_proof_count: input.missingNoActiveCallerProofCount,
    missing_no_forbidden_write_proof_count: input.missingNoForbiddenWriteProofCount,
    missing_tombstone_or_provenance_ref_count: input.missingTombstoneOrProvenanceRefCount,
  };
}

function ownerDecisionGateGroup(input: {
  prerequisitesObserved: boolean;
  allRequirementsObserved: boolean;
  missingDomainOwnerReceiptOrTypedBlockerCount: number;
  physicalDeleteAuthorized?: boolean;
  ownerDecisionResultShape?: string | null;
}) {
  const ownerDecisionStatusValue = ownerDecisionStatus(
    input.prerequisitesObserved,
    input.allRequirementsObserved,
    input.physicalDeleteAuthorized === true,
  );
  return {
    ...defaultCallerOwnerDecisionCloseoutReadout({
      prerequisitesObserved: input.prerequisitesObserved,
      ownerDecisionObserved: input.allRequirementsObserved,
      physicalDeleteAuthorized: input.physicalDeleteAuthorized === true,
      ownerDecisionResultShape: input.ownerDecisionResultShape ?? null,
    }),
    status: input.allRequirementsObserved
      ? 'observed'
      : (input.prerequisitesObserved ? 'missing' : 'waiting_for_structural_prerequisites'),
    owner_decision_status: ownerDecisionStatusValue,
    gate_id: 'domain_owner_receipt_or_typed_blocker',
    missing_count: input.prerequisitesObserved && !input.allRequirementsObserved
      ? input.missingDomainOwnerReceiptOrTypedBlockerCount
      : 0,
    next_required_owner_action: input.prerequisitesObserved
      ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
      : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
    accepted_refs_only_result_shapes: input.prerequisitesObserved
      ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
      : ['typed_blocker_ref'],
  };
}

function emptyPrivatePlatformCleanupLane() {
  return buildPrivatePlatformResidueDeletionGate([]);
}

function cleanupLaneFromReport(report: JsonRecord) {
  const lane = record(report.private_platform_residue_deletion_gate);
  return optionalString(lane.lane_id) === DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID
    ? lane
    : emptyPrivatePlatformCleanupLane();
}

function ordinaryLaneReadout(input: {
  deletionEvidenceWorklistCount: number;
  prerequisitesObserved: boolean;
  allRequirementsObserved: boolean;
  physicalDeleteAuthorized?: boolean;
  ownerDecisionResultShape?: string | null;
}) {
  return {
    lane_id: DEFAULT_CALLER_DEFAULT_ORDINARY_LANE_ID,
    surface_kind: 'opl_default_caller_ordinary_lane_read_model',
    includes_private_platform_cleanup_gate: false,
    deletion_evidence_worklist_count: input.deletionEvidenceWorklistCount,
    delete_or_keep_prerequisites_observed: input.prerequisitesObserved,
    all_deletion_evidence_requirements_observed: input.allRequirementsObserved,
    next_required_owner_action: input.prerequisitesObserved
      ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
      : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
    accepted_refs_only_result_shapes: input.prerequisitesObserved
      ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
      : ['typed_blocker_ref'],
    default_caller_delete_ready: false,
    physical_delete_authorized: false,
    ordinary_lane_can_authorize_private_platform_residue_cleanup: false,
    ...defaultCallerOwnerDecisionCloseoutReadout({
      prerequisitesObserved: input.prerequisitesObserved,
      ownerDecisionObserved: input.allRequirementsObserved,
      physicalDeleteAuthorized: input.physicalDeleteAuthorized === true,
      ownerDecisionResultShape: input.ownerDecisionResultShape ?? null,
    }),
  };
}

function activeLegacyCallerDeletionGate(input: {
  deletionEvidenceWorklistCount: number;
  missingDomainOwnerReceiptOrTypedBlockerCount: number;
  missingNoActiveCallerProofCount: number;
  missingNoForbiddenWriteProofCount: number;
  missingTombstoneOrProvenanceRefCount: number;
  prerequisitesObserved: boolean;
  allRequirementsObserved: boolean;
  physicalDeleteAuthorized: boolean;
  repoCount: number;
}) {
  const noFurtherOplDefaultCallerDeleteWork =
    input.allRequirementsObserved && input.deletionEvidenceWorklistCount === 0;
  const missingGateIds = [
    input.missingNoActiveCallerProofCount > 0 ? 'no_active_caller_proof' : null,
    input.missingNoForbiddenWriteProofCount > 0 ? 'no_forbidden_write_proof' : null,
    input.missingTombstoneOrProvenanceRefCount > 0 ? 'tombstone_or_provenance_ref' : null,
    input.prerequisitesObserved && input.missingDomainOwnerReceiptOrTypedBlockerCount > 0
      ? 'domain_owner_receipt_or_typed_blocker'
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  const ownerDecisionRequired = input.prerequisitesObserved && !input.allRequirementsObserved;
  const executableNextAction = ownerDecisionRequired
      ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
    : noFurtherOplDefaultCallerDeleteWork
      ? 'no_further_opl_default_caller_delete_work'
    : input.deletionEvidenceWorklistCount > 0
      ? 'inspect_active_deletion_evidence_worklists'
      : 'no_active_delete_worklist_items';
  return {
    surface_kind: 'opl_active_legacy_caller_deletion_gate_read_model',
    status: ownerDecisionRequired
        ? 'owner_decision_required_after_structural_prerequisites'
      : noFurtherOplDefaultCallerDeleteWork
        ? 'owner_decision_observed_no_further_opl_delete_work'
      : input.deletionEvidenceWorklistCount > 0
        ? 'active_worklist_open'
        : 'no_active_worklist_not_delete_authorized',
    repo_count: input.repoCount,
    active_deletion_evidence_worklist_count: input.deletionEvidenceWorklistCount,
    executable_next_action: executableNextAction,
    action_route: ownerDecisionRequired
      ? 'opl agents default-callers --family-defaults --json#physical_delete_authority_read_model'
      : input.deletionEvidenceWorklistCount > 0
        ? 'opl agents default-callers --family-defaults --json#deletion_evidence_worklists'
        : 'opl agents default-callers --family-defaults --json#physical_delete_authority_read_model',
    missing_gate_ids: missingGateIds,
    missing_counts: {
      domain_owner_receipt_or_typed_blocker:
        input.missingDomainOwnerReceiptOrTypedBlockerCount,
      no_active_caller_proof: input.missingNoActiveCallerProofCount,
      no_forbidden_write_proof: input.missingNoForbiddenWriteProofCount,
      tombstone_or_provenance_ref: input.missingTombstoneOrProvenanceRefCount,
    },
    owner_surface: input.prerequisitesObserved
      ? 'domain_repo_owner_delete_keep_or_typed_blocker_decision'
      : 'opl_generated_or_hosted_surface_gate_refs',
    stop_condition: input.prerequisitesObserved
      ? 'domain_owner_decision_ref_observed_or_typed_blocker_ref_observed'
      : 'replacement_parity_no_active_caller_no_forbidden_write_and_tombstone_refs_observed',
    physical_delete_authorized: input.physicalDeleteAuthorized,
    default_caller_delete_ready: input.physicalDeleteAuthorized,
    no_further_opl_default_caller_delete_work:
      noFurtherOplDefaultCallerDeleteWork,
    authority_boundary: {
      read_model_can_authorize_physical_delete: input.physicalDeleteAuthorized,
      read_model_can_delete_domain_repo_files: false,
      read_model_can_write_domain_truth: false,
      read_model_can_create_typed_blocker: false,
      docs_foldback_can_authorize_physical_delete: false,
    },
  };
}

function privatePlatformCleanupOwnerDecisionWorkOrder(residueGateCount: number) {
  const noFurtherCleanupWork = residueGateCount === 0;
  return {
    surface_kind: 'opl_private_platform_residue_owner_decision_work_order',
    work_order_id: 'private-platform-cleanup-owner-decision',
    lane_id: DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
    status: residueGateCount > 0
      ? 'owner_delete_keep_or_typed_blocker_decision_required'
      : 'no_private_residue_classified_not_delete_ready',
    owner_decision_closeout_status: noFurtherCleanupWork
      ? 'no_private_residue_classified_no_further_opl_cleanup_work'
      : 'private_residue_owner_decision_required',
    no_further_opl_private_platform_cleanup_work: noFurtherCleanupWork,
    residue_gate_count: residueGateCount,
    open_decision_count: residueGateCount,
    open_count_semantics:
      'zero_residue_gate_count_means_no_cleanup_lane_items_not_physical_delete_authorized',
    next_required_owner_action: DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    accepted_refs_only_result_shapes: [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES],
    typed_blocker_result_shape: 'typed_blocker_ref',
    physical_delete_authorized: false,
    default_caller_delete_ready: false,
    ready_claim_authorized: false,
    next_opl_private_platform_cleanup_action: noFurtherCleanupWork
      ? 'no_private_residue_cleanup_lane_items'
      : DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    forbidden_opl_claims: [
      'domain_repo_physical_delete_authorization',
      'default_caller_delete_ready',
      'domain_ready',
      'production_ready',
      'artifact_authority',
    ],
    authority_boundary: {
      work_order_can_delete_domain_repo_files: false,
      work_order_can_write_domain_truth: false,
      work_order_can_sign_domain_owner_receipt: false,
      work_order_can_create_typed_blocker: false,
      work_order_can_authorize_quality_or_export: false,
      work_order_can_authorize_domain_repo_physical_delete: false,
    },
  };
}

function mergePrivatePlatformCleanupLanes(lanes: JsonRecord[]) {
  const dispositionSummary = Object.fromEntries(
    DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS.map((disposition) => [
      disposition,
      lanes.reduce((total, lane) => (
        total + numberValue(record(lane.residue_gate_summary)[disposition])
      ), 0),
    ]),
  );
  const byResidueKind = Object.fromEntries(
    DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS.map((kind) => [
      kind,
      lanes.flatMap((lane) => recordList(record(lane.by_residue_kind)[kind])),
    ]),
  );
  const residueGateCount = Object.values(dispositionSummary).reduce(
    (total, count) => total + (typeof count === 'number' ? count : 0),
    0,
  );
  return {
    surface_kind: 'opl_private_platform_residue_deletion_gate',
    lane_id: DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID,
    status: residueGateCount > 0 ? 'classified' : 'empty',
    residue_gate_count: residueGateCount,
    allowed_dispositions: [...DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS],
    residue_target_kinds: [...DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS],
    disposition_summary: dispositionSummary,
    residue_gate_summary: dispositionSummary,
    by_residue_kind: byResidueKind,
    next_required_owner_action: DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    accepted_refs_only_result_shapes: [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES],
    owner_decision_work_order: privatePlatformCleanupOwnerDecisionWorkOrder(residueGateCount),
    physical_delete_authorized: false,
    default_caller_delete_ready: false,
    no_further_opl_private_platform_cleanup_work: residueGateCount === 0,
    cleanup_lane_can_authorize_physical_delete: false,
    physical_delete_authorization_status: 'not_authorized_by_opl_projection',
    authority_boundary: {
      cleanup_lane_can_delete_domain_repo_files: false,
      cleanup_lane_can_write_domain_truth: false,
      cleanup_lane_can_sign_domain_owner_receipt: false,
      cleanup_lane_can_authorize_quality_or_export: false,
      cleanup_lane_can_authorize_domain_repo_physical_delete: false,
    },
  };
}

function compactSurfaceDeletionGate(worklist: JsonRecord) {
  const prerequisitesObserved = statusIsObserved(worklist.replacement_parity)
    && statusIsObserved(worklist.active_caller_cutover)
    && statusIsObserved(worklist.no_active_caller_proof)
    && statusIsObserved(worklist.no_forbidden_write_proof)
    && statusIsObserved(worklist.tombstone_or_provenance_ref);
  const allRequirementsObserved = prerequisitesObserved
    && statusIsObserved(worklist.domain_owner_receipt_or_typed_blocker);
  const missingDomainOwnerDecisionCount = prerequisitesObserved && !allRequirementsObserved ? 1 : 0;
  const domainDecision = record(worklist.domain_owner_receipt_or_typed_blocker);
  const physicalDeleteAuthorizationRefs = unique([
    ...stringList(worklist.physical_delete_authorization_refs),
    ...stringList(domainDecision.physical_delete_authorization_refs),
  ]);
  const keepAsAuthorityAdapterRefs = unique([
    ...stringList(worklist.keep_as_authority_adapter_refs),
    ...stringList(domainDecision.keep_as_authority_adapter_refs),
  ]);
  const ownerReceiptRefs = unique([
    ...stringList(worklist.owner_receipt_refs),
    ...stringList(domainDecision.owner_receipt_refs),
  ]);
  const typedBlockerRefs = unique([
    ...stringList(worklist.typed_blocker_refs),
    ...stringList(domainDecision.typed_blocker_refs),
  ]);
  const ownerDecisionResultShape = ownerDecisionShapeFromWorklist(worklist);
  const physicalDeleteAuthorized =
    prerequisitesObserved
    && physicalDeleteAuthorizationRefs.length > 0
    && keepAsAuthorityAdapterRefs.length === 0
    && typedBlockerRefs.length === 0;
  const ownerDecisionReadModel = buildDefaultCallerOwnerDecisionReadModel({
    prerequisitesObserved,
    ownerDecisionObserved: allRequirementsObserved,
    physicalDeleteAuthorized,
    ownerDecisionResultShape,
  });
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
    physical_delete_authorized: physicalDeleteAuthorized,
    default_caller_delete_ready: physicalDeleteAuthorized,
    active_deletion_worklist_item: worklist.active_deletion_worklist_item !== false,
    needs_drilldown_for_surface_refs: worklist.active_deletion_worklist_item !== false,
    physical_delete_authorization_refs: physicalDeleteAuthorizationRefs,
    keep_as_authority_adapter_refs: keepAsAuthorityAdapterRefs,
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    structural_prerequisites_observed_but_domain_owner_decision_missing_count:
      missingDomainOwnerDecisionCount,
    missing_gate_groups: {
      structural_prerequisites: structuralPrerequisiteGateGroup({
        missingNoActiveCallerProofCount: statusIsObserved(worklist.no_active_caller_proof) ? 0 : 1,
        missingNoForbiddenWriteProofCount: statusIsObserved(worklist.no_forbidden_write_proof) ? 0 : 1,
        missingTombstoneOrProvenanceRefCount:
          statusIsObserved(worklist.tombstone_or_provenance_ref) ? 0 : 1,
      }),
      domain_owner_decision: ownerDecisionGateGroup({
        prerequisitesObserved,
        allRequirementsObserved,
        missingDomainOwnerReceiptOrTypedBlockerCount: missingDomainOwnerDecisionCount,
        physicalDeleteAuthorized,
        ownerDecisionResultShape,
      }),
    },
    non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
    same_work_unit_live_evidence_scope: {
      ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
    },
    ...ownerDecisionReadModel,
  };
}

function repoDeletionGateSummary(
  report: JsonRecord,
  policy: DefaultCallerPhysicalDeleteAuthorityPolicy,
) {
  const summary = record(report.summary);
  const deletionGate = record(report.deletion_gate);
  const activeWorklists = recordList(report.deletion_evidence_worklists);
  const surfaceRetirementGates = recordList(report.surface_retirement_gates);
  const worklists = surfaceRetirementGates.length > 0 ? surfaceRetirementGates : activeWorklists;
  const surfaceRetirementGateCount = surfaceRetirementGates.length > 0
    ? surfaceRetirementGates.length
    : numberValue(summary.surface_retirement_gate_count);
  const closedSurfaceRetirementGateCount = surfaceRetirementGates.length > 0
    ? Math.max(0, surfaceRetirementGates.length - activeWorklists.length)
    : numberValue(summary.closed_surface_retirement_gate_count);
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
  const allRequirementsObserved = surfaceRetirementGateCount > 0
    && missingDomainOwnerReceiptOrTypedBlockerCount === 0
    && missingNoActiveCallerProofCount === 0
    && missingNoForbiddenWriteProofCount === 0
    && missingTombstoneOrProvenanceRefCount === 0;
  const prerequisitesObserved = deleteOrKeepPrerequisitesObserved({
    worklistCount: surfaceRetirementGateCount,
    missingNoActiveCallerProofCount,
    missingNoForbiddenWriteProofCount,
    missingTombstoneOrProvenanceRefCount,
  });
  const surfaceDeletionGateSummary = worklists.map(compactSurfaceDeletionGate);
  const repoPhysicalDeleteAuthorized = deletionGate.physical_delete_authorized === true
    || (
      surfaceDeletionGateSummary.length > 0
      && surfaceDeletionGateSummary.every((surface) => surface.physical_delete_authorized === true)
    );
  const repoOwnerDecisionResultShape = aggregateDefaultCallerOwnerDecisionResultShape({
    physicalDeleteAuthorized: repoPhysicalDeleteAuthorized,
    resultShapes: surfaceDeletionGateSummary.map((surface) =>
      optionalString(surface.owner_decision_result_shape)
    ),
  })
    ?? optionalString(deletionGate.owner_decision_result_shape)
    ?? optionalString(summary.owner_decision_result_shape);
  const ownerDecisionReadModel = buildDefaultCallerOwnerDecisionReadModel({
    prerequisitesObserved,
    ownerDecisionObserved: allRequirementsObserved,
    physicalDeleteAuthorized: repoPhysicalDeleteAuthorized,
    ownerDecisionResultShape: repoOwnerDecisionResultShape,
  });
  const cleanupLane = cleanupLaneFromReport(report);
  const ordinaryLane = ordinaryLaneReadout({
    deletionEvidenceWorklistCount: worklists.length,
    prerequisitesObserved,
    allRequirementsObserved,
    physicalDeleteAuthorized: repoPhysicalDeleteAuthorized,
    ownerDecisionResultShape: repoOwnerDecisionResultShape,
  });
  const structuralPrerequisitesObservedButDomainOwnerDecisionMissingCount =
    surfaceDeletionGateSummary.reduce((total, surface) => (
      total + surface.structural_prerequisites_observed_but_domain_owner_decision_missing_count
    ), 0)
    || (prerequisitesObserved && !allRequirementsObserved
      ? missingDomainOwnerReceiptOrTypedBlockerCount
      : 0);

  const domainId = optionalString(report.domain_id) ?? 'unknown_domain';
  const summaryPayload: JsonRecord = {
    repo_id: domainId,
    domain_id: domainId,
    requested_agent_id: optionalString(report.requested_agent_id),
    repo_dir: optionalString(report.repo_dir),
    status: optionalString(report.status) ?? 'unknown',
    generated_default_caller_surface_count:
      numberValue(summary.generated_default_caller_surface_count),
    ready_surface_count: numberValue(summary.ready_surface_count),
    blocked_surface_count: numberValue(summary.blocked_surface_count),
    deletion_evidence_worklist_count: activeWorklists.length,
    active_deletion_evidence_worklist_count: activeWorklists.length,
    surface_retirement_gate_count: surfaceRetirementGateCount,
    closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
    all_deletion_evidence_requirements_observed: allRequirementsObserved,
    missing_domain_owner_receipt_or_typed_blocker_count:
      missingDomainOwnerReceiptOrTypedBlockerCount,
    missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
    missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
    missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
    physical_delete_authorized: repoPhysicalDeleteAuthorized,
    default_caller_delete_ready: repoPhysicalDeleteAuthorized,
    generated_default_caller_readiness_can_authorize_physical_delete: false,
    physical_delete_authorization_status:
      repoPhysicalDeleteAuthorized
        ? 'authorized_by_domain_owner_physical_delete_ref'
        : (
          optionalString(deletionGate.physical_delete_authorization_status)
          ?? 'not_authorized_by_opl_projection'
        ),
    physical_delete_authority_owner:
      optionalString(deletionGate.physical_delete_authority_owner)
      ?? 'domain_repo_owner_after_receipt_parity',
    structural_prerequisites_observed_but_domain_owner_decision_missing_count:
      structuralPrerequisitesObservedButDomainOwnerDecisionMissingCount,
    missing_gate_groups: {
      structural_prerequisites: structuralPrerequisiteGateGroup({
        missingNoActiveCallerProofCount,
        missingNoForbiddenWriteProofCount,
        missingTombstoneOrProvenanceRefCount,
      }),
      domain_owner_decision: ownerDecisionGateGroup({
        prerequisitesObserved,
        allRequirementsObserved,
        missingDomainOwnerReceiptOrTypedBlockerCount:
          structuralPrerequisitesObservedButDomainOwnerDecisionMissingCount,
        physicalDeleteAuthorized: repoPhysicalDeleteAuthorized,
        ownerDecisionResultShape: repoOwnerDecisionResultShape,
      }),
    },
    retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
    mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    static_retirement_prerequisite_gate_ids: [
      ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
    ],
    same_work_unit_live_evidence_scope: {
      ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
    },
    ...ownerDecisionReadModel,
    physical_delete_blocked_by: repoPhysicalDeleteAuthorized ? [] : physicalDeleteBlockedBy,
    not_authorized_claims: repoPhysicalDeleteAuthorized ? [] : notAuthorizedClaims,
    needs_drilldown_for_surface_refs: activeWorklists.length > 0,
    ordinary_lane: ordinaryLane,
    cleanup_lane: cleanupLane,
  };
  if (activeWorklists.length > 0) {
    summaryPayload.surface_owner_decision_gates = surfaceDeletionGateSummary;
    summaryPayload.surface_deletion_gate_summary = surfaceDeletionGateSummary;
  } else if (closedSurfaceRetirementGateCount > 0) {
    summaryPayload.closed_surface_detail_policy =
      'omitted_from_default_read_model_use_counts_and_tombstone_refs';
  }
  return summaryPayload;
}

export function buildDefaultCallerPhysicalDeleteAuthorityReadModel(
  reports: JsonRecord[],
  policy: DefaultCallerPhysicalDeleteAuthorityPolicy,
) {
  const repoSummaries = reports.map((report) => repoDeletionGateSummary(report, policy));
  const deletionEvidenceWorklistCount = repoSummaries.reduce(
    (total, repo) => total + numberValue(repo.deletion_evidence_worklist_count),
    0,
  );
  const surfaceRetirementGateCount = repoSummaries.reduce(
    (total, repo) => total + numberValue(repo.surface_retirement_gate_count),
    0,
  );
  const closedSurfaceRetirementGateCount = repoSummaries.reduce(
    (total, repo) => total + numberValue(repo.closed_surface_retirement_gate_count),
    0,
  );
  const missingDomainOwnerReceiptOrTypedBlockerCount = repoSummaries.reduce(
    (total, repo) => total + numberValue(repo.missing_domain_owner_receipt_or_typed_blocker_count),
    0,
  );
  const missingNoActiveCallerProofCount = repoSummaries.reduce(
    (total, repo) => total + numberValue(repo.missing_no_active_caller_proof_count),
    0,
  );
  const missingNoForbiddenWriteProofCount = repoSummaries.reduce(
    (total, repo) => total + numberValue(repo.missing_no_forbidden_write_proof_count),
    0,
  );
  const missingTombstoneOrProvenanceRefCount = repoSummaries.reduce(
    (total, repo) => total + numberValue(repo.missing_tombstone_or_provenance_ref_count),
    0,
  );
  const allReposHaveDeleteOrKeepPrerequisites = repoSummaries.length > 0
    && repoSummaries.every((repo) => repo.delete_or_keep_prerequisites_observed === true);
  const allReposAllDeletionEvidenceRequirementsObserved = repoSummaries.length > 0
    && repoSummaries.every((repo) => repo.all_deletion_evidence_requirements_observed);
  const structuralPrerequisitesObservedButDomainOwnerDecisionMissingCount = repoSummaries.reduce(
    (total, repo) =>
      total + numberValue(repo.structural_prerequisites_observed_but_domain_owner_decision_missing_count),
    0,
  );
  const privatePlatformCleanupLane = mergePrivatePlatformCleanupLanes(
    repoSummaries.map((repo) => record(repo.cleanup_lane)),
  );
  const physicalDeleteAuthorized = repoSummaries.length > 0
    && repoSummaries.every((repo) => repo.physical_delete_authorized === true);
  const ownerDecisionResultShape = aggregateDefaultCallerOwnerDecisionResultShape({
    physicalDeleteAuthorized,
    resultShapes: repoSummaries.map((repo) => optionalString(repo.owner_decision_result_shape)),
  });
  const ownerDecisionReadModel = buildDefaultCallerOwnerDecisionReadModel({
    prerequisitesObserved: allReposHaveDeleteOrKeepPrerequisites,
    ownerDecisionObserved: allReposAllDeletionEvidenceRequirementsObserved,
    physicalDeleteAuthorized,
    ownerDecisionResultShape,
  });
  const ordinaryLaneWithCloseout = ordinaryLaneReadout({
    deletionEvidenceWorklistCount,
    prerequisitesObserved: allReposHaveDeleteOrKeepPrerequisites,
    allRequirementsObserved: allReposAllDeletionEvidenceRequirementsObserved,
    physicalDeleteAuthorized,
    ownerDecisionResultShape,
  });
  const legacyCallerDeletionGate = activeLegacyCallerDeletionGate({
    deletionEvidenceWorklistCount,
    missingDomainOwnerReceiptOrTypedBlockerCount,
    missingNoActiveCallerProofCount,
    missingNoForbiddenWriteProofCount,
    missingTombstoneOrProvenanceRefCount,
    prerequisitesObserved: allReposHaveDeleteOrKeepPrerequisites,
    allRequirementsObserved: allReposAllDeletionEvidenceRequirementsObserved,
    physicalDeleteAuthorized,
    repoCount: repoSummaries.length,
  });
  return {
    surface_kind: 'opl_default_caller_physical_delete_authority_read_model',
    projection_policy:
      'compact_refs_only_repo_summary_over_default_caller_deletion_evidence_worklists',
    status: physicalDeleteAuthorized
      ? 'authorized_by_domain_owner_physical_delete_ref'
      : 'not_authorized_by_opl_projection',
    total_repo_count: repoSummaries.length,
    deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
    active_deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
    surface_retirement_gate_count: surfaceRetirementGateCount,
    closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
    all_repos_all_deletion_evidence_requirements_observed:
      allReposAllDeletionEvidenceRequirementsObserved,
    all_repos_delete_or_keep_prerequisites_observed:
      allReposHaveDeleteOrKeepPrerequisites,
    missing_domain_owner_receipt_or_typed_blocker_count:
      missingDomainOwnerReceiptOrTypedBlockerCount,
    missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
    missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
    missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
    zero_missing_deletion_evidence_is_not_delete_ready: true,
    observed_deletion_evidence_refs_are_refs_only_inputs: !physicalDeleteAuthorized,
    retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
    mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
    static_retirement_prerequisite_gate_ids: [
      ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
    ],
    same_work_unit_live_evidence_scope: {
      ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
    },
    physical_delete_authorized: physicalDeleteAuthorized,
    default_caller_delete_ready: physicalDeleteAuthorized,
    generated_default_caller_readiness_can_authorize_physical_delete: false,
    physical_delete_authorization_status: physicalDeleteAuthorized
      ? 'authorized_by_domain_owner_physical_delete_ref'
      : 'not_authorized_by_opl_projection',
    physical_delete_authority_owner: 'domain_repo_owner_after_receipt_parity',
    active_legacy_caller_deletion_gate: legacyCallerDeletionGate,
    structural_prerequisites_observed_but_domain_owner_decision_missing_count:
      structuralPrerequisitesObservedButDomainOwnerDecisionMissingCount,
    missing_gate_groups: {
      structural_prerequisites: structuralPrerequisiteGateGroup({
        missingNoActiveCallerProofCount,
        missingNoForbiddenWriteProofCount,
        missingTombstoneOrProvenanceRefCount,
      }),
      domain_owner_decision: ownerDecisionGateGroup({
        prerequisitesObserved: allReposHaveDeleteOrKeepPrerequisites,
        allRequirementsObserved: allReposAllDeletionEvidenceRequirementsObserved,
        missingDomainOwnerReceiptOrTypedBlockerCount:
          structuralPrerequisitesObservedButDomainOwnerDecisionMissingCount,
        physicalDeleteAuthorized,
        ownerDecisionResultShape,
      }),
    },
    ...ownerDecisionReadModel,
    physical_delete_blocked_by: physicalDeleteAuthorized ? [] : policy.physical_delete_blocked_by,
    not_authorized_claims: physicalDeleteAuthorized ? [] : policy.not_authorized_claims,
    needs_drilldown_for_surface_refs: deletionEvidenceWorklistCount > 0,
    default_ordinary_lane: ordinaryLaneWithCloseout,
    private_platform_cleanup_lane: privatePlatformCleanupLane,
    owner_decision_gate_by_repo: repoSummaries,
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
