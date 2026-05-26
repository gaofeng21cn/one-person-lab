import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function codexAppRuntimeEvidencePayloadTemplate() {
  return {
    temporal_hosted_long_soak_refs: [],
    provider_state_linkage_refs: [],
    operator_evidence_refs: [],
    typed_blocker_refs: [],
  };
}

function codexAppRuntimeEvidencePayloadRefHints() {
  return {
    temporal_hosted_long_soak_refs_should_cover: [
      'temporal_hosted_long_soak_ref',
      'provider_worker_soak_ref',
      'codex_app_operator_soak_ref',
    ],
    provider_state_linkage_refs_should_cover: [
      'provider_state_linkage_ref',
      'provider_cadence_receipt_ref',
      'provider_slo_receipt_ref',
    ],
    operator_evidence_refs_should_cover: [
      'operator_window_manifest_ref',
      'app_operator_event_log_ref',
    ],
    typed_blocker_refs_should_cover: [
      'typed_blocker_ref',
    ],
  };
}

function codexAppRuntimeEvidenceObservationCommands() {
  return {
    start: [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '<version>',
      '--minimum-duration-minutes',
      '<n>',
      '--evidence-dir',
      '<path>',
    ],
    event: [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'event',
      '--workorder-file',
      '<path>',
      '--event-kind',
      '<kind>',
      '--evidence-ref',
      '<ref>',
    ],
    finish: [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'finish',
      '--workorder-file',
      '<path>',
    ],
  };
}

function buildCodexAppRuntimeEvidenceFollowthrough(authorityBoundary: JsonRecord) {
  const gateId = 'temporal_hosted_long_soak_refs';
  return {
    surface_kind: 'opl_app_drilldown_codex_app_production_evidence_followthrough',
    owner: 'one-person-lab',
    target_surface: 'codex_app_runtime_role',
    status: 'long_soak_gate_open',
    runtime_policy: 'opl_temporal_hosted_autonomous',
    long_running_task_driver_owner: 'one-person-lab',
    long_running_task_driver_substrate: 'temporal',
    production_long_soak_claimed: false,
    production_evidence_gate_remains_open: true,
    gate_count: 1,
    open_gate_count: 1,
    open_gate_ids: [gateId],
    refs_observed_for_all_gates: false,
    attention_required: true,
    gate_items: [{
      gate_id: gateId,
      status: 'missing_temporal_hosted_long_soak_refs',
      required_refs_any_of: [
        'temporal_hosted_long_soak_ref',
        'provider_worker_soak_ref',
        'codex_app_operator_soak_ref',
        'typed_blocker_ref',
      ],
      observed_refs: [],
      observed_ref_count: 0,
      current_contract_status: 'not_claimed_by_contract',
      full_detail_section: 'codex_app_runtime_role',
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_close_domain_ready: false,
        can_close_long_soak: false,
        can_claim_production_ready: false,
        can_drive_long_running_task_loop: false,
      },
    }],
    required_return_shapes: [
      'temporal_hosted_long_soak_ref',
      'provider_state_linkage_ref',
      'operator_evidence_ref',
      'typed_blocker_ref',
    ],
    payload_owner: 'app_live_operator_or_opl_provider_owner',
    payload_template: codexAppRuntimeEvidencePayloadTemplate(),
    payload_ref_hints: codexAppRuntimeEvidencePayloadRefHints(),
    payload_template_policy:
      'template_is_empty_by_design_replace_with_real_temporal_hosted_long_soak_or_typed_blocker_refs_before_submit',
    payload_workorder: {
      surface_kind: 'opl_codex_app_runtime_evidence_payload_workorder',
      workorder_policy:
        'operator_must_choose_temporal_hosted_long_soak_refs_path_or_provider_owner_typed_blocker_path_empty_template_blocks',
      payload_owner: 'app_live_operator_or_opl_provider_owner',
      accepted_payload_path_policy:
        'real_temporal_hosted_long_soak_refs_or_typed_blocker_path_empty_template_blocks',
      accepted_payload_paths: {
        temporal_hosted_long_soak_refs_path: {
          required_any_operator_payload_refs: [
            'temporal_hosted_long_soak_refs',
            'provider_state_linkage_refs',
            'operator_evidence_refs',
          ],
          typed_blocker_refs_must_be_absent: true,
          closes_long_soak: false,
          closes_production_ready: false,
        },
        typed_blocker_path: {
          required_operator_payload_refs: ['typed_blocker_refs'],
          success_claimed: false,
          closes_long_soak: false,
          closes_production_ready: false,
        },
      },
      required_operator_payload_refs: [
        'temporal_hosted_long_soak_refs',
        'provider_state_linkage_refs',
        'operator_evidence_refs',
        'typed_blocker_refs',
      ],
      required_return_shapes: [
        'temporal_hosted_long_soak_ref',
        'provider_state_linkage_ref',
        'operator_evidence_ref',
        'typed_blocker_ref',
      ],
      payload_template: codexAppRuntimeEvidencePayloadTemplate(),
      payload_ref_hints: codexAppRuntimeEvidencePayloadRefHints(),
      observation_workorder_commands: codexAppRuntimeEvidenceObservationCommands(),
      observation_workorder_policy:
        'start_event_finish_materializes_local_operator_soak_manifest_only_dedicated_intake_or_provider_owner_followthrough_remains_required',
      empty_payload_template_is_success_evidence: false,
      authority_boundary: {
        refs_only: true,
        can_write_domain_truth: false,
        can_write_memory_body: false,
        can_read_memory_body: false,
        can_read_artifact_body: false,
        can_mutate_artifact_body: false,
        can_authorize_quality_or_export: false,
        can_create_owner_receipt: false,
        can_generate_typed_blocker: false,
        can_close_domain_ready: false,
        can_close_long_soak: false,
        can_claim_production_ready: false,
        can_drive_long_running_task_loop: false,
      },
    },
    observation_workorder_commands: codexAppRuntimeEvidenceObservationCommands(),
    observation_workorder_policy:
      'app_operator_observation_path_only_temporal_long_soak_refs_still_require_dedicated_refs_only_intake_provider_owner_followthrough_or_typed_blocker',
    empty_payload_template_is_success_evidence: false,
    authority_boundary: {
      ...authorityBoundary,
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_close_domain_ready: false,
      can_claim_domain_ready: false,
      can_close_long_soak: false,
      can_claim_production_ready: false,
      can_drive_long_running_task_loop: false,
    },
  };
}

export function buildCodexAppRuntimeRole() {
  const authorityBoundary = {
    ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
    can_claim_production_ready: false,
    can_claim_domain_ready: false,
    can_close_long_soak: false,
    can_create_owner_receipt: false,
    can_drive_long_running_task_loop: false,
  };
  return {
    surface_kind: 'opl_app_drilldown_codex_app_runtime_role',
    runtime_policy: 'opl_temporal_hosted_autonomous',
    projection_policy:
      'app_start_observe_intervene_display_only_provider_runs_long_tasks',
    codex_app_roles: [
      'start',
      'observe',
      'intervene',
      'display',
    ],
    codex_app_drives_long_running_tasks: false,
    long_running_task_driver_owner: 'one-person-lab',
    long_running_task_driver_substrate: 'temporal',
    default_stage_executor: 'codex_cli',
    domain_agent_internal_daemon_allowed: false,
    domain_agent_internal_scheduler_allowed: false,
    domain_agent_internal_attempt_loop_allowed: false,
    production_long_soak_claimed: false,
    production_evidence_gate_remains_open: true,
    production_evidence_followthrough:
      buildCodexAppRuntimeEvidenceFollowthrough(authorityBoundary),
    authority_boundary: authorityBoundary,
  };
}

export function codexAppRuntimeEvidenceNextStep(runtimeRole: JsonRecord) {
  const followthrough = record(runtimeRole.production_evidence_followthrough);
  const openGateCount = numberValue(followthrough.open_gate_count);
  return {
    step_kind: 'codex_app_runtime_evidence_followthrough',
    owner: stringValue(followthrough.owner) ?? 'one-person-lab',
    target_surface: stringValue(followthrough.target_surface) ?? 'codex_app_runtime_role',
    status: stringValue(followthrough.status),
    runtime_policy: stringValue(followthrough.runtime_policy),
    long_running_task_driver_owner: stringValue(followthrough.long_running_task_driver_owner),
    long_running_task_driver_substrate:
      stringValue(followthrough.long_running_task_driver_substrate),
    production_long_soak_claimed: followthrough.production_long_soak_claimed === true,
    production_evidence_gate_remains_open:
      followthrough.production_evidence_gate_remains_open === true,
    open_gate_count: openGateCount,
    open_gate_ids: stringList(followthrough.open_gate_ids),
    required_refs_by_gate: Array.isArray(followthrough.gate_items)
      ? followthrough.gate_items.filter(isRecord).map((gate) => ({
          gate_id: stringValue(gate.gate_id),
          status: stringValue(gate.status),
          required_refs_any_of: stringList(gate.required_refs_any_of),
          observed_ref_count: numberValue(gate.observed_ref_count),
          current_contract_status: stringValue(gate.current_contract_status),
        }))
      : [],
    required_return_shapes: stringList(followthrough.required_return_shapes),
    payload_owner: stringValue(followthrough.payload_owner)
      ?? 'app_live_operator_or_opl_provider_owner',
    payload_template: openGateCount > 0 ? record(followthrough.payload_template) : null,
    payload_ref_hints: openGateCount > 0 ? record(followthrough.payload_ref_hints) : null,
    payload_workorder: openGateCount > 0 ? record(followthrough.payload_workorder) : null,
    payload_template_policy: openGateCount > 0
      ? stringValue(followthrough.payload_template_policy)
      : null,
    observation_workorder_commands: record(followthrough.observation_workorder_commands),
    observation_workorder_policy: stringValue(followthrough.observation_workorder_policy),
    empty_payload_template_is_success_evidence:
      followthrough.empty_payload_template_is_success_evidence === true,
    full_detail_section: 'codex_app_runtime_role',
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_close_long_soak: false,
    can_claim_production_ready: false,
    can_authorize_quality_or_export: false,
  };
}
