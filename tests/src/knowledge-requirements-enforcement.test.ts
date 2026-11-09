import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateKnowledgeRequirements, type KnowledgeRequirement } from '../../src/authority/evolution/protocol.ts';
import { recallDurableKnowledge } from '../../src/authority/packages/durable-knowledge-catalog.ts';
import { bindStageKnowledgeContext, readStageKnowledgeContext, revalidateStageKnowledgeContext } from '../../src/adapters/execution/family-runtime-knowledge-context.ts';
import { knowledgeItem, knowledgeSha, sourceFixture, writeKnowledgeFile } from './knowledge-source-fixture.ts';

const requirement = (overrides: Partial<KnowledgeRequirement> = {}): KnowledgeRequirement => ({
  requirement_id: 'finance.policy', scope_kind: 'topic', content_kind: 'policy',
  semantic_owner_ref: 'owner-a', source_modes: ['external'], requirement: 'required',
  freshness_policy: 'reviewed-source', writeback_owner_ref: 'owner-a',
  derived_dependency_policy: 'exact-source-revisions', action_critical: false, ...overrides,
});
const unavailable = { code: 'contract_shape_invalid', message: 'Required knowledge is unavailable.' };

for (const flag of ['action_critical', 'required'] as const) {
  test(`new ${flag} knowledge blocks action from an older snapshot`, () => {
    const f = sourceFixture();
    try {
      const binding = bindStageKnowledgeContext(f.input);
      const policy = knowledgeItem({ id: 'owner.new-policy', scope: f.item.scope, contentKind: 'policy',
        ref: 'new-policy.md', content: '# New funding rule\n' });
      if (flag === 'action_critical') policy.action_critical = true;
      else policy.requirement = 'required';
      f.registry.items.push(policy);
      f.write(path.join(f.source, 'new-policy.md'), '# New funding rule\n'); f.save();
      assert.deepEqual(readStageKnowledgeContext(binding, 'fixture', 'review').bodies.map(body => body.knowledge_id), [f.item.knowledge_id]);
      assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), /knowledge_action_context_changed:owner.new-policy/);
      const refreshed = bindStageKnowledgeContext(f.input);
      assert.deepEqual(refreshed.receipt.selected.map(item => item.knowledge_id), [f.item.knowledge_id, policy.knowledge_id]);
      assert.equal(revalidateStageKnowledgeContext(refreshed, { forAction: true }).valid, true);
    } finally { f.cleanup(); }
  });
}

test('new critical policies for another stage or task do not invalidate an unrelated action', () => {
  const f = sourceFixture();
  try {
    const binding = bindStageKnowledgeContext(f.input);
    const policy = knowledgeItem({ id: 'owner.other-policy', scope: f.item.scope, contentKind: 'policy' });
    policy.action_critical = true;
    policy.applicability.stages = ['another-stage'];
    f.registry.items.push(policy); f.save();
    assert.equal(revalidateStageKnowledgeContext(binding, { forAction: true }).valid, true);
    policy.applicability.stages = ['review'];
    policy.applicability.tasks = ['another-task']; f.save();
    assert.equal(revalidateStageKnowledgeContext(binding, { forAction: true }).valid, true);
    policy.applicability.tasks = ['review-policy']; f.save();
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), /knowledge_action_context_changed:owner.other-policy/);
  } finally { f.cleanup(); }
});

test('a new binding-level exact requirement invalidates a snapshot that did not consume it', () => {
  const f = sourceFixture();
  try {
    const binding = bindStageKnowledgeContext(f.input);
    const policy = knowledgeItem({ id: 'owner.new-required', scope: f.item.scope, contentKind: 'policy' });
    f.registry.items.push(policy); f.save();
    assert.equal(revalidateStageKnowledgeContext(binding, { forAction: true }).valid, true);
    f.bindings.required_knowledge_ids = [policy.knowledge_id]; f.save();
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), /knowledge_action_context_changed:owner.new-required/);
    assert.equal(revalidateStageKnowledgeContext(bindStageKnowledgeContext(f.input), { forAction: true }).valid, true);
  } finally { f.cleanup(); }
});

test('binding requirements apply only to their known stage and task while missing registries still fail closed', () => {
  const f = sourceFixture();
  try {
    f.bindings.required_knowledge_ids = [f.item.knowledge_id];
    f.item.applicability.stages = ['another-stage']; f.save();
    const binding = bindStageKnowledgeContext(f.input);
    assert.deepEqual(binding.receipt.selected, []);
    assert.equal(revalidateStageKnowledgeContext(binding, { forAction: true }).valid, true);
    f.item.applicability.stages = ['review'];
    f.item.applicability.tasks = ['another-task']; f.save();
    assert.deepEqual(recallDurableKnowledge(f.input).selected, []);
    assert.equal(revalidateStageKnowledgeContext(binding, { forAction: true }).valid, true);
    fs.rmSync(f.registryRef);
    assert.throws(() => recallDurableKnowledge(f.input), /knowledge_registry_unavailable/);
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), /knowledge_registry_unavailable/);
  } finally { f.cleanup(); }
});

test('memory policy requirements match exact owner, scope, content kind and physical source mode', () => {
  const f = sourceFixture();
  try {
    const policyPath = path.join(f.repo, 'contracts/memory_policy.json');
    const mismatches: Partial<KnowledgeRequirement>[] = [
      { semantic_owner_ref: 'owner-b' }, { scope_kind: 'owner' },
      { content_kind: 'state' }, { source_modes: ['workspace'] },
    ];
    writeKnowledgeFile(policyPath, { knowledge_requirements: [requirement()] });
    assert.deepEqual(recallDurableKnowledge(f.input).selected.map(item => item.knowledge_id), [f.item.knowledge_id]);
    for (const mismatch of mismatches) {
      writeKnowledgeFile(policyPath, { knowledge_requirements: [requirement(mismatch)] });
      assert.throws(() => recallDurableKnowledge(f.input), unavailable, JSON.stringify(mismatch));
    }
  } finally { f.cleanup(); }
});

test('explicit owner mappings select named knowledge and cannot substitute another owners policy', () => {
  const f = sourceFixture();
  try {
    const semanticOwner = 'owner://current-user';
    writeKnowledgeFile(path.join(f.repo, 'contracts/memory_policy.json'), {
      knowledge_requirements: [requirement({ semantic_owner_ref: semanticOwner })],
    });
    const otherPolicy = { ...structuredClone(f.item), knowledge_id: 'other.policy', owner: 'owner-b',
      authority_boundary: { ...f.item.authority_boundary, semantic_body_owner: 'owner-b' } };
    f.registry.items.push(otherPolicy); f.save();
    assert.throws(() => recallDurableKnowledge(f.input), unavailable);
    const mapping = { requirement_id: 'finance.policy', semantic_owner_ref: semanticOwner,
      owner_id: 'owner-a', knowledge_ids: [f.item.knowledge_id] };
    const bind = (overrides: Partial<typeof mapping> = {}) => writeKnowledgeFile(f.bindingRef, {
      ...f.bindings, requirement_bindings: [{ ...mapping, ...overrides }],
    });
    bind();
    assert.equal(recallDurableKnowledge(f.input).selected.length, 2);
    for (const mismatch of [
      { owner_id: 'owner-b' }, { knowledge_ids: [otherPolicy.knowledge_id] },
      { semantic_owner_ref: 'owner://another-user' }, { requirement_id: 'another.requirement' },
    ]) {
      bind(mismatch);
      assert.throws(() => recallDurableKnowledge(f.input), unavailable, JSON.stringify(mismatch));
    }
  } finally { f.cleanup(); }
});

test('a source rooted at the workspace itself satisfies workspace-only requirements', () => {
  const f = sourceFixture();
  try {
    f.registry.sources[0]!.root = f.workspace;
    f.write(path.join(f.workspace, 'policy.md'), f.body); f.save();
    writeKnowledgeFile(path.join(f.repo, 'contracts/memory_policy.json'), {
      knowledge_requirements: [requirement({ source_modes: ['workspace'] })],
    });
    assert.deepEqual(recallDurableKnowledge(f.input).selected.map(item => item.knowledge_id), [f.item.knowledge_id]);
  } finally { f.cleanup(); }
});

test('action-critical requirements promote their matched source into execution revalidation', () => {
  const f = sourceFixture();
  try {
    writeKnowledgeFile(path.join(f.repo, 'contracts/memory_policy.json'), {
      knowledge_requirements: [requirement({ action_critical: true })],
    });
    const binding = bindStageKnowledgeContext(f.input);
    assert.equal(binding.receipt.selected[0]?.action_critical, true);
    assert.equal(f.item.action_critical, undefined);
    assert.equal(revalidateStageKnowledgeContext(binding, { forAction: true }).valid, true);
    const revised = '# Updated constraint\n';
    f.item.body_ref.sha256 = knowledgeSha(revised);
    f.write(path.join(f.source, 'policy.md'), revised); f.save();
    assert.equal(readStageKnowledgeContext(binding, 'fixture', 'review').bodies[0]?.content, f.body);
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), /knowledge_action_context_changed:owner.policy/);
  } finally { f.cleanup(); }
});

test('runtime policy validation rejects malformed knowledge requirements instead of ignoring them', () => {
  const f = sourceFixture();
  try {
    const { freshness_policy: _missing, ...missingField } = requirement();
    const invalid = [
      { requirements: [requirement()] },
      [{ ...requirement(), unrecognized: true }], [missingField],
      [{ ...requirement(), scope_kind: 'personal' }],
      [{ ...requirement(), scope_kind: 'product', source_modes: ['external'] }],
      [{ ...requirement(), source_modes: ['remote'] }],
      [requirement(), requirement()],
    ];
    for (const requirements of invalid) {
      assert.throws(() => validateKnowledgeRequirements(requirements), { code: 'contract_shape_invalid' });
      writeKnowledgeFile(path.join(f.repo, 'contracts/memory_policy.json'), { knowledge_requirements: requirements });
      assert.throws(() => recallDurableKnowledge(f.input), { code: 'contract_shape_invalid' });
    }
  } finally { f.cleanup(); }
});
