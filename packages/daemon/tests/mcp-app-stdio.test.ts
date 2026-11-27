import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { connectTestRpc, createDaemonSandbox, ROOT_OPL_BIN, writeMinimalV2Package } from './helpers/sandbox.ts';

test('the installed CLI serves the interactive shared workbench over MCP stdio', { timeout: 25_000 }, async t => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const title = { 'en-US': 'Inbox', 'zh-CN': '收件箱' };
  const pkg = writeMinimalV2Package(path.join(sandbox.workspaceDir, 'panel'), {
    id: 'shared-panel', intent: 'extension', extraManifest: {
      provides: { contribution_handler: { kind: 'cli', argv: ['node', './handler.mjs'], transport: 'stdin_json_stdout_json' } },
      ui: { declarative: { views: [{ id: 'inbox', view_type: 'list_detail', title, slot: 'workbench.panel', data_ref: 'panel.inbox',
        actions: [{ id: 'edit', label: title, action_ref: 'panel.edit', confirm: true }] }] } },
    },
  });
  fs.writeFileSync(path.join(pkg, 'handler.mjs'), `
    let json = '';
    for await (const chunk of process.stdin) json += chunk;
    const { operation, ref, input } = JSON.parse(json);
    if (input.marker === 'unavailable') {
      console.log(JSON.stringify({ schema_version: 'opl-package-app-contribution-response.v1', ok: false, operation, ref,
        error: { code: 'UNAVAILABLE', message: 'Inbox is unavailable.' } }));
      process.exit(0);
    }
    console.log(JSON.stringify({ schema_version: 'opl-package-app-contribution-response.v1', ok: true, operation, ref, result: { seen: input.marker } }));
  `);
  const link = await sandbox.spawnRootCli(['pack', 'link', pkg, '--no-codex-sync', '--json']);
  assert.equal(link.code, 0, link.stderr);
  const client = new Client({ name: 'opl-workbench-test', version: '1.0.0' });
  const env = Object.fromEntries(Object.entries(sandbox.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [ROOT_OPL_BIN, 'connect', 'mcp-app-stdio'], env }));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['open_opl_apps', 'opl_app_contribution_execute', 'opl_app_contribution_read']);
  const resourceUri = 'ui://opl/apps.html';
  const { contents } = await client.readResource({ uri: resourceUri });
  assert.equal(contents[0]?.mimeType, 'text/html;profile=mcp-app');
  assert.ok('text' in contents[0]! && !String(contents[0].text).includes('/* SCRIPT */'));
  const focus = { package_id: 'shared-panel', view_id: 'inbox' };
  const opened = await client.callTool({ name: 'open_opl_apps', arguments: focus });
  assert.equal(opened.isError, false);
  const catalog = opened.structuredContent?.opl_mcp_app_catalog as { views: Array<{ data_ref: string }>; focus: unknown };
  assert.deepEqual(catalog.focus, focus);
  assert.ok(catalog.views.some(view => view.data_ref === 'panel.inbox'));
  const read = await client.callTool({ name: 'opl_app_contribution_read', arguments: { package_id: 'shared-panel', ref: 'panel.inbox', input: { marker: 'owner' } } });
  assert.equal(read.isError, false);
  assert.deepEqual(read.structuredContent?.result, { seen: 'owner' });
  const failedRead = await client.callTool({ name: 'opl_app_contribution_read', arguments: { package_id: 'shared-panel', ref: 'panel.inbox', input: { marker: 'unavailable' } } });
  assert.equal(failedRead.isError, true);
  assert.deepEqual(failedRead.structuredContent?.error, { code: 'UNAVAILABLE', message: 'Inbox is unavailable.' });
  const edit = { package_id: 'shared-panel', ref: 'panel.edit', input: { marker: 'changed' } };
  const refused = await client.callTool({ name: 'opl_app_contribution_execute', arguments: { ...edit, confirmed: false } });
  assert.equal(refused.isError, true);
  const edited = await client.callTool({ name: 'opl_app_contribution_execute', arguments: { ...edit, confirmed: true } });
  assert.equal(edited.isError, false);
  assert.deepEqual((edited.structuredContent?.result as { result: unknown }).result, { seen: 'changed' });
  const app = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  t.after(() => app.close());
  for (const enabled of [false, true]) {
    await app.call('app.action.execute', { action_id: 'package_app_set_enabled', payload: { package_id: 'shared-panel', enabled }, dry_run: false });
    const toggled = await client.callTool({ name: 'open_opl_apps', arguments: focus });
    assert.equal(toggled.isError, !enabled);
  }
  const missing = await client.callTool({ name: 'open_opl_apps', arguments: { package_id: 'missing', view_id: 'inbox' } });
  assert.equal(missing.isError, true);
  const reader = new Client({ name: 'opl-read-only-workbench-test', version: '1.0.0' });
  await reader.connect(new StdioClientTransport({ command: process.execPath, args: [ROOT_OPL_BIN, 'connect', 'mcp-app-stdio', '--read-only'], env }));
  t.after(() => reader.close());
  assert.deepEqual((await reader.listTools()).tools.map(tool => tool.name).sort(), ['open_opl_apps', 'opl_app_contribution_read']);
  await assert.rejects(reader.callTool({ name: 'opl_app_contribution_execute', arguments: { ...focus, ref: 'panel.edit', confirmed: true } }), /Tool opl_app_contribution_execute not found/);
});
