import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { createFamilyDefaultContractWorkspace } from '../domain-pack-compiler-fixtures.ts';

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
    assert.equal(masRoute.owner_repo, `${workspaceRoot}/med-autoscience`);
    assert.equal(masRoute.next_owner_repo, `${workspaceRoot}/med-autoscience`);
    assert.equal(
      masRoute.closing_ref_source,
      'contracts/live_stage_run_progress_evidence.json#domain_owner_receipt_refs|typed_blocker_refs|human_gate_refs|quality_or_export_receipt_refs|no_regression_refs|long_soak_refs',
    );
    assert.equal(
      masRoute.typed_blocker_source,
      'contracts/live_stage_run_progress_evidence.json#typed_blocker_refs',
    );
    assert.equal(
      masRoute.verification_commands.includes(
        `opl agents conformance --agent mas=${workspaceRoot}/med-autoscience --json`,
      ),
      true,
    );
    assert.equal(
      masRoute.source_command,
      `opl agents conformance --agent mas=${workspaceRoot}/med-autoscience --json`,
    );
    assert.equal(masRoute.forbidden_opl_claims.includes('live_domain_progress_complete'), true);
    assert.equal(masRoute.forbidden_opl_claims.includes('owner_receipt_signed_by_opl'), true);
    assert.equal(masRoute.non_closing_inputs.includes('controlled_canary_pass'), true);
    assert.equal(
      masRoute.stop_loss.includes(
        'if verification commands fail, keep the domain in required_from_domain_owner or owner_typed_blocker_recorded_not_ready_claim and do not claim domain_ready',
      ),
      true,
    );
    assert.equal(masRoute.ready_claim_authorized, false);
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
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_missing,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.status,
      'domain_owner_payload_required',
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.route_kind,
      'owner_native_refs_only_payload',
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.target_identity.domain_id,
      maturity.current_owner_delta_bridge.domain_id,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff.target_identity
        .stage_id,
      maturity.current_owner_delta_bridge.stage_id,
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.success_refs_path.accepted_answer_shapes,
      maturity.current_owner_delta_bridge.accepted_answer_shape.filter(
        (shape: string) => shape !== 'typed_blocker_ref',
      ),
    );
    assert.deepEqual(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.success_refs_path.required_any_payload_refs,
      [],
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.success_refs_path
        .unsupported_by_domain_owner_payload_summary.length > 0,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.success_refs_path.required_any_payload_refs.includes(
          'typed_blocker_refs',
        ),
      false,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .accepted_return_shape.success_refs_path.typed_blocker_refs_must_be_absent,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .ready_claim_authorized,
      false,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .authority_boundary.handoff_is_payload_route_only,
      true,
    );
    assert.equal(
      maturity.current_owner_delta_bridge.owner_answer_closure_handoff
        .authority_boundary.can_sign_owner_receipt,
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
    assert.equal(
      brandWorkOrder.next_evidence_action,
      'record_or_resolve_brand_module_l5_owner_evidence_for_missing_module_requirements',
      );
      assert.equal(brandWorkOrder.owner_action_checklist.length, 10);
      assert.equal(brandWorkOrder.missing_owner_action_ids.length, 56);
      assert.equal(
        brandWorkOrder.missing_owner_action_ids.includes('w7-brand-module-l5-charter-live_user_path'),
        false,
      );
      assert.equal(
        brandWorkOrder.missing_owner_action_ids.includes('w7-brand-module-l5-charter-cross_agent_scaleout'),
        true,
      );
      assert.equal(
        brandWorkOrder.missing_owner_action_ids.includes('w7-brand-module-l5-runway-long_soak_recovery'),
        false,
      );
      assert.equal(
        brandWorkOrder.missing_owner_action_ids.includes('w7-brand-module-l5-connect-release_install_evidence'),
        false,
      );
    assert.equal(
      brandWorkOrder.missing_owner_action_ids.includes(
        'w7-brand-module-l5-charter-current_owner_delta_default_read',
      ),
      false,
    );
    const charterBrandChecklist = brandWorkOrder.owner_action_checklist.find(
      (entry: { module_id: string }) => entry.module_id === 'charter',
      );
      assert.equal(charterBrandChecklist.status, 'evidence_required');
      assert.equal(charterBrandChecklist.l5_can_be_claimed, false);
      assert.equal(charterBrandChecklist.route_work_order_count, 13);
      assert.equal(charterBrandChecklist.owner_action_required_count, 6);
      assert.equal(charterBrandChecklist.missing_owner_evidence_action_count, 0);
      assert.equal(charterBrandChecklist.typed_blocker_action_count, 6);
      assert.equal(charterBrandChecklist.observed_refs_not_l5_claim_count, 7);
      assert.equal(charterBrandChecklist.owner_followthrough_required, true);
      assert.equal(charterBrandChecklist.owner_followthrough_required_count, 6);
      assert.equal(charterBrandChecklist.missing_owner_evidence_requirement_count, 0);
      assert.equal(charterBrandChecklist.typed_blocker_followthrough_requirement_count, 6);
      assert.equal(charterBrandChecklist.observed_refs_not_l5_claim_requirement_count, 7);
      assert.equal(charterBrandChecklist.observed_ref_requirement_count, 13);
      assert.equal(charterBrandChecklist.open_requirement_count, 5);
      assert.equal(charterBrandChecklist.blocked_requirement_count, 1);
      assert.equal(charterBrandChecklist.missing_requirement_class_ids.length, 6);
      assert.equal(
        charterBrandChecklist.missing_requirement_action_ids.includes(
          'w7-brand-module-l5-charter-live_user_path',
        ),
        false,
      );
      assert.equal(
        charterBrandChecklist.missing_requirement_action_ids.includes(
          'w7-brand-module-l5-charter-cross_agent_scaleout',
        ),
        true,
      );
    assert.equal(
      charterBrandChecklist.missing_requirement_action_ids.includes(
        'w7-brand-module-l5-charter-current_owner_delta_default_read',
      ),
      false,
      );
      assert.deepEqual(charterBrandChecklist.missing_owner_evidence_action_ids, []);
      assert.equal(charterBrandChecklist.typed_blocker_action_ids.length, 6);
      assert.equal(charterBrandChecklist.owner_followthrough_work_order_ids.length, 6);
      assert.equal(charterBrandChecklist.typed_blocker_followthrough_work_order_ids.length, 6);
      assert.equal(
        charterBrandChecklist.typed_blocker_followthrough_work_order_ids.includes(
          'w7-brand-module-l5-charter-live_user_path',
        ),
        false,
      );
      assert.equal(
        charterBrandChecklist.typed_blocker_followthrough_work_order_ids.includes(
          'w7-brand-module-l5-charter-cross_agent_scaleout',
        ),
        true,
      );
      assert.equal(charterBrandChecklist.observed_refs_not_l5_claim_action_ids.length, 7);
      assert.equal(charterBrandChecklist.observed_refs_not_l5_claim_work_order_ids.length, 7);
    assert.equal(
      charterBrandChecklist.observed_refs_not_l5_claim_action_ids.includes(
        'w7-brand-module-l5-charter-current_owner_delta_default_read',
      ),
      true,
    );
    assert.equal(
      charterBrandChecklist.next_followthrough_action,
      'resolve_typed_blocker_or_record_owner_acceptance_ref',
    );
      assert.equal(
        charterBrandChecklist.next_followthrough_work_order_id,
        'w7-brand-module-l5-charter-cross_agent_scaleout',
      );
      assert.equal(charterBrandChecklist.next_work_order_id, 'w7-brand-module-l5-charter-cross_agent_scaleout');
      assert.equal(charterBrandChecklist.next_evidence_class_id, 'cross_agent_scaleout');
    assert.equal(
      charterBrandChecklist.next_owner_repo,
      '/Users/gaofeng/workspace/one-person-lab#brand-module:charter',
    );
    assert.equal(charterBrandChecklist.ready_claim_authorized, false);
    assert.equal(
      charterBrandChecklist.owner_followthrough_false_completion_guard.observed_refs_close_l5,
      false,
    );
    assert.equal(
      charterBrandChecklist.owner_followthrough_false_completion_guard.typed_blocker_refs_close_l5,
      false,
    );
    assert.equal(
      charterBrandChecklist.owner_followthrough_false_completion_guard.ready_claim_authorized,
      false,
    );
    assert.equal(charterBrandChecklist.authority_boundary.checklist_can_claim_l5, false);
    assert.equal(
      charterBrandChecklist.authority_boundary.checklist_can_create_typed_blocker,
      false,
    );
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
      130,
    );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_actionable_work_order_count,
        56,
      );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_missing_owner_evidence_work_order_count,
      0,
    );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_typed_blocker_recorded_work_order_count,
        56,
      );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_observed_refs_not_l5_claim_work_order_count,
        74,
      );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_typed_blocker_ready_work_order_count,
      130,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_owner_acceptance_required_work_order_count,
      130,
    );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_existing_evidence_ref_work_order_count,
        74,
      );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_existing_blocker_ref_work_order_count,
        56,
      );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_observed_ref_work_order_count,
      130,
    );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_owner_action_id_count,
        56,
      );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_missing_owner_evidence_action_id_count,
      0,
    );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_typed_blocker_action_id_count,
        56,
      );
      assert.equal(
        maturity.foundry_agent_os_production_evidence_gate.summary
          .brand_module_l5_observed_refs_not_l5_claim_action_id_count,
        74,
      );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary
        .brand_module_l5_all_requirement_work_order_id_count,
      130,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate
        .brand_module_l5_requirement_work_orders.length,
      130,
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
        'owner_evidence_recorded_not_l5_claim',
      );
    assert.equal(
      charterLivePathWorkOrder.owner_repo,
      '/Users/gaofeng/workspace/one-person-lab#brand-module:charter',
    );
    assert.equal(charterLivePathWorkOrder.owner_acceptance_required, true);
    assert.equal(charterLivePathWorkOrder.ready_claim_authorized, false);
    assert.equal(
      charterLivePathWorkOrder.accepted_ref_shapes.includes('owner_acceptance_ref'),
      true,
    );
    assert.equal(
      charterLivePathWorkOrder.accepted_ref_shapes.includes('typed_blocker_ref'),
      true,
    );
    assert.equal(
      charterLivePathWorkOrder.closing_ref_source,
      'brand_module_owner_evidence_ref_or_owner_acceptance_ref_for_requirement',
    );
    assert.equal(
      charterLivePathWorkOrder.typed_blocker_source,
      'brand_module_owner_l5_typed_blocker_ref_for_requirement',
    );
    assert.equal(
      charterLivePathWorkOrder.forbidden_opl_claims.includes('brand_module_l5_complete'),
      true,
    );
    assert.equal(
      charterLivePathWorkOrder.forbidden_opl_claims.includes('production_ready'),
      true,
    );
    assert.equal(
      charterLivePathWorkOrder.non_closing_inputs.includes('verified_refs_only_ledger'),
      true,
    );
    assert.equal(
      charterLivePathWorkOrder.stop_loss.includes(
        'if the requirement needs owner acceptance, request owner_acceptance_ref or typed_blocker_ref from the listed owner repo',
      ),
      true,
    );
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
      charterLivePathWorkOrder.owner_route_command_examples.record_evidence.command,
      'opl runtime brand-module-l5-evidence record --payload <json> --json',
    );
    assert.equal(
      charterLivePathWorkOrder.owner_route_command_examples.record_evidence.closes_l5,
      false,
    );
    assert.equal(
      charterLivePathWorkOrder.owner_route_command_examples.record_typed_blocker_ref.creates_typed_blocker,
      false,
    );
    assert.equal(
      charterLivePathWorkOrder.owner_route_command_examples.list_requirement_refs.command,
      'opl runtime brand-module-l5-evidence list --module charter --evidence-class live_user_path --json',
    );
    assert.equal(
      charterLivePathWorkOrder.verification_command,
      'opl runtime brand-module-l5-evidence verify --receipt-ref opl://brand-module-l5-evidence/charter/live_user_path/typed-blocker-pending',
    );
    assert.equal(
      charterLivePathWorkOrder.authority_boundary.route_can_create_typed_blocker,
      false,
    );
    const charterOwnerAcceptanceWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .brand_module_l5_requirement_work_orders.find(
        (entry: { module_id: string; class_id: string }) =>
          entry.module_id === 'charter' && entry.class_id === 'owner_acceptance',
      );
    assert.equal(
      charterOwnerAcceptanceWorkOrder.owner_evidence_closure_state,
      'owner_typed_blocker_recorded',
    );
    assert.deepEqual(charterOwnerAcceptanceWorkOrder.existing_blocker_refs, [
      'typed-blocker:opl-brand-l5/charter/owner_acceptance/brand-owner-acceptance-pending-20260612',
    ]);
    assert.deepEqual(
      charterOwnerAcceptanceWorkOrder.observed_evidence_refs,
      charterOwnerAcceptanceWorkOrder.existing_blocker_refs,
    );
    assert.deepEqual(charterOwnerAcceptanceWorkOrder.observed_ref_shapes, [
      'typed_blocker_ref',
    ]);
    assert.equal(charterOwnerAcceptanceWorkOrder.ready_claim_authorized, false);
    assert.equal(
      charterOwnerAcceptanceWorkOrder.authority_boundary.route_can_create_typed_blocker,
      false,
    );
    const charterOwnerDeltaWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .brand_module_l5_requirement_work_orders.find(
        (entry: { module_id: string; class_id: string }) =>
          entry.module_id === 'charter' && entry.class_id === 'current_owner_delta_default_read',
      );
    assert.deepEqual(charterOwnerDeltaWorkOrder.existing_evidence_refs, [
      'current-owner-delta-ref:opl-framework/readiness-current-owner-delta-default-root',
      'operator-default-read-ref:opl-app-state-fast/ordinary-cockpit/current_owner_delta',
    ]);
      assert.deepEqual(charterOwnerDeltaWorkOrder.observed_ref_shapes, [
        'current_owner_delta_ref',
        'operator_default_read_ref',
        'owner_acceptance_ref',
      ]);
    assert.equal(
      charterOwnerDeltaWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_l5_claim',
    );
    assert.equal(charterOwnerDeltaWorkOrder.ready_claim_authorized, false);
    const runwayLongSoakWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .brand_module_l5_requirement_work_orders.find(
        (entry: { module_id: string; class_id: string }) =>
          entry.module_id === 'runway' && entry.class_id === 'long_soak_recovery',
      );
      assert.equal(runwayLongSoakWorkOrder.observed_receipt_refs[0], l5Record.receipt_ref);
      assert.deepEqual([...runwayLongSoakWorkOrder.observed_ref_shapes].sort(), [
        'evidence_ref',
        'ledger_receipt_ref',
        'long_soak_ref',
        'operator_evidence_ref',
        'owner_acceptance_ref',
        'typed_blocker_ref',
      ]);
      assert.equal(runwayLongSoakWorkOrder.observed_typed_blocker_ref_count, 1);
      assert.equal(runwayLongSoakWorkOrder.blocker_state, 'refs_observed_not_l5_claim');
      assert.equal(
        runwayLongSoakWorkOrder.owner_evidence_closure_state,
        'owner_evidence_recorded_not_l5_claim',
      );
      assert.equal(
        runwayLongSoakWorkOrder.l5_claim_status,
        'owner_evidence_refs_observed_not_l5_claimed',
      );
    assert.equal(runwayLongSoakWorkOrder.ready_claim_authorized, false);
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
