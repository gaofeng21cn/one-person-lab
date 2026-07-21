import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { record } from '../../src/kernel/json-record.ts';
import {
  parseStandardAgentInterface,
  STANDARD_AGENT_INTERFACE_VERSION,
  type StandardAgentDescriptorInterface,
} from '../../src/kernel/standard-agent-interface.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { buildAgentCatalog } from '../../src/modules/console/work-item-projection/catalog.ts';
import { buildAppRuntimeWorkItemProjection } from '../../src/modules/console/app-runtime-work-item-projection.ts';
import { readStageIndexPresentation } from '../../src/modules/console/work-item-projection/inventory-presentation.ts';
import { readWorkItemStageAttempts } from '../../src/modules/console/work-item-projection/execution.ts';
import { projectWorkItemRuntimeActivityItems } from '../../src/modules/console/work-item-projection/legacy-adapter.ts';
import { buildWorkItemProjectionV2 } from '../../src/modules/console/work-item-projection/projection.ts';
import { projectWorkItemPrimaryState } from '../../src/modules/console/work-item-projection/primary-state.ts';
import { buildStageAttemptRuntimeCurrentness } from '../../src/modules/runway/family-runtime-stage-attempt-runtime-currentness.ts';
import { createStageAttemptTable } from '../../src/modules/runway/family-runtime-stage-attempt-ledger.ts';
import { createStageRunLaunchTable } from '../../src/modules/runway/family-runtime-stage-run-launch-registry.ts';
import {
  setWorkItemControlState,
  setWorkItemVisibilityState,
} from '../../src/modules/ledger/work-item-control-ledger.ts';
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
      },
      runtime: {
        runtime_domain_id: 'mas',
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
    const controlRoot = path.join(studyRoot, 'control');
    fs.mkdirSync(controlRoot, { recursive: true });
    fs.writeFileSync(path.join(studyRoot, 'STUDY_STATUS.md'), '# Status\n', 'utf8');
    const active = status === 'active';
    const delivered = status === 'delivered_paused';
    const stages = [
      {
        stage_id: '01-study_intake',
        status: active ? 'in_progress' : 'receipt_recorded',
      },
      ...(active
        ? [{ stage_id: '02-protocol_and_analysis_plan', status: 'pending' }]
        : delivered
          ? [
              { stage_id: '08-publication_package_handoff', status: 'typed_blocked' },
              { stage_id: 'manual_foreground_paper_sprint', status: 'missing_manifest' },
              { stage_id: 'milestone_submission_package', status: 'pending' },
            ]
          : []),
    ];
    fs.writeFileSync(path.join(controlRoot, 'stage_index.json'), `${JSON.stringify({
      schema_version: 'mas.study_stage_index.v1',
      study_id: studyId,
      lifecycle_state: status,
      current_stage_id: active ? '01-study_intake' : null,
      current_stage: active ? { stage_id: '01-study_intake' } : null,
      last_recorded_stage_id: delivered ? '08-publication_package_handoff' : '01-study_intake',
      stages,
    }, null, 2)}\n`, 'utf8');
    const nextAction = delivered
      ? {
          action_id: 'complete_submission_metadata_or_wake_for_revision',
          action_type: 'user_action',
          owner: 'user',
          summary: 'Provide missing submission metadata, or explicitly wake the study for revision.',
        }
      : active
        ? {
            action_id: 'continue_current_stage',
            action_type: 'agent_action',
            owner: 'mas',
            summary: 'Continue the current study stage.',
          }
        : {
            action_id: 'wait_for_explicit_user_wakeup',
            action_type: status === 'stopped' ? 'blocked_no_action' : 'user_action',
            owner: 'user',
            summary: 'Wait for an explicit user decision before continuing.',
          };
    return {
      study_id: studyId,
      display_name: displayName,
      canonical_study_root: path.join('studies', studyId),
      status,
      current_stage_id: active ? '01-study_intake' : null,
      current_stage_status: active ? 'in_progress' : null,
      package_status: status === 'delivered_paused' ? 'milestone_delivered' : 'not_ready',
      study_status_ref: 'STUDY_STATUS.md',
      next_action: nextAction,
      stage_index_ref: 'control/stage_index.json',
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
  stageId?: string;
  qualityCycleId?: string;
  qualityRoundIndex?: number;
  qualityScopeBudget?: Record<string, unknown>;
  createdAt?: string;
  identityField?: 'work_item_id' | 'study_id' | 'quest_id' | 'work_unit_id' | null;
  providerStatus?: string;
  lastHeartbeatAt?: string | null;
  actionRequest?: { ref: string; sha256: string };
  runtimeObservation?: Record<string, unknown>;
  humanGateRefs?: string[];
  blockedReason?: string;
  stageRunId?: string;
  stageRunLaunch?: Record<string, unknown>;
}) {
  const createdAt = input.createdAt ?? '2026-07-10T00:00:00.000Z';
  const identityField = input.identityField === undefined ? 'work_unit_id' : input.identityField;
  return {
    stage_attempt_id: input.id,
    provider_kind: 'temporal',
    workflow_id: `workflow:${input.id}`,
    domain_id: 'medautoscience',
    stage_id: input.stageId ?? '01-study_intake',
    workspace_locator: {
      workspace_root: input.root,
      ...(identityField ? { [identityField]: input.workItemId } : {}),
      ...(input.actionRequest ? {
        action_request_ref: input.actionRequest.ref,
        action_request_sha256: input.actionRequest.sha256,
      } : {}),
    },
    executor_kind: 'codex_cli',
    stage_run_id: input.stageRunId ?? null,
    ...(input.stageRunLaunch ? { stage_run_launch: input.stageRunLaunch } : {}),
    status: input.status,
    retry_budget: input.qualityScopeBudget
      ? { quality_scope_budget: input.qualityScopeBudget }
      : {},
    quality_cycle_id: input.qualityCycleId ?? null,
    quality_round_index: input.qualityRoundIndex ?? null,
    attempt_count: 1,
    task_id: `task:${input.workItemId}`,
    blocked_reason: input.blockedReason
      ?? (input.status === 'failed' ? 'historical_provider_failure' : null),
    human_gate_refs: input.humanGateRefs ?? [],
    provider_run: {
      provider_status: input.providerStatus ?? input.status,
      started_at: createdAt,
      completed_at: input.status === 'running' ? null : input.updatedAt,
      last_heartbeat_at: input.lastHeartbeatAt
        ?? (input.status === 'running' ? input.updatedAt : null),
      ...(input.runtimeObservation ? { runtime_observation: input.runtimeObservation } : {}),
    },
    activity_events: input.tokenUsage ? [{ token_usage: input.tokenUsage, usage_status: 'observed' }] : [],
    route_impact: input.repairRoute ? { current_repair_route: input.repairRoute } : {},
    created_at: createdAt,
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
    {
      status: 'installed',
      codex_visible: true,
      package_version: '1.0.0',
      package_lock_ref: `/locks/${item.package_id}.json`,
      launch_allowed: true,
      launch_blocked_reason: null,
    },
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

function writeActionRequest(root: string, runId: string, payload: Record<string, unknown>) {
  const requestPath = path.join(root, 'control', 'opl', 'action_runs', runId, 'request.json');
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  fs.writeFileSync(requestPath, bytes);
  return {
    ref: pathToFileURL(requestPath).href,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function persistStageAttempt(db: DatabaseSync, value: ReturnType<typeof attempt>) {
  db.prepare(`
    INSERT INTO stage_attempts (
      stage_attempt_id, idempotency_key, provider_kind, workflow_id,
      domain_id, stage_id, workspace_locator_json, source_fingerprint,
      executor_kind, stage_run_id, status, checkpoint_refs_json,
      closeout_refs_json, human_gate_refs_json, retry_budget_json,
      attempt_count, task_id, blocked_reason, provider_receipt_json,
      provider_run_json, activity_events_json, route_impact_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?)
  `).run(
    value.stage_attempt_id,
    `idempotency:${value.stage_attempt_id}`,
    value.provider_kind,
    value.workflow_id,
    value.domain_id,
    value.stage_id,
    JSON.stringify(value.workspace_locator),
    value.executor_kind,
    value.stage_run_id,
    value.status,
    JSON.stringify(value.human_gate_refs),
    JSON.stringify(value.retry_budget),
    value.attempt_count,
    value.task_id,
    value.blocked_reason,
    JSON.stringify(value.provider_run),
    JSON.stringify(value.activity_events),
    JSON.stringify(value.route_impact),
    value.created_at,
    value.updated_at,
  );
}

test('WorkItemProjection V2 discovers MAS 3 projects and 9 studies independently of Temporal', () => {
  const input = fixture();
  try {
    assert.equal(input.resolveDescriptor('mas')?.interface.stage_catalog, null);
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
    assert.deepEqual(
      projection.project_catalog.map((project) => project.display_name).sort(),
      ['DM-CVD-Mortality-Risk', 'NF-PitNET', 'Obesity'],
    );
    assert.equal(projection.summary.work_item_count, 9);
    assert.equal(projection.summary.visible_work_item_count, 9);
    assert.equal(projection.summary.archived_work_item_count, 0);
    assert.equal(projection.summary.total_work_item_count, 9);
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
    assert.equal(obesityItem?.lifecycle.primary_state, 'automatically_advancing');
    assert.equal(obesityItem?.lifecycle.primary_state_label, '自动推进中');
    assert.equal(obesityItem?.lifecycle.primary_state_reason, 'user_visible_progress_advancing');
    assert.equal(obesityItem?.lifecycle.last_transition_at, obesityItem?.freshness.last_transition_time);
    assert.equal(obesityItem?.execution.current_stage_display_name, 'Study Intake');
    assert.equal(obesityItem?.execution.next_stage_display_name, 'Protocol And Analysis Plan');
    assert.deepEqual(obesityItem?.stage_map.map((stage) => stage.state), ['current', 'next']);
    assert.equal(obesityItem?.action.kind, 'agent_action');
    assert.equal(obesityItem?.action.title, '继续推进');
    assert.equal(obesityItem?.action.title_key, 'lifecycle.active.title');
    assert.equal(obesityItem?.action.summary_key, 'inventory.nextAction.summary');
    assert.equal(obesityItem?.action.owner_kind, 'agent');
    assert.equal(obesityItem?.action.message_args.action_ref, 'continue_current_stage');
    assert.equal(obesityItem?.action.summary, 'Continue the current study stage.');
    assert.deepEqual(obesityItem?.visibility, {
      state: 'visible',
      source: 'default',
      updated_at: null,
      control_ref: null,
      generation: obesityItem?.visibility.generation,
    });
    const deliveredItem = projection.items.find(
      (item) => item.identity.work_item_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    assert.equal(deliveredItem?.lifecycle.current_stage_id, null);
    assert.equal(deliveredItem?.telemetry.current_stage.state, 'missing');
    assert.equal(deliveredItem?.telemetry.current_stage.missing_reason, 'current_stage_not_applicable');
    assert.deepEqual(
      deliveredItem?.stage_map.map((stage) => [stage.stage_id, stage.state]),
      [
        ['01-study_intake', 'completed'],
        ['08-publication_package_handoff', 'completed'],
      ],
    );
    assert.equal(
      deliveredItem?.stage_map.some((stage) =>
        ['pending', 'next', 'current', 'stopped', 'failed'].includes(stage.state)
      ),
      false,
    );
    assert.equal(deliveredItem?.action.kind, 'user_action');
    assert.equal(deliveredItem?.action.title, '补齐投稿信息或发起修订');
    assert.equal(deliveredItem?.action.title_key, 'lifecycle.deliveredPaused.title');
    assert.equal(deliveredItem?.action.summary_key, 'inventory.nextAction.summary');
    assert.equal(deliveredItem?.action.owner_kind, 'user');
    assert.equal(
      deliveredItem?.action.summary,
      'Provide missing submission metadata, or explicitly wake the study for revision.',
    );
    assert.equal(projection.agent_catalog.length, 5);
    assert.equal(projection.agent_availability.length, 5);
    const masAvailability = projection.agent_availability.find((entry) => entry.agent_id === 'mas');
    assert.equal(masAvailability?.inventory_descriptor.status, 'readable');
    assert.equal(masAvailability?.package_launch_readiness.status, 'unknown');
    assert.equal(masAvailability?.availability, 'available');
    assert.equal(masAvailability?.source, 'package_directory');
    assert.equal(masAvailability?.last_checked_at, '2026-07-13T00:00:00.000Z');
    assert.equal(projection.agent_availability.every((entry) => entry.availability === 'available'), true);
    assert.equal(projection.items.some((item) => item.identity.source_kind === 'runtime_only'), false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('App Runtime fast producer includes registered work items with bounded attempt and telemetry summaries', () => {
  const input = fixture();
  try {
    const qualityScopeBudget = {
      surface_kind: 'opl_stage_quality_scope_budget',
      version: 'opl-stage-quality-scope-budget.v1',
      max_attempts: 3,
      max_elapsed_ms: 21_600_000,
      max_tokens: 1_000_000,
      token_budget_requires_observed_usage: true,
      foreground_execution_must_use_managed_attempt: true,
    };
    const projection = buildAppRuntimeWorkItemProjection({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [
        attempt({
          id: 'sat-dm003-token-readback',
          root: input.diabetes,
          workItemId: '003-dpcc-primary-care-phenotype-treatment-gap',
          status: 'completed',
          stageId: '08-publication_package_handoff',
          updatedAt: '2026-07-15T00:00:00.000Z',
          tokenUsage: { input_tokens: 20_000, output_tokens: 5_490, total_tokens: 25_490 },
        }),
        attempt({
          id: 'sat-dm001-quality-budget',
          root: input.diabetes,
          workItemId: '001-dm-cvd-mortality-risk',
          status: 'completed',
          updatedAt: '2026-07-15T00:00:00.000Z',
          qualityCycleId: 'quality-cycle:dm001',
          qualityRoundIndex: 3,
          qualityScopeBudget,
        }),
      ],
      qualityCycles: [{
        quality_cycle_id: 'quality-cycle:dm001',
        policy: { formal_review: { scope_budget: qualityScopeBudget } },
        state: {
          quality_scope_budget_usage: {
            attempts_used: 3,
            elapsed_ms: 3_600_000,
            tokens_used: null,
            token_observation_status: 'missing',
          },
          quality_scope_budget_stop_reason: 'max_attempts_exhausted',
        },
      }],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-15T00:01:00.000Z',
    });
    const dm003 = projection.items.find(
      (item) => item.identity.work_item_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    );
    const dm001 = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    );

    assert.equal(projection.items.length, 9);
    assert.equal(Buffer.byteLength(JSON.stringify(projection), 'utf8') <= 131_072, true);
    assert.equal(
      projection.items.every((item) => Buffer.byteLength(JSON.stringify(item), 'utf8') <= 16_384),
      true,
    );
    assert.equal(projection.summary.visible_work_item_count, 9);
    assert.equal(projection.detail_policy.all_work_item_summaries_included, true);
    assert.equal(projection.detail_policy.inventory_detail, 'included');
    assert.equal(projection.detail_policy.attempt_ref_limit_per_item, 1);
    assert.equal(projection.detail_policy.diagnostic_details, 'lazy');
    assert.deepEqual(projection.diagnostics.items, []);
    assert.equal(dm003?.execution.attempt_ids.length, 1);
    assert.equal(dm003?.telemetry.cumulative.total_tokens, 25_490);
    assert.deepEqual(dm003?.telemetry.cumulative.source_refs, []);
    assert.equal((dm003?.stage_map.length ?? 0) > 0, true);
    assert.deepEqual(dm003?.conditions, []);
    assert.deepEqual(dm003?.source_refs, []);
    assert.equal(dm003?.visibility.state, 'visible');
    assert.deepEqual(dm001?.execution.quality_budget, {
      state: 'exhausted',
      scope_id: 'quality-cycle:dm001',
      max_attempts: 3,
      attempts_used: 3,
      attempts_remaining: 0,
      max_elapsed_ms: 21_600_000,
      elapsed_ms: 3_600_000,
      max_tokens: 1_000_000,
      tokens_used: null,
      token_observation_status: 'missing',
      stop_reason: 'max_attempts_exhausted',
    });
    const schemaRef = 'contracts/opl-framework/work-item-projection-v2.schema.json';
    const schema = parseJsonText(fs.readFileSync(schemaRef, 'utf8')) as Record<string, unknown>;
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

test('TelemetryObserved accepts non-applicable current-stage usage without weakening partial or missing states', () => {
  const input = fixture();
  try {
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [
        attempt({
          id: 'sat-dm003-token-readback',
          root: input.diabetes,
          workItemId: '003-dpcc-primary-care-phenotype-treatment-gap',
          status: 'completed',
          stageId: '08-publication_package_handoff',
          updatedAt: '2026-07-15T00:00:00.000Z',
          tokenUsage: { input_tokens: 20_000, output_tokens: 5_490, total_tokens: 25_490 },
        }),
        attempt({
          id: 'sat-dm001-current-stage-missing-token-readback',
          root: input.diabetes,
          workItemId: '001-dm-cvd-mortality-risk',
          status: 'completed',
          stageId: '01-study_intake',
          updatedAt: '2026-07-16T00:00:00.000Z',
        }),
        attempt({
          id: 'sat-dm001-historical-token-readback',
          root: input.diabetes,
          workItemId: '001-dm-cvd-mortality-risk',
          status: 'completed',
          stageId: '00-historical_intake',
          updatedAt: '2026-07-14T00:00:00.000Z',
          tokenUsage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 },
        }),
        attempt({
          id: 'sat-obesity-missing-token-readback',
          root: input.obesity,
          workItemId: 'obesity_multicenter_phenotype_atlas',
          status: 'completed',
          stageId: '01-study_intake',
          updatedAt: '2026-07-16T00:00:00.000Z',
        }),
      ],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-16T00:01:00.000Z',
    });
    const delivered = projection.items.find(
      (item) => item.identity.work_item_id === '003-dpcc-primary-care-phenotype-treatment-gap',
    )!;
    const partial = projection.items.find(
      (item) => item.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    const missing = projection.items.find(
      (item) => item.identity.work_item_id === 'obesity_multicenter_phenotype_atlas',
    )!;
    const deliveredCondition = delivered.conditions.find((entry) => entry.type === 'TelemetryObserved')!;
    const partialCondition = partial.conditions.find((entry) => entry.type === 'TelemetryObserved')!;
    const missingCondition = missing.conditions.find((entry) => entry.type === 'TelemetryObserved')!;

    assert.equal(delivered.lifecycle.business_state, 'delivered_paused');
    assert.equal(delivered.execution.state, 'idle');
    assert.deepEqual(
      [
        delivered.telemetry.state,
        delivered.telemetry.current_stage.state,
        delivered.telemetry.current_stage.missing_reason,
        delivered.telemetry.cumulative.state,
        delivered.telemetry.cumulative.total_tokens,
      ],
      ['partial', 'missing', 'current_stage_not_applicable', 'observed', 25_490],
    );
    assert.deepEqual(
      [deliveredCondition.status, deliveredCondition.reason, deliveredCondition.severity],
      ['True', 'cumulative_token_usage_observed_current_stage_not_applicable', 'none'],
    );

    assert.deepEqual(
      [
        partial.telemetry.state,
        partial.telemetry.current_stage.state,
        partial.telemetry.current_stage.missing_reason,
        partial.telemetry.cumulative.state,
        partial.telemetry.cumulative.total_tokens,
      ],
      ['partial', 'missing', 'no_stage_attempt_usage_telemetry_observed', 'observed', 1500],
    );
    assert.deepEqual(
      [partialCondition.status, partialCondition.reason, partialCondition.severity],
      ['False', 'token_usage_partial', 'none'],
    );

    assert.equal(missing.execution.attempt_id, 'sat-obesity-missing-token-readback');
    assert.deepEqual(
      [
        missing.telemetry.state,
        missing.telemetry.current_stage.state,
        missing.telemetry.cumulative.state,
        missing.telemetry.cumulative.total_tokens,
      ],
      ['missing', 'missing', 'missing', null],
    );
    assert.deepEqual(
      [missingCondition.status, missingCondition.reason, missingCondition.severity],
      ['Unknown', 'token_usage_missing', 'none'],
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('paused lifecycle projects only a post-snapshot live wake attempt as current execution', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const lifecycleSnapshotAt = new Date('2026-07-13T00:00:00.000Z');
    fs.utimesSync(
      path.join(input.diabetes, 'workspace_index.json'),
      lifecycleSnapshotAt,
      lifecycleSnapshotAt,
    );
    const wakeAttempt = attempt({
      id: 'sat-paused-explicit-wake',
      root: input.diabetes,
      workItemId,
      identityField: 'quest_id',
      status: 'queued',
      stageId: 'baseline_and_evidence_setup',
      createdAt: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:01:00.000Z',
    });
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [
        attempt({
          id: 'sat-paused-terminal-after-snapshot',
          root: input.diabetes,
          workItemId,
          status: 'completed',
          stageId: 'baseline_and_evidence_setup',
          createdAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T00:01:00.000Z',
        }),
        attempt({
          id: 'sat-paused-old-live-history',
          root: input.diabetes,
          workItemId,
          status: 'running',
          stageId: 'baseline_and_evidence_setup',
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-16T00:01:00.000Z',
        }),
        wakeAttempt,
      ],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;

    assert.equal(item.lifecycle.business_state, 'paused');
    assert.equal(item.lifecycle.current_stage_id, null);
    assert.equal(item.execution.current_stage_id, 'baseline_and_evidence_setup');
    assert.equal(item.execution.stage_id, 'baseline_and_evidence_setup');
    assert.equal(item.execution.attempt_id, 'sat-paused-explicit-wake');
    assert.equal(item.execution.state, 'queued');
    assert.equal(item.execution.diagnostic_reason, 'temporal_runtime_observation_missing');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('WorkItem execution projects provider-confirmed running state across a lagging queued ledger', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const lifecycleSnapshotAt = new Date('2026-07-13T00:00:00.000Z');
    fs.utimesSync(
      path.join(input.diabetes, 'workspace_index.json'),
      lifecycleSnapshotAt,
      lifecycleSnapshotAt,
    );
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-provider-running-ledger-queued',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'running',
        lastHeartbeatAt: '2026-07-14T00:01:00.000Z',
        stageId: 'bounded_analysis_campaign',
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:01:00.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-14T00:01:00.000Z',
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    const executionRunning = item.conditions.find((condition) => condition.type === 'ExecutionRunning');

    assert.equal(item.execution.state, 'running');
    assert.equal(item.execution.stage_status, 'running');
    assert.equal(item.execution.running_proof_status, 'running_confirmed');
    assert.equal(item.execution.diagnostic_reason, 'ledger_pending_while_provider_or_temporal_running');
    assert.equal(executionRunning?.status, 'True');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('legacy action request identity recovery is digest-bound and fail-closed', () => {
  const input = fixture();
  try {
    const workItemId = '001-dm-cvd-mortality-risk';
    const validRequest = writeActionRequest(input.diabetes, 'legacy-identity-valid', {
      workspace_root: input.diabetes,
      study_id: workItemId,
    });
    const valid = attempt({
      id: 'sat-legacy-identity-valid',
      root: input.diabetes,
      workItemId,
      status: 'queued',
      identityField: null,
      actionRequest: validRequest,
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    const validProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [valid],
      resolveDescriptor: input.resolveDescriptor,
    });
    const validItem = validProjection.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(validItem.execution.attempt_id, 'sat-legacy-identity-valid');
    assert.equal(
      validItem.source_refs.some((source) =>
        source.role === 'stage_attempt_action_request_identity_evidence'
          && source.ref === `${validRequest.ref}#sha256=${validRequest.sha256}`
      ),
      true,
    );
    assert.equal(validProjection.diagnostics.items.some((diagnostic) =>
      diagnostic.reason === 'stage_attempt_action_request_identity_recovery_failed'
    ), false);

    const tampered = attempt({
      id: 'sat-legacy-identity-tampered',
      root: input.diabetes,
      workItemId,
      status: 'queued',
      identityField: null,
      actionRequest: { ref: validRequest.ref, sha256: '0'.repeat(64) },
      updatedAt: '2026-07-15T00:02:00.000Z',
    });
    const tamperedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [tampered],
      resolveDescriptor: input.resolveDescriptor,
    });
    const tamperedItem = tamperedProjection.items.find((item) => item.identity.work_item_id === workItemId)!;
    assert.equal(tamperedItem.execution.attempt_id, null);
    assert.equal(
      tamperedProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.reason === 'stage_attempt_action_request_identity_recovery_failed'
          && diagnostic.details?.failure_reason === 'action_request_digest_mismatch'
      ),
      true,
    );

    const escapedRequest = writeActionRequest(input.pitnet, 'legacy-identity-escaped', {
      workspace_root: input.diabetes,
      study_id: workItemId,
    });
    const escapedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-legacy-identity-escaped',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        identityField: null,
        actionRequest: escapedRequest,
        updatedAt: '2026-07-15T00:02:30.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      escapedProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.details?.failure_reason === 'action_request_ref_escapes_workspace'
      ),
      true,
    );

    const symlinkRun = path.join(input.diabetes, 'control', 'opl', 'action_runs', 'legacy-identity-symlink');
    fs.mkdirSync(symlinkRun, { recursive: true });
    const symlinkTarget = path.join(input.diabetes, 'legacy-identity-target.json');
    const symlinkBytes = Buffer.from(JSON.stringify({ study_id: workItemId }), 'utf8');
    fs.writeFileSync(symlinkTarget, symlinkBytes);
    const symlinkRequestPath = path.join(symlinkRun, 'request.json');
    fs.symlinkSync(symlinkTarget, symlinkRequestPath);
    const symlinkProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-legacy-identity-symlink',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        identityField: null,
        actionRequest: {
          ref: pathToFileURL(symlinkRequestPath).href,
          sha256: crypto.createHash('sha256').update(symlinkBytes).digest('hex'),
        },
        updatedAt: '2026-07-15T00:02:40.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      symlinkProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.details?.failure_reason === 'action_request_ref_symbolic_link'
      ),
      true,
    );

    const oversizedPath = path.join(
      input.diabetes,
      'control',
      'opl',
      'action_runs',
      'legacy-identity-oversized',
      'request.json',
    );
    fs.mkdirSync(path.dirname(oversizedPath), { recursive: true });
    const oversizedBytes = Buffer.alloc(1_048_577, 0x20);
    fs.writeFileSync(oversizedPath, oversizedBytes);
    const oversizedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-legacy-identity-oversized',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        identityField: null,
        actionRequest: {
          ref: pathToFileURL(oversizedPath).href,
          sha256: crypto.createHash('sha256').update(oversizedBytes).digest('hex'),
        },
        updatedAt: '2026-07-15T00:02:50.000Z',
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      oversizedProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.details?.failure_reason === 'action_request_ref_too_large'
      ),
      true,
    );

    const conflictingRequest = writeActionRequest(input.diabetes, 'legacy-identity-conflict', {
      workspace_root: input.diabetes,
      study_id: workItemId,
      work_item_id: '002-dm-china-us-mortality-attribution',
    });
    const conflicting = attempt({
      id: 'sat-legacy-identity-conflict',
      root: input.diabetes,
      workItemId,
      status: 'queued',
      identityField: null,
      actionRequest: conflictingRequest,
      updatedAt: '2026-07-15T00:03:00.000Z',
    });
    const conflictingProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [conflicting],
      resolveDescriptor: input.resolveDescriptor,
    });
    assert.equal(
      conflictingProjection.diagnostics.items.some((diagnostic) =>
        diagnostic.details?.failure_reason === 'action_request_identity_conflicting'
      ),
      true,
    );
    assert.equal(
      conflictingProjection.items.find((item) => item.identity.work_item_id === workItemId)?.execution.attempt_id,
      null,
    );
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('fresh Temporal runtime observation reconciles queued ledger in the fast producer', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const observedAt = new Date(Date.now() - 1_000);
    const expiresAt = new Date(observedAt.getTime() + 600_000);
    const runtimeObservation = {
      surface_kind: 'temporal_stage_attempt_runtime_observation',
      source: 'temporal_workflow_query',
      observed_at: observedAt.toISOString(),
      ttl_ms: 600_000,
      expires_at: expiresAt.toISOString(),
      workflow_status: 'RUNNING',
      query_status: 'running',
      effective_runtime_status: 'running',
      stage_attempt_id: 'sat-temporal-observation-running',
      workflow_id: 'workflow:sat-temporal-observation-running',
      run_id: 'temporal-run-002',
      provider_updated_at: observedAt.toISOString(),
      provider_completion_is_domain_ready: false,
    };
    const projection = buildAppRuntimeWorkItemProjection({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-temporal-observation-running',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'registered',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimeObservation,
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.execution.state, 'running');
    assert.equal(item.execution.stage_status, 'running');
    assert.equal(item.execution.running_proof_status, 'running_confirmed');
    assert.equal(item.execution.diagnostic_reason, null);
    assert.equal(item.lifecycle.primary_state, 'automatically_advancing');
    assert.equal(item.lifecycle.primary_state_reason, 'current_runtime_wake_running');
    assert.equal(projection.summary.running_count, 1);

    const mismatched = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-temporal-observation-copied',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'registered',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimeObservation,
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const mismatchedItem = mismatched.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(mismatchedItem.execution.state, 'queued');
    assert.equal(
      mismatchedItem.execution.diagnostic_reason,
      'temporal_runtime_observation_identity_mismatch',
    );
    assert.equal(mismatchedItem.lifecycle.primary_state, 'paused');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('expired Temporal runtime observation stays queued with a diagnostic and does not wake stopped work', () => {
  const input = fixture();
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const observedAt = new Date(Date.now() - 1_200_000);
    const expiresAt = new Date(observedAt.getTime() + 600_000);
    const runtimeObservation = {
      surface_kind: 'temporal_stage_attempt_runtime_observation',
      source: 'temporal_workflow_query',
      observed_at: observedAt.toISOString(),
      ttl_ms: 600_000,
      expires_at: expiresAt.toISOString(),
      workflow_status: 'RUNNING',
      query_status: 'running',
      effective_runtime_status: 'running',
      stage_attempt_id: 'sat-temporal-observation-expired',
      workflow_id: 'workflow:sat-temporal-observation-expired',
      run_id: 'temporal-run-expired',
      provider_updated_at: observedAt.toISOString(),
      provider_completion_is_domain_ready: false,
    };
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-temporal-observation-expired',
        root: input.diabetes,
        workItemId,
        status: 'queued',
        providerStatus: 'registered',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runtimeObservation,
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.execution.state, 'queued');
    assert.equal(item.execution.stage_status, 'queued');
    assert.equal(item.execution.diagnostic_reason, 'temporal_runtime_observation_expired');
    assert.equal(item.lifecycle.primary_state, 'paused');
    assert.equal(projection.summary.running_count, 0);

    const stoppedWorkItemId = '001-lineage-pfs';
    const stoppedSnapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.pitnet, 'workspace_index.json'), stoppedSnapshot, stoppedSnapshot);
    const stoppedProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [attempt({
        id: 'sat-stopped-post-snapshot-human-gate',
        root: input.pitnet,
        workItemId: stoppedWorkItemId,
        status: 'human_gate',
        stageId: '01-study_intake',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })],
      resolveDescriptor: input.resolveDescriptor,
    });
    const stopped = stoppedProjection.items.find((item) => item.identity.work_item_id === stoppedWorkItemId)!;
    assert.equal(stopped.lifecycle.business_state, 'stopped');
    assert.equal(stopped.execution.attempt_id, null);
    assert.equal(stopped.lifecycle.primary_state, 'stopped');
    assert.equal(stopped.attention.kind, 'none');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('Temporal running query overrides a lagging queued attempt ledger', () => {
  const currentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: 'queued',
    providerKind: 'temporal',
    providerRun: { provider_status: 'registered' },
    temporalQuery: {
      workflow_status: 'RUNNING',
      query: { status: 'running' },
    },
  });

  assert.equal(currentness.effective_runtime_status, 'running');
  assert.equal(currentness.running_proof_status, 'running_confirmed');
  assert.equal(currentness.projection_status, 'ledger_lagging_projection');
  assert.deepEqual(currentness.running_proof_sources, [
    'temporal_workflow_visibility',
    'temporal_workflow_query',
  ]);
});

test('post-snapshot human_gate identity recovery projects owner decision instead of paused idle', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  try {
    const workItemId = '004-dpcc-longitudinal-care-inertia-intensification-gap';
    const snapshot = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(input.diabetes, 'workspace_index.json'), snapshot, snapshot);
    const request = writeActionRequest(input.diabetes, 'legacy-human-gate', {
      workspace_root: input.diabetes,
      study_id: workItemId,
    });
    const createdAt = new Date().toISOString();
    const stageRunId = 'sr_legacy_human_gate';
    const stageRunLaunch = {
      surface_kind: 'opl_stage_run_launch_registry_entry',
      version: 'opl-stage-run-launch-registry-entry.v2',
      stage_run_id: stageRunId,
      stage_run_invocation_id: 'stage-run-invocation:legacy-human-gate',
      stage_run_spec_sha256: 'a'.repeat(64),
      domain_id: 'medautoscience',
      stage_id: '01-study_intake',
      workflow_id: 'stage-run-workflow:legacy-human-gate',
      stage_run_input: {
        workspace_locator: {
          workspace_root: input.diabetes,
          action_request_ref: request.ref,
          action_request_sha256: request.sha256,
        },
      },
      launch_status: 'closed',
      terminal_status: 'human_gate',
      created_at: createdAt,
      updated_at: createdAt,
    };
    const gateAttempt = attempt({
      id: 'sat-legacy-human-gate',
      root: input.diabetes,
      workItemId,
      status: 'completed',
      stageId: '01-study_intake',
      identityField: null,
      createdAt,
      updatedAt: createdAt,
      stageRunId,
    });
    process.env.OPL_STATE_DIR = path.join(input.root, 'opl-state');
    const queueDb = path.join(process.env.OPL_STATE_DIR, 'family-runtime', 'queue.sqlite');
    fs.mkdirSync(path.dirname(queueDb), { recursive: true });
    const db = new DatabaseSync(queueDb);
    try {
      createStageAttemptTable(db);
      createStageRunLaunchTable(db);
      persistStageAttempt(db, gateAttempt);
      db.prepare(`
        INSERT INTO stage_run_launches (
          stage_run_id, stage_run_invocation_id, stage_run_spec_sha256,
          domain_id, stage_id, workflow_id, parent_route_decision_ref,
          stage_run_input_json, launch_status, temporal_start_receipt_json,
          terminal_status, last_start_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'closed', NULL, 'human_gate', NULL, ?, ?)
      `).run(
        stageRunId,
        stageRunLaunch.stage_run_invocation_id,
        stageRunLaunch.stage_run_spec_sha256,
        stageRunLaunch.domain_id,
        stageRunLaunch.stage_id,
        stageRunLaunch.workflow_id,
        JSON.stringify(stageRunLaunch.stage_run_input),
        createdAt,
        createdAt,
      );
    } finally {
      db.close();
    }
    const ledger = readWorkItemStageAttempts();
    assert.equal(ledger.attempts[0]?.status, 'completed');
    assert.equal(record(record(ledger.attempts[0]).stage_run_launch).terminal_status, 'human_gate');
    const projection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: ledger.attempts,
      qualityCycles: ledger.quality_cycles,
      queueDb: ledger.queue_db,
      resolveDescriptor: input.resolveDescriptor,
    });
    const item = projection.items.find((candidate) => candidate.identity.work_item_id === workItemId)!;
    assert.equal(item.lifecycle.business_state, 'paused');
    assert.equal(item.execution.attempt_id, 'sat-legacy-human-gate');
    assert.equal(item.execution.state, 'idle');
    assert.equal(item.execution.stage_status, 'human_gate');
    assert.equal(item.attention.kind, 'user');
    assert.equal(item.attention.reason, 'runtime_human_gate_requires_owner_decision');
    assert.equal(item.action.owner_kind, 'user');
    assert.equal(item.action.action_ref, 'runtime-human-gate:sat-legacy-human-gate');
    assert.equal(item.lifecycle.primary_state, 'awaiting_user_decision');
    assert.equal(item.lifecycle.primary_state_label, '等待你决定');
    assert.equal(item.stage_map.find((stage) => stage.stage_id === '01-study_intake')?.state, 'waiting_user');
    assert.equal(projection.summary.user_attention_count, 1);
    assert.equal(
      item.source_refs.some((source) =>
        source.role === 'stage_run_terminal_execution_evidence'
          && source.ref.endsWith(`#stage_run_launches/${stageRunId}`)
      ),
      true,
    );
    const legacy = projectWorkItemRuntimeActivityItems(projection).find((entry) => entry.work_item_id === workItemId)!;
    assert.equal(legacy.business_primary_state, 'owner_decision_required');
    assert.equal(legacy.lane, 'attention');
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('delivered Stage Map uses the canonical recorded boundary without inferring a missing one', () => {
  const workItemRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-terminal-stage-map-'));
  const stageIndexRef = 'control/stage_index.json';
  const stageIndexPath = path.join(workItemRoot, stageIndexRef);
  fs.mkdirSync(path.dirname(stageIndexPath), { recursive: true });
  const project = (
    businessState: 'active' | 'delivered_paused' | 'paused' | 'stopped',
    lastRecordedStageId: string | null = '08-publication_package_handoff',
  ) => {
    const payload: Record<string, unknown> = {
      current_stage_id: businessState === 'active' ? '08-publication_package_handoff' : null,
      stages: [
        { stage_id: '01-study_intake', status: 'receipt_recorded' },
        { stage_id: '08-publication_package_handoff', status: 'in_progress' },
        { stage_id: 'manual_foreground_paper_sprint', status: 'typed_blocked' },
        { stage_id: 'milestone_submission_package', status: 'pending' },
      ],
    };
    if (lastRecordedStageId !== null) payload.last_recorded_stage_id = lastRecordedStageId;
    fs.writeFileSync(stageIndexPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return readStageIndexPresentation({
      workItemRoot,
      stageIndexRef,
      businessState,
      currentStageId: businessState === 'active' ? '08-publication_package_handoff' : null,
      agentId: 'mas',
      agentDisplayName: 'Med Auto Science',
    });
  };

  try {
    const delivered = project('delivered_paused');
    assert.deepEqual(
      delivered.stage_map.map((stage) => [stage.stage_id, stage.state]),
      [
        ['01-study_intake', 'completed'],
        ['08-publication_package_handoff', 'completed'],
      ],
    );
    assert.deepEqual(project('active').stage_map.map((stage) => stage.state), [
      'completed',
      'current',
      'next',
      'pending',
    ]);
    assert.deepEqual(project('paused').stage_map.map((stage) => stage.state), [
      'completed',
      'pending',
      'stopped',
      'pending',
    ]);
    assert.deepEqual(project('stopped').stage_map.map((stage) => stage.state), [
      'completed',
      'stopped',
      'stopped',
      'stopped',
    ]);

    const missingBoundary = project('delivered_paused', null);
    assert.deepEqual(missingBoundary.stage_map.map((stage) => stage.state), [
      'completed',
      'pending',
      'stopped',
      'pending',
    ]);
    assert.equal(
      missingBoundary.diagnostics.some((diagnostic) =>
        diagnostic.reason === 'stage_index_last_recorded_stage_id_missing'
      ),
      true,
    );
    const unresolvedBoundary = project('delivered_paused', 'missing-stage');
    assert.deepEqual(unresolvedBoundary.stage_map.map((stage) => stage.state), [
      'completed',
      'pending',
      'stopped',
      'pending',
    ]);
    assert.equal(
      unresolvedBoundary.diagnostics.some((diagnostic) =>
        diagnostic.reason === 'stage_index_last_recorded_stage_id_unresolved'
      ),
      true,
    );
  } finally {
    fs.rmSync(workItemRoot, { recursive: true, force: true });
  }
});

test('Stage Map transports validated locale names and keeps an en-US compatibility fallback', () => {
  const workItemRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-localized-stage-map-'));
  const stageIndexRef = 'control/stage_index.json';
  const stageIndexPath = path.join(workItemRoot, stageIndexRef);
  fs.mkdirSync(path.dirname(stageIndexPath), { recursive: true });
  fs.writeFileSync(stageIndexPath, `${JSON.stringify({
    current_stage_id: '01-intake',
    stages: [
      {
        stage_id: '01-intake',
        display_name: 'Legacy intake',
        display_names: {
          'en-US': 'Intake',
          'zh-CN': '立项',
          'fr-FR': 'Accueil',
        },
        status: 'in_progress',
      },
      {
        stage_id: '02-analysis_plan',
        title: 'Analysis Plan',
        display_names: { 'zh-CN': '   ', 'fr-FR': 42 },
        status: 'pending',
      },
      { stage_id: '03-review', display_name: '复核', status: 'pending' },
      { stage_id: '04-closeout', status: 'pending' },
    ],
  }, null, 2)}\n`, 'utf8');

  try {
    const projection = readStageIndexPresentation({
      workItemRoot,
      stageIndexRef,
      businessState: 'active',
      currentStageId: '01-intake',
      agentId: 'example-agent',
      agentDisplayName: 'Example Agent',
    });

    assert.deepEqual(
      projection.stage_map.map((stage) => ({
        stage_id: stage.stage_id,
        display_name: stage.display_name,
        display_names: stage.display_names,
      })),
      [
        {
          stage_id: '01-intake',
          display_name: 'Legacy intake',
          display_names: { 'en-US': 'Intake', 'zh-CN': '立项', 'fr-FR': 'Accueil' },
        },
        {
          stage_id: '02-analysis_plan',
          display_name: 'Analysis Plan',
          display_names: { 'en-US': 'Analysis Plan' },
        },
        {
          stage_id: '03-review',
          display_name: '复核',
          display_names: { 'en-US': '复核' },
        },
        {
          stage_id: '04-closeout',
          display_name: 'Closeout',
          display_names: { 'en-US': 'Closeout' },
        },
      ],
    );
    assert.deepEqual(
      projection.diagnostics.find((diagnostic) =>
        diagnostic.reason === 'stage_index_stage_display_names_invalid'
      )?.details,
      { stage_id: '02-analysis_plan', invalid_entry_count: 2 },
    );
  } finally {
    fs.rmSync(workItemRoot, { recursive: true, force: true });
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
    assert.equal(item.lifecycle.primary_state, 'delivered_auto_paused');
    assert.equal(item.lifecycle.primary_state_label, '已交付自动暂停');
    assert.equal(item.lifecycle.last_transition_at, item.freshness.last_transition_time);
    assert.equal(item.lifecycle.current_stage_id, null);
    assert.equal(item.action.title_key, 'lifecycle.deliveredPaused.title');
    assert.equal(item.action.summary_key, 'lifecycle.deliveredPaused.summary');
    assert.deepEqual(item.action.message_args, {});
    assert.equal(item.action.owner_kind, 'user');
    assert.equal(item.execution.state, 'idle');
    assert.equal(item.execution.current_stage_id, null);
    assert.equal(item.execution.attempt_id, null);
    assert.equal(item.attention.kind, 'none');
    assert.equal(item.telemetry.state, 'partial');
    assert.deepEqual(
      [item.telemetry.current_stage.state, item.telemetry.current_stage.missing_reason, item.telemetry.cumulative.total_tokens],
      ['missing', 'current_stage_not_applicable', 1500],
    );
    assert.equal(projection.summary.telemetry_observed_count, 1);
    assert.equal(projection.summary.telemetry_missing_count, 8);
    assert.equal(item.stage_map.at(-1)?.state, 'completed');
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

test('App Runtime fast visibility archive keeps lifecycle, Stage Map, action, telemetry, and execution intact', () => {
  const input = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = path.join(input.root, 'opl-state');
  try {
    const workItemId = 'obesity_multicenter_phenotype_atlas';
    const runningAttempt = attempt({
      id: 'sat-running-while-archived',
      root: input.obesity,
      workItemId,
      status: 'running',
      updatedAt: new Date().toISOString(),
      tokenUsage: { input_tokens: 800, output_tokens: 200, total_tokens: 1000 },
    });
    const build = () => buildAppRuntimeWorkItemProjection({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      resolveDescriptor: input.resolveDescriptor,
      attempts: [runningAttempt],
    });
    const baseline = build();
    const baselineItem = baseline.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.equal(baselineItem.execution.state, 'running');
    assert.equal(baselineItem.visibility.generation, 0);

    setWorkItemVisibilityState({
      agent_id: baselineItem.identity.agent_id,
      project_id: baselineItem.identity.project_id,
      work_item_id: baselineItem.identity.work_item_id,
      visibility_state: 'archived',
      reason: 'hide completed review from the default list',
      expected_generation: baselineItem.visibility.generation,
    });
    const archived = build();
    const archivedItem = archived.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.equal(archived.items.length, 9);
    assert.equal(archived.summary.work_item_count, 8);
    assert.equal(archived.summary.visible_work_item_count, 8);
    assert.equal(archived.summary.archived_work_item_count, 1);
    assert.equal(archived.summary.total_work_item_count, 9);
    assert.equal(archived.summary.running_count, 0);
    assert.deepEqual(archivedItem.visibility, {
      state: 'archived',
      source: 'work_item_control_ledger',
      updated_at: archivedItem.visibility.updated_at,
      control_ref: `opl://work-item-control/${encodeURIComponent(archivedItem.identity.agent_id)}/${encodeURIComponent(archivedItem.identity.project_id)}/${encodeURIComponent(workItemId)}`,
      generation: 1,
    });
    assert.equal(typeof archivedItem.visibility.updated_at, 'string');
    assert.equal(archivedItem.lifecycle.business_state, baselineItem.lifecycle.business_state);
    assert.equal(archivedItem.lifecycle.control_state, null);
    assert.equal(archivedItem.lifecycle.source, 'domain_inventory_projection');
    assert.deepEqual(archivedItem.execution, baselineItem.execution);
    assert.deepEqual(archivedItem.stage_map, baselineItem.stage_map);
    assert.deepEqual(archivedItem.action, baselineItem.action);
    assert.deepEqual(archivedItem.telemetry, baselineItem.telemetry);
    const defaultVisibleItem = archived.items.find(
      (candidate) => candidate.identity.work_item_id === '001-dm-cvd-mortality-risk',
    )!;
    assert.deepEqual(defaultVisibleItem.visibility, {
      state: 'visible',
      source: 'default',
      updated_at: null,
      control_ref: null,
      generation: 1,
    });

    setWorkItemVisibilityState({
      agent_id: archivedItem.identity.agent_id,
      project_id: archivedItem.identity.project_id,
      work_item_id: archivedItem.identity.work_item_id,
      visibility_state: 'visible',
      reason: 'restore to the default list',
      expected_generation: archivedItem.visibility.generation,
    });
    const restored = build();
    const restoredItem = restored.items.find(
      (candidate) => candidate.identity.work_item_id === workItemId,
    )!;
    assert.equal(restoredItem.visibility.state, 'visible');
    assert.equal(restoredItem.visibility.source, 'work_item_control_ledger');
    assert.equal(restoredItem.visibility.generation, 2);
    assert.equal(restoredItem.lifecycle.business_state, 'active');
    assert.equal(restoredItem.execution.state, 'running');
    assert.equal(restored.summary.work_item_count, 9);
    assert.equal(restored.summary.archived_work_item_count, 0);
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
    assert.equal(completeItem.lifecycle.primary_state, 'system_attention');
    assert.equal(completeItem.lifecycle.primary_state_reason, 'current_repair_route_blocks_work_item');
    assert.equal(completeItem.action.kind, 'system_action');
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
    assert.equal(incompleteItem.lifecycle.primary_state, 'automatically_advancing');
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

test('primary-state projection keeps responsibility and lifecycle precedence centralized', () => {
  const baseAttention = {
    kind: 'none' as const,
    reason: 'no_current_action_required',
    owner: null,
    responsible_component: null,
    issue: null,
    impact: null,
    repair_action: null,
    expected_outcome: null,
  };
  const user = projectWorkItemPrimaryState({
    businessState: 'active',
    attention: { ...baseAttention, kind: 'user', reason: 'domain_lifecycle_requires_user_decision', owner: 'user' },
    lastTransitionAt: '2026-07-13T08:00:00.000Z',
  });
  const incompleteSystem = projectWorkItemPrimaryState({
    businessState: 'paused',
    attention: { ...baseAttention, kind: 'system', responsible_component: 'opl_framework' },
    lastTransitionAt: '2026-07-13T09:00:00.000Z',
  });

  assert.deepEqual(user, {
    primary_state: 'awaiting_user_decision',
    primary_state_reason: 'domain_lifecycle_requires_user_decision',
    reason: 'domain_lifecycle_requires_user_decision',
    primary_state_label: '等待你决定',
    last_transition_at: '2026-07-13T08:00:00.000Z',
  });
  assert.equal(incompleteSystem.primary_state, 'paused');
  assert.equal(incompleteSystem.primary_state_reason, 'paused_until_new_direction');
});

test('agent availability is package health only in fast and full profiles', () => {
  const packageItems = ['mas', 'mag', 'rca', 'oma', 'obf'].map((packageId) => ({
    package_id: packageId,
    source_path: `/packages/${packageId}`,
  }));
  const fastStatuses = Object.fromEntries(packageItems.map(({ package_id }) => [package_id, {
    status: 'installed',
    codex_visible: true,
    package_version: '1.0.0',
    package_lock_ref: `/locks/${package_id}.json`,
  }]));
  const descriptorByAgent = new Map<string, StandardAgentDescriptorInterface | null>([
    ['mas', masDescriptor()],
    ['mag', null],
    ['rca', null],
    ['oma', null],
    ['obf', null],
  ]);
  const fast = buildAgentCatalog({
    profile: 'fast',
    checkedAt: '2026-07-13T08:00:00.000Z',
    packageItems,
    packageStatusById: fastStatuses,
    descriptorByAgent,
  }).availability;
  assert.equal(fast.every((entry) => entry.availability === 'available'), true);
  assert.equal(fast.every((entry) => entry.last_checked_at === '2026-07-13T08:00:00.000Z'), true);
  assert.equal(fast.every((entry) => entry.independent_from_work_item_state), true);
  assert.equal(fast.find((entry) => entry.agent_id === 'mag')?.inventory_descriptor.status, 'unreadable');

  const fullStatuses = Object.fromEntries(Object.entries(fastStatuses).map(([packageId, status]) => [packageId, {
    ...status,
    launch_allowed: packageId !== 'mag',
    launch_blocked_reason: packageId === 'mag' ? 'managed_runtime_source_missing' : null,
  }]));
  delete fullStatuses.obf;
  const full = buildAgentCatalog({
    profile: 'full',
    checkedAt: '2026-07-13T09:00:00.000Z',
    packageItems,
    packageStatusById: fullStatuses,
    descriptorByAgent,
  }).availability;
  assert.equal(full.find((entry) => entry.agent_id === 'mas')?.availability, 'available');
  assert.equal(full.find((entry) => entry.agent_id === 'mag')?.availability, 'attention_required');
  assert.equal(full.find((entry) => entry.agent_id === 'obf')?.availability, 'unavailable');
  assert.equal(full.every((entry) => entry.source === 'package_status'), true);
});

test('deferred inventory keeps startup catalogs without resolving domain descriptors', () => {
  const input = fixture();
  let descriptorReadCount = 0;
  try {
    const projection = buildWorkItemProjectionV2({
      profile: 'fast',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      inventoryDetail: 'deferred',
      resolveDescriptor: () => {
        descriptorReadCount += 1;
        throw new Error('deferred inventory must not resolve domain descriptors');
      },
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    assert.equal(descriptorReadCount, 0);
    assert.equal(projection.project_catalog.length, 3);
    assert.equal(projection.agent_catalog.length > 0, true);
    assert.deepEqual(projection.items, []);
    assert.equal(projection.detail_policy.inventory_detail, 'deferred');
    assert.equal(projection.detail_policy.all_work_item_summaries_included, false);
    assert.equal(projection.detail_policy.attempt_ref_limit_per_item, 0);
    assert.equal(projection.detail_policy.full_detail_surface, 'opl app state --profile full --json');
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});

test('WorkItemProjection V2 output validates against its machine schema', () => {
  const input = fixture();
  try {
    const schemaRef = 'contracts/opl-framework/work-item-projection-v2.schema.json';
    const schema = parseJsonText(fs.readFileSync(path.join(process.cwd(), schemaRef), 'utf8')) as Record<string, unknown>;
    for (const projection of [
      buildWorkItemProjectionV2({
        profile: 'full',
        bindings: input.bindings,
        packageProjectionItems: input.packageProjectionItems,
        packageStatusById: input.packageStatusById,
        attempts: [],
        resolveDescriptor: input.resolveDescriptor,
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
      buildWorkItemProjectionV2({
        profile: 'fast',
        bindings: input.bindings,
        packageProjectionItems: input.packageProjectionItems,
        packageStatusById: input.packageStatusById,
        inventoryDetail: 'deferred',
        generatedAt: '2026-07-13T00:00:00.000Z',
      }),
    ]) {
      const validation = validateJsonSchemaPayload({
        schemaId: 'opl.work_item_projection.v2',
        schema,
        sourceRef: schemaRef,
      }, projection);
      assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.errors, null, 2));
    }

    const fullProjection = buildWorkItemProjectionV2({
      profile: 'full',
      bindings: input.bindings,
      packageProjectionItems: input.packageProjectionItems,
      packageStatusById: input.packageStatusById,
      attempts: [],
      resolveDescriptor: input.resolveDescriptor,
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    const localizedStage = fullProjection.items.find((item) => item.stage_map.length > 0)?.stage_map[0];
    assert.ok(localizedStage);
    localizedStage.display_names['zh-CN'] = '研究立项';
    const localizedValidation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2',
      schema,
      sourceRef: schemaRef,
    }, fullProjection);
    assert.equal(
      localizedValidation.ok,
      true,
      localizedValidation.ok ? undefined : JSON.stringify(localizedValidation.errors, null, 2),
    );
    localizedStage.display_names['zh-CN'] = '   ';
    const invalidValidation = validateJsonSchemaPayload({
      schemaId: 'opl.work_item_projection.v2',
      schema,
      sourceRef: schemaRef,
    }, fullProjection);
    assert.equal(invalidValidation.ok, false);
  } finally {
    fs.rmSync(input.root, { recursive: true, force: true });
  }
});
