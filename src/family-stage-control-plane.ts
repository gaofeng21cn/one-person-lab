import type { FrameworkContracts } from './types.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type { DomainManifestCatalogEntry, NormalizedDomainManifest } from './domain-manifest/types.ts';
import { withOplMetaAgentStageAttemptEntry } from './family-stage-control-plane-oma.ts';
import { FrameworkContractError } from './contracts.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageKind,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';
import { buildFamilyStageAdmissionReview } from './family-stage-admission.ts';
import { buildFamilyStageAssumptionLifecycleProjection } from './family-stage-assumption-lifecycle.ts';
import { buildFamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
import { buildFamilyStageRuntimeBudgetProjection } from './family-stage-runtime-budget.ts';
import {
  buildFamilyStagePackRegistryEntry,
  buildFamilyStagePackRegistryProjection,
} from './family-stage-pack-registry.ts';
import type {
  FamilyStagePackLibraryLifecycleStatus,
  FamilyStagePackMigrationPolicy,
} from './family-stage-pack-registry.ts';
import {
  buildFamilyStagePackIntegrity,
  buildFamilyStageProofBundle,
} from './family-stage-proof-bundle.ts';
import {
  buildFamilyStageReplayCertification,
} from './family-stage-replay-certification.ts';
import {
  buildStageOperatorReadiness,
  buildStageReadinessSummary,
} from './family-stage-readiness.ts';
import {
  buildFamilyDefaultsStageReadiness,
  type FamilyStageReadinessDetail,
} from './family-stage-readiness-aggregate.ts';
import {
  buildFamilyStagePackSourceSpecProjection,
} from './family-stage-source-spec.ts';
import {
  buildFamilyStageGuaranteeProjection,
  type FamilyStageGuaranteeMode,
} from './family-stage-guarantee-projection.ts';
import type { ManifestCommandTimeoutPolicy } from './domain-manifest/resolver.ts';
import type { FamilyStageProofBundleIntegrity } from './family-stage-proof-bundle.ts';
import type {
  FamilyStageAdmissionReview,
  FamilyStageAdmissionStageResult,
} from './family-stage-admission.ts';
import {
  buildFamilyStageModeTags,
} from './family-stage-admission.ts';
import type {
  FamilyStageModeTags,
  FamilyStageFailureLocalization,
} from './family-stage-admission.ts';
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
  source_scope_ref_count: number;
  artifact_scope_ref_count: number;
  workspace_scope_ref_count: number;
  runtime_assumption_count: number;
  monitor_ref_count: number;
  guarantee_mode: FamilyStageGuaranteeMode;
  mode_tags: FamilyStageModeTags;
  freshness: JsonRecord | null;
  trust_lane: string | null;
  admission_status: string | null;
}

export interface FamilyStageLaunchAdmissionGate {
  surface_kind: 'opl_family_stage_launch_admission_gate';
  version: 'family-stage-launch-admission-gate.v1';
  domain_id: string;
  normalized_domain_id: string;
  stage_id: string;
  plane_id: string | null;
  target_domain_id: string | null;
  status: 'admitted' | 'needs_contracts' | 'blocked' | 'not_in_declared_control_plane' | 'missing_control_plane';
  gate_action: 'allow_stage_launch' | 'block_stage_launch';
  block_reason: string | null;
  inspected_stage: FamilyStageAdmissionStageResult | null;
  blocker_findings: FamilyStageAdmissionReview['findings'];
  warning_findings: FamilyStageAdmissionReview['findings'];
  allowed_stage_ids: string[];
  authority_boundary: {
    opl: 'launch_admission_gate_and_blocker_projection_only';
    domain: 'truth_quality_artifact_gate_owner';
    can_write_domain_truth: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

export interface FamilyStageGraphNode {
  stage_id: string;
  stage_kind: FamilyStageKind;
  title: string;
  owner: string;
  trust_lane: string | null;
  admission_status: string | null;
  guarantee_modes: FamilyStageGuaranteeMode[];
  mode_tags: FamilyStageModeTags;
  static_check_eligible: boolean;
  runtime_enforced: boolean;
  domain_owned_judgment: boolean;
  observability_only: boolean;
  runtime_event_ref_count: number;
  source_scope_ref_count: number;
  artifact_scope_ref_count: number;
  workspace_scope_ref_count: number;
  runtime_assumption_count: number;
  monitor_ref_count: number;
}

export interface FamilyStageGraphEdge {
  edge_id: string;
  upstream_stage_id: string;
  downstream_stage_id: string;
  edge_kind: 'handoff_requires_ensures';
  upstream_ensures: string[];
  downstream_requires: string[];
  satisfied_by: string[];
  missing: string[];
  status: 'satisfied' | 'missing';
}

export interface FamilyStageGraphProjection {
  surface_kind: 'opl_family_stage_graph_projection';
  version: 'family-stage-graph-projection.v1';
  project_id: string;
  project: string;
  target_domain_id: string;
  plane_id: string;
  graph_summary: {
    node_count: number;
    edge_count: number;
    blocked_node_count: number;
    needs_contracts_node_count: number;
    missing_edge_count: number;
    runtime_enforced_node_count: number;
    verified_core_eligible_node_count: number;
    durable_runtime_only_node_count: number;
    runtime_boundary_required_node_count: number;
    monitor_ref_count: number;
  };
  nodes: FamilyStageGraphNode[];
  edges: FamilyStageGraphEdge[];
  failure_localization: FamilyStageFailureLocalization[];
  admission_status: string;
  integrity: FamilyStageProofBundleIntegrity;
  authority_boundary: {
    opl_role: 'graph_projection_only';
    graph_is_scheduler_input: true;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function refsCount(refs: FamilyStageSurfaceRef[] | undefined) {
  return refs?.length ?? 0;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
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
    oma: 'opl-meta-agent',
    oplmetaagent: 'opl-meta-agent',
    'opl-meta-agent': 'opl-meta-agent',
    opl_meta_agent: 'opl-meta-agent',
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
  admissionStage: FamilyStageAdmissionStageResult | null = null,
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
    source_scope_ref_count: refsCount(stage.stage_contract?.source_scope_refs),
    artifact_scope_ref_count: refsCount(stage.stage_contract?.artifact_scope_refs),
    workspace_scope_ref_count: refsCount(stage.stage_contract?.workspace_scope_refs),
    runtime_assumption_count: stage.stage_contract?.runtime_assumptions.length ?? 0,
    monitor_ref_count: stage.stage_contract?.monitor_refs.length ?? 0,
    guarantee_mode: buildFamilyStageGuaranteeProjection(stage).primary_mode,
    mode_tags: admissionStage?.mode_tags ?? buildFamilyStageModeTags(stage),
    freshness: stage.freshness,
    trust_lane: stage.trust_boundary?.lane ?? admissionStage?.trust_lane ?? null,
    admission_status: admissionStage?.status ?? null,
  };
}

function runtimeEventRefs(stage: FamilyStageDescriptor) {
  return [
    ...new Set([
      ...readStringList(stage.trust_boundary?.runtime_event_refs),
      ...readStringList(stage.stage_contract?.runtime_event_refs),
    ]),
  ];
}

function buildGraphNode(
  stage: FamilyStageDescriptor,
  admissionStage: FamilyStageAdmissionStageResult | null,
): FamilyStageGraphNode {
  const guarantee = buildFamilyStageGuaranteeProjection(stage);
  const modeTags = admissionStage?.mode_tags ?? buildFamilyStageModeTags(stage);
  return {
    stage_id: stage.stage_id,
    stage_kind: stage.stage_kind,
    title: stage.title,
    owner: stage.owner,
    trust_lane: stage.trust_boundary?.lane ?? admissionStage?.trust_lane ?? null,
    admission_status: admissionStage?.status ?? null,
    guarantee_modes: guarantee.modes,
    mode_tags: modeTags,
    static_check_eligible: stage.trust_boundary?.static_check_eligible === true,
    runtime_enforced: guarantee.runtime_enforced,
    domain_owned_judgment: guarantee.domain_owned_judgment,
    observability_only: guarantee.observability_only,
    runtime_event_ref_count: runtimeEventRefs(stage).length,
    source_scope_ref_count: refsCount(stage.stage_contract?.source_scope_refs),
    artifact_scope_ref_count: refsCount(stage.stage_contract?.artifact_scope_refs),
    workspace_scope_ref_count: refsCount(stage.stage_contract?.workspace_scope_refs),
    runtime_assumption_count: stage.stage_contract?.runtime_assumptions.length ?? 0,
    monitor_ref_count: stage.stage_contract?.monitor_refs.length ?? 0,
  };
}

function buildStageGraphProjection(
  entry: DomainManifestCatalogEntry,
  plane: FamilyStageControlPlane,
): FamilyStageGraphProjection {
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const admissionByStage = new Map(admission.stage_results.map((stage) => [stage.stage_id, stage]));
  const actionCatalog = entry.manifest?.family_action_catalog ?? null;
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog,
    admissionReview: admission,
  });
  const nodes = plane.stages.map((stage) => buildGraphNode(
    stage,
    admissionByStage.get(stage.stage_id) ?? null,
  ));
  const edges = proofBundle.composition_obligations.map((edge) => ({
    ...edge,
    edge_kind: 'handoff_requires_ensures' as const,
  }));
  return {
    surface_kind: 'opl_family_stage_graph_projection',
    version: 'family-stage-graph-projection.v1',
    project_id: entry.project_id,
    project: entry.project,
    target_domain_id: plane.target_domain_id,
    plane_id: plane.plane_id,
    graph_summary: {
      node_count: nodes.length,
      edge_count: edges.length,
      blocked_node_count: nodes.filter((node) => node.admission_status === 'blocked').length,
      needs_contracts_node_count: nodes.filter((node) => node.admission_status === 'needs_contracts').length,
      missing_edge_count: edges.filter((edge) => edge.status === 'missing').length,
      runtime_enforced_node_count: nodes.filter((node) => node.runtime_enforced).length,
      verified_core_eligible_node_count: nodes.filter((node) => node.mode_tags.verified_core_eligible).length,
      durable_runtime_only_node_count: nodes.filter((node) => node.mode_tags.durable_runtime_only).length,
      runtime_boundary_required_node_count: nodes.filter((node) => node.mode_tags.runtime_boundary_required).length,
      monitor_ref_count: nodes.reduce((count, node) => count + node.monitor_ref_count, 0),
    },
    nodes,
    edges,
    failure_localization: admission.failure_localization,
    admission_status: admission.status,
    integrity: buildFamilyStagePackIntegrity(plane, actionCatalog),
    authority_boundary: {
      opl_role: 'graph_projection_only',
      graph_is_scheduler_input: true,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}

type DomainManifestCatalog = ReturnType<typeof buildDomainManifestCatalog>['domain_manifests'];
const STAGE_MANIFEST_COMMAND_TIMEOUT_MS = 120_000;

type ManifestCatalogOptions = {
  manifestCommandTimeoutMs?: number;
  manifestCommandTimeoutPolicy?: ManifestCommandTimeoutPolicy;
  domainManifests?: DomainManifestCatalog;
};

function buildStageIndex(contracts: FrameworkContracts, options: ManifestCatalogOptions = {}) {
  const baseCatalog = options.domainManifests ?? buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: options.manifestCommandTimeoutMs ?? STAGE_MANIFEST_COMMAND_TIMEOUT_MS,
    manifestCommandTimeoutPolicy: options.manifestCommandTimeoutPolicy ?? 'fixed',
  }).domain_manifests;
  const catalog = withOplMetaAgentStageAttemptEntry(baseCatalog);
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
    if (!plane) {
      return [];
    }
    const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
    const admissionByStage = new Map(admission.stage_results.map((stage) => [stage.stage_id, stage]));
    return plane.stages.map((stage) => buildFamilyStageListEntry(
      entry,
      plane,
      stage,
      admissionByStage.get(stage.stage_id) ?? null,
    ));
  });
  const admissions = catalog.projects.flatMap((entry) => {
    const plane = resolvePlaneFromEntry(entry);
    return plane ? [buildFamilyStageAdmissionReview(plane, entry.manifest)] : [];
  });

  return {
    domain_manifests: catalog,
    domains,
    stages,
    admissions,
  };
}

export function buildFamilyStagesList(contracts: FrameworkContracts, options: ManifestCatalogOptions = {}) {
  const index = buildStageIndex(contracts, options);
  return {
    version: 'g2',
    family_stages: {
      surface_kind: 'opl_family_stage_control_plane_index',
      summary: {
        total_projects_count: index.domains.length,
        resolved_planes_count: index.domains.filter((entry) => entry.ready).length,
        stages_count: index.stages.length,
        admitted_stages_count: index.admissions.reduce(
          (total, admission) => total + admission.summary.admitted_stages_count,
          0,
        ),
        blocked_stages_count: index.admissions.reduce(
          (total, admission) => total + admission.summary.blocked_stages_count,
          0,
        ),
        needs_contracts_stages_count: index.admissions.reduce(
          (total, admission) => total + admission.summary.needs_contracts_stages_count,
          0,
        ),
      },
      domains: index.domains,
      stages: index.stages,
    },
  };
}

function findDomainEntry(contracts: FrameworkContracts, domain: string, options: ManifestCatalogOptions = {}) {
  const index = buildStageIndex(contracts, options);
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

function findingsForStage(
  admission: FamilyStageAdmissionReview,
  stageId: string,
  severity: 'blocker' | 'warning',
) {
  return admission.findings.filter((finding) => (
    finding.severity === severity
    && (finding.stage_id === stageId || finding.target_stage_id === stageId)
  ));
}

export function buildFamilyStageLaunchAdmissionGate(
  contracts: FrameworkContracts,
  input: { domainId: string; stageId: string },
  options: ManifestCatalogOptions = {},
): FamilyStageLaunchAdmissionGate {
  const normalized = normalizeDomainSelection(input.domainId);
  const index = buildStageIndex(contracts, options);
  const entry = index.domain_manifests.projects.find((candidate) => {
    const plane = resolvePlaneFromEntry(candidate);
    return candidate.project_id === normalized
      || candidate.project === normalized
      || plane?.target_domain_id === input.domainId
      || plane?.target_domain_id === normalized
      || candidate.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === normalized;
  });
  const plane = entry ? resolvePlaneFromEntry(entry) : null;
  const allowedStageIds = plane?.stages.map((stage) => stage.stage_id) ?? [];
  const authorityBoundary = {
    opl: 'launch_admission_gate_and_blocker_projection_only' as const,
    domain: 'truth_quality_artifact_gate_owner' as const,
    can_write_domain_truth: false as const,
    can_authorize_quality_verdict: false as const,
    can_mutate_artifact_body: false as const,
  };

  if (!entry || !plane) {
    return {
      surface_kind: 'opl_family_stage_launch_admission_gate',
      version: 'family-stage-launch-admission-gate.v1',
      domain_id: input.domainId,
      normalized_domain_id: normalized,
      stage_id: input.stageId,
      plane_id: plane?.plane_id ?? null,
      target_domain_id: plane?.target_domain_id ?? null,
      status: 'missing_control_plane',
      gate_action: 'block_stage_launch',
      block_reason: 'family_stage_control_plane_missing',
      inspected_stage: null,
      blocker_findings: [{
        severity: 'blocker',
        code: 'family_stage_control_plane_missing',
        message: 'Domain does not expose a family_stage_control_plane; OPL blocks stage launch instead of recording a legacy unregistered attempt.',
        stage_id: input.stageId,
      }],
      warning_findings: [],
      allowed_stage_ids: allowedStageIds,
      authority_boundary: authorityBoundary,
    };
  }

  const stage = plane.stages.find((candidate) => candidate.stage_id === input.stageId) ?? null;
  if (!stage) {
    return {
      surface_kind: 'opl_family_stage_launch_admission_gate',
      version: 'family-stage-launch-admission-gate.v1',
      domain_id: input.domainId,
      normalized_domain_id: normalized,
      stage_id: input.stageId,
      plane_id: plane.plane_id,
      target_domain_id: plane.target_domain_id,
      status: 'not_in_declared_control_plane',
      gate_action: 'block_stage_launch',
      block_reason: 'stage_not_in_declared_control_plane',
      inspected_stage: null,
      blocker_findings: [{
        severity: 'blocker',
        code: 'stage_not_in_declared_control_plane',
        message: 'Stage attempt is not part of the declared family stage pack; OPL blocks launch until the stage is declared in the control plane.',
        stage_id: input.stageId,
      }],
      warning_findings: [],
      allowed_stage_ids: allowedStageIds,
      authority_boundary: authorityBoundary,
    };
  }

  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const inspectedStage =
    admission.stage_results.find((result) => result.stage_id === stage.stage_id) ?? null;
  const blockerFindings = findingsForStage(admission, stage.stage_id, 'blocker');
  const warningFindings = findingsForStage(admission, stage.stage_id, 'warning');
  const blocked = inspectedStage?.status === 'blocked' || blockerFindings.length > 0;

  return {
    surface_kind: 'opl_family_stage_launch_admission_gate',
    version: 'family-stage-launch-admission-gate.v1',
    domain_id: input.domainId,
    normalized_domain_id: normalized,
    stage_id: input.stageId,
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    status: inspectedStage?.status ?? 'blocked',
    gate_action: blocked ? 'block_stage_launch' : 'allow_stage_launch',
    block_reason: blocked ? `stage_launch_admission_blocked:${blockerFindings[0]?.code ?? 'blocked'}` : null,
    inspected_stage: inspectedStage,
    blocker_findings: blockerFindings,
    warning_findings: warningFindings,
    allowed_stage_ids: allowedStageIds,
    authority_boundary: authorityBoundary,
  };
}

function parseOptionArgs(args: string[], required: string[], flags: string[] = []) {
  const parsed: Record<string, string> = {};
  const parsedFlags = new Set<string>();
  const flagSet = new Set(flags);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const key = token.slice(2);
    if (flagSet.has(key)) {
      parsedFlags.add(key);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    parsed[key] = value;
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new FrameworkContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return { parsed, flags: parsedFlags };
}

function parseStageReadinessArgs(args: string[]) {
  const { parsed, flags } = parseOptionArgs(args, [], ['family-defaults']);
  if (flags.has('family-defaults') && parsed.domain) {
    throw new FrameworkContractError('cli_usage_error', 'stages readiness accepts --family-defaults or --domain, not both.', {
      mutually_exclusive: ['--family-defaults', '--domain'],
    });
  }
  if (!flags.has('family-defaults') && !parsed.domain) {
    throw new FrameworkContractError('cli_usage_error', 'stages readiness requires --domain or --family-defaults.', {
      required_one_of: ['--domain', '--family-defaults'],
    });
  }
  const detail = parsed.detail ?? 'summary';
  if (detail !== 'summary' && detail !== 'full') {
    throw new FrameworkContractError('cli_usage_error', `Unsupported stage readiness detail level: ${detail}.`, {
      allowed_detail: ['summary', 'full'],
    });
  }
  return {
    domain: parsed.domain ?? null,
    detail: detail as FamilyStageReadinessDetail,
    familyDefaults: flags.has('family-defaults'),
  };
}

function parseRepeatedOptionArgs(args: string[], required: string[], repeated: string[] = []) {
  const parsed: Record<string, string> = {};
  const repeatedValues: Record<string, string[]> = Object.fromEntries(repeated.map((key) => [key, []]));
  const repeatable = new Set(repeated);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    const key = token.slice(2);
    if (repeatable.has(key)) {
      repeatedValues[key].push(value);
    } else {
      parsed[key] = value;
    }
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new FrameworkContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return { parsed, repeated: repeatedValues };
}

function normalizeMigrationPolicy(value: string | undefined): FamilyStagePackMigrationPolicy | null {
  if (!value) {
    return null;
  }
  if (value === 'continue_old_hash' || value === 'migrate_to_new_hash' || value === 'blocked_human_gate') {
    return value;
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported stage pack migration policy: ${value}.`, {
    allowed_policies: ['continue_old_hash', 'migrate_to_new_hash', 'blocked_human_gate'],
  });
}

function normalizeLibraryLifecycleStatus(value: string | undefined): FamilyStagePackLibraryLifecycleStatus | null {
  if (!value) {
    return null;
  }
  if (
    value === 'candidate'
    || value === 'admitted'
    || value === 'reused'
    || value === 'deprecated'
    || value === 'superseded'
  ) {
    return value;
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported stage pack library lifecycle status: ${value}.`, {
    allowed_statuses: ['candidate', 'admitted', 'reused', 'deprecated', 'superseded'],
  });
}

export function buildFamilyStageInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed } = parseOptionArgs(args, ['domain', 'stage']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  const stage = findStage(plane, parsed.stage);
  const admission: FamilyStageAdmissionReview = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const assumptionLifecycle = buildFamilyStageAssumptionLifecycleProjection(plane);
  const inspectedStageAdmission =
    admission.stage_results.find((result) => result.stage_id === stage.stage_id) ?? null;
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
        scope_refs: {
          source_scope_refs: stage.stage_contract?.source_scope_refs ?? [],
          artifact_scope_refs: stage.stage_contract?.artifact_scope_refs ?? [],
          workspace_scope_refs: stage.stage_contract?.workspace_scope_refs ?? [],
          summary: {
            source_scope_ref_count: refsCount(stage.stage_contract?.source_scope_refs),
            artifact_scope_ref_count: refsCount(stage.stage_contract?.artifact_scope_refs),
            workspace_scope_ref_count: refsCount(stage.stage_contract?.workspace_scope_refs),
          },
        },
        freshness: stage.freshness,
        runtime_assumptions: stage.stage_contract?.runtime_assumptions ?? [],
        monitor_refs: stage.stage_contract?.monitor_refs ?? [],
        assumption_lifecycle: assumptionLifecycle.assumptions.filter((assumption) => (
          assumption.stage_id === stage.stage_id
        )),
        monitor_summary: {
          runtime_assumption_count: stage.stage_contract?.runtime_assumptions.length ?? 0,
          monitor_ref_count: stage.stage_contract?.monitor_refs.length ?? 0,
          assumption_blocker_count: assumptionLifecycle.assumptions.filter((assumption) => (
            assumption.stage_id === stage.stage_id && assumption.severity === 'blocker'
          )).length,
          authority_boundary: 'projection_only_no_domain_verdict_authority',
        },
        guarantee_summary: buildFamilyStageGuaranteeProjection(stage),
        authority_boundary: stage.authority_boundary,
      },
      parity: buildFamilyStageControlPlaneParity(plane, entry.manifest),
      admission: {
        ...admission,
        inspected_stage: inspectedStageAdmission,
      },
    },
  };
}

export function buildFamilyStageProofBundleInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  return {
    version: 'g2',
    family_stage_proof_bundle: {
      project_id: entry.project_id,
      project: entry.project,
      proof_bundle: buildFamilyStageProofBundle(plane, {
        actionCatalog: entry.manifest?.family_action_catalog ?? null,
        admissionReview: admission,
      }),
    },
  };
}

export function buildFamilyStageGraphInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  return {
    version: 'g2',
    family_stage_graph: buildStageGraphProjection(entry, plane),
  };
}

export function buildFamilyStageReadinessInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}): { version: 'g2'; family_stage_readiness: Record<string, unknown> } {
  const parsed = parseStageReadinessArgs(args);
  if (parsed.familyDefaults) {
    const index = buildStageIndex(contracts, options);
    return {
      version: 'g2',
      family_stage_readiness: buildFamilyDefaultsStageReadiness(index.domain_manifests.projects, parsed.detail),
    };
  }
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
  const summary = buildStageReadinessSummary(entry, plane, parsed.domain.trim());
  return {
    version: 'g2',
    family_stage_readiness: (
      parsed.detail === 'full'
        ? {
            detail_level: 'full',
            family_stage_readiness: summary,
          }
        : {
            detail_level: 'summary',
            ...buildStageOperatorReadiness(summary),
            full_detail_args: ['--detail', 'full'],
          }
    ) as unknown as Record<string, unknown>,
  };
}

export function buildFamilyStageAssumptionsInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  return {
    version: 'g2',
    family_stage_assumption_lifecycle: {
      project_id: entry.project_id,
      project: entry.project,
      projection: buildFamilyStageAssumptionLifecycleProjection(plane),
    },
  };
}

export function buildFamilyStageCohortLoopInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  return {
    version: 'g2',
    family_stage_cohort_loop: {
      project_id: entry.project_id,
      project: entry.project,
      projection: buildFamilyStageCohortLoopProjection(plane),
    },
  };
}

export function buildFamilyStageRuntimeBudgetInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  return {
    version: 'g2',
    family_stage_runtime_budget: {
      project_id: entry.project_id,
      project: entry.project,
      projection: buildFamilyStageRuntimeBudgetProjection(plane),
    },
  };
}

export function buildFamilyStagePackRegistryInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed, repeated } = parseRepeatedOptionArgs(args, ['domain'], ['reused-by-ref']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: entry.manifest?.family_action_catalog ?? null,
    admissionReview: admission,
  });
  const migrationPolicy = normalizeMigrationPolicy(parsed['migration-policy']);
  const attemptBinding = parsed['attempt-id']
    ? {
        stage_attempt_id: parsed['attempt-id'],
        stage_pack_hash: parsed['attempt-stage-pack-hash'] ?? proofBundle.integrity.stage_pack_hash,
        stage_id: parsed['attempt-stage'] ?? proofBundle.identity.stage_ids[0] ?? 'unknown_stage',
        created_at_ref: parsed['attempt-created-at-ref'] ?? null,
      }
    : null;
  const entryProjection = buildFamilyStagePackRegistryEntry(proofBundle, {
    previousStagePackHash: parsed['previous-stage-pack-hash'] ?? null,
    attemptBinding,
    migrationPolicy,
    migrationPolicyRef: parsed['migration-policy-ref'] ?? null,
    libraryLifecycleStatus: normalizeLibraryLifecycleStatus(parsed['library-status']),
    promotionRef: parsed['promotion-ref'] ?? null,
    deprecationRef: parsed['deprecation-ref'] ?? null,
    supersessionRef: parsed['supersession-ref'] ?? null,
    supersededByStagePackRef: parsed['superseded-by-stage-pack-ref'] ?? null,
    reusedByRefs: repeated['reused-by-ref'],
  });
  return {
    version: 'g2',
    family_stage_pack_registry: {
      project_id: entry.project_id,
      project: entry.project,
      projection: buildFamilyStagePackRegistryProjection([entryProjection]),
    },
  };
}

export function buildFamilyStagePackSourceSpecInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed, repeated } = parseRepeatedOptionArgs(args, ['domain'], [
    'append-only-event-log-ref',
    'attempt-ledger-ref',
    'recorded-runtime-event-ref',
    'closeout-receipt-ref',
    'reused-by-ref',
  ]);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: entry.manifest?.family_action_catalog ?? null,
    admissionReview: admission,
  });
  const graphProjection = buildStageGraphProjection(entry, plane);
  const registryEntry = buildFamilyStagePackRegistryEntry(proofBundle, {
    previousStagePackHash: parsed['previous-stage-pack-hash'] ?? null,
    migrationPolicy: normalizeMigrationPolicy(parsed['migration-policy']),
    migrationPolicyRef: parsed['migration-policy-ref'] ?? null,
    libraryLifecycleStatus: normalizeLibraryLifecycleStatus(parsed['library-status']),
    promotionRef: parsed['promotion-ref'] ?? null,
    deprecationRef: parsed['deprecation-ref'] ?? null,
    supersessionRef: parsed['supersession-ref'] ?? null,
    supersededByStagePackRef: parsed['superseded-by-stage-pack-ref'] ?? null,
    reusedByRefs: repeated['reused-by-ref'],
  });
  const registryProjection = buildFamilyStagePackRegistryProjection([registryEntry]);
  const replayCertification = buildFamilyStageReplayCertification(proofBundle, {
    append_only_event_log_refs: repeated['append-only-event-log-ref'],
    attempt_ledger_refs: repeated['attempt-ledger-ref'],
    recorded_runtime_event_refs: repeated['recorded-runtime-event-ref'],
    closeout_receipt_refs: repeated['closeout-receipt-ref'],
  });
  return {
    version: 'g2',
    family_stage_pack_source_spec: {
      project_id: entry.project_id,
      project: entry.project,
      source_spec: buildFamilyStagePackSourceSpecProjection({
        plane,
        proofBundle,
        graphProjection,
        registryProjection,
        replayCertification,
        assumptionLifecycle: buildFamilyStageAssumptionLifecycleProjection(plane),
        cohortLoop: buildFamilyStageCohortLoopProjection(plane),
      }),
    },
  };
}

export function buildFamilyStageReplayCertificationInspect(contracts: FrameworkContracts, args: string[]) {
  const { parsed, repeated } = parseRepeatedOptionArgs(args, ['domain'], [
    'append-only-event-log-ref',
    'attempt-ledger-ref',
    'recorded-runtime-event-ref',
    'closeout-receipt-ref',
  ]);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain);
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: entry.manifest?.family_action_catalog ?? null,
    admissionReview: admission,
  });
  return {
    version: 'g2',
    family_stage_replay_certification: {
      project_id: entry.project_id,
      project: entry.project,
      certification: buildFamilyStageReplayCertification(proofBundle, {
        append_only_event_log_refs: repeated['append-only-event-log-ref'],
        attempt_ledger_refs: repeated['attempt-ledger-ref'],
        recorded_runtime_event_refs: repeated['recorded-runtime-event-ref'],
        closeout_receipt_refs: repeated['closeout-receipt-ref'],
      }),
    },
  };
}
