import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

import { createFakeCodexPluginManagerFixture, repoRoot } from './cli/helpers.ts';
import { formatJsonPayload } from '../../src/kernel/json-file.ts';

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

test('OPL MCP App exposes installed Package views and gates confirmed actions', async () => {
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
  const transport = new StdioClientTransport({
    command: path.join(repoRoot, 'bin', 'opl'),
    args: ['connect', 'mcp-app-stdio'],
    cwd: repoRoot,
    env: {
      ...getDefaultEnvironment(),
      CODEX_HOME: codexHome,
      OPL_CODEX_PLUGIN_BIN: codex.codexPath,
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
    assert.equal(catalog.views.length, 3);
    const fixtureView = catalog.views.find((view: any) => view.package_id === 'mcp-app-fixture');
    assert.equal(fixtureView.view_id, 'review');
    assert.equal(fixtureView.commands[0].confirmation_required, true);
    assert.deepEqual(
      catalog.views.filter((view: any) => view.package_id === 'opl-runtime').map((view: any) => view.view_id),
      ['opl.runtime.work-items', 'opl.runtime.item'],
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
