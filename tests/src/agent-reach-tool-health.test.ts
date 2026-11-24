import { nodeFixtureShebang } from './cli/helpers/node-executable.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installAgentReachSkill, resolveAgentReachTool } from '../../src/adapters/integration/install-companions/tools.ts';

const channels = [
  { channel: 'web', level: 'default', status: 'unverified', problems: [] },
  { channel: 'bilibili', level: 'default', status: 'needs_setup', problems: ['bili-cli not installed'] },
  { channel: 'reddit', level: 'optional', status: 'not_added', problems: [], hint: 'agent-reach add reddit' },
];

function fixture(doctorOutput?: string, legacy = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-reach-health-'));
  const doctor = doctorOutput ?? JSON.stringify({
    schema_version: 1,
    ok: true,
    action: 'doctor',
    result: {
      version: '1.6.1',
      channels,
    },
  });
  const binary = path.join(root, 'agent-reach');
  const responses = legacy
    ? { '--version': 'Agent Reach v1.5.0', 'doctor --json': doctor, 'skill --install': 'Skill installed' }
    : {
      version: JSON.stringify({ schema_version: 1, ok: true, action: 'version', result: { version: '1.6.1' } }),
      doctor,
    };
  fs.writeFileSync(binary, `${nodeFixtureShebang}
const args = process.argv.slice(2).join(' ');
require('node:fs').appendFileSync(${JSON.stringify(path.join(root, 'calls.log'))}, args + '\\n');
const responses = ${JSON.stringify(responses)};
if (!Object.hasOwn(responses, args)) process.exit(2);
process.stdout.write(responses[args]);
`, { mode: 0o755 });
  const calls = path.join(root, 'calls.log');
  const overrides = { OPL_AGENT_REACH_BIN: binary, OPL_STATE_DIR: path.join(root, 'state') };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  return {
    inspect: (health = true) => resolveAgentReachTool(root, { includeHealthCheck: health }),
    installLegacySkill: () => installAgentReachSkill(binary, path.join(root, 'skills'), root),
    calls: () => fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [],
    close: () => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test('valid doctor keeps channel setup statuses diagnostic while the CLI remains ready', () => {
  const f = fixture();
  try {
    const result = f.inspect();
    assert.equal(result?.status, 'ready');
    assert.equal(result?.health_check?.status, 'ready');
    assert.equal(result?.version, '1.6.1');
    assert.deepEqual(result?.health_check?.channels, channels);
    assert.deepEqual(f.calls(), ['version', 'doctor']);
  } finally { f.close(); }
});

test('installed Agent Reach 1.5 still reports its legacy channel diagnostics', () => {
  const f = fixture(JSON.stringify({ github: { status: 'warn', message: 'Check GitHub configuration' } }), true);
  try {
    const result = f.inspect();
    assert.equal(result?.status, 'ready');
    assert.equal(result?.version, 'Agent Reach v1.5.0');
    assert.deepEqual(result?.health_check?.channels, [
      { channel: 'github', status: 'warn', problems: ['Check GitHub configuration'] },
    ]);
    assert.equal(f.installLegacySkill().status, 'installed');
    assert.deepEqual(f.calls(), ['version', '--version', 'doctor --json', 'skill --install']);
  } finally { f.close(); }
});

test('invalid doctor output marks the health check invalid', () => {
  const f = fixture('not json');
  try {
    const result = f.inspect();
    assert.equal(result?.status, 'failed');
    assert.equal(result?.health_check?.status, 'invalid');
    assert.equal(f.inspect(false)?.health_check, undefined);
    assert.deepEqual(f.calls(), ['version', 'doctor', 'version']);
  } finally { f.close(); }
});
