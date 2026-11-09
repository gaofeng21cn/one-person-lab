import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizeFamilyDomainMemoryRef } from '../../src/read-models/catalog/family-domain-memory-contract.ts';
import { validateStandardDomainAgentScaffold } from '../../src/authority/packages/standard-domain-agent-scaffold-validation.ts';
import { buildReadyAgentRepo } from './cli/cases/agents-conformance-fixtures.ts';

import {
  readDurableKnowledgeCatalog,
  recallDurableKnowledge,
  bindDurableKnowledgeContext,
  validateDurableKnowledgeContext,
  verifyKnowledgeDependencies,
} from '../../src/authority/packages/durable-knowledge-catalog.ts';

import { knowledgeItem, productCatalog, sourceFixture, writeKnowledgeFile } from './knowledge-source-fixture.ts';

function sha256(content: string) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function write(root: string, ref: string, content: string) {
  const file = path.join(root, ref);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-durable-knowledge-'));
  const agentBody = '# Stage method\n\nUse the declared mechanism.\n';
  write(root, 'agent/knowledge/stage.md', agentBody);
  const item = (input: {
    id: string;
    scope: { kind: 'product', id: 'fixture-domain' };
    body: string;
    content: string;
    stages: string[];
    status?: string;
    next?: string;
  }) => ({
    surface_kind: 'opl_durable_knowledge_item',
    version: 'durable-knowledge-item.v2',
    knowledge_id: input.id,
    title: input.id,
    scope: input.scope,
    content_kind: 'mechanism',
    owner: 'fixture-domain',
    body_ref: {
      kind: 'repo_path',
      ref: input.body,
      sha256: sha256(input.content),
    },
    applicability: {
      domains: ['fixture-domain'],
      stages: input.stages,
    },
    requirement: input.id === 'fixture.stage-method' ? 'required' : 'optional',
    status: input.status ?? 'active',
    reviewed_at: '2026-01-01T00:00:00Z',
    next_review_at: input.next ?? '2099-01-01T00:00:00Z',
    authority_boundary: {
      semantic_body_owner: 'fixture-domain',
      opl_role: 'catalog_recall_and_receipt_projection_only',
    },
  });
  write(root, 'contracts/durable_knowledge_catalog.json', `${JSON.stringify({
    surface_kind: 'opl_durable_knowledge_catalog',
    version: 'durable-knowledge-catalog.v2',
    owner: 'one-person-lab',
    items: [
      item({
        id: 'fixture.stage-method',
        scope: { kind: 'product', id: 'fixture-domain' },
        body: 'agent/knowledge/stage.md',
        content: agentBody,
        stages: ['intake'],
      }),
      item({
        id: 'fixture.overdue',
        scope: { kind: 'product', id: 'fixture-domain' },
        body: 'agent/knowledge/stage.md',
        content: agentBody,
        stages: ['intake'],
        next: '2026-02-01T00:00:00Z',
      }),
      item({
        id: 'fixture.other-stage',
        scope: { kind: 'product', id: 'fixture-domain' },
        body: 'agent/knowledge/stage.md',
        content: agentBody,
        stages: ['deliver'],
      }),
    ],
  }, null, 2)}\n`);
  return root;
}

test('durable knowledge catalog selects only current applicable bodies by scope, content kind and validity', () => {
  const root = fixture();
  try {
    const catalog = readDurableKnowledgeCatalog(root);
    assert.equal(catalog.status, 'declared');
    assert.equal(catalog.items.length, 3);

    const receipt = recallDurableKnowledge({
      repoDir: root,
      domainId: 'fixture-domain',
      stageId: 'intake',
      domainPackRoot: root,
      now: new Date('2026-03-01T00:00:00Z'),
    });
    assert.deepEqual(receipt.selected.map((item) => item.knowledge_id), [
      'fixture.stage-method',
    ]);
    assert.ok(receipt.quality_debt.some(debt => debt.startsWith('knowledge_review_overdue:fixture.overdue')));
    assert.equal(receipt.authority_boundary.context_evidence_only, true);
    assert.equal(receipt.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(receipt.selected.every((item) => item.sha256.startsWith('sha256:')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('durable knowledge body digest mismatch and root escape fail closed', () => {
  const root = fixture();
  try {
    const catalogPath = path.join(root, 'contracts/durable_knowledge_catalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    catalog.items[0].body_ref.sha256 = `sha256:${'0'.repeat(64)}`;
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    assert.throws(() => recallDurableKnowledge({
      repoDir: root,
      domainId: 'fixture-domain',
      stageId: 'intake',
      domainPackRoot: root,
    }), { code: 'contract_shape_invalid' });

    catalog.items[0].body_ref.ref = '../outside.md';
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    assert.throws(() => recallDurableKnowledge({
      repoDir: root,
      domainId: 'fixture-domain',
      stageId: 'intake',
      domainPackRoot: root,
    }), /canonical contained path/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('retired descriptor cannot stand in for a durable catalog', () => {
  const root = fixture();
  try {
    write(root, 'contracts/durable_knowledge_catalog.json', `${JSON.stringify({
      surface_kind: 'domain_memory_descriptor_locator',
      schema_version: 1,
      domain_id: 'fixture-domain',
      memory_ref_id: 'fixture-memory',
      memory_body_owner: 'fixture-domain',
    })}\n`);
    assert.throws(() => readDurableKnowledgeCatalog(root), /JSON Schema validation/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid dates, mismatched ownership, scope injection and catalog escape are rejected', () => {
  const root = fixture();
  try {
    const file = path.join(root, 'contracts/durable_knowledge_catalog.json');
    const original = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const mutate of [
      (entry: any) => { entry.version = 'durable-knowledge-catalog.v1'; },
      (entry: any) => { entry.items[0].next_review_at = 'not-a-date'; },
      (entry: any) => { entry.items[0].authority_boundary.opl_role = 'domain_truth_owner'; },
      (entry: any) => { entry.items[0].scope = { kind: 'owner', id: 'private-owner' }; },
      (entry: any) => { entry.items[0].layer = 'agent_pack'; },
      (entry: any) => { entry.items[0].body_ref.ref = '../memory/private.md'; },
      (entry: any) => { entry.workspace_catalog_ref = '../other-project/catalog.json'; },
    ]) {
      const changed = structuredClone(original); mutate(changed);
      fs.writeFileSync(file, JSON.stringify(changed));
      assert.throws(() => readDurableKnowledgeCatalog(root));
    }
    fs.writeFileSync(file, JSON.stringify(original));
    const body = path.join(root, 'agent/knowledge/stage.md');
    write(root, 'memory/private.md', 'private');
    fs.unlinkSync(body); fs.symlinkSync(path.join(root, 'memory/private.md'), body);
    assert.throws(() => recallDurableKnowledge({ repoDir: root, domainPackRoot: root,
      domainId: 'fixture-domain', stageId: 'intake' }), { code: 'contract_shape_invalid' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('knowledge context freezes consumed bytes and rejects later snapshot corruption', () => {
  const root = fixture();
  try {
    const context = bindDurableKnowledgeContext({ repoDir: root, domainPackRoot: root,
      domainId: 'fixture-domain', stageId: 'intake', now: new Date('2026-03-01T00:00:00Z') });
    fs.writeFileSync(path.join(root, 'agent/knowledge/stage.md'), 'later revision');
    assert.match(validateDurableKnowledgeContext(context, 'fixture-domain', 'intake').bodies[0]!.content, /Use the declared mechanism/);
    context.bodies[0]!.content = 'tampered';
    assert.throws(() => validateDurableKnowledgeContext(context, 'fixture-domain', 'intake'), /bytes differ/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('manifest projections use the repository catalog and reject a second conflicting truth', () => {
  const root = fixture();
  try {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'contracts/durable_knowledge_catalog.json'), 'utf8'));
    assert.deepEqual(normalizeFamilyDomainMemoryRef(undefined, root), readDurableKnowledgeCatalog(root));
    assert.deepEqual(normalizeFamilyDomainMemoryRef(source, root), readDurableKnowledgeCatalog(root));
    source.items[0].status = 'quarantined';
    assert.throws(() => normalizeFamilyDomainMemoryRef(source, root), /canonical repository catalog/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('task matching and replacement scope cannot silently suppress unrelated current knowledge', () => {
  const root = fixture();
  try {
    const file = path.join(root, 'contracts/durable_knowledge_catalog.json');
    const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
    const replacement = structuredClone(catalog.items[0]);
    replacement.knowledge_id = 'fixture.replacement';
    replacement.supersedes = [catalog.items[0].knowledge_id];
    replacement.applicability.tasks = ['draft-paper'];
    catalog.items.push(replacement);
    const recall = (taskIntent: string) => recallDurableKnowledge({ repoDir: root, domainPackRoot: root,
      domainId: 'fixture-domain', stageId: 'intake', taskIntent, now: new Date('2026-03-01T00:00:00Z') });
    fs.writeFileSync(file, JSON.stringify(catalog));
    assert.deepEqual(recall('draft-paper').selected.map((item) => item.knowledge_id), ['fixture.replacement']);
    assert.deepEqual(recall('redraft-paper').selected.map((item) => item.knowledge_id), ['fixture.stage-method']);
    replacement.requirement = 'optional';
    replacement.next_review_at = '2026-02-01T00:00:00Z';
    fs.writeFileSync(file, JSON.stringify(catalog));
    assert.deepEqual(recall('draft-paper').selected.map((item) => item.knowledge_id), ['fixture.stage-method']);
    assert.ok(recall('draft-paper').quality_debt.some((debt) => debt.includes('fixture.replacement')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('agent check rejects uncataloged knowledge and invalid stage or domain applicability', () => {
  const root = buildReadyAgentRepo();
  write(root, 'agent/knowledge/forgotten.md', '# Important but disconnected lesson\n');
  const file = path.join(root, 'contracts/durable_knowledge_catalog.json');
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  catalog.domain_id = 'different-agent';
  catalog.items[0].applicability.domains = ['different-agent'];
  catalog.items[0].applicability.stages = ['absent-stage'];
  fs.writeFileSync(file, JSON.stringify(catalog));
  const result = validateStandardDomainAgentScaffold({ repoDir: root }).standard_domain_agent_scaffold_validation;
  assert.ok(result.blockers.includes('durable_knowledge_catalog_domain_mismatch'));
  assert.ok(result.blockers.includes('knowledge_body_not_cataloged:agent/knowledge/forgotten.md'));
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('knowledge_unknown_stage:')));
  assert.ok(result.blockers.some((blocker) => blocker.startsWith('knowledge_stage_not_cataloged:')));
});

test('one direct source serves owner, topic and project knowledge without intermediate body copies', () => {
  const f = sourceFixture();
  try {
    f.registry.items = [
      knowledgeItem({ id: 'owner.constraint', scope: { kind: 'owner', id: 'owner-a' }, contentKind: 'policy' }),
      f.item,
      knowledgeItem({ id: 'project.design', scope: { kind: 'project', id: 'project-finance' }, contentKind: 'decision' }),
      knowledgeItem({ id: 'project.current', scope: { kind: 'project', id: 'project-finance' }, contentKind: 'state' }),
      knowledgeItem({ id: 'other.design', scope: { kind: 'project', id: 'project-research' } }),
    ];
    f.save();
    const context = bindDurableKnowledgeContext(f.input);
    assert.deepEqual(context.bodies.map(item => item.knowledge_id), ['owner.constraint', 'owner.policy', 'project.design', 'project.current']);
    assert.ok(context.bodies.every(item => item.content === f.body));
    assert.equal(fs.existsSync(path.join(f.project, 'memory/policy.md')), false);
    assert.equal(fs.existsSync(path.join(f.workspace, 'shared/memory/bodies')), false);
    const workspaceOnly = recallDurableKnowledge({ ...f.input, projectRoot: undefined });
    assert.deepEqual(workspaceOnly.selected.map(item => item.knowledge_id), ['owner.constraint', 'owner.policy']);
    assert.throws(() => recallDurableKnowledge({ ...f.input, projectRoot: f.repo }));
  } finally { f.cleanup(); }
});

test('internal Markdown and external personal libraries yield equivalent knowledge content', () => {
  const internal = sourceFixture('workspace');
  const external = sourceFixture('external');
  try {
    const summarize = (f: ReturnType<typeof sourceFixture>) => bindDurableKnowledgeContext(f.input).bodies
      .map(({ knowledge_id, scope, content_kind, content, sha256 }) => ({ knowledge_id, scope, content_kind, content, sha256 }));
    assert.deepEqual(summarize(internal), summarize(external));
  } finally { internal.cleanup(); external.cleanup(); }
});

test('two authorized agents and workspaces share one source identity and accepted version', () => {
  const f = sourceFixture();
  try {
    const secondWorkspace = path.join(f.root, 'second-workspace');
    const secondRepo = path.join(f.root, 'second-agent');
    writeKnowledgeFile(path.join(secondRepo, 'contracts/durable_knowledge_catalog.json'), {
      ...productCatalog([]), domain_id: 'second-agent',
    });
    writeKnowledgeFile(path.join(secondRepo, 'contracts/domain_descriptor.json'), {
      domain_id: 'second-agent',
      standard_agent_interface: { runtime: { runtime_domain_id: 'second-agent' } },
    });
    fs.mkdirSync(secondWorkspace, { recursive: true });
    f.item.applicability.domains.push('second-agent');
    f.registry.sources[0]!.grants.push({ workspace_root: secondWorkspace,
      domains: ['second-agent'], scope_ids: ['finance'] });
    f.save();
    writeKnowledgeFile(path.join(secondWorkspace, 'shared/memory/knowledge-bindings.json'), f.bindings);
    const first = bindDurableKnowledgeContext(f.input);
    const secondInput = { ...f.input, repoDir: secondRepo, domainPackRoot: secondRepo,
      workspaceRoot: secondWorkspace, projectRoot: undefined, domainId: 'second-agent' };
    const second = bindDurableKnowledgeContext(secondInput);
    assert.deepEqual(second.bodies.map(({ knowledge_id, source_id, sha256, content }) => ({ knowledge_id, source_id, sha256, content })),
      first.bodies.map(({ knowledge_id, source_id, sha256, content }) => ({ knowledge_id, source_id, sha256, content })));
    assert.equal(fs.existsSync(path.join(secondWorkspace, 'shared/memory/knowledge-sources.json')), false);
    f.registry.sources[0]!.grants.pop(); f.save();
    assert.equal(recallDurableKnowledge(secondInput).selected.length, 0);
  } finally { f.cleanup(); }
});

test('source grants, selected scopes and authoritative project identity constrain private recall', () => {
  const f = sourceFixture();
  try {
    f.bindings.registries[0]!.scope_ids = ['unrelated-topic']; f.save();
    assert.equal(recallDurableKnowledge(f.input).selected.length, 0);
    f.bindings.registries[0]!.scope_ids = ['finance'];
    f.registry.sources[0]!.grants[0]!.domains = ['another-agent']; f.save();
    assert.equal(recallDurableKnowledge(f.input).selected.length, 0);
    f.registry.sources[0]!.grants[0]!.domains = ['fixture'];
    f.registry.sources[0]!.grants[0]!.workspace_root = f.root; f.save();
    assert.equal(recallDurableKnowledge(f.input).selected.length, 0);
    f.registry.sources[0]!.grants[0]!.workspace_root = f.workspace;
    f.item.scope = { kind: 'project', id: 'project-finance' };
    f.bindings.registries[0]!.scope_ids = ['project-finance']; f.save();
    writeKnowledgeFile(path.join(f.otherProject, 'project_index.json'), { project_id: 'project-finance' });
    assert.equal(recallDurableKnowledge({ ...f.input, projectRoot: f.otherProject }).selected.length, 0);
    assert.equal(recallDurableKnowledge(f.input).selected.length, 1);
  } finally { f.cleanup(); }
});

test('optional source drift creates debt and required unavailable knowledge blocks dependent work', () => {
  const f = sourceFixture();
  try {
    writeKnowledgeFile(path.join(f.source, 'policy.md'), '# Owner edited this rule\n');
    const drifted = recallDurableKnowledge(f.input);
    assert.equal(drifted.selected.length, 0);
    assert.ok(drifted.quality_debt.some(debt => debt.includes(f.item.knowledge_id)));
    f.bindings.required_knowledge_ids = [f.item.knowledge_id]; f.save();
    assert.throws(() => recallDurableKnowledge(f.input));
    f.bindings.required_knowledge_ids = ['owner.missing']; f.save();
    assert.throws(() => recallDurableKnowledge(f.input));
    f.bindings.required_knowledge_ids = []; f.item.requirement = 'required'; f.save();
    assert.throws(() => recallDurableKnowledge(f.input));
  } finally { f.cleanup(); }
});

test('derived summaries follow source revision, validity and access changes', () => {
  const f = sourceFixture();
  try {
    const summaryBody = '# Derived summary\n';
    const summary = knowledgeItem({ id: 'owner.summary', scope: { kind: 'topic', id: 'finance' },
      ref: 'summary.md', content: summaryBody });
    summary.derived_from = [{ knowledge_id: f.item.knowledge_id, sha256: f.item.body_ref.sha256! }];
    f.registry.items.push(summary);
    writeKnowledgeFile(path.join(f.source, 'summary.md'), summaryBody); f.save();
    const dependencies = [{ knowledge_id: f.item.knowledge_id, sha256: f.item.body_ref.sha256! }];
    const verify = () => verifyKnowledgeDependencies({ workspaceRoot: f.workspace, projectRoot: f.project,
      domainId: 'fixture', dependencies });
    assert.equal(verify().valid, true);
    assert.deepEqual(recallDurableKnowledge(f.input).selected.map(item => item.knowledge_id), ['owner.policy', 'owner.summary']);
    writeKnowledgeFile(path.join(f.source, 'policy.md'), '# Changed source\n');
    assert.equal(verify().valid, false);
    assert.equal(recallDurableKnowledge(f.input).selected.length, 0);
    writeKnowledgeFile(path.join(f.source, 'policy.md'), f.body);
    f.item.next_review_at = '2026-01-02T00:00:00Z'; f.save();
    assert.equal(verify().valid, false);
    assert.equal(recallDurableKnowledge(f.input).selected.length, 0);
    f.item.next_review_at = '2099-01-01T00:00:00Z';
    f.registry.sources[0]!.status = 'revoked'; f.save();
    assert.equal(verify().valid, false);
    assert.equal(recallDurableKnowledge(f.input).selected.length, 0);
  } finally { f.cleanup(); }
});

test('private source escape and duplicate identities cannot create a second authority', () => {
  const f = sourceFixture();
  try {
    f.item.requirement = 'required'; f.save();
    fs.unlinkSync(path.join(f.source, 'policy.md'));
    writeKnowledgeFile(path.join(f.root, 'outside.md'), f.body);
    fs.symlinkSync(path.join(f.root, 'outside.md'), path.join(f.source, 'policy.md'));
    assert.throws(() => recallDurableKnowledge(f.input));
    fs.unlinkSync(path.join(f.source, 'policy.md'));
    writeKnowledgeFile(path.join(f.source, 'policy.md'), f.body);
    f.registry.items.push(structuredClone(f.item)); f.save();
    assert.throws(() => recallDurableKnowledge(f.input));
  } finally { f.cleanup(); }
});
