import type { FrameworkContracts } from '../../kernel/types.ts';
import { normalizeStandardDomainAgentId } from '../../kernel/standard-agent-registry.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import type {
  FamilyStageDomainManifest,
  FamilyStageDomainManifestCatalog,
  FamilyStageDomainManifestCatalogEntry,
  ManifestCommandTimeoutPolicy,
} from './family-stage-domain-manifest.ts';
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
import {
  buildFamilyStageProofBundle,
} from './family-stage-proof-bundle.ts';
import {
  normalizeLibraryLifecycleStatus,
  normalizeMigrationPolicy,
  parseOptionArgs,
  parseRepeatedOptionArgs,
} from './family-stage-cli-args.ts';
import {
  buildFamilyStageReplayCertification,
  buildFamilyStageReplayEvidenceFromControlPlane,
  type FamilyStageReplayEvidence,
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
import { buildFamilyStageGraphProjection } from './family-stage-control-plane-graph.ts';
import { buildFamilyActionStageRouteParity } from './family-action-stage-route.ts';
import {
  buildFamilyStageGuaranteeProjection,
  type FamilyStageGuaranteeMode,
} from './family-stage-guarantee-projection.ts';
import type {
  FamilyStageAdmissionReview,
  FamilyStageAdmissionFinding,
  FamilyStageAdmissionStageResult,
} from './family-stage-admission.ts';
import type { FamilyActionStageRoute } from '../../kernel/family-action-catalog-contract.ts';
import {
  buildFamilyStageModeTags,
} from './family-stage-admission.ts';
import type {
  FamilyStageModeTags,
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
export type {
  FamilyStageGraphEdge,
  FamilyStageGraphNode,
  FamilyStageGraphProjection,
} from './family-stage-control-plane-graph.ts';

type JsonRecord = Record<string, unknown>;

function uniqueStringValues(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function replayEvidenceWithCliRefs(
  declaredEvidence: FamilyStageReplayEvidence,
  repeated: Record<string, string[]>,
): FamilyStageReplayEvidence {
  return {
    append_only_event_log_refs: uniqueStringValues([
      ...(declaredEvidence.append_only_event_log_refs ?? []),
      ...(repeated['append-only-event-log-ref'] ?? []),
    ]),
    attempt_ledger_refs: uniqueStringValues([
      ...(declaredEvidence.attempt_ledger_refs ?? []),
      ...(repeated['attempt-ledger-ref'] ?? []),
    ]),
    codex_attempt_trace_refs: declaredEvidence.codex_attempt_trace_refs,
    stage_manifest_refs: declaredEvidence.stage_manifest_refs,
    current_pointer_refs: declaredEvidence.current_pointer_refs,
    owner_answer_binding_refs: declaredEvidence.owner_answer_binding_refs,
    recorded_runtime_event_refs: uniqueStringValues([
      ...(declaredEvidence.recorded_runtime_event_refs ?? []),
      ...(repeated['recorded-runtime-event-ref'] ?? []),
    ]),
    closeout_receipt_refs: uniqueStringValues([
      ...(declaredEvidence.closeout_receipt_refs ?? []),
      ...(repeated['closeout-receipt-ref'] ?? []),
    ]),
    closeout_packet: declaredEvidence.closeout_packet ?? null,
  };
}

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
  selected_action_id: string | null;
  selected_stage_route: FamilyActionStageRoute | null;
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

function refsCount(refs: FamilyStageSurfaceRef[] | undefined) {
  return refs?.length ?? 0;
}

function normalizeDomainSelection(value: string) {
  return normalizeStandardDomainAgentId(value);
}

function resolvePlaneFromEntry(entry: FamilyStageDomainManifestCatalogEntry) {
  return entry.status === 'resolved' ? entry.manifest?.family_stage_control_plane ?? null : null;
}

export function buildFamilyStageControlPlaneParity(
  plane: FamilyStageControlPlane,
  manifest: Pick<FamilyStageDomainManifest, 'family_action_catalog'> | null = null,
) {
  const issues: string[] = [];
  const actionCatalog = manifest?.family_action_catalog ?? null;
  const actionIds = new Set(actionCatalog?.actions.map((action) => action.action_id) ?? []);
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
  if (actionCatalog) {
    issues.push(...buildFamilyActionStageRouteParity(actionCatalog, plane).issues);
  }

  return {
    surface_kind: 'family_stage_control_plane_parity',
    status: issues.length === 0 ? 'aligned' : 'drift_detected',
    issues,
  };
}

function buildFamilyStageListEntry(
  entry: FamilyStageDomainManifestCatalogEntry,
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

const STAGE_MANIFEST_COMMAND_TIMEOUT_MS = 120_000;

type ManifestCatalogOptions = {
  manifestCommandTimeoutMs?: number;
  manifestCommandTimeoutPolicy?: ManifestCommandTimeoutPolicy;
  domainManifests?: FamilyStageDomainManifestCatalog;
  loadDomainManifests?: (
    contracts: FrameworkContracts,
    options: {
      manifestCommandTimeoutMs: number;
      manifestCommandTimeoutPolicy: ManifestCommandTimeoutPolicy;
      useProjectionCacheOnFailure?: boolean;
    },
  ) => FamilyStageDomainManifestCatalog;
  useProjectionCacheOnFailure?: boolean;
};

function buildStageIndex(contracts: FrameworkContracts, options: ManifestCatalogOptions = {}) {
  const manifestOptions = {
    manifestCommandTimeoutMs: options.manifestCommandTimeoutMs ?? STAGE_MANIFEST_COMMAND_TIMEOUT_MS,
    manifestCommandTimeoutPolicy: options.manifestCommandTimeoutPolicy ?? 'fixed',
    useProjectionCacheOnFailure: options.useProjectionCacheOnFailure,
  };
  const baseCatalog = options.domainManifests
    ?? options.loadDomainManifests?.(contracts, manifestOptions)
    ?? {
      summary: {
        total_projects_count: 0,
        resolved_count: 0,
        manifest_catalog_status: 'not_injected',
      },
      projects: [],
      notes: ['domain_manifest_catalog_not_injected'],
    };
  const catalog = baseCatalog;
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
  selectedRoute: FamilyActionStageRoute | null = null,
) {
  return admission.findings.filter((finding) => (
    finding.severity === severity
    && findingAppliesToLaunch(finding, stageId, selectedRoute)
  ));
}

function findingAppliesToLaunch(
  finding: FamilyStageAdmissionFinding,
  stageId: string,
  selectedRoute: FamilyActionStageRoute | null,
) {
  if (finding.code !== 'composition_obligation_not_satisfied' || !selectedRoute) {
    return finding.stage_id === stageId || finding.target_stage_id === stageId;
  }
  if (stageId === selectedRoute.entry_stage_ref) {
    return finding.target_stage_id === stageId && finding.stage_id !== stageId;
  }
  const routeStageIds = new Set([
    ...selectedRoute.required_stage_refs,
    ...selectedRoute.optional_stage_refs,
  ]);
  return finding.target_stage_id === stageId
    && Boolean(finding.stage_id && routeStageIds.has(finding.stage_id))
    && routeStageIds.has(stageId);
}

function stageRouteSelection(
  manifest: FamilyStageDomainManifest,
  stageId: string,
  actionId: string | undefined,
) {
  const actions = manifest.family_action_catalog?.actions ?? [];
  const routedActions = actions.filter((action) => action.stage_route);
  const stageParticipates = routedActions.some((action) => {
    const route = action.stage_route!;
    return [...route.required_stage_refs, ...route.optional_stage_refs].includes(stageId);
  });
  if (!stageParticipates) {
    return { actionId: null, route: null, blockReason: null, finding: null };
  }
  if (!actionId) {
    return {
      actionId: null,
      route: null,
      blockReason: 'stage_route_action_required',
      finding: {
        severity: 'blocker' as const,
        code: 'stage_route_action_required',
        message: 'Stage participates in declared action routes; launch requires an explicit selected action.',
        stage_id: stageId,
      },
    };
  }
  const action = actions.find((candidate) => candidate.action_id === actionId);
  if (!action) {
    return {
      actionId,
      route: null,
      blockReason: 'stage_route_action_unknown',
      finding: {
        severity: 'blocker' as const,
        code: 'stage_route_action_unknown',
        message: 'Selected action is not declared in the family action catalog.',
        stage_id: stageId,
        action_id: actionId,
      },
    };
  }
  if (!action.stage_route) {
    return {
      actionId,
      route: null,
      blockReason: 'stage_route_action_has_no_route',
      finding: {
        severity: 'blocker' as const,
        code: 'stage_route_action_has_no_route',
        message: 'Selected action does not declare a stage route for a route-controlled stage.',
        stage_id: stageId,
        action_id: actionId,
      },
    };
  }
  const selectedStageIds = [
    ...action.stage_route.required_stage_refs,
    ...action.stage_route.optional_stage_refs,
  ];
  if (!selectedStageIds.includes(stageId)) {
    return {
      actionId,
      route: action.stage_route,
      blockReason: 'stage_route_stage_not_selected',
      finding: {
        severity: 'blocker' as const,
        code: 'stage_route_stage_not_selected',
        message: 'Stage is not part of the selected action route.',
        stage_id: stageId,
        action_id: actionId,
      },
    };
  }
  return { actionId, route: action.stage_route, blockReason: null, finding: null };
}

export function buildFamilyStageLaunchAdmissionGate(
  contracts: FrameworkContracts,
  input: { domainId: string; stageId: string; actionId?: string },
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
      selected_action_id: null,
      selected_stage_route: null,
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
      selected_action_id: null,
      selected_stage_route: null,
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
  const selection = stageRouteSelection(entry.manifest!, stage.stage_id, input.actionId);
  const inspectedStage =
    admission.stage_results.find((result) => result.stage_id === stage.stage_id) ?? null;
  const blockerFindings = selection.finding
    ? [selection.finding]
    : findingsForStage(admission, stage.stage_id, 'blocker', selection.route);
  const warningFindings = findingsForStage(admission, stage.stage_id, 'warning', selection.route);
  const blocked = selection.blockReason !== null || blockerFindings.length > 0;

  return {
    surface_kind: 'opl_family_stage_launch_admission_gate',
    version: 'family-stage-launch-admission-gate.v1',
    domain_id: input.domainId,
    normalized_domain_id: normalized,
    stage_id: input.stageId,
    selected_action_id: selection.actionId,
    selected_stage_route: selection.route,
    plane_id: plane.plane_id,
    target_domain_id: plane.target_domain_id,
    status: blocked ? 'blocked' : warningFindings.length > 0 ? 'needs_contracts' : 'admitted',
    gate_action: blocked ? 'block_stage_launch' : 'allow_stage_launch',
    block_reason: selection.blockReason
      ?? (blocked ? `stage_launch_admission_blocked:${blockerFindings[0]?.code ?? 'blocked'}` : null),
    inspected_stage: inspectedStage,
    blocker_findings: blockerFindings,
    warning_findings: warningFindings,
    allowed_stage_ids: allowedStageIds,
    authority_boundary: authorityBoundary,
  };
}

type StageReadinessArgs =
  | {
      domain: null;
      detail: FamilyStageReadinessDetail;
      familyDefaults: true;
    }
  | {
      domain: string;
      detail: FamilyStageReadinessDetail;
      familyDefaults: false;
    };

function parseStageReadinessArgs(args: string[]): StageReadinessArgs {
  const { parsed, flags } = parseOptionArgs(args, [], ['family-defaults']);
  const familyDefaults = flags.has('family-defaults');
  if (familyDefaults && parsed.domain) {
    throw new FrameworkContractError('cli_usage_error', 'stages readiness accepts --family-defaults or --domain, not both.', {
      mutually_exclusive: ['--family-defaults', '--domain'],
    });
  }
  if (!familyDefaults && !parsed.domain) {
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
  if (familyDefaults) {
    return {
      domain: null,
      detail,
      familyDefaults: true,
    };
  }
  return {
    domain: parsed.domain,
    detail,
    familyDefaults: false,
  };
}

export function buildFamilyStageInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed } = parseOptionArgs(args, ['domain', 'stage']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
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

export function buildFamilyStageProofBundleInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
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

export function buildFamilyStageGraphInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
  return {
    version: 'g2',
    family_stage_graph: buildFamilyStageGraphProjection(entry, plane),
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

export function buildFamilyStageAssumptionsInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
  return {
    version: 'g2',
    family_stage_assumption_lifecycle: {
      project_id: entry.project_id,
      project: entry.project,
      projection: buildFamilyStageAssumptionLifecycleProjection(plane),
    },
  };
}

export function buildFamilyStageCohortLoopInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
  return {
    version: 'g2',
    family_stage_cohort_loop: {
      project_id: entry.project_id,
      project: entry.project,
      projection: buildFamilyStageCohortLoopProjection(plane),
    },
  };
}

export function buildFamilyStageRuntimeBudgetInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed } = parseOptionArgs(args, ['domain']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
  return {
    version: 'g2',
    family_stage_runtime_budget: {
      project_id: entry.project_id,
      project: entry.project,
      projection: buildFamilyStageRuntimeBudgetProjection(plane),
    },
  };
}

export function buildFamilyStagePackRegistryInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed, repeated } = parseRepeatedOptionArgs(args, ['domain'], ['reused-by-ref']);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
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

export function buildFamilyStagePackSourceSpecInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed, repeated } = parseRepeatedOptionArgs(args, ['domain'], [
    'append-only-event-log-ref',
    'attempt-ledger-ref',
    'recorded-runtime-event-ref',
    'closeout-receipt-ref',
    'reused-by-ref',
  ]);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: entry.manifest?.family_action_catalog ?? null,
    admissionReview: admission,
  });
  const graphProjection = buildFamilyStageGraphProjection(entry, plane);
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
  const replayCertification = buildFamilyStageReplayCertification(
    proofBundle,
    replayEvidenceWithCliRefs(buildFamilyStageReplayEvidenceFromControlPlane(plane), repeated),
  );
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

export function buildFamilyStageReplayCertificationInspect(contracts: FrameworkContracts, args: string[], options: ManifestCatalogOptions = {}) {
  const { parsed, repeated } = parseRepeatedOptionArgs(args, ['domain'], [
    'append-only-event-log-ref',
    'attempt-ledger-ref',
    'recorded-runtime-event-ref',
    'closeout-receipt-ref',
  ]);
  const { entry, plane } = findDomainEntry(contracts, parsed.domain, options);
  const admission = buildFamilyStageAdmissionReview(plane, entry.manifest);
  const proofBundle = buildFamilyStageProofBundle(plane, {
    actionCatalog: entry.manifest?.family_action_catalog ?? null,
    admissionReview: admission,
  });
  const replayEvidence = replayEvidenceWithCliRefs(
    buildFamilyStageReplayEvidenceFromControlPlane(plane),
    repeated,
  );
  return {
    version: 'g2',
    family_stage_replay_certification: {
      project_id: entry.project_id,
      project: entry.project,
      certification: buildFamilyStageReplayCertification(proofBundle, replayEvidence),
    },
  };
}
