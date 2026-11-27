import path from 'node:path';
import type {
  AppStateSnapshotLike, CatalogCommandDescriptor, CatalogViewDescriptor,
  OpldRpcTransport, RuntimeWorkItem,
} from './types.ts';

export const RUNTIME_PACKAGE_ID = 'opl-runtime';
export const RUNTIME_DOMAIN_DETAIL_REF = 'opl.runtime.v1#domain-detail';
const LIST_REF = 'opl.runtime.v1#work-items';
const DETAIL_REF = 'opl.runtime.v1#item';
const VISIBILITY_ACTION = 'work_item_visibility_set';

function workItems(state: AppStateSnapshotLike) {
  return state.app_state?.operator?.workbench?.work_item_projection_v2?.items;
}

export function runtimeViews(state: AppStateSnapshotLike): CatalogViewDescriptor[] {
  if (!workItems(state)) return [];
  const shared = {
    package_id: RUNTIME_PACKAGE_ID, package_name: 'OPL Runtime',
    entry_kind: 'runtime_view', slot: 'runtime.detail', commands: [],
  };
  return [
    { ...shared, view_id: 'opl.runtime.work-items', view_type: 'task_board', scope: 'root',
      data_ref: LIST_REF, title_i18n: { 'zh-CN': '当前任务', 'en-US': 'Current work' } },
    { ...shared, view_id: 'opl.runtime.item', view_type: 'list_detail', scope: 'work_item',
      data_ref: DETAIL_REF, title_i18n: { 'zh-CN': '任务详情', 'en-US': 'Work item detail' } },
  ];
}

function readResult(ref: string, result: Record<string, unknown>) {
  return { opl_app_contribution: {
    surface_kind: 'opl_app_package_contribution.v1',
    package_id: RUNTIME_PACKAGE_ID, ref, operation: 'read', confirmation_required: false,
    carrier_readback: { kind: 'framework_owned_projection', identity: 'opl-apps', lifecycle_authority: 'framework_owned' },
    readiness: { installed: true, physical_status: 'available', callability: 'callable' },
    response: { schema_version: 'opl-package-app-contribution-response.v1', ok: true, ref, operation: 'read', result },
  } };
}

function listItem(item: RuntimeWorkItem) {
  return {
    id: item.item_id, item_id: item.item_id, title: item.identity.work_item_display_name,
    summary: item.lifecycle.primary_state_label, status: item.lifecycle.primary_state,
    agent_id: item.identity.agent_id, project_id: item.identity.project_id,
    work_item_id: item.identity.work_item_id, workspace_path: item.identity.workspace_path,
    work_item_root: item.identity.work_item_root, work_item_identity: item.identity,
  };
}

function visibilityActions(item: RuntimeWorkItem): CatalogCommandDescriptor[] {
  const { state, generation } = item.visibility;
  if ((state !== 'visible' && state !== 'archived') || !Number.isSafeInteger(generation)) return [];
  const archive = state === 'visible';
  return [{
    command_id: VISIBILITY_ACTION, action_ref: VISIBILITY_ACTION, confirmation_required: true,
    label_i18n: archive
      ? { 'zh-CN': '归档任务', 'en-US': 'Archive task' }
      : { 'zh-CN': '恢复任务', 'en-US': 'Restore task' },
    input: { item_id: item.item_id, expected_generation: generation, visibility_state: archive ? 'archived' : 'visible' },
  }];
}

async function runwayArtifacts(transport: OpldRpcTransport, item: RuntimeWorkItem) {
  const { work_item_id: taskId, workspace_path: workspace } = item.identity;
  const ledger = await transport.call<{
    task_id: string;
    artifacts: { task_id: string; payload: { path: string; artifact_id?: string; media_type?: string; summary?: string } }[];
  }>('ledger.artifacts', { task_id: taskId });
  if (ledger.task_id !== taskId) throw new Error('Artifact readback belongs to a different task.');
  return ledger.artifacts.filter(entry => entry.task_id === taskId).map(({ payload }) => ({
    artifact_ref: payload.path, path: path.join(workspace, payload.path), title: payload.artifact_id || payload.path,
    summary: payload.summary, media_type: payload.media_type,
  }));
}

export async function readRuntimeView(
  transport: OpldRpcTransport, ref: string, input: Record<string, unknown>,
) {
  if (ref === RUNTIME_DOMAIN_DETAIL_REF) {
    const { item_id, view_id, if_revision } = input;
    if (typeof item_id !== 'string' || !item_id || typeof view_id !== 'string' || !view_id) {
      return readResult(ref, { state: 'input_required', reason: '请选择任务及其详情视图。', input_schema: {
        type: 'object', required: ['item_id', 'view_id'],
        properties: { item_id: { type: 'string' }, view_id: { type: 'string' } },
      } });
    }
    const detail = await transport.call<Record<string, unknown>>('app.domainDetail.get', {
      item_id, view_id, ...(if_revision !== undefined && { if_revision }),
    });
    if (detail.item_id !== item_id || detail.view_id !== view_id) throw new Error('Domain detail belongs to a different task or view.');
    return readResult(ref, { state: detail.availability === 'available' ? 'ready' : 'unavailable',
      reason: detail.availability === 'available' ? null : detail.availability, data: { detail } });
  }
  if (ref !== LIST_REF && ref !== DETAIL_REF) throw new Error('Unknown Framework task view.');
  const state = await transport.call<AppStateSnapshotLike>('app.state.get', { profile: ref === LIST_REF ? 'fast' : 'full' });
  const items = workItems(state);
  if (!items) return readResult(ref, { state: 'unavailable', reason: 'work_item_projection_unavailable' });
  if (ref === LIST_REF) {
    return readResult(ref, { state: 'ready', data: {
      items: items.filter(item => item.visibility.state === 'visible').map(listItem),
    } });
  }
  const itemId = typeof input.item_id === 'string' ? input.item_id.trim() : '';
  const workId = typeof input.work_item_id === 'string' ? input.work_item_id.trim() : '';
  if (!itemId && !workId) {
    return readResult(ref, { state: 'input_required', reason: '请选择需要查看的任务。', input_schema: {
      type: 'object', required: ['item_id'], properties: { item_id: { type: 'string', title: '任务 ID' } },
    } });
  }
  const matches = items.filter(item => itemId ? item.item_id === itemId : item.identity.work_item_id === workId);
  if (matches.length !== 1) {
    return readResult(ref, { state: 'unavailable', reason: matches.length ? 'work_item_ambiguous' : 'work_item_not_found',
      data: { items: [], match_count: matches.length } });
  }
  const item = matches[0]!;
  const detail = { ...item, runtime_actions: visibilityActions(item),
    ...(item.identity.work_item_kind === 'runway_task' && { artifacts: await runwayArtifacts(transport, item) }),
  };
  return readResult(ref, { state: 'ready', data: { items: [listItem(item)], detail } });
}

export async function executeRuntimeAction(
  transport: OpldRpcTransport, actionId: string, input: Record<string, unknown>, confirmed: boolean, dryRun: boolean,
) {
  if (actionId !== VISIBILITY_ACTION) throw new Error('Unknown Framework task action.');
  const state = await transport.call<AppStateSnapshotLike>('app.state.get', { profile: 'fast' });
  const items = workItems(state)?.filter(item => item.item_id === input.item_id);
  if (items?.length !== 1) throw new Error('Cannot resolve the selected task.');
  const { agent_id, project_id, work_item_id } = items[0]!.identity;
  return transport.call<Record<string, unknown>>('app.action.execute', { action_id: VISIBILITY_ACTION, dry_run: dryRun,
    payload: { agent_id, project_id, work_item_id, confirmed,
      expected_generation: input.expected_generation, visibility_state: input.visibility_state },
  });
}
