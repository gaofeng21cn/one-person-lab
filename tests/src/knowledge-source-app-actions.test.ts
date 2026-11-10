import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import registry from '../../contracts/opl-framework/cli-command-registry.json' with { type: 'json' };
import settingsContract from '../../contracts/opl-framework/settings-control-center-action-read-model-contract.json' with { type: 'json' };
import { buildKnowledgeCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/knowledge.ts';
import { bindCommandRegistryMetadata, parseRegisteredCommandOptions } from '../../src/entrypoints/cli/modules/command-registry.ts';
import { executeKnowledgeSourceAppAction } from '../../src/read-models/operator/app-state-parts/action-execute-knowledge-sources.ts';
import { SETTINGS_CONTROL_CENTER_ACTIONS } from '../../src/read-models/operator/app-state-settings-control-center-parts/action-catalog.ts';
import { runCli, runCliFailure } from './cli/helpers-parts/runner.ts';

test('knowledge source CLI preserves scoped repeated fields and the exact revision', () => {
  const specs = buildKnowledgeCommandSpecs();
  const entries = Object.fromEntries(Object.entries(registry.commands).filter(([key]) => key.startsWith('knowledge_')));
  bindCommandRegistryMetadata(specs, entries);
  const spec = specs['knowledge source-connect']!;
  const parsed = parseRegisteredCommandOptions('knowledge source-connect', [
    '--context-id', 'profile', '--vault-path', '/private/library',
    '--scope-id', 'person.a', '--scope-id', 'topic.a',
    '--consumer-domain-id', 'persona', '--consumer-domain-id', 'relay',
    '--write-domain-id', 'persona', '--expected-revision', 'revision-a',
  ], spec);
  assert.deepEqual(parsed['scope-id'], ['person.a', 'topic.a']);
  assert.deepEqual(parsed['consumer-domain-id'], ['persona', 'relay']);
  assert.deepEqual(parsed['write-domain-id'], ['persona']);
  assert.equal(parsed['expected-revision'], 'revision-a');
  assert.throws(() => parseRegisteredCommandOptions('knowledge source-connect', ['--context-id', 'profile'], spec), /requires/);
});

test('knowledge source App changes require confirmation and reject dry-run before writing', () => {
  for (const operation of ['connect', 'configure', 'disconnect']) {
    const actionId = `knowledge_source_${operation}`;
    const action = SETTINGS_CONTROL_CENTER_ACTIONS.find(entry => entry.action_id === actionId);
    assert.ok(action);
    assert.equal(action.confirmation_required, true);
    assert.equal(action.dry_run_supported, false);
    assert.equal(settingsContract.allowed_action_ids.includes(actionId), true);
    assert.throws(() => executeKnowledgeSourceAppAction({ actionId, payload: {}, dryRun: true }), /do not support dry-run/);
  }
  assert.equal(executeKnowledgeSourceAppAction({ actionId: 'unrelated_action', payload: {}, dryRun: false }), null);
});

test('knowledge source CLI and App actions share scoped state without returning local paths or note bodies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-knowledge-action-'));
  const vault = path.join(root, 'private-notes');
  const noteBody = 'A private note body that must stay in its source.';
  const env = { OPL_STATE_DIR: path.join(root, 'state'), OPL_PROFILE_WORKSPACE: path.join(root, 'profile') };
  fs.mkdirSync(vault);
  fs.writeFileSync(path.join(vault, 'note.md'), noteBody);
  const assertSafe = (value: unknown) => {
    const text = JSON.stringify(value);
    assert.equal(text.includes(root), false);
    assert.equal(text.includes(noteBody), false);
  };
  try {
    const initial = runCli(['knowledge', 'source-list'], env).knowledge_sources;
    const context = initial.contexts.find((entry: { context_id: string }) => entry.context_id === 'profile');
    const consumer = initial.available_consumers[0].domain_id as string;
    const connected = runCli(['knowledge', 'source-connect', '--context-id', 'profile', '--vault-path', vault,
      '--source-id', 'test.notes', '--scope-id', 'person.test', '--consumer-domain-id', consumer,
      '--expected-revision', context.revision], env);
    assertSafe(connected);
    const item = connected.knowledge_sources.items[0];
    assert.equal(item.connected, true);
    assert.deepEqual(item.scope_ids, ['person.test']);
    const readback = runCli(['app', 'action', 'execute', '--action', 'knowledge_source_list'], env).app_action_execution;
    assertSafe(readback);
    assert.equal(readback.delegated_surface, 'opl knowledge source-list');
    assert.equal(readback.result.knowledge_sources.items[0].resource_id, item.resource_id);
    const changed = runCli(['app', 'action', 'execute', '--action', 'knowledge_source_configure', '--payload', JSON.stringify({
      resource_id: item.resource_id, scope_ids: ['person.test'], consumer_domain_ids: [consumer], write_domain_ids: [consumer],
      expected_revision: item.revision_identity,
    })], env).app_action_execution.result;
    assertSafe(changed);
    assert.deepEqual(changed.knowledge_sources.items[0].write_domain_ids, [consumer]);
    const stale = runCliFailure(['knowledge', 'source-disconnect', '--resource-id', item.resource_id,
      '--expected-revision', item.revision_identity], env).payload;
    assert.equal(stale.error.details.reason_code, 'knowledge_source_changed');
    assertSafe(stale);
    const disconnected = runCli(['knowledge', 'source-disconnect', '--resource-id', item.resource_id,
      '--expected-revision', changed.knowledge_sources.items[0].revision_identity], env);
    assertSafe(disconnected);
    assert.equal(disconnected.knowledge_sources.items[0].connected, false);
    assert.equal(fs.readFileSync(path.join(vault, 'note.md'), 'utf8'), noteBody);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
