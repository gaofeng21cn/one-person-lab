import path from 'node:path';

import {
  buildFunctionalPrivatizationAudit,
  buildGeneratedAgentInterfaces,
  buildPrivatePlatformResidueDeletionGate,
} from '../../packages/index.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  record,
  stringList,
  stringValue as optionalString,
  uniqueStringList,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  aggregateDefaultCallerOwnerDecisionResultShape,
  buildDefaultCallerOwnerDecisionReadModel,
  defaultCallerOwnerDecisionCloseoutReadout,
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
  DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
} from '../../../kernel/default-caller-retirement-guard.ts';
import {
  DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS,
  DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS,
  defaultCallerSurfaceGates,
} from '../../../kernel/default-caller-surface-gates.ts';
import type { FrameworkContracts } from '../../../kernel/types.ts';
import { buildStandardAgentSourceBehaviorChecks } from '../standard-domain-agent-source-behavior.ts';
import { buildStandardAgentSourceClosureForRepo } from '../standard-agent-source-closure.ts';
import {
  buildAgentPlatformSurfaceOwnershipForRepo,
} from './ownership-projection.ts';
import {
  normalizeDomainSelection,
  readDomainId,
  readJsonFile,
} from './repo-scan.ts';

function generatedInterfaceBundleForRepo(repoDir: string) {
  const result = buildGeneratedAgentInterfaces({} as FrameworkContracts, ['--repo-dir', repoDir]);
  return result.generated_agent_interfaces as JsonRecord;
}
export function buildAgentDefaultCallerReadinessForRepo(repoDir: string, requestedAgentId?: string | null) {
  const resolvedRepoDir = path.resolve(repoDir);
  const domainId = normalizeDomainSelection(readDomainId(resolvedRepoDir, requestedAgentId ?? null));
  const platformSurfaceOwnership = buildAgentPlatformSurfaceOwnershipForRepo(resolvedRepoDir, requestedAgentId);
  const functionalAudit = readJsonFile(resolvedRepoDir, 'contracts/functional_privatization_audit.json');
  const normalizedFunctionalAudit = buildFunctionalPrivatizationAudit(isRecord(functionalAudit.payload)
    ? {
        target_domain_id: domainId,
        functional_privatization_audit: functionalAudit.payload,
      }
    : null);
  const declaredFunctionalAudit = isRecord(functionalAudit.payload) ? functionalAudit.payload : {};
  const defaultSurfaceBoundary = record(declaredFunctionalAudit.default_surface_boundary);
  const declaredRetiredDefaultSurfaceIds = new Set(
    optionalString(defaultSurfaceBoundary.state) === 'physically_absent'
      ? stringList(declaredFunctionalAudit.retired_default_surface_ids)
      : [],
  );
  const privatePlatformResidueDeletionGate =
    buildPrivatePlatformResidueDeletionGate(normalizedFunctionalAudit.modules);
  const sourceClosure = buildStandardAgentSourceClosureForRepo(
    resolvedRepoDir,
    requestedAgentId ?? null,
  );
  try {
    const bundle = generatedInterfaceBundleForRepo(resolvedRepoDir);
    const cutoverProof = isRecord(bundle.active_caller_cutover_proof) ? bundle.active_caller_cutover_proof : {};
    const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : {};
    const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : {};
    const sourceBehaviorChecks = buildStandardAgentSourceBehaviorChecks(resolvedRepoDir);
    const defaultSurfaceRetirementSourceBehaviorBlocked = declaredRetiredDefaultSurfaceIds.size > 0
      && sourceBehaviorChecks.status !== 'passed';
    const retiredDefaultSurfaceIds = declaredRetiredDefaultSurfaceIds;
    const surfaceGates = defaultCallerSurfaceGates(bundle);
    const surfaceBlockers = surfaceGates
      .filter((gate) => gate.status !== 'ready_for_default_caller_cutover')
      .map((gate) => `default_caller_surface_blocked:${gate.surface_id}`);
    const blockers = [
      optionalString(bundle.status) === 'ready'
        ? null
        : `generated_interfaces_status_not_ready:${optionalString(bundle.status) ?? 'missing'}`,
      optionalString(bundle.generated_surface_owner) === 'one-person-lab'
        ? null
        : `generated_surface_owner_not_opl:${optionalString(bundle.generated_surface_owner) ?? 'missing'}`,
      bundle.domain_repo_can_own_generated_surface === false
        ? null
        : 'domain_repo_can_own_generated_surface_must_be_false',
      optionalString(wrapperBundle.status) === 'ready'
        ? null
        : `generated_wrapper_bundle_status_not_ready:${optionalString(wrapperBundle.status) ?? 'missing'}`,
      optionalString(targetProof.status) === 'ready'
        ? null
        : `active_caller_target_proof_not_ready:${optionalString(targetProof.status) ?? 'missing'}`,
      optionalString(cutoverProof.status) === 'cutover_to_opl_generated_or_domain_handler_targets'
        ? null
        : `active_caller_cutover_not_ready:${optionalString(cutoverProof.status) ?? 'missing'}`,
      cutoverProof.claims_live_soak_complete === true
        ? 'cutover_proof_must_not_claim_live_soak_complete'
        : null,
      cutoverProof.claims_domain_ready === true
        ? 'cutover_proof_must_not_claim_domain_ready'
        : null,
      platformSurfaceOwnership.status === 'passed'
        ? null
        : 'platform_surface_ownership_blocked',
      defaultSurfaceRetirementSourceBehaviorBlocked
        ? 'default_surface_retirement_source_behavior_not_passed'
        : null,
      sourceClosure.status === 'passed'
        ? null
        : `source_closure_not_passed:${sourceClosure.blockers.join(',')}`,
      ...surfaceBlockers,
    ].filter((entry): entry is string => Boolean(entry));
    const replacementReady = blockers.length === 0;
    const surfaceRetirementGates = surfaceGates.map((gate) => gate.deletion_evidence_worklist);
    const applicableSurfaceRetirementGates = surfaceRetirementGates.filter((worklist) => (
      !retiredDefaultSurfaceIds.has(optionalString(worklist.surface_id) ?? '')
    ));
    const deletionEvidenceWorklists = applicableSurfaceRetirementGates.filter((worklist) =>
      worklist.active_deletion_worklist_item !== false
    );
    const missingDomainEvidenceCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.domain_owner_receipt_or_typed_blocker)
      && optionalString(worklist.domain_owner_receipt_or_typed_blocker.status) !== 'observed'
    )).length;
    const missingNoActiveCallerProofCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.no_active_caller_proof)
      && optionalString(worklist.no_active_caller_proof.status) !== 'observed'
    )).length;
    const missingNoForbiddenWriteCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.no_forbidden_write_proof)
      && optionalString(worklist.no_forbidden_write_proof.status) !== 'observed'
    )).length;
    const missingTombstoneOrProvenanceCount = applicableSurfaceRetirementGates.filter((worklist) => (
      isRecord(worklist.tombstone_or_provenance_ref)
      && optionalString(worklist.tombstone_or_provenance_ref.status) !== 'observed'
    )).length;
    const allDeletionEvidenceRequirementsObserved = applicableSurfaceRetirementGates.length > 0
      && missingDomainEvidenceCount === 0
      && missingNoActiveCallerProofCount === 0
      && missingNoForbiddenWriteCount === 0
      && missingTombstoneOrProvenanceCount === 0;
    const deleteOrKeepPrerequisitesObserved = applicableSurfaceRetirementGates.length > 0
      && missingNoActiveCallerProofCount === 0
      && missingNoForbiddenWriteCount === 0
      && missingTombstoneOrProvenanceCount === 0;
    const physicalDeleteAuthorized = replacementReady
      && applicableSurfaceRetirementGates.length > 0
      && applicableSurfaceRetirementGates.every((worklist) => worklist.physical_delete_authorized === true);
    const physicalDeleteBlockedBy = physicalDeleteAuthorized
      ? []
      : [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS];
    const notAuthorizedClaims = physicalDeleteAuthorized
      ? []
      : [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS];
    const physicalDeleteAuthorizationStatus = physicalDeleteAuthorized
      ? 'authorized_by_domain_owner_physical_delete_ref'
      : 'not_authorized_by_opl_projection';
    const ownerDecisionResultShapes = uniqueStringList(
      surfaceRetirementGates
        .map((worklist) => optionalString(worklist.owner_decision_result_shape))
        .filter((entry): entry is string => Boolean(entry)),
    );
    const ownerDecisionResultShape = aggregateDefaultCallerOwnerDecisionResultShape({
      physicalDeleteAuthorized,
      resultShapes: ownerDecisionResultShapes,
    });
    const ownerDecisionCloseoutReadout = defaultCallerOwnerDecisionCloseoutReadout({
      prerequisitesObserved: deleteOrKeepPrerequisitesObserved,
      ownerDecisionObserved: allDeletionEvidenceRequirementsObserved,
      physicalDeleteAuthorized,
      ownerDecisionResultShape,
    });
    const ownerDecisionReadModel = buildDefaultCallerOwnerDecisionReadModel({
      prerequisitesObserved: deleteOrKeepPrerequisitesObserved,
      ownerDecisionObserved: allDeletionEvidenceRequirementsObserved,
      physicalDeleteAuthorized,
      ownerDecisionResultShape,
    });
    const report: JsonRecord = {
      surface_kind: 'opl_agent_generated_default_caller_readiness_projection',
      version: 'v1',
      owner: 'one-person-lab',
      repo_dir: resolvedRepoDir,
      requested_agent_id: requestedAgentId ?? null,
      domain_id: domainId,
      status: replacementReady ? 'ready_domain_evidence_required' : 'blocked',
      summary: {
        generated_default_caller_surface_count: surfaceGates.length,
        ready_surface_count: surfaceGates.length - surfaceBlockers.length,
        blocked_surface_count: surfaceBlockers.length,
        blocker_count: blockers.length,
        source_closure_status: sourceClosure.status,
        source_closure_scan_complete: sourceClosure.scan_complete,
        source_closure_unresolved_edge_count: sourceClosure.unresolved_edges.length,
        source_closure_audit_mismatch_count: sourceClosure.audit_mismatches.length,
        source_closure_unreachable_sensitive_residue_count:
          sourceClosure.unreachable_sensitive_residue.length,
        deletion_evidence_worklist_count: deletionEvidenceWorklists.length,
        surface_retirement_gate_count: surfaceRetirementGates.length,
        closed_surface_retirement_gate_count:
          surfaceRetirementGates.length - deletionEvidenceWorklists.length,
        retired_default_surface_count: retiredDefaultSurfaceIds.size,
        retired_default_surface_source_ref:
          'contracts/functional_privatization_audit.json#retired_default_surface_ids',
        missing_domain_owner_receipt_or_typed_blocker_count: missingDomainEvidenceCount,
        missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
        missing_no_forbidden_write_proof_count: missingNoForbiddenWriteCount,
        missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceCount,
        retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        default_caller_delete_ready: physicalDeleteAuthorized,
        physical_delete_authorized: physicalDeleteAuthorized,
        owner_decision_result_shape: ownerDecisionResultShape,
        owner_decision_result_shapes: ownerDecisionResultShapes,
        ...ownerDecisionCloseoutReadout,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
      },
      default_caller_owner: 'one-person-lab',
      source_commands: {
        generated_interfaces: `opl agents interfaces --repo-dir ${resolvedRepoDir} --json`,
        platform_surfaces: `opl agents platform-surfaces --repo-dir ${resolvedRepoDir} --json`,
        source_closure: `opl agents source-closure --repo-dir ${resolvedRepoDir} --json`,
      },
      source_closure: sourceClosure,
      generated_interface_status: optionalString(bundle.status),
      generated_wrapper_bundle_status: optionalString(wrapperBundle.status),
      active_caller_target_proof_status: optionalString(targetProof.status),
      active_caller_cutover_proof_status: optionalString(cutoverProof.status),
      default_surface_retirement_source_behavior: {
        status: sourceBehaviorChecks.status,
        blocker_count: sourceBehaviorChecks.blockers.length,
        blockers: sourceBehaviorChecks.blockers,
        declared_retired_surface_count: declaredRetiredDefaultSurfaceIds.size,
      },
      deletion_evidence_worklists: deletionEvidenceWorklists,
      private_platform_residue_deletion_gate: privatePlatformResidueDeletionGate,
      blockers,
      deletion_gate: {
        replacement_parity: replacementReady ? 'ready' : 'blocked',
        active_caller_cutover: replacementReady ? 'ready' : 'blocked',
        no_active_caller_proof: 'required_before_physical_delete',
        domain_owner_receipt_or_typed_blocker: 'required_from_domain_owner_before_physical_delete',
        no_forbidden_write_proof: 'required_before_physical_delete',
        tombstone_or_provenance_ref: 'required_before_physical_delete',
        mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        retirement_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        physical_delete_authorized: physicalDeleteAuthorized,
        all_deletion_evidence_requirements_observed: allDeletionEvidenceRequirementsObserved,
        default_caller_delete_ready: physicalDeleteAuthorized,
        owner_decision_result_shapes: ownerDecisionResultShapes,
        ...ownerDecisionReadModel,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_blocked_by: physicalDeleteBlockedBy,
        physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
        deletion_evidence_requirements_are_completion_claims: false,
        not_authorized_claims: notAuthorizedClaims,
        physical_delete_authority_owner: 'domain_repo_owner_after_receipt_parity',
        evidence_worklist_count: deletionEvidenceWorklists.length,
        missing_domain_owner_receipt_or_typed_blocker_count: missingDomainEvidenceCount,
        missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
        missing_no_forbidden_write_proof_count: missingNoForbiddenWriteCount,
        missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceCount,
      },
      authority_boundary: {
        projection_can_claim_domain_ready: false,
        projection_can_claim_quality_verdict: false,
        projection_can_claim_artifact_authority: false,
        projection_can_claim_production_ready: false,
        projection_can_authorize_domain_repo_physical_delete: false,
        opl_default_caller_can_route_to_domain_handler_or_refs_adapter: true,
        domain_truth_verdict_artifact_and_owner_receipt_stay_in_domain: true,
      },
    };
    if (deletionEvidenceWorklists.length > 0) {
      report.surface_gates = surfaceGates;
      report.surface_retirement_gates = surfaceRetirementGates;
    } else if (surfaceRetirementGates.length > 0) {
      report.closed_surface_detail_policy =
        'closed_retirement_gate_details_omitted_from_default_payload';
    }
    return report;
  } catch (error) {
    return {
      surface_kind: 'opl_agent_generated_default_caller_readiness_projection',
      version: 'v1',
      owner: 'one-person-lab',
      repo_dir: resolvedRepoDir,
      requested_agent_id: requestedAgentId ?? null,
      domain_id: domainId,
      status: 'blocked',
      summary: {
        generated_default_caller_surface_count: 0,
        ready_surface_count: 0,
        blocked_surface_count: 0,
        blocker_count: 1,
      },
      blockers: [
        `generated_default_caller_projection_error:${error instanceof FrameworkContractError ? error.code : 'unknown'}`,
      ],
      error: error instanceof Error ? error.message : String(error),
      private_platform_residue_deletion_gate: privatePlatformResidueDeletionGate,
      source_closure: sourceClosure,
      deletion_gate: {
        replacement_parity: 'blocked',
        active_caller_cutover: 'blocked',
        domain_owner_receipt_or_typed_blocker: 'required_from_domain_owner_before_physical_delete',
        no_forbidden_write_proof: 'required_before_physical_delete',
        tombstone_or_provenance_ref: 'required_before_physical_delete',
        physical_delete_authorized: false,
        all_deletion_evidence_requirements_observed: false,
        delete_or_keep_prerequisites_observed: false,
        default_caller_delete_ready: false,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_blocked_by: [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS],
        physical_delete_authorization_status: 'not_authorized_by_opl_projection',
        next_required_owner_action:
          'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
        accepted_refs_only_result_shapes: ['typed_blocker_ref'],
        owner_decision_required_after_prerequisites_observed: false,
        owner_decision_required_after_all_refs_observed: false,
        deletion_evidence_requirements_are_completion_claims: false,
        not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
        physical_delete_authority_owner: 'domain_repo_owner_after_receipt_parity',
      },
      authority_boundary: {
        projection_can_claim_domain_ready: false,
        projection_can_claim_quality_verdict: false,
        projection_can_claim_artifact_authority: false,
        projection_can_claim_production_ready: false,
        projection_can_authorize_domain_repo_physical_delete: false,
      },
    };
  }
}
