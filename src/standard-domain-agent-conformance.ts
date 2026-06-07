import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError } from './contracts.ts';
import { buildAgentPlatformSurfaceOwnershipForRepo } from './agent-platform-surface-ownership.ts';
import { buildGeneratedAgentInterfaces } from './domain-pack-compiler.ts';
import { buildFunctionalPrivatizationAudit } from './functional-privatization-audit.ts';
import {
  defaultFamilyRepoInputs,
  DEFAULT_FAMILY_REPOS,
} from './standard-domain-agent-family-repos.ts';
import {
  buildStageArtifactKernelAdoptionChecks,
  buildStageRunCanaryEvidenceChecks,
  buildStageRunKernelProfileChecks,
  buildStateIndexKernelAdoptionChecks,
  buildWorkspaceFileLifecycleChecks,
} from './standard-domain-agent-conformance-adoption.ts';
import { buildStageOperatingPrincipleChecks } from './standard-domain-agent-stage-operating-principles.ts';
import { buildEvidenceTailClassification } from './standard-domain-agent-conformance-evidence-tail.ts';
import { buildGoldenPathDefaultSurfaceBudgetChecks } from './standard-domain-agent-conformance-golden-path.ts';
import { buildPhysicalMorphologyChecks } from './standard-domain-agent-conformance-physical-morphology.ts';
import { validateStandardDomainAgentScaffold } from './standard-domain-agent-scaffold.ts';
import { canonicalOwnerId } from './owner-id.ts';
import {
  collectFieldValues,
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
  unique,
} from './standard-domain-agent-conformance-utils.ts';
import type { FrameworkContracts } from './types.ts';

interface RepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

function readDomainId(repoDir: string, fallback: string | null) {
  const descriptor = readJsonFile(repoDir, 'contracts/domain_descriptor.json').payload;
  if (!isRecord(descriptor)) {
    return fallback ?? path.basename(repoDir);
  }
  return optionalString(descriptor.domain_id)
    ?? optionalString(descriptor.domain_label)
    ?? fallback
    ?? path.basename(repoDir);
}

function directLegacyPackRootFields(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) {
    return [];
  }
  return [
    'canonical_repo_source_semantic_pack_root',
    'domain_pack_root',
    'canonical_repo_source_semantic_pack',
  ].filter((field) => packCompilerInput[field] !== undefined && packCompilerInput[field] !== null);
}

function requiredPackPaths(packCompilerInput: unknown) {
  if (!isRecord(packCompilerInput)) {
    return [];
  }
  const sourceRefs = isRecord(packCompilerInput.source_refs) ? packCompilerInput.source_refs : {};
  return unique([
    ...stringList(packCompilerInput.required_domain_pack_paths),
    ...stringList(sourceRefs.required_domain_pack_paths),
  ]);
}

function parseConformanceArgs(args: string[]): RepoInput[] {
  const repos: RepoInput[] = [];
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
        throw new FrameworkContractError('cli_usage_error', 'agents conformance --agent expects <agent_id>=<repo_dir>.', {
          usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
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
    throw new FrameworkContractError('cli_usage_error', `Unknown agents conformance option: ${token}.`, {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
    });
  }

  const selected = repos.length > 0 ? repos : defaultFamilyRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', 'agents conformance could not discover family agent repos.', {
      usage: 'opl agents conformance [--repo-dir <path> ...] [--agent <id>=<path> ...]',
      default_repo_directories: DEFAULT_FAMILY_REPOS.map((repo) => repo.directory),
      env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
    });
  }
  return selected.map((repo) => ({
    requested_agent_id: repo.requested_agent_id,
    repo_dir: path.resolve(repo.repo_dir),
  }));
}

function buildGeneratedInterfaceCheck(repoDir: string) {
  try {
    const result = buildGeneratedAgentInterfaces({} as FrameworkContracts, ['--repo-dir', repoDir]);
    const bundle = result.generated_agent_interfaces;
    const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : null;
    const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : null;
    const cutoverProof = isRecord(bundle.active_caller_cutover_proof) ? bundle.active_caller_cutover_proof : null;
    const blockers = [
      optionalString(bundle.status) === 'ready'
        ? null
        : `generated_interfaces_status_not_ready:${optionalString(bundle.status) ?? 'missing'}`,
      optionalString(bundle.owner) === 'one-person-lab'
        ? null
        : `generated_interfaces_owner_not_opl:${optionalString(bundle.owner) ?? 'missing'}`,
      bundle.domain_repo_can_own_generated_surface === false
        ? null
        : 'generated_interfaces_domain_repo_can_own_generated_surface_must_be_false',
      optionalString(wrapperBundle?.status) === 'ready'
        ? null
        : `generated_wrapper_bundle_status_not_ready:${optionalString(wrapperBundle?.status) ?? 'missing'}`,
      optionalString(targetProof?.status) === 'ready'
        ? null
        : `active_caller_target_proof_status_not_ready:${optionalString(targetProof?.status) ?? 'missing'}`,
      optionalString(cutoverProof?.status) === 'cutover_to_opl_generated_or_domain_handler_targets'
        ? null
        : `active_caller_cutover_proof_status_not_ready:${optionalString(cutoverProof?.status) ?? 'missing'}`,
    ].filter((entry): entry is string => Boolean(entry));
    return {
      status: blockers.length === 0 ? 'passed' : 'blocked',
      generated_interfaces_status: optionalString(bundle.status),
      generated_surface_owner: optionalString(bundle.generated_surface_owner),
      domain_repo_can_own_generated_surface: bundle.domain_repo_can_own_generated_surface,
      generated_wrapper_bundle_status: optionalString(wrapperBundle?.status),
      active_caller_target_proof_status: optionalString(targetProof?.status),
      active_caller_cutover_proof_status: optionalString(cutoverProof?.status),
      claims_live_soak_complete: cutoverProof?.claims_live_soak_complete === true,
      claims_domain_ready: cutoverProof?.claims_domain_ready === true,
      blocker_reasons: Array.isArray(bundle.blocker_reasons)
        ? bundle.blocker_reasons.filter((entry): entry is string => typeof entry === 'string')
        : [],
      blockers,
    };
  } catch (error) {
    const code = error instanceof FrameworkContractError ? error.code : 'generated_interfaces_error';
    return {
      status: 'blocked',
      generated_interfaces_status: 'error',
      generated_surface_owner: null,
      domain_repo_can_own_generated_surface: null,
      generated_wrapper_bundle_status: null,
      active_caller_target_proof_status: null,
      active_caller_cutover_proof_status: null,
      claims_live_soak_complete: false,
      claims_domain_ready: false,
      blocker_reasons: [],
      blockers: [`generated_interfaces_error:${code}`],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildPackCompilerChecks(repoDir: string) {
  const packCompilerInput = readJsonFile(repoDir, 'contracts/pack_compiler_input.json');
  const payload = packCompilerInput.payload;
  const canonicalPackRoot = isRecord(payload) ? optionalString(payload.canonical_semantic_pack_root) : null;
  const listedPaths = requiredPackPaths(payload);
  const readmeRequiredPaths = listedPaths.filter((entry) => entry === 'README.md' || entry.endsWith('/README.md'));
  const legacyFields = directLegacyPackRootFields(payload);
  const blockers = [
    packCompilerInput.status === 'resolved' ? null : `pack_compiler_input_${packCompilerInput.status}`,
    canonicalPackRoot === 'agent/' ? null : 'pack_compiler_canonical_semantic_pack_root_must_be_agent_slash',
    ...legacyFields.map((field) => `pack_compiler_legacy_pack_root_field:${field}`),
    ...readmeRequiredPaths.map((entry) => `required_domain_pack_path_must_not_be_readme:${entry}`),
    isRecord(payload) && payload.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    isRecord(payload) && payload.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_generated_surface_owner_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: packCompilerInput.status,
    canonical_semantic_pack_root: canonicalPackRoot,
    legacy_pack_root_fields: legacyFields,
    required_domain_pack_paths: listedPaths,
    readme_required_paths: readmeRequiredPaths,
    generated_surface_owner: isRecord(payload) ? optionalString(payload.generated_surface_owner) : null,
    domain_repo_can_own_generated_surface: isRecord(payload) ? payload.domain_repo_can_own_generated_surface : null,
    blockers,
  };
}

function buildGeneratedSurfaceHandoffChecks(repoDir: string) {
  const generatedSurfaceHandoff = readJsonFile(repoDir, 'contracts/generated_surface_handoff.json');
  const payload = generatedSurfaceHandoff.payload;
  const blockers = [
    generatedSurfaceHandoff.status === 'resolved' ? null : `generated_surface_handoff_${generatedSurfaceHandoff.status}`,
    isRecord(payload) && payload.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    isRecord(payload) && payload.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_owner_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: generatedSurfaceHandoff.status,
    generated_surface_owner: isRecord(payload) ? optionalString(payload.generated_surface_owner) : null,
    domain_repo_can_own_generated_surface: isRecord(payload) ? payload.domain_repo_can_own_generated_surface : null,
    blockers,
  };
}

function buildPrivateSurfaceChecks(repoDir: string) {
  const functionalAudit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const payload = functionalAudit.payload;
  const authority = isRecord(payload) && isRecord(payload.authority_boundary) ? payload.authority_boundary : null;
  const normalizedAudit = buildFunctionalPrivatizationAudit(isRecord(payload)
    ? {
        target_domain_id: optionalString(payload.target_domain_id),
        functional_privatization_audit: payload,
      }
    : null);
  const normalizedSummary = normalizedAudit.summary;
  const activePathScanStates = collectFieldValues(payload, 'active_path_scan_state')
    .map((entry) => ({
      path: entry.path,
      state: optionalString(entry.value) ?? String(entry.value),
    }));
  const unavailableScans = activePathScanStates.filter((entry) => entry.state === 'not_available');
  const blockers = [
    functionalAudit.status === 'resolved' ? null : `functional_privatization_audit_${functionalAudit.status}`,
    authority?.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'functional_audit_domain_can_claim_generic_runtime_owner_must_be_false',
    authority?.domain_repo_can_own_generated_surface === true
      ? 'functional_audit_domain_repo_can_own_generated_surface_must_not_be_true'
      : null,
    normalizedSummary.active_private_generic_residue_count === 0
      ? null
      : `functional_audit_active_private_generic_residue_not_retired:${normalizedSummary.active_private_generic_residue_count}`,
    normalizedSummary.default_watchlist_count === 0
      ? null
      : `functional_audit_default_watchlist_not_empty:${normalizedSummary.default_watchlist_count}`,
    ...unavailableScans.map((entry) => `active_path_scan_state_not_available:${entry.path}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: functionalAudit.status,
    domain_can_claim_generic_runtime_owner: authority?.domain_can_claim_generic_runtime_owner ?? null,
    domain_repo_can_own_generated_surface: authority?.domain_repo_can_own_generated_surface ?? null,
    active_private_generic_residue_count: normalizedSummary.active_private_generic_residue_count,
    default_watchlist_count: normalizedSummary.default_watchlist_count,
    private_platform_residue_inventory_count: normalizedSummary.private_platform_residue_inventory_count,
    private_platform_residue_module_ids: normalizedSummary.private_platform_residue_module_ids,
    source_purity_tail_read_model: normalizedAudit.source_purity_tail_read_model,
    active_path_scan_states: activePathScanStates,
    blockers,
  };
}

function buildLegacyRuntimeResidueGuard(privateSurfaceChecks: ReturnType<typeof buildPrivateSurfaceChecks>) {
  const blockers = [
    privateSurfaceChecks.active_private_generic_residue_count === 0
      ? null
      : `legacy_runtime_residue_active_private_generic_residue_not_retired:${privateSurfaceChecks.active_private_generic_residue_count}`,
    privateSurfaceChecks.default_watchlist_count === 0
      ? null
      : `legacy_runtime_residue_default_watchlist_not_empty:${privateSurfaceChecks.default_watchlist_count}`,
    privateSurfaceChecks.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'legacy_runtime_residue_domain_can_claim_generic_runtime_owner_must_be_false',
    privateSurfaceChecks.domain_repo_can_own_generated_surface === true
      ? 'legacy_runtime_residue_domain_repo_can_own_generated_surface_must_not_be_true'
      : null,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    surface_kind: 'opl_legacy_runtime_residue_guard',
    owner: 'one-person-lab',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    guard_role: 'prevent_domain_agent_private_scheduler_runner_session_status_workbench_residue_from_returning_as_active_runtime',
    active_private_generic_residue_count: privateSurfaceChecks.active_private_generic_residue_count,
    default_watchlist_count: privateSurfaceChecks.default_watchlist_count,
    private_platform_residue_inventory_count: privateSurfaceChecks.private_platform_residue_inventory_count,
    private_platform_residue_module_ids: privateSurfaceChecks.private_platform_residue_module_ids,
    accepted_residue_roles: [
      'minimal_authority_function',
      'refs_only_domain_adapter',
      'domain_handler_target',
      'provenance_or_fixture',
      'history_or_tombstone',
    ],
    forbidden_active_runtime_roles: [
      'repo_owned_scheduler',
      'repo_owned_runner',
      'repo_owned_session_store',
      'repo_owned_status_shell',
      'repo_owned_workbench_wrapper',
      'repo_owned_sidecar_wrapper',
      'repo_owned_generic_persistence_engine',
    ],
    authority_boundary: {
      domain_agent_can_own_generic_scheduler_or_queue: false,
      domain_agent_can_claim_generated_surface_owner: false,
      guard_can_delete_domain_files: false,
      guard_can_write_domain_truth: false,
      guard_can_authorize_quality_or_export: false,
    },
    blockers,
  };
}

function buildRepoConformance(input: RepoInput) {
  const repoDir = path.resolve(input.repo_dir);
  const domainId = readDomainId(repoDir, input.requested_agent_id);
  const scaffoldValidation = validateStandardDomainAgentScaffold({ repoDir }).standard_domain_agent_scaffold_validation;
  const packCompilerChecks = buildPackCompilerChecks(repoDir);
  const generatedSurfaceHandoffChecks = buildGeneratedSurfaceHandoffChecks(repoDir);
  const privateSurfaceChecks = buildPrivateSurfaceChecks(repoDir);
  const legacyRuntimeResidueGuard = buildLegacyRuntimeResidueGuard(privateSurfaceChecks);
  const generatedInterfaceChecks = buildGeneratedInterfaceCheck(repoDir);
  const platformSurfaceOwnershipChecks = buildAgentPlatformSurfaceOwnershipForRepo(repoDir, input.requested_agent_id);
  const physicalMorphologyChecks = buildPhysicalMorphologyChecks(repoDir, domainId);
  const workspaceFileLifecycleChecks = buildWorkspaceFileLifecycleChecks(repoDir);
  const stageArtifactKernelAdoptionChecks = buildStageArtifactKernelAdoptionChecks(repoDir);
  const stageRunKernelProfileChecks = buildStageRunKernelProfileChecks(repoDir);
  const stageRunCanaryEvidenceChecks = buildStageRunCanaryEvidenceChecks(repoDir);
  const stageOperatingPrincipleChecks = buildStageOperatingPrincipleChecks(repoDir);
  const stateIndexKernelAdoptionChecks = buildStateIndexKernelAdoptionChecks(repoDir);
  const goldenPathDefaultSurfaceBudgetChecks = buildGoldenPathDefaultSurfaceBudgetChecks(repoDir);
  const evidenceTailClassification = buildEvidenceTailClassification(repoDir, domainId, generatedInterfaceChecks);
  const blockers = unique([
    ...scaffoldValidation.blockers,
    ...packCompilerChecks.blockers,
    ...generatedSurfaceHandoffChecks.blockers,
    ...privateSurfaceChecks.blockers,
    ...legacyRuntimeResidueGuard.blockers,
    ...generatedInterfaceChecks.blockers,
    ...platformSurfaceOwnershipChecks.blockers,
    ...physicalMorphologyChecks.blockers,
    ...workspaceFileLifecycleChecks.blockers,
    ...stageArtifactKernelAdoptionChecks.blockers,
    ...stageRunKernelProfileChecks.blockers,
    ...stageRunCanaryEvidenceChecks.blockers,
    ...stageOperatingPrincipleChecks.blockers,
    ...stateIndexKernelAdoptionChecks.blockers,
    ...goldenPathDefaultSurfaceBudgetChecks.blockers,
  ]);

  return {
    repo_dir: repoDir,
    requested_agent_id: input.requested_agent_id,
    domain_id: domainId,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    blockers,
    scaffold_validation: {
      status: scaffoldValidation.status, blockers: scaffoldValidation.blockers,
      agent_pack_validation: scaffoldValidation.agent_pack_validation,
      stage_ref_validation: scaffoldValidation.stage_ref_validation,
      stage_pack_v2_validation: scaffoldValidation.stage_pack_v2_validation,
    },
    pack_compiler_checks: packCompilerChecks,
    generated_surface_handoff_checks: generatedSurfaceHandoffChecks,
    private_surface_checks: privateSurfaceChecks,
    legacy_runtime_residue_guard: legacyRuntimeResidueGuard,
    generated_interface_checks: generatedInterfaceChecks,
    platform_surface_ownership_checks: platformSurfaceOwnershipChecks,
    physical_morphology_checks: physicalMorphologyChecks,
    workspace_file_lifecycle_checks: workspaceFileLifecycleChecks,
    stage_artifact_kernel_adoption_checks: stageArtifactKernelAdoptionChecks,
    stage_run_kernel_profile_checks: stageRunKernelProfileChecks,
    stage_run_canary_evidence_checks: stageRunCanaryEvidenceChecks,
    stage_operating_principle_checks: stageOperatingPrincipleChecks,
    state_index_kernel_adoption_checks: stateIndexKernelAdoptionChecks,
    golden_path_default_surface_budget_checks: goldenPathDefaultSurfaceBudgetChecks,
    evidence_tail_classification: evidenceTailClassification,
  };
}

type RepoConformanceReport = ReturnType<typeof buildRepoConformance>;

function countTailItems(report: RepoConformanceReport, status: string) {
  return report.evidence_tail_classification.tail_items
    .filter((item) => optionalString(item.status) === status)
    .length;
}

function stageRunDomainNextAction(report: RepoConformanceReport) {
  if (
    report.stage_run_kernel_profile_checks.status !== 'passed'
    || report.stage_run_canary_evidence_checks.status !== 'passed'
    || report.stage_run_canary_evidence_checks.operator_summary.status !== 'ready'
  ) {
    return 'repair_stage_run_profile_canary_or_structural_conformance_blockers';
  }
  if (countTailItems(report, 'open') > 0) {
    return 'domain_owner_live_receipt_typed_blocker_no_regression_or_long_soak_ref_required';
  }
  if (countTailItems(report, 'domain_owned_typed_blocker') > 0) {
    return 'domain_owner_typed_blocker_ref_observed_wait_for_owner_resolution_or_no_regression_ref';
  }
  return 'domain_owner_live_progress_evidence_still_required_before_domain_or_production_ready';
}

const LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES = [
  'domain_owner_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'quality_or_export_receipt_ref',
  'no_regression_ref',
  'long_soak_ref',
];

function buildStageRunDomainAdoptionReadModel(reports: RepoConformanceReport[]) {
  const domains = reports.map((report) => {
    const profile = report.stage_run_kernel_profile_checks;
    const canary = report.stage_run_canary_evidence_checks;
    const domainId = canonicalOwnerId(report.domain_id);
    return {
      domain_id: domainId,
      ...(domainId !== report.domain_id ? { source_domain_id: report.domain_id } : {}),
      requested_agent_id: report.requested_agent_id,
      repo_dir: report.repo_dir,
      status: report.status,
      stage_run_kernel_profile_status: profile.status,
      stage_run_kernel_profile_source: profile.profile_source,
      stage_run_default_read_surface_root: profile.default_read_surface.root,
      stage_run_terminal_transition_authority:
        profile.transition_authority.terminal_transition_authority,
      stage_run_canary_evidence_status: canary.status,
      stage_run_canary_evidence_scope: canary.evidence_scope,
      stage_run_canary_operator_status: canary.operator_summary.status,
      stage_run_canary_stage_id: canary.stage_id,
      stage_run_canary_id: canary.canary_id,
      stage_operating_principles_status: report.stage_operating_principle_checks.status,
      stage_operating_principles_source:
        report.stage_operating_principle_checks.policy_source,
      management_boundary_stage_unit:
        report.stage_operating_principle_checks.management_boundary.stage_unit,
      speed_policy_executor_autonomy_inside_stage:
        report.stage_operating_principle_checks.speed_policy.executor_autonomy_inside_stage,
      speed_policy_quality_gaps_block_ordinary_progress_by_default:
        report.stage_operating_principle_checks.speed_policy
          .quality_gaps_block_ordinary_progress_by_default,
      stage_operating_default_read_surface_root:
        report.stage_operating_principle_checks.default_read_surface.root,
      stage_operating_demoted_default_surfaces:
        report.stage_operating_principle_checks.demoted_default_surfaces,
      stage_run_ref: canary.stage_run_ref,
      stage_manifest_ref: canary.stage_manifest_ref,
      current_pointer_ref: canary.current_pointer_ref,
      controlled_canary_claims_live_domain_progress: false,
      domain_production_acceptance_tail_status: report.evidence_tail_classification.status,
      domain_production_acceptance_tail_count: report.evidence_tail_classification.tail_items.length,
      domain_production_acceptance_tail_open_count: countTailItems(report, 'open'),
      domain_production_acceptance_tail_typed_blocker_count: countTailItems(
        report,
        'domain_owned_typed_blocker',
      ),
      domain_production_acceptance_tail_scope:
        'domain_owned_acceptance_refs_not_live_stage_run_progress_evidence',
      production_evidence_tail_status: report.evidence_tail_classification.status,
      production_evidence_tail_count: report.evidence_tail_classification.tail_items.length,
      production_evidence_tail_open_count: countTailItems(report, 'open'),
      production_evidence_tail_typed_blocker_count: countTailItems(report, 'domain_owned_typed_blocker'),
      live_stage_run_progress_evidence_status: 'required_from_domain_owner',
      live_stage_run_progress_evidence_required_from: 'domain_owner',
      structural_conformance_is_domain_ready: false,
      next_required_owner_action: stageRunDomainNextAction(report),
      authority_boundary: {
        can_claim_live_domain_progress: false,
        can_claim_domain_ready: false,
        can_claim_quality_or_export_ready: false,
        can_claim_artifact_ready: false,
        can_claim_production_ready: false,
        can_sign_owner_receipt: false,
        can_create_typed_blocker: false,
        can_authorize_physical_delete: false,
      },
    };
  });
  const profilePassedCount = domains
    .filter((domain) => domain.stage_run_kernel_profile_status === 'passed')
    .length;
  const canaryPassedCount = domains
    .filter((domain) => domain.stage_run_canary_evidence_status === 'passed')
    .length;
  const productionEvidenceTailCount = domains.reduce(
    (total, domain) => total + domain.production_evidence_tail_count,
    0,
  );
  const openProductionEvidenceTailCount = domains.reduce(
    (total, domain) => total + domain.production_evidence_tail_open_count,
    0,
  );
  const domainProductionAcceptanceTailCount = domains.reduce(
    (total, domain) => total + domain.domain_production_acceptance_tail_count,
    0,
  );
  const openDomainProductionAcceptanceTailCount = domains.reduce(
    (total, domain) => total + domain.domain_production_acceptance_tail_open_count,
    0,
  );
  const liveStageRunProgressEvidenceWorklist = {
    surface_kind: 'opl_live_stage_run_progress_evidence_worklist',
    owner: 'domain_owner',
    status: 'required_from_domain_owner',
    open_domain_count: domains.length,
    required_from: 'domain_owner',
    accepted_refs_only_result_shapes: LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES,
    domains: domains.map((domain) => ({
      domain_id: domain.domain_id,
      requested_agent_id: domain.requested_agent_id,
      repo_dir: domain.repo_dir,
      status: domain.live_stage_run_progress_evidence_status,
      next_required_owner_action: domain.next_required_owner_action,
      accepted_refs_only_result_shapes: LIVE_STAGE_RUN_PROGRESS_ACCEPTED_RESULT_SHAPES,
      structural_conformance_is_domain_ready: domain.structural_conformance_is_domain_ready,
      conformance_can_claim_live_domain_progress: false,
      conformance_can_claim_domain_ready: false,
      conformance_can_claim_production_ready: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
    })),
    authority_boundary: {
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
  };
  return {
    surface_kind: 'opl_stage_run_domain_adoption_read_model',
    owner: 'one-person-lab',
    read_model_role:
      'top_level_operator_projection_from_standard_domain_agent_conformance_reports',
    status: profilePassedCount === reports.length && canaryPassedCount === reports.length
      ? 'passed'
      : 'blocked',
    domain_count: reports.length,
    stage_run_kernel_profile_passed_count: profilePassedCount,
    stage_run_canary_evidence_passed_count: canaryPassedCount,
    controlled_canary_evidence_scope: domains.every((domain) =>
      domain.stage_run_canary_evidence_scope === 'controlled_fixture_not_live_domain_progress'
    )
      ? 'controlled_fixture_not_live_domain_progress'
      : 'mixed_or_blocked',
    production_evidence_tail_count: productionEvidenceTailCount,
    open_production_evidence_tail_count: openProductionEvidenceTailCount,
    production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
    domain_production_acceptance_tail_count: domainProductionAcceptanceTailCount,
    open_domain_production_acceptance_tail_count: openDomainProductionAcceptanceTailCount,
    domain_production_acceptance_tail_policy:
      'domain_owned_acceptance_refs_are_reported_separately_from_live_stage_run_progress',
    live_stage_run_progress_evidence_status: 'required_from_domain_owner',
    live_stage_run_progress_evidence_policy:
      'controlled_canary_and_structural_conformance_do_not_close_live_domain_progress_evidence',
    live_stage_run_progress_evidence_worklist: liveStageRunProgressEvidenceWorklist,
    controlled_canary_claims_live_domain_progress: false,
    conformance_pass_counts_as_domain_ready: false,
    conformance_pass_counts_as_production_ready: false,
    domains,
    authority_boundary: {
      can_claim_live_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_or_export_ready: false,
      can_claim_artifact_ready: false,
      can_claim_production_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_physical_delete: false,
    },
  };
}

export function buildStandardDomainAgentConformanceReport(args: string[]) {
  const repos = parseConformanceArgs(args);
  const reports = repos.map(buildRepoConformance);
  const passedCount = reports.filter((report) => report.status === 'passed').length;
  const blockedCount = reports.length - passedCount;
  const productionEvidenceTailCount = reports.reduce(
    (total, report) => total + report.evidence_tail_classification.tail_items.length,
    0,
  );
  const structuralConformanceStatus = blockedCount === 0 ? 'passed' : 'blocked';
  const stageRunDomainAdoptionReadModel = buildStageRunDomainAdoptionReadModel(reports);
  return {
    version: 'g2',
    passed_count: passedCount,
    blocked_count: blockedCount,
    structural_conformance_status: structuralConformanceStatus,
    production_evidence_tail_count: productionEvidenceTailCount,
    production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
    stage_run_domain_adoption_read_model: stageRunDomainAdoptionReadModel,
    standard_domain_agent_conformance: {
      surface_kind: 'opl_standard_domain_agent_conformance_report',
      owner: 'one-person-lab',
      status: structuralConformanceStatus,
      total_repo_count: reports.length,
      passed_count: passedCount,
      blocked_count: blockedCount,
      structural_conformance_status: structuralConformanceStatus,
      production_evidence_tail_count: productionEvidenceTailCount,
      production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
      stage_run_domain_adoption_read_model: stageRunDomainAdoptionReadModel,
      summary: {
        total_repo_count: reports.length,
        passed_count: passedCount,
        blocked_count: blockedCount,
        structural_conformance_status: structuralConformanceStatus,
        production_evidence_tail_count: productionEvidenceTailCount,
        production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
        stage_run_domain_adoption_status: stageRunDomainAdoptionReadModel.status,
        stage_run_domain_adoption_domain_count: stageRunDomainAdoptionReadModel.domain_count,
        stage_run_controlled_canary_evidence_scope:
          stageRunDomainAdoptionReadModel.controlled_canary_evidence_scope,
      },
      reports,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        conformance_report_can_claim_domain_ready: false,
      },
    },
  };
}
