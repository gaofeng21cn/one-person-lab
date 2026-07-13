import crypto from 'node:crypto';
import { isRecord } from '../../kernel/contract-validation.ts';

import type { FamilyStageAssumptionLifecycleProjection } from './family-stage-assumption-lifecycle.ts';
import type { FamilyStageCohortLoopProjection } from './family-stage-cohort-loop.ts';
import type { FamilyStageControlPlane } from './family-stage-control-plane-contract.ts';
import type { FamilyStageGraphProjection } from './family-stage-control-plane.ts';
import type { FamilyStagePackRegistryProjection } from './family-stage-pack-registry.ts';
import type { FamilyStageProofBundle } from './family-stage-proof-bundle.ts';
import type { FamilyStageReplayCertification } from './family-stage-replay-certification.ts';

export interface FamilyStagePackSourceSpecProjection {
  surface_kind: 'opl_family_stage_pack_source_spec';
  version: 'family-stage-pack-source-spec.v1';
  stage_pack_id: string;
  target_domain_id: string;
  plane_id: string;
  stage_pack_hash: string;
  source_spec_hash: string;
  review_mode: 'diffable_refs_only_visual_equivalent_spec';
  diff_keys: {
    stage_pack_hash: string;
    stage_ids: string[];
    action_catalog_id: string | null;
    conformance_status: string;
    graph_node_count: number;
    graph_edge_count: number;
    registry_lifecycle_statuses: string[];
    registry_lifecycle_refs: string[];
    replay_status: string;
    replay_evidence_refs: string[];
    assumption_blocker_count: number;
    cohort_blocker_count: number;
  };
  source_refs: {
    control_plane_ref: string;
    proof_bundle_ref: string;
    graph_projection_ref: string;
    registry_ref: string;
    replay_certification_ref: string;
    assumption_lifecycle_ref: string;
    cohort_loop_ref: string;
    action_catalog_ref: string | null;
  };
  review_summary: {
    stage_count: number;
    runtime_event_requirement_count: number;
    expected_receipt_ref_count: number;
    registry_entry_count: number;
    replay_blocker_count: number;
    assumption_blocker_count: number;
    cohort_blocker_count: number;
    visual_equivalent: true;
    body_free: true;
  };
  body_policy: {
    includes_control_plane_body: false;
    includes_proof_bundle_body: false;
    includes_graph_body: false;
    includes_registry_body: false;
    includes_artifact_body: false;
    executes_stage: false;
  };
  authority_boundary: {
    opl_role: 'stage_pack_source_spec_projection_only';
    human_operator_review_input: true;
    visual_equivalent_spec: true;
    stores_body_payloads: false;
    can_execute_stage: false;
    can_write_domain_truth: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
  };
}

export interface BuildFamilyStagePackSourceSpecInput {
  plane: FamilyStageControlPlane;
  proofBundle: FamilyStageProofBundle;
  graphProjection: FamilyStageGraphProjection;
  registryProjection: FamilyStagePackRegistryProjection;
  replayCertification: FamilyStageReplayCertification;
  assumptionLifecycle: FamilyStageAssumptionLifecycleProjection;
  cohortLoop: FamilyStageCohortLoopProjection;
}

function stagePackBaseRef(proofBundle: FamilyStageProofBundle) {
  return `opl://stage-packs/${proofBundle.identity.stage_pack_id}`;
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

function sourceSpecHash(value: Omit<FamilyStagePackSourceSpecProjection, 'source_spec_hash'>) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function registryLifecycleRefs(input: FamilyStagePackRegistryProjection) {
  return uniqueStrings(input.entries.flatMap((entry) => [
    entry.library_lifecycle.promotion_ref,
    entry.library_lifecycle.deprecation_ref,
    entry.library_lifecycle.supersession_ref,
    entry.library_lifecycle.superseded_by_stage_pack_ref,
    ...entry.library_lifecycle.reused_by_refs,
  ].filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)));
}

function replayEvidenceRefs(input: FamilyStageReplayCertification) {
  return uniqueStrings(input.stage_results.flatMap((stage) => [
    ...stage.recorded_runtime_event_refs,
    ...stage.recorded_receipt_refs,
  ]));
}

export function buildFamilyStagePackSourceSpecProjection(
  input: BuildFamilyStagePackSourceSpecInput,
): FamilyStagePackSourceSpecProjection {
  const baseRef = stagePackBaseRef(input.proofBundle);
  const hash = input.proofBundle.integrity.stage_pack_hash;
  const projectionWithoutSourceHash: Omit<FamilyStagePackSourceSpecProjection, 'source_spec_hash'> = {
    surface_kind: 'opl_family_stage_pack_source_spec',
    version: 'family-stage-pack-source-spec.v1',
    stage_pack_id: input.proofBundle.identity.stage_pack_id,
    target_domain_id: input.proofBundle.identity.target_domain_id,
    plane_id: input.proofBundle.identity.plane_id,
    stage_pack_hash: hash,
    review_mode: 'diffable_refs_only_visual_equivalent_spec',
    diff_keys: {
      stage_pack_hash: hash,
      stage_ids: input.proofBundle.identity.stage_ids,
      action_catalog_id: input.proofBundle.identity.action_catalog_id,
      conformance_status: input.proofBundle.conformance_status,
      graph_node_count: input.graphProjection.graph_summary.node_count,
      graph_edge_count: input.graphProjection.graph_summary.edge_count,
      registry_lifecycle_statuses: [
        ...new Set(input.registryProjection.entries.map((entry) => entry.library_lifecycle.status)),
      ],
      registry_lifecycle_refs: registryLifecycleRefs(input.registryProjection),
      replay_status: input.replayCertification.replay_status,
      replay_evidence_refs: replayEvidenceRefs(input.replayCertification),
      assumption_blocker_count: input.assumptionLifecycle.summary.blocker_count,
      cohort_blocker_count: input.cohortLoop.summary.blocker_count,
    },
    source_refs: {
      control_plane_ref: `${baseRef}/control-plane/${hash}`,
      proof_bundle_ref: `${baseRef}/proof-bundles/${hash}`,
      graph_projection_ref: `${baseRef}/graphs/${hash}`,
      registry_ref: `${baseRef}/registry/${hash}`,
      replay_certification_ref: `${baseRef}/replay-certification/${hash}`,
      assumption_lifecycle_ref: `${baseRef}/assumptions/${hash}`,
      cohort_loop_ref: `${baseRef}/cohort-loop/${hash}`,
      action_catalog_ref: input.proofBundle.identity.action_catalog_id
        ? `opl://action-catalogs/${input.proofBundle.identity.action_catalog_id}`
        : null,
    },
    review_summary: {
      stage_count: input.proofBundle.identity.stage_ids.length,
      runtime_event_requirement_count: input.proofBundle.proof_runtime_metrics.runtime_event_requirement_count,
      expected_receipt_ref_count: input.proofBundle.proof_runtime_metrics.expected_receipt_ref_count,
      registry_entry_count: input.registryProjection.summary.entry_count,
      replay_blocker_count: input.replayCertification.summary.blocker_count,
      assumption_blocker_count: input.assumptionLifecycle.summary.blocker_count,
      cohort_blocker_count: input.cohortLoop.summary.blocker_count,
      visual_equivalent: true,
      body_free: true,
    },
    body_policy: {
      includes_control_plane_body: false,
      includes_proof_bundle_body: false,
      includes_graph_body: false,
      includes_registry_body: false,
      includes_artifact_body: false,
      executes_stage: false,
    },
    authority_boundary: {
      opl_role: 'stage_pack_source_spec_projection_only',
      human_operator_review_input: true,
      visual_equivalent_spec: true,
      stores_body_payloads: false,
      can_execute_stage: false,
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_mutate_artifact_body: false,
    },
  };
  return {
    ...projectionWithoutSourceHash,
    source_spec_hash: sourceSpecHash(projectionWithoutSourceHash),
  };
}
