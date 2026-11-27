import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { renderArtifact } from '@opl/mcp-app-shared/presentation';
import { acceptDomainRead, type TaskWorkbenchItem } from '@opl/mcp-app-shared/task-workbench';
import type { CatalogCommandDescriptor, McpAppCatalog } from '@opl/mcp-app-shared/types';
import { collectionFrom } from '@opl/mcp-app-shared/view';
import { connectTestRpc, createDaemonSandbox, ROOT_OPL_BIN, writeMinimalV2Package } from './helpers/sandbox.ts';

interface WorkItem {
  item_id: string;
  identity: { work_item_id: string; work_item_kind: string };
}

interface Detail extends TaskWorkbenchItem {
  artifacts?: Array<{ artifact_ref: string; summary: string; media_type: string }>;
  runtime_actions: CatalogCommandDescriptor[];
}

test('Studio opens the selected runtime task over stdio and changes visibility without crossing projects', async t => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const rpc = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  t.after(() => rpc.close());

  const agentId = 'sample-agent';
  const pkg = writeMinimalV2Package(path.join(sandbox.root, agentId), { id: agentId });
  fs.mkdirSync(path.join(pkg, 'contracts'));
  fs.writeFileSync(path.join(pkg, 'contracts', 'domain_descriptor.json'), JSON.stringify({
    surface_kind: 'domain_agent_descriptor', domain_id: 'research', package_id: agentId,
    task_provider: { views: [{
      view_id: 'research-roadmap', view_kind: 'research-roadmap',
      schema_ref: 'contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json',
      source_kind: 'work_item_relative_json', relative_path: 'roadmap.json',
      owner_task_binding: { task_id_pointer: '/study_id', task_ref_pointer: '/study_ref/ref', task_ref_template: 'mas-study:{task_id}' },
    }] },
    standard_agent_interface: {
      version: 'opl_standard_agent_interface.v1',
      inventory_projection: {
        source_kind: 'workspace_relative_json', relative_path: 'index.json', items_pointer: '/items',
        field_map: { work_item_id: 'id', display_name: 'title', work_item_root: 'root' },
      },
    },
  }));
  await rpc.call('pack.link', { dir: pkg, sync_codex: false });
  const workspace = await rpc.call('workspace.init', { root_path: sandbox.workspaceDir }) as { workspace_id: string };
  const task = await rpc.call('runway.task.create', {
    workspace_id: workspace.workspace_id, agent_id: agentId, title: 'Runway analysis', goal_prompt: 'Analyze data',
    auto_start: false,
  }) as { task_id: string };
  const artifact = { path: 'out/report.md', summary: 'Analysis report', media_type: 'text/markdown' };
  await rpc.call('ledger.append', { task_id: task.task_id, entry_kind: 'artifact_ref', owner_id: agentId, payload: artifact });

  // A different project's owner deliberately uses the same unqualified ID.
  const otherRoot = path.join(sandbox.root, 'other-project');
  fs.mkdirSync(path.join(otherRoot, 'study'), { recursive: true });
  fs.writeFileSync(path.join(otherRoot, 'index.json'), JSON.stringify({
    items: [{ id: task.task_id, title: 'Domain work item', root: 'study' }],
  }));
  const roadmap = {
    study_id: task.task_id, study_ref: { ref: 'mas-study:' + task.task_id },
    revision: 4, summary: {}, nodes: [{ id: 'review', label: 'Review', source_refs: [] }], edges: [],
  };
  fs.writeFileSync(path.join(otherRoot, 'study', 'roadmap.json'), JSON.stringify(roadmap));
  await rpc.call('workspace.init', { root_path: otherRoot, domain_id: 'research' });

  const projected = async () => {
    const snapshot = await rpc.call('app.state.get', { profile: 'fast' }) as {
      app_state: { operator: { workbench: { work_item_projection_v2: {
        items: Array<WorkItem & { visibility: { state: string; generation: number } }>;
      } } } };
    };
    return snapshot.app_state.operator.workbench.work_item_projection_v2.items;
  };
  const items = (await projected()).filter(row => row.identity.work_item_id === task.task_id);
  const runway = items.find(row => row.identity.work_item_kind === 'runway_task');
  const domain = items.find(row => row.identity.work_item_kind === 'domain_work_item');
  assert.ok(runway && domain);
  assert.notEqual(runway.item_id, domain.item_id);

  const env = Object.fromEntries(Object.entries(sandbox.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const client = new Client({ name: 'studio-task-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [ROOT_OPL_BIN, 'connect', 'mcp-app-stdio'], env,
  }));
  t.after(() => client.close());

  const packageId = 'opl-runtime';
  const focus = { package_id: packageId, view_id: 'opl.runtime.item', input: { item_id: runway.item_id } };
  const opened = await client.callTool({ name: 'open_opl_apps', arguments: focus });
  assert.equal(opened.isError, false, JSON.stringify(opened.content));
  const catalog = opened.structuredContent?.opl_mcp_app_catalog as McpAppCatalog;
  assert.deepEqual(catalog.focus, focus);
  const view = catalog.views.find(row => row.package_id === packageId && row.view_id === focus.view_id);
  assert.equal(view?.data_ref, 'opl.runtime.v1#item');

  const read = async (ref: string, input: Record<string, unknown> = {}) => {
    const response = await client.callTool({ name: 'opl_app_contribution_read', arguments: { package_id: packageId, ref, input } });
    assert.equal(response.isError, false, JSON.stringify(response.content));
    assert.ok(response.structuredContent?.opl_app_contribution);
    return collectionFrom(response.structuredContent);
  };
  const list = await read('opl.runtime.v1#work-items');
  assert.deepEqual(list.items.map(row => row.item_id).sort(), [domain.item_id, runway.item_id].sort());
  const detail = async (row: WorkItem) => {
    const result = await read(view.data_ref, { item_id: row.item_id });
    const data = result.data.detail as Detail;
    assert.equal(data.item_id, row.item_id);
    return data;
  };
  assert.equal((await read(view.data_ref)).state, 'input_required');
  assert.equal((await read(view.data_ref, { item_id: 'removed-work-item' })).state, 'unavailable');
  assert.equal((await read(view.data_ref, { work_item_id: task.task_id })).state, 'unavailable');
  const domainDetail = await detail(domain);
  assert.deepEqual(domainDetail.artifacts ?? [], []);
  const descriptor = domainDetail.domain_detail_views?.find(view => view.view_id === 'research-roadmap');
  assert.ok(descriptor);
  const domainInput = { item_id: domain.item_id, view_id: descriptor.view_id };
  const first = await read('opl.runtime.v1#domain-detail', domainInput);
  assert.equal(first.state, 'ready');
  const accepted = acceptDomainRead(first.data.detail, domainDetail, descriptor);
  assert.equal(accepted.revision, roadmap.revision);
  assert.deepEqual(accepted.snapshot.nodes, roadmap.nodes);
  const next = await read('opl.runtime.v1#domain-detail', { ...domainInput, if_revision: accepted.revision });
  assert.equal(next.state, 'ready');
  assert.strictEqual(acceptDomainRead(next.data.detail, domainDetail, descriptor, accepted), accepted);
  const runwayDetail = await detail(runway);
  assert.deepEqual(runwayDetail.artifacts?.map(({ artifact_ref, summary, media_type }) => ({ artifact_ref, summary, media_type })), [
    { artifact_ref: artifact.path, summary: artifact.summary, media_type: artifact.media_type },
  ]);
  const openLink = renderArtifact(runwayDetail.artifacts![0]).match(/data-open-link="([^"]+)"/)?.[1];
  assert.ok(openLink, 'The evidence tab must expose the workspace artifact preview.');
  assert.equal(new URL(openLink).searchParams.get('ref'), path.join(fs.realpathSync(sandbox.workspaceDir), artifact.path));

  const applyVisibility = async (selected: Detail, nextState: string, generation: number) => {
    const action = selected.runtime_actions.find(command => command.action_ref === 'work_item_visibility_set');
    assert.ok(action);
    assert.deepEqual(action.input, { item_id: selected.item_id, expected_generation: generation, visibility_state: nextState });
    const executed = await client.callTool({
      name: 'opl_app_contribution_execute',
      arguments: { package_id: packageId, ref: action.action_ref, input: action.input, confirmed: true },
    });
    assert.equal(executed.isError, false, JSON.stringify(executed.content));
    const latest = await projected();
    const selectedState = latest.find(row => row.item_id === selected.item_id)?.visibility;
    assert.equal(selectedState?.state, nextState);
    assert.equal(selectedState?.generation, generation + 1);
    assert.equal(latest.find(row => row.item_id === domain.item_id)?.visibility.generation, 0);
  };
  await applyVisibility(runwayDetail, 'archived', 0);
  await applyVisibility(await detail(runway), 'visible', 1);
});
