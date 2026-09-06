import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveAgentReachTool } from '../../src/adapters/integration/install-companions-parts/tools.ts';

const channels = ['web', 'youtube', 'rss', 'github', 'bilibili', 'v2ex'];

function fixture(github: string, apiOutput: string, apiExit = 0, doctorOutput?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-reach-health-'));
  const doctor = doctorOutput ?? JSON.stringify(Object.fromEntries(
    channels.map((id) => [id, { status: id === 'github' ? github : 'ok' }]),
  ));
  const binary = path.join(root, 'agent-reach');
  const gh = path.join(root, 'gh');
  const calls = path.join(root, 'gh-args.json');
  fs.writeFileSync(binary, `#!${process.execPath}
process.stdout.write(process.argv[2] === '--version' ? 'Agent Reach v1.5.0' : ${JSON.stringify(doctor)});
`, { mode: 0o755 });
  fs.writeFileSync(gh, `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)));
process.stdout.write(${JSON.stringify(apiOutput)});
process.exit(${apiExit});
`, { mode: 0o755 });
  const overrides = { OPL_AGENT_REACH_BIN: binary, OPL_GH_BIN: gh, OPL_STATE_DIR: path.join(root, 'state') };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  return {
    inspect: (health = true) => resolveAgentReachTool(root, { includeHealthCheck: health }),
    calls: () => fs.existsSync(calls) ? JSON.parse(fs.readFileSync(calls, 'utf8')) : null,
    close: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('GitHub warning needs a successful bounded authenticated GET to become ready', () => {
  const f = fixture('warn', '{"id":123,"login":"fixture-user"}');
  try {
    const result = f.inspect();
    assert.equal(result?.status, 'ready');
    assert.equal(result?.health_check?.status, 'ready');
    assert.deepEqual(result?.health_check?.failed_channels, []);
    assert.equal(result?.health_check?.github_api_check, 'ready');
    assert.deepEqual(f.calls(), ['api', '--hostname', 'github.com', '--method', 'GET', 'user']);
  } finally { f.close(); }
});

for (const [label, output, exit] of [
  ['authentication failure', '{"message":"Bad credentials"}', 1],
  ['invalid JSON', 'not json', 0],
  ['unrelated JSON', '{"ok":true}', 0],
  ['invalid identity', '{"id":0,"login":""}', 0],
] as const) {
  test(`GitHub warning remains degraded on ${label}`, () => {
    const f = fixture('warn', output, exit);
    try {
      const result = f.inspect();
      assert.equal(result?.status, 'failed');
      assert.deepEqual(result?.health_check?.failed_channels, ['github']);
      assert.equal(result?.health_check?.github_api_check, 'failed');
    } finally { f.close(); }
  });
}

for (const status of ['ok', 'error', 'off']) {
  test(`doctor ${status} does not trigger a GitHub fallback`, () => {
    const f = fixture(status, '{"id":123,"login":"fixture-user"}');
    try {
      assert.equal(f.inspect()?.status, status === 'ok' ? 'ready' : 'failed');
      assert.equal(f.calls(), null);
    } finally { f.close(); }
  });
}

test('invalid doctor and a skipped health check do not trigger GitHub access', () => {
  const f = fixture('warn', '{"id":123,"login":"fixture-user"}', 0, 'invalid');
  try {
    assert.equal(f.inspect()?.health_check?.status, 'invalid');
    assert.equal(f.inspect(false)?.health_check, undefined);
    assert.equal(f.calls(), null);
  } finally { f.close(); }
});
