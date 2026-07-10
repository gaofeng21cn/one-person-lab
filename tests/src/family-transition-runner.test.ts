import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  adaptDomainTransitionOracleToFamilyTransitionSpec,
  adaptGrantTransitionOracleToFamilyTransitionSpec,
  buildDomainTransitionOracleMatrixCases,
  buildGrantTransitionOracleMatrixCases,
} from '../../src/modules/stagecraft/family-transition-oracle-ingestion.ts';
import {
  adaptVisualTransitionSpecToFamilyTransitionSpec,
  buildVisualTransitionAdapterProfileRegistryReadback,
  buildVisualTransitionMatrixCases,
  normalizeVisualTransitionAdapterProfileRegistry,
  resolveVisualTransitionAdapterProfile,
  type VisualTransitionSpec,
} from '../../src/modules/stagecraft/family-transition-visual-ingestion.ts';
import {
  runFamilyTransition,
  runFamilyTransitionMatrix,
  type FamilyTransitionSpec,
} from '../../src/modules/stagecraft/family-transition-runner.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

const masLikeTransitionSpec = {
  surface_kind: 'family_transition_spec',
  version: 'family-transition-runner.v1',
  spec_id: 'mas-like-publication-transition-fixture',
  target_domain_id: 'medautoscience',
  owner: 'med-autoscience',
  authority_boundary: {
    opl: 'transition_runner_transport_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
  },
  guards: {
    owner_receipt_observed: {
      description: 'Domain owner has emitted a receipt ref.',
      owner: 'med-autoscience',
    },
    owner_receipt_missing: {
      description: 'Domain owner receipt is not present.',
      owner: 'med-autoscience',
    },
    publishability_issue_open: {
      description: 'Domain-owned publication gate is still blocked.',
      owner: 'med-autoscience',
    },
    human_publication_decision_required: {
      description: 'Domain asks for a human publication gate decision.',
      owner: 'med-autoscience',
    },
  },
  transitions: [
    {
      transition_id: 'bundle-ready-to-publication-check',
      current_state: 'bundle_stage_ready',
      event: 'domain_tick',
      required_guards: ['owner_receipt_observed'],
      next_state: 'publication_gate_check',
      next_work_unit: {
        work_unit_ref: 'mas-work-unit:publication-gate-check',
        action_refs: ['mas-action:run-publication-gate'],
      },
      owner_route: {
        owner: 'med-autoscience',
        route_ref: 'mas-route:publication-gate',
      },
      receipt: {
        receipt_refs: ['mas-receipt:bundle-owner-ready'],
      },
      projection: {
        route_node_refs: ['mas-route-node:bundle-stage-ready'],
        quality_ref: 'mas-quality-ref:domain-owned-only',
      },
    },
    {
      transition_id: 'bundle-blocked-to-owner-repair',
      current_state: 'bundle_stage_blocked',
      event: 'domain_tick',
      required_guards: ['owner_receipt_missing'],
      next_state: 'owner_repair_required',
      next_work_unit: {
        work_unit_ref: 'mas-work-unit:collect-owner-receipt',
        action_refs: ['mas-action:request-owner-receipt'],
      },
      owner_route: {
        owner: 'med-autoscience',
        route_ref: 'mas-route:owner-repair',
      },
      typed_blocker: {
        blocker_code: 'blocked_no_mas_owner_apply_receipt',
        owner: 'med-autoscience',
        refs: ['mas-blocker:missing-owner-receipt'],
      },
      receipt: {
        receipt_refs: ['mas-receipt:blocker-observed'],
      },
    },
    {
      transition_id: 'publishability-blocked-to-human-gate',
      current_state: 'publishability_gate_blocked',
      event: 'domain_tick',
      required_guards: [
        'publishability_issue_open',
        'human_publication_decision_required',
      ],
      next_state: 'human_gate_required',
      owner_route: {
        owner: 'human_operator',
        route_ref: 'human-gate:publication-decision',
      },
      human_gate: {
        gate_ref: 'human-gate:publication-decision',
        owner: 'human_operator',
        reason: 'domain_publication_gate_requires_human_decision',
      },
      receipt: {
        receipt_refs: ['mas-receipt:publishability-blocker'],
      },
    },
  ],
} satisfies FamilyTransitionSpec;

const magLikeGrantTransitionOracle = {
  surface_kind: 'mag_grant_transition_oracle',
  version: 'mag-grant-transition-oracle.v1',
  oracle_id: 'mag.grant_transition.oracle.v1',
  target_domain_id: 'med-autogrant',
  owner: 'med-autogrant',
  state: 'domain_spec_landed_external_runner_gate',
  runner_owner: 'one-person-lab',
  runner_contract_ref: 'contracts/opl-framework/family-transition-runner-contract.json',
  transition_table_status: 'landed',
  oracle_fixture_status: 'landed',
  stage_control_plane_ref: '/product_entry_manifest/family_stage_control_plane',
  action_catalog_ref: '/product_entry_manifest/family_action_catalog',
  authority_boundary: {
    domain_truth_owner: 'med-autogrant',
    fundability_verdict_owner: 'med-autogrant',
    authoring_quality_verdict_owner: 'med-autogrant',
    submission_ready_export_verdict_owner: 'med-autogrant',
    opl_role: 'generic_transition_runner_only',
    opl_can_infer_fundability_ready: false,
    opl_can_infer_authoring_quality_ready: false,
    opl_can_infer_submission_ready_export_ready: false,
    opl_can_write_grant_truth: false,
  },
  transition_table: [
    {
      transition_id: 'call_intake_complete_to_fundability_strategy',
      from_stage_id: 'call_and_candidate_intake',
      to_stage_id: 'fundability_strategy',
      guard_id: 'call_materials_and_profile_selected',
      owner_action: 'open_grant_user_loop',
      return_shape: 'domain_owner_receipt',
      receipt_requirement: 'intake_handoff_receipt',
      blocked_shape: 'typed_blocker',
    },
    {
      transition_id: 'fundability_blocked_to_human_gate',
      from_stage_id: 'fundability_strategy',
      to_stage_id: 'fundability_strategy',
      guard_id: 'fundability_blocker_requires_human_gate',
      owner_action: 'open_grant_user_loop',
      return_shape: 'typed_blocker',
      receipt_requirement: 'human_gate_receipt',
      blocked_shape: 'typed_blocker',
    },
    {
      transition_id: 'review_closed_to_package_and_submit_ready',
      from_stage_id: 'review_and_rebuttal',
      to_stage_id: 'package_and_submit_ready',
      guard_id: 'review_quality_closed',
      owner_action: 'build_submission_ready_package',
      return_shape: 'domain_owner_receipt',
      receipt_requirement: 'quality_closure_receipt',
      blocked_shape: 'typed_blocker',
    },
  ],
  oracle_fixtures: [
    {
      fixture_id: 'call_intake_ready_to_fundability_strategy',
      source_stage_id: 'call_and_candidate_intake',
      input_state: {
        call_materials_status: 'complete',
        candidate_profile_status: 'selected',
      },
      expected_transition_id: 'call_intake_complete_to_fundability_strategy',
    },
    {
      fixture_id: 'fundability_blocked_requests_human_gate',
      source_stage_id: 'fundability_strategy',
      input_state: {
        fundability_verdict: 'blocked',
        human_gate: 'required',
      },
      expected_transition_id: 'fundability_blocked_to_human_gate',
    },
    {
      fixture_id: 'quality_closed_to_package',
      source_stage_id: 'review_and_rebuttal',
      input_state: {
        review_verdict: 'closed',
        quality_dossier_status: 'accepted',
      },
      expected_transition_id: 'review_closed_to_package_and_submit_ready',
    },
  ],
  validation: {
    status: 'ready_for_opl_runner_ingestion',
    transition_count: 3,
    oracle_fixture_count: 3,
    checked_stage_count: 6,
    checked_action_count: 5,
    missing_stage_refs: [],
    missing_action_refs: [],
    missing_fixture_transition_refs: [],
  },
};

const visualTransitionSpec = {
  surface_kind: 'visual_transition_spec',
  spec_id: 'visual.transition.spec.v1',
  owner: 'example-visual-domain',
  status: 'landed',
  transition_model: 'domain_declared_visual_transition_table',
  source_contract: 'contracts/example/visual-transition.json',
  covered_family_stage_kinds: ['visual_intake', 'visual_export'],
  transition_table: [
    {
      transition_id: 'intake_to_export_review',
      from_stage: 'visual_intake',
      to_stage: 'visual_export_review',
      required_guard_refs: ['source_assets_indexed'],
      owner_action: 'review_visual_export',
    },
  ],
  guard_contract: {
    source_assets_indexed: {
      owner: 'example-visual-domain',
    },
  },
  oracle_fixture: {
    fixture_id: 'visual-intake-ready',
    covered_families: ['example-visual-domain'],
    expected_return_shapes: ['domain_owner_receipt'],
    forbidden_oracle_fields: ['visual_ready_claimed', 'exportable_claimed'],
  },
  runner_boundary: {
    opl_can_execute_transition_spec: true,
    opl_can_retry_or_dead_letter: true,
    opl_can_store_transition_metadata: true,
  },
  repository_boundary: {
    domain_truth_owner: 'example-visual-domain',
  },
} satisfies VisualTransitionSpec;

function visualAdapterRegistryFixture(input: {
  profileId: string;
  targetDomainId: string;
  targetDomainIds: string[];
  profileRole: 'domain_transition_profile_extension' | 'compatibility_projection';
  guardOwnerLabel: string;
  refPrefix: string;
}) {
  return normalizeVisualTransitionAdapterProfileRegistry({
    surface_kind: 'opl_domain_transition_adapter_profile_registry',
    version: 'visual-transition-adapter-profile-registry.v1',
    owner: input.targetDomainId,
    registry_role: 'domain_owned_transition_adapter_profile_registry',
    source_visual_transition_spec_ref: 'opl_generated:product_entry_manifest#/visual_transition_spec',
    profile_count: 1,
    compatibility_profile_count: input.profileRole === 'compatibility_projection' ? 1 : 0,
    registry_entries: [{
      profile_id: input.profileId,
      target_domain_ids: input.targetDomainIds,
      adapter_profile: {
        profile_id: input.profileId,
        profile_surface_kind: 'opl_domain_transition_adapter_profile',
        profile_role: input.profileRole,
        profile_registry_role: 'registry_entry',
        profile_extension_kind: 'visual_transition',
        compatibility_surface_kind: 'visual_transition_spec',
        target_domain_id: input.targetDomainId,
        guard_owner_label: input.guardOwnerLabel,
        work_unit_ref_prefix: `${input.refPrefix}-work-unit`,
        owner_route_ref_prefix: `${input.refPrefix}-visual-transition`,
        owner_receipt_ref_prefix: `${input.refPrefix}-domain-owner-receipt`,
        oracle_fixture_ref_prefix: `${input.refPrefix}-oracle-fixture`,
        stage_ref_prefix: `${input.refPrefix}-stage`,
      },
    }],
    authority_boundary: {
      domain_transition_profile_extension_is_core_ontology: false,
      refs_only: true,
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_visual_ready: false,
      can_claim_exportable: false,
      can_mutate_artifacts: false,
    },
  });
}

test('family transition runner advances bundle_stage_ready through domain-declared owner route without domain verdict ownership', () => {
  const result = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'bundle_stage_ready',
    event: 'domain_tick',
    guards: { owner_receipt_observed: true },
    context: { attempt_id: 'sat_bundle_ready' },
  });

  assert.equal(result.status, 'transition_applied');
  assert.equal(result.next_state, 'publication_gate_check');
  assert.deepEqual(result.next_work_unit, {
    work_unit_ref: 'mas-work-unit:publication-gate-check',
    action_refs: ['mas-action:run-publication-gate'],
  });
  assert.deepEqual(result.owner_route, {
    owner: 'med-autoscience',
    route_ref: 'mas-route:publication-gate',
  });
  assert.equal(result.human_gate, null);
  assert.equal(result.typed_blocker, null);
  assert.equal(result.dead_letter_intent, null);
  assert.equal(result.outcome_path, 'success_refs_path');
  assert.equal(result.terminal_input_kind, 'success_refs_path');
  assert.equal(result.requires_owner_answer, false);
  assert.equal(result.projection.outcome_path, 'success_refs_path');
  assert.equal(result.projection.requires_owner_answer, false);
  assert.equal(result.projection.success_claimed, true);
  assert.equal(result.projection.domain_ready_claimed, false);
  assert.equal(result.projection.production_ready_claimed, false);
  assert.deepEqual(result.receipt.receipt_refs, ['mas-receipt:bundle-owner-ready']);
  assert.equal(result.projection.current_state, 'bundle_stage_ready');
  assert.equal(result.projection.next_state, 'publication_gate_check');
  assert.deepEqual(result.projection.route_node_refs, ['mas-route-node:bundle-stage-ready']);
  assert.equal(
    result.authority_boundary.opl,
    'transition_runner_transport_projection_only',
  );
  assert.equal(
    result.authority_boundary.domain,
    'truth_quality_artifact_gate_owner',
  );
});

test('family transition runner records MAS transition refs without interpreting publication or artifact authority', () => {
  const spec = {
    ...masLikeTransitionSpec,
    transitions: [
      {
        ...masLikeTransitionSpec.transitions[0],
        projection: {
          route_node_refs: ['mas-route-node:bundle-stage-ready'],
          publication_eval_ref: 'artifacts/publication_eval/latest.json',
          controller_decision_ref: 'artifacts/controller_decisions/latest.json',
          current_package_ref: 'submission/current_package.zip',
          domain_ready_verdict: 'publication_gate_pending',
          domain_ready_claimed: true,
          production_ready_claimed: true,
        },
        authority_boundary: {
          opl_interprets_publication_verdict: false,
          opl_authorizes_artifact_mutation: false,
          publication_verdict_owner: 'med-autoscience',
          artifact_authority_owner: 'med-autoscience',
        },
      },
    ],
  } satisfies FamilyTransitionSpec;

  const result = runFamilyTransition({
    spec,
    domain_id: 'medautoscience',
    current_state: 'bundle_stage_ready',
    event: 'domain_tick',
    guards: { owner_receipt_observed: true },
    context: { receipt_ref: 'mas-owner-receipt:publication-gate-pending' },
  });

  assert.equal(result.status, 'transition_applied');
  assert.equal(result.projection.domain_ready_verdict, 'publication_gate_pending');
  assert.equal(result.projection.domain_ready_claimed, false);
  assert.equal(result.projection.production_ready_claimed, false);
  assert.equal(result.projection.publication_eval_ref, 'artifacts/publication_eval/latest.json');
  assert.deepEqual(result.receipt.context_refs, ['mas-owner-receipt:publication-gate-pending']);
  assert.equal(result.authority_boundary.opl, 'transition_runner_transport_projection_only');
  assert.equal(result.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  assert.equal(result.authority_boundary.opl_interprets_publication_verdict, false);
  assert.equal(result.authority_boundary.opl_authorizes_artifact_mutation, false);
  assert.equal(result.authority_boundary.publication_verdict_owner, 'med-autoscience');
  assert.equal(result.authority_boundary.artifact_authority_owner, 'med-autoscience');
});

test('family transition matrix keeps adjacent MAS-like blocked states from crossing into the ready route', () => {
  const result = runFamilyTransitionMatrix({
    spec: masLikeTransitionSpec,
    cases: [
      {
        case_id: 'ready-can-enter-publication-check',
        domain_id: 'medautoscience',
        current_state: 'bundle_stage_ready',
        event: 'domain_tick',
        guards: { owner_receipt_observed: true },
      },
      {
        case_id: 'bundle-blocked-stays-on-owner-repair',
        domain_id: 'medautoscience',
        current_state: 'bundle_stage_blocked',
        event: 'domain_tick',
        guards: { owner_receipt_missing: true },
      },
      {
        case_id: 'publishability-blocked-stays-on-human-gate',
        domain_id: 'medautoscience',
        current_state: 'publishability_gate_blocked',
        event: 'domain_tick',
        guards: {
          publishability_issue_open: true,
          human_publication_decision_required: true,
        },
      },
    ],
  });

  assert.equal(result.status, 'matrix_evaluated');
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.transition_applied, 3);
  assert.deepEqual(
    result.results.map((entry) => [entry.case_id, entry.result.next_state]),
    [
      ['ready-can-enter-publication-check', 'publication_gate_check'],
      ['bundle-blocked-stays-on-owner-repair', 'owner_repair_required'],
      ['publishability-blocked-stays-on-human-gate', 'human_gate_required'],
    ],
  );
  assert.equal(result.results[1].result.typed_blocker?.blocker_code, 'blocked_no_mas_owner_apply_receipt');
  assert.equal(result.results[1].result.outcome_path, 'typed_blocker_path');
  assert.equal(result.results[1].result.projection.success_claimed, false);
  assert.equal(result.results[1].result.requires_owner_answer, true);
  assert.equal(result.results[2].result.human_gate?.gate_ref, 'human-gate:publication-decision');
  assert.equal(result.results[2].result.outcome_path, 'human_gate_path');
  assert.equal(result.results[2].result.projection.success_claimed, false);
  assert.equal(result.results[2].result.requires_owner_answer, true);
});

test('family transition runner fails closed when an adjacent state provides the wrong guard', () => {
  const result = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'bundle_stage_blocked',
    event: 'domain_tick',
    guards: { owner_receipt_observed: true },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.next_state, 'bundle_stage_blocked');
  assert.equal(result.next_work_unit, null);
  assert.equal(result.owner_route.owner, 'med-autoscience');
  assert.equal(result.typed_blocker?.blocker_code, 'transition_guard_unsatisfied');
  assert.equal(result.outcome_path, 'typed_blocker_path');
  assert.equal(result.projection.terminal_input_kind, 'typed_blocker_path');
  assert.equal(result.projection.success_claimed, false);
  assert.equal(result.dead_letter_intent, null);
  assert.equal(result.receipt.receipt_status, 'blocked_fail_closed');
  assert.deepEqual(result.receipt.missing_guard_ids, ['owner_receipt_missing']);
});

test('family transition runner dead-letters unknown transitions and guard ids fail closed', () => {
  const unknownTransition = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'publishability_gate_blocked',
    event: 'owner_receipt_observed',
    guards: {
      publishability_issue_open: true,
      human_publication_decision_required: true,
    },
  });
  const unknownGuard = runFamilyTransition({
    spec: masLikeTransitionSpec,
    domain_id: 'medautoscience',
    current_state: 'bundle_stage_ready',
    event: 'domain_tick',
    guards: {
      owner_receipt_observed: true,
      unregistered_guard_from_domain: true,
    },
  });

  assert.equal(unknownTransition.status, 'dead_letter_intended');
  assert.equal(unknownTransition.next_state, 'publishability_gate_blocked');
  assert.equal(unknownTransition.dead_letter_intent?.reason, 'unknown_transition');
  assert.equal(unknownTransition.outcome_path, 'dead_letter_path');
  assert.equal(unknownTransition.projection.success_claimed, false);
  assert.equal(unknownTransition.receipt.receipt_status, 'dead_letter_intended');

  assert.equal(unknownGuard.status, 'blocked');
  assert.equal(unknownGuard.next_state, 'bundle_stage_ready');
  assert.equal(unknownGuard.typed_blocker?.blocker_code, 'unknown_guard_id');
  assert.equal(unknownGuard.outcome_path, 'typed_blocker_path');
  assert.equal(unknownGuard.projection.requires_owner_answer, true);
  assert.deepEqual(unknownGuard.receipt.unknown_guard_ids, ['unregistered_guard_from_domain']);
});

test('family transition runner contract keeps generic execution in OPL and domain semantics in the domain agent', () => {
  const contract = readJson('contracts/opl-framework/family-transition-runner-contract.json');
  const packageJson = readJson('package.json');

  assert.equal(contract.contract_kind, 'opl_family_transition_runner_contract.v1');
  assert.equal(contract.runner_model, 'domain_declared_transition_table');
  assert.equal(contract.contract_version, 'family-transition-runner.v1');
  assert.equal(packageJson.exports['./family-transition-runner'], './dist/modules/stagecraft/family-transition-runner.js');
  assert.deepEqual(contract.oracle_ingestion.supported_surfaces, [
    'domain_transition_oracle',
    'mag_grant_transition_oracle',
  ]);
  assert.deepEqual(contract.oracle_ingestion.compatibility_surfaces, ['mag_grant_transition_oracle']);
  assert.ok((contract.oracle_ingestion.adapter_boundary.opl as string[]).includes('adapt oracle fixtures into matrix cases'));
  assert.ok((contract.oracle_ingestion.adapter_boundary.domain_agent as string[]).includes('fundability verdict'));
  assert.ok((contract.runner_execution_boundary.opl_executes as string[]).includes('domain-declared transition spec'));
  assert.ok((contract.runner_execution_boundary.opl_records as string[]).includes('transition receipt'));
  assert.ok((contract.runner_execution_boundary.opl_must_not_interpret as string[]).includes('MAS publication verdict'));
  assert.ok((contract.runner_execution_boundary.opl_must_not_interpret as string[]).includes('domain artifact authority'));
  assert.equal(contract.outcome_path_guard.guard_id, 'opl.family_transition.outcome_path_guard.v1');
  assert.deepEqual(contract.outcome_path_guard.path_priority, [
    'dead_letter_path',
    'human_gate_path',
    'typed_blocker_path',
    'success_refs_path',
  ]);
  assert.equal(contract.outcome_path_guard.no_second_truth_guard.domain_projection_can_override_outcome_path, false);
  assert.equal(contract.outcome_path_guard.no_second_truth_guard.typed_blocker_path_can_claim_stage_success, false);
  assert.equal(contract.outcome_path_guard.authority_boundary.outcome_path_guard_can_create_typed_blocker, false);
  assert.ok((contract.runner_outputs as string[]).includes('outcome_path'));
  assert.ok((contract.runner_outputs as string[]).includes('terminal_input_kind'));
  assert.ok((contract.runner_outputs as string[]).includes('requires_owner_answer'));

  for (const field of [
    'surface_kind',
    'version',
    'spec_id',
    'target_domain_id',
    'owner',
    'authority_boundary',
    'guards',
    'transitions',
  ]) {
    assert.ok((contract.required_spec_fields as string[]).includes(field));
  }

  for (const field of [
    'transition_id',
    'current_state',
    'event',
    'next_state',
    'owner_route',
  ]) {
    assert.ok((contract.required_transition_fields as string[]).includes(field));
  }

  for (const failClosedCase of [
    'unknown_guard_id',
    'transition_domain_mismatch',
    'unknown_transition',
    'transition_guard_unsatisfied',
    'transition_guard_forbidden',
    'ambiguous_transition',
  ]) {
    assert.ok((contract.fail_closed_cases as string[]).includes(failClosedCase));
  }

  assert.equal(contract.domain_truth_boundary.opl_interprets_domain_quality, false);
  assert.equal(contract.domain_truth_boundary.opl_executes_domain_action, false);
  assert.equal(contract.domain_truth_boundary.opl_writes_domain_truth, false);
  assert.ok((contract.authority_boundary.opl as string[]).includes('matrix runner'));
  assert.ok((contract.authority_boundary.domain_agent as string[]).includes('domain transition table'));
  assert.ok((contract.authority_boundary.domain_agent as string[]).includes('oracle fixtures'));
});

test('grant transition oracle adapts MAG-owned table and fixtures into the generic matrix runner', () => {
  const spec = adaptGrantTransitionOracleToFamilyTransitionSpec(magLikeGrantTransitionOracle);
  const cases = buildGrantTransitionOracleMatrixCases(magLikeGrantTransitionOracle);
  const matrix = runFamilyTransitionMatrix({ spec, cases });

  assert.equal(spec.surface_kind, 'family_transition_spec');
  assert.equal(spec.version, 'family-transition-runner.v1');
  assert.equal(spec.spec_id, 'mag.grant_transition.oracle.v1');
  assert.equal(spec.target_domain_id, 'med-autogrant');
  assert.equal(spec.owner, 'med-autogrant');
  assert.deepEqual(Object.keys(spec.guards).sort(), [
    'call_materials_and_profile_selected',
    'fundability_blocker_requires_human_gate',
    'review_quality_closed',
  ]);
  assert.equal(spec.transitions[0].current_state, 'call_and_candidate_intake');
  assert.equal(spec.transitions[0].event, 'domain_tick');
  assert.deepEqual(spec.transitions[0].required_guards, ['call_materials_and_profile_selected']);
  assert.deepEqual(spec.transitions[0].next_work_unit, {
    work_unit_ref: 'mag-work-unit:fundability_strategy',
    action_refs: ['open_grant_user_loop'],
    metadata: {
      owner_action: 'open_grant_user_loop',
      return_shape: 'domain_owner_receipt',
      receipt_requirement: 'intake_handoff_receipt',
      blocked_shape: 'typed_blocker',
    },
  });
  assert.deepEqual(spec.transitions[0].receipt?.receipt_refs, [
    'mag-transition-receipt:intake_handoff_receipt',
  ]);
  assert.equal(spec.transitions[1].typed_blocker?.blocker_code, 'human_gate_receipt');
  assert.equal(spec.transitions[1].human_gate?.gate_ref, 'mag-human-gate:fundability_blocked_to_human_gate');
  assert.equal(spec.authority_boundary.opl_can_infer_fundability_ready, false);

  assert.equal(cases.length, 3);
  assert.deepEqual(cases[1].guards, { fundability_blocker_requires_human_gate: true });
  assert.equal(matrix.summary.total, 3);
  assert.equal(matrix.summary.transition_applied, 3);
  assert.deepEqual(
    matrix.results.map((entry) => [entry.case_id, entry.result.transition_id, entry.result.next_state]),
    [
      [
        'call_intake_ready_to_fundability_strategy',
        'call_intake_complete_to_fundability_strategy',
        'fundability_strategy',
      ],
      [
        'fundability_blocked_requests_human_gate',
        'fundability_blocked_to_human_gate',
        'fundability_strategy',
      ],
      [
        'quality_closed_to_package',
        'review_closed_to_package_and_submit_ready',
        'package_and_submit_ready',
      ],
    ],
  );
  assert.equal(
    matrix.results[1].result.typed_blocker?.blocker_code,
    'human_gate_receipt',
  );
  assert.equal(matrix.results[1].result.outcome_path, 'human_gate_path');
  assert.equal(matrix.results[1].result.projection.success_claimed, false);
  assert.equal(
    matrix.results[1].result.authority_boundary.opl_can_write_grant_truth,
    false,
  );
});

test('domain transition oracle adapts non-MAG domain tables through the same generic runner', () => {
  const domainOracle = {
    ...magLikeGrantTransitionOracle,
    surface_kind: 'domain_transition_oracle',
    oracle_id: 'domain.transition.oracle.v1',
    target_domain_id: 'example-domain',
    owner: 'example-domain-owner',
    authority_boundary: {
      domain_truth_owner: 'example-domain-owner',
      opl_role: 'generic_transition_runner_only',
      opl_can_write_domain_truth: false,
    },
  };
  const spec = adaptDomainTransitionOracleToFamilyTransitionSpec(domainOracle);
  const cases = buildDomainTransitionOracleMatrixCases(domainOracle);
  const matrix = runFamilyTransitionMatrix({ spec, cases });

  assert.equal(spec.spec_id, 'domain.transition.oracle.v1');
  assert.equal(spec.target_domain_id, 'example-domain');
  assert.equal(spec.transitions[0].owner_route.route_ref, 'domain-transition:call_intake_complete_to_fundability_strategy');
  assert.equal(spec.transitions[0].next_work_unit?.work_unit_ref, 'domain-work-unit:fundability_strategy');
  assert.deepEqual(spec.transitions[0].receipt?.receipt_refs, [
    'domain-transition-receipt:intake_handoff_receipt',
  ]);
  assert.equal(spec.transitions[1].human_gate?.gate_ref, 'domain-human-gate:fundability_blocked_to_human_gate');
  assert.equal(cases[0].domain_id, 'example-domain');
  assert.equal(matrix.summary.transition_applied, 3);
});

test('visual transition ingestion uses generic adapter profile instead of RCA-only refs', () => {
  const registry = visualAdapterRegistryFixture({
    profileId: 'example-visual-domain.visual-transition.v1',
    targetDomainId: 'example-visual-domain',
    targetDomainIds: ['example-visual-domain'],
    profileRole: 'domain_transition_profile_extension',
    guardOwnerLabel: 'example-visual-domain',
    refPrefix: 'example-visual-domain',
  });
  const adapterProfile = resolveVisualTransitionAdapterProfile('example-visual-domain', registry);
  const spec = adaptVisualTransitionSpecToFamilyTransitionSpec(
    visualTransitionSpec,
    'example-visual-domain',
    adapterProfile,
  );
  const cases = buildVisualTransitionMatrixCases(
    visualTransitionSpec,
    'example-visual-domain',
    adapterProfile,
  );
  const matrix = runFamilyTransitionMatrix({ spec, cases });

  assert.equal(spec.target_domain_id, 'example-visual-domain');
  assert.equal(spec.owner, 'example-visual-domain');
  assert.equal(spec.authority_boundary.profile_surface_kind, 'opl_domain_transition_adapter_profile');
  assert.equal(spec.authority_boundary.profile_registry_surface_kind, 'opl_domain_transition_adapter_profile_registry');
  assert.equal(spec.authority_boundary.profile_registry_role, 'registry_entry');
  assert.equal(spec.authority_boundary.profile_role, 'domain_transition_profile_extension');
  assert.equal(spec.authority_boundary.profile_extension_kind, 'visual_transition');
  assert.equal(spec.authority_boundary.domain_transition_profile_extension_is_core_ontology, false);
  assert.equal(spec.guards.source_assets_indexed.description, 'example-visual-domain-owned guard ref source_assets_indexed for transition intake_to_export_review.');
  assert.equal(spec.transitions[0].next_work_unit?.work_unit_ref, 'example-visual-domain-work-unit:visual_export_review');
  assert.equal(
    spec.transitions[0].next_work_unit?.metadata?.domain_transition_profile_surface_kind,
    'opl_domain_transition_adapter_profile',
  );
  assert.equal(
    spec.transitions[0].next_work_unit?.metadata?.domain_transition_profile_registry,
    'opl_domain_transition_adapter_profile_registry',
  );
  assert.equal(
    spec.transitions[0].next_work_unit?.metadata?.domain_transition_profile_extension_kind,
    'visual_transition',
  );
  assert.equal(spec.transitions[0].owner_route.route_ref, 'example-visual-domain-visual-transition:intake_to_export_review');
  assert.deepEqual(spec.transitions[0].receipt?.receipt_refs, [
    'example-visual-domain-domain-owner-receipt:intake_to_export_review',
    'example-visual-domain-oracle-fixture:visual-intake-ready',
  ]);
  assert.deepEqual(spec.transitions[0].projection?.route_node_refs, [
    'example-visual-domain-stage:visual_intake',
    'example-visual-domain-stage:visual_export_review',
  ]);
  assert.equal(matrix.summary.transition_applied, 1);
  assert.equal(matrix.results[0].result.next_state, 'visual_export_review');
  assert.equal(matrix.results[0].result.authority_boundary.opl_can_declare_visual_ready, false);
  assert.equal(matrix.results[0].result.authority_boundary.opl_can_mutate_artifacts, false);
});

test('visual transition consumes a domain-owned RCA compatibility profile', () => {
  const registry = visualAdapterRegistryFixture({
    profileId: 'redcube-ai.visual_transition.compatibility.v1',
    targetDomainId: 'rca',
    targetDomainIds: ['rca', 'redcube_ai', 'redcube-ai', 'redcube'],
    profileRole: 'compatibility_projection',
    guardOwnerLabel: 'RCA',
    refPrefix: 'rca',
  });
  const adapterProfile = resolveVisualTransitionAdapterProfile('redcube-ai', registry);
  const spec = adaptVisualTransitionSpecToFamilyTransitionSpec(
    {
      ...visualTransitionSpec,
      owner: 'redcube-ai',
    },
    'redcube-ai',
    adapterProfile,
  );

  assert.equal(adapterProfile.profileId, 'redcube-ai.visual_transition.compatibility.v1');
  assert.equal(spec.guards.source_assets_indexed.description, 'RCA-owned guard ref source_assets_indexed for transition intake_to_export_review.');
  assert.equal(spec.authority_boundary.profile_registry_surface_kind, 'opl_domain_transition_adapter_profile_registry');
  assert.equal(spec.authority_boundary.profile_id, 'redcube-ai.visual_transition.compatibility.v1');
  assert.equal(spec.authority_boundary.profile_registry_role, 'registry_entry');
  assert.equal(spec.authority_boundary.profile_role, 'compatibility_projection');
  assert.equal(spec.authority_boundary.compatibility_surface_kind, 'visual_transition_spec');
  assert.equal(spec.authority_boundary.compatibility_projection, true);
  assert.equal(spec.transitions[0].next_work_unit?.work_unit_ref, 'rca-work-unit:visual_export_review');
  assert.equal(spec.transitions[0].owner_route.route_ref, 'rca-visual-transition:intake_to_export_review');
  assert.deepEqual(spec.transitions[0].receipt?.receipt_refs, [
    'rca-domain-owner-receipt:intake_to_export_review',
    'rca-oracle-fixture:visual-intake-ready',
  ]);
  assert.equal(spec.authority_boundary.opl_can_declare_visual_ready, false);
  assert.equal(spec.authority_boundary.opl_can_mutate_artifacts, false);
});

test('visual transition adapter registry readback exposes compatibility without authority', () => {
  const domainRegistry = visualAdapterRegistryFixture({
    profileId: 'redcube-ai.visual_transition.compatibility.v1',
    targetDomainId: 'rca',
    targetDomainIds: ['rca', 'redcube_ai', 'redcube-ai', 'redcube'],
    profileRole: 'compatibility_projection',
    guardOwnerLabel: 'RCA',
    refPrefix: 'rca',
  });
  const registry = buildVisualTransitionAdapterProfileRegistryReadback(domainRegistry);
  const entry = registry.registry_entries[0];

  assert.equal(registry.surface_kind, 'opl_domain_transition_adapter_profile_registry_readback');
  assert.equal(registry.registry_surface_kind, 'opl_domain_transition_adapter_profile_registry');
  assert.equal(registry.registry_role, 'generic_domain_transition_adapter_profile_registry');
  assert.equal(entry.profile_id, 'redcube-ai.visual_transition.compatibility.v1');
  assert.deepEqual(entry.target_domain_ids, ['rca', 'redcube_ai', 'redcube-ai', 'redcube']);
  assert.equal(entry.adapter_profile.profile_role, 'compatibility_projection');
  assert.equal(entry.adapter_profile.compatibility_projection, true);
  assert.equal(registry.authority_boundary.can_write_domain_truth, false);
  assert.equal(registry.authority_boundary.can_create_owner_receipt, false);
  assert.equal(registry.authority_boundary.can_create_typed_blocker, false);
  assert.equal(registry.authority_boundary.can_claim_visual_ready, false);
});

test('visual transition ingestion has no built-in RCA profile and rejects authority overclaim', () => {
  assert.throws(
    () => resolveVisualTransitionAdapterProfile(
      'redcube-ai',
      normalizeVisualTransitionAdapterProfileRegistry({
        surface_kind: 'opl_domain_transition_adapter_profile_registry',
        version: 'visual-transition-adapter-profile-registry.v1',
        owner: 'redcube_ai',
        registry_role: 'domain_owned_transition_adapter_profile_registry',
        source_visual_transition_spec_ref: 'opl_generated:product_entry_manifest#/visual_transition_spec',
        profile_count: 0,
        compatibility_profile_count: 0,
        registry_entries: [],
        authority_boundary: {
          domain_transition_profile_extension_is_core_ontology: false,
          refs_only: true,
          can_execute_domain_action: false,
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_create_typed_blocker: false,
          can_claim_domain_ready: false,
          can_claim_visual_ready: false,
          can_claim_exportable: false,
          can_mutate_artifacts: false,
        },
      }),
    ),
    /No visual transition adapter profile is registered/,
  );
  assert.equal(buildVisualTransitionAdapterProfileRegistryReadback().profile_count, 0);
  assert.throws(
    () => normalizeVisualTransitionAdapterProfileRegistry({
      surface_kind: 'opl_domain_transition_adapter_profile_registry',
      version: 'visual-transition-adapter-profile-registry.v1',
      owner: 'mas',
      registry_role: 'domain_owned_transition_adapter_profile_registry',
      source_visual_transition_spec_ref: 'opl_generated:product_entry_manifest#/visual_transition_spec',
      profile_count: 0,
      compatibility_profile_count: 0,
      registry_entries: [],
      authority_boundary: {
        domain_transition_profile_extension_is_core_ontology: false,
        refs_only: true,
        can_execute_domain_action: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_visual_ready: true,
        can_claim_exportable: false,
        can_mutate_artifacts: false,
      },
    }),
    /grants forbidden authority/,
  );
  assert.throws(
    () => normalizeVisualTransitionAdapterProfileRegistry({
      surface_kind: 'opl_domain_transition_adapter_profile_registry',
      version: 'forged.v1',
      owner: 'mas',
      registry_role: 'domain_owned_transition_adapter_profile_registry',
      source_visual_transition_spec_ref: 'opl_generated:product_entry_manifest#/visual_transition_spec',
      profile_count: 0,
      compatibility_profile_count: 0,
      registry_entries: [],
      authority_boundary: {
        refs_only: true,
        can_execute_domain_action: false,
        can_write_domain_truth: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
        can_claim_domain_ready: false,
        can_claim_visual_ready: false,
        can_claim_exportable: false,
        can_mutate_artifacts: false,
      },
    }),
    /version/,
  );
  assert.throws(
    () => visualAdapterRegistryFixture({
      profileId: 'forged.visual-transition.v1',
      targetDomainId: 'rca',
      targetDomainIds: ['mas'],
      profileRole: 'compatibility_projection',
      guardOwnerLabel: 'RCA',
      refPrefix: 'rca',
    }),
    /target_domain_id.*target_domain_ids/,
  );
});
