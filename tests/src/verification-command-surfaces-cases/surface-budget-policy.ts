import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { loadFrameworkContracts } from '../../../src/contracts.ts';
import { buildBrandCommandSpecs } from '../../../src/cli/cases/public-command-specs-parts/brand.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

const GRIP_BIG_RELEASE_SMALL_COMPILER_MIRROR_FIELDS = [
  'ordinary_path_root',
  'small_detail_default_lanes',
  'hard_blocker_upgrade_conditions',
  'ordinary_path_must_not_be_overridden_by',
  'accepted_owner_answer_shapes',
  'ordinary_surface_allowed_planes',
  'non_authority_surface_forbidden_outputs',
] as const;

type GripBigReleaseSmallMirrorField = typeof GRIP_BIG_RELEASE_SMALL_COMPILER_MIRROR_FIELDS[number];

type GripBigReleaseSmallReview = Record<GripBigReleaseSmallMirrorField, string | string[]> & {
  review_id: string;
  required_questions: string[];
  big_boundaries_fail_closed: string[];
  small_detail_examples: string[];
  ordinary_progress_spine: {
    default_planning_root: string;
    default_next_action_derives_from: string;
    lightweight_receipt: string;
    lightweight_receipt_tier: string;
    audit_sidecar_role: string;
  };
  artifact_tiers: string[];
  progress_delta_receipt_cannot_authorize: string[];
  audit_sidecar_must_not_generate_default_next_action: boolean;
  surface_plane_binding_required: boolean;
  default_surface_requires_plane_ref: boolean;
};

type SurfaceBudgetCompilerPolicy = Record<GripBigReleaseSmallMirrorField, string | string[]> & {
  allowed_lanes: string[];
  ordinary_progress_spine: GripBigReleaseSmallReview['ordinary_progress_spine'];
  artifact_tiers: string[];
  progress_delta_receipt_cannot_authorize: string[];
  audit_sidecar_must_not_generate_default_next_action: boolean;
  surface_plane_binding_required: boolean;
  default_surface_requires_plane_ref: boolean;
};

function collectSurfaceBudgetCompilerPolicyDrift(
  review: GripBigReleaseSmallReview,
  compilerPolicy: SurfaceBudgetCompilerPolicy,
): string[] {
  const driftFields: string[] = [];
  for (const field of GRIP_BIG_RELEASE_SMALL_COMPILER_MIRROR_FIELDS) {
    if (!isDeepStrictEqual(compilerPolicy[field], review[field])) {
      driftFields.push(`surface_budget_compiler_policy.${field}`);
    }
  }
  const expectedAllowedLanes = ['ordinary', ...review.small_detail_default_lanes];
  if (!isDeepStrictEqual(compilerPolicy.allowed_lanes, expectedAllowedLanes)) {
    driftFields.push('surface_budget_compiler_policy.allowed_lanes');
  }
  for (const field of [
    'ordinary_progress_spine',
    'artifact_tiers',
    'progress_delta_receipt_cannot_authorize',
    'audit_sidecar_must_not_generate_default_next_action',
    'surface_plane_binding_required',
    'default_surface_requires_plane_ref',
  ] as const) {
    if (!isDeepStrictEqual(compilerPolicy[field], review[field])) {
      driftFields.push(`surface_budget_compiler_policy.${field}`);
    }
  }
  return driftFields;
}

test('public surface index binds every surface to the surface budget policy', () => {
  const policy = readJson<{
    default_surface_allowed_reasons: string[];
    promotion_gate: {
      new_default_surface_requires_any_ref_from: string[];
      default_surface_requires_any_reason_from: string[];
      repeated_app_runtime_consumption_requires: {
        minimum_distinct_consumers: number;
        allowed_consumers: string[];
      };
    };
    authority_boundary: Record<string, false>;
  }>('contracts/opl-framework/surface-budget-policy.json');
  const publicSurfaceIndex = readJson<{
    surfaces: Array<{
      surface_id: string;
      surface_budget: {
        default_surface: boolean;
        default_surface_allowed_reasons: string[];
        promotion_evidence_refs: Record<string, string>;
        consumer_refs: string[];
        authority_boundary: Record<string, boolean>;
      };
    }>;
  }>('contracts/opl-framework/public-surface-index.json');

  for (const surface of publicSurfaceIndex.surfaces) {
    const budget = surface.surface_budget;
    assert.equal(budget.default_surface, true, `${surface.surface_id} must explicitly declare its default-surface state`);
    assert.equal(
      budget.default_surface_allowed_reasons.some((reason) =>
        policy.default_surface_allowed_reasons.includes(reason)
      ),
      true,
      `${surface.surface_id} must cite an allowed surface-budget reason`,
    );
    assert.equal(
      policy.promotion_gate.new_default_surface_requires_any_ref_from.some((field) =>
        typeof budget.promotion_evidence_refs[field] === 'string'
      ),
      true,
      `${surface.surface_id} must cite a surface-budget promotion evidence ref`,
    );
    if (budget.default_surface_allowed_reasons.includes('repeated_app_runtime_consumption')) {
      const allowedConsumers = budget.consumer_refs.filter((consumer) =>
        policy.promotion_gate.repeated_app_runtime_consumption_requires.allowed_consumers.includes(consumer)
      );
      assert.ok(
        new Set(allowedConsumers).size >=
          policy.promotion_gate.repeated_app_runtime_consumption_requires.minimum_distinct_consumers,
        `${surface.surface_id} must cite enough repeated App/runtime consumers`,
      );
    }
    for (const claim of Object.keys(policy.authority_boundary)) {
      assert.equal(budget.authority_boundary[claim], false, `${surface.surface_id} must not authorize ${claim}`);
    }
  }
});

test('surface budget policy keeps diagnostic lenses out of default stage entrypoints', () => {
  const policy = readJson<{
    contract_kind: string;
    surface_model: {
      attention_entry: {
        default_operator_payload: string;
        default_read_contract: {
          normal_app_state_command: string;
          default_projection: string;
          full_detail_policy: string;
          raw_refs_policy: string;
          first_screen_answer_policy: string;
          diagnostic_only_answers: string[];
          forbidden_fast_profile_fields: string[];
        };
      };
    };
    default_surface_allowed_reasons: string[];
    default_doc_entry_budget: {
      stage_default_commands: string[];
      stage_diagnostic_commands: string[];
      forbidden_default_stage_commands: string[];
    };
    promotion_gate: {
      new_surface_default_state: string;
      new_default_surface_requires_any_ref_from: string[];
      default_surface_requires_any_reason_from: string[];
      hard_gate_allowed_reasons: string[];
      hard_gate_requires_any_reason_from: string[];
      hard_gate_denied_reason_classes: string[];
      repeated_app_runtime_consumption_requires: {
        minimum_distinct_consumers: number;
        allowed_consumers: string[];
      };
    };
    grip_big_release_small_review: GripBigReleaseSmallReview;
    authority_boundary: Record<string, boolean>;
  }>('contracts/opl-framework/surface-budget-policy.json');

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
  assert.equal(policy.surface_model.attention_entry.default_operator_payload, 'current_owner_delta');
  assert.equal('compatibility_operator_payload' in policy.surface_model.attention_entry, false);
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.normal_app_state_command,
    'opl app state --profile fast --json',
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.default_projection,
    'opl_current_owner_delta',
  );
  assert.equal('compatibility_projection' in policy.surface_model.attention_entry.default_read_contract, false);
  assert.equal('compatibility_projection_policy' in policy.surface_model.attention_entry.default_read_contract, false);
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.first_screen_answer_policy,
    'owner_delta_action_artifact_or_blocker_only',
  );
  assert.deepEqual(
    policy.surface_model.attention_entry.default_read_contract.diagnostic_only_answers,
    [
      'count_summary',
      'audit_next_safe_action_or_none',
      'full_detail_refs',
    ],
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.full_detail_policy,
    'explicit_full_detail_or_lazy_diagnostic_only',
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.raw_refs_policy,
    'raw_refs_require_explicit_full_detail',
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.forbidden_fast_profile_fields.includes(
      'runtime_tray_snapshot',
    ),
    true,
  );
  assert.equal(
    policy.surface_model.attention_entry.default_read_contract.forbidden_fast_profile_fields.includes(
      'raw_evidence_envelope',
    ),
    true,
  );
  for (const forbiddenField of [
    'raw_evidence_browser',
    'raw_ledger_browser',
    'ledger_browser',
    'provider_internal_trace',
    'route_variant_menu',
  ]) {
    assert.equal(
      policy.surface_model.attention_entry.default_read_contract.forbidden_fast_profile_fields.includes(
        forbiddenField,
      ),
      true,
      `${forbiddenField} must stay out of app fast/default state`,
    );
  }
  assert.equal(
    policy.default_doc_entry_budget.stage_diagnostic_commands.includes('opl stages proof-bundle --domain <domain>'),
    true,
  );
  assert.equal(
    policy.default_doc_entry_budget.forbidden_default_stage_commands.includes('opl stages capacity-budget --domain <domain>'),
    true,
  );
  assert.equal(
    policy.default_doc_entry_budget.forbidden_default_stage_commands.includes('opl stages domain-validity --domain <domain>'),
    true,
  );
  for (const command of [
    'opl stages capacity-budget --domain <domain>',
    'opl stages domain-validity --domain <domain>',
    'opl stages guarantee --domain <domain>',
    'opl stages property --domain <domain>',
    'opl stages isolation --domain <domain>',
  ]) {
    assert.equal(
      policy.default_doc_entry_budget.forbidden_default_stage_commands.includes(command),
      true,
      `${command} must stay out of default stage entrypoints`,
    );
    assert.equal(
      policy.default_doc_entry_budget.stage_default_commands.includes(command),
      false,
      `${command} must not be a default stage command`,
    );
  }
  assert.equal(policy.promotion_gate.new_surface_default_state, 'diagnostic_lens_or_reference');
  assert.deepEqual(policy.promotion_gate.new_default_surface_requires_any_ref_from, [
    'replaced_or_folded_surface_ref',
    'retired_surface_ref',
    'folded_into_attention_entry_ref',
  ]);
  assert.deepEqual(
    policy.promotion_gate.default_surface_requires_any_reason_from,
    policy.default_surface_allowed_reasons,
  );
  assert.deepEqual(policy.promotion_gate.hard_gate_allowed_reasons, [
    'launch_safety',
    'authority_boundary',
    'runtime_boundary_event',
    'receipt_replay_audit_route_back',
  ]);
  assert.deepEqual(
    policy.promotion_gate.hard_gate_requires_any_reason_from,
    policy.promotion_gate.hard_gate_allowed_reasons,
  );
  for (const deniedReasonClass of [
    'advisory',
    'diagnostic',
    'graphflow_gfl_learning_point',
    'capacity_budget',
    'domain_validity',
    'guarantee',
    'property',
    'isolation',
  ]) {
    assert.equal(
      policy.promotion_gate.hard_gate_denied_reason_classes.includes(deniedReasonClass),
      true,
      `${deniedReasonClass} must not become a hard gate reason class by default`,
    );
    assert.equal(
      policy.promotion_gate.hard_gate_allowed_reasons.includes(deniedReasonClass),
      false,
      `${deniedReasonClass} must not be an allowed hard gate reason`,
    );
  }
  assert.equal(policy.promotion_gate.repeated_app_runtime_consumption_requires.minimum_distinct_consumers, 2);
  assert.equal(policy.promotion_gate.repeated_app_runtime_consumption_requires.allowed_consumers.includes('app'), true);

  assert.equal(policy.grip_big_release_small_review.review_id, 'grip_big_release_small.v1');
  assert.deepEqual(policy.grip_big_release_small_review.required_questions, [
    'which_big_boundary_is_protected',
    'what_is_the_default_lane',
    'when_may_it_upgrade_to_hard_blocker',
    'when_must_it_demote_to_advisory_audit_diagnostic_cleanup_or_production_lane',
    'what_accepted_owner_answer_shape_closes_it',
  ]);
  for (const boundary of [
    'owner_boundary',
    'authority_boundary',
    'stage_lifecycle',
    'workspace_topology',
    'selected_executor_binding',
    'single_ordinary_route',
    'launch_admission',
    'execution_authorization',
    'closeout_admission',
    'accepted_owner_answer_shape',
    'app_release_verdict',
    'physical_delete_authority',
    'no_second_truth',
  ]) {
    assert.equal(
      policy.grip_big_release_small_review.big_boundaries_fail_closed.includes(boundary),
      true,
      `${boundary} must remain a fail-closed big boundary`,
    );
  }
  assert.deepEqual(policy.grip_big_release_small_review.small_detail_default_lanes, [
    'advisory',
    'audit',
    'diagnostic',
    'cleanup',
    'production_evidence',
  ]);
  for (const smallDetail of [
    'generated_projection_mirror',
    'workspace_fleet_or_inventory_drift',
    'worklist_raw_counter',
    'diagnostic_proof',
    'route_variant',
    'receipt_accounting',
    'wrapper_lineage',
    'l5_evidence_matrix_item',
    'provider_ops_detail',
    'release_cohort_diagnostic',
  ]) {
    assert.equal(
      policy.grip_big_release_small_review.small_detail_examples.includes(smallDetail),
      true,
      `${smallDetail} must stay classified as small detail by default`,
    );
  }
  assert.deepEqual(policy.grip_big_release_small_review.hard_blocker_upgrade_conditions, [
    'wrong_launch',
    'authority_violation',
    'not_recoverable',
    'not_auditable',
    'cannot_closeout',
    'invalid_owner_answer_shape',
    'irreversible_mutation',
  ]);
  assert.equal(policy.grip_big_release_small_review.ordinary_path_root, 'current_owner_delta');
  assert.equal(
    policy.grip_big_release_small_review.ordinary_progress_spine.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    policy.grip_big_release_small_review.ordinary_progress_spine.default_next_action_derives_from,
    'current_owner_delta',
  );
  assert.equal(
    policy.grip_big_release_small_review.ordinary_progress_spine.lightweight_receipt,
    'ProgressDeltaReceipt',
  );
  assert.equal(
    policy.grip_big_release_small_review.ordinary_progress_spine.lightweight_receipt_tier,
    'T0_progress_delta',
  );
  assert.equal(
    policy.grip_big_release_small_review.ordinary_progress_spine.audit_sidecar_role,
    'passive_evidence_vault_and_drilldown',
  );
  assert.deepEqual(policy.grip_big_release_small_review.artifact_tiers, [
    'T0_progress_delta',
    'T1_stage_transition',
    'T2_delivery_artifact',
    'T3_production_evidence',
  ]);
  for (const forbiddenClaim of [
    'stage_complete',
    'publication_ready',
    'artifact_mutation',
    'memory_accept_reject',
    'production_ready',
  ]) {
    assert.equal(
      policy.grip_big_release_small_review.progress_delta_receipt_cannot_authorize.includes(
        forbiddenClaim,
      ),
      true,
      `ProgressDeltaReceipt must not authorize ${forbiddenClaim}`,
    );
  }
  assert.equal(
    policy.grip_big_release_small_review.audit_sidecar_must_not_generate_default_next_action,
    true,
  );
  for (const forbiddenOverride of [
    'raw_worklist',
    'evidence_ledger',
    'provider_trace',
    'route_variant_menu',
    'private_residue_inventory',
    'cleanup_delete_gate',
    'l5_evidence_ledger',
    'release_diagnostics',
  ]) {
    assert.equal(
      policy.grip_big_release_small_review.ordinary_path_must_not_be_overridden_by.includes(
        forbiddenOverride,
      ),
      true,
      `${forbiddenOverride} must not override current_owner_delta ordinary planning`,
    );
  }
  for (const ownerAnswerShape of [
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
    assert.equal(
      policy.grip_big_release_small_review.accepted_owner_answer_shapes.includes(ownerAnswerShape),
      true,
      `${ownerAnswerShape} must remain an accepted owner answer shape`,
    );
  }

  for (const [claim, allowed] of Object.entries(policy.authority_boundary)) {
    assert.equal(allowed, false, `${claim} must remain false in OPL surface budget policy`);
  }
});

test('surface budget compiler policy mirrors grip-big-release-small review guardrails', () => {
  const policy = readJson<{
    grip_big_release_small_review: GripBigReleaseSmallReview;
  }>('contracts/opl-framework/surface-budget-policy.json');
  const targetArchitecture = readJson<{
    surface_budget_compiler_policy: SurfaceBudgetCompilerPolicy;
  }>('contracts/opl-framework/target-operating-architecture-contract.json');

  assert.deepEqual(
    collectSurfaceBudgetCompilerPolicyDrift(
      policy.grip_big_release_small_review,
      targetArchitecture.surface_budget_compiler_policy,
    ),
    [],
  );
});

test('brand module operating-model projection command exposes multi-plane surfaces as read models only', async () => {
  const contracts = loadFrameworkContracts({ searchFrom: repoRoot, source: 'api' });
  const specs = buildBrandCommandSpecs(() => contracts);
  const spec = specs['brand-modules operating-model-projections'];

  assert.ok(spec, 'brand-modules operating-model-projections command must be registered');
  assert.equal(spec.group, 'brand');
  assert.equal(spec.usage, 'opl brand-modules operating-model-projections');
  assert.equal(spec.examples.includes('opl brand-modules operating-model-projections --json'), true);

  const output = await spec.handler([]);
  const projection = (output as {
    version: string;
    brand_operating_model_projections: {
      surface_kind: string;
      projection_role: string;
      model_ref: string;
      plane_model_id: string;
      source_refs: string[];
      surfaces: Array<{
        surface_id: string;
        module_id: string;
        plane_id: string;
        surface_kind: string;
        authority_boundary: Record<string, boolean>;
        resource_kind_refs: string[];
      }>;
      projection_authority_boundary: Record<string, boolean>;
    };
  }).brand_operating_model_projections;

  assert.equal(projection.surface_kind, 'opl_multi_plane_operating_model_projection_index');
  assert.equal(projection.projection_role, 'projection_read_model_only');
  assert.equal(projection.model_ref, 'target_operating_architecture.multi_plane_operating_system');
  assert.equal(
    projection.plane_model_id,
    contracts.targetOperatingArchitecture.multi_plane_operating_system.plane_model_id,
  );
  assert.deepEqual(
    projection.surfaces.map((entry) => entry.plane_id),
    contracts.targetOperatingArchitecture.multi_plane_operating_system.planes.map((entry) => entry.plane_id),
  );
  assert.equal(
    projection.source_refs.includes('contracts/opl-framework/target-operating-architecture-contract.json'),
    true,
  );
  assert.equal(projection.source_refs.includes('human_doc:opl_family_ideal_operating_model_redesign'), true);

  for (const planeId of ['durable_runway_plane', 'app_cockpit_plane', 'evidence_telemetry_plane']) {
    const surface = projection.surfaces.find((entry) => entry.plane_id === planeId);
    assert.ok(surface, `${planeId} projection surface must be present`);
    assert.equal(surface.surface_kind, 'projection_read_model');
    assert.equal(surface.authority_boundary.can_generate_owner_answer, false);
    assert.equal(surface.authority_boundary.can_claim_quality_verdict, false);
    assert.equal(surface.authority_boundary.can_create_typed_blocker, false);
    assert.equal(surface.authority_boundary.can_claim_production_ready, false);
    assert.equal(surface.authority_boundary.can_claim_domain_ready, false);
  }

  assert.equal(
    projection.surfaces.find((entry) => entry.plane_id === 'durable_runway_plane')?.resource_kind_refs.includes('RunwayControlLoop'),
    true,
  );
  assert.equal(
    projection.surfaces.find((entry) => entry.plane_id === 'app_cockpit_plane')?.resource_kind_refs.includes('ProgressReconciler'),
    true,
  );
  assert.equal(
    projection.surfaces.find((entry) => entry.plane_id === 'evidence_telemetry_plane')?.resource_kind_refs.includes('EvidenceRef'),
    true,
  );

  assert.equal(projection.projection_authority_boundary.can_generate_owner_answer, false);
  assert.equal(projection.projection_authority_boundary.can_claim_quality_verdict, false);
  assert.equal(projection.projection_authority_boundary.can_create_typed_blocker, false);
  assert.equal(projection.projection_authority_boundary.can_claim_production_ready, false);
  assert.equal(projection.projection_authority_boundary.can_claim_domain_ready, false);
});

test('surface budget compiler consistency guard catches ordinary path and small-detail drift', () => {
  const policy = readJson<{
    grip_big_release_small_review: GripBigReleaseSmallReview;
  }>('contracts/opl-framework/surface-budget-policy.json');
  const targetArchitecture = readJson<{
    surface_budget_compiler_policy: SurfaceBudgetCompilerPolicy;
  }>('contracts/opl-framework/target-operating-architecture-contract.json');
  const driftedCompilerPolicy = structuredClone(targetArchitecture.surface_budget_compiler_policy);

  driftedCompilerPolicy.ordinary_path_root = 'raw_worklist';
  driftedCompilerPolicy.small_detail_default_lanes = ['advisory', 'audit', 'diagnostic'];
  driftedCompilerPolicy.hard_blocker_upgrade_conditions = ['authority_violation'];
  driftedCompilerPolicy.ordinary_path_must_not_be_overridden_by = ['raw_worklist'];
  driftedCompilerPolicy.accepted_owner_answer_shapes = ['typed_blocker_ref'];
  driftedCompilerPolicy.allowed_lanes = ['ordinary', 'advisory', 'audit', 'diagnostic'];
  driftedCompilerPolicy.ordinary_progress_spine = {
    ...driftedCompilerPolicy.ordinary_progress_spine,
    lightweight_receipt: 'OwnerReceipt',
  };
  driftedCompilerPolicy.artifact_tiers = ['T1_stage_transition'];
  driftedCompilerPolicy.progress_delta_receipt_cannot_authorize = ['stage_complete'];
  driftedCompilerPolicy.audit_sidecar_must_not_generate_default_next_action = false;
  driftedCompilerPolicy.surface_plane_binding_required = false;
  driftedCompilerPolicy.default_surface_requires_plane_ref = false;
  driftedCompilerPolicy.ordinary_surface_allowed_planes = ['ordinary_progress_plane'];
  driftedCompilerPolicy.non_authority_surface_forbidden_outputs = ['domain_owner_answer'];

  assert.deepEqual(
    collectSurfaceBudgetCompilerPolicyDrift(
      policy.grip_big_release_small_review,
      driftedCompilerPolicy,
    ),
    [
      'surface_budget_compiler_policy.ordinary_path_root',
      'surface_budget_compiler_policy.small_detail_default_lanes',
      'surface_budget_compiler_policy.hard_blocker_upgrade_conditions',
      'surface_budget_compiler_policy.ordinary_path_must_not_be_overridden_by',
      'surface_budget_compiler_policy.accepted_owner_answer_shapes',
      'surface_budget_compiler_policy.ordinary_surface_allowed_planes',
      'surface_budget_compiler_policy.non_authority_surface_forbidden_outputs',
      'surface_budget_compiler_policy.allowed_lanes',
      'surface_budget_compiler_policy.ordinary_progress_spine',
      'surface_budget_compiler_policy.artifact_tiers',
      'surface_budget_compiler_policy.progress_delta_receipt_cannot_authorize',
      'surface_budget_compiler_policy.audit_sidecar_must_not_generate_default_next_action',
      'surface_budget_compiler_policy.surface_plane_binding_required',
      'surface_budget_compiler_policy.default_surface_requires_plane_ref',
    ],
  );
});
