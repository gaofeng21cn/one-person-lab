import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import type { StandardAgentDescriptorInterface } from '../../src/kernel/standard-agent-interface.ts';
import {
  buildDomainDetailViewReadback,
  parseAppViewReadArgs,
  resolveCanonicalDomainDetailViewTarget,
} from '../../src/modules/console/domain-detail-view.ts';
import { projectDomainDetailViewLocators } from '../../src/modules/console/domain-detail-view-locator.ts';
import { readProjectInventory } from '../../src/modules/console/work-item-projection/inventory.ts';
import type { WorkItemProjectionV2 } from '../../src/modules/console/work-item-projection/types.ts';

const ITEM_ID = 'mas:workspace:project:study-001';
const STUDY_ID = 'study-001';
const VIEW_ID = 'research-roadmap';
const SNAPSHOT_PATH = 'artifacts/research_trajectory/snapshot.json';
const V2_KEYS = [
  'surface_kind',
  'version',
  'study_id',
  'study_ref',
  'revision',
  'status',
  'summary',
  'current_focus',
  'active_branch',
  'current_focus_node_refs',
  'active_branch_node_refs',
  'nodes',
  'edges',
  'medical_narrative',
  'source_refs',
  'conditions',
] as const;

function descriptor(relativePath = SNAPSHOT_PATH): StandardAgentDescriptorInterface {
  return {
    repo_dir: '/fixture/med-autoscience',
    kind: 'agent',
    agent_id: 'mas',
    package_id: 'mas',
    domain_id: 'medautoscience',
    interface: {
      domain_detail_views: [{
        view_id: VIEW_ID,
        view_kind: 'research_roadmap',
        title: 'Research roadmap',
        schema_ref: 'contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json',
        schema_version: null,
        source_kind: 'work_item_relative_json',
        relative_path: relativePath,
        revision_pointer: '/revision',
        owner_task_binding: {
          task_id_pointer: '/study_id',
          task_ref_pointer: '/study_ref/ref',
          task_ref_template: 'mas-study:{task_id}',
        },
      }],
    },
  } as StandardAgentDescriptorInterface;
}

function inventoryDescriptor() {
  const value = descriptor();
  return {
    ...value,
    interface: {
      ...value.interface,
      inventory_projection: {
        source_kind: 'workspace_relative_json',
        relative_path: 'workspace_index.json',
        items_pointer: '/studies',
        field_map: {
          work_item_id: 'study_id',
          work_item_root: 'study_root',
          business_status: 'status',
          current_stage_id: 'current_stage_id',
          current_stage_status: 'current_stage_status',
          package_status: 'package_status',
          lifecycle_ref: 'lifecycle_ref',
        },
      },
      stage_catalog: null,
      workspace_binding: { project_kind: 'study' },
    },
  } as StandardAgentDescriptorInterface;
}

function projection(workItemRoot: string | null, workItemId = STUDY_ID): WorkItemProjectionV2 {
  return {
    items: [{
      item_id: ITEM_ID,
      identity: {
        agent_id: 'mas',
        workspace_path: workItemRoot ?? '/fixture/workspace',
        work_item_id: workItemId,
        work_item_root: workItemRoot,
      },
    }],
  } as unknown as WorkItemProjectionV2;
}

function dependencies(root: string | null, selectedDescriptor = descriptor()) {
  return {
    projection: projection(root),
    resolveDescriptor: () => selectedDescriptor,
  };
}

function snapshot() {
  return {
    surface_kind: 'mas_research_trajectory_snapshot',
    version: 'mas-research-trajectory-snapshot.v2',
    study_id: STUDY_ID,
    study_ref: { kind: 'mas_study', ref: `mas-study:${STUDY_ID}` },
    revision: 4,
    status: 'active',
    summary: {
      primary_hypothesis: '  主要假设保留前导空格。\n第二行保持不变。  ',
      latest_finding: '现有结果尚不确定。',
      current_judgment: '当前证据不足以作出确定判断。',
      next_research_step: '继续完成预设验证。',
      updated_at: '2026-07-18T00:00:00Z',
    },
    current_focus: {
      node_id: 'hypothesis-1',
      primary_hypothesis: '主要假设',
    },
    active_branch: {
      branch_id: 'route-primary',
      label: '当前科研路线',
    },
    current_focus_node_refs: ['hypothesis-1'],
    active_branch_node_refs: ['hypothesis-1', 'finding-1'],
    nodes: [
      {
        id: 'hypothesis-1',
        kind: 'hypothesis',
        label: '主要假设',
        status: 'active',
        summary: '评估主要假设。',
        branch_id: 'route-primary',
        occurred_at: '2026-07-18T00:00:00Z',
        details: { evidence_judgment: '尚未形成确定判断。' },
        source_refs: [{ kind: 'study_protocol', ref: 'protocol-1' }],
      },
      {
        id: 'finding-1',
        kind: 'finding',
        label: '当前发现',
        status: 'inconclusive',
        summary: '现有结果尚不确定。',
        branch_id: 'route-primary',
        occurred_at: '2026-07-18T01:00:00Z',
        details: { evidence_judgment: '当前证据不足。' },
        source_refs: [{ kind: 'result_table', ref: 'table-1' }],
      },
    ],
    edges: [{
      id: 'edge-1',
      source: 'finding-1',
      target: 'hypothesis-1',
      kind: 'inconclusive',
      label: '当前结果尚不足以确定该假设是否成立。',
      status: 'active',
      source_refs: [{ kind: 'result_table', ref: 'table-1' }],
    }],
    medical_narrative: {
      title: '科研路线更新',
      evidence_judgment: '当前证据不足以作出确定判断。',
    },
    source_refs: [{ kind: 'study_protocol', ref: 'protocol-1' }],
    conditions: [],
  };
}

function writeSnapshot(root: string, value: unknown = snapshot()) {
  const file = path.join(root, SNAPSHOT_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

function withRoot(run: (root: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-detail-view-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function read(root: string | null, input: { ifRevision?: number | null; ifGeneration?: number | null } = {}) {
  return buildDomainDetailViewReadback({
    itemId: ITEM_ID,
    viewId: VIEW_ID,
    ...input,
  }, dependencies(root));
}

function assertUsageError(run: () => unknown) {
  assert.throws(run, (error) =>
    error instanceof FrameworkContractError && error.code === 'cli_usage_error'
  );
}

test('app view read parser makes revision canonical and keeps generation as a mutually exclusive alias', () => {
  assert.deepEqual(parseAppViewReadArgs([
    '--item-id', ITEM_ID,
    '--view-id', VIEW_ID,
    '--if-revision', '4',
  ]), { itemId: ITEM_ID, viewId: VIEW_ID, ifRevision: 4 });
  assert.deepEqual(parseAppViewReadArgs([
    '--item-id', ITEM_ID,
    '--view-id', VIEW_ID,
    '--if-generation', '3',
  ]), { itemId: ITEM_ID, viewId: VIEW_ID, ifRevision: 3 });

  assertUsageError(() => parseAppViewReadArgs([
    '--item-id', ITEM_ID,
    '--view-id', VIEW_ID,
    '--if-revision', '4',
    '--if-generation', '4',
  ]));
  assertUsageError(() => parseAppViewReadArgs(['--item-id', ITEM_ID, '--view-id', VIEW_ID, '--unknown', 'x']));
  assertUsageError(() => parseAppViewReadArgs(['--item-id', ITEM_ID, '--item-id', ITEM_ID, '--view-id', VIEW_ID]));
  for (const revision of ['-1', '1.5', '9007199254740992']) {
    assertUsageError(() => parseAppViewReadArgs([
      '--item-id', ITEM_ID,
      '--view-id', VIEW_ID,
      '--if-revision', revision,
    ]));
  }
});

test('fast projection exposes only the exact descriptor locator and never reads the snapshot', () => {
  const declaration = descriptor().interface.domain_detail_views;
  assert.deepEqual(projectDomainDetailViewLocators({
    itemId: ITEM_ID,
    workItemRoot: '/path/that/does/not/need/to/exist',
    declarations: declaration,
  }), [{
    item_id: ITEM_ID,
    view_id: VIEW_ID,
    view_kind: 'research_roadmap',
    title: 'Research roadmap',
    schema_ref: 'contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json',
    availability: 'unread',
  }]);
  assert.equal(projectDomainDetailViewLocators({
    itemId: ITEM_ID,
    workItemRoot: null,
    declarations: declaration,
  })[0]?.availability, 'missing');
  const schema = JSON.parse(fs.readFileSync(
    'contracts/opl-framework/work-item-projection-v2.schema.json',
    'utf8',
  )) as { $defs: { workItem: { required: string[] } } };
  assert.equal(schema.$defs.workItem.required.includes('domain_detail_views'), false);
});

test('domain inventory wires descriptor locators into each projected work item', () => withRoot((root) => {
  fs.mkdirSync(path.join(root, 'studies', STUDY_ID), { recursive: true });
  fs.writeFileSync(path.join(root, 'workspace_index.json'), `${JSON.stringify({
    studies: [{
      study_id: STUDY_ID,
      study_root: `studies/${STUDY_ID}`,
      status: 'active',
      current_stage_id: null,
      current_stage_status: null,
      package_status: null,
      lifecycle_ref: null,
    }],
  })}\n`, 'utf8');
  const inventory = readProjectInventory({
    project: {
      project_id: 'mas:fixture',
      scope_id: 'project:fixture',
      agent_id: 'mas',
      agent_display_name: 'Med Auto Science',
      domain_id: 'medautoscience',
      display_name: 'Fixture',
      workspace_path: root,
      binding_status: 'active',
      selected_binding_id: 'binding-1',
      binding_ids: ['binding-1'],
      source_refs: [],
    },
    resolveDescriptor: () => inventoryDescriptor(),
  });

  assert.deepEqual(inventory.items[0]?.domain_detail_views, [{
    item_id: `mas:fixture:${STUDY_ID}`,
    view_id: VIEW_ID,
    view_kind: 'research_roadmap',
    title: 'Research roadmap',
    schema_ref: 'contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json',
    availability: 'unread',
  }]);
}));

test('lazy read returns the exact owner payload without parsing or rewriting domain fields', () => withRoot((root) => {
  const expected = snapshot();
  writeSnapshot(root, expected);
  const result = read(root);

  assert.equal(result.availability, 'available');
  assert.equal(result.revision, 4);
  assert.equal(result.generation, result.revision);
  assert.equal(result.not_modified, false);
  assert.match(result.digest ?? '', /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    result.payload_schema_ref,
    'contracts/schemas/v2/mas-research-trajectory-snapshot-v2.schema.json',
  );
  assert.deepEqual(Object.keys(result.payload ?? {}), V2_KEYS);
  assert.deepEqual(result.payload, expected);
  assert.equal(
    (result.payload?.summary as { primary_hypothesis?: string }).primary_hypothesis,
    expected.summary.primary_hypothesis,
  );
}));

test('conditional read distinguishes unchanged, older client state, and revision regression', () => withRoot((root) => {
  writeSnapshot(root);
  const unchanged = read(root, { ifRevision: 4 });
  assert.equal(unchanged.availability, 'available');
  assert.equal(unchanged.not_modified, true);
  assert.equal(unchanged.payload, null);

  const olderClient = read(root, { ifRevision: 3 });
  assert.equal(olderClient.availability, 'available');
  assert.equal(olderClient.not_modified, false);
  assert.notEqual(olderClient.payload, null);

  const regressed = read(root, { ifRevision: 5 });
  assert.equal(regressed.availability, 'stale');
  assert.equal(regressed.revision, 4);
  assert.equal(regressed.payload, null);
  assert.equal(regressed.conditions[0]?.reason, 'domain_detail_revision_regressed');

  const legacyAlias = read(root, { ifGeneration: 4 });
  assert.equal(legacyAlias.not_modified, true);
  assert.equal(legacyAlias.generation, legacyAlias.revision);
}));

test('missing roots and files produce a lightweight missing envelope', () => withRoot((root) => {
  for (const result of [read(root), read(null)]) {
    assert.equal(result.availability, 'missing');
    assert.equal(result.revision, 0);
    assert.equal(result.payload, null);
    assert.equal(result.not_modified, false);
  }
}));

test('revision and owner task identity failures are typed while owner schema stays opaque', () => withRoot((root) => {
  const ownerSchemaChanges = [
    { ...snapshot(), unexpected: true },
    { ...snapshot(), version: 'owner-new-schema.v9' },
    { ...snapshot(), medical_narrative: null },
    { ...snapshot(), nodes: 'owner-defined-shape' },
  ];
  for (const candidate of ownerSchemaChanges) {
    writeSnapshot(root, candidate);
    assert.equal(read(root).availability, 'available');
  }
  const invalidCases = [
    { ...snapshot(), revision: -1 },
    { ...snapshot(), revision: 9_007_199_254_740_992 },
    { ...snapshot(), revision: '4' },
  ];
  for (const candidate of invalidCases) {
    writeSnapshot(root, candidate);
    assert.equal(read(root).availability, 'invalid');
  }

  const wrongStudy = snapshot();
  wrongStudy.study_id = 'study-002';
  wrongStudy.study_ref.ref = 'mas-study:study-002';
  writeSnapshot(root, wrongStudy);
  const stale = read(root);
  assert.equal(stale.availability, 'stale');
  assert.equal(stale.conditions[0]?.reason, 'domain_detail_item_identity_mismatch');

  writeSnapshot(root, { ...snapshot(), study_ref: { kind: 'artifact', ref: `mas-study:${STUDY_ID}` } });
  assert.equal(read(root).availability, 'available');
  writeSnapshot(root, { ...snapshot(), study_ref: { kind: 'mas_study', ref: 'mas-study:study-002' } });
  assert.equal(read(root).availability, 'stale');
}));

test('unknown owner view shapes remain opaque to Framework readback', () => withRoot((root) => {
  const duplicateNode = snapshot();
  duplicateNode.nodes[1]!.id = duplicateNode.nodes[0]!.id;
  const missingEndpoint = snapshot();
  missingEndpoint.edges[0]!.target = 'missing-node';
  const missingFocus = snapshot();
  missingFocus.current_focus.node_id = 'missing-node';
  const missingRouteRef = snapshot();
  missingRouteRef.active_branch_node_refs = ['missing-node'];
  const duplicateEdge = snapshot();
  duplicateEdge.edges.push({ ...duplicateEdge.edges[0]! });
  const nonDrawableNode = snapshot();
  nonDrawableNode.nodes[0]!.label = '';

  for (const candidate of [
    duplicateNode,
    missingEndpoint,
    missingFocus,
    missingRouteRef,
    duplicateEdge,
    nonDrawableNode,
  ]) {
    writeSnapshot(root, candidate);
    assert.equal(read(root).availability, 'available');
  }
}));

test('invalid JSON, traversal, symlinks, oversize files, and I/O errors are classified exactly', () => withRoot((root) => {
  const file = writeSnapshot(root);
  fs.writeFileSync(file, '{not-json', 'utf8');
  assert.equal(read(root).availability, 'invalid');

  writeSnapshot(root);
  const link = path.join(root, 'snapshot-link.json');
  fs.symlinkSync(file, link);
  assert.equal(buildDomainDetailViewReadback({ itemId: ITEM_ID, viewId: VIEW_ID }, {
    ...dependencies(root),
    resolveDescriptor: () => descriptor('snapshot-link.json'),
  }).availability, 'invalid');

  const workspace = path.join(root, 'workspace');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(workspace, { recursive: true });
  writeSnapshot(outside);
  const linkedWorkItem = path.join(workspace, 'linked-study');
  fs.symlinkSync(outside, linkedWorkItem);
  const escapedProjection = projection(linkedWorkItem);
  escapedProjection.items[0]!.identity.workspace_path = workspace;
  assert.equal(buildDomainDetailViewReadback({ itemId: ITEM_ID, viewId: VIEW_ID }, {
    projection: escapedProjection,
    resolveDescriptor: () => descriptor(),
  }).availability, 'invalid');

  const outsideProjection = projection(outside);
  outsideProjection.items[0]!.identity.workspace_path = workspace;
  assert.equal(buildDomainDetailViewReadback({ itemId: ITEM_ID, viewId: VIEW_ID }, {
    projection: outsideProjection,
    resolveDescriptor: () => descriptor(),
  }).availability, 'invalid');

  assert.equal(buildDomainDetailViewReadback({ itemId: ITEM_ID, viewId: VIEW_ID }, {
    ...dependencies(root),
    resolveDescriptor: () => descriptor('../snapshot.json'),
  }).availability, 'invalid');

  fs.truncateSync(file, 8_388_609);
  assert.equal(read(root).availability, 'invalid');

  assert.equal(buildDomainDetailViewReadback({ itemId: ITEM_ID, viewId: VIEW_ID }, {
    ...dependencies(root),
    resolveDescriptor: () => descriptor('x'.repeat(5000)),
  }).availability, 'read_error');
}));

test('lazy read binds one canonical item and one descriptor-declared view', () => withRoot((root) => {
  writeSnapshot(root);
  assert.equal(resolveCanonicalDomainDetailViewTarget({ itemId: ITEM_ID, viewId: VIEW_ID }, dependencies(root))
    .item.identity.work_item_id, STUDY_ID);

  assert.throws(
    () => resolveCanonicalDomainDetailViewTarget({ itemId: 'missing', viewId: VIEW_ID }, dependencies(root)),
    (error) => error instanceof FrameworkContractError
      && error.details?.failure_code === 'domain_detail_item_not_found',
  );
  assert.throws(
    () => resolveCanonicalDomainDetailViewTarget({ itemId: ITEM_ID, viewId: 'missing' }, dependencies(root)),
    (error) => error instanceof FrameworkContractError
      && error.details?.failure_code === 'domain_detail_view_not_declared',
  );
  const ambiguousProjection = projection(root);
  ambiguousProjection.items.push(structuredClone(ambiguousProjection.items[0]!));
  assert.throws(
    () => resolveCanonicalDomainDetailViewTarget({ itemId: ITEM_ID, viewId: VIEW_ID }, {
      projection: ambiguousProjection,
      resolveDescriptor: () => descriptor(),
    }),
    (error) => error instanceof FrameworkContractError
      && error.details?.failure_code === 'domain_detail_item_ambiguous',
  );
}));
