import { STANDARD_PROGRESS_DELTA_POLICY, STANDARD_TYPED_BLOCKER_LINEAGE_POLICY } from '../../../../src/modules/foundry-lab/standard-domain-agent-scaffold-constants.ts';
import { buildManifestCommand, repoRoot, runCli } from '../helpers.ts';

export type JsonRecord = Record<string, unknown>;

export function attachManifestSurface(payload: JsonRecord, field: string, value: JsonRecord) {
  if (payload.product_entry_manifest && typeof payload.product_entry_manifest === 'object') {
    return {
      ...payload,
      product_entry_manifest: {
        ...(payload.product_entry_manifest as JsonRecord),
        [field]: value,
      },
    };
  }
  return { ...payload, [field]: value };
}

export function bindManifest(
  project: string,
  manifest: JsonRecord,
  env: Record<string, string>,
  workspacePath = repoRoot,
) {
  return runCli([
    'workspace', 'bind',
    '--project', project,
    '--path', workspacePath,
    '--manifest-command', buildManifestCommand(manifest),
  ], env);
}

export function findDomainManifest(output: JsonRecord, projectId: string): any {
  return ((output.domain_manifests as JsonRecord).projects as JsonRecord[])
    .find((entry) => entry.project_id === projectId);
}

export function standardProgressFirstPolicies() {
  return {
    progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
    typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
  };
}

export function buildAdmittedActionCatalog(
  targetDomainId: string,
  owner: string,
  options: { stage2HumanGate?: boolean } = {},
) {
  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_action_catalog`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    actions: Array.from({ length: 6 }, (_entry, index) => ({
      action_id: `stage_${index + 1}_action`,
      title: `Stage ${index + 1} action`,
      summary: `Project stage ${index + 1} action metadata.`,
      owner,
      effect: 'read_only',
      source_command: { command: `${owner} stage-${index + 1}`, surface_kind: 'domain_cli' },
      input_schema_ref: `schemas/stage-${index + 1}.input.json`,
      output_schema_ref: `schemas/stage-${index + 1}.output.json`,
      workspace_locator_fields: ['workspace_root'],
      human_gate_ids: options.stage2HumanGate && index === 1 ? ['publication_quality_gate'] : [],
      supported_surfaces: { cli: null, mcp: null, skill: null, product_entry: null, openai: null, ai_sdk: null },
      authority_boundary: { opl_role: 'projection_consumer_only' },
    })),
    notes: [],
  };
}

export function buildAdmittedStagePlane(
  targetDomainId: string,
  owner: string,
  options: { replayEvidenceRefs?: boolean } = {},
) {
  return {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: `${targetDomainId.replace(/[^a-z0-9]+/gi, '_')}_stage_control_plane`,
    target_domain_id: targetDomainId,
    owner,
    authority_boundary: { opl_role: 'projection_consumer_only' },
    replay_evidence_refs: options.replayEvidenceRefs ? [
      { ref_kind: 'append_only_event_log_ref', ref: `event-log:${targetDomainId}/stages`, role: 'append_only_event_log_ref' },
      { ref_kind: 'attempt_ledger_ref', ref: `attempt-ledger:opl/${targetDomainId}`, role: 'attempt_ledger_ref' },
      { ref_kind: 'stage_manifest_ref', ref: `stage-manifest:${targetDomainId}/stages`, role: 'stage_manifest_ref' },
      { ref_kind: 'current_pointer_ref', ref: `current-pointer:${targetDomainId}/stages`, role: 'current_pointer_ref' },
      { ref_kind: 'owner_answer_binding_ref', ref: `owner-answer-binding:${targetDomainId}/stages`, role: 'owner_answer_binding_ref' },
    ] : [],
    stages: Array.from({ length: 6 }, (_entry, index) => {
      const stageNumber = index + 1;
      return {
        stage_id: `stage_${stageNumber}`,
        stage_kind: 'creation',
        title: `Stage ${stageNumber}`,
        summary: `Runtime-enforced stage ${stageNumber} descriptor.`,
        goal: `Expose stage ${stageNumber} as admitted runtime projection metadata.`,
        owner,
        domain_stage_refs: [`domain_stage_${stageNumber}`],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [`stage_${stageNumber}_action`],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: [`stage_${stageNumber}_input_ready`],
          ensures: [`stage_${stageNumber}_receipt_ready`],
          boundary_assumptions: ['domain_truth_remains_domain_owned'],
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
          ...standardProgressFirstPolicies(),
          expected_receipt_refs: [{ ref_kind: 'receipt_ref', ref: `owner_receipt:stage_${stageNumber}`, role: 'domain_owner_receipt_ref' }],
          replay_evidence_refs: options.replayEvidenceRefs
            ? [
                { role: 'recorded_runtime_event_ref', ref: `runtime_event:${targetDomainId}.stage_${stageNumber}` },
                { ref_kind: 'receipt_ref', role: 'domain_owner_receipt_ref', ref: `owner_receipt:stage_${stageNumber}` },
              ]
            : [],
          properties: [],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'json_pointer', ref: `/runtime_inventory/stage_${stageNumber}`, role: 'runtime_assumption_monitor' }],
          source_scope_refs: [{ ref_kind: 'json_pointer', ref: `/source_scope/stage_${stageNumber}`, role: 'launch_source_scope' }],
          cohort_query_refs: [{ ref_kind: 'json_pointer', ref: `/cohort_query/stage_${stageNumber}`, role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: `queue:${targetDomainId}/stage_${stageNumber}`, role: 'launch_trigger' }],
          dashboard_metric_refs: [{ ref_kind: 'metric_ref', ref: `metric:${targetDomainId}.stage_${stageNumber}`, role: 'operator_metric' }],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent', static_check_eligible: false, effect_boundary: false,
          runtime_guard_required: true, records_runtime_events: true,
          runtime_event_refs: [`runtime_event:${targetDomainId}.stage_${stageNumber}`],
        },
        authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
      };
    }),
    notes: [],
  };
}

export function withAdmittedStagePack(
  payload: JsonRecord,
  targetDomainId: string,
  owner: string,
  options: { replayEvidenceRefs?: boolean; stage2HumanGate?: boolean } = {},
) {
  return attachManifestSurface(
    attachManifestSurface(payload, 'family_action_catalog', buildAdmittedActionCatalog(targetDomainId, owner, options)),
    'family_stage_control_plane',
    buildAdmittedStagePlane(targetDomainId, owner, options),
  );
}

export function withReplayEvidenceStagePack(
  payload: JsonRecord,
  targetDomainId: string,
  owner: string,
  options: { stage2HumanGate?: boolean } = {},
) {
  return withAdmittedStagePack(payload, targetDomainId, owner, { ...options, replayEvidenceRefs: true });
}
