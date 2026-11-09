import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildKnowledgeCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/knowledge.ts';
import { bindDurableKnowledgeContext, recallDurableKnowledge } from '../../src/authority/packages/durable-knowledge-catalog.ts';
import { bindStageKnowledgeContext, readStageKnowledgeContext, revalidateStageKnowledgeContext } from '../../src/adapters/execution/family-runtime-knowledge-context.ts';
import { knowledgeItem, knowledgeSha, productCatalog, sourceFixture, writeKnowledgeFile } from './knowledge-source-fixture.ts';

test('direct CLI and hosted stages consume identical frozen source bytes without intermediate projection', async () => {
  const f = sourceFixture();
  try {
    const specs = buildKnowledgeCommandSpecs();
    const output = path.join(f.root, 'binding.json');
    await specs['knowledge prepare']!.handler!(['--repo', f.repo, '--domain', 'fixture', '--stage', 'review',
      '--workspace', f.workspace, '--project', f.project, '--task-intent', 'review-policy', '--output', output]);
    const binding = JSON.parse(fs.readFileSync(output, 'utf8'));
    const hosted = readStageKnowledgeContext(binding, 'fixture', 'review');
    assert.deepEqual(hosted, bindDurableKnowledgeContext(f.input));
    assert.equal(hosted.bodies[0]?.content, f.body);
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    writeKnowledgeFile(path.join(f.source, 'policy.md'), '# Revised owner rule\n');
    const revisedRecall = recallDurableKnowledge(f.input);
    assert.equal(revisedRecall.selected.length, 0);
    assert.ok(revisedRecall.quality_debt.some(debt => debt.includes(f.item.knowledge_id)));
    const direct = await specs['knowledge read-context']!.handler!(['--binding', output]) as { durable_knowledge_context: unknown };
    assert.deepEqual(direct.durable_knowledge_context, hosted);
    binding.receipt.selected[0].sha256 = knowledgeSha('tampered');
    writeKnowledgeFile(output, binding);
    await assert.rejects(async () => specs['knowledge read-context']!.handler!(['--binding', output]));
  } finally { f.cleanup(); }
});

test('accepted new revisions enter new snapshots while old bytes remain reproducible', () => {
  const f = sourceFixture();
  try {
    const oldBinding = bindStageKnowledgeContext(f.input);
    const revised = '# Accepted rule\n\nReserve is a liquidity constraint.\n';
    const old = { ...structuredClone(f.item), knowledge_id: 'owner.old', status: 'superseded' as const };
    f.item.body_ref.sha256 = knowledgeSha(revised);
    writeKnowledgeFile(path.join(f.source, 'policy.md'), revised);
    const stale = { ...structuredClone(f.item), knowledge_id: 'owner.stale', content_kind: 'state' as const,
      next_review_at: '2026-01-02T00:00:00Z' };
    f.registry.items = [old, f.item, stale]; f.save();
    const newBinding = bindStageKnowledgeContext(f.input);
    const context = readStageKnowledgeContext(newBinding, 'fixture', 'review');
    assert.deepEqual(context.bodies.map(body => body.knowledge_id), ['owner.policy']);
    assert.equal(context.bodies[0]?.content, revised);
    assert.ok(context.receipt.quality_debt.some(debt => debt.includes('owner.stale')));
    assert.equal(readStageKnowledgeContext(oldBinding, 'fixture', 'review').bodies[0]?.content, f.body);
  } finally { f.cleanup(); }
});

test('revoked access prevents new use of an already frozen private snapshot', () => {
  const f = sourceFixture();
  try {
    const binding = bindStageKnowledgeContext(f.input);
    f.registry.sources[0]!.status = 'revoked'; f.save();
    assert.throws(() => readStageKnowledgeContext(binding, 'fixture', 'review'));
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }));
    f.registry.sources[0]!.status = 'active';
    f.registry.sources[0]!.grants = []; f.save();
    assert.throws(() => readStageKnowledgeContext(binding, 'fixture', 'review'));
  } finally { f.cleanup(); }
});

test('action-critical policy changes invalidate old execution while preserving historical reasoning', () => {
  const f = sourceFixture();
  try {
    f.item.action_critical = true; f.save();
    const binding = bindStageKnowledgeContext(f.input);
    revalidateStageKnowledgeContext(binding, { forAction: true });
    const revised = '# New funding constraint\n';
    writeKnowledgeFile(path.join(f.source, 'policy.md'), revised);
    f.item.body_ref.sha256 = knowledgeSha(revised); f.save();
    assert.equal(readStageKnowledgeContext(binding, 'fixture', 'review').bodies[0]?.content, f.body);
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }));
    const current = bindStageKnowledgeContext(f.input);
    revalidateStageKnowledgeContext(current, { forAction: true });
    assert.equal(readStageKnowledgeContext(current, 'fixture', 'review').bodies[0]?.content, revised);
  } finally { f.cleanup(); }
});

test('source relocation preserves identity and does not require a duplicate editable body', () => {
  const f = sourceFixture();
  try {
    const before = bindDurableKnowledgeContext(f.input);
    const moved = path.join(f.root, 'renamed-vault');
    fs.renameSync(f.source, moved);
    f.registry.sources[0]!.root = moved; f.save();
    const after = bindDurableKnowledgeContext(f.input);
    assert.deepEqual(after.bodies, before.bodies);
    assert.equal(fs.existsSync(f.source), false);
    assert.equal(fs.readFileSync(path.join(moved, 'policy.md'), 'utf8'), f.body);
  } finally { f.cleanup(); }
});

test('action revalidation follows critical dependencies even when only their summary enters the stage', () => {
  const f = sourceFixture();
  try {
    f.item.action_critical = true;
    f.item.applicability.stages = ['source-review'];
    const summary = knowledgeItem({ id: 'owner.summary', scope: { kind: 'topic', id: 'finance' },
      ref: 'summary.md', content: '# Summary\n' });
    summary.derived_from = [{ knowledge_id: f.item.knowledge_id, sha256: f.item.body_ref.sha256! }];
    f.registry.items.push(summary);
    writeKnowledgeFile(path.join(f.source, 'summary.md'), '# Summary\n'); f.save();
    const binding = bindStageKnowledgeContext(f.input);
    assert.deepEqual(binding.receipt.selected.map(item => item.knowledge_id), ['owner.summary']);
    revalidateStageKnowledgeContext(binding, { forAction: true });
    const revised = '# Changed critical constraint\n';
    writeKnowledgeFile(path.join(f.source, 'policy.md'), revised);
    f.item.body_ref.sha256 = knowledgeSha(revised); f.save();
    assert.equal(readStageKnowledgeContext(binding, 'fixture', 'review').bodies[0]?.content, '# Summary\n');
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }));
  } finally { f.cleanup(); }
});

test('historical summaries retain their original transitive authorization dependencies', () => {
  const f = sourceFixture();
  try {
    f.item.scope = { kind: 'owner', id: 'owner-a' };
    f.item.applicability.stages = ['source-review'];
    const intermediate = knowledgeItem({ id: 'owner.intermediate', scope: { kind: 'topic', id: 'finance' },
      ref: 'intermediate.md', content: '# Intermediate\n' });
    intermediate.applicability.stages = ['source-review'];
    intermediate.derived_from = [{ knowledge_id: f.item.knowledge_id, sha256: f.item.body_ref.sha256! }];
    const summary = knowledgeItem({ id: 'owner.summary', scope: { kind: 'topic', id: 'finance' },
      ref: 'summary.md', content: '# Historical summary\n' });
    summary.derived_from = [{ knowledge_id: intermediate.knowledge_id, sha256: intermediate.body_ref.sha256! }];
    f.registry.items.push(intermediate, summary);
    writeKnowledgeFile(path.join(f.source, 'intermediate.md'), '# Intermediate\n');
    writeKnowledgeFile(path.join(f.source, 'summary.md'), '# Historical summary\n'); f.save();
    const binding = bindStageKnowledgeContext(f.input);
    assert.equal(readStageKnowledgeContext(binding, 'fixture', 'review').bodies[0]?.knowledge_id, summary.knowledge_id);
    intermediate.derived_from = [];
    intermediate.body_ref.sha256 = knowledgeSha('# Independently revised\n');
    writeKnowledgeFile(path.join(f.source, 'intermediate.md'), '# Independently revised\n');
    f.bindings.registries[0]!.scope_ids = ['finance']; f.save();
    assert.throws(() => readStageKnowledgeContext(binding, 'fixture', 'review'));
  } finally { f.cleanup(); }
});

test('product context cannot bypass its private dependency authorization or action checks', () => {
  const f = sourceFixture();
  try {
    f.item.action_critical = true;
    f.item.applicability.stages = ['source-review'];
    const summary = knowledgeItem({ id: 'fixture.method', scope: { kind: 'product', id: 'fixture' } });
    summary.derived_from = [{ knowledge_id: f.item.knowledge_id, sha256: f.item.body_ref.sha256! }];
    writeKnowledgeFile(path.join(f.repo, summary.body_ref.ref), '# Method\n');
    writeKnowledgeFile(path.join(f.repo, 'contracts/durable_knowledge_catalog.json'), productCatalog([summary]));
    f.save();
    const binding = bindStageKnowledgeContext(f.input);
    assert.deepEqual(binding.receipt.selected.map(item => item.knowledge_id), [summary.knowledge_id]);
    revalidateStageKnowledgeContext(binding, { forAction: true });

    f.registry.sources[0]!.status = 'revoked'; f.save();
    assert.throws(() => readStageKnowledgeContext(binding, 'fixture', 'review'), /knowledge_source_revoked/);
    f.registry.sources[0]!.status = 'active'; f.save();
    writeKnowledgeFile(path.join(f.source, 'policy.md'), '# Changed constraint\n');
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), /knowledge_action_context_changed/);
  } finally { f.cleanup(); }
});
