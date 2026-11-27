import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { AppStateSnapshot } from '../src/state/app-state-cache.ts';
import { connectTestRpc, createDaemonSandbox } from './helpers/sandbox.ts';

test('App settings read current Gateway account state without exposing it to another daemon client', async (t) => {
  const sandbox = createDaemonSandbox();
  t.after(() => sandbox.cleanup());
  await sandbox.startInProcess();
  const app = await connectTestRpc(sandbox.sessionPath, 'opl_app', '2.0');
  const sdk = await connectTestRpc(sandbox.sessionPath, 'sdk_python', '2.0');
  t.after(async () => { await app.close(); await sdk.close(); });

  const readSettings = (snapshot: AppStateSnapshot) =>
    snapshot.app_state.settings_control_center?.app_settings_read_model.opl_gateway_account;
  const readState = async () => await app.call('app.state.get', {}) as AppStateSnapshot;
  assert.equal(readSettings(await readState())?.status, 'not_connected');

  // A previously installed App already wrote this account snapshot to its private store.
  const accountDir = path.join(sandbox.stateDir, 'gateway');
  fs.mkdirSync(accountDir, { recursive: true, mode: 0o700 });
  const accountPath = path.join(accountDir, 'account.json');
  fs.writeFileSync(accountPath, JSON.stringify({
    surface_kind: 'opl_gateway_account_state.v1',
    status: 'connected',
    account_user_id: 'test-user',
    canonical_key_name: 'app-test',
    key_id: null, key_status: null, key_group_id: null, available_groups: [],
    snapshot: {
      display_name: 'Test User', email: 'user@example.test', account_status: 'active',
      balance_amount: null, balance_currency: 'USD',
      today_tokens: null, total_tokens: null, today_actual_cost: null, total_actual_cost: null,
      cost_currency: 'USD', day_timezone: 'UTC',
    },
    observed_at: new Date().toISOString(), stale_after: null, last_error_code: null,
    codex_binding: null, transaction_stage: null,
  }), { mode: 0o600 });

  const connected = await readState();
  const account = readSettings(connected);
  assert.equal(account?.account?.display_name, 'Test User');
  for (const id of Object.values(account!.actions)) {
    assert.ok(connected.app_state.actions?.some((action) => action.action_id === id), id);
  }
  const publicState = await sdk.call('app.state.get', { profile: 'full' }) as AppStateSnapshot;
  assert.equal(readSettings(publicState), undefined);
  const initialize = await app.call('app.initialize.get', {}) as { state: AppStateSnapshot };
  assert.equal(readSettings(initialize.state)?.account?.email, 'user@example.test');
  const publicInitialize = await sdk.call('app.initialize.get', {}) as { state: AppStateSnapshot };
  assert.equal(readSettings(publicInitialize.state), undefined);

  fs.writeFileSync(accountPath, '{');
  const damaged = await readState();
  assert.equal(readSettings(damaged), undefined);
  assert.ok(Array.isArray(damaged.app_state.packages));
});
