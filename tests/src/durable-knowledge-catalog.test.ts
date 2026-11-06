import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readLegacyMemoryDescriptor,
  readDurableKnowledgeCatalog,
  recallDurableKnowledge,
} from '../../src/authority/packages/durable-knowledge-catalog.ts';

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
    layer: 'agent_pack';
    body: string;
    content: string;
    stages: string[];
    status?: string;
    next?: string;
  }) => ({
    surface_kind: 'opl_durable_knowledge_item',
    version: 'durable-knowledge-item.v1',
    knowledge_id: input.id,
    title: input.id,
    layer: input.layer,
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
    version: 'durable-knowledge-catalog.v1',
    owner: 'one-person-lab',
    items: [
      item({
        id: 'fixture.stage-method',
        layer: 'agent_pack',
        body: 'agent/knowledge/stage.md',
        content: agentBody,
        stages: ['intake'],
      }),
      item({
        id: 'fixture.overdue',
        layer: 'agent_pack',
        body: 'agent/knowledge/stage.md',
        content: agentBody,
        stages: ['intake'],
        next: '2026-02-01T00:00:00Z',
      }),
      item({
        id: 'fixture.other-stage',
        layer: 'agent_pack',
        body: 'agent/knowledge/stage.md',
        content: agentBody,
        stages: ['deliver'],
      }),
    ],
  }, null, 2)}\n`);
  return root;
}

test('durable knowledge catalog selects only current applicable bodies across agent and workspace layers', () => {
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
      projectRoot: root,
      now: new Date('2026-03-01T00:00:00Z'),
    });
    assert.deepEqual(receipt.selected.map((item) => item.knowledge_id), [
      'fixture.stage-method',
    ]);
    assert.deepEqual(receipt.quality_debt, [
      'knowledge_catalog_not_declared:workspace_project:memory/opl_durable_knowledge_catalog.json',
      'knowledge_catalog_not_declared:dated_state:state/opl_durable_knowledge_catalog.json',
      'knowledge_review_overdue:fixture.overdue:2026-02-01T00:00:00Z',
    ]);
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
      projectRoot: root,
    }), /digest does not match/);

    catalog.items[0].body_ref.ref = '../outside.md';
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    assert.throws(() => recallDurableKnowledge({
      repoDir: root,
      domainId: 'fixture-domain',
      stageId: 'intake',
      domainPackRoot: root,
      projectRoot: root,
    }), /canonical contained path/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy memory descriptor remains readable and reports whether a durable catalog is declared', () => {
  const root = fixture();
  try {
    write(root, 'contracts/memory_descriptor.json', `${JSON.stringify({
      surface_kind: 'domain_memory_descriptor_locator',
      schema_version: 1,
      domain_id: 'fixture-domain',
      memory_ref_id: 'fixture-memory',
      memory_body_owner: 'fixture-domain',
    })}\n`);
    const readback = readLegacyMemoryDescriptor(root);
    assert.equal(readback.status, 'compatible_legacy_descriptor');
    assert.equal(readback.memory_ref_id, 'fixture-memory');
    assert.equal(readback.migration_state, 'catalog_declared');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workspace and project catalogs join the Agent catalog without crossing layer ownership', () => {
  const root = fixture();
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-durable-workspace-'));
  const project = path.join(workspace, 'projects', 'project-1');
  try {
    write(workspace, 'shared/memory/owner-policy.md', '# Shared policy\n');
    write(project, 'memory/project-memory.md', '# Project memory\n');
    write(project, 'state/current-state.md', '# Dated state\n');
    const item = (input: {
      id: string;
      layer: 'workspace_shared' | 'workspace_project' | 'dated_state';
      ref: string;
    }) => ({
      surface_kind: 'opl_durable_knowledge_item',
      version: 'durable-knowledge-item.v1',
      knowledge_id: input.id,
      title: input.id,
      layer: input.layer,
      owner: 'workspace-owner',
      body_ref: { kind: 'workspace_path', ref: input.ref },
      applicability: { domains: ['fixture-domain'], stages: ['intake'] },
      status: 'active',
      reviewed_at: '2026-01-01T00:00:00Z',
      next_review_at: '2099-01-01T00:00:00Z',
      authority_boundary: {
        semantic_body_owner: 'workspace-owner',
        opl_role: 'catalog_recall_and_receipt_projection_only',
      },
    });
    write(workspace, 'shared/memory/opl_durable_knowledge_catalog.json', `${JSON.stringify({
      surface_kind: 'opl_durable_knowledge_catalog',
      version: 'durable-knowledge-catalog.v1',
      owner: 'one-person-lab',
      items: [item({ id: 'workspace.shared-policy', layer: 'workspace_shared', ref: 'shared/memory/owner-policy.md' })],
    })}\n`);
    const agentCatalogPath = path.join(root, 'contracts/durable_knowledge_catalog.json');
    const agentCatalog = JSON.parse(fs.readFileSync(agentCatalogPath, 'utf8'));
    agentCatalog.workspace_catalog_ref = 'shared/memory/opl_durable_knowledge_catalog.json';
    agentCatalog.project_catalog_ref = 'memory/opl_durable_knowledge_catalog.json';
    agentCatalog.dated_state_catalog_ref = 'state/opl_durable_knowledge_catalog.json';
    fs.writeFileSync(agentCatalogPath, `${JSON.stringify(agentCatalog, null, 2)}\n`);
    write(project, 'memory/opl_durable_knowledge_catalog.json', `${JSON.stringify({
      surface_kind: 'opl_durable_knowledge_catalog',
      version: 'durable-knowledge-catalog.v1',
      owner: 'one-person-lab',
      items: [item({ id: 'project.memory', layer: 'workspace_project', ref: 'memory/project-memory.md' })],
    })}\n`);
    write(project, 'state/opl_durable_knowledge_catalog.json', `${JSON.stringify({
      surface_kind: 'opl_durable_knowledge_catalog',
      version: 'durable-knowledge-catalog.v1',
      owner: 'one-person-lab',
      items: [item({ id: 'project.current-state', layer: 'dated_state', ref: 'state/current-state.md' })],
    })}\n`);

    const receipt = recallDurableKnowledge({
      repoDir: root,
      domainId: 'fixture-domain',
      stageId: 'intake',
      domainPackRoot: root,
      workspaceRoot: workspace,
      projectRoot: project,
      now: new Date('2026-03-01T00:00:00Z'),
    });
    assert.deepEqual(receipt.selected.map((entry) => entry.knowledge_id), [
      'fixture.stage-method',
      'workspace.shared-policy',
      'project.memory',
      'project.current-state',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
