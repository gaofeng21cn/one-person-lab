import type { JsonRecord } from '../../../kernel/json-record.ts';
import {
  actionContext,
  noActionContext,
  runningActionContext,
} from '../runtime-tray-action.ts';
import type { RuntimeTrayItem } from '../runtime-tray-snapshot-types.ts';
import type { WorkItemProjectionItem, WorkItemProjectionV2 } from './types.ts';

function legacyPrimaryState(item: WorkItemProjectionItem) {
  switch (item.lifecycle.primary_state) {
    case 'automatically_advancing': return 'in_progress';
    case 'awaiting_user_decision': return 'owner_decision_required';
    case 'system_attention': return 'system_attention_required';
    case 'delivered_auto_paused': return 'delivered_auto_paused';
    case 'paused':
    case 'stopped':
    case 'sync_pending':
      return 'paused_waiting_for_direction';
  }
}

function actionFor(item: WorkItemProjectionItem, summary: string) {
  if (item.execution.state === 'running') return runningActionContext(summary);
  if (item.attention.kind === 'user') return actionContext('user', 'human_gate', summary);
  if (item.attention.kind === 'system') return actionContext('opl', 'handoff_review', summary);
  return noActionContext(summary);
}

function nextStep(item: WorkItemProjectionItem) {
  if (item.attention.kind === 'system') return item.attention.repair_action!;
  if (item.attention.kind === 'user') return 'Waiting for the user decision recorded by the domain lifecycle.';
  if (item.execution.state === 'running') return `Continue ${item.execution.stage_id ?? 'the current stage'}.`;
  if (item.lifecycle.business_state === 'delivered_paused') return 'No automatic task is running after delivery.';
  if (['paused', 'stopped', 'archived'].includes(item.lifecycle.business_state)) {
    return 'No automatic task will start until the collaboration lifecycle changes.';
  }
  return `The Agent may continue from ${item.lifecycle.current_stage_id ?? 'the next declared stage'}.`;
}

function legacyUsage(observation: WorkItemProjectionItem['telemetry']['current_stage']) {
  return {
    telemetry_status: observation.state,
    missing_reason: observation.missing_reason,
    token_status: observation.state === 'observed' ? 'observed' : 'missing',
    token_missing_reason: observation.missing_reason,
    input_tokens_observed: observation.input_tokens,
    output_tokens_observed: observation.output_tokens,
    total_tokens_observed: observation.total_tokens,
    estimated_cost_usd_observed: null,
    duration_ms_observed: null,
    api_call_count_observed: null,
    source_ref_count: observation.source_refs.length,
  };
}

export function projectWorkItemRuntimeActivityItems(projection: WorkItemProjectionV2) {
  return projection.items
    .filter((item) => item.visibility.state === 'visible')
    .map((item): RuntimeTrayItem & JsonRecord => {
      const summary = nextStep(item);
      const action = actionFor(item, summary);
      const lane = item.execution.state === 'running'
        ? 'running'
        : item.attention.kind === 'none'
          ? 'recent'
          : 'attention';
      return {
        item_id: item.item_id,
        project_id: item.identity.domain_id,
        project_label: item.identity.project_display_name,
        project_display_name: item.identity.project_display_name,
        lane,
        title: item.identity.work_item_display_name,
        status: item.execution.state === 'idle' ? item.lifecycle.business_state : item.execution.state,
        status_label: item.lifecycle.business_state,
        summary,
        updated_at: item.freshness.last_transition_time,
        command: null,
        workspace_path: item.identity.workspace_path,
        workspace_binding_id: item.identity.workspace_binding_id,
        workspace_binding_status: projection.project_catalog.find(
          (project) => project.project_id === item.identity.project_id,
        )?.binding_status ?? null,
        workspace_binding_active: projection.project_catalog.find(
          (project) => project.project_id === item.identity.project_id,
        )?.binding_status === 'active',
        workspace_label: item.identity.project_display_name,
        workspace_scope_id: `workspace:${item.identity.workspace_binding_id}`,
        project_scope_id: item.identity.project_scope_id,
        agent_scope_id: `agent:${item.identity.agent_id}`,
        task_scope_id: item.identity.work_item_scope_id,
        runtime_owner: 'provider_backed_family_runtime',
        domain_owner: item.identity.domain_id,
        source_refs: item.source_refs,
        ...action,
        next_action_summary: summary,
        work_unit_id: item.identity.work_item_id,
        work_item_id: item.identity.work_item_id,
        work_item_kind: item.identity.source_kind,
        work_item_display_name: item.identity.work_item_display_name,
        study_id: item.identity.work_item_kind === 'study' ? item.identity.work_item_id : null,
        active_run_id: item.execution.workflow_id,
        active_stage_id: item.execution.stage_id ?? item.lifecycle.current_stage_id,
        active_stage_label: item.execution.stage_id ?? item.lifecycle.current_stage_id,
        health_status: item.execution.state,
        stage_started_at: item.execution.started_at,
        last_heartbeat_at: item.execution.last_heartbeat_at,
        running_proof_status: item.execution.running_proof_status,
        running_proof_summary: item.execution.diagnostic_reason,
        current_stage_usage: legacyUsage(item.telemetry.current_stage),
        task_total_usage: {
          ...legacyUsage(item.telemetry.cumulative),
          observed_attempt_count: item.execution.attempt_ids.length > 0 ? item.execution.attempt_ids.length : null,
        },
        usage_telemetry_status: item.telemetry.state,
        usage_telemetry_missing_reason: item.telemetry.missing_reason,
        blockers: item.attention.kind === 'system' ? [item.attention.issue!] : [],
        runtime_blocker_summary: item.execution.state === 'failed' ? item.execution.diagnostic_reason : null,
        typed_blocker_summary: null,
        typed_blocker_owner: null,
        resolution_route: item.attention.repair_action,
        stage_attempt_ids: item.execution.attempt_ids,
        runtime_readback_source: 'work_item_projection_v2',
        runtime_attempt_status: item.execution.stage_status,
        runtime_attention_demoted_to_diagnostic: item.execution.state === 'failed' && item.attention.kind === 'none',
        runtime_closeout_observed: item.execution.state === 'succeeded',
        runtime_closeout_refs: [],
        provider_kind: item.execution.provider_kind,
        workflow_id: item.execution.workflow_id,
        business_primary_state: legacyPrimaryState(item),
        business_status: item.lifecycle.raw_business_status,
        business_state: item.lifecycle.business_state,
        authority_boundary: projection.authority_boundary,
      };
    });
}
