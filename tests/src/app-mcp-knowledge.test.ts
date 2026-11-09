import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { readMcpAppKnowledgeSources } from '../../src/read-models/operator/app-mcp-knowledge.ts';

const input = { repoDir: '/installed/fixture', domainId: 'fixture', stageId: 'review',
  workspaceRoot: '/workspace', taskIntent: 'review-policy' };

test('knowledge view projects only body-free recall metadata for the exact caller', () => {
  let received: unknown;
  const view = readMcpAppKnowledgeSources(input, (args) => {
    received = args;
    return {
      version: 'durable-knowledge-recall-receipt.v2',
      selected: [{ knowledge_id: 'owner.policy', source_id: 'owner.notes',
        scope: { kind: 'topic', id: 'finance' }, content_kind: 'policy', sha256: 'sha256:accepted',
        action_critical: true, content: 'private medical record', body_ref: '/private/notes.md',
        registry: { grants: ['private grant'] } }],
      quality_debt: [],
    };
  });
  assert.equal(received, input);
  assert.equal(view.state, 'ready');
  assert.deepEqual(view.data.items[0], { id: 'owner.policy', title: 'owner.policy', status: 'available',
    knowledge_id: 'owner.policy', source_id: 'owner.notes', scope: { kind: 'topic', id: 'finance' },
    content_kind: 'policy', revision: 'sha256:accepted', action_critical: true });
  assert.equal(JSON.stringify(view).includes('private'), false);
  assert.equal(view.data.detail.context_kind, 'current_recall_metadata');
});

test('required knowledge failures remain unavailable with repair steps and no invented selection', () => {
  const view = readMcpAppKnowledgeSources(input, () => {
    throw new FrameworkContractError('contract_shape_invalid', 'Required knowledge is unavailable.', {
      missing_knowledge_ids: ['owner.policy', 'requirement:disclosure-policy'],
      quality_debt: ['knowledge_source_revoked:owner.policy', 'knowledge_review_overdue:topic.strategy'],
    });
  });
  assert.equal(view.state, 'unavailable');
  assert.equal(view.data.detail.selected_count, 0);
  assert.equal(view.data.detail.gap_count, 4);
  const gaps = view.data.items as Array<Record<string, unknown>>;
  assert.equal(gaps[0].issue, 'knowledge_source_revoked');
  assert.equal(gaps[2].status, 'required_unavailable');
  assert.equal(gaps[3].requirement_id, 'disclosure-policy');
  assert.equal(gaps[3].knowledge_id, undefined);
  assert.ok(gaps.every((gap) => typeof gap.repair === 'string'));
});

test('optional drift remains visible and a fresh read observes subsequent revocation', () => {
  let reads = 0;
  const recall = () => ({ selected: [], quality_debt: [++reads === 1
    ? 'knowledge_source_drifted:owner.policy' : 'knowledge_source_revoked:owner.policy'] });
  const first = readMcpAppKnowledgeSources(input, recall);
  const second = readMcpAppKnowledgeSources(input, recall);
  assert.equal(first.state, 'ready');
  assert.equal((first.data.items[0] as Record<string, unknown>).issue, 'knowledge_source_drifted');
  assert.equal((second.data.items[0] as Record<string, unknown>).issue, 'knowledge_source_revoked');
  assert.equal(reads, 2);
});

test('missing bindings and unreadable registry do not claim sources are ready', () => {
  const unbound = readMcpAppKnowledgeSources(input, () => ({ selected: [], quality_debt: ['knowledge_sources_not_bound'] }));
  assert.equal((unbound.data.items[0] as Record<string, unknown>).issue, 'knowledge_sources_not_bound');
  const failed = readMcpAppKnowledgeSources(input, () => { throw new Error('ENOENT /private/patient-names.json'); });
  assert.equal(failed.state, 'unavailable');
  assert.equal(JSON.stringify(failed).includes('patient'), false);
  assert.equal(JSON.stringify(failed).includes('/private'), false);
});
