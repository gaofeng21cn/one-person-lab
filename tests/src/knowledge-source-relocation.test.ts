import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { inspectKnowledgeRelocation, relocateKnowledgeSource } from '../../src/authority/packages/knowledge-source-relocation.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { resolveKnowledgeSourceItem, resolveKnowledgeSourceTarget } from '../../src/authority/packages/durable-knowledge-sources.ts';
import { sourceFixture, knowledgeSha } from './knowledge-source-fixture.ts';

function fixture(t: TestContext) {
  const f = sourceFixture();
  t.after(f.cleanup);
  Object.assign(f.registry.sources[0]!.grants[0]!, { write_domains: ['fixture'] });
  f.save();
  const scope = { workspaceRoot: f.workspace, projectRoot: f.project, domainId: 'fixture' };
  const input = () => ({ ...scope, knowledgeId: f.item.knowledge_id, sourceRef: 'policy.md', targetRef: 'current/policy.md',
    expectedSha256: f.item.body_ref.sha256!, expectedRegistrySha256: knowledgeSha(fs.readFileSync(f.registryRef, 'utf8')),
    reviewer: 'owner-a', reviewRef: 'owner://fixture/relocate-policy', reviewedAt: '2026-01-02T00:00:00Z' });
  return { ...f, scope, input, readRegistry: () => JSON.parse(fs.readFileSync(f.registryRef, 'utf8')),
    sourcePath: fs.realpathSync(path.join(f.source, 'policy.md')), targetPath: path.join(fs.realpathSync(f.source), 'current/policy.md') };
}

test('relocation preserves identity, exact body and accepted review metadata', (t) => {
  const f = fixture(t);
  const input = f.input();
  const result = relocateKnowledgeSource(input);
  assert.equal(result.status, 'relocated');
  assert.equal(result.knowledge_id, f.item.knowledge_id);
  assert.equal(fs.existsSync(f.sourcePath), false);
  assert.equal(fs.readFileSync(f.targetPath, 'utf8'), f.body);
  const item = f.readRegistry().items[0];
  assert.equal(item.body_ref.ref, 'current/policy.md');
  assert.equal(item.body_ref.sha256, f.item.body_ref.sha256);
  assert.equal(item.reviewed_at, f.item.reviewed_at);
  assert.equal(item.next_review_at, f.item.next_review_at);
  assert.equal(resolveKnowledgeSourceItem({ ...f.scope, knowledgeId: f.item.knowledge_id }).bodyPath, f.targetPath);
  assert.deepEqual(relocateKnowledgeSource(input), result);
  assert.deepEqual(inspectKnowledgeRelocation({ ...f.scope, operationId: result.operation_id }), result);
});

test('registry interruption keeps the moved bytes and resumes with the original request', (t) => {
  const f = fixture(t);
  const input = f.input();
  const link = fs.linkSync;
  const registryPath = fs.realpathSync(f.registryRef);
  const mock = t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to) === registryPath) throw new Error('synthetic-registry-failure');
    return link(from, to);
  });
  let operationId = '';
  assert.throws(() => relocateKnowledgeSource(input), (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    operationId = error.details!.operation_id as string;
    return true;
  });
  mock.mock.restore();
  assert.equal(fs.existsSync(f.sourcePath), false);
  assert.equal(fs.readFileSync(f.targetPath, 'utf8'), f.body);
  assert.throws(() => resolveKnowledgeSourceItem({ ...f.scope, knowledgeId: f.item.knowledge_id }));
  const pending = inspectKnowledgeRelocation({ ...f.scope, operationId });
  assert.ok('phase' in pending);
  assert.equal(pending.phase, 'registry_restore_required');
  const result = relocateKnowledgeSource(input);
  assert.equal(result.operation_id, operationId);
  assert.equal(resolveKnowledgeSourceItem({ ...f.scope, knowledgeId: f.item.knowledge_id }).bodyPath, f.targetPath);
});

test('missing final receipt resumes without recreating or removing new files', (t) => {
  const f = fixture(t);
  const input = f.input();
  const link = fs.linkSync;
  const mock = t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to).endsWith('/receipt.json')) throw new Error('synthetic-receipt-failure');
    return link(from, to);
  });
  assert.throws(() => relocateKnowledgeSource(input));
  mock.mock.restore();
  const result = relocateKnowledgeSource(input);
  assert.equal(result.status, 'relocated');
  const registry = f.readRegistry();
  registry.owner = 'same-owner-new-label';
  fs.writeFileSync(f.registryRef, JSON.stringify(registry));
  const before = fs.readFileSync(f.registryRef);
  assert.deepEqual(relocateKnowledgeSource(input), result);
  assert.deepEqual(fs.readFileSync(f.registryRef), before);
  fs.writeFileSync(f.sourcePath, '# New owner file\n');
  assert.throws(() => relocateKnowledgeSource(input));
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), '# New owner file\n');
});

test('source and destination filters, write grants, path escape and registered empty targets are enforced', (t) => {
  const f = fixture(t);
  const source = f.registry.sources[0]!;
  Object.assign(source.grants[0]!, { write_domains: [] });
  f.save();
  assert.throws(() => relocateKnowledgeSource(f.input()), /write grant/);
  Object.assign(source.grants[0]!, { write_domains: ['fixture'] });
  Object.assign(source, { include_globs: ['*.md'] });
  f.save();
  assert.throws(() => relocateKnowledgeSource(f.input()), /filters/);
  Object.assign(source, { include_globs: ['**/*.md'] });
  f.save();
  for (const targetRef of ['../escape.md', '/tmp/escape.md', 'current/../escape.md', 'not-markdown.json', 'policy.md']) {
    assert.throws(() => relocateKnowledgeSource({ ...f.input(), targetRef }));
  }
  const other = { ...structuredClone(f.item), knowledge_id: 'other.policy', body_ref: { ...f.item.body_ref, ref: 'current/policy.md' } };
  f.registry.items.push(other);
  f.save();
  assert.equal(resolveKnowledgeSourceTarget({ ...f.scope, bodyPath: f.targetPath }).registered, true);
  assert.throws(() => relocateKnowledgeSource(f.input()), /registered identity/);
  assert.equal(fs.existsSync(f.targetPath), false);
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), f.body);
});

test('revoked access and drift during interrupted relocation never remove owner bytes', (t) => {
  const f = fixture(t);
  const input = f.input();
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(from) === f.sourcePath) throw new Error('retain-linked-source');
    return rename(from, to);
  });
  let operationId = '';
  assert.throws(() => relocateKnowledgeSource(input), (error: unknown) => {
    operationId = (error as FrameworkContractError).details!.operation_id as string;
    return true;
  });
  mock.mock.restore();
  f.registry.sources[0]!.status = 'revoked';
  f.save();
  assert.throws(() => relocateKnowledgeSource(input), /revoked/);
  assert.throws(() => inspectKnowledgeRelocation({ ...f.scope, operationId }), /revoked/);
  f.registry.sources[0]!.status = 'active';
  f.save();
  fs.writeFileSync(f.targetPath, '# Concurrent edit through hard link\n');
  assert.throws(() => relocateKnowledgeSource(input), /changed/);
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), '# Concurrent edit through hard link\n');
  assert.equal(fs.readFileSync(f.targetPath, 'utf8'), '# Concurrent edit through hard link\n');
});

test('relocation rejects target and ancestor symlinks, including dangling targets', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.targetPath), { recursive: true });
  fs.symlinkSync(path.join(f.root, 'missing.md'), f.targetPath);
  assert.throws(() => relocateKnowledgeSource(f.input()), /symlink/);
  assert.equal(fs.lstatSync(f.targetPath).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), f.body);
  fs.unlinkSync(f.targetPath);
  fs.rmdirSync(path.dirname(f.targetPath));
  fs.symlinkSync(f.root, path.dirname(f.targetPath));
  assert.throws(() => relocateKnowledgeSource(f.input()), /symlink/);
  assert.equal(fs.lstatSync(path.dirname(f.targetPath)).isSymbolicLink(), true);
});

test('relocation refuses target conflicts and stale source versions without changing either file', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.targetPath), { recursive: true });
  fs.writeFileSync(f.targetPath, '# Existing\n');
  assert.throws(() => relocateKnowledgeSource(f.input()));
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), f.body);
  assert.equal(fs.readFileSync(f.targetPath, 'utf8'), '# Existing\n');

  fs.unlinkSync(f.targetPath);
  fs.writeFileSync(f.sourcePath, '# Owner changed\n');
  assert.throws(() => relocateKnowledgeSource(f.input()));
  assert.equal(fs.existsSync(f.targetPath), false);
});

test('relocation resumes after target hardlink creation and source rename failure', (t) => {
  const f = fixture(t);
  const originalRename = fs.renameSync;
  let failed = false;
  const mock = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (!failed && String(from) === f.sourcePath) { failed = true; throw new Error('synthetic-relocation-secret'); }
    return originalRename(from, to);
  });
  assert.throws(() => relocateKnowledgeSource(f.input()), (error: unknown) => {
    assert.ok(error instanceof FrameworkContractError);
    assert.equal(typeof error.details?.operation_id, 'string');
    assert.equal(JSON.stringify(error).includes('synthetic-relocation-secret'), false);
    return true;
  });
  mock.mock.restore();
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), f.body);
  assert.equal(fs.readFileSync(f.targetPath, 'utf8'), f.body);
  const result = relocateKnowledgeSource(f.input());
  assert.equal(result.status, 'relocated');
  assert.equal(fs.existsSync(f.sourcePath), false);
  assert.equal(fs.readFileSync(f.targetPath, 'utf8'), f.body);
});

test('source replacement at the rename boundary is retained without completing relocation', (t) => {
  const f = fixture(t);
  const input = f.input();
  const rename = fs.renameSync;
  let injected = false;
  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (!injected && String(from) === f.sourcePath) {
      injected = true;
      const replacement = path.join(f.source, '.editor-save');
      fs.writeFileSync(replacement, '# Newly edited owner body\n');
      rename(replacement, f.sourcePath);
    }
    return rename(from, to);
  });
  assert.throws(() => relocateKnowledgeSource(input), /replaced during relocation/);
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), '# Newly edited owner body\n');
  assert.equal(fs.readFileSync(f.targetPath, 'utf8'), f.body);
  assert.equal(f.readRegistry().items[0].body_ref.ref, 'policy.md');
  assert.throws(() => relocateKnowledgeSource(input), /changed/);
});

test('registry revocation at capture is restored exactly and never overwritten', (t) => {
  const f = fixture(t);
  const input = f.input();
  const rename = fs.renameSync;
  const registryPath = fs.realpathSync(f.registryRef);
  let revokedBytes = '';
  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(from) === registryPath) {
      const revoked = f.readRegistry();
      revoked.sources[0].status = 'revoked';
      revokedBytes = JSON.stringify(revoked);
      const replacement = path.join(path.dirname(registryPath), '.revoke-save');
      fs.writeFileSync(replacement, revokedBytes);
      rename(replacement, registryPath);
    }
    return rename(from, to);
  });
  assert.throws(() => relocateKnowledgeSource(input), /registry was replaced/);
  assert.equal(fs.readFileSync(f.registryRef, 'utf8'), revokedBytes);
  assert.throws(() => relocateKnowledgeSource(input), /revoked/);
  assert.equal(fs.readFileSync(f.registryRef, 'utf8'), revokedBytes);
});

test('a registry created while publication is pending wins the no-clobber boundary', (t) => {
  const f = fixture(t);
  const input = f.input();
  const link = fs.linkSync;
  const registryPath = fs.realpathSync(f.registryRef);
  const concurrent = structuredClone(f.registry);
  concurrent.sources[0]!.status = 'revoked';
  const concurrentBytes = JSON.stringify(concurrent);
  let injected = false;
  t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (!injected && String(to) === registryPath) {
      injected = true;
      fs.writeFileSync(registryPath, concurrentBytes);
    }
    return link(from, to);
  });
  assert.throws(() => relocateKnowledgeSource(input));
  assert.equal(fs.readFileSync(f.registryRef, 'utf8'), concurrentBytes);
  assert.throws(() => relocateKnowledgeSource(input), /revoked/);
});

test('interrupted relocation rechecks other bound registry identities before recovery', (t) => {
  const f = fixture(t);
  const input = f.input();
  const link = fs.linkSync;
  const mock = t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to) === f.targetPath) throw new Error('stop-before-target');
    return link(from, to);
  });
  assert.throws(() => relocateKnowledgeSource(input));
  mock.mock.restore();
  const otherRegistry = structuredClone(f.registry);
  otherRegistry.registry_id = 'other.registry';
  otherRegistry.items[0]!.knowledge_id = 'other.policy';
  otherRegistry.items[0]!.body_ref.ref = 'current/policy.md';
  const otherRef = path.join(f.workspace, 'other-registry.json');
  fs.writeFileSync(otherRef, JSON.stringify(otherRegistry));
  f.bindings.registries.push({ ...f.bindings.registries[0]!, registry_ref: otherRef });
  fs.writeFileSync(f.bindingRef, JSON.stringify(f.bindings));
  assert.throws(() => relocateKnowledgeSource(input), /another registered identity/);
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), f.body);
  assert.equal(fs.existsSync(f.targetPath), false);
});

test('a source body shared by two registered identities cannot be relocated', (t) => {
  const f = fixture(t);
  f.registry.items.push({ ...structuredClone(f.item), knowledge_id: 'owner.second-policy' });
  f.save();
  assert.throws(() => relocateKnowledgeSource(f.input()), /multiple registered identities/);
  assert.equal(fs.readFileSync(f.sourcePath, 'utf8'), f.body);
  assert.equal(fs.existsSync(f.targetPath), false);
});

test('partial evidence temporary writes do not publish truncated receipts or block retry', (t) => {
  const f = fixture(t);
  const input = f.input();
  const write = fs.writeFileSync;
  const open = fs.openSync;
  let failFd: number | undefined;
  let count = 0;
  const openMock = t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
    const fd = open(...args);
    if (String(args[0]).includes('/.opl-knowledge-publish-') && ++count === 5) failFd = fd;
    return fd;
  });
  const writeMock = t.mock.method(fs, 'writeFileSync', (...args: Parameters<typeof fs.writeFileSync>) => {
    if (args[0] === failFd) {
      write(args[0], Buffer.from('partial'));
      throw new Error('synthetic-partial-write');
    }
    return write(...args);
  });
  assert.throws(() => relocateKnowledgeSource(input));
  openMock.mock.restore();
  writeMock.mock.restore();
  assert.equal(relocateKnowledgeSource(input).status, 'relocated');
});

test('a replaced staging ancestor is rejected before any cleanup follows the symlink', (t) => {
  const f = fixture(t);
  const input = f.input();
  const unlink = fs.unlinkSync;
  let operationId = '';
  t.mock.method(fs, 'unlinkSync', (file: fs.PathLike) => {
    if (String(file).endsWith('/body')) throw new Error('stop-before-staging-cleanup');
    return unlink(file);
  });
  assert.throws(() => relocateKnowledgeSource(input), (error: unknown) => {
    operationId = (error as FrameworkContractError).details!.operation_id as string;
    return true;
  });
  t.mock.restoreAll();
  const evidence = path.join(f.workspace, 'shared/memory/knowledge-relocations', operationId);
  const operation = JSON.parse(fs.readFileSync(path.join(evidence, 'operation.json'), 'utf8'));
  const stageDir = path.join(f.source, `.opl-knowledge-relocation-${operationId}`);
  const external = fs.mkdtempSync(path.join(f.root, 'external-stage-'));
  fs.renameSync(stageDir, `${stageDir}.saved`);
  fs.symlinkSync(external, stageDir);
  fs.writeFileSync(path.join(external, 'body'), f.body);
  assert.throws(() => relocateKnowledgeSource(input), /staging path/);
  assert.equal(fs.existsSync(path.join(external, 'body')), true);
  assert.equal(operation.knowledge_id, f.item.knowledge_id);
});

test('an open registry descriptor changing captured bytes aborts publication and keeps staging evidence', (t) => {
  const f = fixture(t);
  const input = f.input();
  const fd = fs.openSync(f.registryRef, 'r+');
  const registryPath = fs.realpathSync(f.registryRef);
  t.after(() => fs.closeSync(fd));
  const originalLink = fs.linkSync;
  let injected = false;
  t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (!injected && String(to) === registryPath) {
      injected = true;
      const revoked = structuredClone(f.registry);
      revoked.sources[0]!.status = 'revoked';
      const bytes = JSON.stringify(revoked);
      fs.ftruncateSync(fd, 0); fs.writeSync(fd, bytes); fs.fsyncSync(fd);
    }
    return originalLink(from, to);
  });
  assert.throws(() => relocateKnowledgeSource(input), /staging changed/);
  const operations = fs.readdirSync(path.join(f.workspace, 'shared/memory/knowledge-relocations'));
  assert.equal(operations.length, 1);
  const record = JSON.parse(fs.readFileSync(path.join(f.workspace, 'shared/memory/knowledge-relocations', operations[0]!, 'operation.json'), 'utf8'));
  const registryStage = path.join(path.dirname(f.registryRef), `.opl-knowledge-relocation-${operations[0]}`, 'registry');
  assert.equal(fs.existsSync(registryStage), true);
  assert.equal(record.registry_ref, fs.realpathSync(f.registryRef));
});

