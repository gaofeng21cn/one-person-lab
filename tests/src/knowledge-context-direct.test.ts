import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildKnowledgeCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/knowledge.ts';
import { bindDurableKnowledgeContext, recallDurableKnowledge } from '../../src/authority/packages/durable-knowledge-catalog.ts';
import { bindStageKnowledgeContext, readStageKnowledgeContext, revalidateStageKnowledgeContext } from '../../src/adapters/execution/family-runtime-knowledge-context.ts';
import { knowledgeItem, knowledgeSha, productCatalog, sourceFixture, writeKnowledgeFile } from './knowledge-source-fixture.ts';
import { listKnowledgeSources, searchKnowledgeSources, discoverKnowledgeSources, resolveKnowledgeSourceTarget } from '../../src/authority/packages/durable-knowledge-sources.ts';
import { registerKnowledgeSource } from '../../src/authority/packages/knowledge-source-writeback.ts';

test('private discovery separates accepted metadata, authorized candidates and exact owner registration', async () => {
  const f = sourceFixture();
  try {
    const scope = { workspaceRoot: f.workspace, projectRoot: f.project, domainId: 'fixture' };
    Object.assign(f.registry.sources[0]!.grants[0]!, { write_domains: ['fixture'], project_ids: ['project-finance'] });
    Object.assign(f.registry.sources[0]!, { include_globs: ['*.md', 'notes/**/*.md'], exclude_globs: ['notes/excluded/**'] });
    f.save();
    const listing = listKnowledgeSources(scope);
    assert.equal(listing.items[0]!.knowledge_id, f.item.knowledge_id);
    assert.equal(JSON.stringify(listing).includes(f.body), false);
    assert.equal(listKnowledgeSources({ ...scope, projectRoot: f.otherProject }).items.length, 0);
    assert.equal(searchKnowledgeSources({ ...scope, query: 'policy', excerptChars: 4 }).matches[0]!.excerpt.length, 4);
    assert.throws(() => searchKnowledgeSources({ ...scope, query: 'policy', limit: 21 }));
    const candidate = knowledgeItem({ id: 'owner.new', scope: { kind: 'project', id: 'project-finance' }, ref: 'notes/new.md', content: '# New policy\n' });
    writeKnowledgeFile(path.join(f.source, candidate.body_ref.ref), '# New policy\n');
    writeKnowledgeFile(path.join(f.source, 'notes/excluded/secret.md'), '# New policy secret\n');
    fs.symlinkSync(path.join(f.source, candidate.body_ref.ref), path.join(f.source, 'linked.md'));
    const found = discoverKnowledgeSources({ ...scope, query: 'policy' });
    assert.deepEqual(found.candidates.map(item => item.source_ref), ['notes/new.md']);
    assert.equal(found.candidates[0]!.candidate, true); assert.equal(found.candidates[0]!.accepted, false);
    assert.equal(discoverKnowledgeSources({ ...scope, projectRoot: f.otherProject, query: 'policy' }).candidates.length, 0);
    assert.equal(resolveKnowledgeSourceTarget({ ...scope, bodyPath: path.join(f.source, 'policy.md') }).registered, true);
    assert.equal(resolveKnowledgeSourceTarget({ ...scope, bodyPath: path.join(f.source, 'linked.md') }).registered, false);
    const register = { ...scope, registryRef: f.registryRef, item: candidate, expectedSha256: candidate.body_ref.sha256!,
      reviewer: 'fixture-owner', reviewRef: 'owner://fixture/new-policy', reviewedAt: '2026-01-02T00:00:00Z', nextReviewAt: '2099-01-01T00:00:00Z' };
    assert.throws(() => registerKnowledgeSource({ ...register, expectedSha256: knowledgeSha('other bytes') }));
    assert.throws(() => registerKnowledgeSource({ ...register, projectRoot: f.otherProject }));
    writeKnowledgeFile(path.join(f.source, 'same-bytes.md'), '# New policy\n');
    assert.throws(() => registerKnowledgeSource({ ...register, expectedBodyPath: path.join(f.source, 'same-bytes.md') }), /expected.*body path/);
    fs.unlinkSync(path.join(f.source, 'same-bytes.md'));
    const receipt = registerKnowledgeSource(register);
    assert.equal(receipt.status, 'registered');
    const after = fs.readFileSync(f.registryRef);
    assert.deepEqual(registerKnowledgeSource(register), receipt);
    assert.deepEqual(fs.readFileSync(f.registryRef), after);
    assert.equal(listKnowledgeSources(scope).items.length, 2);
    assert.deepEqual(resolveKnowledgeSourceTarget({ ...scope, projectRoot: f.otherProject,
      bodyPath: path.join(f.source, candidate.body_ref.ref) }), { registered: true, authorized: false });
    assert.equal(discoverKnowledgeSources({ ...scope, query: 'policy' }).candidates.length, 0);
    assert.throws(() => registerKnowledgeSource({ ...register, item: { ...candidate, title: 'Conflicting identity' } }));
    const specs = buildKnowledgeCommandSpecs();
    const output = await specs['knowledge sources']!.handler!(['--workspace', f.workspace, '--domain', 'fixture', '--project', f.project]);
    assert.equal((output as { knowledge_sources: { items: unknown[] } }).knowledge_sources.items.length, 2);
    fs.appendFileSync(path.join(f.source, candidate.body_ref.ref), 'Unreviewed edit');
    assert.equal(listKnowledgeSources(scope).items.length, 1);
    f.registry.sources[0]!.status = 'revoked'; f.save();
    assert.equal(listKnowledgeSources(scope).items.length, 0);
    assert.equal(discoverKnowledgeSources({ ...scope, query: 'policy' }).candidates.length, 0);
    assert.equal(resolveKnowledgeSourceTarget({ ...scope, bodyPath: path.join(f.source, 'policy.md') }).registered, true);
  } finally { f.cleanup(); }
});

test('target routing protects registered bodies after binding narrowing and registration rejects physical aliases', () => {
  const f = sourceFixture();
  try {
    const scope = { workspaceRoot: f.workspace, projectRoot: f.project, domainId: 'fixture' };
    const input = { ...scope, bodyPath: path.join(f.source, 'policy.md') };
    f.bindings.registries[0]!.scope_ids = []; f.save();
    assert.deepEqual(resolveKnowledgeSourceTarget(input), { registered: true, authorized: false });
    f.bindings.registries[0]!.scope_ids = ['finance']; f.bindings.registries[0]!.source_ids = []; f.save();
    assert.deepEqual(resolveKnowledgeSourceTarget(input), { registered: true, authorized: false });
    f.bindings.registries[0]!.source_ids = ['owner.notes'];
    Object.assign(f.registry.sources[0]!, { exclude_globs: ['policy.md'] }); f.save();
    assert.deepEqual(resolveKnowledgeSourceTarget(input), { registered: true, authorized: false });
    Object.assign(f.registry.sources[0]!, { exclude_globs: [] });
    Object.assign(f.registry.sources[0]!.grants[0]!, { write_domains: ['fixture'] });
    f.registry.sources.push({ ...structuredClone(f.registry.sources[0]!), source_id: 'alias.notes' });
    f.bindings.registries[0]!.source_ids.push('alias.notes'); f.save();
    const item = { ...structuredClone(f.item), knowledge_id: 'owner.alias', body_ref: { ...f.item.body_ref, source_id: 'alias.notes' } };
    assert.throws(() => registerKnowledgeSource({ ...scope, registryRef: f.registryRef, item, expectedSha256: item.body_ref.sha256!,
      reviewer: 'owner', reviewRef: 'owner://alias', reviewedAt: '2026-01-02T00:00:00Z', nextReviewAt: '2099-01-01T00:00:00Z' }), /already.*identity/);
  } finally { f.cleanup(); }
});

test('registration cannot reuse a knowledge identity hidden by the current project scope', () => {
  const f = sourceFixture();
  try {
    const registryRef = path.join(f.workspace, 'shared/memory/second.json');
    f.item.scope = { kind: 'project', id: 'project-research' };
    Object.assign(f.registry.sources[0]!.grants[0]!, { write_domains: ['fixture'] });
    const second = { ...structuredClone(f.registry), registry_id: 'second', items: [] };
    writeKnowledgeFile(registryRef, second);
    f.bindings.registries.push({ ...f.bindings.registries[0]!, registry_ref: registryRef }); f.save();
    const item = knowledgeItem({ id: f.item.knowledge_id, scope: { kind: 'topic', id: 'finance' }, ref: 'new.md' });
    writeKnowledgeFile(path.join(f.source, 'new.md'), '# Policy\n');
    assert.throws(() => registerKnowledgeSource({ workspaceRoot: f.workspace, projectRoot: f.project, domainId: 'fixture',
      registryRef, item, expectedSha256: item.body_ref.sha256!, reviewer: 'owner', reviewRef: 'owner://new',
      reviewedAt: '2026-01-02T00:00:00Z', nextReviewAt: '2099-01-01T00:00:00Z' }), /already belongs/);
    assert.equal(listKnowledgeSources({ workspaceRoot: f.workspace, projectRoot: f.otherProject, domainId: 'fixture' }).items.length, 1);
  } finally { f.cleanup(); }
});

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
