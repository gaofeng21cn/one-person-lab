import { FrameworkContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry } from './domain-manifest/types.ts';
import type { FrameworkContracts } from './types.ts';

type JsonRecord = Record<string, unknown>;

const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;
const ACCEPTED_SKELETON_SURFACE_KINDS = new Set([
  'standard_domain_agent_skeleton',
  'standard_domain_agent_skeleton_mapping',
  'mas_opl_domain_agent_skeleton_mapping',
  'domain_agent_skeleton_adapter',
]);

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

function truthyFalse(value: unknown) {
  return value === false;
}

function readRepoSourceDirs(boundary: JsonRecord, skeleton: JsonRecord) {
  const requiredDirs = readStringList(boundary.required_dirs);
  if (requiredDirs.length > 0) {
    return requiredDirs;
  }

  const magStyleDirs = REQUIRED_REPO_SOURCE_DIRS.filter((dir) => isRecord(boundary[dir]));
  if (magStyleDirs.length > 0) {
    return magStyleDirs;
  }

  const allowedRoots = readStringList(boundary.allowed_roots);
  if (allowedRoots.length > 0) {
    return allowedRoots;
  }

  if (Array.isArray(boundary.allowed_roots)) {
    return boundary.allowed_roots
      .map((root) => isRecord(root) ? optionalString(root.boundary_id) : optionalString(root))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (isRecord(skeleton.skeleton)) {
    const dirs = new Set<string>();
    for (const key of Object.keys(skeleton.skeleton)) {
      const [dir] = key.split('/');
      if (dir === 'agent') {
        dirs.add(dir);
      } else if (key.startsWith('contracts/')) {
        dirs.add('contracts');
        if (key.startsWith('contracts/runtime/')) {
          dirs.add('runtime');
        }
      } else if (key.startsWith('runtime/')) {
        dirs.add('runtime');
      }
    }
    if (dirs.size > 0) {
      dirs.add('docs');
      return REQUIRED_REPO_SOURCE_DIRS.filter((dir) => dirs.has(dir));
    }
  }

  return [];
}

function normalizeContractRefs(value: JsonRecord) {
  const contracts = isRecord(value.contracts) ? value.contracts : {};
  const runtimeDeclarations = isRecord(value.runtime_declarations)
    ? value.runtime_declarations
    : isRecord(value.runtime_declaration)
      ? value.runtime_declaration
      : {};
  return {
    descriptor_refs: [
      ...readStringList(contracts.descriptor_refs),
      ...readStringList(value.source_refs).map((ref) => ref),
      ...readStringList(value.artifact_locator_ref),
      ...readStringList(value.controlled_stage_attempt_ref),
    ],
    sidecar_refs: [
      ...readStringList(contracts.sidecar_refs),
      ...readStringList(runtimeDeclarations.sidecar_ref),
      ...readStringList(runtimeDeclarations.sidecar_adapter_ref),
    ],
    quality_gate_refs: readStringList(contracts.quality_gate_refs),
  };
}

function inferArtifactBoundary(value: JsonRecord, artifactBoundary: JsonRecord, repoSourceBoundary: JsonRecord) {
  const artifactLocator = isRecord(value.artifact_locator_contract)
    ? value.artifact_locator_contract
    : isRecord(value.workspace_runtime_artifact_root_locator)
      ? value.workspace_runtime_artifact_root_locator
      : {};
  const locatorRepoBoundary = isRecord(artifactLocator.repo_source_boundary)
    ? artifactLocator.repo_source_boundary
    : {};
  const artifactRootsAreLocators =
    artifactBoundary.artifact_roots_are_locators !== false
    && optionalString(artifactLocator.locator_model) !== 'repo_artifact_blobs'
    && artifactLocator.repo_tracks_real_artifacts !== true;
  const hasLocatorSurface =
    isRecord(value.artifact_locator_contract)
    || isRecord(value.workspace_runtime_artifact_root_locator)
    || readStringList(value.artifact_locator_ref).length > 0
    || readStringList(value.workspace_artifact_locator_ref).length > 0
    || readStringList(value.workspace_runtime_artifact_root_locator_ref).length > 0
    || readStringList(artifactBoundary.workspace_artifact_locator_refs).length > 0
    || readStringList(artifactBoundary.runtime_artifact_locator_refs).length > 0;
  const repoContainsRealArtifacts =
    artifactBoundary.repo_contains_real_artifacts === true
    || value.repo_tracks_real_workspace_artifacts === true
    || repoSourceBoundary.repo_tracks_runtime_artifact_blobs === true
    || repoSourceBoundary.repo_tracks_receipt_instances === true
    || artifactLocator.repo_tracks_artifact_blobs === true
    || artifactLocator.repo_tracks_real_artifacts === true
    || locatorRepoBoundary.repo_tracks_visual_or_export_artifact_blobs === true;

  return {
    repo_contains_real_artifacts: repoContainsRealArtifacts,
    artifact_roots_are_locators: artifactRootsAreLocators,
    workspace_artifact_locator_refs: [
      ...readStringList(artifactBoundary.workspace_artifact_locator_refs),
      ...readStringList(value.artifact_locator_ref),
      ...readStringList(value.workspace_artifact_locator_ref),
      ...readStringList(value.workspace_runtime_artifact_root_locator_ref),
    ],
    runtime_artifact_locator_refs: [
      ...readStringList(artifactBoundary.runtime_artifact_locator_refs),
      ...readStringList(value.runtime_artifact_locator_ref),
      ...readStringList(value.controlled_stage_attempt_ref),
    ],
    has_locator_surface: hasLocatorSurface,
  };
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
  if (!surfaceKind || !ACCEPTED_SKELETON_SURFACE_KINDS.has(surfaceKind)) {
    throw new Error('standard_domain_agent_skeleton.surface_kind must be a supported standard skeleton adapter.');
  }
  const repoSourceBoundary = isRecord(value.repo_source_boundary) ? value.repo_source_boundary : {};
  const artifactBoundary = isRecord(value.artifact_boundary) ? value.artifact_boundary : {};
  const normalizedArtifactBoundary = inferArtifactBoundary(value, artifactBoundary, repoSourceBoundary);
  return {
    surface_kind: 'standard_domain_agent_skeleton',
    version: optionalString(value.version) ?? 'standard-domain-agent-skeleton.v1',
    source_surface_kind: surfaceKind,
    agent_id:
      optionalString(value.agent_id)
      ?? optionalString(value.skeleton_id)
      ?? optionalString(value.adapter_id),
    repo_source_boundary: {
      required_dirs: readRepoSourceDirs(repoSourceBoundary, value),
      optional_dirs: readStringList(repoSourceBoundary.optional_dirs),
      forbidden_dirs: readStringList(repoSourceBoundary.forbidden_dirs),
    },
    contracts: normalizeContractRefs(value),
    artifact_boundary: normalizedArtifactBoundary,
    has_artifact_locator_surface: normalizedArtifactBoundary.has_locator_surface,
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
  if (repoSourceDirs.includes('artifacts')) {
    issues.push('repo_source_skeleton_must_not_include_real_artifacts_dir');
  }
  if (skeleton?.artifact_boundary.repo_contains_real_artifacts) {
    issues.push('domain_repo_must_not_contain_real_artifacts');
  }
  if (skeleton && !skeleton.artifact_boundary.artifact_roots_are_locators) {
    issues.push('artifact_roots_must_be_locators');
  }
  if (skeleton && !skeleton.has_artifact_locator_surface) {
    issues.push('artifact_locator_surface_required');
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
    skeleton_source_field: skeleton ? entry.manifest?.standard_domain_agent_skeleton_source_field ?? null : null,
    skeleton_source_surface_kind: skeleton?.source_surface_kind ?? null,
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

function findAgentEntry(contracts: FrameworkContracts, domain: string) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const normalized = normalizeDomainSelection(domain);
  const entry = catalog.projects.find((candidate) =>
    candidate.project_id === normalized
    || candidate.project === normalized
    || candidate.manifest?.target_domain_id === normalized
    || candidate.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === normalized
  );
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family domain agent: ${domain}.`, {
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
      throw new FrameworkContractError('cli_usage_error', `Unknown agents inspect option: ${token}.`, {
        usage: 'opl agents inspect --domain <domain>',
      });
    }
  }
  if (!domain) {
    throw new FrameworkContractError('cli_usage_error', 'agents inspect requires --domain.', {
      required: ['--domain'],
    });
  }
  return { domain };
}

export function buildFamilyAgentsList(contracts: FrameworkContracts) {
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

export function buildFamilyAgentInspect(contracts: FrameworkContracts, args: string[]) {
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
