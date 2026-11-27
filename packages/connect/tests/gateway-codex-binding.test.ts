import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { bindGatewayKeyToCodex, readLocalCodexAccessState, restoreCodexBinding } from '../src/gateway/codex-binding.ts';

test('activating and disconnecting preserve custom routes, including edits made while connected', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-bind-'));
  const old = process.env.CODEX_HOME;
  process.env.CODEX_HOME = temp;
  t.after(() => {
    if (old === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = old;
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const file = path.join(temp, 'config.toml');
  const previous = [
    '# Keep the operator comment', 'model = "selected-model"', 'model_provider = "custom"',
    'description = """[a]', 'model_provider = "inside-a-string"', '"""',
    '[model_providers.custom]', 'base_url = "https://custom.example/v1"',
    '[[profiles.example.tools]]', 'id = "one"', '[[profiles.example.tools]]', 'id = "two"', '',
  ].join('\n');
  fs.writeFileSync(file, previous, { mode: 0o600 });
  const initial = bindGatewayKeyToCodex('first-token');
  assert.equal(readLocalCodexAccessState().model_access_source, 'opl_gateway');
  assert.equal(restoreCodexBinding(initial.binding, initial.previous_config, true), 'restored_owned_fields');
  assert.equal(fs.readFileSync(file, 'utf8'), previous);
  const next = bindGatewayKeyToCodex('second-token');
  fs.appendFileSync(file, 'request_max_retries = 8\n');
  restoreCodexBinding(next.binding, next.previous_config, true);
  const result = fs.readFileSync(file, 'utf8');
  assert.match(result, /request_max_retries = 8/);
  assert.match(result, /\bmodel_provider = "custom"/);
  assert.match(result, /model_provider = "inside-a-string"/);
  assert.equal(result.includes('second-token'), false);
  assert.equal((result.match(/\[\[profiles\.example\.tools\]\]/g) ?? []).length, 2);
});

test('legacy inline providers can be activated and restored without discarding manual key overrides', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-legacy-'));
  const old = process.env.CODEX_HOME;
  process.env.CODEX_HOME = temp;
  t.after(() => {
    if (old === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = old;
    fs.rmSync(temp, {recursive: true, force: true});
  });
  const file = path.join(temp, 'config.toml');
  const previous = "model_provider = 'gflabtoken'\nmodel_providers = { 'gflabtoken' = { base_url = 'https://gflabtoken.cn/v1', experimental_bearer_token = 'original' } }\n";
  fs.writeFileSync(file, previous, {mode: 0o600});
  const active = bindGatewayKeyToCodex('managed');
  assert.equal(active.binding.provider_id, 'gflabtoken');
  assert.equal(readLocalCodexAccessState().provider_base_url, 'https://gflabtoken.cn/v1');
  const managed = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, managed.replace('managed', 'replacement'));
  assert.equal(restoreCodexBinding(active.binding, previous, true), 'manual_override_preserved');
  assert.match(fs.readFileSync(file, 'utf8'), /replacement/);
  fs.writeFileSync(file, managed);
  restoreCodexBinding(active.binding, previous, true);
  assert.equal(fs.readFileSync(file, 'utf8'), previous);
});
