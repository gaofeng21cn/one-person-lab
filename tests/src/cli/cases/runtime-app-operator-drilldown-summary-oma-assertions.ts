import { assert } from '../helpers.ts';

export function assertOmaProductionConsumptionSummary(summaryDrilldown: any, metaAgentBound: boolean) {
  assert.equal(
    summaryDrilldown.summary.opl_meta_agent_production_consumption_gate_count,
    4,
  );
  assert.equal(
    summaryDrilldown.summary.opl_meta_agent_production_consumption_followthrough_open_gate_count,
    metaAgentBound ? 3 : 0,
  );
  assert.equal(summaryDrilldown.summary.opl_meta_agent_production_consumption_ready, false);
}

export function assertOmaAppWorkbenchSectionSummary(summaryDrilldown: any, metaAgentBound: boolean) {
  const appWorkbenchSectionIds = metaAgentBound
    ? Object.keys(summaryDrilldown.oma_sections).filter((sectionId) =>
        !['patch_loop_closeout', 'self_evolution_cockpit'].includes(sectionId)
      )
    : [];
  assert.equal(
    summaryDrilldown.summary.opl_meta_agent_app_workbench_section_count,
    appWorkbenchSectionIds.length,
  );
  if (!metaAgentBound) {
    return;
  }
  assert.equal(
    summaryDrilldown.oma_sections.trajectory_learning.surface_kind,
    'opl_meta_agent_trajectory_learning_app_workbench_section',
  );
  assert.equal(
    summaryDrilldown.oma_sections.trajectory_learning.authority_boundary
      .can_promote_default_agent_without_gate,
    false,
  );
}

export function assertOmaProductionConsumptionAttention(summaryDrilldown: any, metaAgentBound: boolean) {
  const omaProductionConsumption =
    summaryDrilldown.attention_first_payload.evidence_after_contract
      .oma_production_consumption_followthrough;
  assert.equal(
    omaProductionConsumption.surface_kind,
    'opl_app_drilldown_oma_production_consumption_followthrough_attention',
  );
  assert.equal(omaProductionConsumption.target_agent, 'opl-meta-agent');
  assert.equal(omaProductionConsumption.target_repo, 'opl-meta-agent');
  assert.equal(omaProductionConsumption.structural_consumption_ready, metaAgentBound);
  assert.equal(omaProductionConsumption.production_consumption_ready, false);
  assert.equal(omaProductionConsumption.open_gate_count, metaAgentBound ? 3 : 0);
  if (metaAgentBound) {
    assert.deepEqual(omaProductionConsumption.open_gate_ids, [
      'managed_install_update_refs',
      'app_live_path_refs',
      'long_soak_refs',
    ]);
    assert.equal(omaProductionConsumption.gate_items.length, 3);
    const managedGate = omaProductionConsumption.gate_items.find(
      (item: { gate_id: string }) => item.gate_id === 'managed_install_update_refs',
    );
    assert.equal(typeof managedGate.status, 'string');
    assert.equal(typeof managedGate.manual_required, 'boolean');
    assert.equal(Array.isArray(managedGate.manual_required_blockers), true);
    assert.equal(managedGate.next_safe_action.can_write_domain_truth, false);
    assert.equal(managedGate.next_safe_action.can_claim_production_ready, false);
    assert.equal(
      omaProductionConsumption.gate_items.find(
        (item: { gate_id: string }) => item.gate_id === 'app_live_path_refs',
      ).current_contract_status,
      'not_claimed_by_contract',
    );
    assert.equal(
      omaProductionConsumption.gate_items.some(
        (item: { gate_id: string }) =>
          item.gate_id === 'owner_receipt_or_typed_blocker_scaleout_refs',
      ),
      false,
    );
  }
  assert.equal(omaProductionConsumption.authority_boundary.can_create_owner_receipt, false);
  assert.equal(omaProductionConsumption.authority_boundary.can_claim_production_ready, false);
  assert.equal(
    omaProductionConsumption.authority_boundary.can_promote_default_agent_without_gate,
    false,
  );
}

export function assertOmaProductionConsumptionNextStep(summaryDrilldown: any, metaAgentBound: boolean) {
  assert.equal(
    summaryDrilldown.attention_first_payload.evidence_next_steps.items.some(
      (item: { step_kind: string }) => item.step_kind === 'oma_production_consumption_followthrough',
    ),
    metaAgentBound,
  );
  const omaProductionConsumptionStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
    (item: { step_kind: string }) => item.step_kind === 'oma_production_consumption_followthrough',
  );
  if (!metaAgentBound) {
    return;
  }
  assert.equal(omaProductionConsumptionStep.owner, 'one-person-lab');
  assert.equal(omaProductionConsumptionStep.target_agent, 'opl-meta-agent');
  assert.equal(omaProductionConsumptionStep.open_gate_count, 3);
  assert.deepEqual(omaProductionConsumptionStep.open_gate_ids, [
    'managed_install_update_refs',
    'app_live_path_refs',
    'long_soak_refs',
  ]);
  const managedGateStep = omaProductionConsumptionStep.required_refs_by_gate.find(
    (item: { gate_id: string }) => item.gate_id === 'managed_install_update_refs',
  );
  assert.equal(typeof managedGateStep.manual_required, 'boolean');
  assert.equal(Array.isArray(managedGateStep.manual_required_blockers), true);
  assert.equal(managedGateStep.next_safe_action.can_create_owner_receipt, false);
  assert.equal(
    omaProductionConsumptionStep.required_return_shapes.includes('long_soak_receipt_ref'),
    true,
  );
  assert.deepEqual(
    omaProductionConsumptionStep.copyable_runtime_action_execute_commands.record_with_payload,
    [
      'runtime',
      'action',
      'execute',
      '--action',
      'oma_production_consumption:opl-meta-agent:record',
      '--payload-file',
      '<payload.json>',
    ],
  );
  assert.equal(
    omaProductionConsumptionStep.payload_workorder.surface_kind,
    'opl_oma_production_consumption_payload_workorder',
  );
  assert.equal(
    omaProductionConsumptionStep.payload_workorder.accepted_payload_path_policy,
    'real_long_soak_refs_or_typed_blocker_path_empty_template_blocks',
  );
  assert.deepEqual(
    omaProductionConsumptionStep.payload_workorder.required_operator_payload_refs,
    [
      'long_soak_refs',
      'typed_blocker_refs',
      'operator_evidence_refs',
    ],
  );
  assert.equal(
    omaProductionConsumptionStep.payload_workorder.authority_boundary.can_claim_production_ready,
    false,
  );
  assert.deepEqual(
    omaProductionConsumptionStep.payload_workorder.long_soak_observation_workorder_commands.start,
    [
      'runtime',
      'oma-production-consumption',
      'long-soak',
      'start',
      '--minimum-duration-minutes',
      '<n>',
      '--evidence-dir',
      '<path>',
    ],
  );
  assert.equal(
    omaProductionConsumptionStep.payload_workorder.long_soak_observation_workorder_policy,
    'start_finish_materializes_local_manifest_and_payload_only_record_verify_remain_required',
  );
  assert.equal(omaProductionConsumptionStep.can_create_owner_receipt, false);
  assert.equal(omaProductionConsumptionStep.can_claim_production_ready, false);
  assert.equal(omaProductionConsumptionStep.can_promote_default_agent_without_gate, false);
}

export function assertOmaProductionConsumptionFullDetail(fullDrilldown: any) {
  const gateItems =
    fullDrilldown.opl_meta_agent_workbench_refs.production_consumption_followthrough.gate_items;
  assert.equal(
    fullDrilldown.opl_meta_agent_workbench_refs.production_consumption_followthrough.surface_kind,
    'opl_meta_agent_production_consumption_followthrough',
  );
  assert.equal(
    fullDrilldown.opl_meta_agent_workbench_refs.production_consumption_followthrough
      .summary.open_gate_count,
    3,
  );
  assert.equal(
    fullDrilldown.opl_meta_agent_workbench_refs.production_consumption_followthrough
      .summary.owner_receipt_or_typed_blocker_seed_target_count,
    2,
  );
  const ownerScaleoutGate = gateItems.find(
    (item: { gate_id: string }) => item.gate_id === 'owner_receipt_or_typed_blocker_scaleout_refs',
  );
  const managedGate = gateItems.find(
    (item: { gate_id: string }) => item.gate_id === 'managed_install_update_refs',
  );
  assert.equal(
    managedGate.managed_install_update_followthrough.surface_kind,
    'opl_meta_agent_managed_install_update_followthrough',
  );
  assert.equal(managedGate.next_safe_action.can_write_domain_truth, false);
  assert.equal(managedGate.next_safe_action.can_claim_production_ready, false);
  assert.equal(ownerScaleoutGate.status, 'refs_observed');
  assert.equal(ownerScaleoutGate.observed_target_count, 2);
  assert.equal(ownerScaleoutGate.target_count, 2);
  assert.equal(
    fullDrilldown.opl_meta_agent_workbench_refs.production_consumption_followthrough
      .summary.production_consumption_ready,
    false,
  );
}

export function assertOmaTrajectoryLearningFullDetail(fullDrilldown: any) {
  assert.equal(fullDrilldown.oma_sections.trajectory_learning.refs.length >= 11, true);
  assert.equal(
    fullDrilldown.oma_sections.trajectory_learning.authority_boundary
      .can_authorize_target_domain_quality_or_export,
    false,
  );
}
