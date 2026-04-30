import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

test('family incident learning loop defines repeated failure taxonomy', () => {
  const doc = read('docs/references/family-incident-learning-loop.md');
  const contract = readJson('contracts/opl-gateway/family-incident-learning-loop.json');

  for (const kind of [
    'stalled_run',
    'status_drift',
    'missing_projection',
    'quality_reopen',
    'install_sync_drift',
    'runtime_owner_mismatch',
    'artifact_proof_missing',
    'human_gate_blocked',
  ]) {
    assert.match(doc, new RegExp(kind));
    assert.ok((contract.incident_kinds as string[]).includes(kind));
  }
});

test('family incident learning loop requires durable follow-up assets', () => {
  const doc = read('docs/references/family-incident-learning-loop.md');
  const contract = readJson('contracts/opl-gateway/family-incident-learning-loop.json');

  for (const asset of ['guard', 'test', 'contract', 'runbook', 'taxonomy_update', 'operator_projection']) {
    assert.match(doc, new RegExp(asset));
    assert.ok((contract.allowed_follow_up_assets as string[]).includes(asset));
  }
  for (const field of ['incident_id', 'domain_id', 'incident_kind', 'source_refs', 'follow_up_asset', 'closure_ref']) {
    assert.match(doc, new RegExp(field));
    assert.ok((contract.required_record_fields as string[]).includes(field));
  }
});

test('family incident learning loop blocks chat-only or OPL-only closure', () => {
  const doc = read('docs/references/family-incident-learning-loop.md');
  const contract = readJson('contracts/opl-gateway/family-incident-learning-loop.json');

  for (const rule of [
    '没有 `source_refs` 的 incident 不能关闭',
    '只有聊天总结、memory 或 terminal prose 的 incident 不能关闭',
    '没有 follow-up asset 的 incident 不能关闭',
    'domain-specific failure 不能由 `OPL` 单独宣布修复',
  ]) {
    assert.match(doc, new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.ok((contract.closure_rules as string[]).includes('source_refs_required'));
  assert.ok((contract.closure_rules as string[]).includes('follow_up_asset_required'));
  assert.ok((contract.closure_rules as string[]).includes('domain_specific_failure_requires_domain_owned_closure_ref'));
});

