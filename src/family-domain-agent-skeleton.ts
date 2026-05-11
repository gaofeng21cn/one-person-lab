import { GatewayContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import type { GatewayContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeDomainSelection(value: string) {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-autogrant': 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
  };
  return aliases[key] ?? key;
}

export function normalizeStandardDomainAgentSkeleton(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const surfaceKind = optionalString(value.surface_kind);
  if (surfaceKind !== 'standard_domain_agent_skeleton') {
    throw new Error('standard_domain_agent_skeleton.surface_kind must be standard_domain_agent_skeleton.');
  }
  const repoSourceBoundary = isRecord(value.repo_source_boundary) ? value.repo_source_boundary : {};
  const artifactBoundary = isRecord(value.artifact_boundary) ? value.artifact_boundary : {};
  return {
    surface_kind: 'standard_domain_agent_skeleton',
    version: optionalString(value.version) ?? 'standard-domain-agent-skeleton.v1',
    agent_id: optionalString(value.agent_id),
    repo_source_boundary: {
      required_dirs: readStringList(repoSourceBoundary.required_dirs),
      optional_dirs: readStringList(repoSourceBoundary.optional_dirs),
      forbidden_dirs: readStringList(repoSourceBoundary.forbidden_dirs),
    },
    contracts: {
      descriptor_refs: readStringList((isRecord(value.contracts) ? value.contracts : {}).descriptor_refs),
      sidecar_refs: readStringList((isRecord(value.contracts) ? value.contracts : {}).sidecar_refs),
      quality_gate_refs: readStringList((isRecord(value.contracts) ? value.contracts : {}).quality_gate_refs),
    },
    artifact_boundary: {
      repo_contains_real_artifacts: artifactBoundary.repo_contains_real_artifacts === true,
      artifact_roots_are_locators: artifactBoundary.artifact_roots_are_locators !== false,
      workspace_artifact_locator_refs: readStringList(artifactBoundary.workspace_artifact_locator_refs),
      runtime_artifact_locator_refs: readStringList(artifactBoundary.runtime_artifact_locator_refs),
    },
    authority_boundary: isRecord(value.authority_boundary)
      ? value.authority_boundary
      : {
          opl: 'framework_transport_and_projection_only',
          domain: 'truth_quality_artifact_owner',
        },
  };
}

export function buildStandardDomainAgentSkeletonInspection(entry: DomainManifestCatalogEntry) {
  let skeleton = null;
  const issues: string[] = [];
  try {
    skeleton = normalizeStandardDomainAgentSkeleton(entry.manifest?.standard_domain_agent_skeleton ?? null);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'invalid_standard_domain_agent_skeleton');
  }
  const repoSourceDirs = skeleton?.repo_source_boundary.required_dirs ?? [];
  if (!skeleton) {
    issues.push('manifest_missing_standard_domain_agent_skeleton');
  }
  for (const dir of REQUIRED_REPO_SOURCE_DIRS) {
    if (!repoSourceDirs.includes(dir)) {
      issues.push(`missing_repo_source_dir:${dir}`);
    }
  }
  if (repoSourceDirs.includes('artifacts') || skeleton?.repo_source_boundary.forbidden_dirs.includes('artifacts') === false) {
    issues.push('repo_source_skeleton_must_not_include_real_artifacts_dir');
  }
  if (skeleton?.artifact_boundary.repo_contains_real_artifacts) {
    issues.push('domain_repo_must_not_contain_real_artifacts');
  }
  if (skeleton && !skeleton.artifact_boundary.artifact_roots_are_locators) {
    issues.push('artifact_roots_must_be_locators');
  }

  const manifestBlocked = entry.status !== 'resolved';
  const skeletonStatus =
    manifestBlocked
      ? 'blocked'
      : issues.length === 0
        ? 'aligned'
        : skeleton
          ? 'drift_detected'
          : 'missing';

  return {
    project_id: entry.project_id,
    project: entry.project,
    target_domain_id: entry.manifest?.target_domain_id ?? null,
    manifest_status: entry.status,
    skeleton_status: skeletonStatus,
    agent_id:
      skeleton?.agent_id
      ?? entry.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id
      ?? null,
    required_repo_source_dirs: [...REQUIRED_REPO_SOURCE_DIRS],
    declared_repo_source_dirs: repoSourceDirs,
    missing_repo_source_dirs: REQUIRED_REPO_SOURCE_DIRS.filter((dir) => !repoSourceDirs.includes(dir)),
    artifact_boundary: skeleton?.artifact_boundary ?? null,
    contract_refs: skeleton?.contracts ?? null,
    issues,
    authority_boundary: skeleton?.authority_boundary ?? {
      opl: 'skeleton_discovery_only',
      domain: 'truth_quality_artifact_owner',
    },
  };
}

function findAgentEntry(contracts: GatewayContracts, domain: string) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const normalized = normalizeDomainSelection(domain);
  const entry = catalog.projects.find((candidate) =>
    candidate.project_id === normalized
    || candidate.project === normalized
    || candidate.manifest?.target_domain_id === normalized
    || candidate.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === normalized
  );
  if (!entry) {
    throw new GatewayContractError('cli_usage_error', `Unknown family domain agent: ${domain}.`, {
      domain,
      allowed_domains: catalog.projects.map((project) => project.project_id),
    });
  }
  return entry;
}

function parseInspectArgs(args: string[]) {
  let domain = '';
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    const value = args[index + 1];
    if (token === '--domain' && value) {
      domain = value;
      index += 1;
    } else {
      throw new GatewayContractError('cli_usage_error', `Unknown agents inspect option: ${token}.`, {
        usage: 'opl agents inspect --domain <domain>',
      });
    }
  }
  if (!domain) {
    throw new GatewayContractError('cli_usage_error', 'agents inspect requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain };
}

export function buildFamilyAgentsList(contracts: GatewayContracts) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const agents = catalog.projects.map(buildStandardDomainAgentSkeletonInspection);
  return {
    version: 'g2',
    family_agents: {
      surface_kind: 'opl_standard_domain_agent_skeleton_index',
      summary: {
        total_projects_count: agents.length,
        aligned_count: agents.filter((agent) => agent.skeleton_status === 'aligned').length,
        missing_count: agents.filter((agent) => agent.skeleton_status === 'missing').length,
        drift_detected_count: agents.filter((agent) => agent.skeleton_status === 'drift_detected').length,
        blocked_count: agents.filter((agent) => agent.skeleton_status === 'blocked').length,
      },
      agents,
    },
  };
}

export function buildFamilyAgentInspect(contracts: GatewayContracts, args: string[]) {
  const { domain } = parseInspectArgs(args);
  const entry = findAgentEntry(contracts, domain);
  return {
    version: 'g2',
    family_agent: {
      surface_kind: 'opl_standard_domain_agent_skeleton_inspection',
      ...buildStandardDomainAgentSkeletonInspection(entry),
    },
  };
}
