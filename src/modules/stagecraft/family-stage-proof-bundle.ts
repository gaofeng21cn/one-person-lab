import crypto from 'node:crypto';
import type { FamilyActionCatalog } from '../../kernel/family-action-catalog-contract.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { optionalString } from '../../kernel/json-file.ts';
import {
  buildFamilyStageConformanceReview,
} from './family-stage-conformance.ts';
import {
  buildStagePackHumanReviewBurdenBudget,
} from './family-human-review-budget.ts';
import type { FamilyHumanReviewBurdenBudget } from './family-human-review-budget.ts';
import type {
  FamilyStageConformanceFinding,
  FamilyStageFailureLocalization,
  FamilyStageConformanceReview,
  FamilyStageConformanceStageResult,
  FamilyStageConformanceStatus,
} from './family-stage-conformance.ts';
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
  human_review_gate_count: number;
  blocked_human_review_gate_count: number;
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

export type FamilyStageGeneratedArtifactDriftStatus =
  | 'regenerated'
  | 'needs_regeneration'
  | 'missing_source_hash';

export interface FamilyStageGeneratedArtifactRef extends FamilyStageSurfaceRef {
  stage_id: string;
  source_of_truth_kind: 'diagram_stage_pack';
  source_stage_pack_ref: string;
  source_stage_pack_hash: string;
  declared_source_stage_pack_hash: string | null;
  source_graph_projection_ref: string;
  regeneration_policy: 'regenerate_when_source_stage_pack_hash_changes';
  drift_status: FamilyStageGeneratedArtifactDriftStatus;
  drift_reason: string;
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

export interface FamilyStageGeneratedArtifactManifest {
  surface_kind: 'opl_stage_pack_generated_artifact_manifest';
  version: 'opl-stage-pack-generated-artifact-manifest.v1';
  stage_pack_hash: string;
  source_stage_pack_ref: string;
  graph_projection_ref: string;
  source_of_truth: {
    kind: 'diagram_stage_pack';
    diagram_ref: string;
    stage_pack_ref: string;
    stage_pack_hash: string;
    generated_artifacts_are_regenerable_supply_chain_inputs: true;
  };
  generated_code_refs: FamilyStageGeneratedArtifactRef[];
  generated_test_refs: FamilyStageGeneratedArtifactRef[];
  generated_proof_refs: FamilyStageGeneratedArtifactRef[];
  generated_schema_refs: FamilyStageGeneratedArtifactRef[];
  generated_artifact_refs: FamilyStageGeneratedArtifactRef[];
  summary: {
    generated_code_ref_count: number;
    generated_test_ref_count: number;
    generated_proof_ref_count: number;
    generated_schema_ref_count: number;
    generated_artifact_ref_count: number;
    regenerated_ref_count: number;
    needs_regeneration_ref_count: number;
    missing_source_hash_ref_count: number;
    regeneration_required_when_stage_pack_hash_changes: true;
  };
  authority_boundary: {
    opl_role: 'generated_artifact_manifest_projection_only';
    manifest_is_build_review_input: true;
    graphflow_runtime_dependency: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
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
  conformance_status: FamilyStageConformanceStatus;
  conformance_summary: FamilyStageConformanceReview['summary'];
  stage_results: FamilyStageConformanceStageResult[];
  conformance_findings: FamilyStageConformanceFinding[];
  failure_localization: FamilyStageFailureLocalization[];
  composition_obligations: FamilyStageProofBundleCompositionObligation[];
  boundary_assumptions: FamilyStageProofBundleBoundaryAssumption[];
  idempotency_assumptions: FamilyStageProofBundleIdempotencyAssumption[];
  expected_receipt_refs: FamilyStageProofBundleExpectedReceiptRef[];
  human_review_burden_budget: FamilyHumanReviewBurdenBudget;
  runtime_event_requirements: FamilyStageProofBundleRuntimeEventRequirement[];
  test_proof_refs: Array<FamilyStageSurfaceRef & { stage_id: string }>;
  proof_runtime_metrics: FamilyStageProofBundleRuntimeMetrics;
  integrity: FamilyStageProofBundleIntegrity;
  generated_artifact_manifest: FamilyStageGeneratedArtifactManifest;
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
  conformanceReview?: FamilyStageConformanceReview | null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
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

function stageRefMatchesAny(ref: FamilyStageSurfaceRef, needles: string[]) {
  const tokens = [
    ref.ref_kind,
    ref.role,
    ref.label,
    ...(Array.isArray(ref.ref) ? ref.ref : [ref.ref]),
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
  return tokens.some((value) => needles.some((needle) => value.includes(needle)));
}

function stageRefs(stage: FamilyStageDescriptor) {
  return [
    ...stage.inputs,
    ...stage.outputs,
    ...stage.evaluation,
    ...stage.source_refs,
    ...stage.knowledge_refs,
    ...stage.prompt_refs,
    ...stage.skills,
  ].map((ref) => ({
    ...ref,
    stage_id: stage.stage_id,
  }));
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
    const contractRefs = (stage.stage_contract?.expected_receipt_refs ?? []).flatMap((ref) => (
      Array.isArray(ref.ref) ? ref.ref : [ref.ref]
    ))
      .filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
      .map((ref) => ({
        stage_id: stage.stage_id,
        ref,
        reason: 'explicit_stage_contract_expected_receipt_ref',
      }));
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
      && contractRefs.length === 0
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
    return [...contractRefs, ...explicit, ...trustRequired, ...gateRefs];
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

function readDeclaredSourceStagePackHash(ref: FamilyStageSurfaceRef) {
  const record = ref as unknown as JsonRecord;
  return optionalString(record.source_stage_pack_hash)
    ?? optionalString(record.declared_source_stage_pack_hash);
}

function buildGeneratedArtifactRef(
  ref: FamilyStageSurfaceRef & { stage_id: string },
  sourceStagePackRef: string,
  graphProjectionRef: string,
  stagePackHash: string,
): FamilyStageGeneratedArtifactRef {
  const declaredSourceStagePackHash = readDeclaredSourceStagePackHash(ref);
  const driftStatus: FamilyStageGeneratedArtifactDriftStatus = declaredSourceStagePackHash
    ? declaredSourceStagePackHash === stagePackHash
      ? 'regenerated'
      : 'needs_regeneration'
    : 'missing_source_hash';
  const driftReason = driftStatus === 'regenerated'
    ? 'declared_source_stage_pack_hash_matches_current_stage_pack_hash'
    : driftStatus === 'needs_regeneration'
      ? 'declared_source_stage_pack_hash_differs_from_current_stage_pack_hash'
      : 'generated_ref_missing_declared_source_stage_pack_hash';
  return {
    ...ref,
    source_of_truth_kind: 'diagram_stage_pack',
    source_stage_pack_ref: sourceStagePackRef,
    source_stage_pack_hash: stagePackHash,
    declared_source_stage_pack_hash: declaredSourceStagePackHash,
    source_graph_projection_ref: graphProjectionRef,
    regeneration_policy: 'regenerate_when_source_stage_pack_hash_changes',
    drift_status: driftStatus,
    drift_reason: driftReason,
  };
}

function buildProofRuntimeMetrics(
  conformanceReview: FamilyStageConformanceReview,
  compositionObligations: FamilyStageProofBundleCompositionObligation[],
  runtimeEventRequirements: FamilyStageProofBundleRuntimeEventRequirement[],
  expectedReceiptRefs: FamilyStageProofBundleExpectedReceiptRef[],
  humanReviewBurdenBudget: FamilyHumanReviewBurdenBudget,
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
    human_review_gate_count: humanReviewBurdenBudget.summary.gate_count,
    blocked_human_review_gate_count: humanReviewBurdenBudget.summary.blocked_gate_count,
    test_proof_ref_count: testProofRefs.length,
    blocker_count: conformanceReview.summary.nonconformances_count,
    warning_count: conformanceReview.summary.warnings_count,
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

function buildFamilyStageGeneratedArtifactManifest(
  plane: FamilyStageControlPlane,
  integrity: FamilyStageProofBundleIntegrity,
): FamilyStageGeneratedArtifactManifest {
  const refs = plane.stages.flatMap(stageRefs);
  const sourceStagePackRef = `opl://stage-packs/${plane.target_domain_id}/${plane.plane_id}/${integrity.stage_pack_hash}`;
  const graphProjectionRef = `opl://stage-packs/${plane.target_domain_id}/${plane.plane_id}/graphs/${integrity.stage_pack_hash}`;
  const decorateRef = (ref: FamilyStageSurfaceRef & { stage_id: string }) => buildGeneratedArtifactRef(
    ref,
    sourceStagePackRef,
    graphProjectionRef,
    integrity.stage_pack_hash,
  );
  const generatedCodeRefs = refs
    .filter((ref) => stageRefMatchesAny(ref, ['code', 'generated_code', 'source_code']))
    .map(decorateRef);
  const generatedTestRefs = refs
    .filter((ref) => stageRefMatchesAny(ref, ['test', 'evaluation']))
    .map(decorateRef);
  const generatedProofRefs = refs
    .filter((ref) => stageRefMatchesAny(ref, ['proof', 'evidence']))
    .map(decorateRef);
  const generatedSchemaRefs = refs
    .filter((ref) => stageRefMatchesAny(ref, ['schema']))
    .map(decorateRef);
  const generatedArtifactRefs = refs
    .filter((ref) => stageRefMatchesAny(ref, ['artifact']))
    .map(decorateRef);
  const generatedRefs = [
    ...generatedCodeRefs,
    ...generatedTestRefs,
    ...generatedProofRefs,
    ...generatedSchemaRefs,
    ...generatedArtifactRefs,
  ];
  return {
    surface_kind: 'opl_stage_pack_generated_artifact_manifest',
    version: 'opl-stage-pack-generated-artifact-manifest.v1',
    stage_pack_hash: integrity.stage_pack_hash,
    source_stage_pack_ref: sourceStagePackRef,
    graph_projection_ref: graphProjectionRef,
    source_of_truth: {
      kind: 'diagram_stage_pack',
      diagram_ref: graphProjectionRef,
      stage_pack_ref: sourceStagePackRef,
      stage_pack_hash: integrity.stage_pack_hash,
      generated_artifacts_are_regenerable_supply_chain_inputs: true,
    },
    generated_code_refs: generatedCodeRefs,
    generated_test_refs: generatedTestRefs,
    generated_proof_refs: generatedProofRefs,
    generated_schema_refs: generatedSchemaRefs,
    generated_artifact_refs: generatedArtifactRefs,
    summary: {
      generated_code_ref_count: generatedCodeRefs.length,
      generated_test_ref_count: generatedTestRefs.length,
      generated_proof_ref_count: generatedProofRefs.length,
      generated_schema_ref_count: generatedSchemaRefs.length,
      generated_artifact_ref_count: generatedArtifactRefs.length,
      regenerated_ref_count: generatedRefs.filter((ref) => ref.drift_status === 'regenerated').length,
      needs_regeneration_ref_count: generatedRefs.filter((ref) => ref.drift_status === 'needs_regeneration').length,
      missing_source_hash_ref_count: generatedRefs.filter((ref) => ref.drift_status === 'missing_source_hash').length,
      regeneration_required_when_stage_pack_hash_changes: true,
    },
    authority_boundary: {
      opl_role: 'generated_artifact_manifest_projection_only',
      manifest_is_build_review_input: true,
      graphflow_runtime_dependency: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
}

export function buildFamilyStageProofBundle(
  plane: FamilyStageControlPlane,
  options: BuildFamilyStageProofBundleOptions = {},
): FamilyStageProofBundle {
  const actionCatalog = options.actionCatalog ?? null;
  const conformanceReview = options.conformanceReview ?? buildFamilyStageConformanceReview(
    plane,
    actionCatalog ? { family_action_catalog: actionCatalog } : null,
  );
  const proofPassed = conformanceReview.status === 'conformant';
  const compositionObligations = buildCompositionObligations(plane);
  const expectedReceiptRefs = buildExpectedReceiptRefs(plane, actionCatalog);
  const humanReviewBurdenBudget = buildStagePackHumanReviewBurdenBudget(plane, actionCatalog);
  const runtimeEventRequirements = buildRuntimeEventRequirements(plane);
  const testProofRefs = buildTestProofRefs(plane);
  const integrity = buildFamilyStagePackIntegrity(plane, actionCatalog);
  const generatedArtifactManifest = buildFamilyStageGeneratedArtifactManifest(plane, integrity);

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
    conformance_status: conformanceReview.status,
    conformance_summary: conformanceReview.summary,
    stage_results: conformanceReview.stage_results,
    conformance_findings: proofPassed ? [] : conformanceReview.findings,
    failure_localization: conformanceReview.failure_localization,
    composition_obligations: compositionObligations,
    boundary_assumptions: plane.stages.map(readBoundaryAssumptions),
    idempotency_assumptions: plane.stages.map(readIdempotencyAssumptions),
    expected_receipt_refs: expectedReceiptRefs,
    human_review_burden_budget: humanReviewBurdenBudget,
    runtime_event_requirements: runtimeEventRequirements,
    test_proof_refs: testProofRefs,
    proof_runtime_metrics: buildProofRuntimeMetrics(
      conformanceReview,
      compositionObligations,
      runtimeEventRequirements,
      expectedReceiptRefs,
      humanReviewBurdenBudget,
      testProofRefs,
    ),
    integrity,
    generated_artifact_manifest: generatedArtifactManifest,
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
