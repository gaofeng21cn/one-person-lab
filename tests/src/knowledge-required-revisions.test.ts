import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { recallDurableKnowledge } from '../../src/authority/packages/durable-knowledge-catalog.ts';
import { knowledgeItem, sourceFixture } from './knowledge-source-fixture.ts';

test('a missing bound registry cannot silently discard requirements declared only in that registry', () => {
  const f = sourceFixture();
  try {
    f.item.requirement = 'required';
    f.save();
    assert.deepEqual(f.bindings.required_knowledge_ids, []);
    assert.deepEqual(recallDurableKnowledge(f.input).selected.map(item => item.knowledge_id), [f.item.knowledge_id]);

    fs.rmSync(f.registryRef);

    assert.throws(() => recallDurableKnowledge(f.input), {
      code: 'contract_shape_invalid',
      message: /knowledge_registry_unavailable/,
    });
  } finally { f.cleanup(); }
});

test('required superseded knowledge needs a replacement that is actually selected', () => {
  const f = sourceFixture();
  try {
    const replacementContent = '# Revised policy\n';
    const replacement = knowledgeItem({
      id: 'owner.policy.revised', scope: f.item.scope, contentKind: f.item.content_kind,
      ref: 'revised-policy.md', content: replacementContent,
    });
    f.item.requirement = 'required';
    f.item.superseded_by = [replacement.knowledge_id];
    f.save();
    const requiredUnavailable = {
      code: 'contract_shape_invalid', message: 'Required knowledge is unavailable.',
    };

    assert.throws(() => recallDurableKnowledge(f.input), requiredUnavailable);

    replacement.supersedes = [f.item.knowledge_id];
    f.registry.items.push(replacement);
    f.write(path.join(f.source, replacement.body_ref.ref), '# Unreviewed revision\n');
    f.save();
    assert.throws(() => recallDurableKnowledge(f.input), requiredUnavailable);

    f.write(path.join(f.source, replacement.body_ref.ref), replacementContent);
    assert.deepEqual(recallDurableKnowledge(f.input).selected.map(item => item.knowledge_id), [replacement.knowledge_id]);
  } finally { f.cleanup(); }
});
