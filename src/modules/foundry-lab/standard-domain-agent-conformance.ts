import fs from 'node:fs';
import path from 'node:path';

import { loadFrameworkContracts } from '../charter/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  buildAgentWorkspaceNormChecks,
  buildAgentWorkspaceNormProjection,
} from '../workspace/index.ts';
import { buildAgentPlatformSurfaceOwnershipForRepo } from './agent-platform-surface-ownership.ts';
import { buildFunctionalPrivatizationAudit } from './functional-privatization-audit.ts';
import { buildPrivatePlatformResidueDeletionGate } from './private-platform-residue-deletion-gate.ts';
import {
  defaultFamilyRepoInputs,
  DEFAULT_FAMILY_REPOS,
} from '../atlas/index.ts';
import { resolveStandardAgent } from '../atlas/index.ts';
import {
  buildStageArtifactKernelAdoptionChecks,
  buildStageRunCanaryEvidenceChecks,
  buildStageRunKernelProfileChecks,
  buildStateIndexKernelAdoptionChecks,
  buildWorkspaceFileLifecycleChecks,
} from './standard-domain-agent-conformance-adoption.ts';
import { buildStageOperatingPrincipleChecks } from './standard-domain-agent-stage-operating-principles.ts';
import { buildStandardAgentPrincipleAdoptionChecks } from './standard-agent-principles.ts';
import { buildEvidenceTailClassification } from './standard-domain-agent-conformance-evidence-tail.ts';
import { buildFamilyAgentLiveConformanceProbe } from './family-agent-conformance-probe.ts';
import { buildGeneratedInterfaceCheck } from './standard-domain-agent-conformance-generated-interfaces.ts';
import { buildStandardAgentRepoContractReadout, type StandardAgentRepoContractReadout } from '../pack/index.ts';
import { buildGoldenPathDefaultSurfaceBudgetChecks } from './standard-domain-agent-conformance-golden-path.ts';
import { buildPhysicalMorphologyChecks } from './standard-domain-agent-conformance-physical-morphology.ts';
import { buildStandardAgentSourceBehaviorChecks } from './standard-domain-agent-source-behavior.ts';
import { buildStageRunDomainAdoptionReadModel } from './standard-domain-agent-conformance-stage-run-adoption.ts';
import { buildFoundryAgentOsConformance } from './standard-domain-agent-conformance-foundry-agent-os.ts';
import { validateStandardDomainAgentScaffold } from './standard-domain-agent-scaffold.ts';
import { validateStandardAgentImplementationProfileRefs } from '../pack/standard-agent-implementation-profile.ts';
import {
  collectFieldValues,
  isRecord,
  optionalString,
  readJsonFile,
  stringList,
  unique,
} from './standard-domain-agent-conformance-utils.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

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

function canonicalAgentIdForInput(input: RepoInput) {
  const rawId = input.requested_agent_id ?? path.basename(input.repo_dir);
  return resolveStandardAgent(rawId)?.agent_id ?? rawId;
}

function isFrameworkCapabilityPackageInput(input: RepoInput) {
  if (canonicalAgentIdForInput(input) !== 'mas-scholar-skills') {
    return false;
  }
  const repoDir = path.resolve(input.repo_dir);
  return fs.existsSync(path.join(repoDir, 'contracts', 'scholar-skills-capability-modules.json'));
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

function buildPackCompilerChecks(repoDir: string) {
  const packCompilerInput = readJsonFile(repoDir, 'contracts/pack_compiler_input.json');
  const payload = packCompilerInput.payload;
  const implementationProfileValidation = validateStandardAgentImplementationProfileRefs(
    isRecord(payload) ? payload.implementation_profile : undefined,
    repoDir,
  );
  const canonicalAgentId = resolveStandardAgent(readDomainId(repoDir, null))?.agent_id;
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
    ...(implementationProfileValidation.status === 'blocked'
      ? implementationProfileValidation.blockers
      : []),
    canonicalAgentId === 'mas-scholar-skills' && implementationProfileValidation.status !== 'missing'
      ? 'framework_capability_package_must_not_declare_standard_agent_implementation_profile'
      : null,
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
    implementation_profile: isRecord(payload) ? payload.implementation_profile ?? null : null,
    implementation_profile_status: implementationProfileValidation.status,
    implementation_profile_blockers: implementationProfileValidation.blockers,
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
  const privatePlatformResidueDeletionGate =
    buildPrivatePlatformResidueDeletionGate(normalizedAudit.modules);
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
    private_platform_residue_deletion_gate: privatePlatformResidueDeletionGate,
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

function buildRepoConformance(
  input: RepoInput,
  contracts: FrameworkContracts,
  repoContractReadout: StandardAgentRepoContractReadout,
) {
  const repoDir = path.resolve(input.repo_dir);
  const domainId = readDomainId(repoDir, input.requested_agent_id);
  const scaffoldValidation = validateStandardDomainAgentScaffold({
    repoDir,
    repoContractReadout,
  }).standard_domain_agent_scaffold_validation;
  const packCompilerChecks = buildPackCompilerChecks(repoDir);
  const generatedSurfaceHandoffChecks = buildGeneratedSurfaceHandoffChecks(repoDir);
  const privateSurfaceChecks = buildPrivateSurfaceChecks(repoDir);
  const legacyRuntimeResidueGuard = buildLegacyRuntimeResidueGuard(privateSurfaceChecks);
  const generatedInterfaceChecks = buildGeneratedInterfaceCheck(repoDir);
  const platformSurfaceOwnershipChecks = buildAgentPlatformSurfaceOwnershipForRepo(repoDir, input.requested_agent_id);
  const physicalMorphologyChecks = buildPhysicalMorphologyChecks(repoDir, domainId);
  const sourceBehaviorChecks = buildStandardAgentSourceBehaviorChecks(repoDir);
  const workspaceFileLifecycleChecks = buildWorkspaceFileLifecycleChecks(repoDir);
  const stageArtifactKernelAdoptionChecks = buildStageArtifactKernelAdoptionChecks(repoDir);
  const stageRunKernelProfileChecks = buildStageRunKernelProfileChecks(repoDir);
  const stageRunCanaryEvidenceChecks = buildStageRunCanaryEvidenceChecks(repoDir);
  const stageOperatingPrincipleChecks = buildStageOperatingPrincipleChecks(repoDir);
  const standardAgentPrincipleChecks = buildStandardAgentPrincipleAdoptionChecks(repoDir);
  const stateIndexKernelAdoptionChecks = buildStateIndexKernelAdoptionChecks(repoDir);
  const goldenPathDefaultSurfaceBudgetChecks = buildGoldenPathDefaultSurfaceBudgetChecks(
    repoDir,
    repoContractReadout,
  );
  const workspaceNormChecks = buildAgentWorkspaceNormChecks(contracts.agentWorkspaceNorm);
  const workspaceNormProjection = buildAgentWorkspaceNormProjection({
    contract: contracts.agentWorkspaceNorm,
    agentId: input.requested_agent_id ?? null,
  });
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
    ...sourceBehaviorChecks.blockers,
    ...workspaceFileLifecycleChecks.blockers,
    ...stageArtifactKernelAdoptionChecks.blockers,
    ...stageRunKernelProfileChecks.blockers,
    ...stageRunCanaryEvidenceChecks.blockers,
    ...stageOperatingPrincipleChecks.blockers,
    ...standardAgentPrincipleChecks.blockers,
    ...stateIndexKernelAdoptionChecks.blockers,
    ...goldenPathDefaultSurfaceBudgetChecks.blockers,
    ...workspaceNormChecks.blockers,
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
    source_behavior_checks: sourceBehaviorChecks,
    workspace_file_lifecycle_checks: workspaceFileLifecycleChecks,
    stage_artifact_kernel_adoption_checks: stageArtifactKernelAdoptionChecks,
    stage_run_kernel_profile_checks: stageRunKernelProfileChecks,
    stage_run_canary_evidence_checks: stageRunCanaryEvidenceChecks,
    stage_operating_principle_checks: stageOperatingPrincipleChecks,
    standard_agent_principle_checks: standardAgentPrincipleChecks,
    state_index_kernel_adoption_checks: stateIndexKernelAdoptionChecks,
    golden_path_default_surface_budget_checks: goldenPathDefaultSurfaceBudgetChecks,
    workspace_norm_checks: workspaceNormChecks,
    workspace_norm_projection: workspaceNormProjection,
    evidence_tail_classification: evidenceTailClassification,
  };
}

export type RepoConformanceReport = ReturnType<typeof buildRepoConformance>;

function buildFrameworkCapabilityPackageConformance(input: RepoInput) {
  const repoDir = path.resolve(input.repo_dir);
  const capabilityContract = readJsonFile(repoDir, 'contracts/scholar-skills-capability-modules.json');
  const contract = isRecord(capabilityContract.payload) ? capabilityContract.payload : null;
  const authorityBoundary = isRecord(contract?.authority_boundary)
    ? contract.authority_boundary
    : null;
  const pluginManifestPath = path.join(repoDir, '.codex-plugin', 'plugin.json');
  const skillEntryPath = path.join(repoDir, 'skills', 'mas-scholar-skills', 'SKILL.md');
  const blockers = unique([
    canonicalAgentIdForInput(input) === 'mas-scholar-skills'
      ? null
      : `framework_capability_package_agent_invalid:${input.requested_agent_id ?? path.basename(repoDir)}`,
    capabilityContract.status === 'resolved'
      ? null
      : `scholarskills_capability_contract_${capabilityContract.status}`,
    contract?.contract_id === 'opl_scholarskills_capability_modules'
      ? null
      : 'scholarskills_capability_contract_id_invalid',
    authorityBoundary?.can_claim_domain_ready === false
      ? null
      : 'scholarskills_capability_can_claim_domain_ready_must_be_false',
    authorityBoundary?.can_claim_runtime_ready === false
      ? null
      : 'scholarskills_capability_can_claim_runtime_ready_must_be_false',
    authorityBoundary?.can_write_domain_truth === false
      ? null
      : 'scholarskills_capability_can_write_domain_truth_must_be_false',
    authorityBoundary?.can_sign_owner_receipt === false
      ? null
      : 'scholarskills_capability_can_sign_owner_receipt_must_be_false',
    authorityBoundary?.can_create_typed_blocker === false
      ? null
      : 'scholarskills_capability_can_create_typed_blocker_must_be_false',
    authorityBoundary?.can_schedule_runtime === false
      ? null
      : 'scholarskills_capability_can_schedule_runtime_must_be_false',
    fs.existsSync(pluginManifestPath)
      ? null
      : 'scholarskills_capability_plugin_manifest_missing',
    fs.existsSync(skillEntryPath)
      ? null
      : 'scholarskills_capability_skill_entry_missing',
  ].filter((entry): entry is string => Boolean(entry)));

  return {
    repo_dir: repoDir,
    requested_agent_id: input.requested_agent_id,
    domain_id: 'scholarskills',
    canonical_agent_id: 'mas-scholar-skills',
    package_scope: 'framework_capability_package',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: capabilityContract.status,
    capability_contract_ref: 'contracts/scholar-skills-capability-modules.json',
    plugin_manifest_path: '.codex-plugin/plugin.json',
    skill_entry_path: 'skills/mas-scholar-skills/SKILL.md',
    authority_boundary: {
      can_claim_domain_ready: authorityBoundary?.can_claim_domain_ready ?? null,
      can_claim_runtime_ready: authorityBoundary?.can_claim_runtime_ready ?? null,
      can_write_domain_truth: authorityBoundary?.can_write_domain_truth ?? null,
      can_sign_owner_receipt: authorityBoundary?.can_sign_owner_receipt ?? null,
      can_create_typed_blocker: authorityBoundary?.can_create_typed_blocker ?? null,
      can_schedule_runtime: authorityBoundary?.can_schedule_runtime ?? null,
    },
    blockers,
  };
}

export type FrameworkCapabilityPackageConformanceReport =
  ReturnType<typeof buildFrameworkCapabilityPackageConformance>;

export function buildStandardDomainAgentConformanceReport(
  args: string[],
  contracts: FrameworkContracts = loadFrameworkContracts(),
) {
  const repos = parseConformanceArgs(args);
  const frameworkCapabilityPackageInputs = repos.filter(isFrameworkCapabilityPackageInput);
  const standardAgentInputs = repos.filter((repo) => !frameworkCapabilityPackageInputs.includes(repo));
  const frameworkCapabilityPackages = frameworkCapabilityPackageInputs
    .map((repo) => buildFrameworkCapabilityPackageConformance(repo));
  const repoContractReadouts = new Map(standardAgentInputs.map((repo) => {
    const repoDir = path.resolve(repo.repo_dir);
    return [repoDir, buildStandardAgentRepoContractReadout(repoDir)] as const;
  }));
  const reports = standardAgentInputs.map((repo) => buildRepoConformance(
    repo,
    contracts,
    repoContractReadouts.get(path.resolve(repo.repo_dir))!,
  ));
  const totalRepoCount = reports.length + frameworkCapabilityPackages.length;
  const passedCount = [
    ...reports,
    ...frameworkCapabilityPackages,
  ].filter((report) => report.status === 'passed').length;
  const blockedCount = totalRepoCount - passedCount;
  const productionEvidenceTailCount = reports.reduce(
    (total, report) => total + report.evidence_tail_classification.tail_items.length,
    0,
  );
  const structuralConformanceStatus = blockedCount === 0 ? 'passed' : 'blocked';
  const stageRunDomainAdoptionReadModel = buildStageRunDomainAdoptionReadModel(reports);
  const structuralContractStatus = structuralConformanceStatus;
  const ordinaryPathGuardStatus = stageRunDomainAdoptionReadModel.status;
  const liveDomainProgressStatus = ordinaryPathGuardStatus === 'passed'
    ? stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_status
    : 'blocked';
  const liveStageRunProgressEvidenceWorklist =
    stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_worklist;
  const liveStageRunProgressEvidenceOpenDomainCount =
    typeof liveStageRunProgressEvidenceWorklist.open_domain_count === 'number'
      ? liveStageRunProgressEvidenceWorklist.open_domain_count
      : 0;
  const familyLiveConformanceProbe = buildFamilyAgentLiveConformanceProbe(
    reports,
    contracts,
    repoContractReadouts,
  );
  const foundryAgentOsConformance = buildFoundryAgentOsConformance(
    reports,
    contracts,
    frameworkCapabilityPackages,
  );
  return {
    version: 'g2',
    passed_count: passedCount,
    blocked_count: blockedCount,
    structural_conformance_status: structuralConformanceStatus,
    structural_contract_status: structuralContractStatus,
    ordinary_path_guard_status: ordinaryPathGuardStatus,
    live_domain_progress_status: liveDomainProgressStatus,
    family_live_conformance_probe_status: familyLiveConformanceProbe.status,
    family_live_conformance_probe_blocked_domain_count:
      familyLiveConformanceProbe.blocked_domain_count,
    production_evidence_tail_count: productionEvidenceTailCount,
    production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
    live_stage_run_progress_evidence_status:
      stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_status,
    live_stage_run_progress_evidence_open_domain_count:
      liveStageRunProgressEvidenceOpenDomainCount,
    live_stage_run_progress_evidence_policy:
      stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_policy,
    stage_run_domain_adoption_read_model: stageRunDomainAdoptionReadModel,
    foundry_agent_os_conformance: foundryAgentOsConformance,
    standard_domain_agent_conformance: {
      surface_kind: 'opl_standard_domain_agent_conformance_report',
      owner: 'one-person-lab',
      status: structuralConformanceStatus,
      total_repo_count: totalRepoCount,
      passed_count: passedCount,
      blocked_count: blockedCount,
      structural_conformance_status: structuralConformanceStatus,
      structural_contract_status: structuralContractStatus,
      ordinary_path_guard_status: ordinaryPathGuardStatus,
      live_domain_progress_status: liveDomainProgressStatus,
      family_live_conformance_probe_status: familyLiveConformanceProbe.status,
      family_live_conformance_probe_blocked_domain_count:
        familyLiveConformanceProbe.blocked_domain_count,
      production_evidence_tail_count: productionEvidenceTailCount,
      production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
      live_stage_run_progress_evidence_status:
        stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_status,
      live_stage_run_progress_evidence_open_domain_count:
        liveStageRunProgressEvidenceOpenDomainCount,
      live_stage_run_progress_evidence_policy:
        stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_policy,
      stage_run_domain_adoption_read_model: stageRunDomainAdoptionReadModel,
      foundry_agent_os_conformance: foundryAgentOsConformance,
      summary: {
        total_repo_count: totalRepoCount,
        passed_count: passedCount,
        blocked_count: blockedCount,
        structural_conformance_status: structuralConformanceStatus,
        structural_contract_status: structuralContractStatus,
        ordinary_path_guard_status: ordinaryPathGuardStatus,
        live_domain_progress_status: liveDomainProgressStatus,
        production_evidence_tail_count: productionEvidenceTailCount,
        production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
        live_stage_run_progress_evidence_status:
          stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_status,
        live_stage_run_progress_evidence_open_domain_count:
          liveStageRunProgressEvidenceOpenDomainCount,
        live_stage_run_progress_evidence_policy:
          stageRunDomainAdoptionReadModel.live_stage_run_progress_evidence_policy,
        stage_run_domain_adoption_status: stageRunDomainAdoptionReadModel.status,
        stage_run_domain_adoption_domain_count: stageRunDomainAdoptionReadModel.domain_count,
        stage_run_controlled_canary_evidence_scope:
          stageRunDomainAdoptionReadModel.controlled_canary_evidence_scope,
        family_live_conformance_probe_status: familyLiveConformanceProbe.status,
        family_live_conformance_probe_blocked_domain_count:
          familyLiveConformanceProbe.blocked_domain_count,
        foundry_agent_os_conformance_status: foundryAgentOsConformance.status,
      },
      family_live_conformance_probe: familyLiveConformanceProbe,
      reports,
      framework_capability_packages: frameworkCapabilityPackages,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        conformance_report_can_claim_domain_ready: false,
        conformance_report_can_claim_production_ready: false,
      },
    },
  };
}
