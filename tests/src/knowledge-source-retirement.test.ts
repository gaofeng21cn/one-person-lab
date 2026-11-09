import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { retireKnowledgeSource, inspectKnowledgeRetirement } from '../../src/authority/packages/knowledge-source-retirement.ts';
import {
  discoverKnowledgeSources, listKnowledgeSources, resolveKnowledgeSourceItem, resolveKnowledgeSourceTarget, verifyKnowledgeDependencies,
} from '../../src/authority/packages/durable-knowledge-sources.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { sourceFixture, knowledgeSha, writeKnowledgeFile } from './knowledge-source-fixture.ts';

function fixture(t: TestContext, sourceAtWorkspaceRoot = false) {
  const source = sourceFixture();
  t.after(source.cleanup);
  Object.assign(source.registry.sources[0]!.grants[0]!, { write_domains: ['fixture'] });
  if (sourceAtWorkspaceRoot) {
    fs.renameSync(path.join(source.source, 'policy.md'), path.join(source.workspace, 'policy.md'));
    source.registry.sources[0]!.root = source.workspace;
  }
  source.save();
  const scope = { workspaceRoot: source.workspace, projectRoot: source.project, domainId: 'fixture' };
  const bodyPath = fs.realpathSync(path.join(source.registry.sources[0]!.root, 'policy.md'));
  const registryPath = fs.realpathSync(source.registryRef);
  const readRegistry = () => JSON.parse(fs.readFileSync(source.registryRef, 'utf8'));
  const input = () => ({
    ...scope, knowledgeId: source.item.knowledge_id,
    expectedSha256: source.item.body_ref.sha256!,
    expectedRegistrySha256: knowledgeSha(fs.readFileSync(source.registryRef, 'utf8')),
    reason: 'The owner classified this note as retained evidence rather than current knowledge.',
    reviewer: 'owner-a', reviewRef: 'owner://fixture/retire-policy', reviewedAt: '2026-01-02T00:00:00Z',
  });
  const pendingOperation = () => {
    const root = path.join(source.workspace, 'shared/memory/knowledge-retirements');
    const entries = fs.readdirSync(root);
    assert.equal(entries.length, 1, 'one interrupted operation must retain one recovery identity');
    return entries[0]!;
  };
  return { ...source, scope, bodyPath, registryPath, readRegistry, input, pendingOperation };
}

function assertInterrupted(f: ReturnType<typeof fixture>, run: () => unknown) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    assert.equal(error.details?.operation_id, f.pendingOperation());
    assert.equal(error.details?.inspection_command, 'knowledge inspect-retirement');
    assert.equal(error.details?.retry, 'same_reviewed_request_only');
    const serialized = JSON.stringify(error);
    for (const privateValue of ['synthetic-retirement-secret', f.root, f.bodyPath, f.registryPath]) {
      assert.equal(serialized.includes(privateValue), false, 'structured error must omit native error text and private paths');
    }
    return true;
  });
}

test('retirement keeps exact recovery bytes and stable identity while removing the item from current knowledge', (t) => {
  const f = fixture(t);
  const input = f.input();
  const result = retireKnowledgeSource(input);
  assert.equal(result.status, 'retired');
  assert.equal(result.knowledge_id, f.item.knowledge_id);
  assert.equal(result.source_ref, f.item.body_ref.ref);
  assert.equal(result.before_sha256, f.item.body_ref.sha256);
  assert.equal(fs.existsSync(f.bodyPath), false);
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
  const recoveryRoot = path.join(fs.realpathSync(f.workspace), 'shared/memory/knowledge-retirements');
  assert.ok(result.recovery_path.startsWith(`${recoveryRoot}${path.sep}`));
  assert.equal(fs.statSync(result.recovery_path).mode & 0o777, 0o600);
  const retired = f.readRegistry().items[0];
  assert.equal(retired.status, 'deprecated');
  assert.equal(retired.knowledge_id, f.item.knowledge_id);
  assert.deepEqual(retired.body_ref, f.item.body_ref);
  assert.equal(listKnowledgeSources(f.scope).items.length, 0);
  assert.throws(() => resolveKnowledgeSourceItem({ ...f.scope, knowledgeId: f.item.knowledge_id }), /inactive/);
  assert.equal(verifyKnowledgeDependencies({ ...f.scope,
    dependencies: [{ knowledge_id: f.item.knowledge_id, sha256: input.expectedSha256 }],
  }).valid, false);
  const target = resolveKnowledgeSourceTarget({ ...f.scope, bodyPath: f.bodyPath });
  assert.equal(target.registered, true, 'the old locator must remain a registered identity');
  assert.equal(target.knowledge_id, f.item.knowledge_id);
  assert.equal(target.status, 'deprecated');
  const afterRegistry = fs.readFileSync(f.registryRef);
  assert.deepEqual(retireKnowledgeSource(input), result);
  assert.deepEqual(inspectKnowledgeRetirement({ ...f.scope, operationId: result.operation_id }), result);
  assert.deepEqual(fs.readFileSync(f.registryRef), afterRegistry);
});

for (const changed of ['body', 'registry'] as const) {
  test(`retirement refuses ${changed} changes made after the reviewed observation`, (t) => {
    const f = fixture(t);
    const input = f.input();
    if (changed === 'body') fs.writeFileSync(f.bodyPath, '# Concurrent owner edit\n');
    else { f.item.title = 'Concurrent metadata change'; f.save(); }
    const body = fs.readFileSync(f.bodyPath);
    const registry = fs.readFileSync(f.registryRef);
    assert.throws(() => retireKnowledgeSource(input));
    assert.deepEqual(fs.readFileSync(f.bodyPath), body);
    assert.deepEqual(fs.readFileSync(f.registryRef), registry);
  });
}

for (const restriction of ['revoked', 'read-only', 'no-write-grant', 'other-domain', 'other-project'] as const) {
  test(`retirement observes current ${restriction} authorization`, (t) => {
    const f = fixture(t);
    if (restriction === 'revoked') f.registry.sources[0]!.status = 'revoked';
    if (restriction === 'read-only') f.registry.sources[0]!.writable = false;
    if (restriction === 'no-write-grant') Object.assign(f.registry.sources[0]!.grants[0]!, { write_domains: [] });
    if (restriction === 'other-project') Object.assign(f.registry.sources[0]!.grants[0]!, { project_ids: ['project-finance'] });
    f.save();
    const input = { ...f.input(),
      ...(restriction === 'other-domain' ? { domainId: 'different-domain' } : {}),
      ...(restriction === 'other-project' ? { projectRoot: f.otherProject } : {}),
    };
    const registry = fs.readFileSync(f.registryRef);
    assert.throws(() => retireKnowledgeSource(input));
    assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), f.body);
    assert.deepEqual(fs.readFileSync(f.registryRef), registry);
  });
}

test('retirement requires an explicit observed owner review', (t) => {
  const f = fixture(t);
  const input = f.input();
  for (const review of [
    { reason: '' }, { reviewer: '' }, { reviewRef: '' }, { reviewedAt: 'not-a-date' },
    { reviewedAt: new Date(Date.now() + 60_000).toISOString() },
  ]) assert.throws(() => retireKnowledgeSource({ ...input, ...review }));
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), f.body);
  assert.equal(f.readRegistry().items[0].status, 'active');
});

test('retirement does not follow a source symlink or a recovery-directory symlink', (t) => {
  const f = fixture(t);
  const original = path.join(f.root, 'outside.md');
  fs.renameSync(f.bodyPath, original);
  fs.symlinkSync(original, f.bodyPath);
  assert.throws(() => retireKnowledgeSource(f.input()));
  assert.equal(fs.readFileSync(original, 'utf8'), f.body);
  fs.unlinkSync(f.bodyPath);
  fs.renameSync(original, f.bodyPath);
  const outside = path.join(f.root, 'outside-recovery');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.workspace, 'shared/memory/knowledge-retirements'));
  assert.throws(() => retireKnowledgeSource(f.input()));
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), f.body);
  assert.equal(f.readRegistry().items[0].status, 'active');
});

test('registry advancement followed by an interrupted source removal remains inactive and resumes exactly once', (t) => {
  const f = fixture(t);
  const input = f.input();
  const unlink = fs.unlinkSync;
  const mock = t.mock.method(fs, 'unlinkSync', (file: fs.PathLike) => {
    if (String(file) === f.bodyPath) throw new Error(`synthetic-retirement-secret: failed to remove ${f.bodyPath}`);
    return unlink(file);
  });
  try { assertInterrupted(f, () => retireKnowledgeSource(input)); }
  finally { mock.mock.restore(); }
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), f.body);
  assert.equal(f.readRegistry().items[0].status, 'deprecated');
  assert.equal(listKnowledgeSources(f.scope).items.length, 0);
  const operationId = f.pendingOperation();
  const registryBeforeInspect = fs.readFileSync(f.registryRef);
  const pending = inspectKnowledgeRetirement({ ...f.scope, operationId });
  assert.notEqual(pending.status, 'retired');
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), f.body);
  assert.deepEqual(fs.readFileSync(f.registryRef), registryBeforeInspect);
  const result = retireKnowledgeSource(input);
  assert.equal(result.operation_id, operationId);
  assert.equal(result.status, 'retired');
  assert.equal(fs.existsSync(f.bodyPath), false);
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
  assert.deepEqual(retireKnowledgeSource(input), result);
});

test('an interrupted registry update leaves the accepted source intact until retirement can resume', (t) => {
  const f = fixture(t);
  const input = f.input();
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to) === f.registryPath) throw new Error(`synthetic-retirement-secret: failed to update ${f.registryPath}`);
    return rename(from, to);
  });
  try { assertInterrupted(f, () => retireKnowledgeSource(input)); }
  finally { mock.mock.restore(); }
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), f.body);
  assert.equal(f.readRegistry().items[0].status, 'active');
  assert.equal(listKnowledgeSources(f.scope).items.length, 1);
  const result = retireKnowledgeSource(input);
  assert.equal(result.status, 'retired');
  assert.equal(fs.existsSync(f.bodyPath), false);
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
});

test('a missing final receipt can be recovered without requiring the removed source to exist', (t) => {
  const f = fixture(t);
  const input = f.input();
  const open = fs.openSync;
  const mock = t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
    if (String(args[0]).endsWith('/receipt.json')) throw new Error(`synthetic-retirement-secret: failed to create ${String(args[0])}`);
    return open(...args);
  });
  try { assertInterrupted(f, () => retireKnowledgeSource(input)); }
  finally { mock.mock.restore(); }
  assert.equal(fs.existsSync(f.bodyPath), false);
  assert.equal(f.readRegistry().items[0].status, 'deprecated');
  const result = retireKnowledgeSource(input);
  assert.equal(result.status, 'retired');
  assert.deepEqual(inspectKnowledgeRetirement({ ...f.scope, operationId: result.operation_id }), result);
});

test('historical retirement never deletes a source recreated by its owner', (t) => {
  const f = fixture(t);
  const input = f.input();
  const result = retireKnowledgeSource(input);
  fs.writeFileSync(f.bodyPath, f.body);
  const registry = fs.readFileSync(f.registryRef);
  assert.throws(() => retireKnowledgeSource(input));
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), f.body);
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
  assert.deepEqual(fs.readFileSync(f.registryRef), registry);
});

test('retirement recovery refuses changed archived evidence and revoked access', (t) => {
  const f = fixture(t);
  const input = f.input();
  const result = retireKnowledgeSource(input);
  fs.writeFileSync(result.recovery_path, '# Altered recovery bytes\n');
  assert.throws(() => retireKnowledgeSource(input));
  assert.throws(() => inspectKnowledgeRetirement({ ...f.scope, operationId: result.operation_id }));
  fs.writeFileSync(result.recovery_path, f.body);
  const registry = f.readRegistry();
  registry.sources[0].status = 'revoked';
  fs.writeFileSync(f.registryRef, JSON.stringify(registry));
  assert.throws(() => retireKnowledgeSource(input));
  assert.throws(() => inspectKnowledgeRetirement({ ...f.scope, operationId: result.operation_id }));
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
});

test('a recovery identity cannot be inspected through a different execution scope', (t) => {
  const f = fixture(t);
  const result = retireKnowledgeSource(f.input());
  assert.throws(() => inspectKnowledgeRetirement({ ...f.scope, domainId: 'different-domain', operationId: result.operation_id }));
  assert.throws(() => inspectKnowledgeRetirement({ ...f.scope, projectRoot: f.otherProject, operationId: result.operation_id }));
  assert.throws(() => inspectKnowledgeRetirement({ ...f.scope, operationId: '../outside' }));
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
});

test('unrelated registry updates do not replay a completed retirement or invalidate its receipt', (t) => {
  const f = fixture(t);
  const input = f.input();
  const result = retireKnowledgeSource(input);
  const registry = f.readRegistry();
  const other = { ...structuredClone(f.item), knowledge_id: 'owner.other', title: 'Another policy',
    body_ref: { ...f.item.body_ref, ref: 'other.md' } };
  fs.writeFileSync(path.join(f.source, 'other.md'), f.body);
  registry.items.push(other);
  fs.writeFileSync(f.registryRef, JSON.stringify(registry));
  const afterRegistry = fs.readFileSync(f.registryRef);
  assert.deepEqual(retireKnowledgeSource(input), result);
  assert.deepEqual(inspectKnowledgeRetirement({ ...f.scope, operationId: result.operation_id }), result);
  assert.deepEqual(fs.readFileSync(f.registryRef), afterRegistry);
  assert.equal(listKnowledgeSources(f.scope).items[0]?.knowledge_id, other.knowledge_id);
});

test('a workspace source never rediscovers private retirement recovery bodies as new candidates', (t) => {
  const f = fixture(t, true);
  fs.writeFileSync(path.join(f.workspace, 'unregistered.md'), '# Policy candidate\n');
  const result = retireKnowledgeSource(f.input());
  const found = discoverKnowledgeSources({ ...f.scope, query: 'Policy' });
  assert.deepEqual(found.candidates.map((candidate) => candidate.source_ref), ['unregistered.md']);
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
});

test('another authorized workspace cannot discover recovery bodies stored inside its shared source', (t) => {
  const f = fixture(t, true);
  const secondWorkspace = path.join(f.root, 'second-workspace');
  writeKnowledgeFile(path.join(secondWorkspace, 'shared/memory/knowledge-bindings.json'), f.bindings);
  f.registry.sources[0]!.grants.push({
    workspace_root: secondWorkspace, domains: ['fixture'], scope_ids: ['finance'],
  });
  f.save();
  fs.writeFileSync(path.join(f.workspace, 'unregistered.md'), '# Policy candidate\n');
  const secondScope = { workspaceRoot: secondWorkspace, domainId: 'fixture' };
  const result = retireKnowledgeSource(f.input());
  for (const scope of [f.scope, secondScope]) {
    const found = discoverKnowledgeSources({ ...scope, query: 'Policy' });
    assert.deepEqual(found.candidates.map((candidate) => candidate.source_ref), ['unregistered.md']);
  }
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
});

test('a dangling symlink recreated at the original locator is not treated as a cleared source', (t) => {
  const f = fixture(t);
  const input = f.input();
  const result = retireKnowledgeSource(input);
  const missing = path.join(f.root, 'missing-source.md');
  fs.symlinkSync(missing, f.bodyPath);
  assert.equal(fs.existsSync(f.bodyPath), false);
  assert.equal(fs.lstatSync(f.bodyPath).isSymbolicLink(), true);
  assert.throws(() => retireKnowledgeSource(input), /symlink/i);
  assert.throws(() => inspectKnowledgeRetirement({ ...f.scope, operationId: result.operation_id }), /symlink/i);
  assert.equal(fs.readlinkSync(f.bodyPath), missing);
  assert.equal(fs.readFileSync(result.recovery_path, 'utf8'), f.body);
});
