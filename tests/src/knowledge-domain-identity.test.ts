import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  bindStageKnowledgeContext, readStageKnowledgeContext, revalidateStageKnowledgeContext,
} from '../../src/adapters/execution/family-runtime-knowledge-context.ts';
import { knowledgeItem, knowledgeSha, sourceFixture } from './knowledge-source-fixture.ts';

function aliasedSourceFixture() {
  const f = sourceFixture();
  f.write(path.join(f.repo, 'contracts/domain_descriptor.json'), {
    domain_id: 'fixture',
    standard_agent_interface: { runtime: { runtime_domain_id: 'fixture-runtime' } },
  });
  return { ...f, input: { ...f.input, domainId: 'fixture-runtime' } };
}

test('runtime domain aliases preserve receipt identity while knowledge access uses the canonical domain', () => {
  const f = aliasedSourceFixture();
  try {
    f.item.action_critical = true;
    f.save();
    const binding = bindStageKnowledgeContext(f.input);
    assert.equal(binding.receipt.domain_id, 'fixture-runtime');
    assert.equal(binding.receipt.knowledge_domain_id, 'fixture');
    assert.deepEqual(f.registry.sources[0]!.grants[0]!.domains, ['fixture']);
    assert.deepEqual(f.item.applicability.domains, ['fixture']);
    assert.deepEqual(binding.receipt.selected.map(item => item.knowledge_id), [f.item.knowledge_id]);
    assert.equal(readStageKnowledgeContext(binding, 'fixture-runtime', 'review').bodies[0]?.content, f.body);
    assert.equal(revalidateStageKnowledgeContext(binding, { forAction: true }).valid, true);

    const revised = '# Updated action constraint\n';
    f.write(path.join(f.source, f.item.body_ref.ref), revised);
    f.item.body_ref.sha256 = knowledgeSha(revised);
    f.save();
    assert.equal(readStageKnowledgeContext(binding, 'fixture-runtime', 'review').bodies[0]?.content, f.body);
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), {
      code: 'contract_shape_invalid', message: `knowledge_action_context_changed:${f.item.knowledge_id}`,
    });
    assert.equal(revalidateStageKnowledgeContext(bindStageKnowledgeContext(f.input), { forAction: true }).valid, true);
  } finally { f.cleanup(); }
});

test('new canonical-domain critical knowledge invalidates an earlier runtime-alias action context', () => {
  const f = aliasedSourceFixture();
  try {
    const binding = bindStageKnowledgeContext(f.input);
    const content = '# Additional action constraint\n';
    const critical = knowledgeItem({
      id: 'owner.additional-policy', scope: f.item.scope, contentKind: 'policy',
      ref: 'additional-policy.md', content,
    });
    critical.action_critical = true;
    f.registry.items.push(critical);
    f.write(path.join(f.source, critical.body_ref.ref), content);
    f.save();

    assert.equal(readStageKnowledgeContext(binding, 'fixture-runtime', 'review').bodies[0]?.content, f.body);
    assert.throws(() => revalidateStageKnowledgeContext(binding, { forAction: true }), {
      code: 'contract_shape_invalid', message: `knowledge_action_context_changed:${critical.knowledge_id}`,
    });
    const current = bindStageKnowledgeContext(f.input);
    assert.deepEqual(current.receipt.selected.map(item => item.knowledge_id), [f.item.knowledge_id, critical.knowledge_id]);
    assert.equal(revalidateStageKnowledgeContext(current, { forAction: true }).valid, true);
  } finally { f.cleanup(); }
});

test('an undeclared runtime-domain typo is rejected instead of producing an empty recall', () => {
  const f = aliasedSourceFixture();
  try {
    assert.throws(() => bindStageKnowledgeContext({ ...f.input, domainId: 'fixture-runtmie' }), {
      code: 'contract_shape_invalid',
      message: 'Knowledge domain is not owned by this declared Agent descriptor.',
    });
  } finally { f.cleanup(); }
});
