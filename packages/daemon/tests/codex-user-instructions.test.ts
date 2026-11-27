import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { connectTestRpc, createDaemonSandbox } from './helpers/sandbox.ts';

test('a trusted host applies a reviewed Profile to the daemon Codex home with backup and compare-and-swap', async () => {
  const sb = createDaemonSandbox();
  try {
    await sb.spawnDaemonProcess();
    const client = await connectTestRpc(sb.sessionPath, 'opl_cli');
    const external = await connectTestRpc(sb.sessionPath, 'sdk_python');
    const target = path.join(sb.codexHome, 'AGENTS.md');
    const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
    const request = (content: string, expected: string | null) => ({
      action_id: 'codex_user_instructions_set',
      payload: { content, expected_sha256: expected, expected_path: target },
    });
    try {
      await assert.rejects(external.call('app.action.execute', request('host only', null)), /TRUSTED_HOST_REQUIRED/);
      await client.call('app.action.execute', { ...request('template', null), dry_run: true });
      assert.equal(fs.existsSync(target), false);
      const first = await client.call('app.action.execute', request('template', null));
      assert.equal(first.app_action_execution.result.codex_user_instructions_write.readback.sha256, hash('template\n'));
      const updated = await client.call('app.action.execute', request('reviewed', hash('template\n')));
      const write = updated.app_action_execution.result.codex_user_instructions_write;
      assert.equal(write.readback.sha256, hash('reviewed\n'));
      assert.equal(fs.readFileSync(write.backup_path, 'utf8'), 'template\n');
      await assert.rejects(client.call('app.action.execute', request('stale', hash('template\n'))), /REVISION_CONFLICT/);
      const wrongHome = request('wrong', hash('reviewed\n'));
      wrongHome.payload.expected_path = path.join(sb.homeDir, 'AGENTS.md');
      await assert.rejects(client.call('app.action.execute', wrongHome), /REVISION_CONFLICT/);
      assert.equal(fs.readFileSync(target, 'utf8'), 'reviewed\n');
    } finally {
      await external.close();
      await client.close();
    }
  } finally {
    await sb.cleanup();
  }
});
