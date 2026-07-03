import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import {
  buildFamilyStageAdmissionReview,
  buildFamilyStageModeTags,
  type FamilyStageAdmissionStageResult,
  type FamilyStageFailureLocalization,
  type FamilyStageModeTags,
} from './family-stage-admission.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageKind,
  FamilyStageSurfaceRef,
} from './family-stage-control-plane-contract.ts';
import {
  buildFamilyStageGuaranteeProjection,
  type FamilyStageGuaranteeMode,
} from './family-stage-guarantee-projection.ts';
import {
  buildFamilyStagePackIntegrity,
  buildFamilyStageProofBundle,
  type FamilyStageProofBundleIntegrity,
} from './family-stage-proof-bundle.ts';

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

function refsCount(refs: FamilyStageSurfaceRef[] | undefined) {
  return refs?.length ?? 0;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
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

export function buildFamilyStageGraphProjection(
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
