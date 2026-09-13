import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { reconcileInternalPackageCarriers } from '../../../../../src/adapters/integration/agent-package-registry-parts/internal-package-carrier-migration.ts';
import type { CodexPluginCommandRunner } from '../../../../../src/adapters/integration/agent-package-registry-parts/configured-codex-plugin-carrier-types.ts';

function fixture(failInternalInstall = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-internal-migration-'));
  const userHome = path.join(root, 'codex');
  const stateDir = path.join(root, 'state');
  const source = path.join(root, 'legacy-source');
  const internalHome = path.join(stateDir, 'internal-package-carrier');
  const selector = 'opl-fleet-agent@opl-fleet-agent';
  const owner = JSON.parse(fs.readFileSync('contracts/opl-framework/packages/opl-fleet-agent.json', 'utf8'));
  fs.mkdirSync(path.join(source, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(source, 'skills', 'opl-fleet-agent'), { recursive: true });
  fs.writeFileSync(path.join(source, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'opl-fleet-agent', version: owner.version, skills: './skills/' }));
  fs.writeFileSync(path.join(source, 'skills/opl-fleet-agent/SKILL.md'), '# Local telemetry\n');
  fs.writeFileSync(path.join(source, 'opl-package.json'), JSON.stringify(owner));
  fs.mkdirSync(userHome, { recursive: true });
  fs.writeFileSync(path.join(userHome, 'config.toml'), '# user preferences\n');
  const sources = new Map([[userHome, source]]);
  const marketplaces = new Map<string, string>();
  const mutations: Array<{ home: string; command: string }> = [];
  const runner: CodexPluginCommandRunner = ({ args, env }) => {
    const home = env.CODEX_HOME!;
    const command = args.join(' ');
    let payload: unknown = {};
    if (args[0] === 'plugin' && args[1] === 'list') {
      const sourcePath = sources.get(home);
      payload = { installed: sourcePath ? [{
        pluginId: selector, version: owner.version, installed: true,
        enabled: false, source: { source: 'local', path: sourcePath },
        marketplaceSource: { sourceType: 'local', source: marketplaces.get(home) ?? 'gaofeng21cn/opl-fleet-agent' },
      }] : [], available: [] };
    } else if (command === 'plugin marketplace list --json') {
      payload = { marketplaces: marketplaces.has(home) ? [{ name: 'opl-fleet-agent', sourceType: 'local', source: marketplaces.get(home) }] : [] };
    } else if (args[1] === 'marketplace' && args[2] === 'add') {
      mutations.push({ home, command });
      marketplaces.set(home, args[3]!);
    } else if (args[1] === 'add') {
      mutations.push({ home, command });
      if (failInternalInstall) return { status: 1, stdout: '', stderr: 'fixture install failed', error: null };
      sources.set(home, fs.realpathSync(path.join(marketplaces.get(home)!, 'plugins', 'opl-fleet-agent')));
      fs.writeFileSync(path.join(home, 'config.toml'), `[plugins."${selector}"]\nenabled = false\n`);
    } else if (args[1] === 'remove') {
      mutations.push({ home, command });
      assert.equal(sources.has(internalHome), true, 'never remove before internal native installation');
      assert.equal(fs.existsSync(path.join(sources.get(internalHome)!, 'opl-package.json')), true);
      sources.delete(home);
    } else throw new Error(`Unexpected native command ${command}`);
    return { status: 0, stdout: JSON.stringify(payload), stderr: '', error: null };
  };
  return { root, userHome, internalHome, source, sources, mutations, runner, env: { HOME: root, CODEX_HOME: userHome, OPL_STATE_DIR: stateDir } };
}

test('startup migration copies the installed internal Package before native removal and is idempotent', () => {
  const f = fixture();
  try {
    const result = reconcileInternalPackageCarriers({ env: f.env, runner: f.runner });
    assert.deepEqual(result, { status: 'completed', items: [{ package_id: 'opl-fleet-agent', status: 'migrated', reason: null }] });
    assert.equal(f.sources.has(f.userHome), false);
    assert.equal(f.sources.has(f.internalHome), true);
    assert.equal(fs.readFileSync(path.join(f.userHome, 'config.toml'), 'utf8'), '# user preferences\n');
    assert.equal(fs.existsSync(f.source), true);
    const mutationsBeforeRepeat = f.mutations.length;
    assert.deepEqual(reconcileInternalPackageCarriers({ env: f.env, runner: f.runner }), { status: 'completed', items: [] });
    assert.equal(f.mutations.length, mutationsBeforeRepeat);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('failed internal installation preserves the legacy native installation', () => {
  const f = fixture(true);
  try {
    const result = reconcileInternalPackageCarriers({ env: f.env, runner: f.runner });
    assert.equal(result.status, 'attention_required');
    assert.equal(f.sources.get(f.userHome), f.source);
    assert.equal(f.mutations.some((call) => call.command.startsWith('plugin remove ')), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('conflicting internal source is preserved together with the legacy installation', () => {
  const f = fixture();
  try {
    const target = path.join(path.dirname(f.internalHome), 'codex-plugin-marketplaces/opl-fleet-agent/plugins/opl-fleet-agent');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'user-data'), 'preserve');
    const result = reconcileInternalPackageCarriers({ env: f.env, runner: f.runner });
    assert.equal(result.status, 'attention_required');
    assert.equal(f.sources.get(f.userHome), f.source);
    assert.equal(fs.readFileSync(path.join(target, 'user-data'), 'utf8'), 'preserve');
    assert.equal(f.mutations.length, 0);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
