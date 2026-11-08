import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Existing domain fixtures own their plugin data and action logs. Adapt only
// their test transport when the Framework asks the native installed-state API.
const NATIVE_READBACK_FIXTURE = String.raw`#!/usr/bin/env node
// OPL native readback fixture transport v1
import fs from 'node:fs';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
const binary = __OPL_FIXTURE_BINARY__;
const statePath = __OPL_FIXTURE_STATE__;
const args = process.argv.slice(2);
const run = (argv) => spawnSync(binary, argv, {
  env: { ...process.env, OPL_CODEX_PLUGIN_BIN: binary },
  encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024,
});
const relay = (result) => {
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exitCode = result.status ?? 1;
};
if (args[0] === 'app-server') {
  fs.rmSync(statePath, { force: true });
  const sources = new Map();
  const lines = readline.createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    const frame = JSON.parse(line);
    if (frame.method === 'initialized') return;
    if (frame.method === 'initialize') {
      process.stdout.write(JSON.stringify({ id: frame.id, result: {} }) + '\n');
      return;
    }
    if (frame.method !== 'plugin/list') throw new Error('Unexpected native fixture method.');
    let result = run(['plugin', 'list', '--available', '--json']);
    // Legacy domain fixtures use --available failures for their remote catalog.
    // The native local-only inventory still contains their installed packages.
    if (result.status !== 0 || result.error) result = run(['plugin', 'list', '--json']);
    if (result.status !== 0 || result.error) {
      process.stderr.write(result.stderr ?? '');
      process.exit(result.status ?? 1);
    }
    let payload;
    try { payload = JSON.parse(result.stdout); } catch {
      process.stdout.write(result.stdout + '\n');
      return;
    }
    if (!payload || !Array.isArray(payload.installed)) {
      process.stdout.write(JSON.stringify({ id: frame.id, result: payload }) + '\n');
      return;
    }
    const marketplaces = new Map();
    for (const entry of [...payload.installed, ...(payload.available ?? [])]) {
      const name = entry.pluginId?.split('@').slice(1).join('@');
      if (!name) throw new Error('Native fixture plugin has no marketplace identity.');
      if (entry.marketplaceSource) sources.set(name, { name, marketplaceSource: entry.marketplaceSource });
      if (!marketplaces.has(name)) marketplaces.set(name, { name, path: null, plugins: [] });
      marketplaces.get(name).plugins.push({
        id: entry.pluginId, name: entry.pluginId.split('@')[0],
        localVersion: entry.version ?? null, version: null,
        source: { type: entry.source?.source ?? 'local', path: entry.source?.path ?? null },
        installed: entry.installed === true, enabled: entry.enabled === true,
      });
    }
    fs.writeFileSync(statePath, JSON.stringify({ marketplaces: [...sources.values()] }));
    process.stdout.write(JSON.stringify({ id: frame.id, result: {
      marketplaces: [...marketplaces.values()], marketplaceLoadErrors: [],
    } }) + '\n');
  });
} else if (args.join(' ') === 'plugin marketplace list --json' && fs.existsSync(statePath)) {
  process.stdout.write(fs.readFileSync(statePath, 'utf8'));
  fs.rmSync(statePath, { force: true });
} else relay(run(args));
`;

export function codexNativeReadbackFixture(directory: string, binary: string) {
  if (path.basename(binary).startsWith('codex-native-readback-fixture-')
    && fs.existsSync(binary)
    && fs.readFileSync(binary, 'utf8').startsWith('#!/usr/bin/env node\n// OPL native readback fixture transport v1\n')) {
    return { OPL_CODEX_PLUGIN_BIN: binary };
  }
  const identity = crypto.randomUUID();
  const wrapper = path.join(directory, `codex-native-readback-fixture-${identity}.mjs`);
  const statePath = path.join(directory, `native-marketplaces-${identity}.json`);
  fs.writeFileSync(wrapper, NATIVE_READBACK_FIXTURE
    .replace('__OPL_FIXTURE_BINARY__', () => JSON.stringify(binary))
    .replace('__OPL_FIXTURE_STATE__', () => JSON.stringify(statePath)), { mode: 0o755 });
  return { OPL_CODEX_PLUGIN_BIN: wrapper };
}
