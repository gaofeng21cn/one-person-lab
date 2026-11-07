import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildKnowledgeCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/knowledge.ts';
import { bindDurableKnowledgeContext, recallDurableKnowledge } from '../../src/authority/packages/durable-knowledge-catalog.ts';
import { readStageKnowledgeContext } from '../../src/adapters/execution/family-runtime-knowledge-context.ts';

const sha = (text: string) => `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-direct-knowledge-'));
  const repo = path.join(root, 'agent');
  const workspace = path.join(root, 'workspace');
  const project = path.join(workspace, 'projects/finance');
  const source = path.join(root, 'vault');
  const body = '# Synthetic policy\n\nRetain the owner reserve.\n';
  function write(file: string, value: string | object) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  }
  const catalog = (items: object[]) => ({ surface_kind: 'opl_durable_knowledge_catalog',
    version: 'durable-knowledge-catalog.v1', owner: 'one-person-lab', items });
  const item = { surface_kind: 'opl_durable_knowledge_item', version: 'durable-knowledge-item.v1',
    knowledge_id: 'fixture.policy', title: 'Policy', layer: 'workspace_project', owner: 'owner',
    body_ref: { kind: 'workspace_path', ref: 'memory/policy.md', sha256: sha(body) },
    projection_source: { root: source, ref: 'policy.md', sha256: sha(body) },
    applicability: { domains: ['fixture'], stages: ['review'], tasks: ['review-policy'] },
    status: 'active', reviewed_at: '2026-01-01T00:00:00Z', next_review_at: '2099-01-01T00:00:00Z',
    authority_boundary: { semantic_body_owner: 'owner', opl_role: 'catalog_recall_and_receipt_projection_only' } };
  write(path.join(source, 'policy.md'), body);
  write(path.join(project, 'memory/policy.md'), body);
  write(path.join(repo, 'contracts/durable_knowledge_catalog.json'), catalog([]));
  write(path.join(workspace, 'shared/memory/opl_durable_knowledge_catalog.json'), catalog([]));
  write(path.join(project, 'memory/opl_durable_knowledge_catalog.json'), catalog([item]));
  write(path.join(project, 'state/opl_durable_knowledge_catalog.json'), catalog([]));
  const input = { repoDir: repo, domainPackRoot: repo, workspaceRoot: workspace, projectRoot: project,
    domainId: 'fixture', stageId: 'review', taskIntent: 'review-policy' };
  return { root, repo, workspace, project, source, body, item, input, write, catalog };
}

test('direct CLI freezes the same exact context as hosted stages and preserves its bytes after owner revision', async () => {
  const f = fixture();
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
    f.write(path.join(f.source, 'policy.md'), '# Revised owner rule\n');
    assert.throws(() => recallDurableKnowledge(f.input), /source changed/);
    const direct = await specs['knowledge read-context']!.handler!(['--binding', output]) as { durable_knowledge_context: unknown };
    assert.deepEqual(direct.durable_knowledge_context, hosted);
    binding.receipt.selected[0].sha256 = sha('tampered');
    f.write(output, binding);
    await assert.rejects(async () => specs['knowledge read-context']!.handler!(['--binding', output]), /differs from its snapshot/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('new owner revision is recalled while expired state and superseded knowledge remain excluded', () => {
  const f = fixture();
  try {
    const revised = '# Accepted rule\n\nReserve is a liquidity constraint.\n';
    const old = { ...f.item, knowledge_id: 'fixture.old', status: 'superseded' };
    f.item.body_ref.sha256 = sha(revised);
    f.item.projection_source.sha256 = sha(revised);
    f.write(path.join(f.source, 'policy.md'), revised);
    f.write(path.join(f.project, 'memory/policy.md'), revised);
    f.write(path.join(f.project, 'memory/opl_durable_knowledge_catalog.json'), f.catalog([old, f.item]));
    const stale = { ...f.item, knowledge_id: 'fixture.stale', layer: 'dated_state',
      body_ref: { ...f.item.body_ref, ref: 'state/snapshot.md' }, next_review_at: '2026-01-02T00:00:00Z' };
    f.write(path.join(f.project, 'state/opl_durable_knowledge_catalog.json'), f.catalog([stale]));
    const context = bindDurableKnowledgeContext(f.input);
    assert.deepEqual(context.bodies.map(b => b.knowledge_id), ['fixture.policy']);
    assert.equal(context.bodies[0]?.content, revised);
    assert.equal(context.receipt.quality_debt.some(d => d.startsWith('knowledge_review_overdue:fixture.stale:')), true);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('source root escape and external-source declarations in agent packs are rejected', () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.source, 'policy.md'));
    f.write(path.join(f.root, 'outside.md'), f.body);
    fs.symlinkSync(path.join(f.root, 'outside.md'), path.join(f.source, 'policy.md'));
    assert.throws(() => recallDurableKnowledge(f.input), /regular contained file/);
    f.write(path.join(f.repo, 'contracts/durable_knowledge_catalog.json'), f.catalog([
      { ...f.item, layer: 'agent_pack', body_ref: { kind: 'repo_path', ref: 'agent/knowledge/policy.md' } },
    ]));
    assert.throws(() => recallDurableKnowledge(f.input), /JSON Schema validation/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
