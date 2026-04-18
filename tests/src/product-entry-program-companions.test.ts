import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBackendDeconstructionLane,
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
  buildWorkflowCoverageItem,
} from '../../src/product-entry-program-companions.ts';

test('product entry program companions normalize preflight and detailed readiness', () => {
  const preflight = buildProductEntryPreflight({
    summary: 'Current preflight passed.',
    recommended_check_command: 'redcube workspace doctor --workspace-root /tmp/demo',
    recommended_start_command: 'redcube product frontdesk --workspace-root /tmp/demo',
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
    recommended_start_command: 'redcube product frontdesk --workspace-root /tmp/demo',
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
    recommended_start_surface: 'product_frontdesk',
    recommended_start_command: 'redcube product frontdesk',
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
    recommended_step_id: 'external_runtime_contract',
    recommended_command: 'uv run python -m med_autoscience.cli doctor --profile <profile>',
    clearance_targets: [
      buildClearanceTarget({
        target_id: 'external_runtime_contract',
        title: 'Check external Hermes runtime contract',
        commands: [
          'uv run python -m med_autoscience.cli doctor --profile <profile>',
          'uv run python -m med_autoscience.cli hermes-runtime-check --profile <profile>',
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
  assert.equal(clearanceLane.clearance_targets[0].target_id, 'external_runtime_contract');
  assert.equal(clearanceLane.proof_surfaces[0].ref, 'studies/<study_id>/artifacts/runtime_watch/latest.json');

  const backendLane = buildBackendDeconstructionLane({
    summary: 'Move generic runtime capabilities upward while keeping the current backend honest.',
    substrate_targets: [
      buildProgramCapability({
        capability_id: 'session_run_watch_recovery',
        owner: 'upstream Hermes-Agent',
        summary: 'Move session/run/watch/recovery upward.',
      }),
    ],
    backend_retained_now: ['MedDeepScientist CodexRunner autonomous executor chain'],
    current_backend_chain: ['med_autoscience.runtime_transport.hermes -> med_autoscience.runtime_transport.med_deepscientist'],
    optional_executor_proofs: [
      { executor_kind: 'hermes_native_proof', readiness: 'pending' },
    ],
    promotion_rules: ['no backend retirement claim without proof'],
    deconstruction_map_doc: 'docs/program/med_deepscientist_deconstruction_map.md',
    recommended_phase_command: 'uv run python -m med_autoscience.cli mainline-phase --phase phase_4_backend_deconstruction',
  });
  assert.equal(backendLane.surface_kind, 'phase4_backend_deconstruction_lane');
  assert.equal(backendLane.substrate_targets[0].capability_id, 'session_run_watch_recovery');
  assert.equal(backendLane.current_backend_chain[0], 'med_autoscience.runtime_transport.hermes -> med_autoscience.runtime_transport.med_deepscientist');

  const platformTarget = buildPlatformTarget({
    summary: 'Land on the monorepo-ready target after the gates clear.',
    sequence_scope: 'monorepo_landing_readiness',
    current_step_id: 'stabilize_user_product_loop',
    current_readiness_summary: 'Current product loop still needs more proof.',
    north_star_topology: {
      domain_gateway: 'Med Auto Science',
      outer_runtime_substrate_owner: 'upstream Hermes-Agent',
      controlled_research_backend: 'MedDeepScientist',
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
        phase_id: 'phase_5_federation_platform_maturation',
        status: 'blocked_post_gate',
        summary: 'Absorb only after the earlier gates clear.',
      }),
    ],
    completed_step_ids: [],
    remaining_step_ids: ['stabilize_user_product_loop', 'physical_monorepo_absorb'],
    promotion_gates: ['phase_2_user_product_loop'],
    recommended_phase_command: 'uv run python -m med_autoscience.cli mainline-phase --phase phase_5_federation_platform_maturation',
  });
  assert.equal(platformTarget.surface_kind, 'phase5_platform_target');
  assert.equal(platformTarget.landing_sequence[0].step_id, 'stabilize_user_product_loop');
  assert.deepEqual(platformTarget.remaining_step_ids, ['stabilize_user_product_loop', 'physical_monorepo_absorb']);
});
