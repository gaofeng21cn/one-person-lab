import type { FrameworkContracts } from './types.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from './domain-manifest/types.ts';
import { FrameworkContractError } from './contracts.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageKind,
} from './family-stage-control-plane-contract.ts';
export {
  normalizeFamilyStageControlPlane,
} from './family-stage-control-plane-contract.ts';
export type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageKind,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

export interface FamilyStageListEntry {
  project_id: string;
  project: string;
  target_domain_id: string;
  plane_id: string;
  stage_id: string;
  stage_kind: FamilyStageKind;
  title: string;
  owner: string;
  domain_stage_refs: string[];
  allowed_action_refs: string[];
  knowledge_ref_count: number;
  source_ref_count: number;
  freshness: JsonRecord | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function resolvePlaneFromEntry(entry: DomainManifestCatalogEntry) {
  return entry.status === 'resolved' ? entry.manifest?.family_stage_control_plane ?? null : null;
}

export function buildFamilyStageControlPlaneParity(
  plane: FamilyStageControlPlane,
  manifest: Pick<NormalizedDomainManifest, 'family_action_catalog'> | null = null,
) {
  const issues: string[] = [];
  const actionIds = new Set(manifest?.family_action_catalog?.actions.map((action) => action.action_id) ?? []);
  for (const stage of plane.stages) {
    if (!isRecord(stage.authority_boundary)) {
      issues.push(`${stage.stage_id}: authority_boundary must be an object`);
    }
    const oplRole = optionalString(stage.authority_boundary.opl_role);
    if (oplRole && !['projection_consumer_only', 'descriptor_only', 'discovery_only'].includes(oplRole)) {
      issues.push(`${stage.stage_id}: OPL role must stay projection/descriptor/discovery only`);
    }
    for (const actionRef of stage.allowed_action_refs) {
      if (actionIds.size > 0 && !actionIds.has(actionRef)) {
        issues.push(`${stage.stage_id}: allowed_action_ref not found in family action catalog: ${actionRef}`);
      }
    }
  }

  return {
    surface_kind: 'family_stage_control_plane_parity',
    status: issues.length === 0 ? 'aligned' : 'drift_detected',
    issues,
  };
}

export function buildFamilyStageListEntry(
  entry: DomainManifestCatalogEntry,
  plane: FamilyStageControlPlane,
  stage: FamilyStageDescriptor,
): FamilyStageListEntry {
  return {
    project_id: entry.project_id,
    project: entry.project,
    target_domain_id: plane.target_domain_id,
    plane_id: plane.plane_id,
    stage_id: stage.stage_id,
    stage_kind: stage.stage_kind,
    title: stage.title,
    owner: stage.owner,
    domain_stage_refs: stage.domain_stage_refs,
    allowed_action_refs: stage.allowed_action_refs,
    knowledge_ref_count: stage.knowledge_refs.length,
    source_ref_count: stage.source_refs.length,
    freshness: stage.freshness,
  };
}

function buildStageIndex(contracts: FrameworkContracts) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const domains = catalog.projects.map((entry) => {
    const plane = resolvePlaneFromEntry(entry);
    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      manifest_status: entry.status,
      target_domain_id: plane?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
      plane_id: plane?.plane_id ?? null,
      stage_count: plane?.stages.length ?? 0,
      ready: Boolean(plane),
      error: entry.error,
    };
  });
  const stages = catalog.projects.flatMap((entry) => {
    const plane = resolvePlaneFromEntry(entry);
    return plane
      ? plane.stages.map((stage) => buildFamilyStageListEntry(entry, plane, stage))
      : [];
  });

  return {
    domain_manifests: catalog,
    domains,
    stages,
  };
}

export function buildFamilyStagesList(contracts: FrameworkContracts) {
  const index = buildStageIndex(contracts);
  return {
    version: 'g2',
    family_stages: {
      surface_kind: 'opl_family_stage_control_plane_index',
      summary: {
        total_projects_count: index.domains.length,
        resolved_planes_count: index.domains.filter((entry) => entry.ready).length,
        stages_count: index.stages.length,
      },
      domains: index.domains,
      stages: index.stages,
    },
  };
}

function findDomainEntry(contracts: FrameworkContracts, domain: string) {
  const index = buildStageIndex(contracts);
  const normalized = normalizeDomainSelection(domain);
  const entry = index.domain_manifests.projects.find((candidate) => {
    const plane = resolvePlaneFromEntry(candidate);
    return candidate.project_id === normalized
      || candidate.project === normalized
      || plane?.target_domain_id === domain
      || plane?.target_domain_id === normalized
      || candidate.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === normalized;
  });
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family stage domain: ${domain}.`, {
      domain,
      allowed_domains: index.domain_manifests.projects.map((project) => project.project_id),
    });
  }
  const plane = resolvePlaneFromEntry(entry);
  if (!plane) {
    throw new FrameworkContractError('missing_family_stage_control_plane', `Domain does not expose a family stage control plane: ${domain}.`, {
      domain,
      manifest_status: entry.status,
    });
  }
  return { entry, plane };
}

function findStage(plane: FamilyStageControlPlane, stageId: string) {
  const stage = plane.stages.find((candidate) => candidate.stage_id === stageId);
  if (!stage) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family stage: ${stageId}.`, {
      stage_id: stageId,
      allowed_stages: plane.stages.map((candidate) => candidate.stage_id),
    });
  }
  return stage;
}

function parseOptionArgs(args: string[], required: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    parsed[token.slice(2)] = value;
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new FrameworkContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return parsed;
}

export function buildFamilyStageInspect(contracts: FrameworkContracts, args: string[]) {
  const parsed = parseOptionArgs(args, ['domain', 'stage']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  const stage = findStage(plane, parsed.stage);
  return {
    version: 'g2',
    family_stage: {
      surface_kind: 'opl_family_stage_inspection',
      project_id: entry.project_id,
      project: entry.project,
      target_domain_id: plane.target_domain_id,
      plane_id: plane.plane_id,
      stage,
      workbench_projection: {
        surface_kind: 'opl_family_stage_workbench_projection',
        stage_id: stage.stage_id,
        goal: stage.goal,
        owner: stage.owner,
        knowledge_refs: stage.knowledge_refs,
        skill_refs: stage.skills,
        allowed_action_refs: stage.allowed_action_refs,
        handoff: stage.handoff,
        source_refs: stage.source_refs,
        freshness: stage.freshness,
        authority_boundary: stage.authority_boundary,
      },
      parity: buildFamilyStageControlPlaneParity(plane, entry.manifest),
    },
  };
}
