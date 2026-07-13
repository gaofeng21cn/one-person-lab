import type {
  WorkItemBusinessState,
  WorkItemProjectionDiagnostic,
  WorkItemProjectionItem,
} from './types.ts';

export type WorkItemControlState = Exclude<WorkItemBusinessState, 'unknown'>;

export type WorkItemControlRecord = {
  state: WorkItemControlState;
  updated_at: string | null;
  source_ref: string | null;
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
    return {
      ...item,
      lifecycle: {
        ...item.lifecycle,
        business_state: control.state,
        control_state: control.state,
        source: 'work_item_control_ledger' as const,
        control_ref: control.source_ref,
        control_updated_at: control.updated_at,
      },
      source_refs: control.source_ref
        ? [
            ...item.source_refs,
            { ref_kind: 'projection' as const, ref: control.source_ref, role: 'work_item_control_ledger' },
          ]
        : item.source_refs,
      freshness: {
        ...item.freshness,
        last_transition_time: control.updated_at ?? item.freshness.last_transition_time,
        reason: 'work_item_control_ledger_overlays_user_collaboration_lifecycle',
      },
    };
  });
  return { items, diagnostics };
}
