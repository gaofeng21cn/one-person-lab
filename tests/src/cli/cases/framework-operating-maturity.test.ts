import { buildFoundryAgentOsOwnerEvidenceIntake } from '../../../../src/foundry-agent-os-owner-evidence-intake.ts';
import { assert, contractsDir, fs, loadFrameworkContracts, os, path, runCli, test } from '../helpers.ts';
import './framework-operating-maturity-cases/app-release-evidence.ts';
import './framework-operating-maturity-cases/current-owner-payload-summary.ts';
import './framework-operating-maturity-cases/memory-artifact-lifecycle-followthrough.ts';
import './framework-operating-maturity-cases/owner-evidence-ledger.ts';
import './framework-operating-maturity-cases/provider-and-app-evidence.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';


test('owner evidence intake projects private-platform and lifecycle read-model refs without authority claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-evidence-intake-state-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const intake = buildFoundryAgentOsOwnerEvidenceIntake({
      contracts: loadFrameworkContracts({ contractsDir }),
      appReleaseEvidence: {},
      physicalDeleteAuthority: {
        owner_decision_status: 'owner_decision_observed_refs_only_not_delete_authorized',
        all_repos_delete_or_keep_prerequisites_observed: true,
        all_repos_all_deletion_evidence_requirements_observed: true,
        deletion_evidence_worklist_count: 32,
      },
      lifecycleEvidence: {
        observed_ref_count: 3,
        latest_lifecycle_apply_handoff: {
          handoff_refs: [
            'mas-artifact-lifecycle-handoff:medautoscience:physical-thinning:demo',
          ],
          candidate_refs: [
            'mas-artifact-lifecycle-candidate:medautoscience:projection-thinning:demo',
          ],
          typed_blocker_refs: [
            'mas-artifact-lifecycle-typed-blocker:medautoscience:canonical-regeneration-required:demo',
          ],
          receipt_ref: null,
          writes_performed: false,
          authority_boundary: {
            can_write_memory_body: false,
            can_mutate_artifact_body: false,
            can_claim_production_ready: false,
          },
        },
      },
    });

    const privatePlatformLane = intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'private_platform_retirement',
    );
    assert.ok(privatePlatformLane);
    assert.equal(privatePlatformLane.status, 'owner_evidence_observed_not_ready_claim');
    assert.deepEqual(privatePlatformLane.observed_ref_shapes, ['evidence_ref']);
    assert.equal(privatePlatformLane.verified_receipt_count, 2);
    assert.equal(
      privatePlatformLane.observed_receipt_refs.includes(
        'refs-only-read-model:agents-default-callers/owner-decision-observed-not-delete-authorized',
      ),
      true,
    );

    const lifecycleLane = intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'memory_artifact_lifecycle_apply',
    );
    assert.ok(lifecycleLane);
    assert.equal(lifecycleLane.status, 'owner_evidence_observed_not_ready_claim');
    assert.deepEqual(lifecycleLane.observed_ref_shapes, [
      'typed_blocker_ref',
      'evidence_ref',
    ]);
    assert.equal(lifecycleLane.observed_ref_counts.typed_blocker_ref_count, 1);
    assert.equal(lifecycleLane.observed_ref_counts.evidence_ref_count, 3);
    assert.equal(
      lifecycleLane.observed_receipt_refs.includes(
        'refs-only-read-model:app-operator-drilldown/memory-artifact-lifecycle:3',
      ),
      true,
    );

    assert.equal(intake.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(intake.authority_boundary.can_create_typed_blocker, false);
    assert.equal(intake.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (originalStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = originalStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity aggregates scaleout and L5 gaps without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.surface_kind, 'opl_family_operating_maturity_readout');
    assert.equal(maturity.owner, 'one-person-lab');
    assert.equal(maturity.status, 'evidence_required');
    assert.equal(maturity.baseline_level, 'L4_executable_baseline');
    assert.equal(maturity.target_level, 'L5_production_operating_maturity');

    assert.equal(
      maturity.current_owner_delta_bridge.surface_kind,
      'opl_operating_maturity_current_owner_delta_bridge',
    );
    assert.equal(maturity.current_owner_delta_bridge.default_planning_root, 'current_owner_delta');
    assert.equal(
      maturity.summary.current_owner,
      maturity.current_owner_delta_bridge.current_owner,
    );
    assert.equal(
      maturity.summary.current_owner_stage_id,
      maturity.current_owner_delta_bridge.stage_id,
    );
    assert.equal(typeof maturity.current_owner_delta_bridge.current_owner, 'string');
    assert.equal(maturity.current_owner_delta_bridge.current_owner.length > 0, true);
    assert.equal(typeof maturity.current_owner_delta_bridge.desired_delta_description, 'string');
    assert.equal(maturity.current_owner_delta_bridge.desired_delta_description.length > 0, true);
    assert.equal(maturity.current_owner_delta_bridge.accepted_answer_shape.length > 0, true);
    assert.equal(
      maturity.current_owner_delta_bridge.accepted_answer_shape
        .includes('typed_blocker_ref'),
      true,
    );
    assert.equal(typeof maturity.current_owner_delta_bridge.hard_gate.state, 'string');
    assert.equal(
      maturity.current_owner_delta_bridge.hard_gate.domain_ready_authorized,
      false,
    );
    assert.equal(
      maturity.summary.current_owner_delta_owner_answer_missing,
      maturity.current_owner_delta_bridge.owner_answer_missing,
    );
    assert.equal(
      maturity.summary.current_owner_delta_owner_answer_still_required,
      maturity.current_owner_delta_bridge.owner_answer_still_required,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.surface_kind,
      'opl_current_owner_delta_owner_answer_closure_handoff',
    );
    assert.equal(
      [
        'refs_only_domain_owner_payload_summary',
        'owner_native_refs_only_payload',
      ].includes(maturity.current_owner_delta_bridge.owner_answer_closure_handoff.route_kind),
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.target_identity
        .current_owner_delta_id,
      maturity.current_owner_delta_bridge.delta_id,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.target_identity
        .source_fingerprint,
      maturity.current_owner_delta_bridge.source_fingerprint,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .missing_binding_checklist.includes(
          'stage_run_closeout_binding_policy_satisfied_when_present',
        ),
      true,
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.typed_blocker_path.required_payload_refs,
      ['typed_blocker_refs'],
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.typed_blocker_path.accepted_answer_shapes,
      ['typed_blocker_ref'],
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.typed_blocker_path.success_claimed,
      false,
    );
    if (
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.route_kind
      === 'refs_only_domain_owner_payload_summary'
    ) {
      assert.match(
        maturity.current_owner_delta_bridge.owner_answer_closure_handoff.record_command,
        /domain-owner-payload-summary record/,
      );
      assert.match(
        maturity.current_owner_delta_bridge.owner_answer_closure_handoff.verify_command,
        /domain-owner-payload-summary verify/,
      );
    }
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .record_target_identity_template.current_owner_delta_ref,
      '/framework_readiness/attention_first_payload/current_owner_delta',
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .typed_blocker_payload_template,
      {
        typed_blocker_refs: ['<domain-owned-typed-blocker-ref>'],
      },
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .non_closing_inputs.includes('stale_attempt_owner_answer_ref'),
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .authority_boundary.can_create_typed_blocker,
      false,
    );
    assert.equal(maturity.current_owner_delta_bridge.evidence_lanes_are_audit_sidecar, true);
    assert.equal(
      maturity.current_owner_delta_bridge.evidence_lanes_can_generate_default_next_action,
      false,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.authority_boundary.bridge_is_projection_only,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.authority_boundary.can_sign_owner_receipt,
      false,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.authority_boundary.can_create_typed_blocker,
      false,
    );
    assert.equal(
      maturity.unresolved_owner_gates.surface_kind,
      'opl_unresolved_owner_gate_inventory',
    );
    assert.equal(maturity.unresolved_owner_gates.status, 'owner_gates_required');
    assert.equal(maturity.unresolved_owner_gates.ready_claim_authorized, false);
    assert.equal(maturity.unresolved_owner_gates.gate_count, 7);
    assert.deepEqual(maturity.unresolved_owner_gates.gate_ids, [
      'owner-gate:current_owner_delta_owner_answer',
      'owner-gate:domain_owner_chain_scaleout',
      'owner-gate:brand_module_l5_operating_maturity',
      'owner-gate:app_release_user_path',
      'owner-gate:provider_long_soak',
      'owner-gate:private_platform_retirement',
      'owner-gate:memory_artifact_lifecycle_apply',
    ]);
    assert.equal(
      maturity.unresolved_owner_gates.completion_policy.owner_native_refs_required,
      true,
    );
    assert.equal(
      maturity.unresolved_owner_gates.completion_policy.open_count_zero_closes_ready,
      false,
    );
    assert.equal(
      maturity.unresolved_owner_gates.completion_policy.refs_only_projection_closes_ready,
      false,
    );
    assert.equal(
      maturity.unresolved_owner_gates.completion_policy.opl_can_close_owner_gate,
      false,
    );
    assert.equal(
      maturity.unresolved_owner_gates.authority_boundary.can_claim_production_ready,
      false,
    );
    assert.equal(
      maturity.unresolved_owner_gates.authority_boundary.can_sign_owner_receipt,
      false,
    );
    assert.equal(
      maturity.unresolved_owner_gates.authority_boundary.can_create_typed_blocker,
      false,
    );
    const currentOwnerGate = maturity.unresolved_owner_gates.gates.find(
      (entry: { lane: string }) => entry.lane === 'current_owner_delta_owner_answer',
    );
    assert.equal(currentOwnerGate.status, 'owner_answer_or_typed_blocker_required');
    assert.equal(
      currentOwnerGate.owner,
      maturity.current_owner_delta_bridge.current_owner,
    );
    assert.equal(
      currentOwnerGate.accepted_ref_shapes.includes('typed_blocker_ref'),
      true,
    );
    assert.deepEqual(
      currentOwnerGate.missing_input_refs,
      maturity.current_owner_delta_bridge.missing_input_refs,
    );
    assert.equal(
      currentOwnerGate.closing_ref_source,
      'current_owner_domain_owned_answer_ref_bound_to_current_owner_delta',
    );
    assert.equal(
      currentOwnerGate.typed_blocker_source,
      'current_owner_domain_owned_typed_blocker_ref_bound_to_current_owner_delta',
    );
    assert.match(
      currentOwnerGate.record_command,
      /domain-owner-payload-summary record|owner-native refs-only record/,
    );
    assert.equal(currentOwnerGate.ready_claim_authorized, false);
    assert.equal(currentOwnerGate.can_be_completed_by_opl, false);
    const appReleaseOwnerGate = maturity.unresolved_owner_gates.gates.find(
      (entry: { lane: string }) => entry.lane === 'app_release_user_path',
    );
    assert.equal(appReleaseOwnerGate.owner_repo, '/Users/gaofeng/workspace/one-person-lab-app');
    assert.equal(
      appReleaseOwnerGate.status,
      'owner_evidence_required',
    );
    assert.equal(appReleaseOwnerGate.open_count, maturity.summary.app_release_user_path_open_count);
    assert.equal(
      appReleaseOwnerGate.accepted_ref_shapes.includes('release_owner_receipt_ref'),
      true,
    );
    assert.equal(
      appReleaseOwnerGate.forbidden_opl_claims.includes('app_release_ready'),
      true,
    );
    assert.equal(
      appReleaseOwnerGate.stop_loss.includes(
        'request owner-native receipt, verdict, acceptance, or typed blocker from the listed owner',
      ),
      true,
    );
    assert.equal(
      maturity.owner_evidence_intake.surface_kind,
      'foundry_agent_os_owner_evidence_intake',
    );
    assert.equal(
      maturity.owner_evidence_intake.status,
      'owner_evidence_observed_not_ready_claim',
    );
    assert.equal(maturity.owner_evidence_intake.lane_evidence.length, 6);
    assert.equal(
      maturity.owner_evidence_intake.authority_boundary.can_sign_owner_receipt,
      false,
    );
    assert.equal(
      maturity.owner_evidence_intake.authority_boundary.can_create_typed_blocker,
      false,
    );

    assert.equal(maturity.summary.domain_owner_chain_open_domain_count, 4);
    assert.deepEqual(maturity.domain_owner_chain_scaleout.accepted_refs_only_result_shapes, [
      'domain_owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'quality_or_export_receipt_ref',
      'no_regression_ref',
      'long_soak_ref',
    ]);
    assert.equal(
      maturity.domain_owner_chain_scaleout.domains.every(
        (entry: { status: string; conformance_can_claim_domain_ready: boolean }) =>
          entry.status === 'required_from_domain_owner'
          && entry.conformance_can_claim_domain_ready === false,
      ),
      true,
    );
    assert.deepEqual(
      maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes.map(
        (entry: { domain_id: string; owner_route_status: string }) => ({
          domain_id: entry.domain_id,
          owner_route_status: entry.owner_route_status,
        }),
      ),
      [
        { domain_id: 'med-autoscience', owner_route_status: 'owner_evidence_required' },
        {
          domain_id: 'med-autogrant',
          owner_route_status: 'owner_evidence_observed_not_ready_claim',
        },
        {
          domain_id: 'redcube-ai',
          owner_route_status: 'owner_evidence_observed_not_ready_claim',
        },
        {
          domain_id: 'opl-meta-agent',
          owner_route_status: 'owner_evidence_observed_not_ready_claim',
        },
      ],
    );
    const magRoute = maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes.find(
      (entry: { domain_id: string }) => entry.domain_id === 'med-autogrant',
    );
    assert.deepEqual(magRoute.observed_ref_shapes, [
      'domain_owner_receipt_ref',
      'owner_chain_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      magRoute.observed_receipt_refs.includes(
        'repo-tracked-contract:contracts/production_acceptance/mag-production-acceptance.json',
      ),
      true,
    );
    const rcaRoute = maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes.find(
      (entry: { domain_id: string }) => entry.domain_id === 'redcube-ai',
    );
    assert.deepEqual(rcaRoute.observed_ref_shapes, [
      'domain_owner_receipt_ref',
      'domain_receipt_ref',
      'no_regression_ref',
      'owner_chain_ref',
      'quality_or_export_receipt_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      rcaRoute.observed_receipt_refs.includes(
        'repo-tracked-contract:contracts/owner_chain_live_progress_evidence.json',
      ),
      true,
    );
    const omaRoute = maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes.find(
      (entry: { domain_id: string }) => entry.domain_id === 'opl-meta-agent',
    );
    assert.deepEqual(omaRoute.observed_ref_shapes, [
      'no_regression_ref',
      'owner_chain_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      omaRoute.observed_receipt_refs.includes(
        'repo-tracked-contract:contracts/target_agent_owner_chain_evidence.json',
      ),
      true,
    );
    assert.equal(omaRoute.owner_repo, `${workspaceRoot}/opl-meta-agent`);
    assert.equal(omaRoute.next_owner_repo, `${workspaceRoot}/opl-meta-agent`);
    assert.equal(
      omaRoute.closing_ref_source,
      'contracts/live_stage_run_progress_evidence.json#domain_owner_receipt_refs|typed_blocker_refs|human_gate_refs|quality_or_export_receipt_refs|no_regression_refs|long_soak_refs',
    );
    assert.equal(
      omaRoute.typed_blocker_source,
      'contracts/live_stage_run_progress_evidence.json#typed_blocker_refs',
    );
    assert.equal(
      omaRoute.verification_commands.includes(
        `opl agents conformance --agent opl-meta-agent=${workspaceRoot}/opl-meta-agent --json`,
      ),
      true,
    );
    assert.equal(
      omaRoute.source_command,
      `opl agents conformance --agent opl-meta-agent=${workspaceRoot}/opl-meta-agent --json`,
    );
    assert.equal(omaRoute.forbidden_opl_claims.includes('live_domain_progress_complete'), true);
    assert.equal(omaRoute.forbidden_opl_claims.includes('typed_blocker_created_by_opl'), true);
    assert.equal(
      omaRoute.non_closing_inputs.includes('verified_refs_only_ledger_without_live_stage_run_progress_binding'),
      true,
    );
    assert.equal(
      omaRoute.stop_loss.includes(
        'if observed refs are not bound to contracts/live_stage_run_progress_evidence.json, request a domain-owned contract update instead of synthesizing an owner receipt',
      ),
      true,
    );
    assert.equal(omaRoute.ready_claim_authorized, false);
    assert.equal(omaRoute.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(omaRoute.authority_boundary.can_create_typed_blocker, false);
    assert.equal(
      maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes.every(
        (entry: {
          accepted_ref_shapes: string[];
          owner_repo: string;
          next_owner_repo: string;
          closing_ref_source: string;
          typed_blocker_source: string;
          verification_commands: string[];
          forbidden_opl_claims: string[];
          non_closing_inputs: string[];
          stop_loss: string[];
          next_owner_action: string;
          ready_claim_authorized: boolean;
          conformance_can_close_production: boolean;
          authority_boundary: { can_sign_owner_receipt: boolean; can_create_typed_blocker: boolean };
        }) =>
          entry.accepted_ref_shapes.includes('domain_owner_receipt_ref')
          && entry.accepted_ref_shapes.includes('typed_blocker_ref')
          && entry.accepted_ref_shapes.includes('human_gate_ref')
          && entry.owner_repo.length > 0
          && entry.next_owner_repo.length > 0
          && entry.closing_ref_source.includes('contracts/live_stage_run_progress_evidence.json')
          && entry.typed_blocker_source === 'contracts/live_stage_run_progress_evidence.json#typed_blocker_refs'
          && entry.verification_commands.some((command) => command.startsWith('opl agents conformance --agent '))
          && entry.forbidden_opl_claims.includes('domain_ready')
          && entry.forbidden_opl_claims.includes('production_ready')
          && entry.non_closing_inputs.includes('controlled_canary_pass')
          && entry.stop_loss.length > 0
          && entry.next_owner_action === 'domain_owner_record_live_owner_receipt_typed_blocker_human_gate_quality_export_no_regression_or_long_soak_ref'
          && entry.ready_claim_authorized === false
          && entry.conformance_can_close_production === false
          && entry.authority_boundary.can_sign_owner_receipt === false
          && entry.authority_boundary.can_create_typed_blocker === false,
      ),
      true,
    );

    assert.equal(maturity.summary.brand_module_l5_evidence_required_module_count, 10);
    assert.equal(maturity.brand_module_l5.status, 'evidence_required');
    assert.equal(maturity.brand_module_l5.l5_complete_module_count, 0);
    assert.equal(maturity.brand_module_l5.evidence_ledger.verified_receipt_count, 0);
    assert.equal(
      maturity.brand_module_l5.owner_route_work_order_policy.work_orders_close_l5,
      false,
    );
    assert.equal(
      maturity.brand_module_l5.owner_route_work_order_policy.accepted_route_ref_shapes
        .includes('owner_acceptance_ref'),
      true,
    );

    assert.equal(maturity.summary.cleanup_retirement_open_decision_count, 0);
    assert.equal(
      maturity.cleanup_retirement.status,
      'waiting_for_structural_prerequisites',
    );
    assert.equal(maturity.cleanup_retirement.deletion_evidence_worklist_count, 32);
    assert.equal(maturity.cleanup_retirement.owner_decision_missing_count, 0);
    assert.equal(maturity.cleanup_retirement.structural_prerequisites_observed, false);
    assert.equal(maturity.cleanup_retirement.all_deletion_evidence_requirements_observed, false);
    assert.equal(maturity.cleanup_retirement.physical_delete_authorized, false);
    assert.equal(maturity.cleanup_retirement.default_caller_delete_ready, false);
    assert.equal(maturity.cleanup_retirement.next_required_owner_action, 'domain_owner_choose_delete_authorize_keep_or_typed_blocker');

    assert.equal(maturity.summary.app_release_user_path_open_count, 1);
    assert.equal(maturity.app_release_user_path.status, 'evidence_required');
    assert.equal(maturity.app_release_user_path.production_user_path_ready, false);
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    assert.equal(maturity.provider_long_soak.status, 'evidence_required');
    assert.equal(maturity.summary.provider_long_soak_open_count, 1);
    assert.equal(maturity.provider_long_soak.open_evidence_count, 1);
    assert.equal(maturity.provider_long_soak.long_evidence_ready, false);
    assert.equal(maturity.provider_long_soak.missing_receipt_count, 7);
    assert.equal(maturity.provider_long_soak.blocked_repair_receipt_count, 0);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    assert.equal(maturity.memory_artifact_lifecycle.status, 'evidence_required');
    assert.equal(maturity.summary.memory_artifact_lifecycle_open_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.open_evidence_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.observed_ref_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.reconcile_issue_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_apply_handoff_blocked_decision_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.opl_stores_body_or_verdict, false);
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.surface_kind,
      'foundry_agent_os_production_evidence_gate',
    );
    assert.equal(maturity.foundry_agent_os_production_evidence_gate.status, 'evidence_required');
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.w7_status,
      'production_evidence_not_closed_by_opl',
    );
    assert.deepEqual(
      maturity.foundry_agent_os_production_evidence_gate.required_closing_ref_shapes,
      [
        'domain_owner_receipt_ref',
        'typed_blocker_ref',
        'human_gate_ref',
        'quality_or_export_receipt_ref',
        'reviewer_receipt_ref',
        'long_soak_ref',
        'release_evidence_ref',
        'install_evidence_ref',
        'owner_acceptance_ref',
      ],
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.non_closing_inputs.includes('conformance_pass'),
      true,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.non_closing_inputs.includes('provider_completion'),
      true,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.non_closing_inputs.includes('app_projection'),
      true,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.closed_by_opl,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.production_ready_claim_authorized,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .observed_owner_evidence_lane_count,
      1,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .owner_evidence_required_work_order_count,
      5,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .owner_evidence_recorded_not_ready_claim_work_order_count,
      0,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .owner_acceptance_required_work_order_count,
      6,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.authority_boundary.can_claim_production_ready,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.final_scaleout_gate.surface_kind,
      'opl_final_scaleout_gate',
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.final_scaleout_gate.open_lane_count,
      maturity.foundry_agent_os_production_evidence_gate.summary.open_lane_count,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.final_scaleout_gate.ready_claim_authorized,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.final_scaleout_gate.non_closing_inputs.includes(
        'zero_worklist_count',
      ),
      true,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.final_scaleout_gate.authority_boundary
        .can_claim_production_ready,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.length,
      6,
    );
    assert.deepEqual(
      Object.keys(
        maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders_by_lane,
      ),
      [
        'domain_owner_chain_scaleout',
        'brand_module_l5_operating_maturity',
        'app_release_user_path',
        'provider_long_soak',
        'private_platform_retirement',
        'memory_artifact_lifecycle_apply',
      ],
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders_by_lane
        .provider_long_soak.work_order_id,
      'w7-provider-long-soak',
    );
    assert.deepEqual(
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders_by_lane
        .provider_long_soak,
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'provider_long_soak',
      ),
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders_by_lane
        .provider_long_soak.ready_claim_authorized,
      false,
    );
    assert.deepEqual(
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.map(
        (entry: { work_order_id: string; blocker_state: string }) => ({
          work_order_id: entry.work_order_id,
          blocker_state: entry.blocker_state,
        }),
      ),
      [
        {
          work_order_id: 'w7-domain-owner-chain-scaleout',
          blocker_state: 'owner_route_refs_observed_not_production_claim',
        },
        {
          work_order_id: 'w7-brand-module-l5-operating-maturity',
          blocker_state: 'owner_route_evidence_missing',
        },
        {
          work_order_id: 'w7-app-release-user-path',
          blocker_state: 'owner_route_evidence_missing',
        },
        {
          work_order_id: 'w7-provider-long-soak',
          blocker_state: 'owner_route_evidence_missing',
        },
        {
          work_order_id: 'w7-private-platform-retirement',
          blocker_state: 'owner_route_evidence_missing',
        },
        {
          work_order_id: 'w7-memory-artifact-lifecycle-apply',
          blocker_state: 'owner_route_evidence_missing',
        },
      ],
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.every(
        (entry: {
          status: string;
          owner_repo: string | null;
          next_owner_action: string;
          owner_evidence_closure_state: string;
          owner_acceptance_required: boolean;
          ready_claim_authorized: boolean;
          open_count_semantics: string;
          accepted_ref_shapes: string[];
          closing_ref_source: string;
          typed_blocker_source: string;
          forbidden_opl_claims: string[];
          verification_command: string;
          non_closing_inputs: string[];
          authority_boundary: { work_order_can_close_production: boolean; can_claim_l5: boolean };
        }) =>
          ['open', 'owner_evidence_recorded', 'owner_acceptance_required'].includes(entry.status)
          && typeof entry.owner_repo === 'string'
          && entry.next_owner_action.length > 0
          && entry.owner_evidence_closure_state.length > 0
          && entry.owner_acceptance_required === true
          && entry.ready_claim_authorized === false
          && entry.open_count_semantics === 'open_count_tracks_lane_specific_missing_evidence_only_zero_does_not_authorize_ready_claim'
          && entry.accepted_ref_shapes.includes('typed_blocker_ref')
          && entry.closing_ref_source.length > 0
          && entry.typed_blocker_source.length > 0
          && entry.forbidden_opl_claims.includes('production_ready')
          && entry.forbidden_opl_claims.includes('domain_ready')
          && entry.verification_command.length > 0
          && entry.non_closing_inputs.includes('conformance_pass')
          && entry.non_closing_inputs.includes('app_projection')
          && entry.authority_boundary.work_order_can_close_production === false
          && entry.authority_boundary.can_claim_l5 === false,
      ),
      true,
    );
    const privatePlatformWorkOrder = maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.find(
      (entry: { work_order_id: string }) =>
        entry.work_order_id === 'w7-private-platform-retirement',
    );
    assert.equal(privatePlatformWorkOrder.open_count, maturity.summary.cleanup_retirement_open_decision_count);
    assert.equal(
      privatePlatformWorkOrder.owner_evidence_closure_state,
      'owner_acceptance_or_typed_blocker_required',
    );
    assert.equal(privatePlatformWorkOrder.owner_acceptance_required, true);
    assert.equal(privatePlatformWorkOrder.ready_claim_authorized, false);
    assert.equal(
      privatePlatformWorkOrder.accepted_ref_shapes.includes('physical_delete_authorization_ref'),
      true,
    );
    assert.equal(
      privatePlatformWorkOrder.accepted_ref_shapes.includes('keep_as_authority_adapter_ref'),
      true,
    );
    assert.equal(privatePlatformWorkOrder.owner_repo, 'domain repositories');
    assert.equal(
      privatePlatformWorkOrder.closing_ref_source,
      'domain_owner_physical_delete_authorization_keep_or_typed_blocker',
    );
    assert.equal(
      privatePlatformWorkOrder.typed_blocker_source,
      'domain_owner_private_platform_retirement_typed_blocker_ref',
    );
    assert.equal(
      privatePlatformWorkOrder.verification_command,
      'opl agents default-callers --family-defaults --json',
    );

    assert.deepEqual(maturity.next_owner_actions.map((entry: { lane: string }) => entry.lane), [
      'domain_owner_chain_scaleout',
      'brand_module_l5_operating_maturity',
      'app_release_user_path',
      'provider_long_soak',
      'private_platform_retirement',
      'memory_artifact_lifecycle_apply',
    ]);

    assert.equal(maturity.authority_boundary.can_claim_domain_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_l5, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(maturity.authority_boundary.can_create_typed_blocker, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity compact readback summarizes owner gates without full evidence intake', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-compact-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const full = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    const compactOutput = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
      '--detail',
      'compact',
    ], env);
    const compact = compactOutput.framework_operating_maturity_compact;

    assert.equal(Object.hasOwn(compactOutput, 'framework_operating_maturity'), false);
    assert.equal(compact.surface_kind, 'opl_family_operating_maturity_compact_readback');
    assert.equal(compact.detail_level, 'compact');
    assert.equal(compact.source_surface_ref, '/framework_operating_maturity');
    assert.equal(
      compact.source_command,
      'opl framework operating-maturity --family-defaults --json',
    );
    assert.equal(
      compact.full_detail_command,
      'opl framework operating-maturity --family-defaults --json',
    );
    assert.equal(compact.status, full.status);
    assert.equal(compact.baseline_level, full.baseline_level);
    assert.equal(compact.target_level, full.target_level);
    assert.equal(compact.summary.current_owner, full.summary.current_owner);
    assert.equal(
      compact.summary.current_owner_stage_id,
      full.summary.current_owner_stage_id,
    );
    assert.equal(
      compact.summary.domain_owner_chain_open_domain_count,
      full.summary.domain_owner_chain_open_domain_count,
    );
    assert.equal(compact.summary.ready_claim_authorized, false);
    assert.equal(
      compact.current_owner_delta_bridge.delta_id,
      full.current_owner_delta_bridge.delta_id,
    );
    assert.equal(
      compact.current_owner_delta_bridge.default_planning_root,
      'current_owner_delta',
    );
    assert.equal(
      compact.current_owner_delta_bridge.domain_ready_authorized,
      false,
    );
    assert.deepEqual(
      compact.unresolved_owner_gates.gate_ids,
      full.unresolved_owner_gates.gate_ids,
    );
    assert.equal(
      compact.unresolved_owner_gates.ready_claim_authorized,
      false,
    );
    assert.equal(
      compact.evidence_lane_summary.cleanup_physical_delete_authorized,
      false,
    );
    assert.deepEqual(
      compact.next_owner_actions.map((entry: { lane: string }) => entry.lane),
      full.next_owner_actions.map((entry: { lane: string }) => entry.lane),
    );
    assert.equal(compact.omitted_sections.includes('owner_evidence_intake'), true);
    assert.equal(Object.hasOwn(compact, 'owner_evidence_intake'), false);
    assert.equal(compact.false_ready_guard.default_full_readback_unchanged, true);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_domain_ready, false);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_app_release_ready, false);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_l5, false);
    assert.equal(compact.false_ready_guard.compact_readback_can_claim_production_ready, false);
    assert.equal(compact.false_ready_guard.compact_readback_can_authorize_physical_delete, false);
    assert.equal(compact.authority_boundary.refs_only, true);
    assert.equal(compact.authority_boundary.derived_from_full_readback, true);
    assert.equal(compact.authority_boundary.can_write_domain_truth, false);
    assert.equal(compact.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(compact.authority_boundary.can_create_typed_blocker, false);
    assert.equal(compact.authority_boundary.can_authorize_physical_delete, false);
    assert.equal(
      compact.authority_boundary.source_authority_boundary.can_claim_production_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
