import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { connectTestRpc, createDaemonSandbox, writeMinimalV2Package } from './helpers/sandbox.ts';

test('App contribution invokes the declared ref with the owner input only after confirmation', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const rpc = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  t.after(() => rpc.close());
  const label = { 'en-US': 'Review', 'zh-CN': '审阅' };
  const ref = 'review.note';
  const packageId = 'review-app';
  const dir = writeMinimalV2Package(path.join(sandbox.root, packageId), {
    id: packageId, intent: 'app',
    extraManifest: {
      provides: { contribution_handler: { kind: 'cli', argv: ['node', './owner.mjs'] } },
      ui: { declarative: { views: [{
        id: 'review.notes', view_type: 'list_detail', slot: 'workbench.panel',
        title: label, data_ref: 'review.notes.list',
        actions: [{ id: 'review.note', action_ref: ref, label, confirm: true }],
      }], settings_forms: [{
        id: 'review.settings', destination: 'preferences', title: label,
        data_ref: 'review.settings', submit_action_ref: 'review.save',
        actions: [{ id: 'review.publish', label, action_ref: 'review.publish', confirm: true }],
      }] } },
    },
  });
  const marker = path.join(dir, 'invocation.json');
  fs.writeFileSync(path.join(dir, 'owner.mjs'), `
    import fs from 'node:fs';
    const request = JSON.parse(fs.readFileSync(0, 'utf8'));
    fs.writeFileSync('invocation.json', JSON.stringify(request));
    const {ref, input, operation} = request;
    const result = { note_id: input.note };
    const response = { schema_version: 'opl-package-app-contribution-response.v1',
      ok: input.note !== 'reject', ref: input.note === 'wrong' ? 'another.ref' : ref,
      operation, result, error: { code: 'OWNER_REJECT' } };
    console.log(JSON.stringify(response));
  `);
  await rpc.call('pack.link', { dir });
  const payload = { package_id: packageId, ref, input: { note: 'one' } };
  const call = (body: Record<string, unknown>, dry_run = false) => rpc.call('app.action.execute', {
    action_id: 'package_contribution_execute', payload: body, dry_run,
  });
  const preview = await call(payload, true) as { status: string; confirmation_required: boolean };
  assert.equal(preview.status, 'preview');
  assert.equal(preview.confirmation_required, true);
  await assert.rejects(call(payload), /CONFIRMATION_REQUIRED/);
  await assert.rejects(call({ ...payload, confirmed: true, ref: 'another.ref' }), /CONTRIBUTION_ACTION_NOT_FOUND/);
  await assert.rejects(call({ ref, input: {} }), /INVALID_INPUT/);
  const formCommand = { ...payload, ref: 'review.publish' };
  await assert.rejects(call(formCommand), /CONFIRMATION_REQUIRED/);
  assert.equal((await call(formCommand, true) as { confirmation_required: boolean }).confirmation_required, true);
  assert.ok(!fs.existsSync(marker));
  assert.equal((await call({ ...formCommand, confirmed: true }) as { status: string }).status, 'executed');

  const executed = await call({ ...payload, confirmed: true }) as {
    opl_app_contribution: { package_id: string; ref: string; response: { result: { note_id: string } } };
  };
  assert.equal(executed.opl_app_contribution.package_id, packageId);
  assert.equal(executed.opl_app_contribution.ref, ref);
  assert.equal(executed.opl_app_contribution.response.result.note_id, 'one');
  assert.deepEqual(JSON.parse(fs.readFileSync(marker, 'utf8')), {
    schema_version: 'opl-package-app-contribution-request.v1', package_id: packageId,
    operation: 'execute', ref, input: { note: 'one' },
  });
  await assert.rejects(call({ ...payload, confirmed: true, input: { note: 'reject' } }), /CONTRIBUTION_OWNER_REJECTED/);
  await assert.rejects(call({ ...payload, confirmed: true, input: { note: 'wrong' } }), /CONTRIBUTION_RESPONSE_INVALID/);

  const passiveId = 'passive-agent';
  const passive = writeMinimalV2Package(path.join(sandbox.root, passiveId), { id: passiveId });
  await rpc.call('pack.link', { dir: passive });
  await assert.rejects(call({ ...payload, package_id: passiveId, confirmed: true }), /CONTRIBUTION_HANDLER_UNAVAILABLE/);
});

test('Package owner reads and writes use the selected registered workspace across matching local item IDs', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  const { runtime } = await sandbox.startInProcess();
  const label = { 'en-US': 'Review', 'zh-CN': '审阅' };
  const dir = writeMinimalV2Package(path.join(sandbox.root, 'scoped-agent'), {
    id: 'scoped-agent',
    extraManifest: {
      provides: { skills: [{ id: 'scoped-agent', path: './skills/scoped-agent', exposure: 'default' }],
        contribution_handler: { kind: 'esm_module', module: './owner.mjs', export: 'handle' } },
      ui: { declarative: { views: [{
        id: 'scope.notes', view_type: 'list_detail', slot: 'runtime.detail', title: label, data_ref: 'scope.read',
        actions: [{ id: 'scoped.write', label, action_ref: 'scope.write' }],
      }] } },
    },
  });
  fs.mkdirSync(path.join(dir, 'contracts'));
  fs.writeFileSync(path.join(dir, 'contracts/domain_descriptor.json'), JSON.stringify({
    surface_kind: 'domain_agent_descriptor', agent_id: 'scoped-agent', domain_id: 'scope',
    standard_agent_interface: { version: 'opl_standard_agent_interface.v1', inventory_projection: {
      source_kind: 'workspace_relative_json', relative_path: 'inventory.json', items_pointer: '/items',
      field_map: { work_item_id: 'id' },
    } },
  }));
  fs.writeFileSync(path.join(dir, 'owner.mjs'), `
    import fs from 'node:fs';
    import path from 'node:path';
    export function handle({ref, input, operation}) {
      const file = path.join(process.env.OPL_PROFILE_WORKSPACE, 'note');
      if (operation === 'execute') fs.writeFileSync(file, input.note);
      return { schema_version: 'opl-package-app-contribution-response.v1', ok: true, ref, operation,
        result: { note: fs.readFileSync(file, 'utf8') } };
    }
  `);
  const rpc = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  t.after(() => rpc.close());
  await rpc.call('pack.link', { dir });
  const workspaceRoots = ['first', 'second'].map(name => path.join(sandbox.root, name));
  for (const workspace of workspaceRoots) {
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, 'inventory.json'), JSON.stringify({ items: [{ id: 'paper' }] }));
    fs.writeFileSync(path.join(workspace, 'note'), path.basename(workspace));
    await rpc.call('workspace.init', { root_path: workspace, domain_id: 'scope' });
  }
  const items = runtime.appStateCache.getState().app_state.operator.workbench.work_item_projection_v2.items;
  assert.equal(items.length, 2);
  const selected = items.find(({ identity }) => identity.workspace_path === fs.realpathSync(workspaceRoots[1]!))!.identity;
  const { agent_id, domain_id, work_item_id, domain_work_item_id, work_item_scope_id, identity_state } = selected;
  const identity = { agent_id, domain_id, work_item_id, domain_work_item_id, work_item_scope_id, identity_state };
  const read = (input: Record<string, unknown>) => rpc.call('app.contribution.read', {
    package_id: agent_id, ref: 'scope.read', input,
  });
  assert.deepEqual((await read({ work_item_identity: identity }) as { result: unknown }).result, { note: 'second' });
  await assert.rejects(read({ work_item_identity: identity, workspace_path: workspaceRoots[0] }), /CONTRIBUTION_WORKSPACE_MISMATCH/);
  await assert.rejects(read({ work_item_identity: { ...identity, work_item_scope_id: 'gone' } }), /CONTRIBUTION_IDENTITY_UNAVAILABLE/);
  await rpc.call('app.action.execute', { action_id: 'package_contribution_execute', payload: {
    package_id: agent_id, ref: 'scope.write', input: { work_item_identity: identity, note: 'updated' },
  } });
  assert.equal(fs.readFileSync(path.join(workspaceRoots[0]!, 'note'), 'utf8'), 'first');
  assert.equal(fs.readFileSync(path.join(workspaceRoots[1]!, 'note'), 'utf8'), 'updated');
});

test('Python contributions import the bundled SDK and the legacy adapter confines reads and commands', async t => {
  const inheritedPath = '/fixture/pythonpath';
  const sandbox = createDaemonSandbox({ PYTHONPATH: inheritedPath, PYTHONDONTWRITEBYTECODE: '1' });
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const rpc = await connectTestRpc(sandbox.sessionPath);
  t.after(() => rpc.close());
  const label = { 'en-US': 'Review', 'zh-CN': '审阅' };
  const transitional = ['opl', 'app', 'contribution', 'adapter', '--stdin'];
  const python = ['python3', './owner.py'];
  for (const [id, argv] of [['python-owner', python], ['legacy-owner', transitional]] as const) {
    const root = writeMinimalV2Package(path.join(sandbox.root, id), {
      id, intent: 'app',
      extraManifest: {
        provides: { contribution_handler: { kind: 'cli', argv } },
        ui: { declarative: { views: [
          { id: 'owner.view', view_type: 'list_detail', slot: 'runtime.detail', title: label, data_ref: 'owner.read',
            actions: [{ id: 'owner.run', label, action_ref: 'owner.run' }] },
        ] } },
      },
    });
    fs.writeFileSync(path.join(root, 'owner.py'), [
      'import json, os, sys, opl_client',
      'request = json.load(sys.stdin)',
      'print(json.dumps({"sdk": opl_client.__file__, "root": os.environ["OPL_PYTHON_SDK_ROOT"],',
      '  "pythonpath": os.environ["PYTHONPATH"], "request": request}))',
    ].join('\n'));
    const manifestPath = path.join(root, 'app-contribution-adapter.json');
    const writeAdapter = (entry: unknown) => fs.writeFileSync(manifestPath, JSON.stringify({
      schema_version: 'opl-package-app-contribution-adapter.v1',
      reads: { 'owner.read': entry }, actions: { 'owner.run': { kind: 'command', argv: python, stdin: 'input_json' } },
    }));
    writeAdapter({ kind: 'command', argv: python, stdin: 'request_json' });
    await rpc.call('pack.link', { dir: root, sync_codex: false });
    const read = () => rpc.call('app.contribution.read', { package_id: id, ref: 'owner.read', input: { sample: true } }) as Promise<any>;
    const response = await read();
    const observation = response.result ?? response;
    assert.ok(observation.sdk.startsWith(path.join(observation.root, 'src') + path.sep));
    assert.equal(observation.pythonpath, [path.join(observation.root, 'src'), inheritedPath].join(path.delimiter));
    assert.equal(observation.request.ref, 'owner.read');
    if (id === 'python-owner') continue;
    const executed = await rpc.call('app.action.execute', {
      action_id: 'package_contribution_execute', payload: { package_id: id, ref: 'owner.run', input: { sample: true } },
    }) as any;
    assert.deepEqual(executed.opl_app_contribution.response.result.request, { sample: true });
    fs.writeFileSync(path.join(root, 'payload.json'), '{"ready":true}');
    writeAdapter({ kind: 'json_file', root: 'package', path: 'payload.json' });
    assert.deepEqual((await read()).result, { ready: true });
    fs.symlinkSync(path.join(root, 'payload.json'), path.join(root, 'link.json'));
    for (const target of ['../payload.json', '/tmp/payload.json', 'link.json']) {
      writeAdapter({ kind: 'json_file', path: target });
      await assert.rejects(read);
    }
    fs.writeFileSync(path.join(root, 'payload.json'), ' '.repeat(2 * 1024 * 1024 + 1));
    writeAdapter({ kind: 'json_file', path: 'payload.json' });
    await assert.rejects(read, /exceeds its bounds/);
  }
});
