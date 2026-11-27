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
