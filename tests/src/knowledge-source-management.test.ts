import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { executeKnowledgeSourceAction, listKnowledgeSourceManagement } from '../../src/authority/packages/knowledge-source-management.ts';
import type { KnowledgeSourceRegistry } from '../../src/authority/packages/durable-knowledge-sources.ts';
import { listKnowledgeSources } from '../../src/authority/packages/durable-knowledge-sources.ts';
import { recallDurableKnowledge } from '../../src/authority/packages/durable-knowledge-catalog.ts';
import { sourceFixture } from './knowledge-source-fixture.ts';

function setup() {
  const fixture = sourceFixture();
  const deps = { profileRoot: fixture.workspace, workspaceBindings: [], now: new Date('2026-11-10T00:00:00Z') };
  return { ...fixture, deps, list: () => listKnowledgeSourceManagement(deps) };
}
test('source owner projects real bindings, accepted-version state and no body or private path', () => {
  const f = setup();
  try {
    const p = f.list();
    assert.equal(p.items.length, 1);
    const source = p.items[0]!;
    assert.equal(source.connected, true);
    assert.equal(source.authorization.status, 'authorized');
    assert.equal(source.revision.status, 'current');
    assert.equal(source.freshness.status, 'fresh');
    assert.equal(source.readiness.status, 'ready');
    assert.equal(JSON.stringify(p).includes(f.root), false);
    assert.equal(JSON.stringify(p).includes(f.body), false);
    fs.writeFileSync(path.join(f.source, 'policy.md'), '# Changed\n');
    const changed = f.list().items[0]!;
    assert.equal(changed.revision.status, 'stale');
    assert.equal(changed.reason, 'knowledge_source_revision_requires_review');
  } finally { f.cleanup(); }
});
test('expired records retain review debt without marking the readable source as broken', () => {
  const f = setup();
  try {
    f.registry.items.push({ ...structuredClone(f.item), knowledge_id: 'owner.historical-state',
      content_kind: 'state', next_review_at: '2026-01-02T00:00:00Z' });
    f.save();
    const before = fs.readFileSync(f.registryRef);
    const source = f.list().items[0]!;
    assert.equal(source.status, 'ready');
    assert.equal(source.revision.status, 'current');
    assert.equal(source.freshness.status, 'fresh');
    assert.equal(source.knowledge_count, 2);
    assert.equal(source.knowledge_health.current_count, 1);
    assert.equal(source.knowledge_health.review_due_count, 1);
    assert.deepEqual(source.knowledge_health.issues, [{ knowledge_id: 'owner.historical-state', status: 'review_due', reason: 'knowledge_review_overdue' }]);
    const scope = { workspaceRoot: f.workspace, domainId: 'fixture', now: f.deps.now };
    const sources = listKnowledgeSources(scope);
    assert.deepEqual(sources.items.map(item => item.knowledge_id), ['owner.policy']);
    assert.ok(sources.quality_debt.includes('knowledge_review_overdue:owner.historical-state'));
    assert.ok(fs.readFileSync(f.registryRef).equals(before));
    f.bindings.required_knowledge_ids = ['owner.historical-state']; f.save();
    assert.throws(() => recallDurableKnowledge({ ...f.input, now: f.deps.now }), /Required knowledge is unavailable/);
  } finally { f.cleanup(); }
});
test('inactive historical entries do not require their retired body to remain readable', () => {
  const f = setup();
  try {
    f.registry.items.push({ ...structuredClone(f.item), knowledge_id: 'owner.retired', status: 'deprecated',
      body_ref: { ...f.item.body_ref, ref: 'retired.md' } });
    f.save();
    const source = f.list().items[0]!;
    assert.equal(source.status, 'ready');
    assert.equal(source.knowledge_health.inactive_count, 1);
    assert.equal(source.knowledge_health.current_count, 1);
    assert.equal(source.knowledge_health.unavailable_count, 0);
  } finally { f.cleanup(); }
});
test('expired records with unreviewed body changes still require source repair', () => {
  const f = setup();
  try {
    f.item.next_review_at = '2026-01-02T00:00:00Z'; f.save();
    fs.writeFileSync(path.join(f.source, 'policy.md'), '# Unreviewed change\n');
    const source = f.list().items[0]!;
    assert.equal(source.status, 'attention');
    assert.equal(source.revision.status, 'stale');
    assert.equal(source.knowledge_health.unavailable_count, 1);
    assert.equal(source.knowledge_health.issues[0]?.reason, 'knowledge_source_body_requires_review');
  } finally { f.cleanup(); }
});
test('configure preserves other workspace grants and rejected revisions never write', () => {
  const f = setup();
  try {
    const other = { workspace_root: f.otherProject, domains: ['outside'], scope_ids: ['elsewhere'] };
    f.registry.sources[0]!.grants.push(other);
    f.save();
    const before = f.list().items[0]!;
    const payload = { resource_id: before.resource_id, expected_revision: before.revision_identity, scope_ids: ['finance'], consumer_domain_ids: ['fixture'], write_domain_ids: ['fixture'] };
    executeKnowledgeSourceAction('knowledge_source_configure', payload, f.deps);
    const saved = JSON.parse(fs.readFileSync(f.registryRef, 'utf8'));
    assert.deepEqual(saved.sources[0].grants.find((grant: { workspace_root: string }) => grant.workspace_root === f.otherProject), other);
    const bytes = fs.readFileSync(f.registryRef);
    assert.throws(() => executeKnowledgeSourceAction('knowledge_source_configure', payload, f.deps), /changed/);
    assert.ok(fs.readFileSync(f.registryRef).equals(bytes));
    assert.equal(fs.readFileSync(path.join(f.source, 'policy.md'), 'utf8'), f.body);
  } finally { f.cleanup(); }
});
test('disconnect removes only the selected binding and reconnect uses same source without duplicating bodies', () => {
  const f = setup();
  try {
    const row = f.list().items[0]!;
    const registryBefore = fs.readFileSync(f.registryRef);
    executeKnowledgeSourceAction('knowledge_source_disconnect', { resource_id: row.resource_id, expected_revision: row.revision_identity }, f.deps);
    assert.ok(fs.readFileSync(f.registryRef).equals(registryBefore));
    const disconnected = f.list().items[0]!;
    assert.equal(disconnected.connected, false);
    assert.equal(disconnected.reason, 'knowledge_source_disconnected');
    executeKnowledgeSourceAction('knowledge_source_configure', { resource_id: disconnected.resource_id, expected_revision: disconnected.revision_identity,
      scope_ids: ['finance'], consumer_domain_ids: ['fixture'], write_domain_ids: [] }, f.deps);
    assert.equal(f.list().items[0]!.connected, true);
    assert.equal(fs.readFileSync(path.join(f.source, 'policy.md'), 'utf8'), f.body);
    assert.deepEqual(fs.readdirSync(f.source), ['policy.md']);
  } finally { f.cleanup(); }
});
test('connecting a selected folder registers only source metadata and requires known explicit consumers', () => {
  const f = setup();
  try {
    const root = path.join(f.root, 'new-vault'); fs.mkdirSync(root); fs.writeFileSync(path.join(root, 'private.md'), '# Private body');
    const context = f.list().contexts[0]!;
    const payload = { context_id: 'profile', vault_path: root, label: 'Research notes', source_id: 'owner.research',
      scope_ids: ['research'], consumer_domain_ids: ['fixture'], write_domain_ids: [], expected_revision: context.revision };
    assert.throws(() => executeKnowledgeSourceAction('knowledge_source_connect', { ...payload, consumer_domain_ids: ['unknown-consumer'] }, f.deps), /consumers/);
    const result = executeKnowledgeSourceAction('knowledge_source_connect', payload, f.deps);
    assert.ok(result.knowledge_sources.items.some(item => item.source_id === 'owner.research'));
    assert.equal(JSON.stringify(result).includes(root), false);
    assert.equal(JSON.stringify(result).includes('# Private body'), false);
    const registry = JSON.parse(fs.readFileSync(path.join(f.workspace, 'data/knowledge-sources.json'), 'utf8'));
    assert.deepEqual(registry.items, []);
    assert.deepEqual(fs.readdirSync(root), ['private.md']);
  } finally { f.cleanup(); }
});
test('invalid explicit profile bindings remain an error and never fall back to another profile', () => {
  const f = setup();
  try {
    fs.writeFileSync(f.bindingRef, '{invalid');
    const p = f.list();
    assert.equal(p.status, 'attention_required');
    assert.equal(p.contexts[0]!.revision, null);
    assert.deepEqual(p.items, []);
    assert.throws(() => executeKnowledgeSourceAction('knowledge_source_connect', { context_id: 'profile', expected_revision: 'stale', vault_path: f.source,
      scope_ids: ['finance'], consumer_domain_ids: ['fixture'] }, f.deps));
  } finally { f.cleanup(); }
});
test('separate project grants are not flattened by an unchanged form submission', () => {
  const f = setup();
  try {
    (f.registry as KnowledgeSourceRegistry).sources[0]!.grants = [
      { workspace_root: f.workspace, domains: ['fixture'], scope_ids: ['finance'], project_ids: ['project-finance'] },
      { workspace_root: f.workspace, domains: ['other'], scope_ids: ['research'], project_ids: ['project-research'] },
    ];
    f.save();
    const p = f.list().items[0]!;
    assert.equal(p.access_editable, false);
    const bytes = fs.readFileSync(f.registryRef);
    assert.throws(() => executeKnowledgeSourceAction('knowledge_source_configure', { resource_id: p.resource_id, expected_revision: p.revision_identity,
      scope_ids: p.scope_ids, consumer_domain_ids: p.consumer_domain_ids, write_domain_ids: [] }, f.deps), /separate project or scope grants/);
    assert.ok(fs.readFileSync(f.registryRef).equals(bytes));
  } finally { f.cleanup(); }
});
test('editing one source cannot broaden the scopes of another source in the same registry', () => {
  const f = setup();
  try {
    const registry = f.registry as KnowledgeSourceRegistry;
    registry.sources.push({ ...registry.sources[0]!, source_id: 'other.notes', grants: [{ workspace_root: f.workspace, domains: ['fixture'] }] });
    f.bindings.registries[0]!.source_ids.push('other.notes');
    f.bindings.registries[0]!.scope_ids = ['finance']; f.save();
    const p = f.list().items[0]!; const bytes = fs.readFileSync(f.bindingRef);
    assert.equal(p.scope_expansion_allowed, false);
    assert.throws(() => executeKnowledgeSourceAction('knowledge_source_configure', { resource_id: p.resource_id, expected_revision: p.revision_identity,
      scope_ids: ['finance', 'research'], consumer_domain_ids: ['fixture'], write_domain_ids: [] }, f.deps), /shares its scope/);
    assert.ok(fs.readFileSync(f.bindingRef).equals(bytes));
  } finally { f.cleanup(); }
});
test('invalid registry selection errors do not include selected paths', () => {
  const f = setup();
  try {
    assert.throws(() => executeKnowledgeSourceAction('knowledge_source_connect', { context_id: 'profile', expected_revision: f.list().contexts[0]!.revision,
      registry_path: path.join(f.root, 'secret', 'missing.json'), source_id: 'owner.notes', scope_ids: ['finance'], consumer_domain_ids: ['fixture'] }, f.deps),
    error => error instanceof Error && !error.message.includes(f.root) && /unavailable or invalid/.test(error.message));
  } finally { f.cleanup(); }
});
