import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from './contracts.ts';

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
          usage: `${commandName} [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]`,
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
    throw new FrameworkContractError('cli_usage_error', `Unknown platform surface option: ${token}.`, {
      usage: `${commandName} [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]`,
    });
  }

  const selected = repos.length > 0 ? repos : defaultFamilyRepoInputs();
  if (selected.length === 0) {
    throw new FrameworkContractError('cli_usage_error', `${commandName} could not discover family agent repos.`, {
      usage: `${commandName} [--repo-dir <path> ...] [--agent <id>=<path> ...] [--family-defaults]`,
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
  const contractRefs = surfaceTextFromContracts(repoDir)
    .filter((entry) => normalizedAliases.some((alias) => entry.text.toLowerCase().includes(alias)))
    .map((entry) => `${entry.source_path}${entry.json_path === '$' ? '' : `#${entry.json_path}`}`);
  const filenameRefs = activeProgramFiles(repoDir)
    .filter((relativePath) => normalizedAliases.some((alias) => (
      relativePath.toLowerCase().includes(alias.replace(/_/g, '-'))
      || relativePath.toLowerCase().includes(alias)
    )))
    .slice(0, 12);
  return unique([...contractRefs, ...filenameRefs]).slice(0, 20);
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
