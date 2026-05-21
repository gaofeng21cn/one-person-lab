import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from './contracts.ts';
import { buildAgentPlatformSurfaceOwnershipForRepo } from './agent-platform-surface-ownership.ts';
import { buildGeneratedAgentInterfaces } from './domain-pack-compiler.ts';
import { buildEvidenceTailClassification } from './standard-domain-agent-conformance-evidence-tail.ts';
import { validateStandardDomainAgentScaffold } from './standard-domain-agent-scaffold.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

interface RepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

const DEFAULT_FAMILY_REPOS = [
  { requested_agent_id: 'mas', directory: 'med-autoscience' },
  { requested_agent_id: 'mag', directory: 'med-autogrant' },
  { requested_agent_id: 'rca', directory: 'redcube-ai' },
  { requested_agent_id: 'opl-meta-agent', directory: 'opl-meta-agent' },
] as const;

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPL_REPO_ROOT = path.resolve(SOURCE_DIR, '..');

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function recordList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function readJsonFile(repoDir: string, relativePath: string) {
  const absolutePath = path.join(repoDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: relativePath,
      status: 'missing',
      payload: null,
      error: null,
    };
  }
  try {
    return {
      path: relativePath,
      status: 'resolved',
      payload: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return {
      path: relativePath,
      status: 'invalid_json',
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function gitTrackedOrWalkedFiles(repoDir: string) {
  const gitResult = spawnSync('git', ['ls-files'], {
    cwd: repoDir,
    encoding: 'utf8',
  });
  if (gitResult.status === 0 && gitResult.stdout.trim()) {
    return gitResult.stdout.split('\n').filter(Boolean).sort();
  }
  return walkFiles(repoDir).sort();
}

function walkFiles(root: string, current = root): string[] {
  if (!fs.existsSync(current)) {
    return [];
  }
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.git') || entry.name === 'node_modules' || entry.name === 'dist') {
      return [];
    }
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(root, absolutePath);
    }
    if (!entry.isFile()) {
      return [];
    }
    return [path.relative(root, absolutePath).split(path.sep).join('/')];
  });
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

function collectFieldValues(value: unknown, targetField: string, currentPath = '$'): Array<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectFieldValues(entry, targetField, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => {
    const fieldPath = `${currentPath}.${field}`;
    const direct = field === targetField ? [{ path: fieldPath, value: fieldValue }] : [];
    return [...direct, ...collectFieldValues(fieldValue, targetField, fieldPath)];
  });
}

function collectStringValues(value: unknown, currentPath = '$'): Array<{ path: string; value: string }> {
  if (typeof value === 'string') {
    return [{ path: currentPath, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStringValues(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => (
    collectStringValues(fieldValue, `${currentPath}.${field}`)
  ));
}

function workspaceCandidatesFrom(seed: string) {
  const candidates = [seed, path.dirname(seed)];
  let current = path.resolve(seed);
  while (current !== path.dirname(current)) {
    if (path.basename(current) === '.worktrees') {
      candidates.push(path.dirname(path.dirname(current)));
    }
    current = path.dirname(current);
  }
  return candidates;
}

function defaultFamilyRepoInputs(): RepoInput[] {
  const workspaceRoots = unique([
    ...(process.env.OPL_FAMILY_WORKSPACE_ROOT ? [process.env.OPL_FAMILY_WORKSPACE_ROOT] : []),
    ...workspaceCandidatesFrom(process.cwd()),
    ...workspaceCandidatesFrom(OPL_REPO_ROOT),
  ].map((entry) => path.resolve(entry)));

  const repos: RepoInput[] = [];
  for (const workspaceRoot of workspaceRoots) {
    for (const repo of DEFAULT_FAMILY_REPOS) {
      const repoDir = path.join(workspaceRoot, repo.directory);
      if (
        fs.existsSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'))
        && !repos.some((entry) => path.resolve(entry.repo_dir) === path.resolve(repoDir))
      ) {
        repos.push({
          requested_agent_id: repo.requested_agent_id,
          repo_dir: repoDir,
        });
      }
    }
  }
  return repos;
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
    ...unavailableScans.map((entry) => `active_path_scan_state_not_available:${entry.path}`),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: functionalAudit.status,
    domain_can_claim_generic_runtime_owner: authority?.domain_can_claim_generic_runtime_owner ?? null,
    domain_repo_can_own_generated_surface: authority?.domain_repo_can_own_generated_surface ?? null,
    active_path_scan_states: activePathScanStates,
    blockers,
  };
}

const ACTIVE_MORPHOLOGY_SCAN_ROOTS = [
  'agent/',
  'src/',
  'packages/',
  'apps/',
  'scripts/',
  'runtime/',
  'contracts/',
  'tests/',
  'Makefile',
  'package.json',
  'pyproject.toml',
  'docs/active/',
  'docs/status.md',
];

const DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES = [
  'docs/history/',
  'docs/references/',
  'docs/specs/',
  'tests/legacy',
  'tests/fixtures/legacy',
];

const REQUIRED_MAG_PHYSICAL_SURFACES = [
  'domain_runtime',
  'product_entry',
  'status',
  'user_loop',
  'sidecar',
  'runtime_registration',
  'control_plane',
  'lifecycle',
  'memory',
  'package',
  'autonomy_controller',
  'legacy_runtime_residue',
];

const REQUIRED_RCA_PHYSICAL_SURFACES = [
  'mcp_product_entry_domain_entry',
  'product_entry_session_store',
  'runtime_watch_projection',
  'product_sidecar_guarded_actions',
  'operator_evidence_stability_projection',
  'visual_authority_functions',
  'legacy_managed_runtime_gateway_names',
];

const REQUIRED_META_SCRIPT_CLASSES = [
  'authority_function_implementation_ref',
  'smoke_helper',
  'fixture_or_proof_helper',
  'developer_work_order_materializer',
];

const REQUIRED_META_FORBIDDEN_SCRIPT_ROLES = [
  'generic_runtime_owner',
  'generic_registry_owner',
  'app_shell_owner',
  'agent_lab_execution_owner',
  'promotion_gate_owner',
  'target_domain_truth_writer',
];

const MAS_FORBIDDEN_ACTIVE_RESIDUE = [
  'runtime_supervisor',
  'supervision_scheduler',
  'mas_supervision_scheduler',
  'BRANCH_NAME',
  'OWNED_FILES',
  'VERIFICATION_COMMANDS',
];

const MAG_FORBIDDEN_ACTIVE_RESIDUE = [
  'local_journal',
  'attempt_ledger',
  'repo_owned_scheduler',
  ['hermes', 'gateway', 'local', 'manager', 'probe'].join('_'),
  'compat_facade_active_alias',
];

const MAG_REQUIRED_FORBIDDEN_RESIDUE_CLASSES = [
  'legacy_local_persistence_surface',
  'legacy_attempt_record_surface',
  'legacy_repo_cadence_owner',
  'legacy_executor_runtime_probe',
  'legacy_compat_alias_surface',
];

const RCA_FORBIDDEN_ACTIVE_RESIDUE = [
  'GatewayActionMap',
  'getCliGatewayActions',
  'callGatewayTool',
  'listGatewayTools',
  'run_managed_deliverable',
  'supervise_managed_run',
  'compatibility_script',
  'compatibilityScript',
];

const META_FORBIDDEN_ACTIVE_RESIDUE = [
  'generic_runtime_owner',
  'generic_registry_owner',
  'app_shell_owner',
  'agent_lab_execution_owner',
  'promotion_gate_owner',
  'target_domain_truth_writer',
];

function buildPhysicalMorphologyChecks(repoDir: string, domainId: string) {
  const policyChecks = physicalMorphologyPolicyChecks(repoDir, domainId);
  const forbiddenTokens = forbiddenPhysicalMorphologyTokens(domainId);
  const forbiddenNameResidue = scanForbiddenNameResidue(repoDir, forbiddenTokens, policyChecks.allowed_residue_prefixes);
  const residueClassification = classifyForbiddenNameResidue(forbiddenNameResidue);
  const blockers = unique([
    ...policyChecks.blockers,
    ...residueClassification.active_forbidden_name_residue
      .map((entry) => `active_forbidden_name_residue:${entry.token}:${entry.path}`),
  ]);
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: policyChecks.status,
    policy_sources: policyChecks.policy_sources,
    required_parity_gates: policyChecks.required_parity_gates,
    allowed_tombstone_provenance_locations: policyChecks.allowed_residue_prefixes,
    residue_classification_summary: residueClassification.summary,
    active_forbidden_name_residue: residueClassification.active_forbidden_name_residue,
    allowed_name_residue: residueClassification.allowed_name_residue,
    forbidden_name_residue: forbiddenNameResidue,
    blockers,
  };
}

const REQUIRED_WORKSPACE_LIFECYCLE_ROOTS = [
  'agent/',
  'contracts/',
  'runtime/authority_functions/',
  'docs/',
  'src/ or packages/',
];

const REQUIRED_WORKSPACE_LOCATOR_REFS = [
  'workspace_root_ref',
  'runtime_artifact_root_ref',
  'artifact_locator_ref',
  'restore_or_retention_receipt_ref',
];

function buildWorkspaceFileLifecycleChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/workspace_lifecycle_policy.json');
  const policy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const repoSourceBoundaries = isRecord(policy?.repo_source_boundaries)
    ? policy.repo_source_boundaries
    : null;
  const workspaceRoots = isRecord(policy?.workspace_runtime_artifact_roots)
    ? policy.workspace_runtime_artifact_roots
    : null;
  const byproductPolicy = isRecord(policy?.byproduct_policy) ? policy.byproduct_policy : null;
  const lifecycleSplit = isRecord(policy?.lifecycle_authority_split) ? policy.lifecycle_authority_split : null;
  const authority = isRecord(policy?.authority_boundary) ? policy.authority_boundary : {};
  const requiredRoots = stringList(repoSourceBoundaries?.required_roots);
  const requiredLocatorRefs = stringList(workspaceRoots?.required_locator_refs);
  const blockers = [
    policyFile.status === 'resolved' ? null : `workspace_file_lifecycle_policy_${policyFile.status}`,
    policy ? null : 'workspace_file_lifecycle_policy_not_declared',
    optionalString(policy?.surface_kind) === 'opl_domain_workspace_file_lifecycle_policy'
      ? null
      : 'workspace_file_lifecycle_policy_surface_kind_invalid',
    ...REQUIRED_WORKSPACE_LIFECYCLE_ROOTS
      .filter((root) => !requiredRoots.includes(root))
      .map((root) => `workspace_file_lifecycle_required_root_missing:${root}`),
    repoSourceBoundaries?.runtime_artifacts_live_in_source_repo === false
      ? null
      : 'workspace_file_lifecycle_runtime_artifacts_must_not_live_in_source_repo',
    repoSourceBoundaries?.developer_checkout_may_define_app_runtime_without_explicit_override === false
      ? null
      : 'workspace_file_lifecycle_developer_checkout_override_must_be_explicit',
    workspaceRoots?.externalized === true
      ? null
      : 'workspace_file_lifecycle_roots_must_be_externalized',
    optionalString(workspaceRoots?.repo_source_policy) === 'locator_index_schema_receipt_refs_only'
      ? null
      : 'workspace_file_lifecycle_repo_source_policy_must_be_refs_only',
    ...REQUIRED_WORKSPACE_LOCATOR_REFS
      .filter((ref) => !requiredLocatorRefs.includes(ref))
      .map((ref) => `workspace_file_lifecycle_required_locator_ref_missing:${ref}`),
    byproductPolicy?.caches_and_install_artifacts_externalized === true
      ? null
      : 'workspace_file_lifecycle_byproducts_must_be_externalized',
    byproductPolicy?.ignored_only_is_fallback_not_authority === true
      ? null
      : 'workspace_file_lifecycle_ignore_is_not_authority_missing',
    stringList(lifecycleSplit?.opl_owned_primitives).includes('workspace_lifecycle')
      ? null
      : 'workspace_file_lifecycle_opl_workspace_lifecycle_owner_missing',
    stringList(lifecycleSplit?.domain_owned_authority).includes('owner_receipt')
      ? null
      : 'workspace_file_lifecycle_domain_owner_receipt_authority_missing',
    authority.policy_can_claim_domain_ready_or_artifact_authority === false
      ? null
      : 'workspace_file_lifecycle_policy_must_not_claim_domain_ready',
    authority.opl_can_write_domain_truth === false
      ? null
      : 'workspace_file_lifecycle_opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false
      ? null
      : 'workspace_file_lifecycle_opl_can_write_memory_body_must_be_false',
    authority.opl_can_mutate_domain_artifact_body === false
      ? null
      : 'workspace_file_lifecycle_opl_can_mutate_domain_artifact_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false
      ? null
      : 'workspace_file_lifecycle_opl_can_authorize_quality_or_export_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_source: 'contracts/workspace_lifecycle_policy.json',
    repo_source_boundaries: {
      required_roots: requiredRoots,
      runtime_artifacts_live_in_source_repo:
        repoSourceBoundaries?.runtime_artifacts_live_in_source_repo ?? null,
      developer_checkout_may_define_app_runtime_without_explicit_override:
        repoSourceBoundaries?.developer_checkout_may_define_app_runtime_without_explicit_override ?? null,
    },
    workspace_runtime_artifact_roots: {
      externalized: workspaceRoots?.externalized ?? null,
      repo_source_policy: optionalString(workspaceRoots?.repo_source_policy),
      required_locator_refs: requiredLocatorRefs,
    },
    byproduct_policy: {
      caches_and_install_artifacts_externalized:
        byproductPolicy?.caches_and_install_artifacts_externalized ?? null,
      ignored_only_is_fallback_not_authority:
        byproductPolicy?.ignored_only_is_fallback_not_authority ?? null,
    },
    lifecycle_authority_split: {
      opl_owned_primitives: stringList(lifecycleSplit?.opl_owned_primitives),
      domain_owned_authority: stringList(lifecycleSplit?.domain_owned_authority),
    },
    authority_boundary: {
      policy_can_claim_domain_ready_or_artifact_authority:
        authority.policy_can_claim_domain_ready_or_artifact_authority ?? null,
      opl_can_write_domain_truth: authority.opl_can_write_domain_truth ?? null,
      opl_can_write_memory_body: authority.opl_can_write_memory_body ?? null,
      opl_can_mutate_domain_artifact_body: authority.opl_can_mutate_domain_artifact_body ?? null,
      opl_can_authorize_quality_or_export: authority.opl_can_authorize_quality_or_export ?? null,
    },
    blockers,
  };
}

function physicalMorphologyPolicyChecks(repoDir: string, domainId: string) {
  if (domainId.includes('med-autogrant') || domainId === 'mag') {
    return magPhysicalMorphologyPolicyChecks(repoDir);
  }
  if (domainId.includes('redcube') || domainId === 'rca' || domainId === 'redcube_ai') {
    return rcaPhysicalMorphologyPolicyChecks(repoDir);
  }
  if (domainId.includes('opl-meta-agent')) {
    return metaAgentPhysicalMorphologyPolicyChecks(repoDir);
  }
  if (domainId.includes('med-autoscience') || domainId === 'mas') {
    return masPhysicalMorphologyPolicyChecks(repoDir);
  }
  return genericPhysicalMorphologyPolicyChecks(repoDir);
}

function genericPhysicalMorphologyPolicyChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json');
  const privatePolicy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const policy = isRecord(privatePolicy?.physical_source_morphology_policy)
    ? privatePolicy.physical_source_morphology_policy
    : null;
  const requiredSurfaceIds = stringList(policy?.required_surface_ids);
  const classifications = recordList(policy?.surface_classifications);
  const classifiedSurfaceIds = stringList(classifications.map((entry) => entry.surface_id));
  const authority = isRecord(policy?.authority_boundary) ? policy.authority_boundary : {};
  const blockers = [
    policyFile.status === 'resolved' ? null : `generic_private_surface_policy_${policyFile.status}`,
    policy ? null : 'physical_morphology_policy_not_declared',
    requiredSurfaceIds.length > 0 ? null : 'physical_morphology_required_surface_ids_missing',
    classifications.length > 0 ? null : 'physical_morphology_surface_classifications_missing',
    ...requiredSurfaceIds
      .filter((surfaceId) => !classifiedSurfaceIds.includes(surfaceId))
      .map((surfaceId) => `physical_morphology_surface_unclassified:${surfaceId}`),
    authority.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'physical_morphology_domain_can_claim_generic_runtime_owner_must_be_false',
    authority.domain_repo_can_own_generated_surface === false
      ? null
      : 'physical_morphology_domain_repo_can_own_generated_surface_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/private_functional_surface_policy.json#physical_source_morphology_policy'],
    required_parity_gates: [
      'agent_semantic_pack_declared',
      'generated_surfaces_owned_by_opl',
      'minimal_authority_functions_or_refs_only_adapters_only',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'contracts/private_functional_surface_policy.json',
    ],
    blockers,
  };
}

function magPhysicalMorphologyPolicyChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json');
  const policy = isRecord(policyFile.payload) && isRecord(policyFile.payload.physical_source_morphology_policy)
    ? policyFile.payload.physical_source_morphology_policy
    : null;
  const requiredSurfaceIds = stringList(policy?.required_surface_ids);
  const classifications = recordList(policy?.surface_classifications);
  const classifiedSurfaceIds = stringList(classifications.map((entry) => entry.surface_id));
  const forbiddenClasses = stringList(policy?.forbidden_residue_classes);
  const authority = isRecord(policy?.authority_boundary) ? policy.authority_boundary : {};
  const blockers = [
    policyFile.status === 'resolved' ? null : `mag_private_surface_policy_${policyFile.status}`,
    policy ? null : 'mag_physical_source_morphology_policy_missing',
    ...REQUIRED_MAG_PHYSICAL_SURFACES
      .filter((surfaceId) => !requiredSurfaceIds.includes(surfaceId))
      .map((surfaceId) => `mag_physical_surface_missing:${surfaceId}`),
    ...REQUIRED_MAG_PHYSICAL_SURFACES
      .filter((surfaceId) => !classifiedSurfaceIds.includes(surfaceId))
      .map((surfaceId) => `mag_physical_surface_unclassified:${surfaceId}`),
    ...MAG_REQUIRED_FORBIDDEN_RESIDUE_CLASSES
      .filter((token) => !forbiddenClasses.includes(token))
      .map((token) => `mag_forbidden_residue_class_missing:${token}`),
    authority.mag_can_own_generic_runtime === false ? null : 'mag_can_own_generic_runtime_must_be_false',
    authority.mag_can_own_generated_wrapper === false ? null : 'mag_can_own_generated_wrapper_must_be_false',
    authority.mag_can_restore_legacy_compat_alias === false
      ? null
      : 'mag_can_restore_legacy_compat_alias_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/private_functional_surface_policy.json#physical_source_morphology_policy'],
    required_parity_gates: [
      'all_required_mag_surfaces_classified',
      'forbidden_generic_runtime_reflow_false',
      'grant_truth_and_export_verdict_remain_mag_owned',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'contracts/private_functional_surface_policy.json',
      'src/med_autogrant/opl_standard_pack.py',
      'tests/test_opl_standard_pack.py',
    ],
    blockers,
  };
}

function rcaPhysicalMorphologyPolicyChecks(repoDir: string) {
  const policyFile = readJsonFile(repoDir, 'contracts/physical_source_morphology_policy.json');
  const policy = isRecord(policyFile.payload) ? policyFile.payload : null;
  const classifications = recordList(policy?.active_surface_classifications);
  const classifiedSurfaceIds = stringList(classifications.map((entry) => entry.surface_id));
  const ownerFlagViolations = classifications.flatMap((entry) => {
    const flags = isRecord(entry.forbidden_generic_owner_flags) ? entry.forbidden_generic_owner_flags : {};
    return Object.entries(flags)
      .filter(([, value]) => value !== false)
      .map(([flag]) => `rca_forbidden_owner_flag_true:${optionalString(entry.surface_id) ?? 'unknown'}:${flag}`);
  });
  const blockers = [
    policyFile.status === 'resolved' ? null : `rca_physical_source_morphology_policy_${policyFile.status}`,
    optionalString(policy?.canonical_pack_root) === 'agent/' ? null : 'rca_canonical_pack_root_must_be_agent_slash',
    optionalString(policy?.status) === 'active_source_classification_policy_landed'
      ? null
      : 'rca_physical_source_morphology_policy_status_not_landed',
    ...REQUIRED_RCA_PHYSICAL_SURFACES
      .filter((surfaceId) => !classifiedSurfaceIds.includes(surfaceId))
      .map((surfaceId) => `rca_physical_surface_unclassified:${surfaceId}`),
    ...ownerFlagViolations,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/physical_source_morphology_policy.json'],
    required_parity_gates: [
      'mcp_product_entry_session_store_runtime_watch_sidecar_operator_evidence_classified',
      'visual_authority_functions_not_generic_runtime',
      'legacy_managed_runtime_gateway_names_tombstoned',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'contracts/functional_privatization_audit.json',
      'contracts/runtime-program/',
      'packages/redcube-gateway/src/actions/product-sidecar-guarded-actions.ts',
      'tests/',
      'contracts/physical_source_morphology_policy.json',
    ],
    blockers,
  };
}

function metaAgentPhysicalMorphologyPolicyChecks(repoDir: string) {
  const privatePolicyFile = readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json');
  const authorityFile = readJsonFile(repoDir, 'runtime/authority_functions/meta-agent-authority-functions.json');
  const privatePolicy = isRecord(privatePolicyFile.payload) ? privatePolicyFile.payload : null;
  const authority = isRecord(authorityFile.payload) ? authorityFile.payload : null;
  const scriptPolicy = isRecord(authority?.script_morphology_policy)
    ? authority.script_morphology_policy
    : null;
  const allowedClasses = stringList(scriptPolicy?.allowed_classes);
  const forbiddenRoles = stringList(scriptPolicy?.forbidden_roles);
  const classifications = recordList(scriptPolicy?.script_classifications);
  const scripts = gitTrackedOrWalkedFiles(repoDir).filter((file) => (
    file.startsWith('scripts/') && file.endsWith('.mjs')
  ));
  const classifiedScripts = stringList(classifications.map((entry) => entry.script_ref));
  const privateForbiddenRoles = stringList(privatePolicy?.forbidden_script_roles);
  const blockers = [
    privatePolicyFile.status === 'resolved' ? null : `meta_private_surface_policy_${privatePolicyFile.status}`,
    authorityFile.status === 'resolved' ? null : `meta_authority_functions_${authorityFile.status}`,
    scriptPolicy ? null : 'meta_script_morphology_policy_missing',
    ...REQUIRED_META_SCRIPT_CLASSES
      .filter((classId) => !allowedClasses.includes(classId))
      .map((classId) => `meta_allowed_script_class_missing:${classId}`),
    ...REQUIRED_META_FORBIDDEN_SCRIPT_ROLES
      .filter((role) => !forbiddenRoles.includes(role) || !privateForbiddenRoles.includes(role))
      .map((role) => `meta_forbidden_script_role_missing:${role}`),
    ...scripts
      .filter((script) => !classifiedScripts.includes(script))
      .map((script) => `meta_script_unclassified:${script}`),
    ...classifications.flatMap((entry) => (
      stringList(entry.forbidden_roles).map((role) => (
        `meta_script_declares_forbidden_role:${optionalString(entry.script_ref) ?? 'unknown'}:${role}`
      ))
    )),
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: [
      'contracts/private_functional_surface_policy.json#allowed_script_morphology_classes',
      'runtime/authority_functions/meta-agent-authority-functions.json#script_morphology_policy',
    ],
    required_parity_gates: [
      'all_scripts_classified_by_authority_manifest',
      'scripts_only_emit_refs_or_work_orders',
      'target_domain_truth_writer_forbidden',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'contracts/app_workbench_projection.json',
      'contracts/functional_privatization_audit.json',
      'contracts/opl_domain_manifest_registration.json',
      'contracts/private_functional_surface_policy.json',
      'contracts/real_target_agent_scaleout_evidence.json',
      'runtime/authority_functions/meta-agent-authority-functions.json',
      'tests/contracts.test.ts',
      'tests/contracts.test.mjs',
    ],
    blockers,
  };
}

function masPhysicalMorphologyPolicyChecks(repoDir: string) {
  const auditFile = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const audit = isRecord(auditFile.payload) ? auditFile.payload : null;
  const authority = isRecord(audit?.authority_boundary) ? audit.authority_boundary : {};
  const blockers = [
    auditFile.status === 'resolved' ? null : `mas_functional_privatization_audit_${auditFile.status}`,
    authority.domain_can_claim_generic_runtime_owner === false
      ? null
      : 'mas_domain_can_claim_generic_runtime_owner_must_be_false',
    authority.domain_repo_can_own_generated_surface === false
      ? null
      : 'mas_domain_repo_can_own_generated_surface_must_be_false',
    authority.opl_can_write_domain_truth === false ? null : 'mas_opl_can_write_domain_truth_must_be_false',
    authority.opl_can_write_memory_body === false ? null : 'mas_opl_can_write_memory_body_must_be_false',
    authority.opl_can_authorize_quality_or_export === false
      ? null
      : 'mas_opl_can_authorize_quality_or_export_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  return {
    status: blockers.length === 0 ? 'declared' : 'blocked',
    policy_sources: ['contracts/functional_privatization_audit.json#authority_boundary'],
    required_parity_gates: [
      'domain_route_active_api_cutover',
      'old_supervisor_scheduler_names_absent_from_active_source',
      'mas_truth_quality_artifact_authority_remains_domain_owned',
    ],
    allowed_residue_prefixes: [
      ...DEFAULT_ALLOWED_MORPHOLOGY_RESIDUE_PREFIXES,
      'docs/history/',
      'tests/legacy_negative',
    ],
    blockers,
  };
}

function forbiddenPhysicalMorphologyTokens(domainId: string) {
  if (domainId.includes('med-autogrant') || domainId === 'mag') {
    return MAG_FORBIDDEN_ACTIVE_RESIDUE;
  }
  if (domainId.includes('redcube') || domainId === 'rca' || domainId === 'redcube_ai') {
    return RCA_FORBIDDEN_ACTIVE_RESIDUE;
  }
  if (domainId.includes('opl-meta-agent')) {
    return META_FORBIDDEN_ACTIVE_RESIDUE;
  }
  if (domainId.includes('med-autoscience') || domainId === 'mas') {
    return MAS_FORBIDDEN_ACTIVE_RESIDUE;
  }
  return [];
}

function scanForbiddenNameResidue(
  repoDir: string,
  tokens: string[],
  allowedPrefixes: string[],
) {
  if (tokens.length === 0) {
    return [];
  }
  const activeFiles = gitTrackedOrWalkedFiles(repoDir).filter((relativePath) => (
    ACTIVE_MORPHOLOGY_SCAN_ROOTS.some((root) => (
      root.endsWith('/') ? relativePath.startsWith(root) : relativePath === root
    ))
  ));
  return activeFiles.flatMap((relativePath) => {
    const absolutePath = path.join(repoDir, relativePath);
    let content = '';
    try {
      content = fs.readFileSync(absolutePath, 'utf8');
    } catch {
      return [];
    }
    return tokens.flatMap((token) => {
      const tokenPattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(token)}(?![A-Za-z0-9_])`);
      if (!tokenPattern.test(content)) {
        return [];
      }
      return [{
        token,
        path: relativePath,
        allowed: allowedPrefixes.some((prefix) => (
          prefix.endsWith('/') ? relativePath.startsWith(prefix) : relativePath === prefix
        )),
      }];
    });
  });
}

function classifyForbiddenNameResidue(entries: JsonRecord[]) {
  const activeForbiddenNameResidue = entries.filter((entry) => entry.allowed !== true);
  const allowedNameResidue = entries.filter((entry) => entry.allowed === true).map((entry) => ({
    ...entry,
    allowance_classification: allowedResidueClassification(optionalString(entry.path)),
  }));
  const allowedByClassification = countBy(allowedNameResidue.map((entry) => (
    optionalString(entry.allowance_classification) ?? 'allowed_other'
  )));
  return {
    summary: {
      status: activeForbiddenNameResidue.length === 0
        ? 'no_active_forbidden_name_residue'
        : 'active_forbidden_name_residue_present',
      total_match_count: entries.length,
      active_forbidden_name_residue_count: activeForbiddenNameResidue.length,
      allowed_name_residue_count: allowedNameResidue.length,
      allowed_name_residue_by_classification: allowedByClassification,
      allowed_name_residue_note: 'Allowed entries are policy, contract, test, history, tombstone, or provenance guard references and do not make the physical morphology gate fail.',
      legacy_field_note: 'forbidden_name_residue keeps the raw compatible scan; use active_forbidden_name_residue_count for blocker count.',
    },
    active_forbidden_name_residue: activeForbiddenNameResidue,
    allowed_name_residue: allowedNameResidue,
  };
}

function allowedResidueClassification(relativePath: string | null) {
  if (!relativePath) {
    return 'allowed_other';
  }
  if (relativePath.startsWith('docs/history/') || relativePath.startsWith('docs/references/') || relativePath.startsWith('docs/specs/')) {
    return 'history_tombstone_or_provenance';
  }
  if (relativePath.startsWith('tests/')) {
    return 'contract_or_legacy_guard_test';
  }
  if (relativePath.startsWith('contracts/')) {
    return 'machine_contract_policy_or_projection';
  }
  if (relativePath.startsWith('runtime/authority_functions/')) {
    return 'authority_function_policy_manifest';
  }
  return 'allowed_other';
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRepoConformance(input: RepoInput) {
  const repoDir = path.resolve(input.repo_dir);
  const domainId = readDomainId(repoDir, input.requested_agent_id);
  const scaffoldValidation = validateStandardDomainAgentScaffold({ repoDir }).standard_domain_agent_scaffold_validation;
  const packCompilerChecks = buildPackCompilerChecks(repoDir);
  const generatedSurfaceHandoffChecks = buildGeneratedSurfaceHandoffChecks(repoDir);
  const privateSurfaceChecks = buildPrivateSurfaceChecks(repoDir);
  const generatedInterfaceChecks = buildGeneratedInterfaceCheck(repoDir);
  const platformSurfaceOwnershipChecks = buildAgentPlatformSurfaceOwnershipForRepo(repoDir, input.requested_agent_id);
  const physicalMorphologyChecks = buildPhysicalMorphologyChecks(repoDir, domainId);
  const workspaceFileLifecycleChecks = buildWorkspaceFileLifecycleChecks(repoDir);
  const evidenceTailClassification = buildEvidenceTailClassification(repoDir, domainId, generatedInterfaceChecks);
  const blockers = unique([
    ...scaffoldValidation.blockers,
    ...packCompilerChecks.blockers,
    ...generatedSurfaceHandoffChecks.blockers,
    ...privateSurfaceChecks.blockers,
    ...generatedInterfaceChecks.blockers,
    ...platformSurfaceOwnershipChecks.blockers,
    ...physicalMorphologyChecks.blockers,
    ...workspaceFileLifecycleChecks.blockers,
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
    generated_interface_checks: generatedInterfaceChecks,
    platform_surface_ownership_checks: platformSurfaceOwnershipChecks,
    physical_morphology_checks: physicalMorphologyChecks,
    workspace_file_lifecycle_checks: workspaceFileLifecycleChecks,
    evidence_tail_classification: evidenceTailClassification,
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
  return {
    version: 'g2',
    standard_domain_agent_conformance: {
      surface_kind: 'opl_standard_domain_agent_conformance_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'passed' : 'blocked',
      summary: {
        total_repo_count: reports.length,
        passed_count: passedCount,
        blocked_count: blockedCount,
        structural_conformance_status: blockedCount === 0 ? 'passed' : 'blocked',
        production_evidence_tail_count: productionEvidenceTailCount,
        production_evidence_tail_policy: 'reported_separately_not_a_structural_pass_condition',
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
