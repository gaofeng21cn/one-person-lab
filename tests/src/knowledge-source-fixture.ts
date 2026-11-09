import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DurableKnowledgeItem } from '../../src/authority/packages/durable-knowledge-catalog.ts';

export const knowledgeSha = (text: string) => `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
export function writeKnowledgeFile(file: string, value: string | object) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}
export const productCatalog = (items: DurableKnowledgeItem[]) => ({
  surface_kind: 'opl_durable_knowledge_catalog', version: 'durable-knowledge-catalog.v2',
  owner: 'one-person-lab', domain_id: 'fixture', items,
});
export function knowledgeItem(input: {
  id: string; scope: DurableKnowledgeItem['scope']; content?: string; ref?: string;
  contentKind?: DurableKnowledgeItem['content_kind']; requirement?: 'required' | 'optional';
}): DurableKnowledgeItem {
  const product = input.scope.kind === 'product';
  const owner = product ? 'fixture' : 'owner-a';
  return {
    surface_kind: 'opl_durable_knowledge_item', version: 'durable-knowledge-item.v2',
    knowledge_id: input.id, title: input.id, scope: input.scope,
    content_kind: input.contentKind ?? 'mechanism', owner,
    body_ref: product
      ? { kind: 'repo_path', ref: input.ref ?? 'agent/knowledge/method.md', sha256: knowledgeSha(input.content ?? '# Method\n') }
      : { kind: 'source_path', source_id: 'owner.notes', ref: input.ref ?? 'policy.md', sha256: knowledgeSha(input.content ?? '# Policy\n') },
    applicability: { domains: ['fixture'], stages: ['review'], tasks: ['review-policy'] },
    status: 'active', reviewed_at: '2026-01-01T00:00:00Z', next_review_at: '2099-01-01T00:00:00Z',
    ...(input.requirement ? { requirement: input.requirement } : {}),
    authority_boundary: { semantic_body_owner: owner, opl_role: 'catalog_recall_and_receipt_projection_only' },
  };
}
export function sourceFixture(mode: 'external' | 'workspace' = 'external') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-knowledge-v2-'));
  const repo = path.join(root, 'agent');
  const workspace = path.join(root, 'workspace');
  const project = path.join(workspace, 'projects/finance');
  const otherProject = path.join(workspace, 'projects/research');
  const source = mode === 'external' ? path.join(root, 'vault') : path.join(workspace, 'shared/memory/notes');
  const registryRef = path.join(workspace, 'shared/memory/knowledge-sources.json');
  const bindingRef = path.join(workspace, 'shared/memory/knowledge-bindings.json');
  const body = '# Policy\n';
  const item = knowledgeItem({ id: 'owner.policy', scope: { kind: 'topic', id: 'finance' }, content: body, contentKind: 'policy' });
  const registry = {
    surface_kind: 'opl_knowledge_source_registry', version: 'knowledge-source-registry.v2',
    registry_id: 'owner-a.sources', owner: 'owner-a',
    sources: [{ source_id: 'owner.notes', root: source, status: 'active', writable: true,
      grants: [{ workspace_root: workspace, domains: ['fixture'], scope_ids: ['owner-a', 'finance', 'project-finance', 'project-research'] }] }],
    items: [item],
  };
  const bindings = {
    surface_kind: 'opl_knowledge_source_bindings', version: 'knowledge-source-bindings.v2',
    registries: [{ registry_ref: registryRef, source_ids: ['owner.notes'], scope_ids: ['owner-a', 'finance', 'project-finance', 'project-research'] }],
    required_knowledge_ids: [] as string[],
  };
  writeKnowledgeFile(path.join(source, 'policy.md'), body);
  writeKnowledgeFile(path.join(repo, 'contracts/durable_knowledge_catalog.json'), productCatalog([]));
  writeKnowledgeFile(path.join(workspace, 'workspace_index.json'), {
    workspace_id: 'fixture-workspace', projects: [
      { project_id: 'project-finance', project_root: 'projects/finance' },
      { project_id: 'project-research', project_root: 'projects/research' },
    ],
  });
  fs.mkdirSync(project, { recursive: true }); fs.mkdirSync(otherProject, { recursive: true });
  const save = () => { writeKnowledgeFile(registryRef, registry); writeKnowledgeFile(bindingRef, bindings); };
  save();
  const input = { repoDir: repo, domainPackRoot: repo, workspaceRoot: workspace, projectRoot: project,
    domainId: 'fixture', stageId: 'review', taskIntent: 'review-policy' };
  return { root, repo, workspace, project, otherProject, source, body, item, registry, registryRef, bindings,
    bindingRef, input, save, write: writeKnowledgeFile, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
