import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  repoRoot,
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
  assertFrameworkWorkstreamOperatingLoop,
} from './framework-readiness-workstream-operating-loop-assertions.ts';
import {
  assertFrameworkReadinessDomainDispatchWorkorders,
} from './framework-readiness-domain-dispatch-assertions.ts';
import {
  assertFrameworkOwnerHandoffAction,
  assertFrameworkOwnerHandoffPacket,
  assertFrameworkOwnerPayloadAction,
  assertFrameworkOwnerPayloadAttention,
  assertCurrentOwnerDeltaToplineNextAction,
  assertOwnerDeltaFirstReadinessProjection,
} from './owner-payload-workorder-assertions.ts';
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';

test('framework readiness summarizes default control-plane surfaces without authority claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-state-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-readiness-family-'));
  try {
    const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);
    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
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
  assertCurrentOwnerDeltaToplineNextAction(readiness);
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
    readiness.attention_first_payload.summary.diagnostic_failure_count,
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
    readiness.attention_first_payload.summary.stage_replay_missing_receipt_workorder_count,
    readiness.summary.stage_replay_missing_receipt_workorder_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.stage_replay_missing_human_gate_ref_count,
    readiness.summary.stage_replay_missing_human_gate_ref_count,
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
      + readiness.developer_mode_live_closeout_evidence.attention_count
      + readiness.summary.domain_dispatch_attention_count,
  );
  assert.equal(
    readiness.attention_first_payload.summary.operator_payload_required_attention_tail_count,
    readiness.summary.operator_payload_required_attention_tail_count,
  );
  assert.equal(
    readiness.summary.operator_actionable_attention_tail_count,
    readiness.summary.operator_payload_required_attention_tail_count
      + readiness.summary.operator_payload_free_attention_tail_count,
  );
  assert.equal(
    readiness.evidence_worklist.open_safe_action_payload_required_item_count
      + readiness.evidence_worklist.open_safe_action_payload_free_item_count,
    readiness.evidence_worklist.open_safe_action_item_count,
  );
  if (
    readiness.evidence_worklist.open_safe_action_item_count
      === readiness.summary.operator_actionable_attention_tail_count
  ) {
    assert.equal(
      readiness.summary.operator_payload_required_attention_tail_count,
      readiness.evidence_worklist.open_safe_action_payload_required_item_count,
    );
    assert.equal(
      readiness.summary.operator_payload_free_attention_tail_count,
      readiness.evidence_worklist.open_safe_action_payload_free_item_count,
    );
  }
  assert.equal(
    readiness.evidence_worklist.open_safe_action_payload_requirement_semantics,
    'open_safe_action_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure',
  );
  assert.equal(
    readiness.summary.attention_payload_requirement_semantics,
    'operator_actionable_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure',
  );
  assertOwnerDeltaFirstReadinessProjection(readiness);
  if (
    readiness.summary.framework_kernel_hard_blocker_count === 0
    && readiness.summary.open_tail_count === 0
    && readiness.summary.operator_actionable_attention_tail_count > 0
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
  if (
    readiness.summary.framework_kernel_hard_blocker_count === 0
    && readiness.summary.open_tail_count === 0
    && readiness.summary.operator_actionable_attention_tail_count === 0
    && readiness.summary.domain_blocked_attention_tail_count > 0
  ) {
    assert.equal(
      readiness.status,
      'framework_control_plane_available_with_blocked_refs_only_attention',
    );
    assert.notEqual(
      readiness.status,
      'framework_control_plane_available_with_operator_attention',
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
      + memoryArtifactLifecycleEvidence.domain_artifact_mutation_receipt_ref_count
      + memoryArtifactLifecycleEvidence.external_verified_memory_writeback_receipt_ref_count
      + memoryArtifactLifecycleEvidence.external_verified_artifact_mutation_receipt_ref_count
      + memoryArtifactLifecycleEvidence.external_verified_package_lifecycle_receipt_ref_count
      + memoryArtifactLifecycleEvidence.external_verified_lifecycle_receipt_ref_count
      + memoryArtifactLifecycleEvidence.external_verified_restore_proof_ref_count,
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
  assertFrameworkWorkstreamOperatingLoop(readiness);
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
    const openGateIds = omaProductionConsumption.open_gate_ids;
    assert.equal(omaProductionConsumption.open_gate_count, openGateIds.length);
    assert.equal(omaProductionConsumption.gate_items.length, omaProductionConsumption.open_gate_count);
    assert.deepEqual(openGateIds, omaProductionConsumption.gate_items.map((gate: { gate_id: string }) => gate.gate_id));
    assert.equal(openGateIds.includes('managed_install_update_refs'), true);
    assert.equal(openGateIds.includes('app_live_path_refs'), true);
    assert.equal(openGateIds.includes('owner_receipt_or_typed_blocker_scaleout_refs'), false);
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
  assert.equal(
    readiness.summary.framework_kernel_hard_blocker_count,
    readiness.summary.agent_conformance_hard_blocker_count
      + readiness.summary.stage_readiness_hard_blocker_count
      + readiness.summary.pack_compiler_hard_blocker_count,
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
  assert.equal(
    readiness.evidence_worklist.stage_replay_missing_receipt_workorder_count,
    readiness.evidence_tails.stage_receipt_freshness_tail.stage_replay_missing_receipt_workorder_count,
  );
  assert.deepEqual(
    readiness.evidence_worklist.stage_replay_missing_receipt_workorder_attention_items.map(
      (item: { item_id: string }) => item.item_id,
    ),
    readiness.attention_first_payload.stage_replay_missing_receipt_workorder_attention_items.map(
      (item: { item_id: string }) => item.item_id,
    ),
  );
  assert.equal(
    readiness.evidence_worklist.stage_replay_missing_receipt_workorder_attention_summary
      .total_workorder_count,
    readiness.evidence_worklist.stage_replay_missing_receipt_workorder_count,
  );
  assert.equal(
    readiness.attention_first_payload.stage_replay_missing_receipt_workorder_attention_summary
      .omitted_workorder_count,
    readiness.evidence_worklist.stage_replay_missing_receipt_workorder_attention_summary
      .omitted_workorder_count,
  );
  assert.equal(
    readiness.evidence_tails.stage_receipt_freshness_tail
      .stage_replay_missing_receipt_workorder_attention_summary.omitted_workorder_count,
    readiness.evidence_worklist.stage_replay_missing_receipt_workorder_attention_summary
      .omitted_workorder_count,
  );
  assert.equal(
    readiness.attention_first_payload.stage_replay_missing_receipt_workorder_attention_summary
      .authority_boundary.can_create_owner_receipt,
    false,
  );
  assert.deepEqual(
    readiness.evidence_worklist.stage_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
    readiness.attention_first_payload.stage_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
  );
  assertFrameworkReadinessDomainDispatchWorkorders(readiness, nextSafeActions);
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
    readiness.source_commands.includes('opl stages readiness --family-defaults --json'),
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
    readiness.summary.agent_structural_evidence_tail_open_count,
  );
  assert.equal(
    readiness.evidence_tails.agent_structural_evidence_tail.open_item_count > 0,
    true,
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
  assert.match(readiness.stage_production_caller_tail.route_policy, /creates_opl_stage_attempt_request_only/);
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
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});
