import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { buildPublicAppCommandSpecs } from '../../src/entrypoints/cli/cases/app-public-command-specs.ts';
import { buildAppRuntimeWorkItemProjection } from '../../src/modules/console/app-runtime-work-item-projection.ts';
import {
  APP_DOMAIN_DETAIL_VIEWS_V2_CAPABILITY_ID,
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
  assert.equal(contract.inventory_policy.all_registered_work_item_summaries_included, true);
  assert.equal(contract.inventory_policy.archived_work_items_included, true);
  assert.equal(contract.inventory_policy.runtime_history_may_create_work_items, false);
  assert.equal(contract.inventory_policy.legacy_runtime_views_repopulated_from_work_items, false);
  assert.equal(contract.bounded_fast_policy.max_serialized_work_item_summary_bytes_per_item, 16_384);
  assert.equal(contract.bounded_fast_policy.current_projection_acceptance_budget_bytes, 131_072);
  assert.equal(contract.bounded_fast_policy.attempt_ref_limit_per_item, 1);
  assert.equal(contract.bounded_fast_policy.diagnostic_items_embedded, false);
  assert.equal(contract.bounded_fast_policy.condition_details_embedded, false);
  assert.equal(contract.bounded_fast_policy.source_ref_details_embedded, false);
  assert.equal(contract.bounded_fast_policy.token_source_ref_details_embedded, false);
  assert.equal(contract.bounded_fast_policy.inventory_detail, 'included');
  for (const requiredAxis of [
    'execution.current_stage_id',
    'execution.attempt_id',
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

test('App Runtime publishes a producer-owned domain detail view compatibility capability', () => {
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
    APP_DOMAIN_DETAIL_VIEWS_V2_CAPABILITY_ID,
  ]);
  assert.deepEqual(
    contract.compatibility_capabilities.definitions[0].accepted_descriptor_schema_versions,
    ['scientific-reasoning-map.v1', 'scientific-reasoning-map.v2'],
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
  contract.compatibility_capabilities.ids = ['opl_app.domain_detail_views.v3'];

  assert.throws(() => validateAppRuntimeFastWorkItemProjectionContract({
    filePath: CONTRACT_REF,
    value: contract,
    standardAgentInterfaceSchema: readJson('contracts/opl-framework/standard-agent-interface.schema.json'),
    workItemProjectionSchema: readJson('contracts/opl-framework/work-item-projection-v2.schema.json'),
    publicAppCommandIds: ['app view read'],
  }), /compatibility_capabilities.ids must remain opl_app\.domain_detail_views\.v2/);
});
