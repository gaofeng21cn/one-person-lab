import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

test('runtime action execute routes domain actions through the OPL typed queue instead of direct domain execution', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-domain-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts"}',
      '--task',
      'task-action-execute',
      '--source-fingerprint',
      'sha256:action-execute-domain',
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
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:write-closeout"],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"repair_command":"medautosci sidecar dispatch --task <task.json> --format json"}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `action:${attemptId}:domain-repair-command:0`,
      '--payload',
      '{"reason":"operator_selected"}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.surface_kind, 'opl_runtime_operator_action_execution');
    assert.equal(execution.execution.execution_kind, 'domain_action_typed_queue_handoff');
    assert.equal(execution.execution.execution_status, 'queued');
    assert.equal(execution.execution.approval_policy, 'queued_waiting_approval');
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
    assert.equal(execution.route.execution_policy, 'opl_safe_action_shell');
    assert.equal(execution.route.execution_surface, 'opl runtime action execute');
    assert.equal(execution.execution.result.family_runtime_enqueue.task.status, 'waiting_approval');
    assert.equal(
      execution.execution.result.family_runtime_enqueue.task.payload.command_or_surface_ref,
      'medautosci sidecar dispatch --task <task.json> --format json',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute records and verifies domain dispatch evidence receipts through OPL ledger only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-domain-dispatch-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
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
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts"}',
      '--task',
      'task-domain-dispatch-evidence',
      '--source-fingerprint',
      'sha256:domain-dispatch-evidence',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
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
          repair_command: 'medautosci sidecar dispatch --task <task.json> --format json',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const recordActionId = `domain_dispatch:medautoscience:${attemptId}:record`;
    const verifyActionId = `domain_dispatch:medautoscience:${attemptId}:verify`;
    const recordRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === recordActionId,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      1,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_record_payload_template_count, 1);
    assert.equal(recordRoute.action_kind, 'domain_dispatch_evidence_receipt_record');
    assert.equal(recordRoute.request_id, `domain_dispatch:medautoscience:${attemptId}`);
    assert.equal(recordRoute.request_pack_id, 'medautoscience.domain_dispatch_evidence');
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
    assert.equal(recordRoute.payload_workorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
    assert.equal(recordRoute.payload_workorder.authority_boundary.can_generate_domain_owner_receipt, false);
    assert.equal(recordRoute.payload_workorder.empty_payload_template_is_success_evidence, false);
    assert.deepEqual(recordRoute.payload_template, {
      domain_receipt_refs: [],
      typed_blocker_refs: [],
      no_regression_refs: [],
      owner_chain_refs: [],
      evidence_refs: [],
    });

    const openEnvelope = drilldown.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === `domain_dispatch:med-autoscience:${attemptId}`,
    );
    assert.equal(openEnvelope.status, 'open');
    assert.equal(openEnvelope.next_route, recordRoute.ref);
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
    assert.equal(openDispatchWorkorder.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(openDispatchWorkorder.route_requires_domain_or_app_payload, true);
    assert.equal(openDispatchWorkorder.can_close_without_domain_or_app_payload, false);
    assert.equal(openDispatchWorkorder.can_execute, false);
    assert.equal(openDispatchWorkorder.creates_domain_action, false);
    assert.equal(openDispatchWorkorder.creates_owner_receipt, false);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('domain_receipt_refs'), true);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('typed_blocker_refs'), true);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('owner_chain_refs'), true);
    assert.equal(openDispatchWorkorder.required_operator_payload_refs.includes('no_regression_refs'), true);
    assert.equal(openDispatchWorkorder.typed_blocker_payload_path_available, true);
    assert.equal(openDispatchWorkorder.owner_receipt_payload_path_available, true);
    assert.equal(openDispatchWorkorder.owner_chain_payload_path_available, true);
    assert.equal(openDispatchWorkorder.no_regression_payload_path_available, true);
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
      ['domain_receipt_refs_or_typed_blocker_refs_or_owner_chain_refs_or_no_regression_refs_or_evidence_refs'],
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

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        domain_receipt_refs: ['mas://receipts/domain-dispatch-owner.json'],
        owner_chain_refs: ['mas://owner-chain/domain-dispatch.json'],
        no_regression_refs: ['mas://proof/domain-dispatch-no-regression.json'],
      }),
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
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute blocks domain dispatch evidence payloads bound to a different attempt identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-domain-dispatch-conflict-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'publication_aftercare/reviewer-refresh',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        surface_kind: 'opl_provider_hosted_task_workspace_locator',
        task_kind: 'publication_aftercare/reviewer-refresh',
        study_id: '002-dm-china-us-mortality-attribution',
        profile: '/tmp/dm-cvd/profile.toml',
      }),
      '--task',
      'task-domain-dispatch-identity-conflict',
      '--source-fingerprint',
      '95d9b5310c9c7a8d',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:reviewer-refresh-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          repair_command: 'medautosci sidecar dispatch --task <task.json> --format json',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const recordActionId = `domain_dispatch:medautoscience:${attemptId}:record`;
    const blockedExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        study_id: '001-lineage-pfs',
        task_kind: 'publication_aftercare/reviewer-refresh',
        source_fingerprint: 'a6ff1097861ed2ae',
        typed_blocker_refs: ['mas://typed-blockers/nfpitnet-001/reviewer-refresh-pending'],
        owner_chain_refs: ['mas://owner-chain/nfpitnet-001/reviewer-refresh.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    assert.equal(blockedExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      blockedExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_receipt_conflict',
    );
    assert.equal(blockedExecution.payload.error.details.preflight.status, 'blocked');
    assert.deepEqual(
      blockedExecution.payload.error.details.preflight.identity_conflicts.map((
        conflict: { field: string },
      ) => conflict.field),
      ['study_id', 'source_fingerprint'],
    );

    const afterBlockedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const attempt = afterBlockedDrilldown.domain_dispatch_evidence.attempts.find(
      (entry: { stage_attempt_id: string }) => entry.stage_attempt_id === attemptId,
    );
    assert.equal(attempt.dispatch_evidence_receipt_status, 'missing');
    assert.deepEqual(attempt.dispatch_evidence_receipt_refs, []);

    const matchedExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        study_id: '002-dm-china-us-mortality-attribution',
        task_kind: 'publication_aftercare/reviewer-refresh',
        source_fingerprint: '95d9b5310c9c7a8d',
        typed_blocker_refs: ['mas://typed-blockers/dm-cvd/reviewer-refresh-pending'],
        owner_chain_refs: ['mas://owner-chain/dm-cvd/reviewer-refresh.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(
      matchedExecution.execution.result.domain_dispatch_evidence_payload_preflight.status,
      'ready_to_record',
    );
    assert.equal(
      matchedExecution.execution.result.domain_dispatch_evidence_payload_preflight.identity_binding.status,
      'matched',
    );
    assert.equal(matchedExecution.execution.result.external_evidence_apply.status, 'recorded');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute can execute OPL-owned attempt query routes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-query-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'draft',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mag"}',
      '--source-fingerprint',
      'sha256:action-execute-query',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      `action:${attemptId}:attempt-query`,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_internal');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt_query.stage_attempt_query.attempt.stage_attempt_id,
      attemptId,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute can create OPL-owned stage production attempt requests', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-stage-production-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.family_stage_control_plane = {
    surface_kind: 'family_stage_control_plane',
    version: 'family-stage-control-plane.v1',
    plane_id: 'med_autoscience_stage_control_plane',
    target_domain_id: 'med-autoscience',
    owner: 'med-autoscience',
    authority_boundary: { opl_role: 'projection_consumer_only' },
    stages: [
      {
        stage_id: 'review',
        stage_kind: 'review',
        title: 'Review',
        summary: 'Review from draft refs.',
        goal: 'Return review refs under MAS authority.',
        owner: 'med-autoscience',
        domain_stage_refs: ['review'],
        inputs: [],
        knowledge_refs: [],
        skills: [],
        prompt_refs: [],
        allowed_action_refs: [],
        outputs: [],
        evaluation: [],
        handoff: null,
        source_refs: [],
        freshness: null,
        action_parity: null,
        stage_contract: {
          requires: ['draft_ready'],
          ensures: ['review_ready'],
          boundary_assumptions: ['reviewer_judgment_is_domain_owned'],
          properties: [],
          runtime_event_refs: ['runtime_event:review.receipt_recorded'],
          runtime_assumptions: [],
          monitor_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'monitor' }],
          source_scope_refs: [{ ref_kind: 'source_ref', ref: 'source:review', role: 'source_scope' }],
          cohort_query_refs: [{ ref_kind: 'query_ref', ref: 'cohort:review/current', role: 'cohort_query' }],
          trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:review/current', role: 'trigger' }],
          metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:review/currentness', role: 'metric' }],
          dashboard_metric_refs: [],
          artifact_scope_refs: [],
          workspace_scope_refs: [],
        },
        trust_boundary: {
          lane: 'domain_agent',
          static_check_eligible: false,
          effect_boundary: true,
          records_runtime_events: true,
          runtime_event_refs: [],
          owner_receipt_required: true,
        },
        authority_boundary: {
          opl_role: 'projection_consumer_only',
          expected_receipt_refs: ['mas:review-receipt'],
          can_authorize_quality_verdict: false,
        },
      },
    ],
    notes: [],
  };
  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-attempt:medautoscience:review',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(dryRun.execution.execution_kind, 'opl_cli_stage_attempt_create');
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(dryRun.route.route_status, 'request_route_available');
    assert.equal(dryRun.route.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(dryRun.route.creates_domain_action, false);
    assert.equal(dryRun.route.creates_owner_receipt, false);
    assert.deepEqual(dryRun.route.owner_receipt_refs, []);
    assert.equal(dryRun.route.closes_expected_receipt_refs, false);
    assert.equal(dryRun.route.closes_monitor_freshness, false);
    assert.equal(dryRun.execution.result, null);
    assert.equal(
      dryRun.execution.executed_runtime_command.includes('opl family-runtime attempt create --domain medautoscience --stage review'),
      true,
    );

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-attempt:medautoscience:review',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_stage_attempt_create');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(execution.route.route_status, 'request_route_available');
    assert.equal(execution.route.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(execution.route.creates_domain_action, false);
    assert.equal(execution.route.creates_owner_receipt, false);
    assert.deepEqual(execution.route.owner_receipt_refs, []);
    assert.equal(execution.route.closes_expected_receipt_refs, false);
    assert.equal(execution.route.closes_monitor_freshness, false);
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
    assert.equal(execution.route.route_status, 'request_route_available');
    assert.equal(execution.route.request_scope, 'opl_owned_stage_attempt_request_only');
    assert.equal(execution.route.creates_domain_action, false);
    assert.equal(execution.route.creates_owner_receipt, false);
    assert.deepEqual(execution.route.owner_receipt_refs, []);
    assert.equal(execution.route.closes_expected_receipt_refs, false);
    assert.equal(execution.route.closes_monitor_freshness, false);
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.domain_id,
      'medautoscience',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.stage_id,
      'review',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.provider_kind,
      'temporal',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.attempt.executor_kind,
      'codex_cli',
    );
    assert.equal(
      execution.execution.result.family_runtime_stage_attempt.launch_invocation.executor_binding_ref,
      'opl://executors/codex-cli/default',
    );

    const startDryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-attempt-start:medautoscience:review',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(startDryRun.execution.execution_kind, 'opl_cli_stage_attempt_create_and_start');
    assert.equal(startDryRun.execution.execution_status, 'dry_run');
    assert.equal(startDryRun.execution.executed_runtime_command.includes('opl family-runtime attempt start'), true);
    assert.equal(startDryRun.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
