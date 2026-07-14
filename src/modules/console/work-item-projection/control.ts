import type {
  WorkItemBusinessState,
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
  WorkItemVisibilityState,
} from './types.ts';
import { projectLifecycleAction } from './inventory-presentation.ts';
import { withProjectedWorkItemPrimaryState } from './primary-state.ts';

export type WorkItemControlState = Exclude<WorkItemBusinessState, 'unknown' | 'archived'>;

export type WorkItemControlRecord = {
  lifecycle_state: WorkItemControlState | null;
  lifecycle_updated_at: string | null;
  visibility_state: WorkItemVisibilityState;
  visibility_source: 'default' | 'work_item_control_ledger';
  visibility_updated_at: string | null;
  source_ref: string | null;
  generation: number;
};

export type WorkItemControlResolver = (identity: {
  agent_id: string;
  project_id: string;
  work_item_id: string;
}) => WorkItemControlRecord | null;

export function applyWorkItemControlState(input: {
  items: WorkItemProjectionItem[];
  findWorkItemControl?: WorkItemControlResolver;
}) {
  if (!input.findWorkItemControl) {
    return { items: input.items, diagnostics: [] as WorkItemProjectionDiagnostic[] };
  }
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const items = input.items.map((item) => {
    let control: WorkItemControlRecord | null;
    try {
      control = input.findWorkItemControl!({
        agent_id: item.identity.agent_id,
        project_id: item.identity.project_id,
        work_item_id: item.identity.work_item_id,
      });
    } catch (error) {
      diagnostics.push({
        reason: 'work_item_control_ledger_read_failed',
        agent_id: item.identity.agent_id,
        project_id: item.identity.project_id,
        work_item_id: item.identity.work_item_id,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      return item;
    }
    if (!control) return item;
    const visibility = {
      state: control.visibility_state,
      source: control.visibility_source,
      updated_at: control.visibility_updated_at,
      control_ref: control.visibility_source === 'work_item_control_ledger'
        ? control.source_ref
        : null,
      generation: control.generation,
    } satisfies WorkItemProjectionItem['visibility'];
    const sourceRefUsed = control.source_ref
      && (control.lifecycle_state !== null || control.visibility_source === 'work_item_control_ledger')
      ? control.source_ref
      : null;
    const sourceRefs = sourceRefUsed && !item.source_refs.some((entry) => entry.ref === sourceRefUsed)
      ? [
          ...item.source_refs,
          { ref_kind: 'projection' as const, ref: sourceRefUsed, role: 'work_item_control_ledger' },
        ]
      : item.source_refs;
    if (control.lifecycle_state === null) {
      return {
        ...item,
        visibility,
        source_refs: sourceRefs,
      };
    }
    const lifecycleState = control.lifecycle_state;
    const terminal = lifecycleState !== 'active';
    const attention = terminal
      ? {
          kind: 'none' as const,
          reason: 'control_lifecycle_has_no_current_attention',
          owner: null,
          responsible_component: null,
          issue: null,
          impact: null,
          repair_action: null,
          expected_outcome: null,
        }
      : item.attention;
    return withProjectedWorkItemPrimaryState({
      ...item,
      visibility,
      lifecycle: {
        ...item.lifecycle,
        business_state: lifecycleState,
        control_state: lifecycleState,
        current_stage_id: terminal ? null : item.lifecycle.current_stage_id,
        current_stage_display_name: terminal ? null : item.lifecycle.current_stage_display_name,
        current_stage_status: terminal ? null : item.lifecycle.current_stage_status,
        source: 'work_item_control_ledger' as const,
        control_ref: control.source_ref,
        control_updated_at: control.lifecycle_updated_at,
      },
      execution: terminal
        ? {
            ...item.execution,
            state: 'idle',
            stage_id: null,
            stage_status: null,
            current_stage_id: null,
            current_stage_display_name: null,
            next_stage_id: null,
            next_stage_display_name: null,
            started_at: null,
            last_heartbeat_at: null,
            running_proof_status: 'not_applicable',
          }
        : item.execution,
      attention,
      action: projectLifecycleAction({
        businessState: lifecycleState,
        agentId: item.identity.agent_id,
        agentDisplayName: item.identity.agent_display_name,
      }),
      stage_map: terminal
        ? item.stage_map.map((stage) => ({
            ...stage,
            state: stage.state === 'completed'
              ? 'completed'
              : stage.state === 'pending' || stage.state === 'next'
                ? 'pending'
                : lifecycleState === 'delivered_paused'
                  ? 'completed'
                  : 'stopped',
          }))
        : item.stage_map,
      source_refs: sourceRefs,
      freshness: {
        ...item.freshness,
        last_transition_time: control.lifecycle_updated_at ?? item.freshness.last_transition_time,
        reason: 'work_item_control_ledger_overlays_user_collaboration_lifecycle',
      },
    });
  });
  return { items, diagnostics };
}
