import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildManagedComputerUseActionCatalog,
  inspectManagedComputerUse,
  readManagedComputerUseLock,
  reconcileManagedComputerUse,
} from '../../../../../src/modules/connect/managed-computer-use.ts';
import { runManagedComputerUseStartupMaintenance } from '../../../../../src/modules/connect/system-installation/startup-maintenance.ts';

const REQUIRED_TOOLS = [
  'list_apps',
  'get_app_state',
  'click',
  'type_text',
  'press_key',
  'scroll',
  'set_value',
  'perform_secondary_action',
  'select_text',
  'drag',
];

function withEnv<T>(updates: Record<string, string | undefined>, run: () => T) {
  const previous = Object.fromEntries(Object.keys(updates).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function createKimiFixture(root: string) {
  const appPath = path.join(root, 'KimiCU.app');
  const contents = path.join(appPath, 'Contents');
  const executable = path.join(contents, 'MacOS', 'kimi-cu');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>ai.kimi.cu</string>
<key>CFBundleShortVersionString</key><string>0.5.4</string>
</dict></plist>\n`);
  fs.writeFileSync(executable, `#!/bin/sh
case "$1" in
  service-status) echo 'SMAppService status=1 (1=enabled)' ;;
  xpc-ping) echo 'xpc-ping: ok' ;;
  doctor) printf '%s\\n' 'Accessibility: granted' 'Screen Recording: granted' ;;
  mcp) printf '%s\\n' '{"jsonrpc":"2.0","id":2,"result":{"tools":${JSON.stringify(REQUIRED_TOOLS.map((name) => ({ name })))}}}' ;;
  install) echo 'installed' ;;
  request-permissions) echo 'requested' ;;
esac
`);
  fs.chmodSync(executable, 0o755);
  return { appPath, executable };
}

test('managed Computer Use lock stays bound to the App-owned KimiCU identity', () => {
  const lock = readManagedComputerUseLock();
  assert.equal(lock.provider_id, 'kimi-cu');
  assert.equal(lock.version, '0.5.4');
  assert.equal(lock.archive.sha256, '77a7515cf7fd4b7bfa46a95eab0dff7378d00a2c5003bcf7ad93f17667e2808e');
  assert.equal(lock.product_identity_source_ref,
    'one-person-lab-app/contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu');
  assert.equal(lock.product_identity_source_sha256,
    '5a7c64110f8de56de8c464a26aaf5209f8853dc2ff32f59d069410487b74258a');
  assert.deepEqual(lock.health.permission_status_args, ['doctor']);
  assert.deepEqual(lock.mcp.required_tools, REQUIRED_TOOLS);
  assert.deepEqual(lock.action_ids, buildManagedComputerUseActionCatalog().map((action) => action.action_id));
});

test('managed Computer Use reports ready only for exact bundle, service, permission, MCP registration, and tools', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-computer-use-ready-'));
  const home = path.join(root, 'home');
  const fixture = createKimiFixture(root);
  const codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), `[mcp_servers.kimi-cu]
command = "${fixture.executable}"
args = ["mcp"]
enabled = true
`);
  try {
    const projection = withEnv({
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_COMPUTER_USE_PLATFORM: 'darwin-arm64',
      OPL_COMPUTER_USE_OS_VERSION: '14.0',
      OPL_KIMI_CU_INSTALL_PATH: fixture.appPath,
      OPL_KIMI_CU_EXECUTABLE_PATH: fixture.executable,
      OPL_KIMI_CU_TEAM_ID: '2J9472RW75',
      OPL_KIMI_CU_ARCHITECTURE: 'arm64',
      OPL_KIMI_CU_MCP_TOOLS: REQUIRED_TOOLS.join(','),
    }, () => inspectManagedComputerUse());

    assert.equal(projection.installed, true);
    assert.equal(projection.registered, true);
    assert.equal(projection.enabled, true);
    assert.equal(projection.permission, 'granted');
    assert.equal(projection.mcp.tools_exact, true);
    assert.equal(projection.ready, true);
    assert.equal(projection.status, 'ready');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing TCC permission remains installed and enabled but not ready', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-computer-use-permission-'));
  const home = path.join(root, 'home');
  const fixture = createKimiFixture(root);
  fs.writeFileSync(fixture.executable, `#!/bin/sh
case "$1" in
  service-status) echo 'status=1' ;;
  xpc-ping) echo 'xpc-ping: ok' ;;
  doctor) printf '%s\\n' 'Accessibility: required' 'Screen Recording: required'; exit 1 ;;
esac
`);
  fs.chmodSync(fixture.executable, 0o755);
  const codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), `[mcp_servers.kimi-cu]
command = "${fixture.executable}"
args = ["mcp"]
enabled = true
`);
  try {
    const projection = withEnv({
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_COMPUTER_USE_PLATFORM: 'darwin-arm64',
      OPL_COMPUTER_USE_OS_VERSION: '14.0',
      OPL_KIMI_CU_INSTALL_PATH: fixture.appPath,
      OPL_KIMI_CU_EXECUTABLE_PATH: fixture.executable,
      OPL_KIMI_CU_TEAM_ID: '2J9472RW75',
      OPL_KIMI_CU_ARCHITECTURE: 'arm64',
      OPL_KIMI_CU_MCP_TOOLS: REQUIRED_TOOLS.join(','),
    }, () => reconcileManagedComputerUse('settings_recheck_computer_use'));

    assert.equal(projection.installed, true);
    assert.equal(projection.enabled, true);
    assert.equal(projection.permission, 'required');
    assert.equal(projection.ready, false);
    assert.equal(projection.status, 'permission_required');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('MCP registration must preserve the exact command and args and accepts the quoted server table', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-computer-use-registry-'));
  const home = path.join(root, 'home');
  const fixture = createKimiFixture(root);
  const codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  const configPath = path.join(codexHome, 'config.toml');
  const inspect = () => withEnv({
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_COMPUTER_USE_PLATFORM: 'darwin-arm64',
    OPL_COMPUTER_USE_OS_VERSION: '14.0',
    OPL_KIMI_CU_INSTALL_PATH: fixture.appPath,
    OPL_KIMI_CU_EXECUTABLE_PATH: fixture.executable,
    OPL_KIMI_CU_TEAM_ID: '2J9472RW75',
    OPL_KIMI_CU_ARCHITECTURE: 'arm64',
    OPL_KIMI_CU_MCP_TOOLS: REQUIRED_TOOLS.join(','),
  }, () => inspectManagedComputerUse());
  try {
    fs.writeFileSync(configPath, `[mcp_servers.kimi-cu]
command = "/tmp/not-kimi-cu"
args = ["mcp"]
enabled = true
`);
    assert.equal(inspect().registered, false);

    fs.writeFileSync(configPath, `[mcp_servers.kimi-cu]
command = "${fixture.executable}"
args = ["mcp", "-s", "user"]
enabled = true
`);
    assert.equal(inspect().registered, false);

    fs.writeFileSync(configPath, `[mcp_servers."kimi-cu"]
command = "${fixture.executable}"
args = ["mcp"]
enabled = true
`);
    assert.equal(inspect().registered, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repair uses the Codex registry writer without replacing unrelated config tables', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-computer-use-repair-registry-'));
  const home = path.join(root, 'home');
  const fixture = createKimiFixture(root);
  const codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  const configPath = path.join(codexHome, 'config.toml');
  fs.writeFileSync(configPath, `[mcp_servers.keep]
command = "keep"

[mcp_servers."kimi-cu"]
command = "/tmp/stale-kimi-cu"
args = ["mcp", "--stale"]
enabled = false
`);
  try {
    const projection = withEnv({
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_COMPUTER_USE_PLATFORM: 'darwin-arm64',
      OPL_COMPUTER_USE_OS_VERSION: '14.0',
      OPL_KIMI_CU_INSTALL_PATH: fixture.appPath,
      OPL_KIMI_CU_EXECUTABLE_PATH: fixture.executable,
      OPL_KIMI_CU_TEAM_ID: '2J9472RW75',
      OPL_KIMI_CU_ARCHITECTURE: 'arm64',
      OPL_KIMI_CU_MCP_TOOLS: REQUIRED_TOOLS.join(','),
    }, () => reconcileManagedComputerUse('settings_repair_computer_use'));

    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /\[mcp_servers\.keep\]\ncommand = "keep"/);
    assert.match(config, new RegExp(`\\[mcp_servers\\.kimi-cu\\]\\ncommand = "${fixture.executable}"\\nargs = \\["mcp"\\]\\nenabled = true`));
    assert.doesNotMatch(config, /\[mcp_servers\."kimi-cu"\]/);
    assert.equal((config.match(/\[mcp_servers\.(?:"kimi-cu"|kimi-cu)\]/g) ?? []).length, 1);
    assert.equal(projection.registered, true);
    assert.equal(projection.enabled, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unsupported hosts degrade only the managed companion', () => {
  const projection = withEnv({ OPL_COMPUTER_USE_PLATFORM: 'linux-x64' }, () =>
    inspectManagedComputerUse({ runExternalChecks: false }));
  assert.equal(projection.platform.supported, false);
  assert.equal(projection.status, 'unsupported_platform');
  assert.equal(projection.permission, 'unsupported');
  assert.equal(projection.ready, false);
});

test('macOS below the pinned minimum stays unsupported', () => {
  const projection = withEnv({
    OPL_COMPUTER_USE_PLATFORM: 'darwin-arm64',
    OPL_COMPUTER_USE_OS_VERSION: '13.6.9',
  }, () => inspectManagedComputerUse({ runExternalChecks: false }));
  assert.equal(projection.platform.current_version, '13.6.9');
  assert.equal(projection.platform.supported, false);
  assert.equal(projection.status, 'unsupported_platform');
});

test('startup maintenance keeps an installed permission-required companion idempotent and non-blocking', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-computer-use-startup-permission-'));
  const home = path.join(root, 'home');
  const fixture = createKimiFixture(root);
  fs.writeFileSync(fixture.executable, `#!/bin/sh
case "$1" in
  service-status) echo 'status=1' ;;
  xpc-ping) echo 'xpc-ping: ok' ;;
  doctor) printf '%s\\n' 'Accessibility: required' 'Screen Recording: required'; exit 1 ;;
esac
`);
  fs.chmodSync(fixture.executable, 0o755);
  const codexHome = path.join(home, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, 'config.toml'), `[mcp_servers.kimi-cu]
command = "${fixture.executable}"
args = ["mcp"]
enabled = true
`);
  try {
    const target = withEnv({
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_COMPUTER_USE_PLATFORM: 'darwin-arm64',
      OPL_COMPUTER_USE_OS_VERSION: '14.0',
      OPL_KIMI_CU_INSTALL_PATH: fixture.appPath,
      OPL_KIMI_CU_EXECUTABLE_PATH: fixture.executable,
      OPL_KIMI_CU_TEAM_ID: '2J9472RW75',
      OPL_KIMI_CU_ARCHITECTURE: 'arm64',
      OPL_KIMI_CU_MCP_TOOLS: REQUIRED_TOOLS.join(','),
    }, () => runManagedComputerUseStartupMaintenance());

    assert.equal(target.status, 'skipped');
    assert.equal(target.reason, 'installed_permission_required');
    assert.equal(target.action, null);
    assert.equal(target.result.installed, true);
    assert.equal(target.result.registered, true);
    assert.equal(target.result.enabled, true);
    assert.equal(target.result.permission, 'required');
    assert.equal(target.blocking, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('startup maintenance records managed companion materialization failure without blocking OPL', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-computer-use-startup-failure-'));
  const home = path.join(root, 'home');
  const archivePath = path.join(root, 'KimiCU.app.zip');
  const installPath = path.join(root, 'Applications', 'KimiCU.app');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(archivePath, 'not the pinned archive');
  try {
    const target = withEnv({
      HOME: home,
      CODEX_HOME: path.join(home, '.codex'),
      OPL_COMPUTER_USE_PLATFORM: 'darwin-arm64',
      OPL_COMPUTER_USE_OS_VERSION: '14.0',
      OPL_KIMI_CU_INSTALL_PATH: installPath,
      OPL_KIMI_CU_EXECUTABLE_PATH: path.join(installPath, 'Contents', 'MacOS', 'kimi-cu'),
      OPL_KIMI_CU_ARCHIVE_PATH: archivePath,
      OPL_KIMI_CU_TEAM_ID: undefined,
      OPL_KIMI_CU_ARCHITECTURE: undefined,
      OPL_KIMI_CU_MCP_TOOLS: undefined,
    }, () => runManagedComputerUseStartupMaintenance());

    assert.equal(target.status, 'attention_required');
    assert.equal(target.reason, 'reconcile_failed');
    assert.equal(target.action, 'repair');
    assert.equal(target.result.status, 'not_installed');
    assert.equal(target.blocking, false);
    assert.match(JSON.stringify(target.error), /archive SHA-256/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
