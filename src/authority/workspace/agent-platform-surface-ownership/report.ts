import path from 'node:path';

import {
  defaultStandardDomainAgentRepoInputs,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
} from '../../../kernel/standard-domain-agent-family-repos.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  record,
  recordList,
  stringValue as optionalString,
} from '../../../kernel/json-record.ts';
import {
  DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS,
  DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS,
} from '../../../kernel/default-caller-surface-gates.ts';
import {
  DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
  DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
  DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES,
  DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
  DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES,
} from '../../../kernel/default-caller-retirement-guard.ts';
import { buildDefaultCallerPhysicalDeleteAuthorityReadModel } from '../agent-default-caller-delete-read-model.ts';
import { buildDomainPrivatePlatformTailMatrixReadback } from '../domain-private-platform-tail-matrix.ts';
import { buildAgentDefaultCallerReadinessForRepo } from './default-caller-readiness.ts';
import {
  buildAgentPlatformSurfaceOwnershipForRepo,
  OPL_OWNED_GENERIC_SUBDOMAINS,
} from './ownership-projection.ts';
import type { RepoInput } from './types.ts';

export function parseRepoArgs(args: string[], commandName: string): RepoInput[] {
  const repos: RepoInput[] = [];
  const usage = `${commandName} [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]`;
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--repo-dir' && args[index + 1]) {
      repos.push({
        requested_agent_id: null,
        repo_dir: args[index + 1],
      });
      index += 1;
      continue;
    }
    if (token === '--agent' && args[index + 1]) {
      const value = args[index + 1];
      const separator = value.indexOf('=');
      if (separator <= 0 || separator === value.length - 1) {
        throw new FrameworkContractError('cli_usage_error', `${commandName} --agent expects <agent_id>=<repo_dir>.`, {
          usage,
        });
      }
      repos.push({
        requested_agent_id: value.slice(0, separator),
        repo_dir: value.slice(separator + 1),
      });
      index += 1;
      continue;
    }
    if (token === '--family-defaults') {
      continue;
    }
    throw new FrameworkContractError('cli_usage_error', `Unknown ${commandName} option: ${token}.`, {
      usage,
    });
  }

  const selected = repos.length > 0 ? repos : defaultStandardDomainAgentRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', `${commandName} could not discover family agent repos.`, {
      usage,
      default_repo_directories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
      env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
    });
  }
  return selected.map((repo) => ({
    requested_agent_id: repo.requested_agent_id,
    repo_dir: path.resolve(repo.repo_dir),
  }));
}

export function buildAgentDefaultCallerReadinessReport(args: string[]) {
  const repos = parseRepoArgs(args, 'opl agents default-callers');
  const reports = repos.map((repo) => (
    buildAgentDefaultCallerReadinessForRepo(repo.repo_dir, repo.requested_agent_id)
  ));
  const domainPrivatePlatformTailMatrix = buildDomainPrivatePlatformTailMatrixReadback();
  const blockedCount = reports.filter((report) => report.status === 'blocked').length;
  const generatedDefaultCallerSurfaceCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).generated_default_caller_surface_count || 0),
    0,
  );
  const blockedSurfaceCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).blocked_surface_count || 0),
    0,
  );
  const deletionEvidenceWorklistCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).deletion_evidence_worklist_count || 0),
    0,
  );
  const surfaceRetirementGateCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).surface_retirement_gate_count || 0),
    0,
  );
  const closedSurfaceRetirementGateCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).closed_surface_retirement_gate_count || 0),
    0,
  );
  const missingDomainOwnerReceiptOrTypedBlockerCount = reports.reduce(
    (total, report) => (
      total + Number(record(report.summary).missing_domain_owner_receipt_or_typed_blocker_count || 0)
    ),
    0,
  );
  const missingNoActiveCallerProofCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).missing_no_active_caller_proof_count || 0),
    0,
  );
  const missingNoForbiddenWriteProofCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).missing_no_forbidden_write_proof_count || 0),
    0,
  );
  const missingTombstoneOrProvenanceRefCount = reports.reduce(
    (total, report) => total + Number(record(report.summary).missing_tombstone_or_provenance_ref_count || 0),
    0,
  );
  const sourceClosureVerifiedRepoCount = reports.filter((report) => (
    optionalString(record(report.source_closure).status) === 'passed'
  )).length;
  const sourceClosureUnresolvedEdgeCount = reports.reduce(
    (total, report) => total + recordList(record(report.source_closure).unresolved_edges).length,
    0,
  );
  const sourceClosureAuditMismatchCount = reports.reduce(
    (total, report) => total + recordList(record(report.source_closure).audit_mismatches).length,
    0,
  );
  const physicalDeleteAuthorityReadModel =
    buildDefaultCallerPhysicalDeleteAuthorityReadModel(reports, {
      physical_delete_blocked_by: [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS],
      not_authorized_claims: [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS],
    });
  const ownerDecisionStatus = optionalString(
    physicalDeleteAuthorityReadModel.owner_decision_status,
  );
  const physicalDeleteAuthorized =
    physicalDeleteAuthorityReadModel.physical_delete_authorized === true;
  const physicalDeleteAuthorizationStatus =
    optionalString(physicalDeleteAuthorityReadModel.physical_delete_authorization_status)
    ?? 'not_authorized_by_opl_projection';
  const ownerDecisionResultShape =
    optionalString(physicalDeleteAuthorityReadModel.owner_decision_result_shape);
  const ownerDecisionCloseoutStatus =
    optionalString(physicalDeleteAuthorityReadModel.owner_decision_closeout_status);
  const noFurtherOplDefaultCallerDeleteWork =
    physicalDeleteAuthorityReadModel.no_further_opl_default_caller_delete_work === true;
  const nextOplDefaultCallerDeleteAction =
    optionalString(physicalDeleteAuthorityReadModel.next_opl_default_caller_delete_action);
  const physicalDeleteBlockedBy = physicalDeleteAuthorized
    ? []
    : [...DEFAULT_CALLER_PHYSICAL_DELETE_BLOCKERS];
  const notAuthorizedClaims = physicalDeleteAuthorized
    ? []
    : [...DEFAULT_CALLER_DELETION_NOT_AUTHORIZED_CLAIMS];
  const structuralOwnerDecisionMissingCount = Number(
    physicalDeleteAuthorityReadModel
      .structural_prerequisites_observed_but_domain_owner_decision_missing_count || 0,
  );
  return {
    version: 'g1',
    blocked_count: blockedCount,
    deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
    active_deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
    surface_retirement_gate_count: surfaceRetirementGateCount,
    closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
    missing_domain_owner_receipt_or_typed_blocker_count:
      missingDomainOwnerReceiptOrTypedBlockerCount,
    missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
    missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
    missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
    source_closure_verified_repo_count: sourceClosureVerifiedRepoCount,
    source_closure_blocked_repo_count: reports.length - sourceClosureVerifiedRepoCount,
    source_closure_unresolved_edge_count: sourceClosureUnresolvedEdgeCount,
    source_closure_audit_mismatch_count: sourceClosureAuditMismatchCount,
    retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
    retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
    retirement_guard_readout: {
      target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      static_retirement_prerequisite_gate_ids: [
        ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
      ],
      non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
      same_work_unit_live_evidence_scope: {
        ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
      },
      physical_delete_authorized: physicalDeleteAuthorized,
      refs_only_receipt_can_authorize_physical_delete: false,
      conformance_can_authorize_physical_delete: false,
      readiness_can_authorize_physical_delete: false,
    },
    default_caller_delete_ready: physicalDeleteAuthorized,
    physical_delete_authorized: physicalDeleteAuthorized,
    physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
    owner_decision_status: ownerDecisionStatus,
    owner_decision_result_shape: ownerDecisionResultShape,
    owner_decision_closeout_status: ownerDecisionCloseoutStatus,
    no_further_opl_default_caller_delete_work: noFurtherOplDefaultCallerDeleteWork,
    next_opl_default_caller_delete_action: nextOplDefaultCallerDeleteAction,
    structural_prerequisites_observed_but_domain_owner_decision_missing_count:
      structuralOwnerDecisionMissingCount,
    active_legacy_caller_deletion_gate:
      physicalDeleteAuthorityReadModel.active_legacy_caller_deletion_gate,
    domain_private_platform_tail_matrix: domainPrivatePlatformTailMatrix,
    physical_delete_authority_read_model: physicalDeleteAuthorityReadModel,
    repo_deletion_gate_summary:
      physicalDeleteAuthorityReadModel.repo_deletion_gate_summary,
    agent_default_caller_readiness: {
      surface_kind: 'opl_agent_generated_default_caller_readiness_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'ready_domain_evidence_required' : 'blocked',
      total_repo_count: reports.length,
      ready_domain_evidence_required_count: reports.length - blockedCount,
      blocked_count: blockedCount,
      generated_default_caller_surface_count: generatedDefaultCallerSurfaceCount,
      blocked_surface_count: blockedSurfaceCount,
      deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
      active_deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
      surface_retirement_gate_count: surfaceRetirementGateCount,
      closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
      missing_domain_owner_receipt_or_typed_blocker_count:
        missingDomainOwnerReceiptOrTypedBlockerCount,
      missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
      missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
      missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
      source_closure_verified_repo_count: sourceClosureVerifiedRepoCount,
      source_closure_blocked_repo_count: reports.length - sourceClosureVerifiedRepoCount,
      source_closure_unresolved_edge_count: sourceClosureUnresolvedEdgeCount,
      source_closure_audit_mismatch_count: sourceClosureAuditMismatchCount,
      retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
      retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
      retirement_guard_readout: {
        target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        physical_delete_authorized: physicalDeleteAuthorized,
        refs_only_receipt_can_authorize_physical_delete: false,
        conformance_can_authorize_physical_delete: false,
        readiness_can_authorize_physical_delete: false,
      },
      default_caller_delete_ready: physicalDeleteAuthorized,
      physical_delete_authorized: physicalDeleteAuthorized,
      generated_default_caller_readiness_can_authorize_physical_delete: false,
      physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
      owner_decision_status: ownerDecisionStatus,
      owner_decision_result_shape: ownerDecisionResultShape,
      owner_decision_closeout_status: ownerDecisionCloseoutStatus,
      no_further_opl_default_caller_delete_work: noFurtherOplDefaultCallerDeleteWork,
      next_opl_default_caller_delete_action: nextOplDefaultCallerDeleteAction,
      structural_prerequisites_observed_but_domain_owner_decision_missing_count:
        structuralOwnerDecisionMissingCount,
      active_legacy_caller_deletion_gate:
        physicalDeleteAuthorityReadModel.active_legacy_caller_deletion_gate,
      domain_private_platform_tail_matrix: domainPrivatePlatformTailMatrix,
      physical_delete_blocked_by: physicalDeleteBlockedBy,
      physical_delete_authority_read_model: physicalDeleteAuthorityReadModel,
      repo_deletion_gate_summary:
        physicalDeleteAuthorityReadModel.repo_deletion_gate_summary,
      summary: {
        total_repo_count: reports.length,
        ready_domain_evidence_required_count: reports.length - blockedCount,
        blocked_count: blockedCount,
        generated_default_caller_surface_count: generatedDefaultCallerSurfaceCount,
        blocked_surface_count: blockedSurfaceCount,
        deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
        active_deletion_evidence_worklist_count: deletionEvidenceWorklistCount,
        surface_retirement_gate_count: surfaceRetirementGateCount,
        closed_surface_retirement_gate_count: closedSurfaceRetirementGateCount,
        missing_domain_owner_receipt_or_typed_blocker_count:
          missingDomainOwnerReceiptOrTypedBlockerCount,
        missing_no_active_caller_proof_count: missingNoActiveCallerProofCount,
        missing_no_forbidden_write_proof_count: missingNoForbiddenWriteProofCount,
        missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceRefCount,
        source_closure_verified_repo_count: sourceClosureVerifiedRepoCount,
        source_closure_blocked_repo_count: reports.length - sourceClosureVerifiedRepoCount,
        source_closure_unresolved_edge_count: sourceClosureUnresolvedEdgeCount,
        source_closure_audit_mismatch_count: sourceClosureAuditMismatchCount,
        retirement_guard_mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        default_caller_delete_ready: physicalDeleteAuthorized,
        physical_delete_authorized: physicalDeleteAuthorized,
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_authorization_status: physicalDeleteAuthorizationStatus,
        owner_decision_status: ownerDecisionStatus,
        owner_decision_result_shape: ownerDecisionResultShape,
        owner_decision_closeout_status: ownerDecisionCloseoutStatus,
        no_further_opl_default_caller_delete_work: noFurtherOplDefaultCallerDeleteWork,
        next_opl_default_caller_delete_action: nextOplDefaultCallerDeleteAction,
        structural_prerequisites_observed_but_domain_owner_decision_missing_count:
          structuralOwnerDecisionMissingCount,
      },
      migration_gate_policy: {
        opl_generated_default_caller_readiness_is_structural_replacement_evidence: true,
        source_closure_pass_is_required_for_default_caller_replacement: true,
        declared_absent_or_contract_only_cutover_cannot_close_source_closure: true,
        domain_owner_receipt_or_typed_blocker_still_required: true,
        no_active_caller_proof_still_required: true,
        no_forbidden_write_proof_still_required: true,
        zero_missing_deletion_evidence_is_not_delete_ready: true,
        observed_deletion_evidence_refs_are_refs_only_inputs: !physicalDeleteAuthorized,
        retirement_guard_target_classes: [...DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES],
        mandatory_gate_ids: [...DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS],
        static_retirement_prerequisite_gate_ids: [
          ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
        ],
        non_authorizing_surfaces: [...DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES],
        same_work_unit_live_evidence_scope: {
          ...DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE,
        },
        generated_default_caller_readiness_can_authorize_physical_delete: false,
        physical_delete_authorized_by_this_report: physicalDeleteAuthorized,
        physical_delete_blocked_by: physicalDeleteBlockedBy,
        not_authorized_claims: notAuthorizedClaims,
        owner_decision_after_structural_prerequisites_observed_required: true,
        next_required_owner_action_after_structural_prerequisites_observed:
          DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
        accepted_refs_only_result_shapes_after_structural_prerequisites_observed: [
          ...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES,
        ],
      },
      reports,
      authority_boundary: {
        report_can_claim_domain_ready: false,
        report_can_claim_quality_verdict: false,
        report_can_claim_artifact_authority: false,
        report_can_claim_production_ready: false,
        report_can_authorize_domain_repo_physical_delete: false,
      },
    },
  };
}

export function buildAgentPlatformSurfaceOwnershipReport(args: string[]) {
  const repos = parseRepoArgs(args, 'opl agents platform-surfaces');
  const reports = repos.map((repo) => (
    buildAgentPlatformSurfaceOwnershipForRepo(repo.repo_dir, repo.requested_agent_id)
  ));
  const blockedCount = reports.filter((report) => report.status === 'blocked').length;
  return {
    version: 'g1',
    agent_platform_surface_ownership: {
      surface_kind: 'opl_agent_platform_surface_ownership_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'passed' : 'blocked',
      summary: {
        total_repo_count: reports.length,
        passed_count: reports.length - blockedCount,
        blocked_count: blockedCount,
        generic_subdomain_count: OPL_OWNED_GENERIC_SUBDOMAINS.length,
        explicit_forbidden_owner_claim_count: reports.reduce(
          (total, report) => total + report.explicit_forbidden_owner_claims.length,
          0,
        ),
        hard_gate_source_policy: 'machine_contracts_receipts_and_proofs_only',
        advisory_diagnostic_source_policy:
          'filename_markdown_prose_and_contract_text_scans_reported_not_blocking',
        advisory_diagnostics_can_block_standard_agent_admission: false,
      },
      reports,
      authority_boundary: {
        report_can_claim_domain_ready: false,
        report_can_claim_quality_verdict: false,
        report_can_claim_artifact_authority: false,
        report_can_claim_production_ready: false,
      },
    },
  };
}
