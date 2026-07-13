import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  parseStandardAgentInterface,
  STANDARD_AGENT_INTERFACE_VERSION,
  type StandardAgentDescriptorInterface,
} from '../../src/kernel/standard-agent-interface.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { buildWorkItemProjectionV2 } from '../../src/modules/console/work-item-projection/projection.ts';
import { setWorkItemControlState } from '../../src/modules/ledger/work-item-control-ledger.ts';
import type { WorkspaceBinding } from '../../src/modules/workspace/workspace-registry.ts';

const MAS_STUDIES = {
  Diabetes: [
    ['001-dm-cvd-mortality-risk', 'CVD mortality risk', 'active'],
    ['002-dm-china-us-mortality-attribution', 'China-US mortality attribution', 'delivered_paused'],
    ['003-dpcc-primary-care-phenotype-treatment-gap', 'Primary-care phenotype treatment gap', 'delivered_paused'],
    ['004-dpcc-longitudinal-care-inertia-intensification-gap', 'Longitudinal care inertia', 'paused'],
  ],
  'NF-PitNET': [
    ['001-lineage-pfs', 'Lineage and progression-free survival', 'stopped'],
    ['002-early-residual-risk', 'Early residual risk', 'delivered_paused'],
    ['003-endocrine-burden-followup', 'Endocrine burden follow-up', 'delivered_paused'],
    ['004-invasive-architecture', 'Invasive architecture', 'stopped'],
  ],
  Obesity: [
    ['obesity_multicenter_phenotype_atlas', 'Multicenter obesity phenotype atlas', 'active'],
  ],
} as const;

function masDescriptor(): StandardAgentDescriptorInterface {
  return {
    repo_dir: '/fixture/med-autoscience',
    domain_id: 'mas',
    interface: parseStandardAgentInterface({
      version: STANDARD_AGENT_INTERFACE_VERSION,
      inventory_projection: {
        source_kind: 'workspace_relative_json',
        relative_path: 'workspace_index.json',
        items_pointer: '/studies',
        field_map: {
          display_name: 'display_name',
          work_item_id: 'study_id',
          work_item_root: 'canonical_study_root',
          business_status: 'status',
          current_stage_id: 'current_stage_id',
          current_stage_status: 'current_stage_status',
          package_status: 'package_status',
          lifecycle_ref: 'study_status_ref',
        },
      },
      workspace_binding: {
        locator_surface_kind: 'med_autoscience_workspace_profile',
        default_profile_id: 'portfolio',
        workspace_kind: 'medical_research_workspace',
        project_kind: 'study',
        project_collection_label: 'studies',
        default_workspace_id: 'research-workspace',
        default_project_id: 'study-001',
        required_locator_fields: ['workspace_root'],
        optional_locator_fields: [],
        entry_command_template: null,
        manifest_command_template: null,
      },
      runtime: {
        runtime_domain_id: 'mas',
        dispatch_command: null,
        registration_ref: 'contracts/domain_route_profile.json',
      },
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

function writeWorkspace(root: string, label: keyof typeof MAS_STUDIES) {
  fs.mkdirSync(root, { recursive: true });
  const studies = MAS_STUDIES[label].map(([studyId, displayName, status]) => {
    const studyRoot = path.join(root, 'studies', studyId);
    fs.mkdirSync(studyRoot, { recursive: true });
    fs.writeFileSync(path.join(studyRoot, 'STUDY_STATUS.md'), '# Status\n', 'utf8');
    return {
      study_id: studyId,
      display_name: displayName,
      canonical_study_root: path.join('studies', studyId),
      status,
      current_stage_id: status === 'delivered_paused' ? '08-publication_package_handoff' : '01-study_intake',
      current_stage_status: 'receipt_recorded',
      package_status: status === 'delivered_paused' ? 'milestone_delivered' : 'not_ready',
      study_status_ref: 'STUDY_STATUS.md',
    };
  });
  fs.writeFileSync(
    path.join(root, 'workspace_index.json'),
    `${JSON.stringify({ workspace_root: root, studies }, null, 2)}\n`,
    'utf8',
  );
}

function binding(input: {
  id: string;
  root: string;
  label: string;
  status: 'active' | 'inactive';
  updatedAt?: string;
}): WorkspaceBinding {
  return {
    binding_id: input.id,
    project_id: 'medautoscience',
    project: 'med-autoscience',
    workspace_path: input.root,
    label: input.label,
    status: input.status,
    direct_entry: {
      command: null,
      manifest_command: null,
      url: null,
      workspace_locator: null,
    },
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: input.updatedAt ?? '2026-07-12T00:00:00.000Z',
    archived_at: null,
  };
}

function attempt(input: {
  id: string;
  root: string;
  workItemId: string;
  status: string;
  updatedAt: string;
  tokenUsage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  repairRoute?: Record<string, unknown>;
}) {
  return {
    stage_attempt_id: input.id,
    provider_kind: 'temporal',
    workflow_id: `workflow:${input.id}`,
    domain_id: 'medautoscience',
    stage_id: 'write',
    workspace_locator: {
      workspace_root: input.root,
      work_unit_id: input.workItemId,
    },
    executor_kind: 'codex_cli',
    status: input.status,
    retry_budget: {},
    attempt_count: 1,
    task_id: `task:${input.workItemId}`,
    blocked_reason: input.status === 'failed' ? 'historical_provider_failure' : null,
    provider_run: {
      provider_status: input.status,
      started_at: '2026-07-10T00:00:00.000Z',
      completed_at: input.status === 'running' ? null : input.updatedAt,
      last_heartbeat_at: input.status === 'running' ? input.updatedAt : null,
    },
    activity_events: input.tokenUsage ? [{ token_usage: input.tokenUsage, usage_status: 'observed' }] : [],
    route_impact: input.repairRoute ? { current_repair_route: input.repairRoute } : {},
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: input.updatedAt,
  };
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-work-item-v2-'));
  const diabetes = path.join(root, 'DM-CVD-Mortality-Risk');
  const pitnet = path.join(root, 'NF-PitNET');
  const obesity = path.join(root, 'Obesity');
  writeWorkspace(diabetes, 'Diabetes');
  writeWorkspace(pitnet, 'NF-PitNET');
  writeWorkspace(obesity, 'Obesity');
  const bindings = [
    binding({ id: 'dm-active', root: diabetes, label: 'Diabetes', status: 'active' }),
    binding({
      id: 'dm-duplicate-inactive',
      root: diabetes,
      label: 'Diabetes stale duplicate',
      status: 'inactive',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }),
    binding({ id: 'pitnet-active', root: pitnet, label: 'NF-PitNET', status: 'active' }),
    binding({ id: 'obesity-inactive', root: obesity, label: 'Obesity', status: 'inactive' }),
  ];
  const packageProjectionItems = ['mas', 'mag', 'rca', 'oma', 'obf'].map((packageId) => ({
    package_id: packageId,
    source_present: true,
    source_health_status: 'current',
    source_path: `/packages/${packageId}`,
  }));
  const packageStatusById = Object.fromEntries(packageProjectionItems.map((item) => [
    item.package_id,
    { launch_allowed: true, launch_blocked_reason: null },
  ]));
  return {
    root,
    diabetes,
    pitnet,
    obesity,
    bindings,
    packageProjectionItems,
    packageStatusById,
    resolveDescriptor: (agentId: string) => agentId === 'mas' ? masDescriptor() : null,
  };
}

test('WorkItemProjection V2 discovers MAS 3 projects and 9 studies independently of Temporal', () => {
  const input = fixture();
  try {
    const projection = buildWorkItemProjectionV2({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    assert.equal(projection.schema_version, 'work-item-projection.v2');
    assert.equal(projection.project_catalog.length, 3);
    assert.equal(projection.items.length, 9);
    assert.equal(projection.detail_policy.all_work_item_summaries_included, true);
    assert.equal(projection.project_catalog.find((project) => project.display_name === 'Obesity')?.binding_status, 'inactive');
    assert.equal(projection.project_catalog.some((project) => project.display_name === 'Diabetes stale duplicate'), false);
    const obesityItem = projection.items.find(
      (item) => item.identity.work_item_id === 'obesity_multicenter_phenotype_atlas',
    );
    assert.equal(obesityItem?.identity.project_display_name, 'Obesity');
    assert.equal(obesityItem?.identity.work_item_display_name, 'Multicenter obesity phenotype atlas');
    assert.equal(obesityItem?.identity.agent_display_name, 'Med Auto Science');
    assert.equal(obesityItem?.identity.work_item_kind, 'study');
    assert.equal(obesityItem?.telemetry.state, 'missing');
    assert.equal(obesityItem?.telemetry.cumulative.total_tokens, null);
    assert.equal(projection.agent_catalog.length, 5);
    assert.equal(projection.agent_availability.length, 5);
    const masAvailability = projection.agent_availability.find((entry) => entry.agent_id === 'mas');
    assert.equal(masAvailability?.inventory_descriptor.status, 'readable');
    assert.equal(masAvailability?.package_launch_readiness.status, 'ready');
    assert.equal(projection.items.some((item) => item.identity.source_kind === 'runtime_only'), false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('control lifecycle wins over old execution failure and token usage remains observed', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(input.root, 'opl-state');
  try {
    const workItemId = '002-dm-china-us-mortality-attribution';
    const baseline = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [],
    });
    const identity = baseline.items.find((candidate) => candidate.identity.work_item_id === workItemId)!.identity;
    setWorkItemControlState({
      agent_id: identity.agent_id,
      project_id: identity.project_id,
      work_item_id: identity.work_item_id,
      lifecycle_state: 'delivered_paused',
    });
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [attempt({
        id: 'sat-old-failure',
        root: input.diabetes,
        workItemId,
        status: 'failed',
        updatedAt: '2026-07-11T00:00:00.000Z',
        tokenUsage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 },
      })],
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.lifecycle.business_state, 'delivered_paused');
    assert.equal(item.lifecycle.control_state, 'delivered_paused');
    assert.equal(item.lifecycle.source, 'work_item_control_ledger');
    assert.equal(item.execution.state, 'failed');
    assert.equal(item.attention.kind, 'none');
    assert.equal(item.telemetry.state, 'observed');
    assert.deepEqual(
      [item.telemetry.current_stage.input_tokens, item.telemetry.current_stage.output_tokens, item.telemetry.cumulative.total_tokens],
      [1200, 300, 1500],
    );
    assert.equal(
      item.conditions.some((condition) =>
        condition.type === 'ExecutionFailed'
          && condition.reason === 'historical_failure_is_diagnostic_only'
      ),
      true,
    );
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('system attention requires a complete repair route bound to current item generation', () => {
  const input = fixture();
  try {
    const workItemId = 'obesity_multicenter_phenotype_atlas';
    const baseline = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = baseline.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    const completeRoute = {
      blocking_current_progress: true,
      workspace_path: input.obesity,
      work_item_id: workItemId,
      observed_generation: item.lifecycle.observed_generation,
      responsible_component: 'opl_framework',
      issue: 'Temporal worker source is stale.',
      impact: 'The current stage cannot start.',
      repair_action: 'Refresh the managed worker source and restart the worker.',
      expected_outcome: 'The current stage can start with a current worker.',
    };
    const complete = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [attempt({
        id: 'sat-current-repair',
        root: input.obesity,
        workItemId,
        status: 'failed',
        updatedAt: '2026-07-13T01:00:00.000Z',
        repairRoute: completeRoute,
      })],
    });
    const completeItem = complete.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(completeItem.attention.kind, 'system');
    assert.deepEqual(
      [
        completeItem.attention.responsible_component,
        completeItem.attention.issue,
        completeItem.attention.impact,
        completeItem.attention.repair_action,
        completeItem.attention.expected_outcome,
      ],
      [
        completeRoute.responsible_component,
        completeRoute.issue,
        completeRoute.impact,
        completeRoute.repair_action,
        completeRoute.expected_outcome,
      ],
    );
    const incomplete = buildWorkItemProjectionV2({
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [attempt({
        id: 'sat-incomplete-repair',
        root: input.obesity,
        workItemId,
        status: 'failed',
        updatedAt: '2026-07-13T02:00:00.000Z',
        repairRoute: { ...completeRoute, expected_outcome: undefined },
      })],
    });
    const incompleteItem = incomplete.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(incompleteItem.attention.kind, 'none');
    assert.equal(
      incompleteItem.conditions.some((condition) =>
        condition.type === 'NeedsSystemRepair'
          && condition.reason === 'repair_route_incomplete_or_not_current'
      ),
      true,
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('WorkItemProjection V2 output validates against its machine schema', () => {
  const input = fixture();
  try {
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const schemaRef = 'contracts/opl-framework/work-item-projection-v2.schema.json';
    const schema = parseJsonText(fs.readFileSync(path.join(process.cwd(), schemaRef), 'utf8')) as Record<string, unknown>;
    const validation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2',
      schema,
      sourceRef: schemaRef,
    }, projection);
    assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.errors, null, 2));
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
