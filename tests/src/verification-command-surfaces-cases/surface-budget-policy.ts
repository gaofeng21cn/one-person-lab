import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { buildBrandCommandSpecs } from '../../../src/entrypoints/cli/cases/public-command-specs-parts/brand.ts';
import { parseJsonText } from '../../../src/kernel/json-file.ts';
import { loadFrameworkContracts } from '../../../src/modules/charter/contracts.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const compilerMirrorFields = [
  'ordinary_path_root',
  'small_detail_default_lanes',
  'hard_blocker_upgrade_conditions',
  'ordinary_path_must_not_be_overridden_by',
  'accepted_owner_answer_shapes',
  'ordinary_surface_allowed_planes',
  'non_authority_surface_forbidden_outputs',
] as const;
const directMirrorFields = [
  'ordinary_progress_spine',
  'artifact_tiers',
  'progress_delta_receipt_cannot_authorize',
  'audit_sidecar_must_not_generate_default_next_action',
  'surface_plane_binding_required',
  'default_surface_requires_plane_ref',
] as const;

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

function collectSurfaceBudgetCompilerPolicyDrift(review: any, compilerPolicy: any): string[] {
  const driftFields = compilerMirrorFields
    .filter((field) => !isDeepStrictEqual(compilerPolicy[field], review[field]))
    .map((field) => `surface_budget_compiler_policy.${field}`);

  if (!isDeepStrictEqual(compilerPolicy.allowed_lanes, ['ordinary', ...review.small_detail_default_lanes])) {
    driftFields.push('surface_budget_compiler_policy.allowed_lanes');
  }
  for (const field of directMirrorFields) {
    if (!isDeepStrictEqual(compilerPolicy[field], review[field])) {
      driftFields.push(`surface_budget_compiler_policy.${field}`);
    }
  }
  return driftFields;
}

test('public surface index binds every surface to the surface budget policy', () => {
  const policy = readJson<any>('contracts/opl-framework/surface-budget-policy.json');
  const publicSurfaceIndex = readJson<any>('contracts/opl-framework/public-surface-index.json');

  for (const surface of publicSurfaceIndex.surfaces) {
    const budget = surface.surface_budget;
    assert.equal(budget.default_surface, true, surface.surface_id);
    assert.equal(
      budget.default_surface_allowed_reasons.some((reason: string) =>
        policy.default_surface_allowed_reasons.includes(reason)
      ),
      true,
      `${surface.surface_id} must cite an allowed reason`,
    );
    assert.equal(
      policy.promotion_gate.new_default_surface_requires_any_ref_from.some((field: string) =>
        typeof budget.promotion_evidence_refs[field] === 'string'
      ),
      true,
      `${surface.surface_id} must cite promotion evidence`,
    );
    if (budget.default_surface_allowed_reasons.includes('repeated_app_runtime_consumption')) {
      const allowedConsumers = budget.consumer_refs.filter((consumer: string) =>
        policy.promotion_gate.repeated_app_runtime_consumption_requires.allowed_consumers.includes(consumer)
      );
      assert.ok(
        new Set(allowedConsumers).size
          >= policy.promotion_gate.repeated_app_runtime_consumption_requires.minimum_distinct_consumers,
        `${surface.surface_id} must cite enough App/runtime consumers`,
      );
    }
    for (const claim of Object.keys(policy.authority_boundary)) {
      assert.equal(budget.authority_boundary[claim], false, `${surface.surface_id} must not authorize ${claim}`);
    }
  }
});

test('surface budget policy keeps diagnostic detail out of the ordinary path', () => {
  const policy = readJson<any>('contracts/opl-framework/surface-budget-policy.json');
  const attention = policy.surface_model.attention_entry;
  const readContract = attention.default_read_contract;
  const promotion = policy.promotion_gate;
  const review = policy.grip_big_release_small_review;

  assert.equal(policy.contract_kind, 'opl_surface_budget_policy.v1');
  assert.deepEqual(policy.default_surface_allowed_reasons, [
    'launch_safety',
    'authority_boundary',
    'evidence_replay_audit_route_back',
    'repeated_app_runtime_consumption',
  ]);
  assert.deepEqual(policy.default_doc_entry_budget.stage_default_commands, [
    'opl stages readiness --family-defaults',
  ]);
  assert.equal(attention.default_operator_payload, 'current_owner_delta');
  assert.equal('compatibility_operator_payload' in attention, false);
  assert.equal(readContract.normal_app_state_command, 'opl app state --profile fast --json');
  assert.equal(readContract.default_projection, 'opl_current_owner_delta');
  assert.equal('compatibility_projection' in readContract, false);
  assert.equal('compatibility_projection_policy' in readContract, false);
  assert.equal(readContract.first_screen_answer_policy, 'owner_delta_action_artifact_or_blocker_only');
  assert.equal(readContract.full_detail_policy, 'explicit_full_detail_or_lazy_diagnostic_only');
  assert.equal(readContract.raw_refs_policy, 'raw_refs_require_explicit_full_detail');
  for (const field of [
    'runtime_tray_snapshot',
    'raw_evidence_envelope',
    'raw_evidence_browser',
    'raw_ledger_browser',
    'ledger_browser',
    'provider_internal_trace',
    'route_variant_menu',
  ]) {
    assert.equal(readContract.forbidden_fast_profile_fields.includes(field), true, field);
  }

  for (const command of [
    'opl stages capacity-budget --domain <domain>',
    'opl stages domain-validity --domain <domain>',
    'opl stages guarantee --domain <domain>',
    'opl stages property --domain <domain>',
    'opl stages isolation --domain <domain>',
  ]) {
    assert.equal(policy.default_doc_entry_budget.forbidden_default_stage_commands.includes(command), true, command);
    assert.equal(policy.default_doc_entry_budget.stage_default_commands.includes(command), false, command);
  }

  assert.equal(promotion.new_surface_default_state, 'diagnostic_lens_or_reference');
  assert.deepEqual(promotion.new_default_surface_requires_any_ref_from, [
    'replaced_or_folded_surface_ref',
    'retired_surface_ref',
    'folded_into_attention_entry_ref',
  ]);
  assert.deepEqual(promotion.default_surface_requires_any_reason_from, policy.default_surface_allowed_reasons);
  assert.deepEqual(promotion.hard_gate_allowed_reasons, [
    'launch_safety',
    'authority_boundary',
    'runtime_boundary_event',
    'receipt_replay_audit_route_back',
  ]);
  assert.deepEqual(promotion.hard_gate_requires_any_reason_from, promotion.hard_gate_allowed_reasons);
  for (const deniedReason of [
    'advisory',
    'diagnostic',
    'graphflow_gfl_learning_point',
    'capacity_budget',
    'domain_validity',
    'guarantee',
    'property',
    'isolation',
  ]) {
    assert.equal(promotion.hard_gate_denied_reason_classes.includes(deniedReason), true, deniedReason);
    assert.equal(promotion.hard_gate_allowed_reasons.includes(deniedReason), false, deniedReason);
  }
  assert.equal(promotion.repeated_app_runtime_consumption_requires.minimum_distinct_consumers, 2);

  assert.equal(review.review_id, 'grip_big_release_small.v1');
  for (const boundary of [
    'owner_boundary',
    'authority_boundary',
    'workspace_topology',
    'selected_executor_binding',
    'single_ordinary_route',
    'wrong_target_identity_conflict',
    'irreversible_action_authority',
    'explicit_human_decision',
    'app_release_verdict',
    'physical_delete_authority',
    'no_second_truth',
  ]) {
    assert.equal(review.big_boundaries_fail_closed.includes(boundary), true, boundary);
  }
  assert.deepEqual(review.small_detail_default_lanes, [
    'advisory',
    'audit',
    'diagnostic',
    'cleanup',
    'production_evidence',
  ]);
  assert.deepEqual(review.hard_blocker_upgrade_conditions, [
    'wrong_launch',
    'authority_violation',
    'not_recoverable',
    'not_auditable',
    'cannot_closeout',
    'invalid_owner_answer_shape',
    'irreversible_mutation',
  ]);
  assert.equal(review.ordinary_path_root, 'current_owner_delta');
  assert.deepEqual(review.ordinary_progress_spine, {
    default_planning_root: 'current_owner_delta',
    default_next_action_derives_from: 'current_owner_delta',
    lightweight_receipt: 'ProgressDeltaReceipt',
    lightweight_receipt_tier: 'T0_progress_delta',
    audit_sidecar_role: 'passive_evidence_ledger_and_drilldown',
  });
  assert.deepEqual(review.artifact_tiers, [
    'T0_progress_delta',
    'T1_stage_transition',
    'T2_delivery_artifact',
    'T3_production_evidence',
  ]);
  for (const claim of ['stage_complete', 'publication_ready', 'artifact_mutation', 'memory_accept_reject', 'production_ready']) {
    assert.equal(review.progress_delta_receipt_cannot_authorize.includes(claim), true, claim);
  }
  assert.equal(review.audit_sidecar_must_not_generate_default_next_action, true);
  for (const override of [
    'raw_worklist',
    'evidence_ledger',
    'provider_trace',
    'route_variant_menu',
    'private_residue_inventory',
    'cleanup_delete_gate',
    'l5_evidence_ledger',
    'release_diagnostics',
  ]) {
    assert.equal(review.ordinary_path_must_not_be_overridden_by.includes(override), true, override);
  }
  for (const answerShape of [
    'owner_receipt_ref',
    'domain_owner_receipt_ref',
    'quality_gate_receipt_ref',
    'human_gate_ref',
    'typed_blocker_ref',
    'no_regression_ref',
    'long_soak_ref',
    'route_back_ref',
    'route_back_evidence_ref',
    'physical_delete_authorization_ref',
    'keep_as_authority_adapter_ref',
  ]) {
    assert.equal(review.accepted_owner_answer_shapes.includes(answerShape), true, answerShape);
  }
  for (const [claim, allowed] of Object.entries(policy.authority_boundary)) {
    assert.equal(allowed, false, `surface budget policy must not claim ${claim}`);
  }
});

test('surface budget compiler policy mirrors the canonical review', () => {
  const policy = readJson<any>('contracts/opl-framework/surface-budget-policy.json');
  const targetArchitecture = readJson<any>(
    'contracts/opl-framework/target-operating-architecture-contract.json',
  );

  assert.deepEqual(
    collectSurfaceBudgetCompilerPolicyDrift(
      policy.grip_big_release_small_review,
      targetArchitecture.surface_budget_compiler_policy,
    ),
    [],
  );
});

test('brand operating-model projection exposes multi-plane surfaces as read models only', async () => {
  const contracts = loadFrameworkContracts({ searchFrom: repoRoot, source: 'api' });
  const spec = buildBrandCommandSpecs(() => contracts)['brand-modules operating-model-projections'];

  assert.ok(spec);
  assert.equal(spec.group, 'brand');
  assert.equal(spec.usage, 'opl brand-modules operating-model-projections');
  const projection = (await spec.handler([]) as any).brand_operating_model_projections;

  assert.equal(projection.surface_kind, 'opl_multi_plane_operating_model_projection_index');
  assert.equal(projection.projection_role, 'projection_read_model_only');
  assert.equal(projection.model_ref, 'target_operating_architecture.multi_plane_operating_system');
  assert.equal(projection.plane_model_id, contracts.targetOperatingArchitecture.multi_plane_operating_system.plane_model_id);
  assert.deepEqual(
    projection.surfaces.map((entry: any) => entry.plane_id),
    contracts.targetOperatingArchitecture.multi_plane_operating_system.planes.map((entry) => entry.plane_id),
  );
  assert.equal(projection.source_refs.includes('contracts/opl-framework/target-operating-architecture-contract.json'), true);
  assert.equal(projection.source_refs.includes('human_doc:opl_family_ideal_operating_model_redesign'), true);

  for (const planeId of ['durable_runway_plane', 'app_cockpit_plane', 'evidence_telemetry_plane']) {
    const surface = projection.surfaces.find((entry: any) => entry.plane_id === planeId);
    assert.ok(surface, planeId);
    assert.equal(surface.surface_kind, 'projection_read_model');
    for (const claim of [
      'can_generate_owner_answer',
      'can_claim_quality_verdict',
      'can_create_typed_blocker',
      'can_claim_production_ready',
      'can_claim_domain_ready',
    ]) {
      assert.equal(surface.authority_boundary[claim], false, `${planeId} must not claim ${claim}`);
    }
  }
  assert.equal(
    projection.surfaces.find((entry: any) => entry.plane_id === 'durable_runway_plane')
      ?.resource_kind_refs.includes('RunwayControlLoop'),
    true,
  );
  assert.equal(
    projection.surfaces.find((entry: any) => entry.plane_id === 'app_cockpit_plane')
      ?.resource_kind_refs.includes('ProgressReconciler'),
    true,
  );
  assert.equal(
    projection.surfaces.find((entry: any) => entry.plane_id === 'evidence_telemetry_plane')
      ?.resource_kind_refs.includes('EvidenceRef'),
    true,
  );
  for (const [claim, allowed] of Object.entries(projection.projection_authority_boundary)) {
    assert.equal(allowed, false, `projection must not claim ${claim}`);
  }
});

test('surface budget compiler consistency guard catches every mirrored field drift', () => {
  const policy = readJson<any>('contracts/opl-framework/surface-budget-policy.json');
  const targetArchitecture = readJson<any>(
    'contracts/opl-framework/target-operating-architecture-contract.json',
  );
  const drifted = structuredClone(targetArchitecture.surface_budget_compiler_policy);

  Object.assign(drifted, {
    ordinary_path_root: 'raw_worklist',
    small_detail_default_lanes: ['advisory', 'audit', 'diagnostic'],
    hard_blocker_upgrade_conditions: ['authority_violation'],
    ordinary_path_must_not_be_overridden_by: ['raw_worklist'],
    accepted_owner_answer_shapes: ['typed_blocker_ref'],
    ordinary_surface_allowed_planes: ['ordinary_progress_plane'],
    non_authority_surface_forbidden_outputs: ['domain_owner_answer'],
    allowed_lanes: ['ordinary', 'advisory', 'audit', 'diagnostic'],
    artifact_tiers: ['T1_stage_transition'],
    progress_delta_receipt_cannot_authorize: ['stage_complete'],
    audit_sidecar_must_not_generate_default_next_action: false,
    surface_plane_binding_required: false,
    default_surface_requires_plane_ref: false,
  });
  drifted.ordinary_progress_spine = {
    ...drifted.ordinary_progress_spine,
    lightweight_receipt: 'OwnerReceipt',
  };

  assert.deepEqual(
    collectSurfaceBudgetCompilerPolicyDrift(policy.grip_big_release_small_review, drifted),
    [
      ...compilerMirrorFields.map((field) => `surface_budget_compiler_policy.${field}`),
      'surface_budget_compiler_policy.allowed_lanes',
      ...directMirrorFields.map((field) => `surface_budget_compiler_policy.${field}`),
    ],
  );
});
