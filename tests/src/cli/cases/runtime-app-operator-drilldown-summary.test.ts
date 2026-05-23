import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import { buildOplAionRuntimeConsumptionContract } from '../../../../src/aionui-acp-shell.ts';
import { buildRuntimeTraySnapshot } from '../../../../src/runtime-tray-snapshot.ts';
import { loadFrameworkContracts } from '../../../../src/contracts.ts';
import { buildManyStageManifest } from './runtime-app-operator-drilldown-summary-fixtures.ts';
import {
  assertAppReleaseUserPathAttention,
  assertAppReleaseUserPathNextStep,
  assertAppReleaseUserPathSummary,
} from './runtime-app-operator-drilldown-summary-app-release-assertions.ts';
import {
  assertOmaProductionConsumptionAttention,
  assertOmaProductionConsumptionFullDetail,
  assertOmaProductionConsumptionNextStep,
  assertOmaProductionConsumptionSummary,
} from './runtime-app-operator-drilldown-summary-oma-assertions.ts';
import {
  assertDomainDispatchGroupExecutorHints,
} from './domain-dispatch-group-executor-hints-assertions.ts';

test('runtime app-operator-drilldown defaults to summary-first refs and keeps full refs explicit', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-summary-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(buildManyStageManifest(12)),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    for (let index = 0; index < 12; index += 1) {
      const attempt = runCli([
        'family-runtime',
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        `write_${index}`,
        '--provider',
        'local_sqlite',
        '--workspace-locator',
        JSON.stringify({
          workspace_root: `/tmp/mas-${index}`,
          artifact_root: `/tmp/mas-${index}/artifacts`,
          source_refs: [`source:dataset-${index}`],
        }),
        '--task',
        `task-app-drilldown-${index}`,
        '--checkpoint-ref',
        `checkpoint:write-start-${index}`,
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
      const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attemptId,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`receipt:write-closeout-${index}`],
          consumed_refs: [`artifact:table-${index}`],
          consumed_memory_refs: [`memory:route-policy-${index}`],
          writeback_receipt_refs: [`memory-writeback:receipt-${index}`],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            decision: 'bounded_repair',
            owner_receipt_refs: [`owner-receipt:summary-${index}`],
            typed_blocker_refs: [],
            quality_refs: [`publication_eval/${index}.json`],
            readiness_refs: [`controller_decisions/${index}.json`],
            repair_command: `medautosci sidecar dispatch --task task-${index}.json --format json`,
            package_refs: [`package:submission-${index}`],
            export_refs: [`export:current-package-${index}`],
          },
        }),
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
    }

    const summaryOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const summaryDrilldown = summaryOutput.app_operator_drilldown;
    assert.equal(summaryDrilldown.detail_level, 'summary');
    assert.equal(
      summaryDrilldown.projection_detail_policy,
      'attention_first_default_full_refs_via_explicit_drilldown',
    );
    assert.equal(summaryDrilldown.summary.stage_attempt_count, 12);
    assert.equal(summaryDrilldown.summary.route_graph_ref_count, 12);
    assert.equal(summaryDrilldown.summary.operator_action_route_count > 36, true);
    assert.equal(
      summaryDrilldown.summary.stage_production_attempt_request_route_count,
      summaryDrilldown.summary.stage_production_evidence_missing_caller_stage_count,
    );
    assert.equal(summaryDrilldown.route_graph_refs, undefined);
    assert.equal(summaryDrilldown.operator_action_routing_refs, undefined);
    assert.equal(summaryDrilldown.production_evidence_tail_ledger, undefined);
    assert.equal(summaryDrilldown.domain_dispatch_evidence, undefined);
    assert.equal(summaryDrilldown.stage_production_evidence, undefined);
    assert.equal(summaryDrilldown.domain_evidence_request_refs, undefined);
    assert.equal(summaryDrilldown.standard_agent_template_consumption_refs, undefined);
    assert.equal(summaryDrilldown.functional_privatization_audit_refs, undefined);
    assert.equal(
      summaryDrilldown.summary.functional_privatization_audit_default_policy,
      'audit_action_required_first_full_inventory_via_explicit_drilldown',
    );
    assert.equal(summaryDrilldown.summary.functional_privatization_action_required_count, 0);
    assert.equal(
      summaryDrilldown.summary.functional_privatization_hidden_cleared_count >= 0,
      true,
    );
    assert.equal(
      summaryDrilldown.summary.functional_privatization_private_platform_residue_inventory_detail_policy,
      'full_detail_inventory_not_default_action_required_count',
    );
    assert.equal(
      summaryDrilldown.summary.standard_agent_template_consumption_status,
      'explicit_repeat_consumption_proof_command_available',
    );
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_proof_command_count, 1);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_app_operator_ref_count, 1);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_default_sample_count, 3);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_repeat_supported, true);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_domain_ready_claim_count, 0);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_production_ready_claim_count, 0);
    assert.equal(summaryDrilldown.summary.standard_agent_template_consumption_artifact_authority_claim_count, 0);
    assert.equal(summaryDrilldown.opl_meta_agent_workbench_refs, undefined);
    assert.equal(
      ['resolved', 'not_bound'].includes(summaryDrilldown.summary.opl_meta_agent_registry_status),
      true,
    );
    const metaAgentBound = summaryDrilldown.summary.opl_meta_agent_registry_status === 'resolved';
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_app_workbench_section_count,
      metaAgentBound ? 6 : 0,
    );
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_scaleout_target_count,
      metaAgentBound ? 2 : 0,
    );
    assert.equal(
      Object.keys(summaryDrilldown.summary).some((key) =>
        key.startsWith('opl_meta_agent_scaleout_owner_receipt_')
        || key.startsWith('opl_meta_agent_scaleout_typed_blocker_')
        || key.startsWith('opl_meta_agent_scaleout_agent_lab_')
        || key.startsWith('opl_meta_agent_scaleout_no_forbidden_write_')
        || key.startsWith('opl_meta_agent_scaleout_cleanup_')
        || key === 'opl_meta_agent_evidence_after_contract_status'
      ),
      false,
    );
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_domain_ready, false);
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_quality_verdict, false);
    assert.equal(summaryDrilldown.summary.opl_meta_agent_claims_default_promotion, false);
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_patch_loop_ref_count >= (metaAgentBound ? 11 : 0),
      true,
    );
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_patch_loop_target_count,
      metaAgentBound ? 2 : 0,
    );
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_patch_loop_closed_count,
      metaAgentBound ? 2 : 0,
    );
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_self_evolution_cockpit_target_count,
      metaAgentBound ? 2 : 0,
    );
    assert.equal(
      summaryDrilldown.summary.opl_meta_agent_self_evolution_cockpit_six_question_ready_count,
      metaAgentBound ? 2 : 0,
    );
    assertOmaProductionConsumptionSummary(summaryDrilldown, metaAgentBound);
    assertAppReleaseUserPathSummary(summaryDrilldown);
    if (metaAgentBound) assert.equal(summaryDrilldown.oma_sections.scaleout_evidence.refs.length >= 2, true);
    assert.equal(summaryDrilldown.attention_first_payload.surface_kind, 'opl_app_drilldown_attention_first_payload');
    assert.deepEqual(summaryDrilldown.attention_first_payload.full_detail_args, ['--detail', 'full']);
    assert.deepEqual(
      Object.keys(summaryDrilldown.attention_first_payload).filter((key) => (
        [
          'owner',
          'blocking',
          'advisory',
          'missing_evidence',
          'evidence_after_contract',
          'evidence_next_steps',
          'codex_app_runtime_role',
          'next_safe_action',
          'provider_health',
        ].includes(key)
      )),
      [
        'owner',
        'blocking',
        'advisory',
        'missing_evidence',
        'evidence_after_contract',
        'evidence_next_steps',
        'codex_app_runtime_role',
        'next_safe_action',
        'provider_health',
      ],
    );
    assert.equal(summaryDrilldown.codex_app_runtime_role, undefined);
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.surface_kind,
      'opl_app_drilldown_evidence_after_contract_attention',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.status,
      'attention_required',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.domain_dispatch_attention_count,
      summaryDrilldown.summary.domain_dispatch_attention_count,
    );
    const dispatchWorkorderSummary =
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .domain_dispatch_evidence_workorder_packet_summary;
    assert.equal(
      dispatchWorkorderSummary.workorder_count,
      summaryDrilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
    );
    assert.equal(
      dispatchWorkorderSummary.route_requires_domain_or_app_payload_count,
      dispatchWorkorderSummary.workorder_count,
    );
    assert.equal(
      dispatchWorkorderSummary.domain_id_policy,
      'canonical_owner_facing_ids_only_workorder_items_keep_command_domain_ids_for_action_routes',
    );
    assert.equal(
      dispatchWorkorderSummary.route_domain_id_policy,
      'command_domain_ids_for_opl_runtime_action_execute_routes_not_default_owner_semantics',
    );
    assert.equal(
      dispatchWorkorderSummary.domain_ids.every((domainId: string) => domainId.includes('-')),
      true,
    );
    assert.equal(
      dispatchWorkorderSummary.route_domain_ids.length,
      dispatchWorkorderSummary.domain_ids.length,
    );
    assert.equal(
      dispatchWorkorderSummary.domain_stage_grouping_policy,
      'bounded_canonical_owner_stage_groups_refs_only_no_domain_authority',
    );
    assert.equal(
      dispatchWorkorderSummary.domain_stage_group_count <= dispatchWorkorderSummary.workorder_count,
      true,
    );
    assert.equal(dispatchWorkorderSummary.domain_stage_group_omitted_count >= 0, true);
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .domain_dispatch_evidence_workorder_group_attention_policy,
      'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
    );
    const dispatchWorkorderGroups =
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .domain_dispatch_evidence_workorder_group_attention_items;
    assert.equal(
      dispatchWorkorderGroups.length,
      Math.min(dispatchWorkorderSummary.domain_stage_group_count, 5),
    );
    const dispatchWorkorderGroup = dispatchWorkorderGroups[0];
    if (dispatchWorkorderGroup) {
      assert.equal(typeof dispatchWorkorderGroup.canonical_domain_id, 'string');
      assert.equal(dispatchWorkorderGroup.canonical_domain_id.includes('-'), true);
      assert.equal(dispatchWorkorderGroup.owner, dispatchWorkorderGroup.canonical_domain_id);
      assert.equal(typeof dispatchWorkorderGroup.stage_id, 'string');
      assert.equal(dispatchWorkorderGroup.workorder_count > 0, true);
      assert.equal(dispatchWorkorderGroup.stage_attempt_count > 0, true);
      assert.equal(dispatchWorkorderGroup.payload_owner, 'domain_repository_or_app_live_operator');
      assert.equal(dispatchWorkorderGroup.route_requires_domain_or_app_payload, true);
      assert.equal(dispatchWorkorderGroup.can_execute_domain_action, false);
      assert.equal(dispatchWorkorderGroup.can_create_owner_receipt, false);
      assert.equal(dispatchWorkorderGroup.can_close_domain_ready, false);
      assert.equal(dispatchWorkorderGroup.can_claim_production_ready, false);
      assert.equal(dispatchWorkorderGroup.worklist_item_is_completion_claim, false);
      assert.equal(dispatchWorkorderGroup.sample_stage_attempt_ids.length <= 3, true);
      assert.equal(dispatchWorkorderGroup.stage_attempt_id_omitted_count >= 0, true);
      assert.equal(dispatchWorkorderGroup.sample_action_refs.length <= 3, true);
      assert.equal(dispatchWorkorderGroup.action_ref_omitted_count >= 0, true);
      assert.equal(dispatchWorkorderGroup.sample_required_evidence_refs.length <= 3, true);
      assert.equal(dispatchWorkorderGroup.required_evidence_ref_omitted_count >= 0, true);
      assert.equal(
        'required_evidence_refs' in dispatchWorkorderGroup,
        false,
      );
      assert.equal(dispatchWorkorderGroup.required_operator_payload_refs.includes('domain_receipt_refs'), true);
      assert.equal(dispatchWorkorderGroup.required_operator_payload_refs.includes('typed_blocker_refs'), true);
      assert.equal(dispatchWorkorderGroup.required_operator_payload_refs.includes('owner_chain_refs'), true);
      assert.equal(dispatchWorkorderGroup.required_operator_payload_refs.includes('no_regression_refs'), true);
    }
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .domain_dispatch_evidence_workorder_attention_items.length,
      Math.min(dispatchWorkorderSummary.workorder_count, 10),
    );
    const dispatchWorkorder =
      summaryDrilldown.attention_first_payload.evidence_after_contract
        .domain_dispatch_evidence_workorder_attention_items[0];
    if (dispatchWorkorder) {
      assert.equal(dispatchWorkorder.action_kind, 'domain_dispatch_evidence_receipt_record');
      assert.equal(dispatchWorkorder.route_domain_id, dispatchWorkorder.domain_id);
      assert.equal(typeof dispatchWorkorder.canonical_domain_id, 'string');
      assert.equal(dispatchWorkorder.canonical_domain_id.includes('-'), true);
      assert.equal(dispatchWorkorder.owner, dispatchWorkorder.canonical_domain_id);
      assert.equal(
        dispatchWorkorder.domain_id_policy,
        'domain_id_is_route_domain_id_for_action_execution_canonical_domain_id_is_owner_facing_semantics',
      );
      assert.equal(dispatchWorkorder.payload_owner, 'domain_repository_or_app_live_operator');
      assert.equal(dispatchWorkorder.route_requires_domain_or_app_payload, true);
      assert.equal(dispatchWorkorder.can_execute, false);
      assert.equal(dispatchWorkorder.creates_domain_action, false);
      assert.equal(dispatchWorkorder.creates_owner_receipt, false);
      assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('domain_receipt_refs'), true);
      assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('typed_blocker_refs'), true);
      assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('owner_chain_refs'), true);
      assert.equal(dispatchWorkorder.required_operator_payload_refs.includes('no_regression_refs'), true);
      assert.equal(dispatchWorkorder.worklist_item_is_completion_claim, false);
    }
    const topDispatchOwner = dispatchWorkorderGroup?.canonical_domain_id
      ?? dispatchWorkorder?.canonical_domain_id
      ?? 'domain_repository_or_app_live_operator';
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.evidence_envelope_attention_count,
      summaryDrilldown.summary.evidence_envelope_open_count
        + summaryDrilldown.summary.evidence_envelope_blocked_count,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.owner_payload_group_attention_policy,
      'top_owner_payload_groups_by_open_then_blocked_counts_refs_only',
    );
    assertOmaProductionConsumptionAttention(summaryDrilldown, metaAgentBound);
    assertAppReleaseUserPathAttention(summaryDrilldown);
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.owner_payload_groups.length <= 5,
      true,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.owner_payload_group_attention_count,
      summaryDrilldown.attention_first_payload.evidence_after_contract.owner_payload_groups.length
        + summaryDrilldown.attention_first_payload.evidence_after_contract
          .owner_payload_group_attention_omitted_count,
    );
    const firstOwnerPayloadGroup =
      summaryDrilldown.attention_first_payload.evidence_after_contract.owner_payload_groups[0];
    assert.equal(firstOwnerPayloadGroup.full_detail_section, 'evidence_envelope');
    assert.equal(firstOwnerPayloadGroup.attention_count > 0, true);
    assert.equal(firstOwnerPayloadGroup.authority_boundary.can_create_owner_receipt, false);
    assert.equal(firstOwnerPayloadGroup.authority_boundary.can_claim_production_ready, false);
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.route_support_status,
      'catalog_available_refs_only',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.next_evidence_owner,
      'domain_repository_or_app_live_operator',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.authority_boundary.route_support_closes_owner_chain,
      false,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_after_contract.authority_boundary.attention_count_is_hard_blocker,
      false,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_next_steps.surface_kind,
      'opl_app_drilldown_evidence_next_steps',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_next_steps.selection_policy,
      'balanced_first_item_per_step_kind_then_original_order_refs_only',
    );
    const expectedNextOwner = topDispatchOwner === 'domain_repository_or_app_live_operator'
      ? firstOwnerPayloadGroup.owner
      : topDispatchOwner;
    assert.equal(summaryDrilldown.attention_first_payload.evidence_next_steps.next_owner, expectedNextOwner);
    assert.equal(summaryDrilldown.attention_first_payload.evidence_next_steps.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_next_steps.can_execute_domain_action,
      false,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_next_steps.can_create_owner_receipt,
      false,
    );
    assertOmaProductionConsumptionNextStep(summaryDrilldown, metaAgentBound);
    assertAppReleaseUserPathNextStep(summaryDrilldown);
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_next_steps.items.some(
        (item: { step_kind: string }) => item.step_kind === 'evidence_envelope_scaleout',
      ),
      true,
    );
    assert.equal(
      new Set(summaryDrilldown.attention_first_payload.evidence_next_steps.items.map(
        (item: { step_kind: string }) => item.step_kind,
      )).size > 1,
      true,
    );
    const ownerPayloadStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'owner_payload_group_scaleout',
    );
    assert.equal(typeof ownerPayloadStep.owner, 'string');
    assert.equal(ownerPayloadStep.full_detail_section, 'evidence_envelope');
    assert.equal(ownerPayloadStep.can_create_owner_receipt, false);
    assert.equal(ownerPayloadStep.can_close_domain_ready, false);
    const dispatchStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'domain_dispatch_owner_chain_scaleout',
    );
    if (dispatchStep) {
      assert.equal(dispatchStep.owner, topDispatchOwner);
      assert.equal(dispatchStep.payload_owner, 'domain_repository_or_app_live_operator');
      assert.equal(dispatchStep.route_support_closes_owner_chain, false);
    }
    const dispatchWorkorderStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'domain_dispatch_evidence_workorder',
    );
    const dispatchWorkorderGroupStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'domain_dispatch_evidence_group_workorder',
    );
    assert.equal(Boolean(dispatchWorkorderGroupStep), dispatchWorkorderGroups.length > 0);
    if (dispatchWorkorderGroupStep) {
      assert.equal(typeof dispatchWorkorderGroupStep.canonical_domain_id, 'string');
      assert.equal(dispatchWorkorderGroupStep.canonical_domain_id.includes('-'), true);
      assert.equal(dispatchWorkorderGroupStep.owner, dispatchWorkorderGroupStep.canonical_domain_id);
      assert.equal(
        dispatchWorkorderGroupStep.payload_owner,
        'domain_repository_or_app_live_operator',
      );
      assert.equal(typeof dispatchWorkorderGroupStep.stage_id, 'string');
      assert.equal(dispatchWorkorderGroupStep.workorder_count > 0, true);
      assert.equal(dispatchWorkorderGroupStep.stage_attempt_count > 0, true);
      assert.equal(dispatchWorkorderGroupStep.sample_stage_attempt_ids.length <= 3, true);
      assert.equal(dispatchWorkorderGroupStep.stage_attempt_id_omitted_count >= 0, true);
      assert.equal(dispatchWorkorderGroupStep.sample_action_refs.length <= 3, true);
      assert.equal(dispatchWorkorderGroupStep.action_ref_omitted_count >= 0, true);
      assert.equal(dispatchWorkorderGroupStep.record_action_id_omitted_count >= 0, true);
      assert.equal(dispatchWorkorderGroupStep.record_command_ref_omitted_count >= 0, true);
      assertDomainDispatchGroupExecutorHints(dispatchWorkorderGroupStep);
      assert.equal(dispatchWorkorderGroupStep.sample_required_evidence_refs.length <= 3, true);
      assert.equal(dispatchWorkorderGroupStep.required_evidence_ref_omitted_count >= 0, true);
      assert.equal(
        'required_evidence_refs' in dispatchWorkorderGroupStep,
        false,
      );
      assert.equal(dispatchWorkorderGroupStep.can_create_owner_receipt, false);
      assert.equal(dispatchWorkorderGroupStep.can_close_domain_ready, false);
      assert.equal(dispatchWorkorderGroupStep.can_claim_production_ready, false);
      assert.equal(
        dispatchWorkorderGroupStep.required_operator_payload_refs.includes('domain_receipt_refs'),
        true,
      );
      assert.equal(
        dispatchWorkorderGroupStep.required_operator_payload_refs.includes('typed_blocker_refs'),
        true,
      );
      assert.equal(
        dispatchWorkorderGroupStep.payload_path_policy,
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      );
      assert.equal(
        dispatchWorkorderGroupStep.accepted_payload_paths.success_refs_path
          .typed_blocker_refs_must_be_absent,
        true,
      );
      assert.equal(
        dispatchWorkorderGroupStep.accepted_payload_paths.typed_blocker_path.success_claimed,
        false,
      );
      assert.equal(
        dispatchWorkorderGroupStep.payload_preflight_policy,
        'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
      );
      assert.equal(
        dispatchWorkorderGroupStep.payload_preflight_blocked_error_kind,
        'domain_dispatch_evidence_payload_preflight_blocked',
      );
      assert.equal(
        dispatchWorkorderGroupStep.required_return_shapes.includes('domain_owner_receipt_ref'),
        true,
      );
    }
    if (dispatchWorkorderStep) {
      assert.equal(dispatchWorkorderStep.route_domain_id, dispatchWorkorderStep.domain_id);
      assert.equal(typeof dispatchWorkorderStep.canonical_domain_id, 'string');
      assert.equal(dispatchWorkorderStep.canonical_domain_id.includes('-'), true);
      assert.equal(dispatchWorkorderStep.owner, dispatchWorkorderStep.canonical_domain_id);
      assert.equal(dispatchWorkorderStep.payload_owner, 'domain_repository_or_app_live_operator');
      assert.equal(
        dispatchWorkorderStep.domain_id_policy,
        'domain_id_is_route_domain_id_for_action_execution_canonical_domain_id_is_owner_facing_semantics',
      );
      assert.equal(dispatchWorkorderStep.route_requires_domain_or_app_payload, true);
      assert.equal(dispatchWorkorderStep.can_create_owner_receipt, false);
      assert.equal(dispatchWorkorderStep.can_close_domain_ready, false);
      assert.equal(dispatchWorkorderStep.can_claim_production_ready, false);
      assert.equal(dispatchWorkorderStep.required_operator_payload_refs.includes('domain_receipt_refs'), true);
      assert.equal(dispatchWorkorderStep.required_operator_payload_refs.includes('typed_blocker_refs'), true);
      assert.equal(
        dispatchWorkorderStep.accepted_payload_paths.typed_blocker_path.success_claimed,
        false,
      );
      assert.equal(
        dispatchWorkorderStep.payload_preflight_blocked_error_kind,
        'domain_dispatch_evidence_payload_preflight_blocked',
      );
      assert.equal(
        dispatchWorkorderStep.required_return_shapes.includes('domain_owner_receipt_ref'),
        true,
      );
      assert.equal(dispatchWorkorderStep.full_detail_section, 'domain_dispatch_evidence');
    }
    const stageMissingStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'stage_missing_evidence_followthrough',
    );
    assert.equal(Boolean(stageMissingStep), true);
    assert.equal(stageMissingStep.owner, stageMissingStep.owner.toLowerCase());
    assert.equal(stageMissingStep.owner.includes('-'), true);
    assert.equal(
      stageMissingStep.owner_id_policy,
      'canonical_owner_id_source_owner_id_for_diagnostics_only',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.evidence_next_steps.items.length <= 5,
      true,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.missing_evidence.items.length <= 5,
      true,
    );
    const firstMissingEvidence = summaryDrilldown.attention_first_payload.missing_evidence.items[0];
    assert.equal(
      summaryDrilldown.attention_first_payload.missing_evidence.items.every(
        (item: { owner: string }) => item.owner === item.owner.toLowerCase(),
      ),
      true,
    );
    assert.equal(typeof firstMissingEvidence.owner, 'string');
    assert.equal(firstMissingEvidence.owner.includes('-'), true);
    assert.equal(
      firstMissingEvidence.owner_id_policy,
      'canonical_owner_id_source_owner_id_for_diagnostics_only',
    );
    assert.equal(firstMissingEvidence.next_safe_action_id, 'stage-production-evidence:medautoscience:write_0:record');
    assert.equal(
      firstMissingEvidence.payload_requirement,
      'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_source_scope_runtime_event_or_monitor_freshness',
    );
    assert.equal(firstMissingEvidence.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(firstMissingEvidence.route_requires_domain_or_app_payload, true);
    assert.deepEqual(firstMissingEvidence.required_operator_payload_refs, [
      'domain_receipt_refs',
      'evidence_refs',
      'typed_blocker_refs',
      'source_scope_refs',
      'runtime_event_refs',
    ]);
    assert.equal(
      firstMissingEvidence.payload_workorder.surface_kind,
      'opl_stage_production_evidence_payload_workorder',
    );
    assert.equal(
      firstMissingEvidence.payload_workorder.typed_blocker_path.accepted,
      true,
    );
    assert.equal(typeof summaryDrilldown.attention_first_payload.next_safe_action.action_id, 'string');
    assert.equal(summaryDrilldown.attention_first_payload.next_safe_action.action_id.length > 0, true);
    assert.equal(
      summaryDrilldown.attention_first_payload.next_safe_action.action_id,
      'stage-production-evidence:medautoscience:write_0:record',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.next_safe_action.route_requires_domain_or_app_payload,
      true,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.next_safe_action.submit_via,
      'opl runtime action execute',
    );
    assert.deepEqual(
      summaryDrilldown.attention_first_payload.next_safe_action.submit_args.slice(0, 4),
      ['runtime', 'action', 'execute', '--action'],
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.provider_health.health_status,
      'attention_required',
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.lazy_load_targets.some(
        (target: { section: string; detail_args: string[] }) =>
          target.section === 'operator_action_routing_refs'
          && target.detail_args.join(' ') === '--detail full',
      ),
      true,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.lazy_load_targets.some(
        (target: { section: string; detail_args: string[] }) =>
          target.section === 'standard_agent_template_consumption_refs'
          && target.detail_args.join(' ') === '--detail full',
      ),
      true,
    );
    assert.equal(
      summaryDrilldown.attention_first_payload.lazy_load_targets.some(
        (target: { section: string; detail_args: string[] }) =>
          target.section === 'functional_privatization_audit_refs'
          && target.detail_args.join(' ') === '--detail full',
      ),
      true,
    );

    const aionConsumption = buildOplAionRuntimeConsumptionContract();
    assert.deepEqual(aionConsumption.default_read_model_command, ['runtime', 'app-operator-drilldown']);
    assert.equal(aionConsumption.default_payload_ref, '/app_operator_drilldown/attention_first_payload');
    assert.deepEqual(aionConsumption.full_detail_command, [
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ]);
    assert.equal(
      aionConsumption.action_submission.surface,
      summaryDrilldown.attention_first_payload.next_safe_action.submit_via,
    );
    assert.equal(aionConsumption.authority_boundary.can_write_domain_truth, false);

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const fullDrilldown = fullOutput.app_operator_drilldown;
    assert.equal(fullDrilldown.detail_level, 'full');
    assert.equal(
      fullDrilldown.evidence_envelope.summary.owner_payload_breakdown_policy,
      'refs_only_owner_and_payload_kind_action_breakdown_for_domain_or_app_live_operator_scaleout',
    );
    assert.equal(
      fullDrilldown.evidence_envelope.summary.owner_payload_breakdown
        .reduce((total: number, entry: { envelope_count: number }) => total + entry.envelope_count, 0),
      fullDrilldown.evidence_envelope.summary.envelope_count,
    );
    assert.equal(
      fullDrilldown.evidence_envelope.summary.owner_payload_breakdown
        .reduce((total: number, entry: { open_envelope_count: number }) => total + entry.open_envelope_count, 0),
      fullDrilldown.evidence_envelope.summary.open_envelope_count,
    );
    assert.equal(
      fullDrilldown.evidence_envelope.summary.owner_payload_breakdown
        .reduce((total: number, entry: { blocked_envelope_count: number }) => (
          total + entry.blocked_envelope_count
        ), 0),
      fullDrilldown.evidence_envelope.summary.blocked_envelope_count,
    );
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract.surface_kind,
      'opl_app_drilldown_evidence_after_contract_attention',
    );
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract.domain_dispatch_attention_count,
      fullDrilldown.summary.domain_dispatch_attention_count,
    );
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract
        .domain_dispatch_evidence_workorder_packet_summary.workorder_count,
      fullDrilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
    );
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract
        .domain_dispatch_evidence_workorder_attention_items.length,
      Math.min(
        fullDrilldown.attention_first_payload.evidence_after_contract
          .domain_dispatch_evidence_workorder_packet_summary.workorder_count,
        10,
      ),
    );
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract.owner_payload_groups.length > 0,
      true,
    );
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract.owner_payload_groups[0]
        .full_detail_section,
      'evidence_envelope',
    );
    assert.equal(
      fullDrilldown.attention_first_payload.evidence_after_contract.authority_boundary.attention_count_is_hard_blocker,
      false,
    );
    assert.deepEqual(fullDrilldown.attention_first_payload.full_detail_args, []);
    assert.equal(fullDrilldown.opl_meta_agent_workbench_refs.status, metaAgentBound ? 'resolved' : 'not_bound');
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.surface_kind,
      'opl_standard_agent_template_consumption_read_model',
    );
    assert.deepEqual(
      fullDrilldown.standard_agent_template_consumption_refs.proof_command,
      ['agents', 'scaffold', '--consumption-evidence'],
    );
    assert.deepEqual(
      fullDrilldown.standard_agent_template_consumption_refs.default_consumption_sample_domain_ids,
      ['award-foundry', 'thesis-foundry', 'review-foundry'],
    );
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.summary.default_consumption_sample_count,
      3,
    );
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.summary.repeat_consumption_supported,
      true,
    );
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.authority_boundary.can_claim_domain_ready,
      false,
    );
    assert.equal(
      fullDrilldown.standard_agent_template_consumption_refs.summary.production_ready_claim_count,
      0,
    );
    assert.equal(
      fullDrilldown.opl_meta_agent_workbench_refs.authority_boundary.can_promote_default_agent_without_gate,
      false,
    );
    if (metaAgentBound) {
      assert.equal(
        fullDrilldown.opl_meta_agent_workbench_refs.summary.evidence_after_contract_status,
        'target_owner_receipt_or_typed_blocker_refs_projected',
      );
      assertOmaProductionConsumptionFullDetail(fullDrilldown);
      assert.equal(
        fullDrilldown.opl_meta_agent_workbench_refs.summary.scaleout_owner_receipt_or_typed_blocker_target_count,
        2,
      );
      assert.equal(fullDrilldown.opl_meta_agent_workbench_refs.summary.scaleout_agent_lab_result_target_count, 2);
      assert.equal(
        fullDrilldown.opl_meta_agent_workbench_refs.summary.scaleout_no_forbidden_write_target_count,
        2,
      );
      assert.equal(fullDrilldown.opl_meta_agent_workbench_refs.summary.scaleout_cleanup_closeout_target_count, 2);
      assert.equal(fullDrilldown.opl_meta_agent_workbench_refs.summary.scaleout_domain_ready_claim_count, 0);
      assert.equal(fullDrilldown.opl_meta_agent_workbench_refs.summary.scaleout_default_promotion_claim_count, 0);
      assert.equal(fullDrilldown.oma_sections.mechanism_proposal.refs.length > 0, true);
      assert.equal(fullDrilldown.oma_sections.patch_loop_closeout.refs.length >= 11, true);
      assert.deepEqual(
        fullDrilldown.oma_sections.patch_loop_closeout.required_ref_fields,
        [
          'blocked_suite_result_ref',
          'developer_patch_work_order_ref',
          'patch_traceability_matrix_ref',
          'failure_evidence_refs',
          'root_cause_refs',
          'targeted_fix_refs',
          'predicted_impact_refs',
          'next_run_falsification_refs',
          'target_repo_verification_refs',
          'target_runtime_read_model_consumption_ref',
          'workspace_environment_proof_ref',
          'no_forbidden_write_proof_ref',
          'target_owner_receipt_or_typed_blocker_ref',
          'patch_absorption_ref',
          'worktree_cleanup_ref',
          'agent_lab_re_evaluation_ref',
        ],
      );
      assert.deepEqual(
        fullDrilldown.oma_sections.patch_loop_closeout.ahe_patch_loop_ref_fields,
        [
          'failure_evidence_refs',
          'root_cause_refs',
          'targeted_fix_refs',
          'predicted_impact_refs',
          'next_run_falsification_refs',
        ],
      );
      for (const target of fullDrilldown.oma_sections.patch_loop_closeout.targets) {
        assert.equal(Array.isArray(target.refs.failure_evidence_refs), true);
        assert.equal(Array.isArray(target.refs.root_cause_refs), true);
        assert.equal(Array.isArray(target.refs.targeted_fix_refs), true);
        assert.equal(Array.isArray(target.refs.predicted_impact_refs), true);
        assert.equal(Array.isArray(target.refs.next_run_falsification_refs), true);
      }
      assert.equal(
        fullDrilldown.oma_sections.self_evolution_cockpit.surface_kind,
        'opl_meta_agent_self_evolution_cockpit_read_model',
      );
      assert.deepEqual(
        fullDrilldown.oma_sections.self_evolution_cockpit.operator_questions,
        [
          'failure_evidence',
          'root_cause',
          'targeted_fix',
          'predicted_impact',
          'next_run_falsification',
          'owner_receipt_or_typed_blocker',
        ],
      );
      assert.equal(fullDrilldown.oma_sections.self_evolution_cockpit.targets.length, 2);
      for (const target of fullDrilldown.oma_sections.self_evolution_cockpit.targets) {
        assert.equal(target.six_question_ready, true);
        assert.equal(Array.isArray(target.failure_evidence_refs), true);
        assert.equal(Array.isArray(target.root_cause_refs), true);
        assert.equal(Array.isArray(target.targeted_fix_refs), true);
        assert.equal(Array.isArray(target.predicted_impact_refs), true);
        assert.equal(Array.isArray(target.next_run_falsification_refs), true);
        assert.equal(typeof target.owner_receipt_or_typed_blocker_ref, 'string');
      }
      assert.equal(
        fullDrilldown.oma_sections.patch_loop_closeout.authority_boundary.can_write_target_domain_truth,
        false,
      );
      assert.equal(
        fullDrilldown.oma_sections.self_evolution_cockpit.authority_boundary.can_write_target_domain_truth,
        false,
      );
    }
    assert.equal(fullDrilldown.route_graph_refs.refs.length, 12);
    assert.equal(
      fullDrilldown.functional_privatization_audit_refs.surface_kind,
      'opl_app_drilldown_functional_privatization_audit_refs',
    );
    assert.equal(fullDrilldown.functional_privatization_audit_refs.domains.length, 1);
    assert.equal(
      fullDrilldown.functional_privatization_audit_refs.domains[0].domain_id,
      'medautoscience',
    );
    assert.equal(
      fullDrilldown.functional_privatization_audit_refs.domains[0]
        .private_platform_residue_inventory.length,
      fullDrilldown.functional_privatization_audit_refs.domains[0].summary
        .private_platform_residue_inventory_count,
    );
    assert.equal(
      fullDrilldown.functional_privatization_audit_refs.domains[0].authority_boundary
        .can_write_domain_truth,
      false,
    );
    assert.equal(
      fullDrilldown.functional_privatization_audit_refs.summary.private_platform_residue_inventory_count,
      summaryDrilldown.summary.functional_privatization_private_platform_residue_inventory_count,
    );
    assert.equal(
      summaryDrilldown.summary.functional_privatization_hidden_cleared_count,
      fullDrilldown.functional_privatization_audit_summary.default_hidden_cleared_count,
    );
    assert.equal(summaryDrilldown.summary.functional_privatization_action_required_count, 0);
    assert.equal(
      fullDrilldown.functional_privatization_audit_refs.authority_boundary.can_write_memory_body,
      false,
    );
    assert.equal(fullDrilldown.domain_dispatch_evidence.attempts.length, 12);
    assert.equal(fullDrilldown.stage_production_evidence.stages.length, 12);
    assert.equal(
      fullDrilldown.operator_action_routing_refs.refs.filter(
        (route: { action_kind: string }) => route.action_kind === 'stage_production_attempt_request',
      ).length,
      summaryDrilldown.summary.stage_production_attempt_request_route_count,
    );
    assert.equal(
      fullDrilldown.production_evidence_tail_ledger.tail_items.length,
      summaryDrilldown.summary.app_operator_production_evidence_tail_item_count,
    );
    assert.equal(summaryDrilldown.summary.app_operator_production_evidence_tail_open_item_count > 0, true);
    assert.deepEqual(
      Object.keys(summaryDrilldown.summary).filter((key) => key.startsWith('production_evidence_tail_')),
      [],
    );
    assert.equal(Object.hasOwn(summaryDrilldown.summary, 'deprecated_alias_metadata'), false);
    assert.equal(
      summaryDrilldown.summary.provider_slo_cadence_window_status,
      summaryDrilldown.summary.provider_cadence_window_status,
    );
    assert.equal(
      summaryDrilldown.summary.provider_slo_capability_status,
      summaryDrilldown.summary.provider_capability_slo_status,
    );
    assert.equal(
      fullDrilldown.operator_action_routing_refs.refs.length,
      summaryDrilldown.summary.operator_action_route_count,
    );
    assert.equal(fullDrilldown.route_graph_refs.omitted_ref_count, 0);
    assert.equal(fullDrilldown.domain_dispatch_evidence.omitted_ref_count, 0);
    assert.equal(fullDrilldown.stage_production_evidence.omitted_ref_count, 0);
    assert.equal(fullDrilldown.operator_action_routing_refs.omitted_ref_count, 0);
    assert.equal(fullDrilldown.production_evidence_tail_ledger.omitted_ref_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime tray summary can use a non-authoritative manifest projection cache when live manifest is slow', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-cache-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const manifest = buildManyStageManifest(2);
  const manifestPath = path.join(stateRoot, 'manifest.json');
  const slowCommandPath = path.join(stateRoot, 'slow-manifest.cjs');

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    fs.writeFileSync(
      slowCommandPath,
      `const fs = require('node:fs');\n`
        + `setTimeout(() => process.stdout.write(fs.readFileSync(${JSON.stringify(manifestPath)}, 'utf8')), 11000);\n`,
      'utf8',
    );
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      `${process.execPath} ${slowCommandPath}`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli(['domain', 'manifests'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DOMAIN_MANIFEST_COMMAND_TIMEOUT_MS: '15000',
    });

    const previousStateDir = process.env.OPL_STATE_DIR;
    const previousContractsDir = process.env.OPL_CONTRACTS_DIR;
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_CONTRACTS_DIR = fixtureContractsRoot;
    try {
      const snapshot = await buildRuntimeTraySnapshot(loadFrameworkContracts(), {
        appOperatorDrilldownDetailLevel: 'summary',
      });
      const tray = snapshot.runtime_tray_snapshot;
      assert.equal(tray.app_operator_drilldown.summary.stage_production_evidence_stage_count, 2);
      assert.equal(tray.domain_manifest_projection_cache.summary.cache_used_count, 1);
      assert.deepEqual(tray.domain_manifest_projection_cache.summary.live_failed_project_ids, ['medautoscience']);
      assert.equal(
        tray.domain_manifest_projection_cache.authority_boundary.cache_is_domain_truth,
        false,
      );
      assert.equal(
        tray.domain_manifest_projection_cache.authority_boundary.live_manifest_refresh_required_for_production_closeout,
        true,
      );
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPL_STATE_DIR;
      } else {
        process.env.OPL_STATE_DIR = previousStateDir;
      }
      if (previousContractsDir === undefined) {
        delete process.env.OPL_CONTRACTS_DIR;
      } else {
        process.env.OPL_CONTRACTS_DIR = previousContractsDir;
      }
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
