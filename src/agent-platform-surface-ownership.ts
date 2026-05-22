import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildGeneratedAgentInterfaces } from './domain-pack-compiler.ts';
import { FrameworkContractError } from './contracts.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

interface RepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPL_REPO_ROOT = path.resolve(SOURCE_DIR, '..');

const DEFAULT_FAMILY_REPOS = [
  { requested_agent_id: 'mas', directory: 'med-autoscience' },
  { requested_agent_id: 'mag', directory: 'med-autogrant' },
  { requested_agent_id: 'rca', directory: 'redcube-ai' },
  { requested_agent_id: 'opl-meta-agent', directory: 'opl-meta-agent' },
] as const;

const OPL_OWNED_GENERIC_SUBDOMAINS = [
  {
    subdomain_id: 'generated_cli_mcp_skill_product_shell',
    opl_primitive: 'opl_generated_interface_bundle',
    surface_aliases: ['cli', 'mcp', 'skill', 'product_entry', 'product_entry_manifest'],
    domain_allowed_role: 'domain_handler_target_or_refs_only_adapter',
  },
  {
    subdomain_id: 'generated_sidecar_dispatch_shell',
    opl_primitive: 'opl_generated_sidecar_descriptor',
    surface_aliases: ['sidecar', 'sidecar_export_dispatch', 'typed_queue_dispatch'],
    domain_allowed_role: 'domain_handler_target_or_refs_only_adapter',
  },
  {
    subdomain_id: 'generated_action_metadata_command_registration_shell',
    opl_primitive: 'opl_generated_action_metadata_registry',
    surface_aliases: [
      'action_catalog',
      'action_metadata',
      'domain_action_metadata',
      'guarded_action',
      'guarded_actions',
      'guarded_action_catalog',
      'command_registration',
      'mcp_action_scaffold',
    ],
    domain_allowed_role: 'domain_action_ids_handler_refs_or_refs_only_metadata_source',
  },
  {
    subdomain_id: 'status_read_model_and_workbench_shell',
    opl_primitive: 'opl_generated_status_and_hosted_workbench_projection',
    surface_aliases: ['status', 'status_read_model', 'workbench', 'workbench_drilldown', 'portal', 'cockpit'],
    domain_allowed_role: 'refs_only_projection_adapter',
  },
  {
    subdomain_id: 'workspace_source_artifact_memory_locator',
    opl_primitive: 'opl_generic_substrate_projection',
    surface_aliases: ['workspace', 'source', 'artifact', 'memory', 'locator', 'lifecycle'],
    domain_allowed_role: 'opaque_ref_provider',
  },
  {
    subdomain_id: 'stage_attempt_queue_retry_dead_letter',
    opl_primitive: 'opl_provider_backed_family_runtime',
    surface_aliases: ['runtime', 'queue', 'attempt', 'attempt_ledger', 'retry', 'dead_letter', 'scheduler', 'watch'],
    domain_allowed_role: 'domain_authority_receipt_or_typed_blocker_target',
  },
  {
    subdomain_id: 'generic_transition_runner',
    opl_primitive: 'family_transition_runner',
    surface_aliases: ['transition', 'state_machine', 'runner', 'harness'],
    domain_allowed_role: 'domain_transition_spec_or_oracle_ref',
  },
] as const;

const RETAINED_DOMAIN_AUTHORITY = [
  'domain_truth',
  'quality_or_export_or_publication_or_visual_verdict',
  'artifact_body_and_mutation_authority',
  'source_readiness_verdict',
  'memory_body_accept_reject',
  'owner_receipt_signing',
  'typed_blocker_materialization',
  'domain_specific_policy_rubric_or_quality_gate',
] as const;

const DEFAULT_CALLER_TARGET_KINDS = [
  'opl_generated_surface',
  'opl_hosted_surface',
  'domain_handler_target',
  'refs_only_domain_adapter_target',
] as const;

const DEFAULT_CALLER_CANONICAL_TARGET_IDS: Record<string, string[]> = {
  product_entry: ['product_entry', 'product_entry_manifest'],
  product_status: ['product_status', 'status_read_model'],
  product_session: ['product_session', 'product_entry_manifest', 'status_read_model'],
  sidecar: ['sidecar', 'sidecar_export_dispatch'],
  workbench: ['workbench', 'workbench_drilldown'],
};

const DELETION_EVIDENCE_REQUIREMENTS = [
  'replacement_parity',
  'active_caller_cutover',
  'domain_owner_receipt_or_typed_blocker',
  'no_forbidden_write_proof',
  'tombstone_or_provenance_ref',
] as const;

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
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function readRefsFromFields(source: JsonRecord | null | undefined, fields: string[]) {
  if (!isRecord(source)) {
    return [];
  }
  return unique(fields.flatMap((field) => {
    const value = source[field];
    if (Array.isArray(value)) {
      return stringList(value);
    }
    const single = optionalString(value);
    return single ? [single] : [];
  }));
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

function normalizeDomainSelection(value: string) {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mas: 'med-autoscience',
    medautoscience: 'med-autoscience',
    'med-autoscience': 'med-autoscience',
    mag: 'med-autogrant',
    medautogrant: 'med-autogrant',
    'med-autogrant': 'med-autogrant',
    rca: 'redcube-ai',
    redcube: 'redcube-ai',
    'redcube-ai': 'redcube-ai',
    redcube_ai: 'redcube-ai',
    'opl-meta-agent': 'opl-meta-agent',
  };
  return aliases[key] ?? key;
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

function parseRepoArgs(args: string[], commandName: string): RepoInput[] {
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

  const selected = repos.length > 0 ? repos : defaultFamilyRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', `${commandName} could not discover family agent repos.`, {
      usage,
      default_repo_directories: DEFAULT_FAMILY_REPOS.map((repo) => repo.directory),
      env_override: 'OPL_FAMILY_WORKSPACE_ROOT',
    });
  }
  return selected.map((repo) => ({
    requested_agent_id: repo.requested_agent_id,
    repo_dir: path.resolve(repo.repo_dir),
  }));
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

function codeFile(pathname: string) {
  return /\.(py|ts|tsx|js|mjs|cjs|json)$/i.test(pathname)
    || pathname === 'Makefile'
    || pathname === 'package.json'
    || pathname === 'pyproject.toml';
}

function activeProgramFiles(repoDir: string) {
  return gitTrackedOrWalkedFiles(repoDir).filter((relativePath) => (
    codeFile(relativePath)
    && !relativePath.startsWith('docs/')
    && !relativePath.startsWith('tests/fixtures/')
    && !relativePath.startsWith('node_modules/')
    && !relativePath.startsWith('dist/')
  ));
}

function searchableRecords(value: unknown, currentPath = '$'): Array<{ path: string; text: string }> {
  if (typeof value === 'string') {
    return [{ path: currentPath, text: value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => searchableRecords(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => (
    searchableRecords(fieldValue, `${currentPath}.${field}`)
  ));
}

function scalarRecords(value: unknown, currentPath = '$'): Array<{ path: string; value: unknown }> {
  if (
    typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
    || value === null
  ) {
    return [{ path: currentPath, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => scalarRecords(entry, `${currentPath}[${index}]`));
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([field, fieldValue]) => (
    scalarRecords(fieldValue, `${currentPath}.${field}`)
  ));
}

function surfaceTextFromContracts(repoDir: string) {
  const paths = [
    'contracts/functional_privatization_audit.json',
    'contracts/generated_surface_handoff.json',
    'contracts/private_functional_surface_policy.json',
    'contracts/physical_source_morphology_policy.json',
    'contracts/workspace_lifecycle_policy.json',
  ];
  return paths.flatMap((relativePath) => {
    const file = readJsonFile(repoDir, relativePath);
    return searchableRecords(file.payload).map((entry) => ({
      source_path: relativePath,
      json_path: entry.path,
      text: entry.text,
    }));
  });
}

function sourceRefsForSubdomain(repoDir: string, aliases: readonly string[]) {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  const filenameRefs = activeProgramFiles(repoDir)
    .filter((relativePath) => normalizedAliases.some((alias) => (
      relativePath.toLowerCase().includes(alias.replace(/_/g, '-'))
      || relativePath.toLowerCase().includes(alias)
    )))
    .slice(0, 12);
  const contractRefs = surfaceTextFromContracts(repoDir)
    .filter((entry) => normalizedAliases.some((alias) => entry.text.toLowerCase().includes(alias)))
    .map((entry) => `${entry.source_path}${entry.json_path === '$' ? '' : `#${entry.json_path}`}`);
  return unique([...filenameRefs, ...contractRefs]).slice(0, 20);
}

function explicitForbiddenOwnerClaims(repoDir: string) {
  const files = [
    readJsonFile(repoDir, 'contracts/functional_privatization_audit.json'),
    readJsonFile(repoDir, 'contracts/private_functional_surface_policy.json'),
    readJsonFile(repoDir, 'contracts/physical_source_morphology_policy.json'),
  ];
  return files.flatMap((file) => {
    const values = scalarRecords(file.payload);
    return values.flatMap((entry) => {
      const field = entry.path.toLowerCase();
      const text = String(entry.value).toLowerCase();
      const fieldClaimsGeneric =
        field.includes('domain_can_claim_generic_runtime_owner')
        || field.includes('domain_repo_can_own_generated_surface')
        || field.includes('can_own_generic_runtime')
        || field.includes('can_own_generated_wrapper')
        || field.includes('generated_surface_owner_in_domain_repo')
        || field.includes('generic_runtime_owner');
      const textClaimsGeneric = [
        'generic_runtime_owner:true',
        'generated_surface_owner_in_domain_repo:true',
        'domain repo owns generated wrapper',
        'domain_repo_can_own_generated_surface:true',
        'can own generic runtime:true',
      ].some((token) => text.includes(token));
      if (!fieldClaimsGeneric && !textClaimsGeneric) {
        return [];
      }
      if (entry.value === false || entry.value === 0 || entry.value === null) {
        return [];
      }
      const rawValue = String(entry.value).trim();
      if (!rawValue || rawValue === 'false' || rawValue === '0') {
        return [];
      }
      return [{
        source_path: file.path,
        json_path: entry.path,
        value: rawValue,
      }];
    });
  });
}

function readDeclaredAuthorityBoundary(repoDir: string) {
  const audit = readJsonFile(repoDir, 'contracts/functional_privatization_audit.json');
  const auditAuthority = isRecord(audit.payload) && isRecord(audit.payload.authority_boundary)
    ? audit.payload.authority_boundary
    : {};
  const workspacePolicy = readJsonFile(repoDir, 'contracts/workspace_lifecycle_policy.json');
  const workspaceAuthority = isRecord(workspacePolicy.payload) && isRecord(workspacePolicy.payload.authority_boundary)
    ? workspacePolicy.payload.authority_boundary
    : {};
  return {
    domain_can_claim_generic_runtime_owner:
      auditAuthority.domain_can_claim_generic_runtime_owner ?? null,
    domain_repo_can_own_generated_surface:
      auditAuthority.domain_repo_can_own_generated_surface ?? null,
    opl_can_write_domain_truth:
      auditAuthority.opl_can_write_domain_truth ?? workspaceAuthority.opl_can_write_domain_truth ?? null,
    opl_can_write_memory_body:
      auditAuthority.opl_can_write_memory_body ?? workspaceAuthority.opl_can_write_memory_body ?? null,
    opl_can_authorize_quality_or_export:
      auditAuthority.opl_can_authorize_quality_or_export ?? workspaceAuthority.opl_can_authorize_quality_or_export ?? null,
    opl_can_mutate_domain_artifact_body:
      workspaceAuthority.opl_can_mutate_domain_artifact_body ?? null,
  };
}

export function buildAgentPlatformSurfaceOwnershipForRepo(repoDir: string, requestedAgentId?: string | null) {
  const resolvedRepoDir = path.resolve(repoDir);
  const domainId = normalizeDomainSelection(readDomainId(resolvedRepoDir, requestedAgentId ?? null));
  const explicitClaims = explicitForbiddenOwnerClaims(resolvedRepoDir);
  const genericSubdomains = OPL_OWNED_GENERIC_SUBDOMAINS.map((subdomain) => {
    const sourceRefs = sourceRefsForSubdomain(resolvedRepoDir, subdomain.surface_aliases);
    return {
      subdomain_id: subdomain.subdomain_id,
      owner: 'one-person-lab',
      opl_primitive: subdomain.opl_primitive,
      domain_allowed_role: subdomain.domain_allowed_role,
      status: sourceRefs.length > 0 ? 'declared_or_observed' : 'available_without_repo_local_declaration',
      observed_source_refs: sourceRefs,
    };
  });
  const blockers = explicitClaims.map((claim) => (
    `domain_declares_generic_platform_owner:${claim.source_path}:${claim.json_path}`
  ));
  return {
    surface_kind: 'opl_agent_platform_surface_ownership_projection',
    version: 'v1',
    owner: 'one-person-lab',
    repo_dir: resolvedRepoDir,
    domain_id: domainId,
    status: blockers.length === 0 ? 'passed' : 'blocked',
    generic_subdomain_count: genericSubdomains.length,
    generic_subdomains: genericSubdomains,
    explicit_forbidden_owner_claims: explicitClaims,
    blockers,
    retained_domain_authority: RETAINED_DOMAIN_AUTHORITY,
    migration_gate: {
      replacement_parity_required: true,
      active_caller_cutover_required: true,
      domain_owner_receipt_or_typed_blocker_required: true,
      no_forbidden_write_proof_required: true,
      descriptor_ready_is_not_production_ready: true,
    },
    declared_authority_boundary: readDeclaredAuthorityBoundary(resolvedRepoDir),
    authority_boundary: {
      opl_owns_generic_platform_surfaces: true,
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_authorize_quality_or_export: false,
      opl_can_mutate_domain_artifacts: false,
      domain_repos_keep_truth_verdict_artifact_memory_and_receipt_authority: true,
      report_can_claim_domain_ready: false,
      report_can_claim_production_ready: false,
    },
  };
}

function generatedInterfaceBundleForRepo(repoDir: string) {
  const result = buildGeneratedAgentInterfaces({} as FrameworkContracts, ['--repo-dir', repoDir]);
  return result.generated_agent_interfaces as JsonRecord;
}

function defaultCallerSurfaceGates(bundle: JsonRecord) {
  const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : {};
  const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : {};
  const targetBySurface = new Map(
    recordList(targetProof.surface_targets).map((target) => [
      optionalString(target.surface_id) ?? '',
      target,
    ]),
  );
  return recordList(wrapperBundle.descriptor_scope).map((scope) => {
    const surfaceId = optionalString(scope.surface_id) ?? 'unknown_surface';
    const canonicalTargetIds = DEFAULT_CALLER_CANONICAL_TARGET_IDS[surfaceId] ?? [surfaceId];
    const target = canonicalTargetIds
      .map((targetId) => targetBySurface.get(targetId))
      .find((candidate) => isRecord(candidate));
    const activeCallerProofStatus =
      optionalString(scope.active_caller_proof_status)
      ?? optionalString(target?.proof_status);
    const activeCallerTargetKind =
      optionalString(scope.active_caller_target_kind)
      ?? optionalString(target?.target_kind);
    const activeCallerModuleId =
      optionalString(scope.active_caller_module_id)
      ?? optionalString(target?.active_caller_module_id);
    const blockers = stringList(scope.blockers);
    const descriptorStatus = optionalString(scope.descriptor_status);
    const ready = optionalString(scope.status) === 'ready'
      && blockers.length === 0
      && Boolean(activeCallerProofStatus)
      && !activeCallerProofStatus?.startsWith('blocked')
      && Boolean(activeCallerTargetKind)
      && DEFAULT_CALLER_TARGET_KINDS.includes(activeCallerTargetKind as typeof DEFAULT_CALLER_TARGET_KINDS[number]);
    const bridgeExitGate = isRecord(target?.bridge_exit_gate) ? target.bridge_exit_gate : null;
    const observedTombstoneOrProvenanceRefs = unique([
      ...readRefsFromFields(bridgeExitGate, [
        'tombstone_refs',
        'provenance_refs',
        'history_refs',
        'source_refs',
      ]),
      ...stringList(target?.current_surface_refs),
    ]);
    const observedDomainReceiptOrBlockerRefs = readRefsFromFields(bridgeExitGate, [
      'owner_receipt_refs',
      'owner_receipt_ref',
      'domain_owner_receipt_refs',
      'domain_owner_receipt_ref',
      'typed_blocker_refs',
      'typed_blocker_ref',
    ]);
    const observedNoForbiddenWriteRefs = readRefsFromFields(bridgeExitGate, [
      'no_forbidden_write_refs',
      'no_forbidden_write_ref',
      'no_forbidden_write_evidence_refs',
      'no_forbidden_write_evidence_ref',
    ]);
    const deletionEvidenceWorklist = {
      surface_kind: 'opl_default_caller_surface_deletion_evidence_worklist',
      surface_id: surfaceId,
      status: ready ? 'domain_evidence_required' : 'blocked_until_replacement_ready',
      requirement_ids: DELETION_EVIDENCE_REQUIREMENTS,
      replacement_parity: {
        status: ready ? 'observed' : 'blocked',
        source_refs: [
          `generated_wrapper_bundle.descriptor_scope.${surfaceId}`,
          ...canonicalTargetIds.map((targetId) => `active_caller_target_proof.surface_targets.${targetId}`),
        ],
      },
      active_caller_cutover: {
        status: ready ? 'observed' : 'blocked',
        proof_status: activeCallerProofStatus,
        target_kind: activeCallerTargetKind,
        active_caller_module_id: activeCallerModuleId,
      },
      domain_owner_receipt_or_typed_blocker: {
        status: observedDomainReceiptOrBlockerRefs.length > 0 ? 'observed' : 'required_from_domain_owner',
        evidence_refs: observedDomainReceiptOrBlockerRefs,
      },
      no_forbidden_write_proof: {
        status: observedNoForbiddenWriteRefs.length > 0 ? 'observed' : 'required_before_physical_delete',
        evidence_refs: observedNoForbiddenWriteRefs,
      },
      tombstone_or_provenance_ref: {
        status: observedTombstoneOrProvenanceRefs.length > 0 ? 'observed' : 'required_before_physical_delete',
        evidence_refs: observedTombstoneOrProvenanceRefs,
      },
      bridge_exit_gate: bridgeExitGate,
      retention_reason: optionalString(target?.retention_reason),
      cannot_absorb_reason: optionalString(target?.cannot_absorb_reason),
      audit_visibility: optionalString(target?.audit_visibility),
      audit_reason: optionalString(target?.audit_reason),
      semantic_equivalence_status: optionalString(target?.semantic_equivalence_status),
      semantic_equivalence_reason: optionalString(target?.semantic_equivalence_reason),
      physical_delete_authorized: false,
      authority_boundary: {
        worklist_can_write_domain_truth: false,
        worklist_can_sign_domain_owner_receipt: false,
        worklist_can_authorize_quality_or_export: false,
        worklist_can_mutate_domain_artifacts: false,
        worklist_can_authorize_domain_repo_physical_delete: false,
      },
    };
    return {
      surface_id: surfaceId,
      descriptor_kind: optionalString(scope.descriptor_kind),
      owner: 'one-person-lab',
      generated_surface_owner: optionalString(scope.generated_surface_owner) ?? 'one-person-lab',
      status: ready ? 'ready_for_default_caller_cutover' : 'blocked',
      descriptor_status: descriptorStatus,
      active_caller_target_kind: activeCallerTargetKind,
      active_caller_proof_status: activeCallerProofStatus,
      active_caller_module_id: activeCallerModuleId,
      canonical_target_surface_ids: canonicalTargetIds,
      blockers,
      domain_repo_role: optionalString(scope.domain_repo_role),
      domain_repo_can_own_generated_surface: false,
      default_caller_owner: 'one-person-lab',
      deletion_evidence_worklist: deletionEvidenceWorklist,
    };
  });
}

export function buildAgentDefaultCallerReadinessForRepo(repoDir: string, requestedAgentId?: string | null) {
  const resolvedRepoDir = path.resolve(repoDir);
  const domainId = normalizeDomainSelection(readDomainId(resolvedRepoDir, requestedAgentId ?? null));
  const platformSurfaceOwnership = buildAgentPlatformSurfaceOwnershipForRepo(resolvedRepoDir, requestedAgentId);
  try {
    const bundle = generatedInterfaceBundleForRepo(resolvedRepoDir);
    const cutoverProof = isRecord(bundle.active_caller_cutover_proof) ? bundle.active_caller_cutover_proof : {};
    const targetProof = isRecord(bundle.active_caller_target_proof) ? bundle.active_caller_target_proof : {};
    const wrapperBundle = isRecord(bundle.generated_wrapper_bundle) ? bundle.generated_wrapper_bundle : {};
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
      ...surfaceBlockers,
    ].filter((entry): entry is string => Boolean(entry));
    const replacementReady = blockers.length === 0;
    const deletionEvidenceWorklists = surfaceGates.map((gate) => gate.deletion_evidence_worklist);
    const missingDomainEvidenceCount = deletionEvidenceWorklists.filter((worklist) => (
      isRecord(worklist.domain_owner_receipt_or_typed_blocker)
      && optionalString(worklist.domain_owner_receipt_or_typed_blocker.status) !== 'observed'
    )).length;
    const missingNoForbiddenWriteCount = deletionEvidenceWorklists.filter((worklist) => (
      isRecord(worklist.no_forbidden_write_proof)
      && optionalString(worklist.no_forbidden_write_proof.status) !== 'observed'
    )).length;
    const missingTombstoneOrProvenanceCount = deletionEvidenceWorklists.filter((worklist) => (
      isRecord(worklist.tombstone_or_provenance_ref)
      && optionalString(worklist.tombstone_or_provenance_ref.status) !== 'observed'
    )).length;
    return {
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
        deletion_evidence_worklist_count: deletionEvidenceWorklists.length,
        missing_domain_owner_receipt_or_typed_blocker_count: missingDomainEvidenceCount,
        missing_no_forbidden_write_proof_count: missingNoForbiddenWriteCount,
        missing_tombstone_or_provenance_ref_count: missingTombstoneOrProvenanceCount,
      },
      default_caller_owner: 'one-person-lab',
      source_commands: {
        generated_interfaces: `opl agents interfaces --repo-dir ${resolvedRepoDir} --json`,
        platform_surfaces: `opl agents platform-surfaces --repo-dir ${resolvedRepoDir} --json`,
      },
      generated_interface_status: optionalString(bundle.status),
      generated_wrapper_bundle_status: optionalString(wrapperBundle.status),
      active_caller_target_proof_status: optionalString(targetProof.status),
      active_caller_cutover_proof_status: optionalString(cutoverProof.status),
      surface_gates: surfaceGates,
      deletion_evidence_worklists: deletionEvidenceWorklists,
      blockers,
      deletion_gate: {
        replacement_parity: replacementReady ? 'ready' : 'blocked',
        active_caller_cutover: replacementReady ? 'ready' : 'blocked',
        domain_owner_receipt_or_typed_blocker: 'required_from_domain_owner_before_physical_delete',
        no_forbidden_write_proof: 'required_before_physical_delete',
        tombstone_or_provenance_ref: 'required_before_physical_delete',
        physical_delete_authorized: false,
        physical_delete_authority_owner: 'domain_repo_owner_after_receipt_parity',
        evidence_worklist_count: deletionEvidenceWorklists.length,
        missing_domain_owner_receipt_or_typed_blocker_count: missingDomainEvidenceCount,
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
      deletion_gate: {
        replacement_parity: 'blocked',
        active_caller_cutover: 'blocked',
        domain_owner_receipt_or_typed_blocker: 'required_from_domain_owner_before_physical_delete',
        no_forbidden_write_proof: 'required_before_physical_delete',
        tombstone_or_provenance_ref: 'required_before_physical_delete',
        physical_delete_authorized: false,
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

export function buildAgentDefaultCallerReadinessReport(args: string[]) {
  const repos = parseRepoArgs(args, 'opl agents default-callers');
  const reports = repos.map((repo) => (
    buildAgentDefaultCallerReadinessForRepo(repo.repo_dir, repo.requested_agent_id)
  ));
  const blockedCount = reports.filter((report) => report.status === 'blocked').length;
  return {
    version: 'g1',
    agent_default_caller_readiness: {
      surface_kind: 'opl_agent_generated_default_caller_readiness_report',
      owner: 'one-person-lab',
      status: blockedCount === 0 ? 'ready_domain_evidence_required' : 'blocked',
      summary: {
        total_repo_count: reports.length,
        ready_domain_evidence_required_count: reports.length - blockedCount,
        blocked_count: blockedCount,
        generated_default_caller_surface_count: reports.reduce(
          (total, report) => total + Number(report.summary.generated_default_caller_surface_count || 0),
          0,
        ),
        blocked_surface_count: reports.reduce(
          (total, report) => total + Number(report.summary.blocked_surface_count || 0),
          0,
        ),
        deletion_evidence_worklist_count: reports.reduce(
          (total, report) => total + Number(report.summary.deletion_evidence_worklist_count || 0),
          0,
        ),
        missing_domain_owner_receipt_or_typed_blocker_count: reports.reduce(
          (total, report) => (
            total + Number(report.summary.missing_domain_owner_receipt_or_typed_blocker_count || 0)
          ),
          0,
        ),
        missing_no_forbidden_write_proof_count: reports.reduce(
          (total, report) => total + Number(report.summary.missing_no_forbidden_write_proof_count || 0),
          0,
        ),
        missing_tombstone_or_provenance_ref_count: reports.reduce(
          (total, report) => total + Number(report.summary.missing_tombstone_or_provenance_ref_count || 0),
          0,
        ),
      },
      migration_gate_policy: {
        opl_generated_default_caller_readiness_is_structural_replacement_evidence: true,
        domain_owner_receipt_or_typed_blocker_still_required: true,
        no_forbidden_write_proof_still_required: true,
        physical_delete_authorized_by_this_report: false,
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
