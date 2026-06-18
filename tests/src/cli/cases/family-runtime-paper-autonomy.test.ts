import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import {
  appendPaperAutonomyRecoveryObligation,
  appendPaperAutonomyRecoveryObligationStoreJsonl,
  appendPaperAutonomySupervisorDecisionLedgerJsonl,
  buildPaperAutonomySupervisorDecisionReadback,
  recordPaperAutonomySupervisorDecision,
  type PaperAutonomyStageRunIdentity,
} from '../../../../src/family-runtime-paper-autonomy.ts';

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
    assert.equal(readback.substrate_modules.vault, true);
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
