import assert from 'node:assert/strict';
import { test } from 'node:test';

import { executeFrameworkMcpAppAction, OPL_RUNTIME_ACTION_REF, runtimeActionsForItem } from '../../src/read-models/operator/app-mcp-runtime-actions.ts';
import { readFrameworkMcpAppContribution, OPL_RUNTIME_REFS } from '../../src/read-models/operator/app-mcp-app.ts';
import type { WorkItemProjectionItem, WorkItemProjectionV2 } from '../../src/read-models/operator/work-item-projection/types.ts';
import type { FrameworkContracts } from '../../src/kernel/types.ts';

const item = {
  item_id: 'item-a',
  identity: { agent_id: 'agent-a', domain_id: 'domain-a', project_id: 'project-a',
    work_item_id: 'work-a', work_item_scope_id: 'scope-a', work_item_display_name: 'Draft',
    agent_display_name: 'Writer', domain_work_item_id: 'work-a', identity_state: 'resolved' },
  visibility: { state: 'visible' },
  execution: { attempt_id: 'attempt-a', attempt_ids: ['attempt-a'] },
  lifecycle: { primary_state: 'running', primary_state_label: 'Running' },
  action: { action_ref: 'owner-next', title: 'Next step' },
  source_refs: [],
} as unknown as WorkItemProjectionItem;
const projection = { items: [item] } as unknown as WorkItemProjectionV2;
const route = {
  action_id: 'action:attempt-a:provider-resume:0',
  action_kind: 'provider_signal:resume', owner: 'provider',
  route_target_kind: 'provider_signal', execution_policy: 'opl_safe_action_shell',
  stage_attempt_id: 'attempt-a', domain_id: 'domain-a', stage_id: 'draft', ref: 'resume:current',
};
function snapshot(routes: Array<Record<string, unknown>> = [route]) {
  return { runtime_tray_snapshot: { app_operator_drilldown: {
    operator_action_routing_refs: { refs: routes },
    app_execution_bridge: { safe_action_routes: routes.map(entry => ({ ...entry, can_submit_to_safe_action_shell: true })) },
  } } };
}

function services(currentSnapshot = snapshot()) {
  const calls: string[][] = [];
  return { calls, contracts: {} as FrameworkContracts,
    runtimeSnapshotProvider: async () => currentSnapshot,
    projectionProvider: () => projection,
    familyRuntime: async (args: string[]) => {
      calls.push(args);
      return { stage_attempt: { stage_attempt_id: 'attempt-a', workflow_id: 'workflow-a' } };
    },
  };
}

test('runtime item exposes only current safe routes for its exact attempt', () => {
  const other = { ...route, action_id: 'other', stage_attempt_id: 'attempt-b' };
  const domainWide = { ...route, action_id: 'domain-wide', stage_attempt_id: '' };
  const current = snapshot([route, other, domainWide]);
  const actions = runtimeActionsForItem(item, current.runtime_tray_snapshot);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].input.item_id, item.item_id);
  assert.equal(actions[0].action_ref, OPL_RUNTIME_ACTION_REF);
  const read = readFrameworkMcpAppContribution({
    ref: OPL_RUNTIME_REFS.item, input: { item_id: item.item_id }, projection,
    runtimeSnapshot: current.runtime_tray_snapshot,
  });
  assert.equal((read.opl_app_contribution.response.result.data as any).detail.runtime_actions.length, 1);
});

test('runtime action confirms current route, delegates to existing provider and preserves durable result', async () => {
  const action = runtimeActionsForItem(item, snapshot().runtime_tray_snapshot)[0];
  const owner = services();
  const result = await executeFrameworkMcpAppAction({
    ref: OPL_RUNTIME_ACTION_REF, input: { ...action.input, payload: { reason: 'continue' } }, confirmed: true,
  }, owner as any);
  assert.equal(owner.calls.length, 1);
  assert.deepEqual(owner.calls[0].slice(0, 5), ['attempt', 'signal', 'attempt-a', '--kind', 'resume']);
  const executed = result.opl_app_contribution.response.result as any;
  assert.equal(executed.execution_status, 'executed');
  assert.equal(executed.runtime_operator_action_execution.execution.result.stage_attempt.workflow_id, 'workflow-a');
});

test('stale confirmation, missing confirmation and cross-item routes never dispatch', async () => {
  const action = runtimeActionsForItem(item, snapshot().runtime_tray_snapshot)[0];
  for (const [current, confirmed, target] of [
    [snapshot([{ ...route, ref: 'resume:replaced' }]), true, item.item_id],
    [snapshot(), false, item.item_id],
    [snapshot(), true, 'another-item'],
    [snapshot([{ ...route, stage_attempt_id: 'attempt-b' }]), true, item.item_id],
  ] as const) {
    const owner = services(current);
    await assert.rejects(executeFrameworkMcpAppAction({
      ref: OPL_RUNTIME_ACTION_REF, input: { ...action.input, item_id: target }, confirmed,
    }, owner as any));
    assert.equal(owner.calls.length, 0);
  }
});

test('unavailable safe route is not offered or dispatched', async () => {
  const action = runtimeActionsForItem(item, snapshot().runtime_tray_snapshot)[0];
  const blocked = snapshot();
  blocked.runtime_tray_snapshot.app_operator_drilldown.app_execution_bridge.safe_action_routes[0].can_submit_to_safe_action_shell = false;
  assert.deepEqual(runtimeActionsForItem(item, blocked.runtime_tray_snapshot), []);
  const owner = services(blocked);
  await assert.rejects(executeFrameworkMcpAppAction({ ref: OPL_RUNTIME_ACTION_REF, input: action.input, confirmed: true }, owner as any));
  assert.equal(owner.calls.length, 0);
});

test('owner-declared start reuses existing runtime and observation timestamps do not invalidate consent', async () => {
  const start = { ...route, action_id: 'owner-next', action_kind: 'stage_production_attempt_start',
    owner: 'opl', route_target_kind: 'opl_cli', stage_attempt_id: '',
    opl_cli_args: ['attempt', 'start', 'attempt-a'], ref: 'opl family-runtime attempt start attempt-a' };
  const action = runtimeActionsForItem(item, snapshot([start]).runtime_tray_snapshot)[0];
  const owner = services(snapshot([{ ...start, observed_at: 'later', open_reason: 'Updated observation' }]));
  await executeFrameworkMcpAppAction({ ref: OPL_RUNTIME_ACTION_REF, input: action.input, confirmed: true }, owner as any);
  assert.deepEqual(owner.calls, [['attempt', 'start', 'attempt-a']]);
});

test('a failed response after dispatch requires readback and never automatically retries', async () => {
  const action = runtimeActionsForItem(item, snapshot().runtime_tray_snapshot)[0];
  const owner = services();
  let dispatches = 0;
  owner.familyRuntime = async () => { dispatches += 1; throw new Error('transport ended'); };
  await assert.rejects(executeFrameworkMcpAppAction({
    ref: OPL_RUNTIME_ACTION_REF, input: action.input, confirmed: true,
  }, owner as any), (error: any) => error.details.dispatch_status === 'unknown_after_dispatch');
  assert.equal(dispatches, 1);
});
