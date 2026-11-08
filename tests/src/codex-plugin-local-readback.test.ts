import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readCodexLocalPluginList } from '../../src/adapters/integration/agent-package-registry-parts/codex-plugin-local-readback.ts';

function fixture(mode = 'normal') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-local-'));
  const binary = path.join(root, 'codex.cjs');
  fs.writeFileSync(binary, `#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
if (process.argv.slice(2).join(' ') === 'plugin marketplace list --json') {
  console.log(JSON.stringify({ marketplaces: [{ name: 'owner', marketplaceSource: { sourceType: 'git', source: 'example/owner' } }] }));
} else if (process.argv.slice(2).join(' ') === 'app-server --stdio') {
  fs.writeFileSync(process.env.FIXTURE_PID, String(process.pid));
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const request = JSON.parse(line);
    if (request.method === 'initialized') return;
    if (process.env.FIXTURE_MODE === 'stall') return;
    if (process.env.FIXTURE_MODE === 'exit-seven') process.exit(7);
    if (process.env.FIXTURE_MODE === 'invalid-json') return console.log('invalid-json');
    let result;
    if (request.method === 'initialize') result = { userAgent: 'fixture' };
    else if (request.method === 'plugin/list') {
      if (JSON.stringify(request.params.marketplaceKinds) !== '["local"]') process.exit(6);
      result = {
        marketplaces: [{ name: 'owner', plugins: [
          { id: 'one@owner', localVersion: '1.2.3', version: '9.9.9', installed: true, enabled: false, source: { type: 'local', path: '/native/one' } },
          { id: 'three@owner', version: '3.0.0', installed: false, enabled: false, source: { type: 'local', path: '/native/three' } },
        ] }],
        marketplaceLoadErrors: process.env.FIXTURE_MODE === 'load-error' ? [{ name: 'broken' }] : [],
      };
    } else process.exit(7);
    console.log(JSON.stringify({ id: request.id, result }));
  });
} else process.exit(8);
`);
  fs.chmodSync(binary, 0o755);
  return { root, binary, env: { ...process.env, FIXTURE_MODE: mode, FIXTURE_PID: path.join(root, 'pid') } };
}

test('native local inventory preserves installed versions and sources while availability remains separate', () => {
  const setup = fixture();
  try {
    const result = readCodexLocalPluginList({ ...setup, includeAvailable: true });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.installed.map((entry: any) => [entry.pluginId, entry.version, entry.source.path]), [
      ['one@owner', '1.2.3', '/native/one'],
    ]);
    assert.equal(output.installed[0].enabled, false);
    assert.equal(output.installed[0].marketplaceSource.source, 'example/owner');
    assert.deepEqual(output.available.map((entry: any) => entry.pluginId), ['three@owner']);
    assert.throws(() => process.kill(Number(fs.readFileSync(setup.env.FIXTURE_PID, 'utf8')), 0), { code: 'ESRCH' });
  } finally { fs.rmSync(setup.root, { recursive: true, force: true }); }
});

test('native marketplace load failures do not produce a successful partial inventory', () => {
  const setup = fixture('load-error');
  try {
    const result = readCodexLocalPluginList(setup);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(result.error);
    assert.equal((result.error as NodeJS.ErrnoException).code, 'OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE');
  } finally { fs.rmSync(setup.root, { recursive: true, force: true }); }
});

test('native command failure and invalid JSON retain distinct failure boundaries', () => {
  for (const mode of ['exit-seven', 'invalid-json']) {
    const setup = fixture(mode);
    try {
      const result = readCodexLocalPluginList(setup);
      assert.equal(result.status, mode === 'exit-seven' ? 7 : 1);
      assert.equal((result.error as NodeJS.ErrnoException | null)?.code,
        mode === 'invalid-json' ? 'OPL_CODEX_PLUGIN_READBACK_INVALID_SHAPE' : undefined);
    } finally { fs.rmSync(setup.root, { recursive: true, force: true }); }
  }
});

test('native local readback timeout terminates its app-server child', () => {
  const setup = fixture('stall');
  try {
    const result = readCodexLocalPluginList({ ...setup, timeoutMs: 200 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /timed out/);
    assert.throws(() => process.kill(Number(fs.readFileSync(setup.env.FIXTURE_PID, 'utf8')), 0), { code: 'ESRCH' });
  } finally { fs.rmSync(setup.root, { recursive: true, force: true }); }
});
