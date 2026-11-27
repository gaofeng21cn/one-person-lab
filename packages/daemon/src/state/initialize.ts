import { resolveCodexBinary } from '@opl/runway';
import { readWorkspaceRoot } from './workspace-root.ts';

function coreCheck(itemId: string, label: string, ready: boolean, reason: string, step: string) {
  return {
    item_id: itemId,
    label,
    status: ready ? 'ready' : 'attention_needed',
    required: true,
    readiness_layer: 'core_launch',
    blocking: !ready,
    severity: ready ? 'info' : 'blocking',
    user_action_required: !ready,
    reason_code: ready ? null : reason,
    next_visible_step: ready ? null : step,
    detail_summary: ready ? label : step,
  };
}

export function readSystemInitialize(stateDir: string, modelAccessReady: boolean) {
  const workspace = readWorkspaceRoot(stateDir);
  let codexReady: boolean;
  try {
    codexReady = resolveCodexBinary() !== null;
  } catch {
    // An explicit but stale executable affects the local assistant only.
    codexReady = false;
  }
  const checklist = [
    coreCheck('workspace_root', 'Working directory', workspace.exists && workspace.writable, 'workspace_unavailable', 'Choose an accessible working directory.'),
    coreCheck('codex', 'Local assistant', codexReady, 'codex_unavailable', 'Set up the local assistant.'),
    coreCheck('codex_config', 'Model access', modelAccessReady, 'model_access_missing', 'Sign in or configure a model provider.'),
  ];
  const blocking = checklist.filter(item => item.blocking).map(item => item.item_id);
  const ready = blocking.length === 0;
  return {
    surface_id: 'opl_system_initialize',
    overall_state: ready ? 'core_ready' : 'attention_needed',
    setup_flow: {
      is_first_run: workspace.source === 'default_home' && !ready,
      phase: ready ? 'review' : blocking[0] === 'workspace_root' ? 'workspace_root' : 'environment',
      ready_to_launch: ready,
      progress: {
        ready_required_count: checklist.length - blocking.length,
        total_required_count: checklist.length,
      },
      blocking_items: blocking,
      maintenance_items: [],
    },
    readiness: { core_ready: ready, launch_ready: ready },
    checklist,
  };
}
