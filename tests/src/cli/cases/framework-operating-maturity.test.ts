import { spawnSync } from 'node:child_process';

import { buildFoundryAgentOsOwnerEvidenceIntake } from '../../../../src/foundry-agent-os-owner-evidence-intake.ts';
import { assert, contractsDir, fs, loadFrameworkContracts, os, path, repoRoot, runCli, runCliFailure, test } from '../helpers.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';

function recordAppReleaseUserPathEvidence(
  env: Record<string, string>,
  payload: Record<string, unknown>,
) {
  return runCli([
    'runtime',
    'app-release-evidence',
    'record',
    '--payload',
    JSON.stringify(payload),
  ], env).app_release_user_path_evidence_ledger_record;
}

function seedProviderCadenceWindow(env: Record<string, string>, stateRoot: string) {
  runCli(['family-runtime', 'events', 'export'], env);
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const eventRows = Array.from({ length: 7 }, (_, index) => {
    const createdAt = new Date(now - (6 - index) * dayMs).toISOString();
    return {
      proofEventId: `evt_provider_proof_maturity_${index}`,
      receiptEventId: `evt_provider_slo_maturity_${index}`,
      createdAt,
    };
  });
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
const rows = ${JSON.stringify(eventRows)};
for (const row of rows) {
  db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
    .run(
      row.proofEventId,
      'temporal_residency_proof',
      'test',
      JSON.stringify({
        provider_kind: 'temporal',
        proof_mode: 'external_temporal_service_worker',
        closeout_status: 'production_residency_proven',
        proof_receipt: {
          receipt_kind: 'temporal_production_residency_proof',
          receipt_status: 'proven',
          provider_kind: 'temporal'
        }
      }),
      row.createdAt
    );
  db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
    .run(
      row.receiptEventId,
      'temporal_provider_slo_execution_receipt',
      'test',
      JSON.stringify({
        surface_kind: 'opl_temporal_provider_slo_execution_receipt',
        provider_kind: 'temporal',
        execution_status: 'executed',
        receipt_status: 'proven',
        receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
        repair_receipt: {
          repair_status: 'executed',
          can_execute_domain_repair: false
        },
        authority_boundary: {
          can_authorize_domain_ready: false
        }
      }),
      row.createdAt
    );
}
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

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
    assert.equal(omaRoute.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(omaRoute.authority_boundary.can_create_typed_blocker, false);
    assert.equal(
      maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes.every(
        (entry: {
          accepted_ref_shapes: string[];
          next_owner_action: string;
          conformance_can_close_production: boolean;
          authority_boundary: { can_sign_owner_receipt: boolean; can_create_typed_blocker: boolean };
        }) =>
          entry.accepted_ref_shapes.includes('domain_owner_receipt_ref')
          && entry.accepted_ref_shapes.includes('typed_blocker_ref')
          && entry.accepted_ref_shapes.includes('human_gate_ref')
          && entry.next_owner_action === 'domain_owner_record_live_owner_receipt_typed_blocker_human_gate_quality_export_no_regression_or_long_soak_ref'
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
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.length,
      6,
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
          entry.status === 'open'
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

test('framework operating maturity projects owner evidence ledger refs without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-owner-evidence-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const domainOwnerRecord = runCli([
      'runtime',
      'domain-owner-payload-summary',
      'record',
      '--target-identity',
      JSON.stringify({
        domain_id: 'med-autogrant',
        source_surface: 'mag_opl_owner_payload_response',
        summary_kind: 'owner_payload_item',
        item_id: 'package_and_submit_ready',
        payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
      }),
      '--payload',
      JSON.stringify({
        typed_blocker_refs: [
          'typed-blocker:mag/package_and_submit_ready/human-approval-required',
        ],
      }),
    ], env).domain_owner_payload_summary_ledger_record;
    runCli([
      'runtime',
      'domain-owner-payload-summary',
      'verify',
      '--receipt-ref',
      domainOwnerRecord.receipt_refs[0],
    ], env);
    const masOwnerEvidenceRecord = runCli([
      'runtime',
      'domain-owner-payload-summary',
      'record',
      '--target-identity',
      JSON.stringify({
        domain_id: 'med-autoscience',
        source_surface: 'mas_owner_payload_response',
        summary_kind: 'owner_payload_item',
        item_id: 'paper_owner_gate_refs',
        payload_kind: 'domain_owner_receipt_or_typed_blocker_refs',
      }),
      '--payload',
      JSON.stringify({
        human_gate_refs: [
          'human-gate:mas/dm-cvd/publication-owner-review',
        ],
        quality_gate_receipt_refs: [
          'quality-gate-receipt:mas/dm-cvd/publication-quality',
        ],
        reviewer_receipt_refs: [
          'reviewer-receipt:mas/dm-cvd/ai-reviewer-current',
        ],
        long_soak_refs: [
          'long-soak:mas/dm-cvd/default-executor-owner-chain',
        ],
      }),
    ], env).domain_owner_payload_summary_ledger_record;
    runCli([
      'runtime',
      'domain-owner-payload-summary',
      'verify',
      '--receipt-ref',
      masOwnerEvidenceRecord.receipt_refs[0],
    ], env);

    const l5Record = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'record',
      '--payload',
      JSON.stringify({
        module_id: 'runway',
        evidence_class_id: 'long_soak_recovery',
        typed_blocker_refs: [
          'typed-blocker:runway/long-soak/current-window-pending',
        ],
      }),
    ], env).brand_module_l5_evidence_ledger_record;
    runCli([
      'runtime',
      'brand-module-l5-evidence',
      'verify',
      '--receipt-ref',
      l5Record.receipt_ref,
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(
      maturity.owner_evidence_intake.status,
      'owner_evidence_observed_not_ready_claim',
    );
    assert.equal(
      maturity.owner_evidence_intake.authority_boundary.can_claim_production_ready,
      false,
    );
    const domainLane = maturity.owner_evidence_intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'domain_owner_chain_scaleout',
    );
    assert.equal(domainLane.status, 'owner_evidence_observed_not_ready_claim');
    assert.equal(domainLane.verified_receipt_count, 5);
    assert.deepEqual(domainLane.observed_ref_shapes, [
      'domain_owner_receipt_ref',
      'domain_receipt_ref',
      'no_regression_ref',
      'owner_chain_ref',
      'human_gate_ref',
      'quality_or_export_receipt_ref',
      'reviewer_receipt_ref',
      'long_soak_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(domainLane.observed_ref_counts.typed_blocker_ref_count, 4);
    assert.equal(domainLane.observed_ref_counts.no_regression_ref_count, 2);
    assert.equal(domainLane.observed_ref_counts.owner_chain_ref_count, 3);
    assert.equal(domainLane.observed_ref_counts.human_gate_ref_count, 1);
    assert.equal(domainLane.observed_ref_counts.quality_or_export_receipt_ref_count, 2);
    assert.equal(domainLane.observed_ref_counts.reviewer_receipt_ref_count, 1);
    assert.equal(domainLane.observed_ref_counts.long_soak_ref_count, 1);
    assert.deepEqual(
      domainLane.observed_domains.map((
        entry: { domain_id: string; status: string; observed_ref_shapes: string[] },
      ) => ({
        domain_id: entry.domain_id,
        status: entry.status,
        observed_ref_shapes: entry.observed_ref_shapes,
      })),
      [
        {
          domain_id: 'med-autoscience',
          status: 'owner_evidence_observed_not_ready_claim',
          observed_ref_shapes: [
            'human_gate_ref',
            'quality_or_export_receipt_ref',
            'reviewer_receipt_ref',
            'long_soak_ref',
          ],
        },
        {
          domain_id: 'med-autogrant',
          status: 'owner_evidence_observed_not_ready_claim',
          observed_ref_shapes: [
            'domain_owner_receipt_ref',
            'owner_chain_ref',
            'typed_blocker_ref',
          ],
        },
        {
          domain_id: 'redcube-ai',
          status: 'owner_evidence_observed_not_ready_claim',
          observed_ref_shapes: [
            'domain_owner_receipt_ref',
            'domain_receipt_ref',
            'no_regression_ref',
            'owner_chain_ref',
            'quality_or_export_receipt_ref',
            'typed_blocker_ref',
          ],
        },
        {
          domain_id: 'opl-meta-agent',
          status: 'owner_evidence_observed_not_ready_claim',
          observed_ref_shapes: [
            'no_regression_ref',
            'owner_chain_ref',
            'typed_blocker_ref',
          ],
        },
      ],
    );
    const domainRoutes = maturity.domain_owner_chain_scaleout.domain_owner_evidence_routes;
    assert.deepEqual(
      domainRoutes.map((entry: { domain_id: string; owner_route_status: string }) => ({
        domain_id: entry.domain_id,
        owner_route_status: entry.owner_route_status,
      })),
      [
        {
          domain_id: 'med-autoscience',
          owner_route_status: 'owner_evidence_observed_not_ready_claim',
        },
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
    const masRoute = domainRoutes.find(
      (entry: { domain_id: string }) => entry.domain_id === 'med-autoscience',
    );
    assert.deepEqual(masRoute.observed_ref_shapes, [
      'human_gate_ref',
      'quality_or_export_receipt_ref',
      'reviewer_receipt_ref',
      'long_soak_ref',
    ]);
    assert.equal(
      masRoute.observed_receipt_refs.includes(masOwnerEvidenceRecord.receipt_refs[0]),
      true,
    );
    assert.equal(
      masRoute.observed_receipt_refs.includes('human-gate:mas/dm-cvd/publication-owner-review'),
      true,
    );
    assert.equal(masRoute.observed_ref_counts.human_gate_ref_count, 1);
    assert.equal(masRoute.observed_ref_counts.quality_or_export_receipt_ref_count, 1);
    assert.equal(masRoute.observed_ref_counts.reviewer_receipt_ref_count, 1);
    assert.equal(masRoute.observed_ref_counts.long_soak_ref_count, 1);
    assert.equal(masRoute.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(masRoute.authority_boundary.can_create_typed_blocker, false);
    const magRoute = domainRoutes.find(
      (entry: { domain_id: string }) => entry.domain_id === 'med-autogrant',
    );
    assert.deepEqual(magRoute.observed_ref_shapes, [
      'domain_owner_receipt_ref',
      'owner_chain_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      magRoute.observed_receipt_refs.includes(domainOwnerRecord.receipt_refs[0]),
      true,
    );
    assert.equal(
      magRoute.observed_receipt_refs.includes(
        'repo-tracked-contract:contracts/production_acceptance/mag-production-acceptance.json',
      ),
      true,
    );
    assert.equal(magRoute.observed_ref_counts.typed_blocker_ref_count, 2);
    const rcaRoute = domainRoutes.find(
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
    assert.equal(rcaRoute.observed_ref_counts.typed_blocker_ref_count, 1);
    const omaRoute = domainRoutes.find(
      (entry: { domain_id: string }) => entry.domain_id === 'opl-meta-agent',
    );
    assert.deepEqual(omaRoute.observed_ref_shapes, [
      'no_regression_ref',
      'owner_chain_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(omaRoute.observed_ref_counts.typed_blocker_ref_count, 1);
    assert.equal(omaRoute.observed_ref_counts.no_regression_ref_count, 1);
    assert.equal(omaRoute.authority_boundary.can_sign_owner_receipt, false);
    assert.equal(omaRoute.authority_boundary.can_create_typed_blocker, false);
    assert.equal(
      omaRoute.observed_receipt_refs.includes(
        'repo-tracked-contract:contracts/target_agent_owner_chain_evidence.json',
      ),
      true,
    );

    const brandLane = maturity.owner_evidence_intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'brand_module_l5_operating_maturity',
    );
    assert.equal(brandLane.status, 'owner_evidence_observed_not_ready_claim');
    assert.equal(brandLane.verified_receipt_count, 1);
    assert.deepEqual(brandLane.observed_ref_shapes, ['typed_blocker_ref']);
    assert.equal(brandLane.observed_ref_counts.typed_blocker_ref_count, 1);

    const workOrders = maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders;
    const domainWorkOrder = workOrders.find(
      (entry: { lane: string }) => entry.lane === 'domain_owner_chain_scaleout',
    );
    assert.equal(
      domainWorkOrder.blocker_state,
      'owner_route_refs_observed_not_production_claim',
    );
    assert.equal(domainWorkOrder.owner_evidence_closure_state, 'owner_evidence_required');
    assert.equal(domainWorkOrder.owner_acceptance_required, true);
    assert.equal(domainWorkOrder.ready_claim_authorized, false);
    assert.equal(
      domainWorkOrder.observed_owner_evidence_status,
      'owner_evidence_observed_not_ready_claim',
    );
    assert.deepEqual(domainWorkOrder.observed_ref_shapes, [
      'domain_owner_receipt_ref',
      'domain_receipt_ref',
      'no_regression_ref',
      'owner_chain_ref',
      'human_gate_ref',
      'quality_or_export_receipt_ref',
      'reviewer_receipt_ref',
      'long_soak_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      domainWorkOrder.observed_receipt_refs.includes(domainOwnerRecord.receipt_refs[0]),
      true,
    );
    assert.equal(
      domainWorkOrder.observed_receipt_refs.includes(masOwnerEvidenceRecord.receipt_refs[0]),
      true,
    );
    assert.equal(
      domainWorkOrder.observed_receipt_refs.includes(
        'repo-tracked-contract:contracts/production_acceptance/mag-production-acceptance.json',
      ),
      true,
    );
    assert.equal(
      domainWorkOrder.observed_receipt_refs.includes(
        'repo-tracked-contract:contracts/owner_chain_live_progress_evidence.json',
      ),
      true,
    );
    assert.equal(
      domainWorkOrder.authority_boundary.can_sign_owner_receipt,
      false,
    );

    const brandWorkOrder = workOrders.find(
      (entry: { lane: string }) => entry.lane === 'brand_module_l5_operating_maturity',
    );
    assert.equal(
      brandWorkOrder.blocker_state,
      'owner_route_refs_observed_not_production_claim',
    );
    assert.equal(brandWorkOrder.owner_evidence_closure_state, 'owner_evidence_required');
    assert.equal(brandWorkOrder.owner_acceptance_required, true);
    assert.equal(brandWorkOrder.ready_claim_authorized, false);
    assert.equal(
      brandWorkOrder.observed_owner_evidence_status,
      'owner_evidence_observed_not_ready_claim',
    );
    assert.deepEqual(brandWorkOrder.observed_ref_shapes, ['typed_blocker_ref']);
    assert.equal(brandWorkOrder.observed_receipt_refs[0], l5Record.receipt_ref);
    assert.equal(brandWorkOrder.authority_boundary.can_claim_l5, false);

    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .observed_owner_evidence_lane_count,
      2,
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
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_requirement_work_order_count,
      120,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_typed_blocker_ready_work_order_count,
      120,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_owner_acceptance_required_work_order_count,
      120,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate
        .brand_module_l5_requirement_work_orders.length,
      120,
    );
    const charterLivePathWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .brand_module_l5_requirement_work_orders.find(
        (entry: { module_id: string; class_id: string }) =>
          entry.module_id === 'charter' && entry.class_id === 'live_user_path',
      );
    assert.equal(
      charterLivePathWorkOrder.work_order_id,
      'w7-brand-module-l5-charter-live_user_path',
    );
    assert.equal(
      charterLivePathWorkOrder.owner_evidence_closure_state,
      'owner_acceptance_or_typed_blocker_required',
    );
    assert.equal(charterLivePathWorkOrder.owner_acceptance_required, true);
    assert.equal(charterLivePathWorkOrder.ready_claim_authorized, false);
    assert.deepEqual(charterLivePathWorkOrder.typed_blocker_payload_template, {
      module_id: 'charter',
      evidence_class_id: 'live_user_path',
      typed_blocker_refs: [
        'typed-blocker:opl-brand-l5/charter/live_user_path/owner-evidence-pending',
      ],
      receipt_ref: 'opl://brand-module-l5-evidence/charter/live_user_path/typed-blocker-pending',
    });
    assert.deepEqual(charterLivePathWorkOrder.evidence_payload_template, {
      module_id: 'charter',
      evidence_class_id: 'live_user_path',
      evidence_refs: [
        'owner-evidence-ref:opl-brand-l5/charter/live_user_path/<owner-evidence-id>',
      ],
    });
    assert.equal(
      charterLivePathWorkOrder.verification_command,
      'opl runtime brand-module-l5-evidence verify --receipt-ref opl://brand-module-l5-evidence/charter/live_user_path/typed-blocker-pending',
    );
    assert.equal(
      charterLivePathWorkOrder.authority_boundary.route_can_create_typed_blocker,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.closed_by_opl,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .production_ready_claim_authorized,
      false,
    );
    assert.equal(maturity.authority_boundary.can_claim_l5, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity consumes verified App release user-path evidence without release-ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-app-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const record = recordAppReleaseUserPathEvidence(env, {
      release_package_refs: [
        'release_package_receipt_ref://one-person-lab-app/26.5.28-draft.20260527235839/remote-release-verification',
      ],
      screenshot_refs: [
        'screenshot_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/settings-runtime.png',
      ],
      reload_prompt_user_path_refs: [
        'first_run_log_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/smoke-events',
      ],
      provider_state_linkage_refs: [
        'provider_slo_receipt_ref://one-person-lab/temporal/26.5.28-draft.20260527235839/window-cadence-satisfied',
      ],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/github-actions-clean-vm',
      ],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.app_release_user_path_open_count, 0);
    assert.equal(
      maturity.app_release_user_path.status,
      'evidence_recorded_not_release_ready_claim',
    );
    assert.equal(maturity.app_release_user_path.next_required_delta, 'release_owner_verdict_still_not_claimed_by_opl');
    assert.equal(maturity.app_release_user_path.production_user_path_ready, true);
    assert.equal(maturity.app_release_user_path.open_gate_count, 0);
    assert.equal(maturity.app_release_user_path.pending_verify_receipt_ref_count, 0);
    assert.equal(maturity.app_release_user_path.typed_blocker_ref_count, 0);
    assert.equal(maturity.app_release_user_path.verified_ledger_receipt_ref_count, 1);
    assert.equal(
      maturity.app_release_user_path.selected_cohort_id,
      'app-release-cohort:26.5.28-draft.20260527235839',
    );
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    const appReleaseGateLane = maturity.foundry_agent_os_production_evidence_gate.lane_statuses.find(
      (entry: { lane: string }) => entry.lane === 'app_release_user_path',
    );
    assert.equal(appReleaseGateLane.open_count, 0);
    assert.equal(appReleaseGateLane.status, 'refs_observed_not_production_ready_claim');
    const appReleaseWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'app_release_user_path',
      );
    assert.equal(
      appReleaseWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.equal(appReleaseWorkOrder.owner_acceptance_required, true);
    assert.equal(appReleaseWorkOrder.ready_claim_authorized, false);
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .owner_evidence_recorded_not_ready_claim_work_order_count,
      1,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.production_ready_claim_authorized,
      false,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.authority_boundary.can_claim_app_release_ready,
      false,
    );
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.not_claims.includes('app_release_ready'), true);
    assert.equal(maturity.not_claims.includes('production_ready'), true);
    assert.equal(maturity.status, 'evidence_required');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity surfaces refs-only provider and lifecycle counts without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-runtime-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    seedProviderCadenceWindow(env, stateRoot);
    const providerRecord = runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'record',
      '--payload',
      JSON.stringify({
        temporal_hosted_long_soak_refs: ['temporal-long-soak:codex-app/runtime-4h'],
        provider_state_linkage_refs: ['provider-state:temporal/cadence-current'],
        operator_evidence_refs: ['operator-window:codex-app/runtime-followthrough'],
      }),
    ], env).codex_app_runtime_evidence_ledger_record;
    runCli([
      'runtime',
      'codex-app-runtime-evidence',
      'verify',
      '--receipt-ref',
      providerRecord.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.provider_long_soak_open_count, 0);
    assert.equal(maturity.provider_long_soak.open_evidence_count, 0);
    assert.equal(maturity.provider_long_soak.long_evidence_ready, true);
    assert.equal(maturity.provider_long_soak.observed_receipt_count, 7);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    const providerGateLane = maturity.foundry_agent_os_production_evidence_gate.lane_statuses.find(
      (entry: { lane: string }) => entry.lane === 'provider_long_soak',
    );
    assert.equal(providerGateLane.open_count, 0);
    assert.equal(providerGateLane.status, 'refs_observed_not_production_ready_claim');
    assert.equal(
      providerGateLane.observed_owner_evidence_status,
      'owner_evidence_observed_not_ready_claim',
    );
    const providerWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'provider_long_soak',
      );
    assert.equal(
      providerWorkOrder.blocker_state,
      'owner_route_refs_observed_not_production_claim',
    );
    assert.equal(
      providerWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.equal(providerWorkOrder.owner_acceptance_required, true);
    assert.equal(providerWorkOrder.ready_claim_authorized, false);
    assert.equal(providerWorkOrder.observed_receipt_refs[0], providerRecord.receipt_refs[0]);
    assert.deepEqual(providerWorkOrder.observed_ref_shapes, ['evidence_ref']);
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.non_closing_inputs.includes('verified_refs_only_ledger'),
      true,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.closed_by_opl,
      false,
    );
    assert.equal(maturity.summary.memory_artifact_lifecycle_open_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.open_evidence_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.observed_ref_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.reconcile_issue_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_apply_handoff_blocked_decision_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_blockers_count_as_missing_evidence, false);
    assert.equal(maturity.memory_artifact_lifecycle.opl_stores_body_or_verdict, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.authority_boundary.can_write_memory_body, false);
    assert.equal(maturity.authority_boundary.can_mutate_artifact_body, false);
    assert.equal(maturity.status, 'evidence_required');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity requires family defaults', () => {
  const failure = runCliFailure([
    'framework',
    'operating-maturity',
  ]);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
});
