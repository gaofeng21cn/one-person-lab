import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { waitForCodexStartupProbe } from '@opl/runway';
import { createDaemonSandbox } from './helpers/sandbox.ts';

test('sandbox teardown waits for the Codex startup probe before removing its logs', { skip: process.platform === 'win32' }, async t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-probe-'));
  const executable = path.join(fixture, 'codex');
  const completed = path.join(fixture, 'completed');
  fs.writeFileSync(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
setTimeout(() => {
  const logs = process.env.OPL_STUB_LOG_DIR;
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(path.join(logs, 'probe.log'), 'observed');
  fs.writeFileSync(${JSON.stringify(completed)}, 'complete');
  console.log('codex-cli 0.171.0');
}, 200);
`, { mode: 0o700 });

  const sandbox = createDaemonSandbox({ OPL_CODEX_BIN: executable });
  t.after(async () => {
    await waitForCodexStartupProbe(sandbox.env);
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(sandbox.root, { recursive: true, force: true });
  });
  await sandbox.startInProcess();
  await sandbox.cleanup();
  assert.ok(fs.existsSync(completed), 'Codex startup probe must have finished writing');
  assert.equal(fs.existsSync(sandbox.root), false);
});
