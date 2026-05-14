import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClearanceLane,
  buildClearanceTarget,
  buildDetailedReadiness,
  buildGuardrailClass,
  buildPlatformTarget,
  buildProductEntryGuardrails,
  buildProductEntryPreflight,
  buildProgramCapability,
  buildProgramCheck,
  buildProgramSequenceStep,
  buildProgramStep,
  buildProgramSurface,
  buildSourceProvenanceSurface,
  buildWorkflowCoverageItem,
} from '../../src/product-entry-program-companions.ts';

test('product entry program companions normalize preflight and detailed readiness', () => {
  const preflight = buildProductEntryPreflight({
    summary: 'Current preflight passed.',
    recommended_check_command: 'redcube workspace doctor --workspace-root /tmp/demo',
    recommended_start_command: 'redcube product status --workspace-root /tmp/demo',
    checks: [
      buildProgramCheck({
        check_id: 'workspace_ready',
        title: 'Workspace Ready',
        status: 'pass',
        blocking: true,
        summary: 'workspace ready',
        command: 'redcube workspace doctor --workspace-root /tmp/demo',
      }),
      buildProgramCheck({
        check_id: 'runtime_ready',
        title: 'Runtime Ready',
        status: 'warn',
        blocking: false,
        summary: 'runtime attention',
        command: 'redcube workspace doctor --workspace-root /tmp/demo',
      }),
    ],
  });

  assert.equal(preflight.surface_kind, 'product_entry_preflight');
  assert.equal(preflight.ready_to_try_now, true);
  assert.deepEqual(preflight.blocking_check_ids, []);

  const blocked = buildProductEntryPreflight({
    summary: 'Current preflight is blocked.',
    recommended_check_command: 'redcube workspace doctor --workspace-root /tmp/demo',
    recommended_start_command: 'redcube product status --workspace-root /tmp/demo',
    checks: [
      buildProgramCheck({
        check_id: 'workspace_ready',
        title: 'Workspace Ready',
        status: 'fail',
        blocking: true,
        summary: 'workspace missing',
        command: 'redcube workspace doctor --workspace-root /tmp/demo',
      }),
    ],
  });
  assert.equal(blocked.ready_to_try_now, false);
  assert.deepEqual(blocked.blocking_check_ids, ['workspace_ready']);

  const readiness = buildDetailedReadiness({
    surface_kind: 'grant_authoring_readiness',
    verdict: 'agent_assisted_ready_not_product_grade',
    usable_now: true,
    good_to_use_now: false,
    fully_automatic: false,
    user_experience_level: 'agent_assisted_cli',
    summary: 'Current workflow is usable with operator guidance.',
    recommended_start_surface: 'product_entry_surface',
    recommended_start_command: 'redcube product status',
    recommended_loop_surface: 'grant_user_loop',
    recommended_loop_command: 'redcube product invoke',
    workflow_coverage: [
      buildWorkflowCoverageItem({
        step_id: 'collect_materials',
        manual_flow_label: 'Collect materials',
        coverage_status: 'landed_route',
        current_surface: 'workspace_cockpit',
        remaining_gap: 'Need real user materials.',
      }),
    ],
    blocking_gaps: ['Managed web shell pending.'],
  });

  assert.equal(readiness.surface_kind, 'grant_authoring_readiness');
  assert.equal(readiness.workflow_coverage[0].step_id, 'collect_materials');
  assert.deepEqual(readiness.blocking_gaps, ['Managed web shell pending.']);

  const guardrails = buildProductEntryGuardrails({
    summary: 'Current runtime remains operator-guided and fail-closed.',
    guardrail_classes: [
      buildGuardrailClass({
        guardrail_id: 'missing_profile',
        trigger: 'profile_not_bound',
        symptom: 'profile missing',
        recommended_command: 'uv run python -m med_autoscience.cli doctor --profile <profile>',
      }),
    ],
    recovery_loop: [
      buildProgramStep({
        step_id: 'doctor',
        title: 'Inspect workspace readiness',
        command: 'uv run python -m med_autoscience.cli doctor --profile <profile>',
        surface_kind: 'doctor_runtime_contract',
      }),
    ],
  });
  assert.equal(guardrails.surface_kind, 'product_entry_guardrails');
  assert.equal(guardrails.guardrail_classes[0].guardrail_id, 'missing_profile');
  assert.equal(guardrails.recovery_loop[0].step_id, 'doctor');

  const clearanceLane = buildClearanceLane({
    surface_kind: 'phase3_host_clearance_lane',
    summary: 'Clear more hosts and workspaces.',
    recommended_step_id: 'provider_runtime_contract',
    recommended_command: 'uv run python -m med_autoscience.cli doctor --profile <profile>',
    clearance_targets: [
      buildClearanceTarget({
        target_id: 'provider_runtime_contract',
        title: 'Check provider runtime contract',
        commands: [
          'uv run python -m med_autoscience.cli doctor --profile <profile>',
          'uv run python -m med_autoscience.cli provider-runtime-check --profile <profile>',
        ],
      }),
    ],
    clearance_loop: [
      buildProgramStep({
        step_id: 'doctor',
        command: 'uv run python -m med_autoscience.cli doctor --profile <profile>',
        surface_kind: 'doctor_runtime_contract',
      }),
    ],
    proof_surfaces: [
      buildProgramSurface({
        surface_kind: 'runtime_watch',
        ref: 'studies/<study_id>/artifacts/runtime_watch/latest.json',
      }),
    ],
    recommended_phase_command: 'uv run python -m med_autoscience.cli mainline-phase --phase phase_3_multi_workspace_host_clearance',
  });
  assert.equal(clearanceLane.surface_kind, 'phase3_host_clearance_lane');
  assert.equal(clearanceLane.clearance_targets[0].target_id, 'provider_runtime_contract');
  assert.equal(clearanceLane.proof_surfaces[0].ref, 'studies/<study_id>/artifacts/runtime_watch/latest.json');

  const sourceProvenance = buildSourceProvenanceSurface({
    summary: 'MAS monolith keeps MDS only as provenance, historical fixture, and explicit archive import reference.',
    source_provenance_ref: buildProgramSurface({
      surface_kind: 'source_provenance',
      ref: 'docs/references/med-deepscientist/med_deepscientist_deconstruction_map.md',
    }),
    historical_fixture_ref: buildProgramSurface({
      surface_kind: 'historical_fixture_ref',
      ref: 'fixtures/med-deepscientist/parity/',
    }),
    explicit_archive_import_ref: buildProgramSurface({
      surface_kind: 'explicit_archive_import_ref',
      command: 'uv run python -m med_autoscience.cli backend-audit --mode archive-import --profile <profile>',
    }),
    parity_oracle_ref: buildProgramSurface({
      surface_kind: 'parity_oracle_ref',
      ref: 'docs/references/med-deepscientist/med_deepscientist_continuous_learning_plan.md',
    }),
    authority_boundary: [
      'mas_runtime_core_is_default_owner',
      'source_refs_do_not_define_runtime_dependency',
    ],
    capability_classification: 'source_provenance_only',
    recommended_audit_command: 'uv run python -m med_autoscience.cli backend-audit --profile <profile>',
  });
  assert.equal(sourceProvenance.surface_kind, 'source_provenance');
  assert.equal(sourceProvenance.historical_fixture_ref.surface_kind, 'historical_fixture_ref');
  assert.equal(sourceProvenance.explicit_archive_import_ref.surface_kind, 'explicit_archive_import_ref');

  const platformTarget = buildPlatformTarget({
    summary: 'Land on the monorepo-ready target after the gates clear.',
    sequence_scope: 'monorepo_landing_readiness',
    current_step_id: 'stabilize_user_product_loop',
    current_readiness_summary: 'Current product loop still needs more proof.',
    north_star_topology: {
      domain_agent_entry: 'Med Auto Science',
      default_runtime_owner: 'mas_runtime_core',
      source_provenance_role: 'explicit_archive_import_reference',
    },
    target_internal_modules: ['controller_charter', 'runtime'],
    landing_sequence: [
      buildProgramSequenceStep({
        step_id: 'stabilize_user_product_loop',
        phase_id: 'phase_2_user_product_loop',
        status: 'in_progress',
        summary: 'Keep tightening the user product loop.',
      }),
      buildProgramSequenceStep({
        step_id: 'physical_monorepo_absorb',
        phase_id: 'phase_5_stage_runtime_maturation',
        status: 'blocked_post_gate',
        summary: 'Absorb only after the earlier gates clear.',
      }),
    ],
    completed_step_ids: [],
    remaining_step_ids: ['stabilize_user_product_loop', 'physical_monorepo_absorb'],
    promotion_gates: ['phase_2_user_product_loop'],
    recommended_phase_command: 'uv run python -m med_autoscience.cli mainline-phase --phase phase_5_stage_runtime_maturation',
  });
  assert.equal(platformTarget.surface_kind, 'phase5_platform_target');
  assert.equal(platformTarget.landing_sequence[0].step_id, 'stabilize_user_product_loop');
  assert.deepEqual(platformTarget.remaining_step_ids, ['stabilize_user_product_loop', 'physical_monorepo_absorb']);
});
