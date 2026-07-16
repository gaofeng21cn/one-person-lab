import { loadFamilyManifestFixtures } from '../helpers.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/modules/pack/standard-domain-agent-scaffold-constants.ts';

type JsonRecord = Record<string, unknown>;

export function buildManyStageManifest(stageCount: number) {
  const manifest = structuredClone(loadFamilyManifestFixtures().medautoscience) as JsonRecord;
  manifest.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'summary_stage_control_plane',
    target_domain_id: 'medautoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: Array.from({ length: stageCount }, (_entry, index) => ({
      stage_id: `write_${index}`,
      stage_kind: 'creation',
      title: `Write ${index}`,
      summary: 'Write from explicit refs.',
      goal: 'Produce refs under MAS authority.',
      owner: 'med-autoscience',
      domain_stage_refs: [`write_${index}`],
      inputs: [],
      knowledge_refs: [],
      skills: [],
      prompt_refs: [],
      allowed_action_refs: [],
      outputs: [],
      evaluation: [],
      handoff: null,
      source_refs: [],
      freshness: null,
      action_parity: null,
      stage_contract: {
        requires: ['sources_ready'],
        ensures: ['draft_ready'],
        progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
        typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
        boundary_assumptions: ['domain_truth_remains_domain_owned'],
        properties: [],
        runtime_assumptions: [],
        monitor_refs: [{ ref_kind: 'metric_ref', ref: `metric:write-${index}`, role: 'monitor' }],
        source_scope_refs: [{ ref_kind: 'source_ref', ref: `source:dataset-${index}`, role: 'source_scope' }],
        cohort_query_refs: [{ ref_kind: 'query_ref', ref: `cohort:write-${index}`, role: 'cohort_query' }],
        trigger_refs: [{ ref_kind: 'queue_ref', ref: `queue:write-${index}`, role: 'trigger' }],
        metric_refs: [{ ref_kind: 'metric_ref', ref: `metric:write-${index}`, role: 'metric' }],
        dashboard_metric_refs: [],
        artifact_scope_refs: [],
        workspace_scope_refs: [],
      },
      trust_boundary: {
        lane: 'domain_agent',
        static_check_eligible: true,
        effect_boundary: false,
        records_runtime_events: false,
      },
      authority_boundary: {
        opl_role: 'projection_consumer_only',
        expected_receipt_refs: [`receipt:write-closeout-${index}`],
        can_write_domain_truth: false,
      },
    })),
    notes: [],
  };
  return manifest;
}
