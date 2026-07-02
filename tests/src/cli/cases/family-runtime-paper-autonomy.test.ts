import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import {
  appendPaperAutonomyRecoveryObligation,
  appendPaperAutonomyRecoveryObligationStoreJsonl,
  appendPaperAutonomySupervisorDecisionLedgerJsonl,
  buildPaperAutonomySupervisorDecisionReadback,
  recordPaperAutonomySupervisorDecision,
  type PaperAutonomyStageRunIdentity,
} from '../../../../src/modules/runway/family-runtime-paper-autonomy.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function jsString(value: string) {
  return JSON.stringify(value);
}

function writeNodeScript(scriptPath: string, source: string) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `exec ${shellSingleQuote(process.execPath)} -e ${shellSingleQuote(source)} "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

function paperAutonomyIdentity(
  overrides: Partial<PaperAutonomyStageRunIdentity> = {},
): PaperAutonomyStageRunIdentity {
  return {
    stage_run_id: 'stage-run:dm003:paper-autonomy-supervision',
    route_identity_key: 'route:dm003:current-owner-delta',
    attempt_idempotency_key: 'attempt:dm003:paper-autonomy:1',
    selected_dispatch_ref: 'mas://DM003/current-owner-delta/latest.json',
    stage_packet_ref: 'opl://stage-packets/dm003/paper-autonomy-supervision.json',
    stage_packet_refs: [
      'opl://stage-packets/dm003/paper-autonomy-supervision.json',
    ],
    provider_attempt_ref: 'temporal://workflow/opl-dm003-paper-autonomy',
    attempt_lease_ref: 'lease://opl-dm003-paper-autonomy',
    workflow_ref: 'temporal://workflow/opl-dm003-paper-autonomy',
    source_fingerprint: 'mas-source:dm003:fresh',
    truth_epoch: 'truth:dm003:11',
    runtime_health_epoch: 'runtime:dm003:healthy:4',
    work_unit_fingerprint: 'sha256:dm003-current-work-unit',
    ...overrides,
  };
}

test('family-runtime paper-autonomy supervisor readback returns only identity-bound OPL supervisor decisions', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-readback-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-readback-fixture-'));
  const obligationLedger = path.join(fixtureRoot, 'recovery-obligations.jsonl');
  const decisionLedger = path.join(fixtureRoot, 'supervisor-decisions.jsonl');
  const identityPath = path.join(fixtureRoot, 'current-identity.json');
  const currentIdentity = paperAutonomyIdentity();
  const staleIdentity = paperAutonomyIdentity({
    stage_run_id: 'stage-run:dm003:stale',
    route_identity_key: 'route:dm003:stale',
    attempt_idempotency_key: 'attempt:dm003:stale',
  });
  const obligation = {
    obligation_id: 'obligation:dm003:supervisor-readback',
    desired_delta_ref: 'mas://DM003/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open' as const,
    last_evidence_refs: ['mas://DM003/evidence/current-owner-delta.json'],
  };
  const staleDecision = buildPaperAutonomySupervisorDecisionReadback({
    obligation_id: obligation.obligation_id,
    decision_kind: 'materialize_recovery_action',
    current_identity: staleIdentity,
    recovery_action_ref: 'opl://recovery-actions/dm003/stale.json',
    no_progress_or_inconsistency_ref: 'opl://runway/dm003/stale.json',
    evidence_refs: ['opl://runway/dm003/stale.json'],
  });
  const currentDecision = buildPaperAutonomySupervisorDecisionReadback({
    obligation_id: obligation.obligation_id,
    decision_kind: 'stop_with_stable_typed_blocker',
    current_identity: currentIdentity,
    typed_blocker_ref: 'mas://DM003/typed-blockers/stable.json',
    budget_or_missing_evidence_ref: 'opl://runway/dm003/non-advancing-apply.json',
    evidence_refs: ['opl://runway/dm003/non-advancing-apply.json'],
  });

  try {
    const obligationAppend = appendPaperAutonomyRecoveryObligation([], {
      obligation,
      appended_at: '2026-06-19T00:00:00.000Z',
    });
    appendPaperAutonomyRecoveryObligationStoreJsonl(obligationLedger, obligationAppend.entry);
    appendPaperAutonomySupervisorDecisionLedgerJsonl(decisionLedger, recordPaperAutonomySupervisorDecision([], {
      obligation_id: obligation.obligation_id,
      current_identity: staleIdentity,
      decision: staleDecision,
      appended_at: '2026-06-19T00:01:00.000Z',
    }).entry);
    appendPaperAutonomySupervisorDecisionLedgerJsonl(decisionLedger, recordPaperAutonomySupervisorDecision([], {
      obligation_id: obligation.obligation_id,
      current_identity: currentIdentity,
      decision: currentDecision,
      appended_at: '2026-06-19T00:02:00.000Z',
    }).entry);
    fs.writeFileSync(identityPath, JSON.stringify(currentIdentity), 'utf8');

    const output = runCli([
      'family-runtime',
      'paper-autonomy',
      'supervisor',
      'readback',
      '--obligation-ledger',
      obligationLedger,
      '--decision-ledger',
      decisionLedger,
      '--obligation-id',
      obligation.obligation_id,
      '--current-identity-file',
      identityPath,
    ], familyRuntimeEnv(stateRoot));
    const readback = output.family_runtime_paper_autonomy_supervisor_readback;

    assert.equal(readback.surface_id, 'opl_family_runtime_paper_autonomy_supervisor_readback');
    assert.equal(readback.surface_kind, 'opl_family_runtime_paper_autonomy_supervisor_readback');
    assert.equal(readback.readback_status, 'decision_ready');
    assert.equal(readback.obligation_id, obligation.obligation_id);
    assert.equal(readback.recovery_obligation_found, true);
    assert.equal(readback.supervisor_decision_found, true);
    assert.equal(readback.current_supervisor_decision_readback.surface_kind, 'opl_paper_autonomy_supervisor_decision_readback');
    assert.equal(readback.current_supervisor_decision_readback.decision_id, currentDecision.decision_id);
    assert.equal(readback.current_supervisor_decision_readback.decision_kind, 'stop_with_stable_typed_blocker');
    assert.equal(readback.current_supervisor_decision_readback.current_identity.stage_run_id, currentIdentity.stage_run_id);
    assert.equal(readback.current_supervisor_decision_readback.authority_boundary.opl_can_write_mas_truth, false);
    assert.equal(readback.current_supervisor_decision_readback.authority_boundary.opl_can_create_domain_owner_receipt, false);
    assert.equal(readback.current_supervisor_decision_readback.authority_boundary.opl_can_create_domain_typed_blocker, false);
    assert.equal(readback.authority_boundary.opl_can_write_mas_truth, false);
    assert.equal(readback.authority_boundary.opl_can_create_domain_owner_receipt, false);
    assert.equal(readback.authority_boundary.opl_can_create_domain_typed_blocker, false);
    assert.equal(readback.authority_boundary.readback_can_execute_transition, false);
    assert.equal(readback.substrate_modules.runway, true);
    assert.equal(readback.substrate_modules.ledger, true);
    assert.equal(readback.substrate_modules.console, true);

    fs.writeFileSync(identityPath, JSON.stringify({
      ...currentIdentity,
      source_fingerprint: 'mas-source:dm003:stale',
    }), 'utf8');
    const staleOutput = runCli([
      'family-runtime',
      'paper-autonomy',
      'supervisor',
      'readback',
      '--obligation-ledger',
      obligationLedger,
      '--decision-ledger',
      decisionLedger,
      '--obligation-id',
      obligation.obligation_id,
      '--current-identity-file',
      identityPath,
    ], familyRuntimeEnv(stateRoot));
    const staleReadback = staleOutput.family_runtime_paper_autonomy_supervisor_readback;

    assert.equal(staleReadback.readback_status, 'missing');
    assert.equal(staleReadback.recovery_obligation_found, false);
    assert.equal(staleReadback.supervisor_decision_found, false);
    assert.equal(staleReadback.current_supervisor_decision_readback, null);
    assert.equal(staleReadback.missing_reason, 'identity_bound_supervisor_decision_not_found');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime paper-autonomy supervisor decide appends OPL decision and returns same identity readback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-decide-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-decide-fixture-'));
  const obligationLedger = path.join(fixtureRoot, 'recovery-obligations.jsonl');
  const decisionLedger = path.join(fixtureRoot, 'supervisor-decisions.jsonl');
  const identityPath = path.join(fixtureRoot, 'current-identity.json');
  const currentIdentity = paperAutonomyIdentity();
  const obligation = {
    obligation_id: 'obligation:dm003:supervisor-decide',
    desired_delta_ref: 'mas://DM003/current-owner-delta/latest.json',
    current_identity: currentIdentity,
    status: 'open' as const,
    last_evidence_refs: ['mas://DM003/evidence/current-owner-delta.json'],
  };

  try {
    appendPaperAutonomyRecoveryObligationStoreJsonl(obligationLedger, appendPaperAutonomyRecoveryObligation([], {
      obligation,
      appended_at: '2026-06-19T00:00:00.000Z',
    }).entry);
    fs.writeFileSync(identityPath, JSON.stringify(currentIdentity), 'utf8');

    const decided = runCli([
      'family-runtime',
      'paper-autonomy',
      'supervisor',
      'decide',
      '--obligation-ledger',
      obligationLedger,
      '--decision-ledger',
      decisionLedger,
      '--obligation-id',
      obligation.obligation_id,
      '--current-identity-file',
      identityPath,
      '--typed-blocker-ref',
      'mas://DM003/typed-blockers/stable.json',
      '--budget-or-missing-evidence-ref',
      'opl://runway/dm003/non-advancing-apply.json',
      '--evidence-ref',
      'opl://runway/dm003/non-advancing-apply.json',
    ], familyRuntimeEnv(stateRoot)).family_runtime_paper_autonomy_supervisor_decision;

    assert.equal(decided.surface_id, 'opl_family_runtime_paper_autonomy_supervisor_decision');
    assert.equal(decided.decision_status, 'decision_appended');
    assert.equal(decided.decision_readback.surface_kind, 'opl_paper_autonomy_supervisor_decision_readback');
    assert.equal(decided.decision_readback.decision_kind, 'stop_with_stable_typed_blocker');
    assert.equal(decided.decision_readback.current_identity.stage_run_id, currentIdentity.stage_run_id);
    assert.equal(decided.decision_ledger_entry.entry_kind, 'supervisor_decision_appended');
    assert.equal(decided.authority_boundary.opl_can_write_mas_truth, false);
    assert.equal(decided.authority_boundary.opl_can_create_domain_owner_receipt, false);
    assert.equal(decided.authority_boundary.opl_can_create_domain_typed_blocker, false);

    const readback = runCli([
      'family-runtime',
      'paper-autonomy',
      'supervisor',
      'readback',
      '--obligation-ledger',
      obligationLedger,
      '--decision-ledger',
      decisionLedger,
      '--obligation-id',
      obligation.obligation_id,
      '--current-identity-file',
      identityPath,
    ], familyRuntimeEnv(stateRoot)).family_runtime_paper_autonomy_supervisor_readback;

    assert.equal(readback.readback_status, 'decision_ready');
    assert.equal(readback.current_supervisor_decision_readback.decision_id, decided.decision_readback.decision_id);
    assert.equal(readback.current_supervisor_decision_readback.decision_kind, 'stop_with_stable_typed_blocker');
    assert.equal(readback.authority_boundary.readback_can_execute_transition, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake consumes MAS OPL supervisor decision requests into OPL readback ledgers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-intake-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-intake-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const currentIdentity = paperAutonomyIdentity();
  const obligationId = 'paper-recovery::DM003::run_quality_repair_batch::medical_prose_write_repair::typed_blocker';
  writeNodeScript(exportPath, `
process.stdout.write(JSON.stringify({
  surface_kind: 'mas_family_domain_handler_export',
  pending_family_tasks: [
    {
      domain_id: 'medautoscience',
      task_kind: 'paper_autonomy/supervisor-decision',
      priority: 75,
      source: 'mas-domain-handler-export',
      dedupe_key: 'mas:dm-cvd:DM003:opl-supervisor-decision:fingerprint',
      dispatch_owner: 'one-person-lab',
      queue_owner: 'one-person-lab',
      domain_truth_owner: 'med-autoscience',
      reason: 'opl_supervisor_decision_readback_required',
      source_refs: [
        { role: 'typed_blocker', ref: 'mas://DM003/typed-blockers/current.json', exists: true },
      ],
      payload: {
        profile: '/tmp/dm-cvd.local.toml',
        study_id: 'DM003',
        source_fingerprint: 'source-fingerprint-dm003',
        continuation_reason: 'opl_supervisor_decision_readback_required',
        authority_boundary: 'mas_request_projection_only_opl_supervisor_decision_engine',
        paper_autonomy_supervisor_decision_request: {
          surface_kind: 'mas_opl_paper_autonomy_supervisor_decision_request',
          schema_version: 1,
          request_role: 'mas_policy_projection_to_opl_supervisor_decision_engine',
          study_id: 'DM003',
          quest_id: 'DM003',
          obligation_id: ${jsString(obligationId)},
          paper_autonomy_obligation_identity: {
            study_id: 'DM003',
            quest_id: 'DM003',
            stage_id: 'publication_supervision',
            action_type: 'run_quality_repair_batch',
            work_unit_id: 'medical_prose_write_repair',
            work_unit_fingerprint: 'sha256:dm003-current-work-unit',
            route_identity_key: 'route:dm003:current-owner-delta',
            attempt_idempotency_key: 'attempt:dm003:paper-autonomy:1',
          },
          current_identity: ${JSON.stringify(currentIdentity)},
          requested_decision_readback_shape: 'opl_paper_autonomy_supervisor_decision_readback',
          requested_opl_command: 'opl family-runtime paper-autonomy supervisor decide',
          recommended_decision_evidence: {
            typed_blocker_ref: 'mas://DM003/typed-blockers/stable.json',
            budget_or_missing_evidence_ref: 'opl://runway/dm003/non-advancing-apply.json',
            evidence_refs: [
              'mas://DM003/typed-blockers/current.json',
              'opl://runway/dm003/non-advancing-apply.json',
            ],
            observability_refs: [
              'study_progress.paper_recovery_state.supervisor_decision',
              'study_progress.current_work_unit',
            ],
          },
          authority_boundary: {
            request_owner: 'med-autoscience',
            decision_engine_owner: 'one-person-lab',
            recovery_obligation_store_owner: 'one-person-lab',
            decision_authority: false,
            mas_can_run_supervisor_decision_engine: false,
            mas_can_store_recovery_obligation: false,
            mas_can_create_opl_command_event_or_outbox: false,
            opl_can_write_mas_truth: false,
            opl_can_create_domain_owner_receipt: false,
            opl_can_create_domain_typed_blocker: false,
          },
        },
      },
    },
    {
      domain_id: 'medautoscience',
      task_kind: 'publication_aftercare/reviewer-refresh',
      priority: 25,
      source: 'mas-domain-handler-export',
      dedupe_key: 'mas:dm-cvd:DM003:publication-aftercare:fingerprint',
      dispatch_owner: 'one-person-lab',
      queue_owner: 'one-person-lab',
      domain_truth_owner: 'med-autoscience',
      reason: 'mixed_export_non_supervisor_task',
      payload: {
        profile: '/tmp/dm-cvd.local.toml',
        study_id: 'DM003',
        source_fingerprint: 'non-supervisor-source-fingerprint-dm003',
      },
    },
  ],
}) + '\\n');
`);

  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    });
    const first = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'test-supervisor-decision-request',
    ], env).family_runtime_intake;
    const queue = runCli(['family-runtime', 'queue', 'list'], env).family_runtime_queue;
    const consumed = first.exports[0].paper_autonomy_supervisor_decision_request_consumed[0];
    const obligationLedger = consumed.ledger_paths.obligation_ledger_path;
    const decisionLedger = consumed.ledger_paths.decision_ledger_path;
    const obligationEntries = fs.readFileSync(obligationLedger, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const decisionEntries = fs.readFileSync(decisionLedger, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(first.enqueued_count, 1);
    assert.equal(first.blocked_count, 0);
    assert.equal(first.paper_autonomy_supervisor_decision_request_consumed_count, 1);
    assert.equal(first.exports[0].paper_autonomy_supervisor_decision_request_consumed_count, 1);
    assert.equal(queue.tasks.length, 1);
    assert.equal(queue.tasks[0].task_kind, 'publication_aftercare/reviewer-refresh');
    assert.equal(consumed.status, 'consumed');
    assert.equal(consumed.obligation_id, obligationId);
    assert.equal(consumed.obligation_appended, true);
    assert.equal(consumed.decision_appended, true);
    assert.equal(consumed.decision_readback.surface_kind, 'opl_paper_autonomy_supervisor_decision_readback');
    assert.equal(consumed.decision_readback.decision_kind, 'stop_with_stable_typed_blocker');
    assert.equal(consumed.decision_readback.current_identity.stage_run_id, currentIdentity.stage_run_id);
    assert.equal(consumed.authority_boundary.request_is_provider_admission, false);
    assert.equal(consumed.authority_boundary.opl_can_write_mas_truth, false);
    assert.equal(consumed.authority_boundary.opl_can_create_domain_owner_receipt, false);
    assert.equal(consumed.authority_boundary.opl_can_create_domain_typed_blocker, false);
    assert.equal(obligationEntries.length, 1);
    assert.equal(obligationEntries[0].surface_kind, 'opl_paper_autonomy_recovery_obligation_store_entry');
    assert.equal(obligationEntries[0].obligation_id, obligationId);
    assert.equal(decisionEntries.length, 1);
    assert.equal(decisionEntries[0].surface_kind, 'opl_paper_autonomy_supervisor_decision_ledger_entry');
    assert.equal(decisionEntries[0].decision.decision_kind, 'stop_with_stable_typed_blocker');

    const repeated = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'test-supervisor-decision-request-repeat',
    ], env).family_runtime_intake;
    assert.equal(repeated.enqueued_count, 0);
    assert.equal(repeated.idempotent_noop_count, 1);
    assert.equal(repeated.paper_autonomy_supervisor_decision_request_consumed_count, 1);
    assert.equal(repeated.exports[0].paper_autonomy_supervisor_decision_request_consumed[0].status, 'idempotent_noop');
    assert.equal(runCli(['family-runtime', 'queue', 'list'], env).family_runtime_queue.tasks.length, 1);
    assert.equal(fs.readFileSync(obligationLedger, 'utf8').trim().split('\n').length, 1);
    assert.equal(fs.readFileSync(decisionLedger, 'utf8').trim().split('\n').length, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake task-kind scope consumes only paper autonomy supervisor decisions', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-scoped-intake-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-autonomy-supervisor-scoped-intake-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const currentIdentity = paperAutonomyIdentity();
  const obligationId = 'paper-recovery::DM003::run_quality_repair_batch::medical_prose_write_repair::typed_blocker';
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, `${JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_pending_count: 1,
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: 'DM003',
        quest_id: 'DM003',
        action_type: 'run_quality_repair_batch',
        work_unit_id: 'medical_prose_write_repair',
        work_unit_fingerprint: 'publication-blockers::0915410f804b3697',
        action_fingerprint: 'publication-blockers::0915410f804b3697',
        next_executable_owner: 'write',
        owner_route_current: true,
        source_fingerprint: 'publication-blockers::0915410f804b3697',
        route_identity_key: 'paper-policy-request:scoped-blocked-leak',
        attempt_idempotency_key: 'paper-policy-request:scoped-blocked-leak',
        stage_transition_authority_boundary: {
          producer_kind: 'runtime_provider',
          intent_kind: 'provider_observation',
          stage_transition_authority: 'one-person-lab',
          intent_can_write_stage_current_pointer: false,
          intent_can_write_stage_run_terminal_state: false,
          intent_can_publish_current_owner_delta: false,
          intent_can_write_domain_truth: false,
          intent_can_create_owner_receipt: false,
          intent_can_create_typed_blocker: false,
          provider_completion_counts_as_stage_transition: false,
          read_model_update_counts_as_stage_transition: false,
          worklist_update_counts_as_stage_transition: false,
          evidence_event_counts_as_stage_transition: false,
          agent_lab_output_counts_as_stage_transition: false,
        },
      },
    ],
  })}\n`, 'utf8');
  writeNodeScript(exportPath, `
process.stdout.write(JSON.stringify({
  surface_kind: 'mas_family_domain_handler_export',
  workspace: {
    workspace_root: ${JSON.stringify(workspaceRoot)},
  },
  pending_family_tasks: [
    {
      domain_id: 'medautoscience',
      task_kind: 'paper_autonomy/supervisor-decision',
      priority: 75,
      source: 'mas-domain-handler-export',
      dedupe_key: 'mas:dm-cvd:DM003:opl-supervisor-decision:fingerprint',
      dispatch_owner: 'one-person-lab',
      queue_owner: 'one-person-lab',
      domain_truth_owner: 'med-autoscience',
      reason: 'opl_supervisor_decision_readback_required',
      payload: {
        profile: '/tmp/dm-cvd.local.toml',
        study_id: 'DM003',
        source_fingerprint: 'source-fingerprint-dm003',
        continuation_reason: 'opl_supervisor_decision_readback_required',
        paper_autonomy_supervisor_decision_request: {
          surface_kind: 'mas_opl_paper_autonomy_supervisor_decision_request',
          schema_version: 1,
          request_role: 'mas_policy_projection_to_opl_supervisor_decision_engine',
          study_id: 'DM003',
          quest_id: 'DM003',
          obligation_id: ${jsString(obligationId)},
          current_identity: ${JSON.stringify(currentIdentity)},
          requested_decision_readback_shape: 'opl_paper_autonomy_supervisor_decision_readback',
          requested_opl_command: 'opl family-runtime paper-autonomy supervisor decide',
          recommended_decision_evidence: {
            typed_blocker_ref: 'mas://DM003/typed-blockers/stable.json',
            budget_or_missing_evidence_ref: 'opl://runway/dm003/non-advancing-apply.json',
            evidence_refs: [
              'mas://DM003/typed-blockers/current.json',
              'opl://runway/dm003/non-advancing-apply.json',
            ],
            observability_refs: [
              'study_progress.paper_recovery_state.supervisor_decision',
              'study_progress.current_work_unit',
            ],
          },
          authority_boundary: {
            request_owner: 'med-autoscience',
            decision_engine_owner: 'one-person-lab',
            recovery_obligation_store_owner: 'one-person-lab',
            decision_authority: false,
            mas_can_run_supervisor_decision_engine: false,
            mas_can_store_recovery_obligation: false,
            mas_can_create_opl_command_event_or_outbox: false,
            opl_can_write_mas_truth: false,
            opl_can_create_domain_owner_receipt: false,
            opl_can_create_domain_typed_blocker: false,
          },
        },
      },
    },
    {
      domain_id: 'medautoscience',
      task_kind: 'publication_aftercare/reviewer-refresh',
      priority: 25,
      source: 'mas-domain-handler-export',
      dedupe_key: 'mas:dm-cvd:DM003:publication-aftercare:fingerprint',
      dispatch_owner: 'one-person-lab',
      queue_owner: 'one-person-lab',
      domain_truth_owner: 'med-autoscience',
      reason: 'mixed_export_non_supervisor_task',
      payload: {
        profile: '/tmp/dm-cvd.local.toml',
        study_id: 'DM003',
        source_fingerprint: 'non-supervisor-source-fingerprint-dm003',
      },
    },
  ],
}) + '\\n');
`);

  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    });
    const unscoped = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--source',
      'test-supervisor-decision-request-unscoped',
    ], env).family_runtime_intake;
    assert.equal(unscoped.blocked_count, 1);
    assert.equal(
      unscoped.exports[0].blocked[0].reason,
      'current_control_provider_admission_command_record_missing',
    );
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.mkdirSync(stateRoot, { recursive: true });

    const first = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/supervisor-decision',
      '--source',
      'test-supervisor-decision-request-scoped',
    ], env).family_runtime_intake;
    const queue = runCli(['family-runtime', 'queue', 'list'], env).family_runtime_queue;
    const consumed = first.exports[0].paper_autonomy_supervisor_decision_request_consumed[0];
    const obligationLedger = consumed.ledger_paths.obligation_ledger_path;
    const decisionLedger = consumed.ledger_paths.decision_ledger_path;

    assert.equal(first.enqueued_count, 0);
    assert.equal(first.idempotent_noop_count, 0);
    assert.equal(first.blocked_count, 0);
    assert.equal(first.filtered_count, 1);
    assert.equal(first.paper_autonomy_supervisor_decision_request_consumed_count, 1);
    assert.equal(first.exports[0].exported_count, 1);
    assert.equal(first.exports[0].filtered_count, 1);
    assert.equal(first.exports[0].blocked_count, 0);
    assert.equal(first.exports[0].paper_autonomy_supervisor_decision_request_consumed_count, 1);
    assert.equal(queue.tasks.length, 0);
    assert.equal(consumed.status, 'consumed');
    assert.equal(consumed.obligation_id, obligationId);
    assert.equal(consumed.authority_boundary.request_is_provider_admission, false);
    assert.equal(fs.readFileSync(obligationLedger, 'utf8').trim().split('\n').length, 1);
    assert.equal(fs.readFileSync(decisionLedger, 'utf8').trim().split('\n').length, 1);

    const repeated = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_autonomy/supervisor-decision',
      '--source',
      'test-supervisor-decision-request-scoped-repeat',
    ], env).family_runtime_intake;
    assert.equal(repeated.enqueued_count, 0);
    assert.equal(repeated.idempotent_noop_count, 0);
    assert.equal(repeated.blocked_count, 0);
    assert.equal(repeated.paper_autonomy_supervisor_decision_request_consumed_count, 1);
    assert.equal(repeated.exports[0].blocked_count, 0);
    assert.equal(repeated.exports[0].paper_autonomy_supervisor_decision_request_consumed[0].status, 'idempotent_noop');
    assert.equal(runCli(['family-runtime', 'queue', 'list'], env).family_runtime_queue.tasks.length, 0);
    assert.equal(fs.readFileSync(obligationLedger, 'utf8').trim().split('\n').length, 1);
    assert.equal(fs.readFileSync(decisionLedger, 'utf8').trim().split('\n').length, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime hydrates MAS provider-hosted guarded apply tasks without truth authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-guarded-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-guarded-export-'));
  const exportPath = path.join(fixtureRoot, 'export');
  const dispatchPath = path.join(fixtureRoot, 'dispatch');
  const dispatchedTaskPath = path.join(fixtureRoot, 'dispatched-task-path');
  writeNodeScript(exportPath, `
process.stdout.write(JSON.stringify({
  surface_kind: 'mas_family_domain_handler_export',
  pending_family_tasks: [
    {
      domain_id: 'medautoscience',
      task_kind: 'paper_autonomy/guarded-apply',
      priority: 30,
      source: 'mas-domain-handler-export',
      dedupe_key: 'mas:dm-cvd:DM002:provider-hosted-guarded-apply:opl-temporal',
      dispatch_owner: 'med-autoscience',
      profile_name: 'dm-cvd',
      source_refs: [
        { role: 'opl_production_proof', ref: '/tmp/opl-proof.json', exists: true },
      ],
      payload: {
        profile: '/tmp/profile.toml',
        study_id: 'DM002',
        target_studies: ['DM002'],
        provider_attempt_id: 'opl-temporal:dm-cvd:DM002:provider-hosted-guarded-apply',
        idempotency_key: 'mas:dm-cvd:DM002:provider-hosted-guarded-apply:opl-temporal',
        paper_autonomy_reason: 'provider_hosted_guarded_apply_soak',
        authority_boundary: 'mas_owner_guarded_apply_only',
      },
    },
  ],
}) + '\\n');
`);
  writeNodeScript(dispatchPath, `
const fs = require('node:fs');
const taskPath = process.argv[1];
fs.writeFileSync(${jsString(dispatchedTaskPath)}, taskPath + '\\n');
process.stdout.write(JSON.stringify({
  accepted: true,
  surface_kind: 'mas_family_domain_handler_dispatch_receipt',
  receipt_ref: 'studies/DM002/artifacts/paper_autonomy/guarded_apply/latest.json',
  dispatch: {
    result: {
      surface: 'real_paper_autonomy_provider_hosted_guarded_apply_receipt',
      status: 'typed_blocker',
    },
  },
}) + '\\n');
`);
  try {
    const tick = runCli(['family-runtime', 'tick', '--source', 'temporal', '--hydrate'], familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
    }));
    const queue = runCli(['family-runtime', 'queue', 'list'], familyRuntimeEnv(stateRoot));
    const task = queue.family_runtime_queue.tasks[0];
    const dispatchedTask = JSON.parse(fs.readFileSync(fs.readFileSync(dispatchedTaskPath, 'utf8').trim(), 'utf8'));

    assert.equal(tick.family_runtime_tick.hydration.enqueued_count, 1);
    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.deepEqual(tick.family_runtime_tick.dispatches[0].stage_attempts[0].closeout_refs, [
      'studies/DM002/artifacts/paper_autonomy/guarded_apply/latest.json',
    ]);
    assert.equal(task.task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(task.paper_autonomy.study_id, 'DM002');
    assert.equal(task.paper_autonomy.next_owner, 'med-autoscience');
    assert.equal(task.paper_autonomy.callable_surface, 'medautosci domain-handler dispatch');
    assert.equal(task.paper_autonomy.authority_boundary.writes_mas_truth, false);
    assert.equal(task.payload.provider_attempt_id, 'opl-temporal:dm-cvd:DM002:provider-hosted-guarded-apply');
    assert.equal(dispatchedTask.task_kind, 'paper_autonomy/guarded-apply');
    assert.equal(dispatchedTask.payload.authority_boundary, 'mas_owner_guarded_apply_only');
    assert.deepEqual(dispatchedTask.payload.source_refs, [
      { role: 'opl_production_proof', ref: '/tmp/opl-proof.json', exists: true },
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
