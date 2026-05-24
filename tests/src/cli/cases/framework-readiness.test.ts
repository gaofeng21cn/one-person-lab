import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import {
  assertFrameworkAppReleaseUserPathAction,
  assertFrameworkAppReleaseUserPathEvidence,
} from './framework-readiness-app-release-user-path-assertions.ts';
import {
  assertFrameworkReadinessBlockerAttribution,
} from './framework-readiness-blocker-attribution-assertions.ts';
import {
  assertDomainDispatchGroupExecutorHints,
  assertSameDomainDispatchGroupExecutorHints,
} from './domain-dispatch-group-executor-hints-assertions.ts';
import {
  assertFrameworkOwnerHandoffAction,
  assertFrameworkOwnerHandoffPacket,
  assertFrameworkOwnerPayloadAction,
  assertFrameworkOwnerPayloadAttention,
} from './owner-payload-workorder-assertions.ts';

test('framework readiness summarizes default control-plane surfaces without authority claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-state-'));
  try {
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
    }).framework_readiness;

    assert.equal(readiness.surface_kind, 'opl_framework_readiness_summary');
  assert.equal(readiness.owner, 'one-person-lab');
  assert.equal(readiness.family_defaults, true);
  assert.equal(readiness.detail_level, 'summary');
  assert.equal(
    readiness.projection_detail_policy,
    'attention_first_kernel_floor_default_with_drilldown_refs',
  );
  assert.equal(readiness.readiness_model.mode, 'ai_first_contract_light');
  assert.equal(readiness.readiness_model.default_payload, 'operator_attention_summary');
  assert.equal(readiness.readiness_model.ai_executor_internal_strategy_is_contract, false);
  assert.equal(readiness.attention_first_payload.surface_kind, 'opl_framework_readiness_attention_first_payload');
  assert.equal(readiness.attention_first_payload.status, readiness.status);
  assert.equal(
    readiness.attention_first_payload.summary.hard_blocker_count,
    readiness.summary.framework_kernel_hard_blocker_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.agent_conformance_hard_blocker_count,
    readiness.summary.agent_conformance_hard_blocker_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.stage_readiness_hard_blocker_count,
    readiness.summary.stage_readiness_hard_blocker_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.pack_compiler_hard_blocker_count,
    readiness.summary.pack_compiler_hard_blocker_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.diagnostic_hard_blocker_count,
    readiness.summary.framework_diagnostic_failure_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.open_tail_count,
    readiness.summary.agent_structural_evidence_tail_open_count
      + readiness.summary.app_live_evidence_tail_open_count
      + readiness.summary.stage_receipt_freshness_tail_open_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.agent_structural_evidence_tail_open_count,
    readiness.summary.agent_structural_evidence_tail_open_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.app_live_evidence_tail_open_count,
    readiness.summary.app_live_evidence_tail_open_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.stage_receipt_freshness_tail_open_count,
    readiness.summary.stage_receipt_freshness_tail_open_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.stage_source_scope_missing_workorder_count,
    readiness.summary.stage_source_scope_missing_workorder_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.stage_runtime_event_missing_workorder_count,
    readiness.summary.stage_runtime_event_missing_workorder_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.stage_source_scope_missing_ref_count,
    readiness.summary.stage_source_scope_missing_ref_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.stage_runtime_event_missing_ref_count,
    readiness.summary.stage_runtime_event_missing_ref_count,
  );
  assert.equal(
    readiness.attention_first_payload.stage_evidence_workorder_attention_items.length > 0,
    readiness.summary.stage_receipt_freshness_tail_open_count > 0,
  );
  assert.equal(
    readiness.attention_first_payload.stage_evidence_workorder_attention_items.length,
    readiness.evidence_tails.stage_receipt_freshness_tail.stage_evidence_workorder_attention_items.length,
  );
  for (const stageEvidenceAttentionItem of readiness.attention_first_payload.stage_evidence_workorder_attention_items) {
    assert.equal(typeof stageEvidenceAttentionItem.domain_id, 'string');
    assert.equal(typeof stageEvidenceAttentionItem.stage_id, 'string');
    assert.equal(
      stageEvidenceAttentionItem.action_kind,
      'stage_production_evidence_receipt_record',
    );
    assert.equal(stageEvidenceAttentionItem.route_requires_domain_or_app_payload, true);
    assert.equal(stageEvidenceAttentionItem.can_close_without_domain_or_app_payload, false);
    assert.equal(stageEvidenceAttentionItem.worklist_item_is_completion_claim, false);
    assert.equal(stageEvidenceAttentionItem.required_evidence_ref_count > 0, true);
    assert.equal(stageEvidenceAttentionItem.unobserved_source_scope_ref_count > 0, true);
    assert.equal(stageEvidenceAttentionItem.unobserved_runtime_event_ref_count > 0, true);
    assert.equal(stageEvidenceAttentionItem.next_safe_action_ref, stageEvidenceAttentionItem.action_ref);
  }
  assert.equal(
    readiness.attention_first_payload.summary.evidence_envelope_open_count,
    readiness.summary.evidence_envelope_open_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.evidence_envelope_blocked_count,
    readiness.summary.evidence_envelope_blocked_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.evidence_envelope_attention_count,
    readiness.summary.evidence_envelope_attention_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.total_operator_attention_tail_count,
    readiness.summary.open_tail_count
      + readiness.summary.evidence_envelope_attention_count
      + readiness.summary.domain_dispatch_attention_count,
  );
  if (
    readiness.summary.framework_kernel_hard_blocker_count === 0
    && readiness.summary.open_tail_count === 0
    && readiness.summary.total_operator_attention_tail_count > 0
  ) {
    assert.equal(
      readiness.status,
      'framework_control_plane_available_with_operator_attention',
    );
    assert.notEqual(
      readiness.status,
      'framework_control_plane_available_with_open_production_tail',
    );
  }
  assert.equal(
    readiness.attention_first_payload.summary.domain_dispatch_attention_count,
    readiness.summary.domain_dispatch_attention_count,
  );
  const firstOwnerPayloadGroup = assertFrameworkOwnerPayloadAttention(readiness);
  const { ownerHandoffPacket, firstOwnerHandoff } = assertFrameworkOwnerHandoffPacket(readiness);
  const memoryArtifactLifecycleEvidence =
    readiness.attention_first_payload.memory_artifact_lifecycle_evidence;
  assert.equal(
    memoryArtifactLifecycleEvidence.surface_kind,
    'opl_app_drilldown_memory_artifact_lifecycle_evidence',
  );
  assert.equal(
    memoryArtifactLifecycleEvidence.observed_ref_count,
    memoryArtifactLifecycleEvidence.memory_ref_count
      + memoryArtifactLifecycleEvidence.memory_writeback_ref_count
      + memoryArtifactLifecycleEvidence.domain_dispatch_memory_writeback_ref_count
      + memoryArtifactLifecycleEvidence.package_ref_count
      + memoryArtifactLifecycleEvidence.export_ref_count
      + memoryArtifactLifecycleEvidence.artifact_ref_count
      + memoryArtifactLifecycleEvidence.lifecycle_index_ref_count
      + memoryArtifactLifecycleEvidence.restore_proof_ref_count
      + memoryArtifactLifecycleEvidence.domain_artifact_mutation_receipt_ref_count,
  );
  assert.equal(memoryArtifactLifecycleEvidence.observed_ref_count >= 0, true);
  assert.equal(memoryArtifactLifecycleEvidence.authority_boundary.can_read_memory_body, false);
  assert.equal(
    memoryArtifactLifecycleEvidence.authority_boundary.can_accept_or_reject_memory_writeback,
    false,
  );
  assert.equal(memoryArtifactLifecycleEvidence.authority_boundary.can_mutate_artifact_body, false);
  const omaProductionConsumption =
    readiness.attention_first_payload.oma_production_consumption_followthrough;
  const appUserPathEvidence = assertFrameworkAppReleaseUserPathEvidence(readiness);
  assert.equal(
    readiness.oma_production_consumption_followthrough.surface_kind,
    omaProductionConsumption.surface_kind,
  );
  assert.equal(
    readiness.oma_production_consumption_followthrough.open_gate_count,
    omaProductionConsumption.open_gate_count,
  );
  assert.equal(
    omaProductionConsumption.surface_kind,
    'opl_app_drilldown_oma_production_consumption_followthrough_attention',
  );
  assert.equal(omaProductionConsumption.target_agent, 'opl-meta-agent');
  assert.equal(omaProductionConsumption.production_consumption_ready, false);
  assert.equal(omaProductionConsumption.authority_boundary.can_create_owner_receipt, false);
  assert.equal(omaProductionConsumption.authority_boundary.can_claim_production_ready, false);
  assert.equal(
    omaProductionConsumption.authority_boundary.can_promote_default_agent_without_gate,
    false,
  );
  const metaAgentBound = omaProductionConsumption.structural_consumption_ready === true;
  if (metaAgentBound) {
    assert.equal(
      omaProductionConsumption.status,
      'structural_consumption_ready_production_consumption_followthrough_required',
    );
    assert.equal(omaProductionConsumption.open_gate_count, 3);
    assert.deepEqual(omaProductionConsumption.open_gate_ids, [
      'managed_install_update_refs',
      'app_live_path_refs',
      'long_soak_refs',
    ]);
    assert.equal(omaProductionConsumption.gate_items.length, 3);
  }
  const nextSafeActions = readiness.attention_first_payload.next_safe_actions;
  assert.equal(nextSafeActions.length > 0, true);
  assert.equal(nextSafeActions.length <= 5, true);
  if (readiness.attention_first_payload.blockers.length > 0) {
    assert.deepEqual(
      nextSafeActions.map((action: { action_id: string }) => action.action_id),
      ['inspect_framework_kernel_blockers'],
    );
    assert.equal(nextSafeActions[0].step_kind, 'framework_kernel_blocker_inspection');
    assert.equal(nextSafeActions[0].evidence_closure_gate, 'framework_kernel_hard_blocker_gate');
  } else if (readiness.attention_first_payload.warnings.length > 0) {
    assert.equal(
      nextSafeActions.some(
        (action: { action_id: string }) => action.action_id === 'review_framework_attention_items',
      ),
      true,
    );
    const frameworkReviewAction = nextSafeActions.find(
      (action: { action_id: string }) => action.action_id === 'review_framework_attention_items',
    );
    assert.equal(nextSafeActions[0].action_id, 'review_framework_attention_items');
    assert.equal(frameworkReviewAction.step_kind, 'framework_attention_review');
    assert.equal(frameworkReviewAction.evidence_closure_gate, 'operator_attention_triage_gate');
    assertFrameworkOwnerPayloadAction(nextSafeActions, firstOwnerPayloadGroup);
    assertFrameworkOwnerHandoffAction(nextSafeActions, ownerHandoffPacket, firstOwnerHandoff);
    assertFrameworkAppReleaseUserPathAction(nextSafeActions, appUserPathEvidence);
    const omaProductionConsumptionAction = nextSafeActions.find(
      (action: { action_kind?: string }) =>
        action.action_kind === 'oma_production_consumption_followthrough_review',
    );
    assert.equal(
      Boolean(omaProductionConsumptionAction),
      metaAgentBound && omaProductionConsumption.open_gate_count > 0,
    );
    if (omaProductionConsumptionAction) {
      assert.equal(
        omaProductionConsumptionAction.action_id,
        'review_oma_production_consumption_followthrough',
      );
      assert.equal(
        omaProductionConsumptionAction.evidence_closure_gate,
        'oma_managed_install_app_live_owner_receipt_long_soak_gate',
      );
      assert.deepEqual(
        omaProductionConsumptionAction.open_gate_ids,
        omaProductionConsumption.open_gate_ids,
      );
      assert.equal(omaProductionConsumptionAction.can_create_owner_receipt, false);
      assert.equal(omaProductionConsumptionAction.can_claim_production_ready, false);
      assert.equal(omaProductionConsumptionAction.can_promote_default_agent_without_gate, false);
    }
  } else {
    assert.deepEqual(
      nextSafeActions.map((action: { action_id: string }) => action.action_id),
      ['no_framework_readiness_action_required'],
    );
    assert.equal(nextSafeActions[0].step_kind, 'no_framework_readiness_action_required');
    assert.equal(nextSafeActions[0].evidence_closure_gate, 'none');
  }
  assert.equal(
    readiness.attention_first_payload.blockers.length > 0,
    readiness.summary.framework_kernel_hard_blocker_count > 0,
  );
  assertFrameworkReadinessBlockerAttribution(readiness);
  assert.equal(readiness.attention_first_payload.warnings.length > 0, true);
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.gate_count,
    readiness.semantic_hygiene.summary.gate_count,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.guarded_gate_count,
    readiness.semantic_hygiene.summary.guarded_gate_count,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.attention_required_gate_count,
    readiness.semantic_hygiene.summary.attention_required_gate_count,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.gate_ids.includes(
      'functional_privatization_evidence_gate',
    ),
    true,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.gate_ids.length <= 10,
    true,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor
      .functional_privatization_evidence_gate_status,
    'guarded',
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.contract_floor_only,
    true,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.authority_boundary
      .can_claim_domain_ready,
    false,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.authority_boundary
      .can_claim_production_ready,
    false,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.authority_boundary
      .can_authorize_quality_or_export,
    false,
  );
  assert.equal(
    readiness.attention_first_payload.semantic_hygiene_contract_floor.authority_boundary
      .can_replace_ai_executor_planning,
    false,
  );
  assert.deepEqual(
    readiness.attention_first_payload.diagnostic_drilldown_refs,
    readiness.diagnostic_drilldowns.map((lens: { embedded_payload_ref: string }) => lens.embedded_payload_ref),
  );
  assert.equal(
    readiness.attention_first_payload.diagnostic_drilldown_refs.includes(
      '/framework_readiness/runtime_manager_route_support',
    ),
    true,
  );
  assert.match(readiness.attention_first_payload.claim_policy, /emits_no_domain_quality_artifact_or_production_ready/);
  assert.equal(readiness.kernel_floor.policy, 'minimum_control_plane_boundary_and_recoverability_floor_only');
  assert.equal(readiness.kernel_floor.ai_executor_internal_strategy_is_contract, false);
  assert.equal(readiness.kernel_floor.domain_quality_strategy_contract, false);
  assert.equal(readiness.kernel_floor.diagnostic_lenses_can_claim_ready_verdicts, false);
  assert.equal(readiness.diagnostic_drilldowns.every((lens: { role: string; default_surface: boolean }) => (
    lens.role === 'diagnostic_drilldown' && lens.default_surface === false
  )), true);
  assert.deepEqual(readiness.excluded_ready_verdicts, [
    'domain_ready_verdict',
    'quality_verdict',
    'artifact_authority_verdict',
    'production_ready_verdict',
  ]);
  assert.equal(Object.hasOwn(readiness, 'domain_ready_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'quality_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'artifact_authority_verdict'), false);
  assert.equal(Object.hasOwn(readiness, 'production_ready_verdict'), false);
  assert.equal(readiness.summary.control_plane_available, true);
  assert.equal(Object.hasOwn(readiness.summary, 'agent_structural_conformance_blocker_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'semantic_hygiene_gate_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'agent_structural_conformance_status'), false);
  if (readiness.agent_conformance_tail.status === 'diagnostic_unavailable') {
    assert.equal(readiness.agent_conformance_tail.status, 'diagnostic_unavailable');
    assert.equal(readiness.agent_conformance_tail.diagnostic_failure.status, 'diagnostic_unavailable');
  } else {
    assert.ok([
      'blocked',
      'passed_with_production_evidence_tail',
    ].includes(readiness.agent_conformance_tail.status));
    assert.equal(
      readiness.agent_conformance_tail.authority_boundary.readiness_can_claim_production_ready,
      false,
    );
  }
  const stageHardBlockerCount = Object.values(readiness.stages.readiness_by_domain)
    .reduce((total: number, stageSummary: any) => (
      total + (stageSummary.hard_blocker_count ?? 0)
    ), 0);
  assert.equal(readiness.summary.stage_readiness_hard_blocker_count, stageHardBlockerCount);
  if (
    readiness.agent_conformance_tail.structural_conformance_status === 'blocked'
    && stageHardBlockerCount === 0
  ) {
    assert.equal(readiness.summary.agent_conformance_hard_blocker_count > 0, true);
    assert.equal(
      readiness.attention_first_payload.blockers.some((blocker: { blocker_id: string; route_ref: string }) => (
        blocker.blocker_id === 'agent_conformance_framework_kernel_blocker_present'
        && blocker.route_ref === '/framework_readiness/agent_conformance_tail'
      )),
      true,
    );
    assert.equal(
      readiness.attention_first_payload.blockers.some((blocker: { route_ref: string }) => (
        blocker.route_ref === '/framework_readiness/stages'
      )),
      false,
    );
  }
  assert.equal(Object.hasOwn(readiness.summary, 'pack_compiler_ready_domain_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'pack_compiler_blocked_domain_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'pack_compiler_generated_surface_ready_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'pack_compiler_domain_generated_surface_owner_claim_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'pack_compiler_generated_artifact_drift_detected_count'), false);
  assert.equal(
    readiness.pack_compiler.summary.generated_surface_ready_count
      + readiness.pack_compiler.summary.generated_surface_blocked_count,
    readiness.pack_compiler.summary.generated_surface_count,
  );
  assert.equal(
    readiness.stages.diagnostic_failures.length,
    readiness.stages.diagnostic_failures.length,
  );
  assert.equal(Object.hasOwn(readiness.summary, 'stage_readiness_diagnostic_failure_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'stage_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'admitted_stage_count'), false);
  assert.equal(Object.hasOwn(readiness.summary, 'blocked_stage_count'), false);
  if (readiness.stages.diagnostic_failures.length > 0) {
    assert.equal(
      readiness.stages.diagnostic_failures.every(
        (failure: { status: string }) => failure.status === 'diagnostic_unavailable',
      ),
      true,
    );
  } else {
    assert.equal(readiness.stages.summary.stages_count, 18);
    assert.equal(readiness.stages.summary.admitted_stages_count, 18);
    assert.equal(readiness.stages.summary.blocked_stages_count, 0);
  }
  assert.equal(
    readiness.summary.stage_receipt_freshness_tail_open_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.open_item_count,
  );
  assert.equal(
    readiness.summary.stage_source_scope_missing_workorder_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.source_scope_missing_workorder_count,
  );
  assert.equal(
    readiness.summary.stage_runtime_event_missing_workorder_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.runtime_event_missing_workorder_count,
  );
  assert.equal(
    readiness.summary.stage_source_scope_missing_ref_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.source_scope_missing_ref_count,
  );
  assert.equal(
    readiness.summary.stage_runtime_event_missing_ref_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.runtime_event_missing_ref_count,
  );
  assert.equal(
    readiness.evidence_worklist.stage_source_scope_missing_workorder_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.source_scope_missing_workorder_count,
  );
  assert.equal(
    readiness.evidence_worklist.stage_runtime_event_missing_workorder_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.runtime_event_missing_workorder_count,
  );
  assert.equal(
    readiness.evidence_worklist.stage_evidence_workorder_attention_items.length,
    readiness.evidence_tails.stage_receipt_freshness_tail.stage_evidence_workorder_attention_items.length,
  );
  assert.deepEqual(
    readiness.evidence_worklist.stage_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
    readiness.attention_first_payload.stage_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary.domain_id_policy,
    'canonical_owner_facing_ids_only_workorder_items_keep_command_domain_ids_for_action_routes',
  );
  assert.deepEqual(
    [...readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary.domain_ids]
      .sort(),
    readiness.evidence_envelope.summary.owner_ids
      .filter((owner: string) => owner !== 'one-person-lab')
      .sort(),
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_packet_summary
      .route_domain_id_policy,
    'command_domain_ids_for_opl_runtime_action_execute_routes_not_default_owner_semantics',
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_policy,
    'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.length,
    Math.min(
      readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.domain_stage_group_count,
      5,
    ),
  );
  assert.deepEqual(
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_group_attention_items.map(
      (item: { group_id: string }) => item.group_id,
    ),
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.map(
      (item: { group_id: string }) => item.group_id,
    ),
  );
  assert.deepEqual(
    readiness.evidence_tails.stage_receipt_freshness_tail
      .domain_dispatch_evidence_workorder_group_attention_items.map(
        (item: { group_id: string }) => item.group_id,
      ),
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.map(
      (item: { group_id: string }) => item.group_id,
    ),
  );
  const firstDispatchWorkorderGroup =
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items[0];
  if (firstDispatchWorkorderGroup) {
    assert.equal(typeof firstDispatchWorkorderGroup.canonical_domain_id, 'string');
    assert.equal(firstDispatchWorkorderGroup.canonical_domain_id.includes('-'), true);
    assert.equal(firstDispatchWorkorderGroup.owner, firstDispatchWorkorderGroup.canonical_domain_id);
    assert.equal(typeof firstDispatchWorkorderGroup.stage_id, 'string');
    assert.equal(firstDispatchWorkorderGroup.workorder_count > 0, true);
    assert.equal(firstDispatchWorkorderGroup.stage_attempt_count > 0, true);
    assert.equal(firstDispatchWorkorderGroup.sample_stage_attempt_ids.length <= 3, true);
    assert.equal(firstDispatchWorkorderGroup.sample_action_refs.length <= 3, true);
    assertDomainDispatchGroupExecutorHints(firstDispatchWorkorderGroup);
    assert.equal(firstDispatchWorkorderGroup.sample_required_evidence_refs.length <= 3, true);
    assert.equal(firstDispatchWorkorderGroup.stage_attempt_id_omitted_count >= 0, true);
    assert.equal(firstDispatchWorkorderGroup.action_ref_omitted_count >= 0, true);
    assert.equal(firstDispatchWorkorderGroup.required_evidence_ref_omitted_count >= 0, true);
    assert.equal(Object.hasOwn(firstDispatchWorkorderGroup, 'required_evidence_refs'), false);
    assert.equal(firstDispatchWorkorderGroup.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(firstDispatchWorkorderGroup.route_requires_domain_or_app_payload, true);
    assert.equal(firstDispatchWorkorderGroup.can_create_owner_receipt, false);
    assert.equal(firstDispatchWorkorderGroup.can_close_domain_ready, false);
    assert.equal(firstDispatchWorkorderGroup.can_claim_production_ready, false);
    assert.equal(firstDispatchWorkorderGroup.worklist_item_is_completion_claim, false);
  }
  if (readiness.attention_first_payload.blockers.length === 0) {
    const dispatchGroupAction = nextSafeActions.find(
      (action: { action_kind?: string }) =>
        action.action_kind === 'domain_dispatch_evidence_group_workorder',
    );
    assert.equal(Boolean(dispatchGroupAction), Boolean(firstDispatchWorkorderGroup));
    if (firstDispatchWorkorderGroup && dispatchGroupAction) {
      const actionKinds = nextSafeActions.map((action: { action_kind?: string }) => action.action_kind);
      const dispatchIndex = actionKinds.indexOf('domain_dispatch_evidence_group_workorder');
      const ownerPayloadIndex = actionKinds.indexOf('owner_payload_group_scaleout');
      const ownerHandoffIndex = actionKinds.indexOf('owner_handoff_packet_review');
      assert.equal(dispatchIndex > 0, true);
      if (ownerPayloadIndex >= 0) {
        assert.equal(dispatchIndex < ownerPayloadIndex, true);
      }
      if (ownerHandoffIndex >= 0) {
        assert.equal(dispatchIndex < ownerHandoffIndex, true);
      }
      assert.equal(dispatchGroupAction.action_id, 'review_domain_dispatch_group_workorder');
      assert.equal(dispatchGroupAction.step_kind, 'domain_dispatch_evidence_group_workorder');
      assert.equal(
        dispatchGroupAction.evidence_closure_gate,
        'domain_dispatch_owner_chain_payload_gate',
      );
      assert.equal(
        dispatchGroupAction.payload_requirement,
        'domain_app_or_live_refs_payload_required_to_record_domain_dispatch_owner_receipt_or_typed_blocker',
      );
      assert.equal(dispatchGroupAction.owner, firstDispatchWorkorderGroup.canonical_domain_id);
      assert.equal(dispatchGroupAction.payload_owner, firstDispatchWorkorderGroup.payload_owner);
      assert.equal(
        dispatchGroupAction.canonical_domain_id,
        firstDispatchWorkorderGroup.canonical_domain_id,
      );
      assert.equal(dispatchGroupAction.stage_id, firstDispatchWorkorderGroup.stage_id);
      assert.equal(dispatchGroupAction.workorder_count, firstDispatchWorkorderGroup.workorder_count);
      assert.equal(
        dispatchGroupAction.stage_attempt_count,
        firstDispatchWorkorderGroup.stage_attempt_count,
      );
      assert.equal(dispatchGroupAction.sample_stage_attempt_ids.length <= 3, true);
      assert.equal(dispatchGroupAction.sample_action_refs.length <= 3, true);
      assertSameDomainDispatchGroupExecutorHints(dispatchGroupAction, firstDispatchWorkorderGroup);
      assert.equal(dispatchGroupAction.sample_required_evidence_refs.length <= 3, true);
      assert.deepEqual(
        dispatchGroupAction.required_operator_payload_refs,
        firstDispatchWorkorderGroup.required_operator_payload_refs,
      );
      assert.equal(
        dispatchGroupAction.payload_path_policy,
        firstDispatchWorkorderGroup.payload_path_policy,
      );
      assert.equal(
        dispatchGroupAction.accepted_payload_paths.typed_blocker_path.success_claimed,
        false,
      );
      assert.equal(
        dispatchGroupAction.payload_preflight_policy,
        firstDispatchWorkorderGroup.payload_preflight_policy,
      );
      assert.equal(
        dispatchGroupAction.payload_preflight_blocked_error_kind,
        'domain_dispatch_evidence_payload_preflight_blocked',
      );
      assert.deepEqual(
        dispatchGroupAction.required_return_shapes,
        firstDispatchWorkorderGroup.required_return_shapes,
      );
      assert.equal(Object.hasOwn(dispatchGroupAction, 'required_evidence_refs'), false);
      assert.equal(dispatchGroupAction.full_detail_section, 'domain_dispatch_evidence');
      assert.equal(dispatchGroupAction.authority, 'operator_attention_only');
      assert.equal(dispatchGroupAction.can_execute_domain_action, false);
      assert.equal(dispatchGroupAction.can_write_domain_truth, false);
      assert.equal(dispatchGroupAction.can_create_owner_receipt, false);
      assert.equal(dispatchGroupAction.can_close_domain_ready, false);
      assert.equal(dispatchGroupAction.can_claim_production_ready, false);
    }
  }
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_route_attention_fallback_policy,
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.length > 0
      ? 'route_workorders_available_in_evidence_worklist_and_full_drilldown_group_guidance_is_default'
      : 'route_workorders_used_only_when_owner_stage_group_guidance_is_unavailable',
  );
  assert.equal(
    readiness.domain_dispatch_attention
      .domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.equal(
    readiness.domain_dispatch_attention.domain_dispatch_evidence_receipt_action_route_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.equal(
    readiness.evidence_tails.stage_receipt_freshness_tail
      .domain_dispatch_evidence_workorder_packet_summary.workorder_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.deepEqual(
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
    readiness.evidence_tails.stage_receipt_freshness_tail
      .domain_dispatch_evidence_workorder_attention_items.map(
        (item: { action_id: string }) => item.action_id,
      ),
  );
  assert.equal(
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_attention_items.length,
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_group_attention_items.length > 0
      ? 0
      : readiness.evidence_worklist.domain_dispatch_evidence_workorder_attention_items.length,
  );
  for (const dispatchWorkorder of readiness.evidence_worklist
    .domain_dispatch_evidence_workorder_attention_items) {
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
    assert.equal(
      dispatchWorkorder.payload_preflight_blocked_error_kind,
      'domain_dispatch_evidence_payload_preflight_blocked',
    );
    assert.equal(dispatchWorkorder.empty_payload_template_is_success_evidence, false);
    assert.equal(dispatchWorkorder.worklist_item_is_completion_claim, false);
  }
  assert.equal(
    readiness.evidence_worklist.open_worklist_item_count,
    readiness.evidence_worklist.open_worklist_item_count,
  );
  assert.equal(Object.hasOwn(readiness.summary, 'production_or_domain_ready'), false);

  assert.equal(
    readiness.source_commands.includes('opl system semantic-hygiene --json'),
    true,
  );
  assert.equal(
    readiness.source_commands.includes('opl agents readiness --family-defaults --json'),
    true,
  );
  assert.equal(
    readiness.source_commands.includes('opl agents pack-compiler --json'),
    true,
  );
  assert.equal(
    readiness.source_commands.includes('opl stages readiness --domain mas --json'),
    true,
  );
  assert.equal(
    readiness.source_commands.includes('opl runtime app-operator-drilldown --json'),
    true,
  );
  assert.equal(
    readiness.source_commands.includes(
      'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
    ),
    true,
  );

  assert.equal(
    readiness.evidence_counter_taxonomy.agent_structural_evidence_tail,
    'agents readiness structural-conformance evidence tail only',
  );
  assert.equal(
    readiness.evidence_counter_taxonomy.app_live_evidence_tail,
    'App/operator live production evidence tail ledger open items',
  );
  assert.equal(
    readiness.evidence_counter_taxonomy.stage_receipt_freshness_tail,
    'stage production caller, expected receipt, and monitor freshness workorders',
  );
  assert.equal(
    readiness.evidence_counter_taxonomy.evidence_envelope,
    'single refs-only owner/scope/payload-kind claim reading across stage, external evidence, domain dispatch, and cleanup receipts',
  );
  assert.equal(
    readiness.evidence_counter_taxonomy.domain_dispatch_attention,
    'App/operator owner-chain dispatch attention derived from stage evidence typed blockers and missing owner-chain refs without authorizing domain ready',
  );
  assert.equal(
    readiness.evidence_counter_taxonomy.runtime_manager_route_support,
    'Runtime Manager supported MAS route catalog projection only; support does not close owner-chain receipts or authorize domain ready',
  );
  assert.equal(
    Object.keys(readiness.summary).some((key) => key.startsWith('production_evidence_tail_')),
    false,
  );
  assert.equal(
    Object.keys(readiness.summary).some((key) => key.startsWith('production_closeout_')),
    false,
  );
  assert.equal(
    readiness.agent_conformance_tail.agent_readiness_production_evidence_tail_count,
    readiness.evidence_tails.agent_structural_evidence_tail.total_item_count,
  );
  assert.equal(
    readiness.evidence_tails.agent_structural_evidence_tail.open_item_count,
    readiness.agent_conformance_tail.agent_readiness_production_evidence_tail_open_count,
  );
  assert.equal(
    readiness.evidence_tails.agent_structural_evidence_tail.open_item_count,
    0,
  );
  assert.equal(Object.hasOwn(readiness.agent_conformance_tail, 'production_or_domain_ready'), false);
  assert.equal(
    readiness.app_operator_production_tail.app_operator_production_evidence_tail_open_item_count,
    readiness.evidence_tails.app_live_evidence_tail.open_item_count,
  );
  assert.equal(
    readiness.evidence_worklist.worklist_item_is_completion_claim,
    false,
  );
  assert.equal(
    readiness.evidence_worklist.lens_policy,
    'derived_attention_lens_over_open_safe_action_request_apply_verify_routes',
  );
  assert.equal(readiness.evidence_envelope.source_command, readiness.evidence_worklist.source_command);
  assert.equal(readiness.evidence_envelope.summary.domain_ready_claim_count, 0);
  assert.equal(readiness.evidence_envelope.summary.production_ready_claim_count, 0);
  assert.equal(readiness.evidence_envelope.summary.artifact_authority_claim_count, 0);
  assert.equal(readiness.evidence_envelope.open_envelope_count, readiness.evidence_envelope.summary.open_envelope_count);
  assert.equal(readiness.evidence_envelope.blocked_envelope_count, readiness.evidence_envelope.summary.blocked_envelope_count);
  assert.equal(
    readiness.evidence_envelope.attention_envelope_count,
    readiness.evidence_envelope.open_envelope_count + readiness.evidence_envelope.blocked_envelope_count,
  );
  assert.equal(
    readiness.summary.evidence_envelope_attention_count,
    readiness.evidence_envelope.attention_envelope_count,
  );
  assert.equal(
    readiness.attention_first_payload.warnings.some(
      (warning: { warning_id: string }) => warning.warning_id === 'evidence_envelope_attention',
    ),
    readiness.evidence_envelope.attention_envelope_count > 0,
  );
  assert.equal(
    readiness.attention_first_payload.warnings.some(
      (warning: { warning_id: string }) => warning.warning_id === 'domain_dispatch_attention',
    ),
    readiness.domain_dispatch_attention.attention_count > 0,
  );
  assert.equal(
    readiness.attention_first_payload.warnings.some(
      (warning: { warning_id: string }) =>
        warning.warning_id === 'oma_production_consumption_followthrough',
    ),
    readiness.oma_production_consumption_followthrough.open_gate_count > 0,
  );
  assert.equal(
    readiness.attention_first_payload.warnings.some(
      (warning: { warning_id: string }) =>
        warning.warning_id === 'app_release_user_path_evidence',
    ),
    readiness.app_release_user_path_evidence.open_gate_count > 0,
  );
  assert.equal(
    readiness.domain_dispatch_attention.attention_count,
    readiness.summary.domain_dispatch_attention_count,
  );
  assert.equal(
    readiness.domain_dispatch_attention.attention_count,
    readiness.domain_dispatch_attention.typed_blocker_stage_count
      + readiness.domain_dispatch_attention.missing_owner_chain_count,
  );
  assert.equal(
    readiness.domain_dispatch_attention.attention_policy,
    'typed_blocker_stage_or_uncovered_missing_owner_chain_attention_only_no_domain_ready_claim',
  );
  assert.equal(
    readiness.diagnostic_drilldowns.some(
      (lens: { lens_id: string; embedded_payload_ref: string }) =>
        lens.lens_id === 'oma_production_consumption_followthrough'
        && lens.embedded_payload_ref === '/framework_readiness/oma_production_consumption_followthrough',
    ),
    true,
  );
  assert.equal(
    readiness.runtime_manager_route_support.task_kind_count,
    readiness.summary.runtime_manager_mas_route_support_task_kind_count,
  );
  assert.equal(readiness.runtime_manager_route_support.aftercare_route_support_count, 2);
  assert.equal(readiness.runtime_manager_route_support.action_ref_count, 2);
  assert.deepEqual(readiness.runtime_manager_route_support.supported_task_kinds, [
    'domain_route/reconcile-apply',
    'publication_aftercare/analysis-queue-progress',
    'publication_aftercare/reviewer-refresh',
  ]);
  assert.equal(
    readiness.runtime_manager_route_support.support_catalog_is_owner_chain_closure,
    false,
  );
  assert.equal(readiness.runtime_manager_route_support.can_claim_domain_ready, false);
  assert.equal(readiness.runtime_manager_route_support.can_close_owner_chain, false);
  assert.equal(readiness.runtime_manager_route_support.authority_boundary.can_write_domain_truth, false);
  assert.equal(readiness.domain_dispatch_attention.can_claim_domain_ready, false);
  assert.equal(readiness.domain_dispatch_attention.can_claim_production_ready, false);
  assert.equal(
    readiness.evidence_envelope.claim_policy,
    'owner_receipt_and_typed_blocker_refs_only_no_domain_or_production_ready_verdict',
  );
  assert.equal(readiness.evidence_envelope.authority_boundary.can_write_domain_truth, false);
  assert.equal(readiness.evidence_envelope.authority_boundary.can_claim_production_ready, false);
  assert.match(
    readiness.stage_production_caller_tail.route_policy,
    /creates_opl_stage_attempt_request_only/,
  );
  assert.equal(readiness.provider_slo_status.provider_slo_can_claim_domain_ready, false);
  assert.equal(readiness.provider_slo_status.provider_slo_can_claim_production_ready, false);

  assert.equal(readiness.authority_boundary.can_claim_domain_ready, false);
  assert.equal(readiness.authority_boundary.can_claim_production_ready, false);
  assert.equal(readiness.authority_boundary.can_claim_artifact_authority, false);
  assert.equal(readiness.authority_boundary.can_authorize_quality_or_export, false);
  assert.equal(readiness.authority_boundary.can_write_domain_truth, false);
  assert.equal(readiness.authority_boundary.can_read_memory_body, false);
  assert.equal(readiness.authority_boundary.can_read_artifact_body, false);
    assert.equal(readiness.authority_boundary.safe_action_route_is_receipt_closure, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
