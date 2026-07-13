import type { WorkItemPrimaryState, WorkItemProjectionItem } from './types.ts';

type PrimaryStateProjection = Pick<
  WorkItemProjectionItem['lifecycle'],
  'primary_state' | 'primary_state_label' | 'primary_state_reason' | 'reason' | 'last_transition_at'
>;

const PRIMARY_STATE_LABELS: Record<WorkItemPrimaryState, string> = {
  automatically_advancing: '自动推进中',
  awaiting_user_decision: '等待你决定',
  system_attention: '系统处理中',
  delivered_auto_paused: '已交付自动暂停',
  paused: '已暂停',
  stopped: '已停止',
  sync_pending: '状态待同步',
};

function hasCompleteSystemResponsibility(attention: WorkItemProjectionItem['attention']) {
  return Boolean(
    attention.responsible_component
      && attention.issue
      && attention.impact
      && attention.repair_action
      && attention.expected_outcome
  );
}

function lifecyclePrimaryState(
  businessState: WorkItemProjectionItem['lifecycle']['business_state'],
): Pick<PrimaryStateProjection, 'primary_state' | 'primary_state_reason'> {
  switch (businessState) {
    case 'active':
      return { primary_state: 'automatically_advancing', primary_state_reason: 'user_visible_progress_advancing' };
    case 'delivered_paused':
      return { primary_state: 'delivered_auto_paused', primary_state_reason: 'latest_result_delivered' };
    case 'paused':
      return { primary_state: 'paused', primary_state_reason: 'paused_until_new_direction' };
    case 'stopped':
      return { primary_state: 'stopped', primary_state_reason: 'collaboration_lifecycle_stopped' };
    case 'archived':
      return { primary_state: 'stopped', primary_state_reason: 'collaboration_lifecycle_archived' };
    case 'unknown':
      return { primary_state: 'sync_pending', primary_state_reason: 'unknown_business_state' };
  }
}

export function projectWorkItemPrimaryState(input: {
  businessState: WorkItemProjectionItem['lifecycle']['business_state'];
  attention: WorkItemProjectionItem['attention'];
  lastTransitionAt: string;
}): PrimaryStateProjection {
  const lifecycleProjected = lifecyclePrimaryState(input.businessState);
  const lifecycleIsTerminal = input.businessState !== 'active' && input.businessState !== 'unknown';
  const projected = lifecycleIsTerminal
    ? lifecycleProjected
    : input.attention.kind === 'system' && hasCompleteSystemResponsibility(input.attention)
    ? {
        primary_state: 'system_attention' as const,
        primary_state_reason: input.attention.reason || 'system_or_runtime_attention_required',
      }
    : input.attention.kind === 'user'
      ? {
          primary_state: 'awaiting_user_decision' as const,
          primary_state_reason: input.attention.reason || 'owner_or_user_input_required',
        }
      : lifecycleProjected;

  return {
      ...projected,
      primary_state_label: PRIMARY_STATE_LABELS[projected.primary_state],
      reason: projected.primary_state_reason,
      last_transition_at: input.lastTransitionAt,
  };
}

export function withProjectedWorkItemPrimaryState(item: WorkItemProjectionItem): WorkItemProjectionItem {
  return {
    ...item,
    lifecycle: {
      ...item.lifecycle,
      ...projectWorkItemPrimaryState({
        businessState: item.lifecycle.business_state,
        attention: item.attention,
        lastTransitionAt: item.freshness.last_transition_time,
      }),
    },
  };
}
