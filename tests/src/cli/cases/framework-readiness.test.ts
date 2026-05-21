import {
  assert,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

test('framework readiness summarizes default control-plane surfaces without authority claims', () => {
  const readiness = runCli(['framework', 'readiness', '--family-defaults']).framework_readiness;

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
  assert.equal(
    readiness.attention_first_payload.summary.hard_blocker_count,
    readiness.summary.framework_kernel_hard_blocker_count,
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
  assert.equal(
    readiness.attention_first_payload.summary.domain_dispatch_attention_count,
    readiness.summary.domain_dispatch_attention_count,
  );
  assert.equal(
    readiness.attention_first_payload.blockers.length > 0,
    readiness.summary.framework_kernel_hard_blocker_count > 0,
  );
  assert.equal(readiness.attention_first_payload.warnings.length > 0, true);
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
    assert.equal(readiness.agent_conformance_tail.status, 'passed_with_production_evidence_tail');
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
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
  );
  assert.deepEqual(
    readiness.evidence_tails.stage_receipt_freshness_tail
      .domain_dispatch_evidence_workorder_attention_items.map(
        (item: { action_id: string }) => item.action_id,
      ),
    readiness.attention_first_payload.domain_dispatch_evidence_workorder_attention_items.map(
      (item: { action_id: string }) => item.action_id,
    ),
  );
  for (const dispatchWorkorder of readiness.attention_first_payload
    .domain_dispatch_evidence_workorder_attention_items) {
    assert.equal(dispatchWorkorder.action_kind, 'domain_dispatch_evidence_receipt_record');
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
});

test('framework readiness rejects non-default invocation to avoid a second truth surface', () => {
  const failure = runCliFailure(['framework', 'readiness']);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
  assert.deepEqual(failure.payload.error.details.required, ['--family-defaults']);
});

test('framework readiness appears in default and command-scoped help', () => {
  const root = runCli(['help']);
  const commands = root.help.commands.map((entry: { command: string }) => entry.command);
  const examples = root.help.examples.join('\n');

  assert.equal(commands.includes('framework readiness'), true);
  assert.match(examples, /opl framework readiness --family-defaults/);

  const scoped = runCli(['help', 'framework', 'readiness']);
  assert.equal(scoped.help.command, 'framework readiness');
  assert.match(scoped.help.usage, /framework readiness --family-defaults/);
});
