import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { discoverKnowledgeSources } from '../../src/authority/packages/durable-knowledge-sources.ts';
import { buildKnowledgeCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/knowledge.ts';
import { sourceFixture, writeKnowledgeFile } from './knowledge-source-fixture.ts';

const refs = (result: ReturnType<typeof discoverKnowledgeSources>) => result.candidates.map(candidate => candidate.source_ref);

test('discovery traverses later topics without losing or repeating entries across bounded pages', () => {
  const f = sourceFixture();
  try {
    const input = { workspaceRoot: f.workspace, domainId: 'fixture', query: 'AI', limit: 20, excerptChars: 1 };
    const expected = ['a.md', 'a-z.md', 'a/1.md', 'a_/1.md', ...Array.from({ length: 40 }, (_, i) => `主题${String(i).padStart(2, '0')}/正文.md`)];
    for (const ref of [...expected].reverse()) writeKnowledgeFile(path.join(f.source, ref), 'AI candidate');
    let page = discoverKnowledgeSources(input);
    assert.equal(page.has_more, true);
    assert.equal(page.truncated, true);
    assert.equal(page.candidates.length, 20);
    const seen = [...refs(page)];
    while (page.next_cursor) {
      page = discoverKnowledgeSources({ ...input, cursor: page.next_cursor });
      seen.push(...refs(page));
    }
    assert.deepEqual(seen, [...expected].sort());
    assert.equal(new Set(seen).size, expected.length);
    assert.equal(page.has_more, false);
    assert.equal(page.truncated, false);
    assert.equal(page.next_cursor, null);
    assert.ok(page.candidates.every(candidate => candidate.excerpt.length === 1 && !candidate.accepted && candidate.candidate));
  } finally { f.cleanup(); }
});

test('source and segment-aware path filters only narrow current grant and glob permissions', async () => {
  const f = sourceFixture();
  try {
    const scope = { workspaceRoot: f.workspace, projectRoot: f.project, domainId: 'fixture' };
    Object.assign(f.registry.sources[0]!, { include_globs: ['notes/**/*.md'], exclude_globs: ['notes/excluded/**'] });
    Object.assign(f.registry.sources[0]!.grants[0]!, { project_ids: ['project-finance'] });
    const otherSource = { ...structuredClone(f.registry.sources[0]!), source_id: 'other.notes', root: path.join(f.root, 'other-vault') };
    f.registry.sources.push(otherSource); f.bindings.registries[0]!.source_ids.push(otherSource.source_id); f.save();
    for (const ref of ['notes/topic/a.md', 'notes/topic/b.md', 'notes/topic-extra/leak.md', 'notes/excluded/hidden.md', 'outside.md']) {
      writeKnowledgeFile(path.join(f.source, ref), 'AI policy');
    }
    writeKnowledgeFile(path.join(otherSource.root, 'notes/topic/other.md'), 'AI other');
    fs.symlinkSync(path.join(f.source, 'notes/topic/a.md'), path.join(f.source, 'notes/topic/link.md'));
    const input = { ...scope, query: 'AI', sourceId: 'owner.notes', pathPrefix: 'notes/topic/', limit: 1 };
    const first = discoverKnowledgeSources(input);
    assert.deepEqual(refs(first), ['notes/topic/a.md']);
    const second = discoverKnowledgeSources({ ...input, cursor: first.next_cursor! });
    assert.deepEqual(refs(second), ['notes/topic/b.md']);
    assert.equal(second.has_more, false);
    assert.deepEqual(refs(discoverKnowledgeSources({ ...input, sourceId: 'not.authorized' })), []);
    assert.deepEqual(refs(discoverKnowledgeSources({ ...input, pathPrefix: 'notes/excluded' })), []);
    assert.deepEqual(refs(discoverKnowledgeSources({ ...input, projectRoot: f.otherProject })), []);
    assert.deepEqual(refs(discoverKnowledgeSources({ ...input, domainId: 'different-domain' })), []);
    const output = await buildKnowledgeCommandSpecs()['knowledge discover']!.handler!([
      '--workspace', f.workspace, '--domain', 'fixture', '--project', f.project, '--query', 'AI',
      '--source', 'owner.notes', '--path-prefix', 'notes/topic', '--limit', '1', '--cursor', first.next_cursor!, '--excerpt-chars', '2',
    ]) as { knowledge_discovery: typeof second };
    assert.deepEqual(refs(output.knowledge_discovery), ['notes/topic/b.md']);
    assert.equal(output.knowledge_discovery.candidates[0]!.excerpt.length, 2);
    for (const pathPrefix of ['/notes', '../notes', 'notes/../other', 'notes\\other', '', '.', 'notes//topic', 'notes\0bad']) {
      assert.throws(() => discoverKnowledgeSources({ ...input, pathPrefix }), /path|contained/);
    }
  } finally { f.cleanup(); }
});

test('cursors retain keyset position across file insertion and reject changed query or authorization scope', () => {
  const f = sourceFixture();
  try {
    const input = { workspaceRoot: f.workspace, domainId: 'fixture', query: 'AI', limit: 1 };
    for (const name of ['b.md', 'd.md']) writeKnowledgeFile(path.join(f.source, name), 'AI');
    const first = discoverKnowledgeSources(input);
    assert.deepEqual(refs(first), ['b.md']);
    writeKnowledgeFile(path.join(f.source, 'a.md'), 'AI');
    writeKnowledgeFile(path.join(f.source, 'c.md'), 'AI');
    const second = discoverKnowledgeSources({ ...input, cursor: first.next_cursor! });
    assert.deepEqual(refs(second), ['c.md']);
    const last = discoverKnowledgeSources({ ...input, cursor: second.next_cursor! });
    assert.deepEqual(refs(last), ['d.md']);
    assert.equal(last.next_cursor, null);
    for (const change of [{ query: 'different' }, { sourceId: 'owner.notes' }, { pathPrefix: 'notes' }, { domainId: 'different' }, { projectRoot: f.project }]) {
      assert.throws(() => discoverKnowledgeSources({ ...input, ...change, cursor: first.next_cursor! }), /cursor.*scope/);
    }
    assert.throws(() => discoverKnowledgeSources({ ...input, cursor: '!bad' }), /cursor/);
    f.registry.sources[0]!.grants = []; f.save();
    assert.throws(() => discoverKnowledgeSources({ ...input, cursor: first.next_cursor! }), /cursor.*scope/);
    assert.deepEqual(refs(discoverKnowledgeSources(input)), []);
  } finally { f.cleanup(); }
});

test('expired registered bodies cannot reappear through an overlapping source or narrower query', () => {
  const f = sourceFixture();
  try {
    f.item.next_review_at = '2026-01-02T00:00:00Z';
    const alias = { ...structuredClone(f.registry.sources[0]!), source_id: 'alias.notes' };
    f.registry.sources.push(alias); f.bindings.registries[0]!.source_ids.push(alias.source_id); f.save();
    const input = { workspaceRoot: f.workspace, domainId: 'fixture', query: 'Policy', sourceId: 'alias.notes', pathPrefix: 'policy.md' };
    assert.deepEqual(refs(discoverKnowledgeSources(input)), []);
    fs.appendFileSync(path.join(f.source, 'policy.md'), 'unreviewed drift');
    assert.deepEqual(refs(discoverKnowledgeSources({ ...input, query: 'drift' })), []);
  } finally { f.cleanup(); }
});

test('pagination uses tuple ordering when source identities share a prefix', () => {
  const f = sourceFixture();
  try {
    const second = { ...structuredClone(f.registry.sources[0]!), source_id: 'owner.notes-', root: path.join(f.root, 'second') };
    f.registry.sources.unshift(second); f.bindings.registries[0]!.source_ids.push(second.source_id); f.save();
    writeKnowledgeFile(path.join(f.source, 'candidate.md'), 'AI');
    writeKnowledgeFile(path.join(second.root, 'candidate.md'), 'AI');
    const input = { workspaceRoot: f.workspace, domainId: 'fixture', query: 'AI', limit: 1 };
    const first = discoverKnowledgeSources(input);
    const last = discoverKnowledgeSources({ ...input, cursor: first.next_cursor! });
    assert.equal(first.candidates[0]!.source_id, 'owner.notes');
    assert.equal(last.candidates[0]!.source_id, 'owner.notes-');
    assert.equal(last.next_cursor, null);
  } finally { f.cleanup(); }
});

test('discovery excludes relocation and retirement recovery bytes even for a workspace-wide source', () => {
  const f = sourceFixture();
  try {
    f.registry.sources[0]!.root = f.workspace; f.save();
    for (const folder of ['knowledge-relocations', 'knowledge-retirements']) {
      writeKnowledgeFile(path.join(f.workspace, 'shared/memory', folder, 'operation/body.md'), 'AI private recovery');
    }
    writeKnowledgeFile(path.join(f.workspace, 'notes/current.md'), 'AI ordinary candidate');
    const found = discoverKnowledgeSources({ workspaceRoot: f.workspace, domainId: 'fixture', query: 'AI' });
    assert.deepEqual(refs(found), ['notes/current.md']);
  } finally { f.cleanup(); }
});
