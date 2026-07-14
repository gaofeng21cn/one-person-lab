import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseStandardAgentInterface,
  STANDARD_AGENT_INTERFACE_VERSION,
  type StandardAgentDescriptorInterface,
  type StandardAgentStageCatalogDeclaration,
} from '../../src/kernel/standard-agent-interface.ts';
import { readProjectInventory } from '../../src/modules/console/work-item-projection/inventory.ts';
import type { ProjectCatalogEntry } from '../../src/modules/console/work-item-projection/types.ts';

const CATALOG_DECLARATION = {
  source_kind: 'agent_repo_relative_json',
  relative_path: 'contracts/stage_catalog.json',
  items_pointer: '/catalog/stages',
  field_map: {
    stage_id: 'id',
    display_name: 'name',
    display_names: 'localized_names',
  },
} satisfies StandardAgentStageCatalogDeclaration;

const CATALOG_STAGES = [
  ['01-study_intake', 'Study Intake', '研究立项'],
  ['02-protocol_and_analysis_plan', 'Protocol and Analysis Plan', '方案与分析计划'],
  ['03-data_readiness', 'Data Readiness', '数据就绪'],
  ['04-primary_analysis', 'Primary Analysis', '主要分析'],
  ['05-sensitivity_analysis', 'Sensitivity Analysis', '敏感性分析'],
  ['06-manuscript_drafting', 'Manuscript Drafting', '论文撰写'],
  ['07-review_and_revision', 'Review and Revision', '审阅与修订'],
  ['08-publication_package_handoff', 'Publication Package Handoff', '投稿包交接'],
] as const;

const DELIVERED_ID = 'legacy-delivered-study';
const ACTIVE_ID = 'active-migration-study';
const MISSING_INDEX_ID = 'missing-stage-index-study';
const MIGRATION_STAGE_ID = 'workspace_target_state_migration';

function descriptor(
  repoDir: string,
  stageCatalog: StandardAgentStageCatalogDeclaration | null,
): StandardAgentDescriptorInterface {
  return {
    repo_dir: repoDir,
    domain_id: 'mas',
    interface: parseStandardAgentInterface({
      version: STANDARD_AGENT_INTERFACE_VERSION,
      inventory_projection: {
        source_kind: 'workspace_relative_json',
        relative_path: 'workspace_index.json',
        items_pointer: '/studies',
        field_map: {
          display_name: 'display_name',
          next_action: 'next_action',
          stage_index_ref: 'stage_index_ref',
          work_item_id: 'study_id',
          work_item_root: 'canonical_study_root',
          business_status: 'status',
          current_stage_id: 'current_stage_id',
          current_stage_status: 'current_stage_status',
          package_status: 'package_status',
          lifecycle_ref: 'study_status_ref',
        },
      },
      ...(stageCatalog ? { stage_catalog: stageCatalog } : {}),
      workspace_binding: {
        locator_surface_kind: 'fixture_workspace_locator',
        default_profile_id: 'portfolio',
        workspace_kind: 'medical_research_workspace',
        project_kind: 'study',
        project_collection_label: 'studies',
        default_workspace_id: 'research-workspace',
        default_project_id: 'study-001',
        required_locator_fields: ['workspace_root'],
        optional_locator_fields: [],
      },
      runtime: { runtime_domain_id: 'mas', registration_ref: null },
      progress: { deliverable_delta_aliases: [], platform_delta_aliases: [] },
      routing: {
        explicit_aliases: ['mas'],
        workstream_ids: ['medical_research'],
        intent_signals: ['medical research'],
        ambiguity_policy: 'require_explicit_domain_selection',
      },
    }, 'fixture:mas#/standard_agent_interface'),
  };
}

function project(workspacePath: string): ProjectCatalogEntry {
  return {
    project_id: 'mas:fixture-project',
    scope_id: 'project:mas:fixture-project',
    agent_id: 'mas',
    agent_display_name: 'Med Auto Science',
    domain_id: 'medautoscience',
    display_name: 'Fixture Research Workspace',
    workspace_path: workspacePath,
    binding_status: 'active',
    selected_binding_id: 'fixture-binding',
    binding_ids: ['fixture-binding'],
    source_refs: [],
  };
}

function writeJson(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-catalog-'));
  const workspacePath = path.join(root, 'workspace');
  const repoDir = path.join(root, 'agent-repo');
  const studies = [
    {
      study_id: DELIVERED_ID,
      display_name: 'Legacy delivered study',
      canonical_study_root: `studies/${DELIVERED_ID}`,
      status: 'delivered_paused',
      current_stage_id: null,
      current_stage_status: null,
      package_status: 'milestone_delivered',
      study_status_ref: 'STUDY_STATUS.md',
      next_action: null,
      stage_index_ref: 'control/stage_index.json',
    },
    {
      study_id: ACTIVE_ID,
      display_name: 'Active migration study',
      canonical_study_root: `studies/${ACTIVE_ID}`,
      status: 'active',
      current_stage_id: MIGRATION_STAGE_ID,
      current_stage_status: 'in_progress',
      package_status: 'not_ready',
      study_status_ref: 'STUDY_STATUS.md',
      next_action: null,
      stage_index_ref: 'control/stage_index.json',
    },
    {
      study_id: MISSING_INDEX_ID,
      display_name: 'Missing stage index study',
      canonical_study_root: `studies/${MISSING_INDEX_ID}`,
      status: 'paused',
      current_stage_id: null,
      current_stage_status: null,
      package_status: 'not_ready',
      study_status_ref: 'STUDY_STATUS.md',
      next_action: null,
      stage_index_ref: 'control/stage_index.json',
    },
  ];
  writeJson(path.join(workspacePath, 'workspace_index.json'), { studies });
  for (const study of studies) {
    const studyRoot = path.join(workspacePath, study.canonical_study_root);
    fs.mkdirSync(studyRoot, { recursive: true });
    fs.writeFileSync(path.join(studyRoot, 'STUDY_STATUS.md'), '# Status\n', 'utf8');
  }
  writeJson(path.join(workspacePath, 'studies', DELIVERED_ID, 'control', 'stage_index.json'), {
    last_recorded_stage_id: '08-publication_package_handoff',
    stages: [
      {
        stage_id: '01-study_intake',
        display_name: 'Workspace Intake',
        display_names: { 'en-US': 'Workspace Intake EN', 'zh-CN': '工作区立项' },
        status: 'receipt_recorded',
        owner: 'user',
        owner_display_name: 'Study Owner',
        next_action: { summary: 'Review intake evidence' },
      },
      {
        stage_id: '08-publication_package_handoff',
        display_names: { 'en-US': 'Workspace Handoff' },
        status: 'in_progress',
      },
      { stage_id: 'manual_foreground_paper_sprint', status: 'typed_blocked' },
      { stage_id: 'milestone_submission_package', status: 'pending' },
    ],
  });
  writeJson(path.join(workspacePath, 'studies', ACTIVE_ID, 'control', 'stage_index.json'), {
    current_stage_id: MIGRATION_STAGE_ID,
    current_stage: { stage_id: MIGRATION_STAGE_ID },
    stages: [
      { stage_id: '01-study_intake', status: 'receipt_recorded' },
      {
        stage_id: MIGRATION_STAGE_ID,
        display_name: 'Workspace Target State Migration',
        status: 'in_progress',
      },
    ],
  });
  return { root, workspacePath, repoDir, project: project(workspacePath) };
}

function writeCatalog(repoDir: string) {
  const catalogPath = path.join(repoDir, CATALOG_DECLARATION.relative_path);
  writeJson(catalogPath, {
    catalog: {
      stages: CATALOG_STAGES.map(([id, name, zhName]) => ({
        id,
        name,
        localized_names: { 'en-US': name, 'zh-CN': zhName },
      })),
    },
  });
  return catalogPath;
}

test('declared Stage Catalog supplies the complete order and overlays workspace presentation', () => {
  const input = fixture();
  writeCatalog(input.repoDir);
  try {
    const inventory = readProjectInventory({
      project: input.project,
      resolveDescriptor: () => descriptor(input.repoDir, CATALOG_DECLARATION),
    });
    const delivered = inventory.items.find((item) => item.identity.work_item_id === DELIVERED_ID);
    assert.ok(delivered);
    assert.deepEqual(
      delivered.stage_map.map((stage) => stage.stage_id),
      CATALOG_STAGES.map(([stageId]) => stageId),
    );
    assert.equal(delivered.stage_map.every((stage) => stage.state === 'completed'), true);
    assert.deepEqual(delivered.stage_map[0]?.display_names, {
      'en-US': 'Workspace Intake EN',
      'zh-CN': '工作区立项',
    });
    assert.equal(delivered.stage_map[0]?.display_name, 'Workspace Intake');
    assert.equal(delivered.stage_map[0]?.owner, 'user');
    assert.equal(delivered.stage_map[0]?.owner_display_name, 'Study Owner');
    assert.equal(delivered.stage_map[0]?.next_action, 'Review intake evidence');
    assert.deepEqual(delivered.stage_map[2]?.display_names, {
      'en-US': 'Data Readiness',
      'zh-CN': '数据就绪',
    });
    assert.equal(delivered.stage_map[2]?.owner, null);
    assert.equal(delivered.stage_map[2]?.owner_display_name, null);
    assert.deepEqual(delivered.stage_map[7]?.display_names, {
      'en-US': 'Workspace Handoff',
      'zh-CN': '投稿包交接',
    });
    assert.equal(delivered.stage_map[7]?.display_name, 'Workspace Handoff');
    assert.equal(delivered.source_refs.some((source) => source.role === 'agent_stage_catalog'), true);
    assert.deepEqual(
      inventory.diagnostics.find((diagnostic) => diagnostic.work_item_id === DELIVERED_ID)?.details,
      {
        stage_ids: ['manual_foreground_paper_sprint', 'milestone_submission_package'],
        hidden_from_default_stage_map: true,
      },
    );

    const active = inventory.items.find((item) => item.identity.work_item_id === ACTIVE_ID);
    assert.ok(active);
    assert.equal(active.lifecycle.current_stage_id, null);
    assert.equal(active.execution.current_stage_id, null);
    assert.equal(active.lifecycle.current_stage_display_name, null);
    assert.equal(active.execution.next_stage_id, '02-protocol_and_analysis_plan');
    assert.equal(active.execution.next_stage_display_name, 'Protocol and Analysis Plan');
    assert.equal(active.stage_map.some((stage) => stage.stage_id === MIGRATION_STAGE_ID), false);
    assert.deepEqual(
      inventory.diagnostics.find((diagnostic) => diagnostic.work_item_id === ACTIVE_ID)?.details,
      { stage_ids: [MIGRATION_STAGE_ID], hidden_from_default_stage_map: true },
    );

    const missingIndex = inventory.items.find((item) => item.identity.work_item_id === MISSING_INDEX_ID);
    assert.deepEqual(
      missingIndex?.stage_map.map((stage) => stage.stage_id),
      CATALOG_STAGES.map(([stageId]) => stageId),
    );
    assert.equal(
      inventory.diagnostics.some((diagnostic) =>
        diagnostic.reason === 'stage_index_source_missing'
          && diagnostic.work_item_id === MISSING_INDEX_ID
      ),
      true,
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('undeclared Stage Catalog preserves legacy workspace Stage Maps', () => {
  const input = fixture();
  try {
    const inventory = readProjectInventory({
      project: input.project,
      resolveDescriptor: () => descriptor(input.repoDir, null),
    });
    const delivered = inventory.items.find((item) => item.identity.work_item_id === DELIVERED_ID);
    assert.deepEqual(
      delivered?.stage_map.map((stage) => stage.stage_id),
      ['01-study_intake', '08-publication_package_handoff'],
    );
    const active = inventory.items.find((item) => item.identity.work_item_id === ACTIVE_ID);
    assert.equal(active?.stage_map.some((stage) => stage.stage_id === MIGRATION_STAGE_ID), true);
    assert.equal(inventory.diagnostics.some((diagnostic) => diagnostic.reason.startsWith('stage_catalog_')), false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('declared Stage Catalog reports missing and malformed sources with legacy fallback', () => {
  const input = fixture();
  const read = () => readProjectInventory({
    project: input.project,
    resolveDescriptor: () => descriptor(input.repoDir, CATALOG_DECLARATION),
  });
  try {
    const missing = read();
    assert.equal(missing.diagnostics.some((item) => item.reason === 'stage_catalog_source_missing'), true);
    assert.deepEqual(
      missing.items.find((item) => item.identity.work_item_id === DELIVERED_ID)?.stage_map.map(
        (stage) => stage.stage_id,
      ),
      ['01-study_intake', '08-publication_package_handoff'],
    );

    const catalogPath = path.join(input.repoDir, CATALOG_DECLARATION.relative_path);
    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.writeFileSync(catalogPath, '{not-json\n', 'utf8');
    const malformed = read();
    const diagnostic = malformed.diagnostics.find((item) => item.reason === 'stage_catalog_json_invalid');
    assert.equal(typeof diagnostic?.details?.error, 'string');
    assert.deepEqual(
      malformed.items.find((item) => item.identity.work_item_id === DELIVERED_ID)?.stage_map.map(
        (stage) => stage.stage_id,
      ),
      ['01-study_intake', '08-publication_package_handoff'],
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
