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
    'attention_first_kernel_floor_default_with_embedded_compatibility_drilldowns',
  );
  assert.equal(readiness.readiness_model.mode, 'ai_first_contract_light');
  assert.equal(readiness.readiness_model.default_payload, 'operator_attention_summary');
  assert.equal(readiness.readiness_model.ai_executor_internal_strategy_is_contract, false);
  assert.equal(readiness.attention_first_payload.surface_kind, 'opl_framework_readiness_attention_first_payload');
  assert.equal(
    readiness.attention_first_payload.summary.hard_blocker_count,
    readiness.summary.framework_kernel_hard_blocker_count,
  );
  assert.equal(readiness.attention_first_payload.summary.open_tail_count > 0, true);
  assert.equal(
    readiness.attention_first_payload.blockers.length > 0,
    readiness.summary.framework_kernel_hard_blocker_count > 0,
  );
  assert.equal(readiness.attention_first_payload.warnings.length > 0, true);
  assert.deepEqual(
    readiness.attention_first_payload.diagnostic_drilldown_refs,
    readiness.diagnostic_drilldowns.map((lens: { embedded_payload_ref: string }) => lens.embedded_payload_ref),
  );
  assert.match(readiness.attention_first_payload.claim_policy, /emits_no_domain_quality_artifact_or_production_ready/);
  assert.equal(readiness.kernel_floor.policy, 'minimum_control_plane_boundary_and_recoverability_floor_only');
  assert.equal(readiness.kernel_floor.ai_executor_strategy_contract, false);
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
  assert.equal(readiness.summary.agent_structural_conformance_blocker_count, 0);
  assert.equal(readiness.summary.semantic_hygiene_gate_count, 6);
  assert.equal(readiness.summary.agent_structural_conformance_status, 'passed');
  assert.equal(
    readiness.summary.pack_compiler_ready_domain_count,
    readiness.pack_compiler.summary.ready_domain_count,
  );
  assert.equal(
    readiness.summary.pack_compiler_blocked_domain_count,
    readiness.pack_compiler.summary.blocked_domain_count,
  );
  assert.equal(
    readiness.summary.pack_compiler_generated_surface_ready_count,
    readiness.pack_compiler.summary.generated_surface_ready_count,
  );
  assert.equal(
    readiness.summary.pack_compiler_domain_generated_surface_owner_claim_count,
    readiness.pack_compiler.summary.domain_generated_surface_owner_claim_count,
  );
  assert.equal(
    readiness.summary.pack_compiler_generated_artifact_drift_detected_count,
    readiness.pack_compiler.summary.generated_artifact_drift_detected_count,
  );
  assert.equal(
    readiness.pack_compiler.summary.generated_surface_ready_count
      + readiness.pack_compiler.summary.generated_surface_blocked_count,
    readiness.pack_compiler.summary.generated_surface_count,
  );
  assert.equal(readiness.summary.stage_count, 18);
  assert.equal(readiness.summary.admitted_stage_count, 18);
  assert.equal(readiness.summary.blocked_stage_count, 0);
  assert.equal(
    readiness.stages.diagnostic_failures.length,
    readiness.summary.stage_readiness_diagnostic_failure_count,
  );
  assert.equal(
    readiness.summary.stage_production_caller_tail_open_item_count,
    readiness.stage_production_caller_tail.stage_production_evidence_missing_caller_stage_count,
  );
  assert.equal(
    readiness.summary.production_closeout_open_safe_action_item_count,
    readiness.production_closeout_safe_action_tail.production_closeout_open_safe_action_item_count,
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
      'opl family-runtime production-closeout --family-defaults --provider temporal --executor-kind codex_cli --json',
    ),
    true,
  );

  assert.equal(
    readiness.evidence_counter_taxonomy.app_operator_production_evidence_tail_open_item_count,
    'App/operator production-evidence tail ledger open items',
  );
  assert.equal(
    Object.keys(readiness.summary).some((key) => key.startsWith('production_evidence_tail_')),
    false,
  );
  assert.equal(
    readiness.agent_conformance_tail.agent_readiness_production_evidence_tail_count,
    readiness.summary.agent_readiness_production_evidence_tail_count,
  );
  assert.equal(Object.hasOwn(readiness.agent_conformance_tail, 'production_or_domain_ready'), false);
  assert.equal(
    readiness.app_operator_production_tail.app_operator_production_evidence_tail_open_item_count,
    readiness.summary.app_operator_production_evidence_tail_open_item_count,
  );
  assert.equal(
    readiness.production_closeout_safe_action_tail.closeout_item_is_completion_claim,
    false,
  );
  assert.equal(
    readiness.production_closeout_safe_action_tail.lens_policy,
    'derived_attention_lens_over_open_safe_action_request_apply_verify_routes',
  );
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
