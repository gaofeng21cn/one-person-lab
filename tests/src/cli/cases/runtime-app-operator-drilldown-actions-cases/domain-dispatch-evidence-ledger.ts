import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  installRuntimePackageFixture,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../../helpers.ts';

test('runtime action execute records and verifies domain dispatch evidence receipts through OPL ledger only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-domain-dispatch-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts","dispatch_ref":"mas-domain-dispatch:dm-cvd:domain-dispatch-evidence"}',
      '--task',
      'task-domain-dispatch-evidence',
      '--source-fingerprint',
      'sha256:domain-dispatch-evidence',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const stageRunId = 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch';
    const stageManifestRef = 'opl://stage-manifests/domain_owner%2Fdefault-executor-dispatch';
    const currentPointerRef =
      'opl://stage-runs/app-stage-run%3Amedautoscience%3Adomain-owner-default-executor-dispatch/current';
    const idempotencyKey = 'idem_domain_dispatch_evidence';
    const providerAttemptRef = `temporal://attempt/${attemptId}`;
    const attemptLeaseRef = `opl://stage-attempts/${attemptId}/leases/frt_domain_dispatch/active`;
    const executionAuthorizationDecisionRef =
      `opl://stage-attempts/${attemptId}/execution-authorizations/frt_domain_dispatch/wf_domain_dispatch`;
    runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify({
        stage_run_id: stageRunId,
        domain_id: 'medautoscience',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        domain_context: {
          domain_id: 'medautoscience',
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          stage_id: 'write',
        },
        stage_id: 'write',
        phase: 'launch',
        selected_executor: 'codex_cli',
        provider_attempt_ref: providerAttemptRef,
        stage_attempt_id: attemptId,
        attempt_lease_ref: attemptLeaseRef,
        attempt_lease_status: 'active',
        execution_authorization_decision_ref: executionAuthorizationDecisionRef,
        workspace_scope_ref: 'workspace:/tmp/mas',
        artifact_scope_ref: 'stage-packet:domain-dispatch-evidence',
        action_type: 'domain_dispatch_evidence',
        work_unit_id: 'task-domain-dispatch-evidence',
        work_unit_fingerprint: 'sha256:domain-dispatch-evidence',
        decision: 'authorize',
        reason: 'domain_dispatch_evidence_fixture_authorized',
        operator: 'one-person-lab',
        source_fingerprint: 'sha256:domain-dispatch-evidence',
        idempotency_key: idempotencyKey,
        current_pointer_ref: currentPointerRef,
        stage_manifest_ref: stageManifestRef,
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:write-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const recordActionId = `domain_dispatch:medautoscience:${attemptId}:record`;
    const verifyActionId = `domain_dispatch:medautoscience:${attemptId}:verify`;
    const recordRoute = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === recordActionId,
    );
    assert.equal(projection.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
    assert.equal(
      projection.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      1,
    );
    assert.equal(projection.summary.domain_dispatch_evidence_receipt_record_payload_template_count, 1);
    assert.equal(recordRoute.action_kind, 'domain_dispatch_evidence_receipt_record');
    assert.equal(recordRoute.request_id, `domain_dispatch:medautoscience:${attemptId}`);
    assert.equal(recordRoute.request_pack_id, 'medautoscience.domain_dispatch_evidence');
    assert.equal(recordRoute.workspace_root, '/tmp/mas');
    assert.equal(recordRoute.workspace_locator.workspace_root, '/tmp/mas');
    assert.equal(recordRoute.workspace_locator.artifact_root, '/tmp/mas/artifacts');
    assert.equal(
      recordRoute.workspace_locator.dispatch_ref,
      'mas-domain-dispatch:dm-cvd:domain-dispatch-evidence',
    );
    assert.equal(recordRoute.workspace_locator.package_use_binding.root_package.package_id, 'mas');
    assert.equal(
      recordRoute.workspace_locator.package_use_binding.use_receipt_ref.startsWith('opl://agent-package/use/mas/'),
      true,
    );
    assert.equal(recordRoute.route_requires_domain_or_app_payload, true);
    assert.equal(recordRoute.can_close_without_domain_or_app_payload, false);
    assert.equal(recordRoute.creates_domain_action, false);
    assert.equal(recordRoute.creates_owner_receipt, false);
    assert.deepEqual(recordRoute.owner_receipt_refs, []);
    assert.equal(recordRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(recordRoute.authority_boundary.creates_owner_receipt, false);
    assert.equal(recordRoute.authority_boundary.closes_domain_ready, false);
    assert.equal(recordRoute.authority_boundary.closes_production_ready, false);
    assert.equal(
      recordRoute.payload_preflight_policy,
      'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
    );
    assert.equal(recordRoute.payload_preflight_error_code, 'cli_usage_error');
    assert.equal(
      recordRoute.payload_preflight_blocked_error_kind,
      'domain_dispatch_evidence_payload_preflight_blocked',
    );
    assert.equal(
      recordRoute.payload_workorder.workorder_policy,
      'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
    );
    assert.deepEqual(
      recordRoute.payload_workorder.accepted_payload_paths.typed_blocker_path.required_operator_payload_refs,
      ['typed_blocker_refs'],
    );
    assert.equal(
      recordRoute.payload_workorder.accepted_payload_paths.success_refs_path
        .required_any_operator_payload_refs.includes('evidence_refs'),
      false,
    );
    assert.deepEqual(
      recordRoute.payload_workorder.accepted_payload_paths.success_refs_path
        .supplemental_operator_payload_refs,
      ['evidence_refs'],
    );
    assert.equal(recordRoute.payload_workorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
    assert.equal(recordRoute.payload_workorder.authority_boundary.can_generate_domain_owner_receipt, false);
    assert.equal(recordRoute.payload_workorder.empty_payload_template_is_success_evidence, false);
    assert.equal(recordRoute.required_closeout_binding.closeout_binding_ready, true);
    assert.deepEqual(recordRoute.required_closeout_binding.missing_required_fields, []);
    assert.deepEqual(recordRoute.payload_template.owner_delta_result.closeout_binding, {
      surface_kind: 'opl_stage_run_closeout_binding',
      trusted_opl_execution_authorization: true,
      bound_to_stage_run: true,
      bound_to_stage_manifest: true,
      bound_to_current_pointer: true,
      bound_to_source_fingerprint: true,
      stage_run_id: stageRunId,
      stage_manifest_ref: stageManifestRef,
      current_pointer_ref: currentPointerRef,
      source_fingerprint: 'sha256:domain-dispatch-evidence',
      idempotency_key: idempotencyKey,
      provider_attempt_ref: providerAttemptRef,
      attempt_lease_ref: attemptLeaseRef,
      execution_authorization_decision_ref: executionAuthorizationDecisionRef,
    });
    assert.deepEqual(recordRoute.payload_workorder.success_refs_path_payload, {
      domain_receipt_refs: ['<medautoscience-owner-receipt-ref>'],
      typed_blocker_refs: [],
      no_regression_refs: ['<medautoscience-no-regression-ref>'],
      owner_chain_refs: ['<medautoscience-owner-chain-ref>'],
      evidence_refs: [],
      owner_delta_result: {
        closeout_binding: recordRoute.required_closeout_binding.closeout_binding,
      },
    });
    assert.deepEqual(recordRoute.payload_workorder.typed_blocker_path_payload, {
      domain_receipt_refs: [],
      typed_blocker_refs: ['<medautoscience-typed-blocker-ref>'],
      no_regression_refs: [],
      owner_chain_refs: [],
      evidence_refs: [],
      owner_delta_result: {
        closeout_binding: recordRoute.required_closeout_binding.closeout_binding,
      },
    });
    assert.deepEqual(recordRoute.payload_template, {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      no_regression_refs: [],
      owner_chain_refs: [],
      evidence_refs: [],
      owner_delta_result: {
        closeout_binding: recordRoute.required_closeout_binding.closeout_binding,
      },
    });

    const openEnvelope = projection.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === `domain_dispatch:med-autoscience:${attemptId}`,
    );
    assert.equal(openEnvelope.status, 'open');
    assert.equal(openEnvelope.next_route, recordRoute.ref);
    const bridgeRecordRoute = projection.app_execution_bridge.safe_action_routes.find(
      (ref: { action_id: string }) => ref.action_id === recordActionId,
    );
    assert.equal(bridgeRecordRoute.action_kind, 'domain_dispatch_evidence_receipt_record');
    assert.equal(
      bridgeRecordRoute.payload_workorder.surface_kind,
      'opl_domain_dispatch_evidence_payload_workorder',
    );
    assert.deepEqual(
      bridgeRecordRoute.payload_workorder.accepted_payload_paths.typed_blocker_path.required_operator_payload_refs,
      ['typed_blocker_refs'],
    );
    assert.deepEqual(
      bridgeRecordRoute.payload_workorder.typed_blocker_path_payload,
      recordRoute.payload_workorder.typed_blocker_path_payload,
    );
    assert.equal(bridgeRecordRoute.accepted_payload_paths.typed_blocker_path.success_claimed, false);
    assert.equal(
      bridgeRecordRoute.payload_preflight_policy,
      'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
    );
    assert.equal(
      bridgeRecordRoute.identity_binding_policy,
      'record_payload_identity_must_not_conflict_with_stage_attempt_target_identity',
    );
    assert.equal(
      bridgeRecordRoute.payload_workorder.authority_boundary.can_generate_domain_owner_receipt,
      false,
    );
    assert.equal(bridgeRecordRoute.can_write_domain_truth, false);
    assert.equal(bridgeRecordRoute.can_create_owner_receipt, false);
    assert.equal(bridgeRecordRoute.can_close_domain_ready, false);
    assert.equal(bridgeRecordRoute.can_claim_production_ready, false);
    const openWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    const openDispatchPacket = openWorklist.domain_dispatch_evidence_workorder_packet;
    assert.equal(openDispatchPacket.surface_kind, 'opl_domain_dispatch_evidence_workorder_packet');
    assert.equal(openDispatchPacket.summary.workorder_count, 1);
    assert.equal(openDispatchPacket.summary.route_requires_domain_or_app_payload_count, 1);
    assert.equal(openDispatchPacket.summary.success_payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(openDispatchPacket.summary.payload_workorder_count, 1);
    assert.equal(openDispatchPacket.summary.payload_preflight_policy_count, 1);
    assert.equal(
      openDispatchPacket.summary.accepted_payload_path_policy,
      'success_refs_path_or_typed_blocker_path_empty_template_blocks',
    );
    assert.equal(openWorklist.domain_dispatch_evidence_workorder_attention_items.length, 1);
    const openDispatchWorkorder = openDispatchPacket.workorders[0];
    assert.equal(openDispatchWorkorder.action_id, recordActionId);
    assert.equal(openDispatchWorkorder.action_kind, 'domain_dispatch_evidence_receipt_record');
    assert.equal(openDispatchWorkorder.canonical_domain_id, 'med-autoscience');
    assert.equal(openDispatchWorkorder.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(openDispatchWorkorder.route_requires_domain_or_app_payload, true);
    assert.equal(openDispatchWorkorder.can_close_without_domain_or_app_payload, false);
    assert.equal(openDispatchWorkorder.can_execute, false);
    assert.equal(openDispatchWorkorder.creates_domain_action, false);
    assert.equal(openDispatchWorkorder.creates_owner_receipt, false);
    assert.equal(
      openDispatchWorkorder.payload_workorder.required_closeout_binding.closeout_binding_ready,
      true,
    );
    assert.deepEqual(
      openDispatchWorkorder.payload_workorder.required_closeout_binding.closeout_binding,
      recordRoute.required_closeout_binding.closeout_binding,
    );
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('domain_receipt_refs'), true);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('typed_blocker_refs'), true);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('owner_chain_refs'), true);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('no_regression_refs'), true);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('evidence_refs'), false);
    assert.deepEqual(openDispatchWorkorder.supplemental_operator_payload_refs, ['evidence_refs']);
    assert.equal(openDispatchWorkorder.payload_ref_hints.required_any_payload_refs.includes('evidence_refs'), false);
    assert.deepEqual(openDispatchWorkorder.payload_ref_hints.supplemental_payload_refs, ['evidence_refs']);
    assert.deepEqual(
      openDispatchWorkorder.payload_workorder.success_refs_path_payload,
      recordRoute.payload_workorder.success_refs_path_payload,
    );
    assert.deepEqual(
      openDispatchWorkorder.payload_workorder.typed_blocker_path_payload,
      recordRoute.payload_workorder.typed_blocker_path_payload,
    );
    assert.equal(openDispatchWorkorder.typed_blocker_payload_path_available, true);
    assert.equal(openDispatchWorkorder.owner_receipt_payload_path_available, true);
    assert.equal(openDispatchWorkorder.owner_chain_payload_path_available, true);
    assert.equal(openDispatchWorkorder.no_regression_payload_path_available, true);
    assert.equal(openDispatchWorkorder.evidence_payload_path_available, false);
    assert.equal(openDispatchWorkorder.supplemental_evidence_payload_available, true);
    assert.equal(
      openDispatchWorkorder.payload_path_policy,
      'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
    );
    assert.equal(
      openDispatchWorkorder.payload_preflight_policy,
      'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
    );
    assert.equal(openDispatchWorkorder.payload_preflight_error_code, 'cli_usage_error');
    assert.equal(
      openDispatchWorkorder.payload_preflight_blocked_error_kind,
      'domain_dispatch_evidence_payload_preflight_blocked',
    );
    assert.equal(openDispatchWorkorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
    const openDispatchAttentionItem = openWorklist.attention_queue.find(
      (item: { item_id: string }) => item.item_id === `evidence-worklist:${recordActionId}`,
    );
    assert.ok(openDispatchAttentionItem);
    assert.equal(openDispatchAttentionItem.owner, 'med-autoscience');
    assert.equal(openDispatchAttentionItem.domain_id, 'medautoscience');
    assert.equal(openDispatchAttentionItem.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(openDispatchAttentionItem.route_requires_domain_or_app_payload, true);
    assert.equal(openDispatchAttentionItem.authority, 'operator_attention_only');
    assert.equal(openDispatchAttentionItem.can_write_domain_truth, false);
    assert.equal(openDispatchAttentionItem.can_create_owner_receipt, false);
    assert.equal(openDispatchAttentionItem.can_claim_production_ready, false);
    assert.equal(openDispatchPacket.authority_boundary.can_generate_domain_owner_receipt, false);
    assert.equal(openDispatchPacket.authority_boundary.can_execute_domain_action, false);
    assert.equal(openDispatchPacket.authority_boundary.closes_domain_ready, false);
    assert.equal(openDispatchPacket.authority_boundary.closes_production_ready, false);

    const blockedTemplateExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify(recordRoute.payload_template),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(blockedTemplateExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      blockedTemplateExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_payload_preflight_blocked',
    );
    assert.equal(blockedTemplateExecution.payload.error.details.preflight.status, 'blocked');
    assert.equal(
      blockedTemplateExecution.payload.error.details.preflight.selected_payload_path,
      'blocked',
    );
    assert.deepEqual(
      blockedTemplateExecution.payload.error.details.preflight.missing_payload_fields,
      ['domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs'],
    );

    const placeholderExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        domain_receipt_refs: ['<medautoscience-owner-receipt-ref>'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.deepEqual(
      placeholderExecution.payload.error.details.preflight.forbidden_placeholder_refs,
      ['<medautoscience-owner-receipt-ref>'],
    );

    const evidenceOnlyExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        evidence_refs: ['mas://evidence/domain-dispatch-supporting-context.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(evidenceOnlyExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      evidenceOnlyExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_payload_preflight_blocked',
    );
    assert.equal(evidenceOnlyExecution.payload.error.details.preflight.selected_payload_path, 'blocked');
    assert.equal(
      evidenceOnlyExecution.payload.error.details.preflight.accepted_ref_counts.evidence_refs,
      1,
    );
    assert.deepEqual(
      evidenceOnlyExecution.payload.error.details.preflight.missing_payload_fields,
      ['domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs'],
    );

    const successPayload = {
      domain_receipt_refs: ['mas://receipts/domain-dispatch-owner.json'],
      owner_chain_refs: ['mas://owner-chain/domain-dispatch.json'],
      no_regression_refs: ['mas://proof/domain-dispatch-no-regression.json'],
      owner_delta_result: {
        closeout_binding: recordRoute.required_closeout_binding.closeout_binding,
      },
    };
    const successDryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--dry-run',
      '--payload',
      JSON.stringify(successPayload),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(successDryRun.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(successDryRun.execution.execution_status, 'dry_run');
    assert.equal(successDryRun.execution.result.domain_dispatch_evidence_payload_preflight.status, 'ready_to_record');
    assert.equal(
      successDryRun.execution.result.domain_dispatch_evidence_payload_preflight.selected_payload_path,
      'success_refs_path',
    );

    const afterSuccessDryRunDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const afterSuccessDryRunAttempt = afterSuccessDryRunDrilldown.domain_dispatch_evidence.attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === attemptId,
    );
    assert.equal(afterSuccessDryRunAttempt.dispatch_evidence_receipt_status, 'missing');
    assert.deepEqual(afterSuccessDryRunAttempt.dispatch_evidence_receipt_refs, []);
    assert.equal(
      afterSuccessDryRunDrilldown.operator_action_routing_refs.refs.some(
        (ref: { action_id: string }) => ref.action_id === recordActionId,
      ),
      true,
    );
    assert.equal(
      afterSuccessDryRunDrilldown.operator_action_routing_refs.refs.some(
        (ref: { action_id: string }) => ref.action_id === verifyActionId,
      ),
      false,
    );

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify(successPayload),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(recordExecution.execution.result.domain_dispatch_evidence_payload_preflight.status, 'ready_to_record');
    assert.equal(
      recordExecution.execution.result.domain_dispatch_evidence_payload_preflight.selected_payload_path,
      'success_refs_path',
    );
    assert.equal(recordExecution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(recordExecution.execution.result.external_evidence_apply.authority_boundary.opl_records_refs_only, true);
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);

    const recordedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(recordedDrilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
    assert.equal(
      recordedDrilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      0,
    );
    assert.equal(recordedDrilldown.summary.domain_dispatch_evidence_receipt_record_payload_template_count, 0);
    const verifyRoute = recordedDrilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === verifyActionId,
    );
    assert.equal(verifyRoute.action_kind, 'domain_dispatch_evidence_receipt_verify');
    assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);
    assert.equal(verifyRoute.can_close_without_domain_or_app_payload, true);
    assert.equal(verifyRoute.payload_owner, 'opl_external_evidence_ledger');
    assert.equal(verifyRoute.creates_owner_receipt, false);
    assert.equal(verifyRoute.authority_boundary.closes_domain_ready, false);
    assert.equal(verifyRoute.authority_boundary.closes_production_ready, false);
    const recordedAttempt = recordedDrilldown.domain_dispatch_evidence.attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === attemptId,
    );
    assert.equal(recordedAttempt.dispatch_evidence_receipt_status, 'recorded');
    assert.deepEqual(recordedAttempt.owner_receipt_refs, []);
    assert.deepEqual(recordedAttempt.typed_blocker_refs, []);
    const recordedWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    const domainDispatchWorklistItem = recordedWorklist.worklist_items.find(
      (item: { action_id: string }) => item.action_id === verifyActionId,
    );
    assert.equal(domainDispatchWorklistItem.claim_scope, 'domain_dispatch_evidence_receipt');
    assert.equal(domainDispatchWorklistItem.status, 'open_safe_action_request_route_available');
    assert.equal(domainDispatchWorklistItem.route_requires_domain_or_app_payload, false);
    assert.equal(recordedWorklist.summary.domain_dispatch_evidence_receipt_item_count >= 1, true);
    assert.equal(recordedWorklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 0);
    assert.equal(
      recordedWorklist.domain_dispatch_evidence_workorder_attention_items.length,
      0,
    );

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      verifyActionId,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(verifyExecution.execution.result.external_evidence_apply.status, 'verified');
    assert.deepEqual(verifyExecution.execution.result.external_evidence_apply.receipt.receipt_refs, [
      'mas://receipts/domain-dispatch-owner.json',
    ]);
    assert.deepEqual(verifyExecution.execution.result.external_evidence_apply.receipt.owner_chain_refs, [
      'mas://owner-chain/domain-dispatch.json',
    ]);

    const verifiedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const verifiedAttempt = verifiedDrilldown.domain_dispatch_evidence.attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id === attemptId,
    );
    assert.equal(verifiedAttempt.dispatch_evidence_receipt_status, 'verified');
    assert.deepEqual(verifiedAttempt.owner_receipt_refs, [
      'mas://receipts/domain-dispatch-owner.json',
      'mas://owner-chain/domain-dispatch.json',
    ]);
    assert.deepEqual(verifiedAttempt.no_regression_evidence_refs, [
      'mas://proof/domain-dispatch-no-regression.json',
    ]);
    const verifiedWorklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    const closedWorklistItem = verifiedWorklist.worklist_items.find(
      (item: { action_id: string }) => item.action_id === verifyActionId,
    );
    assert.equal(closedWorklistItem.claim_scope, 'domain_dispatch_evidence_receipt');
    assert.equal(closedWorklistItem.status, 'closed_by_receipt_ref');
    assert.equal(closedWorklistItem.worklist_status_detail, 'closed_by_opl_external_evidence_ledger_receipt');
    assert.equal(closedWorklistItem.freshness_ref, '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence');
    assert.equal(closedWorklistItem.not_authorized_claims.includes('production_ready'), true);
    const closedEnvelope = verifiedDrilldown.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === `domain_dispatch:med-autoscience:${attemptId}`,
    );
    assert.equal(closedEnvelope.status, 'closed');
    assert.equal(closedEnvelope.next_route, null);
    assert.equal(verifiedDrilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 0);
    assert.equal(
      verifiedDrilldown.operator_action_routing_refs.refs.some(
        (ref: { action_id: string }) => ref.action_id === recordActionId || ref.action_id === verifyActionId,
      ),
      false,
    );

    const staleRecordRouteExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        domain_receipt_refs: ['mas://receipts/domain-dispatch-owner.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(staleRecordRouteExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      staleRecordRouteExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_action_route_closed',
    );
    assert.equal(staleRecordRouteExecution.payload.error.details.action_id, recordActionId);
    assert.equal(staleRecordRouteExecution.payload.error.details.stage_attempt_id, attemptId);
    assert.equal(staleRecordRouteExecution.payload.error.details.dispatch_evidence_receipt_status, 'verified');
    assert.equal(
      staleRecordRouteExecution.payload.error.details.current_receipt_ref,
      `opl://external-evidence/medautoscience/domain_dispatch:medautoscience:${attemptId}`,
    );
    assert.equal(staleRecordRouteExecution.payload.error.details.can_claim_domain_ready, false);
    assert.equal(staleRecordRouteExecution.payload.error.details.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
