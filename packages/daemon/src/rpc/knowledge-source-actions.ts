import type { KnowledgeSourceScope, WorkspaceService } from '@opl/workspace';
import { DaemonRpcError } from '../errors.ts';
import { pickString } from '../utils/normalize.ts';

const bindingFields = ['source_id', 'workspace_id', 'root_path', 'scope', 'adapter_kind', 'accepted_revision'];

export const knowledgeSourceActions = [
  { action_id: 'knowledge_source_list', label: 'List knowledge sources', payload_fields: ['workspace_id'], confirmation_required: false },
  { action_id: 'knowledge_source_check', label: 'Check knowledge source', payload_fields: ['source_id'], confirmation_required: false },
  { action_id: 'knowledge_source_connect', label: 'Connect knowledge source', payload_fields: bindingFields, confirmation_required: false },
  { action_id: 'knowledge_source_configure', label: 'Configure knowledge source', payload_fields: bindingFields, confirmation_required: false },
  { action_id: 'knowledge_source_disconnect', label: 'Disconnect knowledge source', payload_fields: ['source_id', 'workspace_id', 'revoke'], confirmation_required: true },
].map(action => ({ ...action, route: 'opld app.action.execute', owner: 'opl-framework', dry_run_supported: false }));

export function projectKnowledgeSources(sources: ReturnType<WorkspaceService['listSources']>) {
  return {
    surface_kind: 'opl_knowledge_sources_projection.v1',
    status: 'available',
    entries: sources.map(source => ({
      ...source,
      available_actions: knowledgeSourceActions.filter(action =>
        ['knowledge_source_check', 'knowledge_source_configure', 'knowledge_source_disconnect'].includes(action.action_id))
        .map(action => ({ ...action, action_ref: 'app_state.actions#' + action.action_id, payload: { source_id: source.source_id } })),
    })),
    available_actions: knowledgeSourceActions,
  };
}

export function executeKnowledgeSourceAction(
  action: typeof knowledgeSourceActions[number], payload: Record<string, unknown>,
  dryRun: boolean, workspace: WorkspaceService,
) {
  if (dryRun || Object.keys(payload).some(key => key !== 'confirmed' && !action.payload_fields.includes(key))) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Unexpected knowledge source parameters.');
  }
  if (action.confirmation_required && payload.confirmed !== true) {
    throw new DaemonRpcError(-32602, 'CONFIRMATION_REQUIRED', 'Confirm this knowledge source change.');
  }
  const sourceId = pickString(payload, 'source_id');
  const workspaceId = pickString(payload, 'workspace_id');
  let result;
  if (action.action_id === 'knowledge_source_list') {
    result = { resource_sources: projectKnowledgeSources(workspace.listSources(workspaceId)) };
  } else if (action.action_id === 'knowledge_source_connect' || action.action_id === 'knowledge_source_configure') {
    const existing = sourceId && action.action_id === 'knowledge_source_configure' ? workspace.getSource(sourceId) : undefined;
    const rawScope = pickString(payload, 'scope') ?? existing?.scope;
    const scope: KnowledgeSourceScope | undefined = rawScope === undefined ? undefined
      : rawScope === 'project_local' || rawScope === 'personal_profile' || rawScope === 'long_term_topic'
        ? rawScope : undefined;
    if (rawScope !== undefined && scope === undefined) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Invalid knowledge source scope.');
    }
    const input = {
      source_id: sourceId, workspace_id: workspaceId, scope,
      root_path: pickString(payload, 'root_path') ?? existing?.root_path ?? '',
      adapter_kind: pickString(payload, 'adapter_kind') ?? existing?.adapter_kind,
      accepted_revision: pickString(payload, 'accepted_revision') ?? existing?.accepted_revision ?? undefined,
    };
    result = { source: workspace.bindSource(input) };
  } else if (!sourceId) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Expected source_id.');
  } else if (action.action_id === 'knowledge_source_check') {
    result = { source: workspace.getSource(sourceId) };
  } else {
    if (payload.revoke !== undefined && typeof payload.revoke !== 'boolean') {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Expected a boolean revoke flag.');
    }
    result = workspace.removeSource({ source_id: sourceId, workspace_id: workspaceId, revoke: payload.revoke });
  }
  return { ok: true, status: 'executed', app_action_execution: {
    surface_kind: 'opl_app_action_execution.v1', action_id: action.action_id, dry_run: false, result,
  } };
}
