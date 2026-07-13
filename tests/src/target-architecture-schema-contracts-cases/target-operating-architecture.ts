import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFrameworkContracts } from '../../../src/modules/charter/contracts.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

test('target operating architecture keeps framework-wide ownership and authority boundaries', () => {
  const contract = loadFrameworkContracts({
    contractsDir: path.join(repoRoot, 'contracts', 'opl-framework'),
  }).targetOperatingArchitecture;

  assert.equal(contract.contract_kind, 'opl_target_operating_architecture_contract.v1');
  assert.equal(contract.schema_version, 'target-operating-architecture.v1');
  assert.deepEqual(contract.resource_model.resource_shape.required_fields, [
    'apiVersion',
    'kind',
    'metadata',
    'spec',
    'status',
    'conditions',
    'ownerRefs',
    'finalizers',
  ]);
  assert.equal(contract.resource_model.resource_shape.spec_status_split_required, true);
  assert.equal(contract.resource_model.resource_shape.status_can_define_desired_state, false);
  assert.deepEqual(contract.resource_model.resource_kinds.map((entry) => entry.kind), [
    'Agent',
    'DomainPack',
    'WorkspaceGroup',
    'ProjectUnit',
    'StageRun',
    'StageArtifactUnit',
    'OwnerAnswer',
    'EvidenceRef',
    'ReleaseCohort',
    'ImprovementWorkOrder',
    'RunwayControlLoop',
    'ProgressReconciler',
  ]);

  assert.equal(contract.codex_stage_route_owner.semantic_owner, 'codex_cli');
  assert.equal(contract.codex_stage_route_owner.single_semantic_control_plane, true);
  assert.equal(
    contract.codex_stage_route_owner.progression_policy,
    'any_readable_stage_artifact_allows_next_declared_stage_to_start_quality_debt_restricts_claims_only',
  );
  for (const capability of [
    'advance_to_next_declared_stage',
    'skip_to_any_declared_stage',
    'repeat_current_or_prior_stage',
    'reverse_to_any_declared_stage',
    'route_back_with_partial_or_negative_results',
  ]) {
    assert.equal(
      contract.codex_stage_route_owner.route_capabilities.includes(capability),
      true,
      capability,
    );
  }
  assert.equal(
    contract.codex_stage_route_owner.forbidden_framework_route_decisions.includes('convert_quality_debt_to_execution_blocker'),
    true,
  );

  assert.equal(
    contract.domain_pack_authority_abi.default_agent_shape,
    'declarative_domain_pack_plus_opl_generated_hosted_surfaces_plus_standard_authority_functions',
  );
  for (const generatedSurface of ['cli', 'mcp', 'product_entry', 'openai_tool', 'ai_sdk', 'workbench']) {
    assert.equal(
      contract.domain_pack_authority_abi.opl_generated_or_hosted_surfaces.includes(generatedSurface),
      true,
      generatedSurface,
    );
  }
  for (const authorityFunction of [
    'quality_or_export_verdict',
    'artifact_authority',
    'memory_accept_reject',
    'owner_receipt_signer',
    'typed_blocker_signer',
  ]) {
    assert.equal(
      contract.domain_pack_authority_abi.authority_functions.includes(authorityFunction),
      true,
      authorityFunction,
    );
  }

  const multiPlane = contract.multi_plane_operating_system;
  assert.equal(multiPlane.plane_model_id, 'opl_family_multi_plane_operating_system.v1');
  assert.equal(multiPlane.default_ordinary_route, 'current_owner_delta');
  assert.deepEqual(multiPlane.planes.map((plane) => plane.plane_id), [
    'purpose_pack_plane',
    'ordinary_progress_plane',
    'stage_artifact_plane',
    'durable_runway_plane',
    'authority_decision_plane',
    'evidence_telemetry_plane',
    'reconciler_plane',
    'app_cockpit_plane',
    'improvement_plane',
  ]);
  for (const plane of multiPlane.planes) {
    assert.notEqual(plane.owner_modules.length, 0, `${plane.plane_id} must declare owner modules`);
    assert.notEqual(plane.inputs.length, 0, `${plane.plane_id} must declare inputs`);
    assert.notEqual(plane.outputs.length, 0, `${plane.plane_id} must declare outputs`);
    for (const forbiddenClaim of [
      'domain_ready_declaration',
      'quality_or_export_verdict',
      'owner_receipt_signature',
      'typed_blocker_signature',
    ]) {
      assert.equal(
        plane.forbidden_claims.includes(forbiddenClaim),
        true,
        `${plane.plane_id} must reject ${forbiddenClaim}`,
      );
    }
  }

  assert.deepEqual(contract.reconciler_model.required_loops, [
    'recovery_repair',
    'human_authority_wait',
    'progress_reconciliation',
    'runtime_intent_transport',
    'provider_attempt',
    'artifact_progress_projection',
    'currentness_reuse_filter',
    'owner_answer_intake',
    'evidence_verify',
    'cleanup_finalizer',
    'release_cohort_verify',
  ]);
  assert.equal(contract.catalog_and_telemetry.ledger_policy, 'record_everything_plan_from_nothing');
  assert.equal(contract.catalog_and_telemetry.telemetry_body_policy, 'refs_only_no_artifact_or_memory_body');
  assert.equal(contract.app_console_policy.gui_truth_owner, 'one-person-lab-app');
  assert.equal(contract.app_console_policy.framework_role, 'state_action_projection_producer_only');

  const experience = contract.experience_operating_model;
  assert.equal(experience.model_id, 'opl_family_ideal_experience_operating_model.v1');
  assert.equal(experience.default_user_path.planning_root, 'current_owner_delta');
  assert.deepEqual(experience.target_axes.map((axis) => axis.axis_id), [
    'running_smoothness',
    'output_quality',
    'brand_feel',
  ]);
  for (const axis of experience.target_axes) {
    assert.equal(axis.forbidden_regressions.includes('ready_claim_without_owner_evidence'), true);
    assert.equal(axis.forbidden_regressions.includes('diagnostic_tail_becomes_default_route'), true);
  }
  assert.equal(experience.flagship_agent_default.agent_id, 'mas');
  assert.equal(experience.flagship_agent_default.private_runtime_disposition, 'migration_input_not_target_architecture');

  const oneShot = contract.one_shot_plan_landing_model;
  assert.equal(oneShot.model_id, 'opl_family_one_shot_plan_landing.v1');
  assert.deepEqual(oneShot.implementation_slices.map((slice) => slice.plan_id), [
    'P0',
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7',
    'P8',
  ]);
  assert.equal(oneShot.summary.all_opl_controlled_surfaces_landed, true);
  assert.equal(oneShot.summary.external_owner_evidence_still_required, true);
  assert.equal(oneShot.summary.ready_claim_authorized, false);
  for (const slice of oneShot.implementation_slices) {
    assert.notEqual(slice.opl_landed_surfaces.length, 0, slice.plan_id);
    assert.notEqual(slice.validation_commands.length, 0, slice.plan_id);
    assert.notEqual(slice.false_completion_claims.length, 0, slice.plan_id);
  }

  assert.equal(contract.agent_lab_improvement_plane.role, 'refs_only_improvement_control_plane');
  for (const forbiddenOutput of [
    'domain_quality_verdict',
    'artifact_authority',
    'memory_body',
    'owner_receipt',
    'typed_blocker',
    'production_acceptance',
  ]) {
    assert.equal(contract.agent_lab_improvement_plane.must_not_produce.includes(forbiddenOutput), true);
  }

  const foundry = contract.foundry_agent_os_standard;
  assert.equal(foundry.pattern_id, 'foundry_agent_os_standard.v1');
  assert.deepEqual(foundry.applies_to_domain_agents, ['mas', 'mag', 'rca', 'oma', 'obf']);
  assert.deepEqual(foundry.framework_capability_packages?.map((entry) => entry.agent_id), ['mas-scholar-skills']);
  assert.equal(foundry.framework_capability_packages?.[0]?.package_scope, 'framework_capability_package');
  assert.equal(foundry.framework_capability_packages?.[0]?.authority_boundary.can_claim_publication_readiness, false);
  assert.equal(foundry.os_readback_contract.requires_lane_to_plan_mapping, true);
  assert.equal(foundry.os_readback_contract.requires_main_session_fresh_verification, true);
  assert.equal(foundry.os_readback_contract.docs_refs_tests_commit_only_can_score_100, false);
  assert.equal(foundry.os_readback_contract.readback_contract_landed_can_claim_complete, false);

  const flagship = contract.flagship_experience_mapping;
  assert.equal(flagship.mapping_id, 'mas_research_foundry_flagship_experience.v1');
  assert.equal(flagship.flagship_agent_id, 'mas');
  assert.deepEqual(flagship.false_ready_claims, [
    'mas_ready',
    'paper_done',
    'brand_l5_done',
    'production_ready',
  ]);

  for (const [boundaryName, boundary] of Object.entries({
    target_architecture: contract.authority_boundary,
    multi_plane: multiPlane.cross_plane_authority_boundary,
    reconciler: contract.reconciler_model.loop_authority_boundary,
    experience: experience.authority_boundary,
    one_shot: oneShot.authority_boundary,
    foundry_agent_os: foundry.authority_boundary,
    flagship: flagship.authority_boundary,
  })) {
    for (const [claim, allowed] of Object.entries(boundary)) {
      assert.equal(allowed, false, `${boundaryName} must not claim ${claim}`);
    }
  }

  assert.equal(contract.forbidden_claims.includes('contract_validation_is_domain_ready'), true);
  assert.equal(contract.forbidden_claims.includes('cleanup_lane_is_physical_delete_authority'), true);
});
