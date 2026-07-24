import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { buildPublicAppCommandSpecs } from '../../src/entrypoints/cli/cases/app-public-command-specs.ts';
import { buildAppRuntimeWorkItemProjection } from '../../src/modules/console/app-runtime-work-item-projection.ts';
import { APP_RUNTIME_STATE_PROFILE_V1_CAPABILITY_ID } from '../../src/modules/console/app-runtime-state.ts';
import {
  APP_TYPED_DOMAIN_VIEWS_V3_CAPABILITY_ID,
  validateAppRuntimeFastWorkItemProjectionContract,
} from '../../src/modules/charter/contract-validators/app-runtime-fast-work-item-projection-contract.ts';

const CONTRACT_REF = 'contracts/opl-framework/app-runtime-fast-work-item-projection-contract.json';

function readJson(ref: string) {
  return parseJsonText(fs.readFileSync(ref, 'utf8')) as Record<string, any>;
}

test('App Runtime fast producer contract keeps summaries complete and diagnostics bounded', () => {
  const contract = parseJsonText(fs.readFileSync(CONTRACT_REF, 'utf8')) as Record<string, any>;

  assert.equal(contract.contract_kind, 'opl_app_runtime_fast_work_item_projection_producer.v1');
  assert.equal(
    contract.producer_surface,
    'opl app state --profile fast --json#app_state.operator.workbench.work_item_projection_v2',
  );
  assert.deepEqual(contract.runtime_capability_bridge, {
    capability_id: APP_RUNTIME_STATE_PROFILE_V1_CAPABILITY_ID,
    discovery_field: 'app_state.meta.capabilities[]',
    runtime_state_surface: 'opl app state --profile runtime --json',
    runtime_projection_surface:
      'opl app state --profile runtime --json#app_state.operator.workbench.work_item_projection_v2',
    projection_detail_profile: 'fast',
    default_state_profile: 'fast',
    runtime_profile_is_default: false,
    fast_compatibility_required: true,
    legacy_consumer_policy: {
      capability_absent_requires_fast_fallback: true,
      runtime_command_probe_before_capability_discovery: false,
    },
  });
  assert.equal(contract.inventory_policy.all_registered_work_item_summaries_included, true);
  assert.equal(contract.inventory_policy.archived_work_items_included, true);
  assert.equal(contract.inventory_policy.runtime_history_may_create_work_items, false);
  assert.equal(contract.inventory_policy.legacy_runtime_views_repopulated_from_work_items, false);
  assert.equal(contract.inventory_policy.project_identity_source, 'workspace_binding.project_scope_id');
  assert.equal(contract.inventory_policy.workspace_path_is_project_identity, false);
  assert.equal(contract.execution_identity_policy.authoritative_scope_source, 'attempt.execution_scope');
  assert.equal(contract.execution_identity_policy.join_key, 'execution_scope.work_item_scope_id');
  assert.equal(contract.execution_identity_policy.workspace_locator_aliases_may_assign_work_item, false);
  assert.equal(
    contract.execution_identity_policy.legacy_locator_execution_scope_policy,
    'diagnostic_only_identity_unresolved',
  );
  assert.equal(contract.execution_identity_policy.unresolved_or_conflicting_execution_is_quarantined, true);
  assert.deepEqual(contract.execution_identity_policy.stage_run_without_attempt_policy, {
    record_kind: 'stage_run_without_stage_attempt',
    scope_source: 'stage_run.execution_scope',
    projection_effect: 'diagnostic_only',
    resolved_scope_may_mark_matching_work_item_execution_unknown: true,
    may_create_attempt_workflow_wake_running_proof_or_usage: false,
    untrusted_claimed_scope_is_detail_only: true,
    unresolved_quarantined_or_conflicting_scope_may_assign_work_item: false,
    diagnostic_details_are_bounded: true,
  });
  assert.deepEqual(contract.session_activity_policy, {
    projection_field: 'items[].session_activity',
    summary_field: 'summary.active_session_count',
    coordination_source: 'opl_work_item_execution_session_binding_ledger',
    controlled_execution_source: 'opl_stage_attempt_execution_session_binding',
    coordination_can_affect_execution: false,
    controlled_execution_requires_resolved_execution_scope: true,
    runtime_history_may_create_work_items: false,
    human_gate_precedence: true,
    fast_reader_scope: 'registered_inventory_exact_resolved_work_item_scope_only',
    full_profile_retains_identity_diagnostics: true,
  });
  assert.equal(contract.bounded_fast_policy.max_serialized_work_item_summary_bytes_per_item, 16_384);
  assert.equal(contract.bounded_fast_policy.current_projection_acceptance_budget_bytes, 131_072);
  assert.equal(contract.bounded_fast_policy.attempt_ref_limit_per_item, 1);
  assert.equal(contract.bounded_fast_policy.diagnostic_items_embedded, false);
  assert.equal(contract.bounded_fast_policy.identity_health_summary_embedded, true);
  assert.equal(contract.bounded_fast_policy.identity_health_sample_attempt_ref_limit, 1);
  assert.equal(
    contract.bounded_fast_policy.stage_attempt_read_scope,
    'registered_inventory_exact_resolved_work_item_scope_only',
  );
  assert.equal(contract.bounded_fast_policy.irrelevant_runtime_history_parsed, false);
  assert.equal(contract.bounded_fast_policy.unresolved_execution_details_embedded, false);
  assert.equal(contract.bounded_fast_policy.condition_details_embedded, false);
  assert.equal(contract.bounded_fast_policy.source_ref_details_embedded, false);
  assert.equal(contract.bounded_fast_policy.token_source_ref_details_embedded, false);
  assert.equal(contract.bounded_fast_policy.inventory_detail, 'included');
  for (const requiredAxis of [
    'execution.current_stage_id',
    'execution.attempt_id',
    'session_activity.state',
    'session_activity.active_session_count',
    'telemetry.current_stage',
    'telemetry.cumulative',
    'visibility.state',
  ]) {
    assert.equal(contract.default_summary_axes.includes(requiredAxis), true, requiredAxis);
  }
  assert.equal(contract.stage_popover_axes.includes('stage_map[].display_names'), true);
});

test('App Runtime producer never defers fast inventory even with no registered projects', () => {
  const projection = buildAppRuntimeWorkItemProjection({
    profile: 'fast',
    bindings: [],
    attempts: [],
    generatedAt: '2026-07-15T00:00:00.000Z',
  });

  assert.deepEqual(projection.items, []);
  assert.equal(projection.detail_policy.inventory_detail, 'included');
  assert.equal(projection.detail_policy.all_work_item_summaries_included, true);
  assert.equal(projection.detail_policy.attempt_ref_limit_per_item, 1);
  assert.equal(projection.diagnostics.detail_policy, 'summary_only');
  assert.deepEqual(projection.diagnostics.items, []);
});

test('App Runtime publishes descriptor-driven typed domain views', () => {
  const contract = readJson(CONTRACT_REF);
  const commandIds = Object.keys(buildPublicAppCommandSpecs(() => {
    throw new Error('Contract loading is not needed to enumerate App commands.');
  }));

  validateAppRuntimeFastWorkItemProjectionContract({
    filePath: CONTRACT_REF,
    value: contract,
    standardAgentInterfaceSchema: readJson('contracts/opl-framework/standard-agent-interface.schema.json'),
    workItemProjectionSchema: readJson('contracts/opl-framework/work-item-projection-v2.schema.json'),
    publicAppCommandIds: commandIds,
  });

  assert.deepEqual(contract.compatibility_capabilities.ids, [
    APP_TYPED_DOMAIN_VIEWS_V3_CAPABILITY_ID,
  ]);
  assert.equal(
    contract.compatibility_capabilities.definitions[0].descriptor_membership_source,
    'installed_present_kind_agent_descriptor',
  );
  assert.equal(
    contract.compatibility_capabilities.definitions[0].payload_validation_boundary,
    'bounded_json_revision_and_owner_task_binding_only',
  );
  assert.equal(
    contract.compatibility_capabilities.definitions[0].legacy_consumer_policy.consumer_may_ignore_capability,
    true,
  );

  const publicSurfaceIndex = readJson('contracts/opl-framework/public-surface-index.json');
  const appWorkbench = publicSurfaceIndex.surfaces.find(
    (entry: Record<string, unknown>) => entry.surface_id === 'one_person_lab_app_workbench',
  );
  assert.equal(publicSurfaceIndex.version, 'p19.stage-runtime');
  assert.equal(
    appWorkbench.refs.some(
      (ref: Record<string, unknown>) => ref.ref
        === `${CONTRACT_REF}#compatibility_capabilities`,
    ),
    true,
  );
});

test('App Runtime capability validator rejects an unrecognized compatibility id', () => {
  const contract = structuredClone(readJson(CONTRACT_REF));
  contract.compatibility_capabilities.ids = ['opl_app.typed_domain_views.v4'];

  assert.throws(() => validateAppRuntimeFastWorkItemProjectionContract({
    filePath: CONTRACT_REF,
    value: contract,
    standardAgentInterfaceSchema: readJson('contracts/opl-framework/standard-agent-interface.schema.json'),
    workItemProjectionSchema: readJson('contracts/opl-framework/work-item-projection-v2.schema.json'),
    publicAppCommandIds: ['app view read'],
  }), /compatibility_capabilities.ids must remain opl_app\.typed_domain_views\.v3/);
});
