import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildManagedBrowserAutomationActionCatalog,
  inspectManagedBrowserAutomation,
  readManagedBrowserAutomationLock,
  reconcileManagedBrowserAutomation,
} from '../../../../../src/adapters/integration/managed-browser-automation.ts';
import { runManagedBrowserAutomationStartupMaintenance } from '../../../../../src/adapters/integration/system-installation/startup-maintenance.ts';
import { runCli } from '../../helpers.ts';

const require = createRequire(import.meta.url);

const REQUIRED_TOOLS = [
  'browser_close',
  'browser_resize',
  'browser_console_messages',
  'browser_handle_dialog',
  'browser_evaluate',
  'browser_file_upload',
  'browser_drop',
  'browser_find',
  'browser_fill_form',
  'browser_press_key',
  'browser_type',
  'browser_navigate',
  'browser_navigate_back',
  'browser_network_requests',
  'browser_network_request',
  'browser_run_code_unsafe',
  'browser_take_screenshot',
  'browser_snapshot',
  'browser_click',
  'browser_drag',
  'browser_hover',
  'browser_select_option',
  'browser_tabs',
  'browser_wait_for',
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

function createPlaywrightMcpFixture(root: string) {
  const packageRoot = path.join(root, 'playwright-mcp');
  const entrypoint = path.join(packageRoot, 'cli.js');
  const invocationLog = path.join(root, 'playwright-mcp-invocations.log');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@playwright/mcp',
    version: '0.0.79',
  }));
  fs.writeFileSync(entrypoint, `import fs from 'node:fs';
fs.appendFileSync(${JSON.stringify(invocationLog)}, 'invoked\\n');
const frames = fs.readFileSync(0, 'utf8').trim().split(/\\r?\\n/).map((line) => JSON.parse(line));
for (const frame of frames) {
  if (frame.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {
    protocolVersion: '2025-06-18', capabilities: { tools: {} },
    serverInfo: { name: 'Playwright', version: '1.63.0-alpha-2026-08-05' },
  }}));
  if (frame.id === 2) console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: {
    tools: ${JSON.stringify(REQUIRED_TOOLS.map((name) => ({ name })))},
  }}));
}
`);
  return { packageRoot, entrypoint, invocationLog };
}

function browserEnv(root: string, packageRoot: string) {
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  return {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: stateDir,
    OPL_PLAYWRIGHT_MCP_PACKAGE_ROOT: packageRoot,
    OPL_PLAYWRIGHT_MCP_NODE_PATH: process.execPath,
    OPL_PLAYWRIGHT_MCP_NODE_VERSION: process.versions.node,
    OPL_PLAYWRIGHT_MCP_BROWSER_PATH: process.execPath,
    OPL_PLAYWRIGHT_MCP_OUTPUT_DIR: path.join(stateDir, 'browser-output'),
  };
}

test('managed Browser Automation lock pins the official Playwright MCP dependency and tool surface', () => {
  const lock = readManagedBrowserAutomationLock();
  assert.equal(lock.provider_id, 'playwright-mcp');
  assert.equal(lock.runtime.package_name, '@playwright/mcp');
  assert.equal(lock.runtime.package_version, '0.0.79');
  assert.equal(lock.runtime.carrier, 'current_framework_node_process');
  assert.equal(lock.mcp.default_enabled, true);
  assert.equal(lock.mcp.server_id, 'playwright');
  assert.deepEqual(lock.mcp.args, ['--browser', 'chrome', '--headless', '--isolated']);
  assert.equal(lock.browser.channel, 'chrome');
  assert.equal(lock.browser.host_browser_required_for_ready, true);
  assert.deepEqual(lock.mcp.required_tools, REQUIRED_TOOLS);
  assert.deepEqual(lock.action_ids, buildManagedBrowserAutomationActionCatalog().map((action) => action.action_id));
  assert.equal(lock.browser.desktop_visual_fallback_provider, 'kimi-cu');
});

test('repair preserves unrelated Codex MCP tables and registers exact Node, CLI, args, and enabled state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-browser-automation-repair-'));
  const fixture = createPlaywrightMcpFixture(root);
  const env = browserEnv(root, fixture.packageRoot);
  const configPath = path.join(env.CODEX_HOME, 'config.toml');
  fs.writeFileSync(configPath, `[mcp_servers.keep]\ncommand = "keep"\n\n[mcp_servers."playwright"]\ncommand = "/tmp/stale"\nargs = ["--stale"]\nenabled = false\n`);
  try {
    const projection = withEnv(env, () =>
      reconcileManagedBrowserAutomation('settings_repair_browser_automation'));
    const config = fs.readFileSync(configPath, 'utf8');
    const expectedArgs = [
      fixture.entrypoint,
      '--browser',
      'chrome',
      '--headless',
      '--isolated',
      '--executable-path',
      process.execPath,
      '--output-dir',
      env.OPL_PLAYWRIGHT_MCP_OUTPUT_DIR,
    ];
    assert.match(config, /\[mcp_servers\.keep\]\ncommand = "keep"/);
    assert.match(config, /\[mcp_servers\.playwright\]/);
    assert.equal(config.includes(`command = "${process.execPath}"`), true);
    assert.equal(config.includes(`args = [${expectedArgs.map((arg) => `"${arg}"`).join(', ')}]`), true);
    assert.match(config, /enabled = true/);
    assert.doesNotMatch(config, /\[mcp_servers\."playwright"\]/);
    assert.equal((config.match(/\[mcp_servers\.(?:"playwright"|playwright)\]/g) ?? []).length, 1);
    assert.equal(projection.installed, true);
    assert.equal(projection.registered, true);
    assert.equal(projection.enabled, true);
    assert.equal(projection.mcp.initialize_ok, true);
    assert.equal(projection.mcp.tools_exact, true);
    assert.equal(projection.browser.channel, 'chrome');
    assert.equal(projection.browser.host_browser_installed, true);
    assert.equal(projection.browser.host_browser_executable, process.execPath);
    assert.equal(projection.ready, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fast inspection reads package and registration without spawning Playwright MCP', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-browser-automation-fast-'));
  const fixture = createPlaywrightMcpFixture(root);
  const env = browserEnv(root, fixture.packageRoot);
  const args = [
    fixture.entrypoint,
    '--browser',
    'chrome',
    '--headless',
    '--isolated',
    '--executable-path',
    process.execPath,
    '--output-dir',
    env.OPL_PLAYWRIGHT_MCP_OUTPUT_DIR,
  ];
  fs.writeFileSync(path.join(env.CODEX_HOME, 'config.toml'), `[mcp_servers.playwright]\ncommand = "${process.execPath}"\nargs = [${args.map((arg) => `"${arg}"`).join(', ')}]\nenabled = true\n`);
  try {
    const projection = withEnv(env, () =>
      inspectManagedBrowserAutomation({ runExternalChecks: false }));
    assert.equal(projection.installed, true);
    assert.equal(projection.registered, true);
    assert.equal(projection.enabled, true);
    assert.equal(projection.ready, false);
    assert.equal(projection.status, 'health_not_checked');
    assert.equal(projection.mcp.initialize_ok, null);
    assert.equal(projection.mcp.tools_exact, null);
    assert.deepEqual(projection.mcp.observed_tools, []);
    assert.equal(fs.existsSync(fixture.invocationLog), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('macOS system Chrome repair retains the automation-only clone opt-out', {
  skip: process.platform !== 'darwin',
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-browser-clone-policy-'));
  try {
    const fixture = createPlaywrightMcpFixture(root);
    const env = browserEnv(root, fixture.packageRoot);
    const chrome = path.join(root, 'Google Chrome');
    fs.writeFileSync(chrome, 'fixture');
    const projection = withEnv({ ...env, OPL_PLAYWRIGHT_MCP_BROWSER_PATH: chrome }, () =>
      reconcileManagedBrowserAutomation('settings_repair_browser_automation'));
    const configIndex = projection.mcp.args.indexOf('--config');
    assert.notEqual(configIndex, -1);
    const policy = JSON.parse(fs.readFileSync(projection.mcp.args[configIndex + 1], 'utf8'));
    assert.deepEqual(policy.browser.launchOptions.args, ['--disable-features=MacAppCodeSignClone']);
    assert.equal(projection.registered, true);
    assert.equal(projection.ready, true);
    assert.equal(projection.browser.host_browser_executable, chrome);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing Playwright MCP dependency degrades only its non-blocking startup target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-browser-automation-missing-'));
  const env = browserEnv(root, path.join(root, 'missing-package'));
  try {
    const target = withEnv(env, () => runManagedBrowserAutomationStartupMaintenance());
    assert.equal(target.target_id, 'playwright-mcp');
    assert.equal(target.status, 'attention_required');
    assert.equal(target.reason, 'reconcile_incomplete');
    assert.equal(target.action, 'repair');
    assert.equal(target.result.status, 'not_installed');
    assert.equal(target.blocking, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing system Chrome keeps the pinned provider registered but not ready', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-browser-automation-missing-chrome-'));
  const fixture = createPlaywrightMcpFixture(root);
  const env = {
    ...browserEnv(root, fixture.packageRoot),
    OPL_PLAYWRIGHT_MCP_BROWSER_PATH: path.join(root, 'missing-chrome'),
  };
  try {
    const projection = withEnv(env, () =>
      reconcileManagedBrowserAutomation('settings_repair_browser_automation'));
    assert.equal(projection.installed, true);
    assert.equal(projection.registered, true);
    assert.equal(projection.mcp.tools_exact, true);
    assert.equal(projection.browser.host_browser_installed, false);
    assert.equal(projection.browser.host_browser_executable, null);
    assert.equal(projection.ready, false);
    assert.equal(projection.status, 'attention_required');
    assert.equal(projection.authority_boundary.provider_failure_blocks_plain_codex, false);
    assert.equal(projection.authority_boundary.provider_failure_blocks_kimi_cu, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('App action shell routes Browser Automation recheck through the Framework projection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-browser-automation-action-'));
  const fixture = createPlaywrightMcpFixture(root);
  const env = browserEnv(root, fixture.packageRoot);
  try {
    const execution = runCli([
      'app',
      'action',
      'execute',
      '--action',
      'settings_recheck_browser_automation',
      '--dry-run',
    ], {
      ...env,
      OPL_MODULES_ROOT: path.join(env.OPL_STATE_DIR, 'modules'),
      OPL_DEVELOPER_MODE_GH_BINARY: path.join(root, 'missing-gh'),
      PATH: process.env.PATH ?? '/usr/bin:/bin',
    }).app_action_execution;
    assert.equal(execution.action_id, 'settings_recheck_browser_automation');
    assert.equal(execution.delegated_surface,
      'opl managed companion settings_recheck_browser_automation');
    assert.equal(execution.result.surface_kind, 'opl_managed_browser_automation_action_preflight');
    assert.equal(execution.result.current.provider_id, 'playwright-mcp');
    assert.equal(execution.result.current.mcp.initialize_ok, null);
    assert.equal(fs.existsSync(fixture.invocationLog), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('installed official Playwright MCP completes a real initialize and tools/list handshake', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-browser-automation-real-mcp-'));
  const env = browserEnv(root, path.dirname(require.resolve('@playwright/mcp/package.json')));
  try {
    const projection = withEnv(env, () =>
      reconcileManagedBrowserAutomation('settings_repair_browser_automation'));
    assert.equal(projection.mcp.initialize_ok, true);
    assert.equal(projection.mcp.protocol_version, '2025-06-18');
    assert.equal(projection.mcp.server_name, 'Playwright');
    assert.equal(projection.mcp.tools_exact, true);
    assert.deepEqual(projection.mcp.observed_tools, REQUIRED_TOOLS);
    assert.equal(projection.ready, true);
    assert.equal(projection.browser.launch_probe, 'not_run_by_state_projection');
    assert.equal(projection.authority_boundary.can_claim_app_release_ready, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
