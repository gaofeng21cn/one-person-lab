export type RuntimeTrayActionOwner = 'user' | 'opl' | 'infrastructure' | 'none';

export type RuntimeTrayActionKind =
  | 'human_gate'
  | 'handoff_review'
  | 'quality_gate'
  | 'publication_gate'
  | 'infrastructure_timeout'
  | 'infrastructure_recovery'
  | 'running';

export type RuntimeTrayActionCounts = Record<'user' | 'opl' | 'infrastructure', number>;

export type RuntimeTrayActionContext = {
  action_owner: RuntimeTrayActionOwner;
  requires_user_action: boolean;
  action_kind: RuntimeTrayActionKind | null;
  action_summary: string;
};

export function actionContext(
  actionOwner: RuntimeTrayActionOwner,
  actionKind: RuntimeTrayActionKind | null,
  actionSummary: string,
): RuntimeTrayActionContext {
  return {
    action_owner: actionOwner,
    requires_user_action: actionOwner === 'user',
    action_kind: actionKind,
    action_summary: actionSummary,
  };
}

export function runningActionContext(actionSummary = 'The runtime is running; no user action is required.') {
  return actionContext('none', 'running', actionSummary);
}

export function noActionContext(actionSummary = 'No active user or OPL action is required.') {
  return actionContext('none', null, actionSummary);
}

export function actionCountsForItems<T extends { action_owner: RuntimeTrayActionOwner }>(
  items: T[],
): RuntimeTrayActionCounts {
  return items.reduce<RuntimeTrayActionCounts>((counts, item) => {
    if (item.action_owner === 'user' || item.action_owner === 'opl' || item.action_owner === 'infrastructure') {
      counts[item.action_owner] += 1;
    }
    return counts;
  }, { user: 0, opl: 0, infrastructure: 0 });
}

export function hasUserOrInfrastructureAction(actionCounts: RuntimeTrayActionCounts) {
  return actionCounts.user > 0 || actionCounts.infrastructure > 0;
}
