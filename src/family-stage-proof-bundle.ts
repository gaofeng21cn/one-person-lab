import crypto from 'node:crypto';
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
  runtime_event_refs: string[];
  satisfied_by_runtime_event_refs: boolean;
  reason: string;
}

export interface FamilyStageProofBundleRuntimeMetrics {
  composition_obligation_count: number;
  runtime_event_requirement_count: number;
  satisfied_runtime_event_ref_count: number;
  expected_receipt_ref_count: number;
  test_proof_ref_count: number;
  blocker_count: number;
  warning_count: number;
  authority_boundary: {
    opl_role: 'scheduling_operator_observability_only';
    domain_role: 'truth_quality_receipt_and_artifact_authority';
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
    can_accept_or_reject_owner_receipt: false;
    metrics_are_domain_verdict: false;
  };
}

export interface FamilyStageProofBundleIntegrity {
  surface_kind: 'opl_stage_pack_integrity_metadata';
  version: 'opl-stage-pack-integrity-metadata.v1';
  hash_algorithm: 'sha256';
  stage_pack_hash: string;
  hash_scope: 'family_stage_control_plane_and_action_catalog_contract_refs';
  signature_status: 'unsigned_digest_only' | 'signature_ref_declared';
  signer_ref: string | null;
  signature_ref: string | null;
  authority_boundary: {
    opl_role: 'digest_projection_only';
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_verify_external_signature: false;
  };
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
  proof_runtime_metrics: FamilyStageProofBundleRuntimeMetrics;
  integrity: FamilyStageProofBundleIntegrity;
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

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
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
    const runtimeEventRefs = [
      ...new Set([
        ...readStringList(stage.trust_boundary?.runtime_event_refs),
        ...readStringList(stage.stage_contract?.runtime_event_refs),
      ]),
    ];
    return {
      stage_id: stage.stage_id,
      trust_lane: trust?.lane ?? null,
      required: effectBoundary || runtimeGuardRequired,
      satisfied_by_records_runtime_events: trust?.records_runtime_events === true,
      runtime_event_refs: runtimeEventRefs,
      satisfied_by_runtime_event_refs: runtimeEventRefs.length > 0,
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

function buildProofRuntimeMetrics(
  admissionReview: FamilyStageAdmissionReview,
  compositionObligations: FamilyStageProofBundleCompositionObligation[],
  runtimeEventRequirements: FamilyStageProofBundleRuntimeEventRequirement[],
  expectedReceiptRefs: FamilyStageProofBundleExpectedReceiptRef[],
  testProofRefs: Array<FamilyStageSurfaceRef & { stage_id: string }>,
): FamilyStageProofBundleRuntimeMetrics {
  const requiredRuntimeEventRequirements = runtimeEventRequirements.filter((requirement) => requirement.required);
  return {
    composition_obligation_count: compositionObligations.length,
    runtime_event_requirement_count: requiredRuntimeEventRequirements.length,
    satisfied_runtime_event_ref_count: requiredRuntimeEventRequirements
      .filter((requirement) => requirement.satisfied_by_runtime_event_refs)
      .reduce((count, requirement) => count + requirement.runtime_event_refs.length, 0),
    expected_receipt_ref_count: expectedReceiptRefs.length,
    test_proof_ref_count: testProofRefs.length,
    blocker_count: admissionReview.summary.blockers_count,
    warning_count: admissionReview.summary.warnings_count,
    authority_boundary: {
      opl_role: 'scheduling_operator_observability_only',
      domain_role: 'truth_quality_receipt_and_artifact_authority',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
      can_accept_or_reject_owner_receipt: false,
      metrics_are_domain_verdict: false,
    },
  };
}

export function buildFamilyStagePackIntegrity(
  plane: FamilyStageControlPlane,
  actionCatalog: FamilyActionCatalog | null,
): FamilyStageProofBundleIntegrity {
  const snapshot = {
    surface_kind: 'opl_stage_pack_contract_snapshot',
    version: 'opl-stage-pack-contract-snapshot.v1',
    plane: {
      plane_id: plane.plane_id,
      target_domain_id: plane.target_domain_id,
      owner: plane.owner,
      authority_boundary: plane.authority_boundary,
      stages: plane.stages.map((stage) => ({
        stage_id: stage.stage_id,
        stage_kind: stage.stage_kind,
        owner: stage.owner,
        domain_stage_refs: stage.domain_stage_refs,
        inputs: stage.inputs,
        outputs: stage.outputs,
        evaluation: stage.evaluation,
        allowed_action_refs: stage.allowed_action_refs,
        handoff: stage.handoff,
        stage_contract: stage.stage_contract,
        trust_boundary: stage.trust_boundary,
        authority_boundary: stage.authority_boundary,
      })),
    },
    action_catalog: actionCatalog
      ? {
          catalog_id: actionCatalog.catalog_id,
          target_domain_id: actionCatalog.target_domain_id,
          owner: actionCatalog.owner,
          actions: actionCatalog.actions.map((action) => ({
            action_id: action.action_id,
            owner: action.owner,
            effect: action.effect,
            input_schema_ref: action.input_schema_ref,
            output_schema_ref: action.output_schema_ref,
            workspace_locator_fields: action.workspace_locator_fields,
            human_gate_ids: action.human_gate_ids,
            authority_boundary: action.authority_boundary,
          })),
        }
      : null,
  };
  const signatureRef = optionalString(plane.authority_boundary.stage_pack_signature_ref);
  const signerRef = optionalString(plane.authority_boundary.stage_pack_signer_ref);
  return {
    surface_kind: 'opl_stage_pack_integrity_metadata',
    version: 'opl-stage-pack-integrity-metadata.v1',
    hash_algorithm: 'sha256',
    stage_pack_hash: crypto.createHash('sha256').update(stableJson(snapshot)).digest('hex'),
    hash_scope: 'family_stage_control_plane_and_action_catalog_contract_refs',
    signature_status: signatureRef || signerRef ? 'signature_ref_declared' : 'unsigned_digest_only',
    signer_ref: signerRef,
    signature_ref: signatureRef,
    authority_boundary: {
      opl_role: 'digest_projection_only',
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_verify_external_signature: false,
    },
  };
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
  const compositionObligations = buildCompositionObligations(plane);
  const expectedReceiptRefs = buildExpectedReceiptRefs(plane, actionCatalog);
  const runtimeEventRequirements = buildRuntimeEventRequirements(plane);
  const testProofRefs = buildTestProofRefs(plane);
  const integrity = buildFamilyStagePackIntegrity(plane, actionCatalog);

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
    composition_obligations: compositionObligations,
    boundary_assumptions: plane.stages.map(readBoundaryAssumptions),
    idempotency_assumptions: plane.stages.map(readIdempotencyAssumptions),
    expected_receipt_refs: expectedReceiptRefs,
    runtime_event_requirements: runtimeEventRequirements,
    test_proof_refs: testProofRefs,
    proof_runtime_metrics: buildProofRuntimeMetrics(
      admissionReview,
      compositionObligations,
      runtimeEventRequirements,
      expectedReceiptRefs,
      testProofRefs,
    ),
    integrity,
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
