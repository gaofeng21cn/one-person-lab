import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

import { createFakeCodexPluginManagerFixture, repoRoot } from './cli/helpers.ts';
import { codexNativeReadbackFixture } from './cli/helpers-parts/codex-native-readback-fixture.ts';
import { formatJsonPayload } from '../../src/kernel/json-file.ts';
import { acceptDomainRead, parseResearchSnapshot, parseContributionResearch, renderResearch, renderProgress } from '../../src/mcp-app/task-workbench.js';
import { listOplMcpAppViews, readFrameworkMcpAppTask } from '../../src/read-models/operator/app-mcp-app.ts';

test('task details do not wait for global diagnostics and action inspection preserves the selected task', async () => {
  const item = { item_id: 'canonical', identity: { work_item_id: 'study', work_item_display_name: 'Study' },
    lifecycle: { primary_state: 'paused', primary_state_label: '已暂停' },
    action: {}, source_refs: [], freshness: {} };
  const request = { ref: 'opl.runtime.v1#item', input: { item_id: 'canonical' }, projection: { items: [item] } as any };
  let inspections = 0;
  const inspect = async () => { inspections++; return {}; };
  const data = (result: any) => result.opl_app_contribution.response.result;
  const initial = data(await readFrameworkMcpAppTask(request, inspect));
  assert.equal(inspections, 0);
  assert.equal(initial.data.detail.item_id, 'canonical');
  assert.equal(initial.data.detail.runtime_actions_deferred, true);
  const actions = data(await readFrameworkMcpAppTask({ ...request, input: { ...request.input, include_runtime_actions: true } }, inspect));
  assert.equal(inspections, 1);
  assert.equal(actions.data.detail.item_id, 'canonical');
  assert.equal(actions.data.detail.runtime_actions_deferred, undefined);
  assert.deepEqual(actions.data.detail.runtime_actions, []);
  const failed = data(await readFrameworkMcpAppTask({ ...request, input: { ...request.input, include_runtime_actions: true } },
    async () => { throw new Error('provider unavailable'); }));
  assert.equal(failed.state, 'ready');
  assert.equal(failed.data.detail.item_id, 'canonical');
  assert.equal(failed.data.detail.runtime_actions_unavailable, 'provider unavailable');
  const missing = data(await readFrameworkMcpAppTask({ ...request, input: { item_id: 'other', include_runtime_actions: true } }, inspect));
  assert.equal(missing.state, 'unavailable');
  assert.equal(inspections, 1);
});

test('MCP catalog excludes desktop-only contributions without an owner ABI', () => {
  const descriptor = {
    readiness: { installed: true, physical_status: 'available', callability: 'callable' },
    enabled: true,
    manifest: {
      package_id: 'desktop-only',
      codex_surface: {},
      app_contributions: { views: [{ view_id: 'desktop' }] },
    },
  };
  const catalog = listOplMcpAppViews({
    descriptorDiscovery: { discover: () => new Map([['desktop-only', descriptor as any]]) },
  });
  assert.equal(catalog.views.some(view => view.package_id === 'desktop-only'), false);
});

function writeAppContributionPackage(root: string) {
  const command = path.join(root, 'bin', 'contribution');
  fs.mkdirSync(path.dirname(command), { recursive: true });
  fs.writeFileSync(command, `#!/usr/bin/env node
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  process.stdout.write(JSON.stringify({
    schema_version: 'opl-package-app-contribution-response.v1',
    ok: true,
    ref: request.ref,
    operation: request.operation,
    result: request.operation === 'read'
      ? { state: 'ready', data: { items: [{
          id: 'review-1',
          title: 'Review one',
          summary: 'Current owner record',
          status: 'pending',
          actions: [{ action_ref: 'review.v1#approve', input: { item_id: 'review-1' } }],
        }] } }
      : { ok: true, execution_status: 'completed', receipt: 'receipt-1' },
  }));
});
`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'opl-package.json'), formatJsonPayload({
    surface_kind: 'opl_agent_package_manifest.v1',
    package_id: 'mcp-app-fixture',
    agent_id: 'mcp-app-fixture',
    display_name: 'MCP App Fixture',
    publisher: 'fixture-owner',
    version: '1.0.0',
    source: 'third_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'mcp-app-fixture',
      required_skill_ids: ['mcp-app-fixture'],
      app_contribution_abi: {
        schema_version: 'opl-package-app-contribution-cli.v1',
        transport: 'stdin_json_stdout_json',
        argv: ['./bin/contribution'],
        request_schema: 'opl-package-app-contribution-request.v1',
        response_schema: 'opl-package-app-contribution-response.v1',
      },
    },
    capability_dependencies: [],
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    update_channel: 'manifest_url',
    rollback_ref: 'native-carrier-owned',
    app_contributions: {
      schema_version: 'opl-app-contributions.v1',
      views: [{
        view_id: 'review',
        view_type: 'list_detail',
        title_i18n: { 'zh-CN': '待审核项目', 'en-US': 'Review items' },
        data_ref: 'review.v1#current',
        command_ids: ['review.approve'],
      }],
      commands: [{
        command_id: 'review.approve',
        label_i18n: { 'zh-CN': '批准', 'en-US': 'Approve' },
        action_ref: 'review.v1#approve',
        confirmation_required: true,
      }],
      badges: [],
      ui: [{
        contribution_id: 'review',
        slot: 'settings.section',
        contribution_kind: 'view',
        trust_tier: 'declarative',
        scope: 'root',
        sort_order: 1,
        view_id: 'review',
      }],
    },
  }));
  const marketplace = path.join(root, '.agents', 'plugins');
  fs.mkdirSync(marketplace, { recursive: true });
  fs.writeFileSync(path.join(marketplace, 'marketplace.json'), `${JSON.stringify({
    name: 'mcp-app-fixture',
    plugins: [{ name: 'mcp-app-fixture', source: { source: 'local', path: root } }],
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
  fs.writeFileSync(path.join(root, '.codex-plugin', 'plugin.json'), `${JSON.stringify({
    name: 'mcp-app-fixture',
    version: '1.0.0',
    description: 'MCP App fixture',
  }, null, 2)}\n`);
}

function structured(result: unknown) {
  return (result as { structuredContent?: Record<string, unknown> }).structuredContent || {};
}

test('OPL MCP App starts through a linked launcher, exposes views and gates confirmed actions', async () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mcp-app-stdio-'));
  const packageRoot = path.join(fixtureRoot, 'package');
  fs.mkdirSync(packageRoot, { recursive: true });
  writeAppContributionPackage(packageRoot);
  const codex = createFakeCodexPluginManagerFixture(path.join(fixtureRoot, 'codex'));
  const codexHome = path.join(fixtureRoot, 'codex-home');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), [
    '[marketplaces.mcp-app-fixture]',
    `source = ${JSON.stringify(path.join(packageRoot, '.agents', 'plugins', '..', '..'))}`,
    '',
    '[plugins."mcp-app-fixture@mcp-app-fixture"]',
    'enabled = true',
    '',
  ].join('\n'));
  // Global npm installations link the Framework directory into node_modules.
  const linkedFramework = path.join(fixtureRoot, 'linked-framework');
  fs.symlinkSync(repoRoot, linkedFramework, 'dir');
  const transport = new StdioClientTransport({
    command: path.join(linkedFramework, 'bin', 'opl'),
    args: ['connect', 'mcp-app-stdio'],
    cwd: repoRoot,
    env: {
      ...getDefaultEnvironment(),
      CODEX_HOME: codexHome,
      ...codexNativeReadbackFixture(fixtureRoot, codex.codexPath),
      OPL_STATE_DIR: fixtureRoot,
      OPL_REPO_TEMP_ROOT: fixtureRoot,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'opl-mcp-app-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'open_opl_apps',
      'opl_app_contribution_execute',
      'opl_app_contribution_read',
    ]);
    const open = tools.find((tool) => tool.name === 'open_opl_apps');
    assert.equal((open?._meta as any)?.ui?.resourceUri, 'ui://opl/apps.html');
    assert.equal(open?.annotations?.readOnlyHint, true);
    const opened = structured(await client.callTool({ name: 'open_opl_apps', arguments: {} }));
    const catalog = opened.opl_mcp_app_catalog as any;
    assert.equal(catalog.views.length, 4);
    assert.equal(catalog.product_count, 1);
    assert.deepEqual(catalog.products.map((product: any) => product.package_id), ['mcp-app-fixture']);
    assert.equal(catalog.runtime_view_count, 3);
    assert.equal(catalog.navigation_policy.runtime_views, 'contextual_task_workbench');
    const fixtureView = catalog.views.find((view: any) => view.package_id === 'mcp-app-fixture');
    assert.equal(fixtureView.view_id, 'review');
    assert.equal(fixtureView.presentation_mode, 'shared_view');
    assert.equal(fixtureView.entry_kind, 'product_entry');
    assert.equal(fixtureView.direct_entry, true);
    assert.equal(fixtureView.commands[0].confirmation_required, true);
    const focused = structured(await client.callTool({
      name: 'open_opl_apps',
      arguments: { package_id: 'mcp-app-fixture', view_id: 'review', input: { item_id: 'review-1' } },
    }));
    assert.equal((focused.opl_app_contribution as any).response.result.data.items[0].id, 'review-1');
    assert.equal((focused.opl_mcp_app_catalog as any).focus.view_id, 'review');
    assert.equal((focused.opl_mcp_app_catalog as any).views.length, 4, 'focus preserves navigation to the other declared views');
    assert.equal((await client.callTool({ name: 'open_opl_apps', arguments: { view_id: 'missing' } })).isError, true);
    assert.deepEqual(
      catalog.views.filter((view: any) => view.package_id === 'opl-runtime').map((view: any) => view.view_id),
      ['opl.runtime.work-items', 'opl.runtime.item', 'opl.runtime.knowledge'],
    );
    const resource = await client.readResource({ uri: 'ui://opl/apps.html' });
    const resourceContent = resource.contents[0] as { mimeType?: string; text?: string };
    assert.equal(resourceContent.mimeType, 'text/html;profile=mcp-app');
    assert.match(resourceContent.text || '', /OPL Apps/);
    assert.match(resourceContent.text || '', /opl-apps/);
    const read = structured(await client.callTool({
      name: 'opl_app_contribution_read',
      arguments: { package_id: 'mcp-app-fixture', ref: 'review.v1#current' },
    }));
    assert.equal((read.opl_app_contribution as any).response.result.data.items[0].id, 'review-1');
    const blocked = await client.callTool({
      name: 'opl_app_contribution_execute',
      arguments: {
        package_id: 'mcp-app-fixture',
        ref: 'review.v1#approve',
        input: { item_id: 'review-1' },
        confirmed: false,
      },
    });
    assert.equal(blocked.isError, true);
    const executed = structured(await client.callTool({
      name: 'opl_app_contribution_execute',
      arguments: {
        package_id: 'mcp-app-fixture',
        ref: 'review.v1#approve',
        input: { item_id: 'review-1' },
        confirmed: true,
      },
    }));
    assert.equal((executed.opl_app_contribution as any).response.result.receipt, 'receipt-1');
    const wrongOwner = await client.callTool({
      name: 'opl_app_contribution_read',
      arguments: { package_id: 'mcp-app-fixture', ref: 'opl.runtime.v1#work-items' },
    });
    assert.equal(wrongOwner.isError, true);
    const workItems = structured(await client.callTool({
      name: 'opl_app_contribution_read',
      arguments: {
        package_id: 'opl-runtime',
        ref: 'opl.runtime.v1#work-items',
      },
    }));
    assert.equal((workItems.opl_app_contribution as any).response.result.state, 'ready');
    const detailInput = structured(await client.callTool({
      name: 'opl_app_contribution_read',
      arguments: {
        package_id: 'opl-runtime',
        ref: 'opl.runtime.v1#item',
      },
    }));
    assert.equal(
      (detailInput.opl_app_contribution as any).response.result.state,
      'input_required',
    );
    const runtimeAction = await client.callTool({
      name: 'opl_app_contribution_execute',
      arguments: {
        package_id: 'opl-runtime',
        ref: 'opl.runtime.v1#item',
        confirmed: true,
      },
    });
    assert.equal(runtimeAction.isError, true);
  } finally {
    await client.close();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});


test('shared task workbench binds revisions and scientific evidence to the selected item', () => {
  const node = (id: string, kind: string) => ({ id, kind, label: id, summary: 'Owner narrative', status: 'inconclusive', details: { evidence_judgment: 'Uncertain <evidence>', review_refs: ['review:1'] }, source_refs: [{ kind: 'evidence', ref: 'evidence:1' }] });
  const snapshot = { surface_kind: 'mas_research_trajectory_snapshot', version: 'mas-research-trajectory-snapshot.v2', study_id: 'study', study_ref: { ref: 'mas-study:study' }, revision: 2, summary: { current_judgment: 'Not established' }, nodes: [node('hypothesis', 'hypothesis'), node('finding', 'finding')], edges: [{ id: 'edge', source: 'finding', target: 'hypothesis', kind: 'does_not_support', label: 'Owner negative evidence', source_refs: ['review:1'] }] };
  const item = { item_id: 'canonical', identity: { domain_work_item_id: 'study' } };
  const descriptor = { view_id: 'roadmap', view_kind: 'research-roadmap' };
  const result = { schema_version: 'opl_domain_detail_view.v1', surface_kind: 'opl_domain_detail_view', item_id: 'canonical', view_id: 'roadmap', view_kind: 'research-roadmap', availability: 'available', revision: 2, not_modified: false, payload_schema_ref: 'contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json', payload: snapshot };
  const first = acceptDomainRead(result, item, descriptor, undefined);
  assert.equal(first.snapshot, snapshot);
  assert.equal(acceptDomainRead({ ...result, not_modified: true, payload: null }, item, descriptor, first), first);
  assert.throws(() => acceptDomainRead({ ...result, item_id: 'other' }, item, descriptor, first));
  assert.throws(() => acceptDomainRead({ ...result, revision: 3 }, item, descriptor, first));
  assert.throws(() => acceptDomainRead({ ...result, revision: 1 }, item, descriptor, first));
  assert.throws(() => acceptDomainRead({ ...result, not_modified: true, payload: null }, item, descriptor, undefined));
  assert.throws(() => acceptDomainRead({ ...result, payload_schema_ref: 'unknown' }, item, descriptor, first));
  assert.throws(() => parseResearchSnapshot({ ...snapshot, study_id: 'other' }, 'study'));
  assert.throws(() => parseResearchSnapshot({ ...snapshot, edges: [{ ...snapshot.edges[0], target: 'absent' }] }, 'study'));
  const expected = { agent_id: 'owner', domain_id: 'domain', work_item_id: 'study', domain_work_item_id: 'study', identity_state: 'resolved' };
  const owner = { identity: { ...expected, study_id: 'study' }, trajectory: snapshot };
  assert.equal(parseContributionResearch(owner, expected), snapshot);
  assert.throws(() => parseContributionResearch(owner, { ...expected, work_item_id: 'other' }));
  assert.throws(() => parseContributionResearch(owner, undefined));
  assert.match(renderProgress({}, { current_owner: 'Principal investigator', phase: { stage_id: 'analysis' }, work: { active: [], queued: [{ summary: 'Owner queued validation' }] } }), /Owner queued validation/);
  const html = renderResearch(snapshot, 'hypothesis');
  assert.match(html, /Owner negative evidence/);
  assert.match(html, /Uncertain &lt;evidence&gt;/);
  assert.match(html, /review:1/);
  assert.match(html, /evidence:1/);
  assert.doesNotMatch(renderProgress({ stage_map: [{ state: 'completed', display_name: 'Analysis' }] }), /证据支持/);
});
