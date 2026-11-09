import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';

import {
  applyKnowledgeWriteback,
  proposeKnowledgeWriteback,
  reviewKnowledgeSource,
  reviewKnowledgeWriteback,
} from '../../src/authority/packages/knowledge-source-writeback.ts';
import { resolveKnowledgeSourceItem } from '../../src/authority/packages/durable-knowledge-sources.ts';
import { assertJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';

const original = '# Investment method\n\nKeep a separate spending reserve.\n';
const replacement = Buffer.from('# Investment method\n\nKeep a spending reserve before allocating long-term funds.\n');
const review = {
  reviewer: 'fixture-owner', reviewRef: 'owner://fixture/accepted-revision',
  reviewedAt: '2026-01-02T00:00:00Z', nextReviewAt: '2099-01-01T00:00:00Z',
};
const proposal = {
  source_refs: ['owner://fixture/decision'], target_scope: { kind: 'topic', id: 'finance' },
  content_kind: 'policy', proposed_rule_or_mechanism: 'Reserve spending funds before long-term allocation.',
  evidence_class: 'owner_policy', review_requirement: 'owner_review',
};

function sha(bytes: string | Buffer) { return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`; }
function writeJson(file: string, value: unknown) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function readJson(file: string) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-knowledge-writeback-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspaceRoot = path.join(root, 'workspace');
  const sourceRoot = path.join(root, 'user-vault');
  const bodyPath = path.join(sourceRoot, 'Finance/method.md');
  const registryRef = path.join(workspaceRoot, 'shared/memory/knowledge-sources.json');
  fs.mkdirSync(path.dirname(registryRef), { recursive: true });
  fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
  fs.writeFileSync(bodyPath, original);
  const item = {
    surface_kind: 'opl_durable_knowledge_item', version: 'durable-knowledge-item.v2',
    knowledge_id: 'owner.investment-policy', title: 'Personal investment policy', owner: 'fixture-owner',
    scope: { kind: 'topic', id: 'finance' }, content_kind: 'policy',
    body_ref: { kind: 'source_path', source_id: 'personal-vault', ref: 'Finance/method.md', sha256: sha(original) },
    applicability: { domains: ['fixture'], stages: ['decide'] }, status: 'active',
    reviewed_at: '2026-01-01T00:00:00Z', next_review_at: '2099-01-01T00:00:00Z',
    authority_boundary: { semantic_body_owner: 'fixture-owner', opl_role: 'catalog_recall_and_receipt_projection_only' },
  };
  writeJson(registryRef, {
    surface_kind: 'opl_knowledge_source_registry', version: 'knowledge-source-registry.v2',
    registry_id: 'owner-knowledge', owner: 'fixture-owner',
    sources: [{ source_id: 'personal-vault', root: sourceRoot, status: 'active', writable: true,
      grants: [{ workspace_root: workspaceRoot, domains: ['fixture'], write_domains: ['fixture'], scope_ids: ['finance'] }] }],
    items: [item],
  });
  writeJson(path.join(workspaceRoot, 'shared/memory/knowledge-bindings.json'), {
    surface_kind: 'opl_knowledge_source_bindings', version: 'knowledge-source-bindings.v2',
    registries: [{ registry_ref: registryRef, source_ids: ['personal-vault'], scope_ids: ['finance'] }],
  });
  const scope = { workspaceRoot, domainId: 'fixture' };
  const revise = () => proposeKnowledgeWriteback({ ...scope, knowledgeId: item.knowledge_id, proposal, replacement });
  const accept = (proposalId: string) => reviewKnowledgeWriteback({ ...scope, ...review, proposalId, decision: 'accepted' });
  const apply = (proposalId: string) => applyKnowledgeWriteback({ ...scope, proposalId });
  const mutateRegistry = (change: (registry: ReturnType<typeof readJson>) => void) => {
    const registry = readJson(registryRef); change(registry); writeJson(registryRef, registry);
  };
  return { root, workspaceRoot, sourceRoot, bodyPath, registryRef, item, scope, revise, accept, apply, mutateRegistry };
}

test('accepted knowledge revision updates its unique source and registry without a body projection', (t) => {
  const f = fixture(t);
  const pending = f.revise();
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
  assert.deepEqual(f.revise(), pending, 'proposal retries should reuse identical immutable evidence');
  f.accept(pending.proposal_id);
  const applied = f.apply(pending.proposal_id);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.before_sha256, sha(original));
  assert.equal(applied.after_sha256, sha(replacement));
  assert.equal(applied.review_ref, review.reviewRef);
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), replacement.toString());
  const updated = readJson(f.registryRef).items[0];
  assert.equal(updated.body_ref.sha256, sha(replacement));
  assert.equal(updated.reviewed_at, review.reviewedAt);
  assert.equal(updated.next_review_at, review.nextReviewAt);
  assert.equal(fs.existsSync(path.join(f.workspaceRoot, 'shared/memory/bodies')), false);
  assert.equal(fs.existsSync(path.join(f.workspaceRoot, 'shared/memory/opl_durable_knowledge_catalog.json')), false);
  assert.deepEqual(f.apply(pending.proposal_id), applied, 'receipt readback must be idempotent');
});

test('an unreviewed source edit cannot be laundered through a new revision proposal', (t) => {
  const f = fixture(t);
  const manual = '# Policy\n\nA user changed this source.\n';
  fs.writeFileSync(f.bodyPath, manual);
  assert.throws(() => f.revise(), /changed|review|version|hash/i);
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(original));
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), manual);
});

for (const target of ['source', 'registry'] as const) {
  test(`owner review rejects ${target} changes after the proposal`, (t) => {
    const f = fixture(t);
    const pending = f.revise();
    if (target === 'source') fs.writeFileSync(f.bodyPath, '# Concurrent source edit\n');
    else f.mutateRegistry((registry) => { registry.items[0].title = 'Concurrent registry change'; });
    const bodyBeforeReview = fs.readFileSync(f.bodyPath);
    const registryBeforeReview = fs.readFileSync(f.registryRef);
    assert.throws(() => f.accept(pending.proposal_id), /changed|review|version|hash/i);
    assert.deepEqual(fs.readFileSync(f.bodyPath), bodyBeforeReview);
    assert.deepEqual(fs.readFileSync(f.registryRef), registryBeforeReview);
  });

  test(`accepted writeback rejects ${target} changes before application`, (t) => {
    const f = fixture(t);
    const pending = f.revise(); f.accept(pending.proposal_id);
    if (target === 'source') fs.writeFileSync(f.bodyPath, '# Newer owner source\n');
    else f.mutateRegistry((registry) => { registry.items[0].title = 'Newer registry metadata'; });
    const bodyBeforeApply = fs.readFileSync(f.bodyPath);
    const registryBeforeApply = fs.readFileSync(f.registryRef);
    assert.throws(() => f.apply(pending.proposal_id), /changed|review|version|hash/i);
    assert.deepEqual(fs.readFileSync(f.bodyPath), bodyBeforeApply);
    assert.deepEqual(fs.readFileSync(f.registryRef), registryBeforeApply);
  });
}

for (const restriction of ['revoked', 'read-only', 'other-domain'] as const) {
  test(`writeback observes current ${restriction} source authorization`, (t) => {
    const f = fixture(t);
    const pending = f.revise(); f.accept(pending.proposal_id);
    if (restriction === 'revoked') f.mutateRegistry((registry) => { registry.sources[0].status = 'revoked'; });
    else if (restriction === 'read-only') f.mutateRegistry((registry) => { registry.sources[0].writable = false; });
    else f.mutateRegistry((registry) => {
      registry.sources[0].grants[0].domains = ['different-domain'];
      registry.sources[0].grants[0].write_domains = ['different-domain'];
    });
    const before = fs.readFileSync(f.registryRef);
    assert.throws(() => f.apply(pending.proposal_id));
    assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
    assert.deepEqual(fs.readFileSync(f.registryRef), before);
  });
}

for (const writePermission of ['absent', 'empty'] as const) {
  test(`a readable source with ${writePermission} write domains cannot be revised or accepted`, (t) => {
    const f = fixture(t);
    f.mutateRegistry((registry) => {
      const grant = registry.sources[0].grants[0];
      if (writePermission === 'absent') delete grant.write_domains;
      else grant.write_domains = [];
    });
    const registryBefore = fs.readFileSync(f.registryRef);
    const readable = resolveKnowledgeSourceItem({ ...f.scope, knowledgeId: f.item.knowledge_id });
    assert.equal(readable.currentSha256, sha(original));
    assert.equal(fs.readFileSync(readable.bodyPath, 'utf8'), original);
    assert.equal(readable.canWrite, false);
    assert.throws(() => f.revise(), /writeback|write|permission|authorized/i);
    assert.throws(() => reviewKnowledgeSource({ ...f.scope, ...review,
      knowledgeId: f.item.knowledge_id, expectedSha256: sha(original),
    }), /writeback|write|permission|authorized/i);
    assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
    assert.deepEqual(fs.readFileSync(f.registryRef), registryBefore);
  });
}

test('a different domain cannot reuse another caller’s accepted proposal', (t) => {
  const f = fixture(t);
  const pending = f.revise(); f.accept(pending.proposal_id);
  assert.throws(() => applyKnowledgeWriteback({ ...f.scope, domainId: 'different-domain', proposalId: pending.proposal_id }));
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
});

test('accepted review must refer to the exact proposal digest', (t) => {
  const f = fixture(t);
  const pending = f.revise(); f.accept(pending.proposal_id);
  const reviewPath = path.join(path.dirname(pending.proposal_ref), 'review.json');
  const tampered = readJson(reviewPath);
  tampered.proposal_sha256 = `sha256:${'f'.repeat(64)}`;
  writeJson(reviewPath, tampered);
  assert.throws(() => f.apply(pending.proposal_id), /exact|proposal|review/i);
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
});

test('rejected owner review never permits a body update', (t) => {
  const f = fixture(t);
  const pending = f.revise();
  reviewKnowledgeWriteback({ ...f.scope, ...review, proposalId: pending.proposal_id, decision: 'rejected' });
  assert.throws(() => f.apply(pending.proposal_id), /accepted|review/i);
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
});

test('an interrupted source write resumes only through its retained exact apply intent', (t) => {
  const f = fixture(t);
  const pending = f.revise(); f.accept(pending.proposal_id);
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to) === f.registryRef) throw new Error('simulated registry write interruption');
    return rename(from, to);
  });
  try { assert.throws(() => f.apply(pending.proposal_id), /simulated registry/); }
  finally { mock.mock.restore(); }
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), replacement.toString());
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(original));
  assert.equal(fs.existsSync(path.join(path.dirname(pending.proposal_ref), 'apply-intent.json')), true);
  const result = f.apply(pending.proposal_id);
  assert.equal(result.status, 'applied');
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(replacement));
  assert.deepEqual(f.apply(pending.proposal_id), result);
});

test('matching replacement bytes alone do not authorize interrupted application recovery', (t) => {
  const f = fixture(t);
  const pending = f.revise(); f.accept(pending.proposal_id);
  fs.writeFileSync(f.bodyPath, replacement);
  assert.equal(fs.existsSync(path.join(path.dirname(pending.proposal_ref), 'apply-intent.json')), false);
  assert.throws(() => f.apply(pending.proposal_id), /changed|review|version|hash/i);
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(original));
});

test('interrupted application does not overwrite an owner undo after the registry was updated', (t) => {
  const f = fixture(t);
  const pending = f.revise(); f.accept(pending.proposal_id);
  const receiptPath = path.join(path.dirname(pending.proposal_ref), 'receipt.json');
  const open = fs.openSync;
  const mock = t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
    if (String(args[0]) === receiptPath) throw new Error('simulated apply receipt interruption');
    return open(...args);
  });
  try { assert.throws(() => f.apply(pending.proposal_id), /simulated apply receipt/); }
  finally { mock.mock.restore(); }
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), replacement.toString());
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(replacement));
  assert.equal(fs.existsSync(receiptPath), false);
  fs.writeFileSync(f.bodyPath, original);
  const registryAfter = fs.readFileSync(f.registryRef);
  assert.throws(() => f.apply(pending.proposal_id), /undo|revert|changed|registry|state|recovery/i);
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
  assert.deepEqual(fs.readFileSync(f.registryRef), registryAfter);
  assert.equal(fs.existsSync(receiptPath), false);
});

test('reviewing an owner edit accepts its current bytes without rewriting the original source', (t) => {
  const f = fixture(t);
  const manual = '# Policy\n\nUpdated by the owner in the original knowledge library.\n';
  fs.writeFileSync(f.bodyPath, manual);
  assert.throws(() => f.revise(), /changed|review|version|hash/i);
  const beforeStat = fs.statSync(f.bodyPath);
  const result = reviewKnowledgeSource({ ...f.scope, ...review, knowledgeId: f.item.knowledge_id, expectedSha256: sha(manual) });
  assert.equal(result.status, 'source_reviewed');
  assert.equal(result.before_sha256, sha(original));
  assert.equal(result.after_sha256, sha(manual));
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), manual);
  assert.equal(fs.statSync(f.bodyPath).mtimeMs, beforeStat.mtimeMs);
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(manual));
  assert.ok(f.revise().proposal_id, 'later proposals must use the newly accepted source version');
});

test('source review retries return the accepted receipt without another metadata revision', (t) => {
  const f = fixture(t);
  const manual = '# Policy updated in the user library\n';
  fs.writeFileSync(f.bodyPath, manual);
  const input = { ...f.scope, ...review, knowledgeId: f.item.knowledge_id, expectedSha256: sha(manual) };
  const first = reviewKnowledgeSource(input);
  const registryBytes = fs.readFileSync(f.registryRef);
  assert.deepEqual(reviewKnowledgeSource(input), first);
  assert.deepEqual(fs.readFileSync(f.registryRef), registryBytes);
});

test('source review recovers a persisted registry update whose receipt was interrupted', (t) => {
  const f = fixture(t);
  const manual = '# Owner policy accepted after editing in the library\n';
  fs.writeFileSync(f.bodyPath, manual);
  const input = { ...f.scope, ...review, knowledgeId: f.item.knowledge_id, expectedSha256: sha(manual) };
  const rename = fs.renameSync;
  const mock = t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    rename(from, to);
    if (String(to) === f.registryRef) throw new Error('simulated receipt interruption after registry update');
  });
  try { assert.throws(() => reviewKnowledgeSource(input), /simulated receipt/); }
  finally { mock.mock.restore(); }
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(manual));
  const result = reviewKnowledgeSource(input);
  assert.equal(result.status, 'source_reviewed');
  assert.equal(result.before_sha256, sha(original));
  assert.equal(result.after_sha256, sha(manual));
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), manual);
  assert.deepEqual(reviewKnowledgeSource(input), result);
});

test('source review cannot accept bytes changed after the maintainer inspected the source', (t) => {
  const f = fixture(t);
  const reviewed = '# Policy A inspected by the maintainer\n';
  fs.writeFileSync(f.bodyPath, reviewed);
  const expectedSha256 = sha(fs.readFileSync(f.bodyPath));
  const registryBefore = fs.readFileSync(f.registryRef);
  const unreviewed = '# Policy B introduced by another editor after inspection\n';
  fs.writeFileSync(f.bodyPath, unreviewed);
  assert.throws(() => reviewKnowledgeSource({ ...f.scope, ...review,
    knowledgeId: f.item.knowledge_id, expectedSha256,
  }), /review|expected|changed|digest|hash/i);
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), unreviewed);
  assert.deepEqual(fs.readFileSync(f.registryRef), registryBefore);
});

for (const alteration of [
  { ...proposal, target_scope: { kind: 'topic', id: 'unrelated-topic' } },
  { ...proposal, content_kind: 'mechanism' },
]) {
  test(`writeback rejects silent semantic promotion ${JSON.stringify(alteration.target_scope)} ${alteration.content_kind}`, (t) => {
    const f = fixture(t);
    assert.throws(() => proposeKnowledgeWriteback({ ...f.scope, knowledgeId: f.item.knowledge_id, proposal: alteration, replacement }), /scope|content kind/i);
    assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
  });
}

test('public knowledge list and recall satisfy their declared output schemas', { timeout: 60_000 }, (t) => {
  const f = fixture(t);
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const productRoot = path.join(f.root, 'product');
  const bodyRef = 'agent/knowledge/method.md';
  fs.mkdirSync(path.join(productRoot, 'contracts'), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(productRoot, bodyRef)), { recursive: true });
  fs.writeFileSync(path.join(productRoot, bodyRef), original);
  writeJson(path.join(productRoot, 'contracts/durable_knowledge_catalog.json'), {
    surface_kind: 'opl_durable_knowledge_catalog', version: 'durable-knowledge-catalog.v2',
    owner: 'one-person-lab', domain_id: 'fixture',
    items: [{ ...f.item, knowledge_id: 'fixture.method', owner: 'fixture',
      scope: { kind: 'product', id: 'fixture' }, content_kind: 'mechanism',
      body_ref: { kind: 'repo_path', ref: bodyRef, sha256: sha(original) },
      authority_boundary: { ...f.item.authority_boundary, semantic_body_owner: 'fixture' },
    }],
  });
  const registry = readJson(path.join(repoRoot, 'contracts/opl-framework/cli-command-registry.json'));
  for (const command of ['list', 'recall']) {
    const args = command === 'recall' ? ['--domain', 'fixture', '--stage', 'decide', '--workspace', f.workspaceRoot] : [];
    const result = spawnSync(path.join(repoRoot, 'bin/opl'), ['knowledge', command, '--repo', productRoot, ...args, '--json'], {
      cwd: repoRoot, env: { ...process.env, OPL_STATE_DIR: path.join(f.root, 'opl-state') },
      encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `CLI ${command} failed:\n${result.stdout}\n${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assertJsonSchemaPayload({ schemaId: `test-knowledge-${command}-output`, schema: registry.commands[`knowledge_${command}`].output_schema }, output);
    if (command === 'list') assert.equal(output.durable_knowledge.items[0].knowledge_id, 'fixture.method');
    else assert.deepEqual(output.durable_knowledge_recall.selected.map((item: { knowledge_id: string }) => item.knowledge_id).sort(),
      ['fixture.method', f.item.knowledge_id].sort());
  }
});

test('public knowledge CLI revises the original source and detects derived dependency drift', { timeout: 120_000 }, (t) => {
  const f = fixture(t);
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const stateRoot = path.join(f.root, 'opl-state');
  fs.mkdirSync(stateRoot);
  const proposalFile = path.join(f.root, 'proposal.json');
  const replacementFile = path.join(f.root, 'replacement.md');
  const dependenciesFile = path.join(f.root, 'dependencies.json');
  writeJson(proposalFile, proposal);
  fs.writeFileSync(replacementFile, replacement);
  writeJson(dependenciesFile, [{ knowledge_id: f.item.knowledge_id, sha256: sha(replacement) }]);
  const invoke = (command: string, args: string[]) => {
    const result = spawnSync(path.join(repoRoot, 'bin/opl'), [
      'knowledge', command, '--workspace', f.workspaceRoot, '--domain', 'fixture', ...args, '--json',
    ], { cwd: repoRoot, env: { ...process.env, OPL_STATE_DIR: stateRoot }, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.error, undefined, `CLI ${command} could not finish: ${String(result.error)}`);
    return result;
  };
  const run = (command: string, args: string[]) => {
    const result = invoke(command, args);
    assert.equal(result.status, 0, `CLI ${command} failed:\n${result.stdout}\n${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.version, 'g2');
    return output;
  };
  const pending = run('propose', ['--id', f.item.knowledge_id, '--proposal', proposalFile, '--body', replacementFile]);
  const proposalId = pending.knowledge_proposal.proposal_id;
  assert.match(proposalId, /^[a-f0-9]{64}$/);
  assert.equal(pending.knowledge_proposal.knowledge_id, f.item.knowledge_id);
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), original);
  const accepted = run('review', ['--proposal-id', proposalId, '--decision', 'accepted',
    '--reviewer', review.reviewer, '--review-ref', review.reviewRef,
    '--reviewed-at', review.reviewedAt, '--next-review-at', review.nextReviewAt]);
  assert.equal(accepted.knowledge_review.decision, 'accepted');
  assert.equal(accepted.knowledge_review.proposal_sha256, `sha256:${proposalId}`);
  const applied = run('apply', ['--proposal-id', proposalId]);
  assert.equal(applied.knowledge_writeback.status, 'applied');
  assert.equal(applied.knowledge_writeback.after_sha256, sha(replacement));
  const source = run('read-source', ['--id', f.item.knowledge_id]);
  assert.equal(source.knowledge_source.knowledge_id, f.item.knowledge_id);
  assert.equal(source.knowledge_source.content, replacement.toString());
  assert.equal(source.knowledge_source.sha256, sha(replacement));
  assert.equal(fs.readFileSync(f.bodyPath, 'utf8'), replacement.toString());
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, sha(replacement));
  const current = run('verify-dependencies', ['--dependencies', dependenciesFile]);
  assert.deepEqual(current.knowledge_dependencies, { valid: true, issues: [] });
  fs.appendFileSync(f.bodyPath, '\nA later user edit has not yet been reviewed.\n');
  const drifted = run('verify-dependencies', ['--dependencies', dependenciesFile]);
  assert.equal(drifted.knowledge_dependencies.valid, false);
  assert.ok(drifted.knowledge_dependencies.issues.some((issue: string) => issue.includes(f.item.knowledge_id)));
  assert.notEqual(invoke('read-source', ['--id', f.item.knowledge_id]).status, 0,
    'normal source consumption must reject unreviewed owner edits');
  const inspected = run('inspect-source', ['--id', f.item.knowledge_id]).knowledge_source_candidate;
  assert.equal(inspected.knowledge_id, f.item.knowledge_id);
  assert.equal(inspected.content, fs.readFileSync(f.bodyPath, 'utf8'));
  assert.equal(inspected.sha256, sha(fs.readFileSync(f.bodyPath)));
  assert.equal(inspected.accepted_sha256, sha(replacement));
  assert.notEqual(inspected.sha256, inspected.accepted_sha256);
  const reviewed = run('review-source', ['--id', f.item.knowledge_id, '--expected-sha256', inspected.sha256,
    '--reviewer', review.reviewer, '--review-ref', review.reviewRef,
    '--reviewed-at', review.reviewedAt, '--next-review-at', review.nextReviewAt]);
  assert.equal(reviewed.knowledge_writeback.status, 'source_reviewed');
  assert.equal(reviewed.knowledge_writeback.after_sha256, inspected.sha256);
  const refreshed = run('read-source', ['--id', f.item.knowledge_id]).knowledge_source;
  assert.equal(refreshed.sha256, inspected.sha256);
  assert.equal(refreshed.content, inspected.content);
  assert.equal(readJson(f.registryRef).items[0].body_ref.sha256, inspected.sha256);
});
