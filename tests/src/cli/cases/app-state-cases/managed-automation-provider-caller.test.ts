import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { main } from '../../../../../src/entrypoints/cli/main.ts';
import type {
  CordisAutomationProvider,
  CordisAutomationProviderHostPluginConfig,
} from '../../../../../src/host/plugins/cordis-automation-provider-host.ts';
import { runCli } from '../../helpers.ts';

function throwingProvider(events: string[]): CordisAutomationProvider {
  return {
    provider_id: 'playwright-mcp',
    automation_kind: 'browser_automation',
    buildActionCatalog: () => [{ action_id: 'settings_recheck_browser_automation' }],
    inspect: () => {
      events.push('inspect');
      throw new Error('automation provider inspection failed');
    },
    reconcile: () => {
      events.push('reconcile');
      throw new Error('automation provider reconciliation failed');
    },
    dispose: () => {
      events.push('dispose');
    },
  };
}

async function runAppMain(
  automationProvider: CordisAutomationProviderHostPluginConfig,
  args: string[],
) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-automation-provider-cli-'));
  const env = {
    OPL_STATE_DIR: stateDir,
    CODEX_HOME: path.join(stateDir, 'codex-home'),
    OPL_DEVELOPER_MODE_GH_BINARY: path.join(stateDir, 'missing-gh'),
  };
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(env)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  let stdout = '';
  try {
    await main({
      argv: args,
      stdout: {
        write: (chunk) => {
          stdout += String(chunk);
          return true;
        },
      },
      stdoutIsTTY: false,
      automationProvider,
    });
    return { stdout, error: null };
  } catch (error) {
    return { stdout, error };
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

test('app-full CLI mounts native automation providers through managed_companions only', () => {
  const output = runCli(['app', 'state', '--profile', 'fast']) as {
    app_state: {
      managed_companions: Array<{ provider_id: string }>;
      [key: string]: unknown;
    };
  };
  assert.deepEqual(
    output.app_state.managed_companions.map((provider) => provider.provider_id),
    ['playwright-mcp'],
  );
  assert.equal(Object.hasOwn(output.app_state, 'automation_provider_host'), false);
  assert.equal(Object.hasOwn(output.app_state, 'automation_provider_registry'), false);
  assert.equal(Object.hasOwn(output.app_state, 'automation_provider_currentness'), false);
});

test('app-full CLI rejects a missing selected automation provider before command dispatch', async () => {
  const result = await runAppMain(
    { selectedProviders: [{ provider_id: 'missing-automation-provider' }] },
    ['app', 'state', '--profile', 'fast'],
  );
  assert.equal(result.stdout, '');
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /Selected automation provider is unavailable/);
});

test('app-full CLI fails closed when the selected provider inspect throws', async () => {
  const events: string[] = [];
  const result = await runAppMain({
    providers: [throwingProvider(events)],
    selectedProviders: [{
      provider_id: 'playwright-mcp',
      automation_kind: 'browser_automation',
    }],
  }, ['app', 'state', '--profile', 'fast']);
  assert.equal(result.stdout, '');
  assert.ok(result.error instanceof Error);
  assert.match(result.error.message, /automation provider inspection failed/);
  assert.deepEqual(events, ['inspect', 'dispose']);
  assert.equal(events.includes('reconcile'), false);
});
