import { assert, buildManifestCommand, createFamilyContractsFixtureRoot, fs, loadFamilyManifestFixtures, os, path, repoRoot, runCli, test } from '../helpers.ts';
import {
  STANDARD_PROGRESS_DELTA_POLICY,
  STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
} from '../../../../src/standard-domain-agent-scaffold-constants.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime stage attempt create is idempotent by semantic attempt key unless explicitly bypassed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-idem-'));
  const createArgs = [
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'scout',
    '--provider',
    'local_sqlite',
    '--workspace-locator',
    '{"workspace_root":"/tmp/mas"}',
    '--source-fingerprint',
    'sha256:scout',
    '--task',
    'task-1',
  ];
  try {
    const first = runCli(createArgs, familyRuntimeEnv(stateRoot));
    const second = runCli(createArgs, familyRuntimeEnv(stateRoot));
    const third = runCli([...createArgs, '--new-attempt'], familyRuntimeEnv(stateRoot));
    const attempts = runCli(['family-runtime', 'attempt', 'list'], familyRuntimeEnv(stateRoot));

    assert.equal(first.family_runtime_stage_attempt.created, true);
    assert.equal(first.family_runtime_stage_attempt.idempotent_noop, false);
    assert.equal(second.family_runtime_stage_attempt.created, false);
    assert.equal(second.family_runtime_stage_attempt.idempotent_noop, true);
    assert.equal(
      second.family_runtime_stage_attempt.conflict_or_blocker_envelopes[0].classification,
      'duplicate_task',
    );
    assert.equal(
      second.family_runtime_stage_attempt.conflict_or_blocker_envelopes[0].identity.source_fingerprint,
      'sha256:scout',
    );
    assert.equal(
      second.family_runtime_stage_attempt.conflict_or_blocker_envelopes[0].identity.idempotency_key,
      first.family_runtime_stage_attempt.attempt.idempotency_key,
    );
    assert.equal(
      second.family_runtime_stage_attempt.attempt.stage_attempt_id,
      first.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.equal(third.family_runtime_stage_attempt.created, true);
    assert.equal(third.family_runtime_stage_attempt.idempotent_noop, false);
    assert.notEqual(
      third.family_runtime_stage_attempt.attempt.stage_attempt_id,
      first.family_runtime_stage_attempt.attempt.stage_attempt_id,
    );
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 2);
    assert.equal(
      first.family_runtime_stage_attempt.attempt.idempotency_key,
      second.family_runtime_stage_attempt.attempt.idempotency_key,
    );
    assert.notEqual(
      first.family_runtime_stage_attempt.attempt.idempotency_key,
      third.family_runtime_stage_attempt.attempt.idempotency_key,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime stage attempt admits OPL Meta Agent stage-decomposition attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-oma-attempt-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'opl-meta-agent',
      '--stage',
      'stage-decomposition',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/oma","stage_packet_path":"/tmp/oma/stage-decomposition-input.json"}',
      '--checkpoint-ref',
      'stage-packet:opl-meta-agent/research-workbench-agent/stage-decomposition',
      '--source-fingerprint',
      'oma:build-agent-baseline:research-workbench-agent',
      '--new-attempt',
    ], familyRuntimeEnv(stateRoot));

    const attempt = created.family_runtime_stage_attempt.attempt;
    assert.equal(attempt.domain_id, 'opl-meta-agent');
    assert.equal(attempt.stage_id, 'stage-decomposition');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.status, 'queued');
    assert.deepEqual(attempt.checkpoint_refs, [
      'stage-packet:opl-meta-agent/research-workbench-agent/stage-decomposition',
    ]);

    const closeoutPacket = {
      surface_kind: 'stage_attempt_closeout_packet',
      closeout_refs: ['receipt:opl-meta-agent/research-workbench-agent/stage-decomposition-pack-draft'],
      consumed_refs: ['stage-packet:opl-meta-agent/research-workbench-agent/stage-decomposition'],
      next_owner: 'opl-meta-agent',
      domain_ready_verdict: 'domain_gate_pending',
    };
    const fixtureRun = runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.stage_attempt_id,
      '--stage-packet-ref',
      'stage-packet:opl-meta-agent/research-workbench-agent/stage-decomposition',
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], familyRuntimeEnv(stateRoot));
    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.status, 'completed');

    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    assert.equal(query.family_runtime_stage_attempt_query.stage_attempt_query.attempt.domain_id, 'opl-meta-agent');
    assert.deepEqual(query.family_runtime_stage_attempt_query.stage_attempt_query.attempt.closeout_refs, closeoutPacket.closeout_refs);
    assert.equal(query.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion, 'completed');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt create projects launch invocation and gates non-default executor binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-launch-invocation-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const fixtures = loadFamilyManifestFixtures();
  const masManifest = {
    ...fixtures.medautoscience,
    family_stage_control_plane: {
      surface_kind: 'family_stage_control_plane',
      version: 'family-stage-control-plane.v1',
      plane_id: 'med_autoscience_stage_control_plane',
      target_domain_id: 'med-autoscience',
      owner: 'med-autoscience',
      authority_boundary: { opl_role: 'projection_consumer_only' },
      stages: [
        {
          stage_id: 'scout',
          stage_kind: 'planning',
          title: 'Scout',
          summary: 'Plan from explicit source refs.',
          goal: 'Prepare an admitted planning stage under MAS authority.',
          owner: 'med-autoscience',
          domain_stage_refs: ['scout'],
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
            requires: ['sources_ready'],
            ensures: ['plan_ready'],
            progress_delta_policy: STANDARD_PROGRESS_DELTA_POLICY,
            typed_blocker_lineage_policy: STANDARD_TYPED_BLOCKER_LINEAGE_POLICY,
            boundary_assumptions: ['domain_truth_remains_domain_owned'],
            properties: [],
            runtime_assumptions: [],
            monitor_refs: [],
            source_scope_refs: [{ ref_kind: 'json_pointer', ref: '/source_scope/scout', role: 'launch_source_scope' }],
            cohort_query_refs: [{ ref_kind: 'json_pointer', ref: '/cohort_query/scout', role: 'cohort_query' }],
            trigger_refs: [{ ref_kind: 'queue_ref', ref: 'queue:mas/scout', role: 'launch_trigger' }],
            metric_refs: [{ ref_kind: 'metric_ref', ref: 'metric:mas/scout/freshness', role: 'cohort_metric' }],
            artifact_scope_refs: [],
            workspace_scope_refs: [],
          },
          trust_boundary: {
            lane: 'domain_agent',
            static_check_eligible: true,
            effect_boundary: false,
            records_runtime_events: false,
          },
          authority_boundary: { opl_role: 'projection_consumer_only', can_write_domain_truth: false },
        },
      ],
      notes: [],
    },
  };
  const baseArgs = [
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    'medautoscience',
    '--stage',
    'scout',
    '--provider',
    'local_sqlite',
    '--workspace-locator',
    '{"workspace_root":"/tmp/mas"}',
    '--source-fingerprint',
    'sha256:scout-launch',
    '--require-stage-admission',
  ];
  const env = familyRuntimeEnv(stateRoot, {
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  });
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
    ], env);

    const codex = runCli(baseArgs, env);
    const codexAttempt = codex.family_runtime_stage_attempt.attempt;
    const codexInvocation = codex.family_runtime_stage_attempt.launch_invocation;

    assert.equal(codexAttempt.status, 'queued');
    assert.equal(codexInvocation.surface_kind, 'opl_stage_launch_invocation');
    assert.equal(codexInvocation.invocation_mode, 'invocation');
    assert.deepEqual(codexInvocation.allowed_agent_actions, ['retrieve', 'select', 'bind', 'launch', 'deploy']);
    assert.equal(codexInvocation.bounded_edit_ref, null);
    assert.equal(codexInvocation.policy.stage_pack_launch_scope, 'approved_or_admitted_only');
    assert.equal(codexInvocation.policy.authoring_output, 'bounded_edit_ref_only');
    assert.equal(codexInvocation.selected_executor_kind, 'codex_cli');
    assert.equal(codexInvocation.executor_binding_status, 'default_codex_cli');
    assert.equal(codexInvocation.authority_boundary.executor_behavior_equivalence_claim, false);
    assert.equal(codexInvocation.authority_boundary.can_execute_stage, false);
    assert.equal(
      codexAttempt.activity_events.some((event: { event_kind: string }) =>
        event.event_kind === 'stage_launch_invocation'
      ),
      true,
    );

    const missingBinding = runCli([
      ...baseArgs,
      '--new-attempt',
      '--executor-kind',
      'hermes_agent',
    ], env);
    const missingInvocation = missingBinding.family_runtime_stage_attempt.launch_invocation;
    assert.equal(missingBinding.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(missingInvocation.executor_binding_status, 'missing_non_default_executor_binding');
    assert.equal(missingInvocation.blocker_reason, 'non_default_executor_binding_ref_missing');
    assert.equal(
      missingBinding.family_runtime_stage_attempt.conflict_or_blocker_envelopes.some((envelope: { reason: string }) =>
        envelope.reason === 'non_default_executor_binding_ref_missing'
      ),
      true,
    );

    const declaredBinding = runCli([
      ...baseArgs,
      '--new-attempt',
      '--executor-kind',
      'hermes_agent',
      '--executor-binding-ref',
      'executor-binding:hermes-agent/audit-demo',
    ], env);
    const declaredInvocation = declaredBinding.family_runtime_stage_attempt.launch_invocation;
    assert.equal(declaredBinding.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(declaredInvocation.executor_binding_status, 'explicit_executor_binding_declared');
    assert.equal(declaredInvocation.launch_refs.executor_binding_ref, 'executor-binding:hermes-agent/audit-demo');
    assert.equal(declaredInvocation.authority_boundary.graphflow_runtime_dependency, false);

    const authoringMissingRef = runCli([
      ...baseArgs,
      '--new-attempt',
      '--invocation-mode',
      'authoring',
    ], env);
    const authoringMissingInvocation = authoringMissingRef.family_runtime_stage_attempt.launch_invocation;
    assert.equal(authoringMissingRef.family_runtime_stage_attempt.attempt.status, 'blocked');
    assert.equal(authoringMissingInvocation.invocation_mode, 'authoring');
    assert.equal(authoringMissingInvocation.blocker_reason, 'agent_authoring_requires_bounded_edit_ref');
    assert.equal(authoringMissingInvocation.bounded_edit_ref, null);
    assert.equal(
      authoringMissingRef.family_runtime_stage_attempt.conflict_or_blocker_envelopes.some((envelope: { reason: string }) =>
        envelope.reason === 'agent_authoring_requires_bounded_edit_ref'
      ),
      true,
    );

    const authoringBoundedEdit = runCli([
      ...baseArgs,
      '--new-attempt',
      '--invocation-mode',
      'authoring',
      '--bounded-edit-ref',
      'bounded-edit:gfl/proposed-stage-pack-1',
    ], env);
    const boundedEditInvocation = authoringBoundedEdit.family_runtime_stage_attempt.launch_invocation;
    assert.equal(authoringBoundedEdit.family_runtime_stage_attempt.attempt.status, 'queued');
    assert.equal(boundedEditInvocation.invocation_mode, 'authoring');
    assert.equal(boundedEditInvocation.bounded_edit_ref, 'bounded-edit:gfl/proposed-stage-pack-1');
    assert.equal(boundedEditInvocation.launch_refs.bounded_edit_ref, 'bounded-edit:gfl/proposed-stage-pack-1');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query exposes blocked identity as typed envelopes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-blocked-envelope-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'closeout',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:blocked-closeout',
      '--blocked-reason',
      'typed_closeout_packet_required',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const stageQuery = query.family_runtime_stage_attempt_query.stage_attempt_query;

    assert.equal(stageQuery.canonical_outcome, 'blocked');
    assert.equal(
      stageQuery.conflict_or_blocker_envelopes[0].kind,
      'opl_conflict_or_blocker.v1',
    );
    assert.equal(
      stageQuery.conflict_or_blocker_envelopes.some((envelope: { classification: string }) =>
        envelope.classification === 'evidence_blocker'
      ),
      true,
    );
    assert.equal(
      stageQuery.operator_visibility.operator_conflicts.some((envelope: { reason: string }) =>
        envelope.reason === 'typed_closeout_packet_required'
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query classifies Codex unsupported function calls as OPL retryable blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-codex-tool-blocker-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--source-fingerprint',
      'sha256:codex-unsupported-function-call',
      '--blocked-reason',
      'codex_cli_unsupported_function_call',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], familyRuntimeEnv(stateRoot));
    const envelopes = query.family_runtime_stage_attempt_query.stage_attempt_query.conflict_or_blocker_envelopes;
    const retryable = envelopes.find((envelope: { reason: string }) =>
      envelope.reason === 'codex_cli_unsupported_function_call'
    );

    assert.equal(retryable.classification, 'execution_retryable');
    assert.equal(retryable.owner, 'infrastructure');
    assert.equal(retryable.authority, 'opl_runtime');
    assert.equal(retryable.status, 'retry_scheduled');
    assert.equal(retryable.operator_questions.automatic_retry, 'available');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime Temporal production proof writes provider SLO execution receipt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-provider-slo-receipt-'));
  try {
    const proof = runCli([
      'family-runtime',
      'residency',
      'proof',
      '--provider',
      'temporal',
      '--production',
    ], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }));
    const receipt = proof.family_runtime_residency_proof.provider_slo_execution_receipt;

    assert.equal(receipt.surface_kind, 'opl_temporal_provider_slo_execution_receipt');
    assert.equal(receipt.provider_kind, 'temporal');
    assert.equal(receipt.command, 'opl family-runtime residency proof --provider temporal --production');
    assert.equal(receipt.execution_policy, 'supervised_command_receipt_only');
    assert.equal(receipt.cadence_action.action_id, 'temporal-provider-production-proof-cadence');
    assert.equal(receipt.cadence_action.expected_event_type, 'temporal_provider_slo_execution_receipt');
    assert.equal(receipt.cadence_action.execution_policy, 'manual_or_supervised_no_auto_execution');
    assert.equal(receipt.cadence_action.max_proof_age_seconds, 86400);
    assert.equal(receipt.closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(receipt.receipt_status, 'blocked');
    assert.equal(receipt.cadence_action.authority_boundary.can_auto_execute, false);
    assert.equal(receipt.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);

    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const sloEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_provider_slo_execution_receipt'
    );
    const proofEvents = events.family_runtime_events.events.filter((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );

    assert.equal(sloEvents.length, 1);
    assert.equal(sloEvents[0].payload.surface_kind, 'opl_temporal_provider_slo_execution_receipt');
    assert.equal(sloEvents[0].payload.receipt_status, 'blocked');
    assert.equal(
      sloEvents[0].payload.cadence_action.expected_receipt_kind,
      'opl_temporal_provider_slo_execution_receipt',
    );
    assert.equal(proofEvents.length, 1);
    assert.equal(
      proofEvents[0].payload.provider_slo_execution_receipt.surface_kind,
      'opl_temporal_provider_slo_execution_receipt',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt query, signal, and fixture-run expose provider lifecycle without domain verdict ownership', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-query-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","runtime_root":"/tmp/mas/runtime","artifact_root":"/tmp/mas/artifacts","source_refs":["source:dataset"],"material_refs":["material:table1"],"missing_material_refs":["material:irb"],"restore_refs":["restore:mas-runtime-loop"]}',
      '--source-fingerprint',
      'sha256:analysis',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const queryBefore = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const humanGate = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'human_gate',
      '--payload',
      '{"human_gate_ref":"gate:analysis-review","reason":"needs_human_review"}',
    ], familyRuntimeEnv(stateRoot));
    const humanGateQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const resumed = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'resume',
      '--payload',
      '{"reason":"operator_resume"}',
    ], familyRuntimeEnv(stateRoot));
    const userInstruction = runCli([
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'user_instruction',
      '--payload',
      '{"instruction_ref":"user:revision-10","instruction_count":10}',
    ], familyRuntimeEnv(stateRoot));
    const fixtureRun = runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:analysis-campaign',
      '--checkpoint-ref',
      'checkpoint:analysis-slice-1',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_refs":["evidence:table1"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-analysis"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair","reason":"weak_primary_endpoint","next_owner":"med-autoscience","quality_ref":"publication_eval/latest.json","readiness_ref":"controller_decisions/latest.json","slo_ref":"slo:analysis-currentness","breached_slo_ids":["ai_reviewer_currentness"],"repair_command":"medautosci domain-handler dispatch --task <task.json> --format json","package_refs":["package:submission-minimal"],"export_refs":["export:current-package"],"gap_report_refs":["gap:package-readiness"],"handoff_refs":["handoff:manual-submission"]}}',
    ], familyRuntimeEnv(stateRoot));
    const queryAfter = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));

    assert.equal(queryBefore.family_runtime_stage_attempt_query.stage_attempt_query.workflow_contract, null);
    assert.equal(queryBefore.family_runtime_stage_attempt_query.temporal_query, null);
    assert.equal(
      queryBefore.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(humanGate.family_runtime_stage_attempt_signal.attempt.status, 'human_gate');
    assert.deepEqual(humanGate.family_runtime_stage_attempt_signal.attempt.human_gate_refs, ['gate:analysis-review']);
    assert.equal(
      humanGateQuery.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.human_gate_ledger[0].payload.reason,
      'needs_human_review',
    );
    assert.equal(
      humanGateQuery.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.operator_conflicts.some(
        (envelope: { classification: string }) => envelope.classification === 'human_gate',
      ),
      true,
    );
    assert.equal(resumed.family_runtime_stage_attempt_signal.attempt.status, 'queued');
    assert.equal(userInstruction.family_runtime_stage_attempt_signal.signal.signal_kind, 'user_instruction');
    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.provider_fixture_run.provider_completion, 'completed');
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.provider_fixture_run.domain_ready_verdict,
      'domain_gate_pending',
    );
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.closeout_receipt_status,
      'accepted_typed_closeout',
    );
    assert.equal(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.route_impact.decision, 'bounded_repair');
    assert.ok(fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.activity_events.length >= 2);
    assert.equal(
      fixtureRun.family_runtime_stage_attempt_fixture_run.attempt.activity_events.at(-1).activity_status,
      'completed',
    );
    assert.equal(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.next_owner, 'med-autoscience');
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.route_impact.decision,
      'bounded_repair',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.closeout_receipt_status,
      'accepted_typed_closeout',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.provider_run.provider_kind,
      'local_sqlite',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.codex_stage_activity_timeout_policy,
      null,
    );
    assert.ok(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.activity_events.length >= 2);
    assert.equal(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.signals.length, 3);
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.human_gate_ledger.length,
      1,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.user_instruction_ledger[0].payload.instruction_ref,
      'user:revision-10',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.resume_ledger[0].payload.reason,
      'operator_resume',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.rejected_writes[0].reason,
      'domain_truth_write_forbidden',
    );
    assert.equal(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.canonical_outcome, 'completed_with_receipt');
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.operator_visibility.operator_conflicts.some(
        (envelope: { classification: string }) => envelope.classification === 'authority_conflict',
      ),
      true,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.conflict_or_blocker_envelopes.some(
        (envelope: { reason: string }) => envelope.reason === 'domain_truth_write_forbidden',
      ),
      true,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.artifact_gallery.gallery_scope,
      'stage_attempt',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.artifact_gallery.authority_boundary.can_read_artifact_body,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.route_decision_graph.summary.route_decision_ref_observed,
      true,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.route_decision_graph.authority_boundary.can_infer_route_decision,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.review_repair_queue.summary.rejected_write_count,
      1,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.review_repair_queue.authority_boundary.can_decide_repair,
      false,
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.quality_readiness.quality_refs,
      ['publication_eval/latest.json'],
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.quality_readiness.readiness_refs,
      ['controller_decisions/latest.json'],
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.quality_readiness.authority_boundary.can_authorize_quality_verdict,
      false,
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.observability_slo.breached_slo_ids,
      ['ai_reviewer_currentness'],
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.observability_slo.repair_commands[0].command,
      'medautosci domain-handler dispatch --task <task.json> --format json',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.observability_slo.authority_boundary.can_execute_repair_command,
      false,
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.workspace_source_intake.source_refs,
      ['source:dataset'],
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.workspace_source_intake.material_refs,
      ['material:table1'],
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.workspace_source_intake.missing_material_attention_refs,
      ['material:irb'],
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.workspace_source_intake.authority_boundary.can_authorize_source_readiness,
      false,
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.memory_locator_index.consumed_memory_refs,
      ['memory:route-policy'],
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.memory_locator_index.authority_boundary.can_read_memory_body,
      false,
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.package_export_lifecycle.package_refs,
      ['package:submission-minimal'],
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.package_export_lifecycle.export_refs,
      ['export:current-package'],
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.package_export_lifecycle.authority_boundary.can_authorize_export_verdict,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.action_routing.summary.execution_policy,
      'opl_safe_action_shell',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.action_routing.actions.some((action: {
        route_target_kind: string;
        command_or_surface_ref: string;
      }) =>
        action.route_target_kind === 'domain_handler' &&
        action.command_or_surface_ref === 'medautosci domain-handler dispatch --task <task.json> --format json'
      ),
      true,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.action_routing.authority_boundary.can_execute_domain_action,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.action_routing.authority_boundary.can_execute_direct_skill,
      false,
    );
    assert.deepEqual(queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.artifact_locator_index, {
      locator_kind: 'workspace_runtime_artifact_locator',
      workspace_root: '/tmp/mas',
      runtime_root: '/tmp/mas/runtime',
      artifact_root: '/tmp/mas/artifacts',
      indexed_refs: [
        'receipt:analysis-closeout',
        'evidence:table1',
        'memory-writeback:receipt-analysis',
      ],
      indexed_ref_count: 3,
      content_policy: 'locator_only_no_artifact_content',
    });
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.retention_policy.opl_can_apply_retention,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.restore_proof.restore_gate_status,
      'restore_refs_declared',
    );
    assert.deepEqual(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.restore_proof.required_refs,
      [
        'restore:mas-runtime-loop',
        'receipt:analysis-closeout',
        'evidence:table1',
        'memory-writeback:receipt-analysis',
      ],
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.restore_proof.opl_cleanup_allowed,
      false,
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.lifecycle_primitives.authority_boundary.domain,
      'artifact_content_retention_restore_authority',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion,
      'completed',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.domain_ready_verdict,
      'domain_gate_pending',
    );
    assert.equal(
      queryAfter.family_runtime_stage_attempt_query.stage_attempt_query.completion_boundary.provider_completion_is_domain_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime lifecycle guarded apply separates OPL ledger apply from domain-owned cleanup blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-lifecycle-guarded-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'deliverable-review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/redcube',
        runtime_root: '/tmp/redcube/runtime',
        artifact_root: '/tmp/redcube/artifacts',
        restore_refs: ['restore:redcube-run-1'],
        lifecycle_apply_requests: [
          {
            action_id: 'opl-ledger-retention-index',
            action_kind: 'retention',
            target_ref: 'opl-ledger:redcube-run-1',
            authority_owner: 'opl_framework',
            owner_scope: 'opl_owned_ledger',
          },
          {
            action_id: 'redcube-artifact-cleanup',
            action_kind: 'cleanup',
            target_ref: 'artifact:redcube-final-deck',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
            restore_ref: 'restore:redcube-run-1',
          },
          {
            action_id: 'redcube-retention-restore-missing',
            action_kind: 'retention',
            target_ref: 'artifact:redcube-draft-cache',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
          },
          {
            action_id: 'redcube-domain-receipt-observed',
            action_kind: 'restore',
            target_ref: 'artifact:redcube-review-pdf',
            authority_owner: 'redcube_ai',
            owner_scope: 'domain_owned_artifact',
            domain_receipt_ref: 'redcube-receipt:restore-accepted',
            restore_ref: 'restore:redcube-run-1',
          },
        ],
      }),
      '--source-fingerprint',
      'sha256:lifecycle',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli([
      'family-runtime',
      'attempt',
      'query',
      attemptId,
    ], familyRuntimeEnv(stateRoot));
    const proof = query.family_runtime_stage_attempt_query.stage_attempt_query
      .lifecycle_primitives.guarded_apply_proof;

    assert.equal(proof.surface_kind, 'family_runtime_lifecycle_guarded_apply_proof');
    assert.equal(proof.apply_status, 'blocked_domain_receipt_required');
    assert.deepEqual(proof.summary, {
      requested_actions_count: 4,
      opl_apply_permitted_count: 1,
      domain_receipt_observed_count: 1,
      typed_blocker_count: 2,
      domain_writes_performed: false,
    });
    assert.equal(proof.actions[0].apply_decision, 'opl_apply_permitted');
    assert.equal(proof.actions[0].receipt_kind, 'opl_lifecycle_ledger_apply_receipt');
    assert.equal(proof.actions[1].apply_decision, 'typed_blocker');
    assert.equal(proof.actions[1].blocker.blocker_id, 'domain_owned_lifecycle_receipt_required');
    assert.equal(proof.actions[2].blocker.blocker_id, 'restore_ref_required_before_lifecycle_apply');
    assert.equal(proof.actions[3].apply_decision, 'domain_receipt_observed');
    assert.equal(proof.actions[3].opl_writes_domain_truth, false);
    assert.deepEqual(proof.authority_boundary.forbidden_opl_actions, [
      'delete_domain_artifact',
      'restore_domain_workspace_content',
      'apply_domain_retention_policy',
      'write_domain_truth',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime controlled apply contract returns MAG/RCA domain receipt requirements without domain writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-controlled-apply-'));
  try {
    const mag = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautogrant',
      '--stage',
      'specific-aims',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mag',
        controlled_stage_attempt: {
          action_kind: 'grant_stage_attempt_apply',
          contract_id: 'opl_temporal_controlled_stage_attempt_apply_contract',
        },
      }),
      '--source-fingerprint',
      'sha256:mag-controlled-apply',
    ], familyRuntimeEnv(stateRoot));
    const rca = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'visual-review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/rca',
        controlled_soak_no_regression_attempt: {
          surface_kind: 'controlled_soak_no_regression_attempt',
          no_regression_evidence_refs: ['rca:no-regression:visual-stage-1'],
        },
      }),
      '--source-fingerprint',
      'sha256:rca-controlled-apply',
    ], familyRuntimeEnv(stateRoot));

    const magQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      mag.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const rcaQuery = runCli([
      'family-runtime',
      'attempt',
      'query',
      rca.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], familyRuntimeEnv(stateRoot));
    const magContract = magQuery.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;
    const rcaContract = rcaQuery.family_runtime_stage_attempt_query.stage_attempt_query.controlled_apply_contract;

    assert.equal(magContract.surface_kind, 'family_runtime_controlled_apply_contract');
    assert.equal(magContract.contract_id, 'opl_temporal_controlled_stage_attempt_apply_contract');
    assert.equal(magContract.contract_open, true);
    assert.equal(magContract.apply_status, 'blocked_domain_receipt_required');
    assert.equal(
      magContract.typed_blockers[0].blocker_id,
      'opl_temporal_controlled_stage_attempt_apply_contract:domain_receipt_or_no_regression_evidence_required',
    );
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_truth, false);
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_artifact, false);
    assert.equal(magContract.no_forbidden_write_proof.opl_writes_domain_memory_body, false);
    assert.equal(rcaContract.contract_id, 'opl_temporal_controlled_visual_stage_attempt_apply_contract');
    assert.equal(rcaContract.apply_status, 'no_regression_evidence_observed');
    assert.deepEqual(rcaContract.no_regression_evidence_refs, ['rca:no-regression:visual-stage-1']);
    assert.deepEqual(rcaContract.typed_blockers, []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
