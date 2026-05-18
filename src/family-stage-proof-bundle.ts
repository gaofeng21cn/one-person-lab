import type { FamilyActionCatalog } from './family-action-catalog-contract.ts';
import {
  buildFamilyStageAdmissionReview,
} from './family-stage-admission.ts';
import type {
  FamilyStageAdmissionFinding,
  FamilyStageAdmissionReview,
  FamilyStageAdmissionStageResult,
  FamilyStageAdmissionStatus,
} from './family-stage-admission.ts';
import type {
  FamilyStageControlPlane,
  FamilyStageDescriptor,
  FamilyStageSurfaceRef,
  FamilyStageTrustLane,
} from './family-stage-control-plane-contract.ts';

type JsonRecord = Record<string, unknown>;

export interface FamilyStageProofBundleCompositionObligation {
  edge_id: string;
  upstream_stage_id: string;
  downstream_stage_id: string;
  upstream_ensures: string[];
  downstream_requires: string[];
  satisfied_by: string[];
  missing: string[];
  status: 'satisfied' | 'missing';
}

export interface FamilyStageProofBundleBoundaryAssumption {
  stage_id: string;
  assumptions: string[];
}

export interface FamilyStageProofBundleIdempotencyAssumption {
  stage_id: string;
  assumptions: string[];
}

export interface FamilyStageProofBundleExpectedReceiptRef {
  stage_id: string;
  ref: string;
  reason: string;
}

export interface FamilyStageProofBundleRuntimeEventRequirement {
  stage_id: string;
  trust_lane: FamilyStageTrustLane | null;
  required: boolean;
  satisfied_by_records_runtime_events: boolean;
  reason: string;
}

export interface FamilyStageProofBundle {
  surface_kind: 'opl_stage_pack_proof_bundle';
  version: 'opl-stage-pack-proof-bundle.v1';
  identity: {
    stage_pack_id: string;
    plane_id: string;
    target_domain_id: string;
    plane_owner: string;
    stage_ids: string[];
    action_catalog_id: string | null;
  };
  admission_status: FamilyStageAdmissionStatus;
  admission_summary: FamilyStageAdmissionReview['summary'];
  stage_results: FamilyStageAdmissionStageResult[];
  blocking_reasons: FamilyStageAdmissionFinding[];
  composition_obligations: FamilyStageProofBundleCompositionObligation[];
  boundary_assumptions: FamilyStageProofBundleBoundaryAssumption[];
  idempotency_assumptions: FamilyStageProofBundleIdempotencyAssumption[];
  expected_receipt_refs: FamilyStageProofBundleExpectedReceiptRef[];
  runtime_event_requirements: FamilyStageProofBundleRuntimeEventRequirement[];
  test_proof_refs: Array<FamilyStageSurfaceRef & { stage_id: string }>;
  authority_boundary: {
    opl_role: 'proof_bundle_projection_owner';
    domain_role: 'truth_quality_receipt_and_artifact_authority';
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
    can_accept_or_reject_owner_receipt: false;
    proof_passed: boolean;
  };
}

export interface BuildFamilyStageProofBundleOptions {
  actionCatalog?: FamilyActionCatalog | null;
  admissionReview?: FamilyStageAdmissionReview | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function readNextStageRefs(stage: FamilyStageDescriptor) {
  if (!isRecord(stage.handoff)) {
    return [];
  }
  return [
    ...readStringList(stage.handoff.next_stage_refs),
    ...readStringList(stage.handoff.next_stage_ids),
    ...readStringList(stage.handoff.allowed_next_stage_refs),
  ];
}

function readStageProvides(stage: FamilyStageDescriptor) {
  if (!isRecord(stage.handoff)) {
    return [];
  }
  return readStringList(stage.handoff.provides);
}

function readBoundaryAssumptions(stage: FamilyStageDescriptor): FamilyStageProofBundleBoundaryAssumption {
  return {
    stage_id: stage.stage_id,
    assumptions: stage.stage_contract?.boundary_assumptions ?? [],
  };
}

function readIdempotencyAssumptions(stage: FamilyStageDescriptor): FamilyStageProofBundleIdempotencyAssumption {
  const explicit = [
    ...readStringList(stage.authority_boundary.idempotency_assumptions),
    ...readStringList(stage.authority_boundary.idempotency_keys),
  ];
  const contractProperties = stage.stage_contract?.properties.filter((property) => (
    property.includes('idempotent')
    || property.includes('idempotency')
    || property.includes('deterministic')
  )) ?? [];
  return {
    stage_id: stage.stage_id,
    assumptions: [...explicit, ...contractProperties],
  };
}

function stageRefMatchesProof(ref: FamilyStageSurfaceRef) {
  const tokens = [
    ref.ref_kind,
    ref.role,
    ref.label,
    ...(Array.isArray(ref.ref) ? ref.ref : [ref.ref]),
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  return tokens.some((value) => (
    value.includes('test')
    || value.includes('proof')
    || value.includes('evidence')
    || value.includes('receipt')
    || value.includes('evaluation')
  ));
}

function buildCompositionObligations(plane: FamilyStageControlPlane): FamilyStageProofBundleCompositionObligation[] {
  const byStageId = new Map(plane.stages.map((stage) => [stage.stage_id, stage]));
  return plane.stages.flatMap((stage) => {
    const upstreamEnsures = [
      ...new Set([
        ...(stage.stage_contract?.ensures ?? []),
        ...readStageProvides(stage),
      ]),
    ];
    const upstreamEnsureSet = new Set(upstreamEnsures);
    return readNextStageRefs(stage).map((targetStageId) => {
      const target = byStageId.get(targetStageId);
      const downstreamRequires = target?.stage_contract?.requires ?? [];
      const satisfiedBy = downstreamRequires.filter((requirement) => upstreamEnsureSet.has(requirement));
      const missing = target ? downstreamRequires.filter((requirement) => !upstreamEnsureSet.has(requirement)) : [
        `stage:${targetStageId}`,
      ];
      return {
        edge_id: `${stage.stage_id}->${targetStageId}`,
        upstream_stage_id: stage.stage_id,
        downstream_stage_id: targetStageId,
        upstream_ensures: upstreamEnsures,
        downstream_requires: downstreamRequires,
        satisfied_by: satisfiedBy,
        missing,
        status: missing.length === 0 ? 'satisfied' : 'missing',
      };
    });
  });
}

function buildExpectedReceiptRefs(
  plane: FamilyStageControlPlane,
  actionCatalog: FamilyActionCatalog | null,
): FamilyStageProofBundleExpectedReceiptRef[] {
  const actionsById = new Map(actionCatalog?.actions.map((action) => [action.action_id, action]) ?? []);
  return plane.stages.flatMap((stage) => {
    const explicit = [
      ...readStringList(stage.authority_boundary.expected_receipt_refs),
      ...readStringList(stage.authority_boundary.owner_receipt_refs),
      ...readStringList(stage.authority_boundary.receipt_refs),
    ].map((ref) => ({
      stage_id: stage.stage_id,
      ref,
      reason: 'explicit_stage_authority_boundary_ref',
    }));
    const trustRequired = stage.trust_boundary?.owner_receipt_required === true
      ? [{
          stage_id: stage.stage_id,
          ref: `owner_receipt:${stage.stage_id}`,
          reason: 'stage_trust_boundary_owner_receipt_required',
        }]
      : [];
    const gateRefs = stage.allowed_action_refs.flatMap((actionRef) => (
      actionsById.get(actionRef)?.human_gate_ids.map((gateId) => ({
        stage_id: stage.stage_id,
        ref: `human_gate:${gateId}`,
        reason: `action_catalog_gate:${actionRef}`,
      })) ?? []
    ));
    return [...explicit, ...trustRequired, ...gateRefs];
  });
}

function buildRuntimeEventRequirements(plane: FamilyStageControlPlane): FamilyStageProofBundleRuntimeEventRequirement[] {
  return plane.stages.map((stage) => {
    const trust = stage.trust_boundary;
    const effectBoundary = trust?.effect_boundary === true
      || ['ai_decision', 'human_gate', 'external_system'].includes(trust?.lane ?? '');
    const runtimeGuardRequired = trust?.runtime_guard_required === true;
    return {
      stage_id: stage.stage_id,
      trust_lane: trust?.lane ?? null,
      required: effectBoundary || runtimeGuardRequired,
      satisfied_by_records_runtime_events: trust?.records_runtime_events === true,
      reason: effectBoundary
        ? 'effect_boundary_requires_replayable_runtime_events'
        : runtimeGuardRequired
          ? 'runtime_guard_requires_event_recording'
          : 'static_or_descriptor_stage',
    };
  });
}

function buildTestProofRefs(plane: FamilyStageControlPlane): Array<FamilyStageSurfaceRef & { stage_id: string }> {
  return plane.stages.flatMap((stage) => [
    ...stage.evaluation,
    ...stage.outputs,
    ...stage.source_refs,
  ]
    .filter(stageRefMatchesProof)
    .map((ref) => ({
      ...ref,
      stage_id: stage.stage_id,
    })));
}

export function buildFamilyStageProofBundle(
  plane: FamilyStageControlPlane,
  options: BuildFamilyStageProofBundleOptions = {},
): FamilyStageProofBundle {
  const actionCatalog = options.actionCatalog ?? null;
  const admissionReview = options.admissionReview ?? buildFamilyStageAdmissionReview(
    plane,
    actionCatalog ? { family_action_catalog: actionCatalog } : null,
  );
  const proofPassed = admissionReview.status === 'admitted';

  return {
    surface_kind: 'opl_stage_pack_proof_bundle',
    version: 'opl-stage-pack-proof-bundle.v1',
    identity: {
      stage_pack_id: `${plane.target_domain_id}:${plane.plane_id}`,
      plane_id: plane.plane_id,
      target_domain_id: plane.target_domain_id,
      plane_owner: plane.owner,
      stage_ids: plane.stages.map((stage) => stage.stage_id),
      action_catalog_id: actionCatalog?.catalog_id ?? null,
    },
    admission_status: admissionReview.status,
    admission_summary: admissionReview.summary,
    stage_results: admissionReview.stage_results,
    blocking_reasons: proofPassed ? [] : admissionReview.findings,
    composition_obligations: buildCompositionObligations(plane),
    boundary_assumptions: plane.stages.map(readBoundaryAssumptions),
    idempotency_assumptions: plane.stages.map(readIdempotencyAssumptions),
    expected_receipt_refs: buildExpectedReceiptRefs(plane, actionCatalog),
    runtime_event_requirements: buildRuntimeEventRequirements(plane),
    test_proof_refs: buildTestProofRefs(plane),
    authority_boundary: {
      opl_role: 'proof_bundle_projection_owner',
      domain_role: 'truth_quality_receipt_and_artifact_authority',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
      can_accept_or_reject_owner_receipt: false,
      proof_passed: proofPassed,
    },
  };
}
