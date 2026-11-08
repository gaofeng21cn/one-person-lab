import { assert, fs, os, path, runCli, test } from '../helpers.ts';

test('initial install reuses compatible local Codex without querying an upstream release', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-install-local-codex-'));
  const binary = path.join(root, 'codex');
  const probeLog = path.join(root, 'release-probes.log');
  const preload = path.join(root, 'observe-release-probes.mjs');
  fs.writeFileSync(binary, '#!/bin/sh\nprintf "codex-cli 0.165.0\\n"\n', { mode: 0o755 });
  fs.writeFileSync(preload, `
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const original = childProcess.execFileSync;
childProcess.execFileSync = function (file, args, ...rest) {
  if (Array.isArray(args) && args.some(value => String(value).endsWith('/resolve-dependency-releases.mjs'))
    && args.includes('codex-cli')) {
    fs.appendFileSync(${JSON.stringify(probeLog)}, 'codex-release-probe\\n');
    throw new Error('The test records upstream lookups without using the network.');
  }
  return original.call(this, file, args, ...rest);
};
syncBuiltinESMExports();
`);
  const env = {
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_CODEX_BIN: binary,
    OPL_DEPENDENCY_TEST_OVERRIDE: '0',
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    NODE_OPTIONS: `--import=${preload}`,
  };
  try {
    const output = runCli([
      'install', '--headless', '--skip-packages', '--skip-native-helper-repair', '--no-online-runtime',
    ], env) as any;
    assert.equal(output.install.status, 'completed');
    const engine = output.install.engine_actions.find((entry: any) => entry.engine_id === 'codex');
    assert.equal(engine.status, 'skipped_installed');
    assert.equal(engine.system_environment.core_engines.codex.version_status, 'compatible');
    const initialized = output.install.system_initialize.core_engines.codex;
    assert.equal(initialized.version, 'codex-cli 0.165.0');
    assert.equal(initialized.version_status, 'compatible');
    assert.equal(initialized.latest_version, null);
    assert.equal(fs.existsSync(probeLog), false);

    // The ordinary status path still performs its explicit latest-release lookup.
    runCli(['system'], env);
    assert.equal(fs.readFileSync(probeLog, 'utf8'), 'codex-release-probe\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
