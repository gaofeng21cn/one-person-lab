import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, runCliFailure, test } from '../../helpers.ts';
import { createFamilyDefaultContractWorkspace } from '../domain-pack-compiler-fixtures.ts';

function seedProviderCadenceWindow(env: Record<string, string>, stateRoot: string) {
  runCli(['family-runtime', 'events', 'export'], env);
  const queueDb = path.join(stateRoot, 'family-runtime', 'queue.sqlite');
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const eventRows = Array.from({ length: 7 }, (_, index) => {
    const createdAt = new Date(now - (6 - index) * dayMs).toISOString();
    return {
      proofEventId: `evt_provider_proof_maturity_${index}`,
      receiptEventId: `evt_provider_slo_maturity_${index}`,
      createdAt,
    };
  });
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    '-e',
    `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(queueDb)});
const rows = ${JSON.stringify(eventRows)};
for (const row of rows) {
  db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
    .run(
      row.proofEventId,
      'temporal_residency_proof',
      'test',
      JSON.stringify({
        provider_kind: 'temporal',
        proof_mode: 'external_temporal_service_worker',
        closeout_status: 'production_residency_proven',
        proof_receipt: {
          receipt_kind: 'temporal_production_residency_proof',
          receipt_status: 'proven',
          provider_kind: 'temporal'
        }
      }),
      row.createdAt
    );
  db.prepare("INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?, ?)")
    .run(
      row.receiptEventId,
      'temporal_provider_slo_execution_receipt',
      'test',
      JSON.stringify({
        surface_kind: 'opl_temporal_provider_slo_execution_receipt',
        provider_kind: 'temporal',
        execution_status: 'executed',
        receipt_status: 'proven',
        receipt_kind: 'opl_temporal_provider_slo_execution_receipt',
        repair_receipt: {
          repair_status: 'executed',
          can_execute_domain_repair: false
        },
        authority_boundary: {
          can_authorize_domain_ready: false
        }
      }),
      row.createdAt
    );
}
db.close();`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

test('framework operating maturity consumes provider long-soak evidence refs without production ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-long-soak-evidence-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const providerRecord = runCli([
      'runtime',
      'provider-long-soak-evidence',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_refs: [
          'provider-long-soak:temporal/week-1/cadence-window',
        ],
        recovery_refs: [
          'provider-recovery:temporal/worker-restart/requery',
        ],
        dead_letter_refs: [
          'provider-dead-letter:temporal/retry-boundary',
        ],
        provider_blocker_refs: [
          'provider-blocker:temporal/capability-slo/current',
        ],
        typed_blocker_refs: [
          'typed-blocker:provider/temporal/capability-slo-blocked',
        ],
        capability_requirement_ids: [
          'restart_requery_ready',
          'signal_history_ready',
          'typed_closeout_required_ready',
          'missing_closeout_block_ready',
          'retry_dead_letter_boundary_ready',
        ],
      }),
    ], env).provider_long_soak_evidence_ledger_record;
    runCli([
      'runtime',
      'provider-long-soak-evidence',
      'verify',
      '--receipt-ref',
      providerRecord.receipt_refs[0],
    ], env);

    const drilldown = runCli([
      'runtime',
      'app-operator-drilldown',
    ], env).app_operator_drilldown;
    assert.equal(
      drilldown.provider_long_soak_evidence.surface_kind,
      'opl_provider_long_soak_evidence_projection',
    );
    assert.equal(drilldown.provider_long_soak_evidence.status, 'provider_evidence_observed_not_ready_claim');
    assert.deepEqual(drilldown.provider_long_soak_evidence.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(drilldown.summary.provider_long_soak_evidence_verified_receipt_ref_count, 1);
    assert.equal(drilldown.summary.provider_long_soak_evidence_typed_blocker_ref_count, 1);
    assert.deepEqual(drilldown.provider_long_soak_evidence.capability_requirement_ids, [
      'restart_requery_ready',
      'signal_history_ready',
      'typed_closeout_required_ready',
      'missing_closeout_block_ready',
      'retry_dead_letter_boundary_ready',
    ]);
    assert.equal(
      drilldown.provider_long_soak_evidence.authority_boundary.can_claim_production_ready,
      false,
    );

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;
    assert.equal(maturity.provider_long_soak.status, 'evidence_required');
    assert.equal(maturity.provider_long_soak.open_evidence_count, 1);
    assert.equal(maturity.provider_long_soak.capability_status, 'capability_slo_blocked');
    assert.deepEqual(maturity.provider_long_soak.capability_missing_requirement_ids, [
      'domain_truth_boundary_preserved',
    ]);
    assert.deepEqual(maturity.provider_long_soak.capability_evidence_observed_requirement_ids, [
      'restart_requery_ready',
      'signal_history_ready',
      'typed_closeout_required_ready',
      'missing_closeout_block_ready',
      'retry_dead_letter_boundary_ready',
    ]);
    assert.equal(maturity.provider_long_soak.capability_open_requirement_count, 1);
    assert.equal(
      maturity.provider_long_soak.capability_next_evidence_action,
      'record_provider_capability_slo_evidence_or_blocker_for_missing_requirements',
    );
    assert.equal(maturity.provider_long_soak.capability_checklist[0].required_ref_shape, 'recovery_ref');
    assert.equal(maturity.provider_long_soak.capability_checklist[0].status, 'refs_observed_not_ready_claim');
    assert.equal(maturity.provider_long_soak.capability_checklist[0].closes_production_ready, false);
    assert.equal(maturity.provider_long_soak.long_evidence_ready, false);
    assert.deepEqual(maturity.provider_long_soak.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      maturity.provider_long_soak.observed_receipt_refs.includes(providerRecord.receipt_refs[0]),
      true,
    );
    assert.equal(maturity.provider_long_soak.verified_receipt_ref_count, 1);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    assert.equal(maturity.provider_long_soak.owner, 'one-person-lab runtime owner');
    assert.match(
      maturity.provider_long_soak.record_command,
      /opl runtime provider-long-soak-evidence record/,
    );
    assert.match(
      maturity.provider_long_soak.verify_command,
      /opl runtime provider-long-soak-evidence verify --receipt-ref <receipt_ref>/,
    );
    assert.deepEqual(maturity.provider_long_soak.execution_runbook.accepted_paths, [
      'long_soak_recovery_dead_letter_evidence_path',
      'provider_or_typed_blocker_path',
    ]);
    assert.equal(
      maturity.provider_long_soak.execution_runbook.readback_commands.includes(
        'opl framework operating-maturity --family-defaults --json',
      ),
      true,
    );
    assert.equal(
      maturity.provider_long_soak.execution_runbook.stop_loss.includes(
        'if capability_status remains capability_slo_blocked, use capability_missing_requirement_ids to record specific long_soak/recovery/dead_letter/provider_blocker/typed_blocker evidence instead of rerunning evidence accounting',
      ),
      true,
    );
    assert.equal(
      maturity.provider_long_soak.execution_runbook.false_authority_guard
        .can_claim_provider_production_ready,
      false,
    );
    assert.equal(
      maturity.provider_long_soak.authority_boundary.can_claim_production_ready,
      false,
    );

    const providerLane = maturity.owner_evidence_intake.lane_evidence.find(
      (entry: { lane: string }) => entry.lane === 'provider_long_soak',
    );
    assert.equal(providerLane.status, 'owner_evidence_observed_not_ready_claim');
    assert.equal(providerLane.verified_receipt_count, 1);
    assert.deepEqual(providerLane.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
      'dead_letter_ref',
      'provider_blocker_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(
      providerLane.observed_receipt_refs.includes(providerRecord.receipt_refs[0]),
      true,
    );
    const providerWorkOrder =
      maturity.foundry_agent_os_production_evidence_gate.owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'provider_long_soak',
      );
    assert.equal(
      providerWorkOrder.blocker_state,
      'owner_route_refs_observed_not_production_claim',
    );
    assert.equal(providerWorkOrder.ready_claim_authorized, false);
    assert.equal(providerWorkOrder.owner_acceptance_required, true);
    assert.equal(
      providerWorkOrder.observed_ref_shapes.includes('provider_blocker_ref'),
      true,
    );
    assert.deepEqual(providerWorkOrder.missing_owner_action_ids, [
      'domain_truth_boundary_preserved',
    ]);
    assert.deepEqual(providerWorkOrder.owner_action_checklist
      .filter((entry: { status: string }) => entry.status === 'refs_observed_not_ready_claim')
      .map((entry: { requirement_id: string }) => entry.requirement_id), [
      'restart_requery_ready',
      'signal_history_ready',
      'typed_closeout_required_ready',
      'missing_closeout_block_ready',
      'retry_dead_letter_boundary_ready',
    ]);
    assert.equal(
      providerWorkOrder.next_evidence_action,
      'record_provider_capability_slo_evidence_or_blocker_for_missing_requirements',
    );
    assert.equal(providerWorkOrder.owner_action_checklist[0].required_ref_shape, 'recovery_ref');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('provider long-soak evidence namespace help exposes record verify and list commands', () => {
  const help = runCli(['runtime', 'provider-long-soak-evidence', '--help']).help;

  assert.equal(help.command, 'runtime provider-long-soak-evidence');
  assert.match(help.summary, /provider long-soak evidence/);
  assert.deepEqual(help.subcommands.map((entry: { command: string }) => entry.command), [
    'runtime provider-long-soak-evidence record',
    'runtime provider-long-soak-evidence verify',
    'runtime provider-long-soak-evidence list',
  ]);
});

test('framework operating maturity closes provider owner-evidence work order when blocker refs cover every capability without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-owner-evidence-covered-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const providerRecord = runCli([
      'runtime',
      'provider-long-soak-evidence',
      'record',
      '--payload',
      JSON.stringify({
        provider_blocker_refs: [
          'provider-blocker:temporal/capability/restart-requery',
          'provider-blocker:temporal/capability/signal-history',
          'provider-blocker:temporal/capability/missing-closeout-block',
          'provider-blocker:temporal/capability/retry-dead-letter',
          'provider-blocker:temporal/capability/domain-truth-boundary',
        ],
        typed_blocker_refs: [
          'typed-blocker:provider/typed-closeout-required',
        ],
        capability_requirement_ids: [
          'restart_requery_ready',
          'signal_history_ready',
          'typed_closeout_required_ready',
          'missing_closeout_block_ready',
          'retry_dead_letter_boundary_ready',
          'domain_truth_boundary_preserved',
        ],
      }),
    ], env).provider_long_soak_evidence_ledger_record;
    runCli([
      'runtime',
      'provider-long-soak-evidence',
      'verify',
      '--receipt-ref',
      providerRecord.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.provider_long_soak_open_count, 0);
    assert.equal(
      maturity.provider_long_soak.status,
      'evidence_recorded_not_production_ready_claim',
    );
    assert.equal(maturity.provider_long_soak.open_evidence_count, 0);
    assert.equal(maturity.provider_long_soak.long_evidence_ready, false);
    assert.equal(maturity.provider_long_soak.capability_status, 'capability_slo_blocked');
    assert.deepEqual(maturity.provider_long_soak.capability_missing_requirement_ids, []);
    assert.deepEqual(maturity.provider_long_soak.capability_evidence_observed_requirement_ids, [
      'restart_requery_ready',
      'signal_history_ready',
      'typed_closeout_required_ready',
      'missing_closeout_block_ready',
      'retry_dead_letter_boundary_ready',
      'domain_truth_boundary_preserved',
    ]);
    assert.equal(maturity.provider_long_soak.capability_open_requirement_count, 0);
    assert.equal(
      maturity.provider_long_soak.capability_next_evidence_action,
      'capability_slo_requirements_observed_not_production_ready_claim',
    );
    assert.deepEqual(maturity.provider_long_soak.observed_ref_shapes, [
      'provider_blocker_ref',
      'typed_blocker_ref',
    ]);
    assert.equal(maturity.provider_long_soak.verified_receipt_ref_count, 1);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    assert.equal(
      maturity.provider_long_soak.authority_boundary.can_claim_production_ready,
      false,
    );

    const providerGateLane = maturity.foundry_agent_os_production_evidence_gate.lane_statuses.find(
      (entry: { lane: string }) => entry.lane === 'provider_long_soak',
    );
    assert.equal(providerGateLane.open_count, 0);
    assert.equal(providerGateLane.status, 'refs_observed_not_production_ready_claim');
    assert.deepEqual(providerGateLane.missing_owner_action_ids, []);
    const providerWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'provider_long_soak',
      );
    assert.equal(providerWorkOrder.status, 'owner_evidence_recorded');
    assert.equal(providerWorkOrder.open_count, 0);
    assert.equal(
      providerWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.deepEqual(providerWorkOrder.missing_owner_action_ids, []);
    assert.equal(providerWorkOrder.owner_acceptance_required, true);
    assert.equal(providerWorkOrder.ready_claim_authorized, false);
    assert.equal(
      providerWorkOrder.authority_boundary.can_claim_production_ready,
      false,
    );
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.not_claims.includes('production_ready'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity surfaces refs-only provider and lifecycle counts without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-runtime-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    seedProviderCadenceWindow(env, stateRoot);
    const providerRecord = runCli([
      'runtime',
      'provider-long-soak-evidence',
      'record',
      '--payload',
      JSON.stringify({
        long_soak_refs: ['provider-long-soak:temporal/runtime-4h'],
        recovery_refs: ['provider-recovery:temporal/cadence-current'],
        capability_requirement_ids: [
          'restart_requery_ready',
          'signal_history_ready',
        ],
      }),
    ], env).provider_long_soak_evidence_ledger_record;
    runCli([
      'runtime',
      'provider-long-soak-evidence',
      'verify',
      '--receipt-ref',
      providerRecord.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.provider_long_soak_open_count, 0);
    assert.equal(maturity.provider_long_soak.open_evidence_count, 0);
    assert.equal(maturity.provider_long_soak.long_evidence_ready, true);
    assert.deepEqual(maturity.provider_long_soak.capability_missing_requirement_ids, [
      'typed_closeout_required_ready',
      'missing_closeout_block_ready',
      'retry_dead_letter_boundary_ready',
      'domain_truth_boundary_preserved',
    ]);
    assert.deepEqual(maturity.provider_long_soak.capability_evidence_observed_requirement_ids, [
      'restart_requery_ready',
      'signal_history_ready',
    ]);
    assert.equal(maturity.provider_long_soak.observed_receipt_count, 7);
    assert.equal(maturity.provider_long_soak.provider_completion_counts_as_production_ready, false);
    assert.equal(
      maturity.provider_long_soak.execution_runbook.false_authority_guard
        .can_claim_production_ready,
      false,
    );
    const providerGateLane = maturity.foundry_agent_os_production_evidence_gate.lane_statuses.find(
      (entry: { lane: string }) => entry.lane === 'provider_long_soak',
    );
    assert.equal(providerGateLane.open_count, 0);
    assert.equal(providerGateLane.status, 'refs_observed_not_production_ready_claim');
    assert.equal(
      providerGateLane.observed_owner_evidence_status,
      'owner_evidence_observed_not_ready_claim',
    );
    const providerWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'provider_long_soak',
      );
    assert.equal(
      providerWorkOrder.blocker_state,
      'owner_route_refs_observed_not_production_claim',
    );
    assert.equal(
      providerWorkOrder.owner_evidence_closure_state,
      'owner_evidence_recorded_not_ready_claim',
    );
    assert.equal(providerWorkOrder.owner_acceptance_required, true);
    assert.equal(providerWorkOrder.ready_claim_authorized, false);
    assert.equal(providerWorkOrder.observed_receipt_refs[0], providerRecord.receipt_refs[0]);
    assert.deepEqual(providerWorkOrder.observed_ref_shapes, [
      'long_soak_ref',
      'recovery_ref',
    ]);
    assert.equal(
      providerWorkOrder.next_evidence_action,
      'record_provider_capability_slo_evidence_or_blocker_for_missing_requirements',
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.non_closing_inputs.includes('verified_refs_only_ledger'),
      true,
    );
    assert.equal(
      maturity.foundry_agent_os_production_evidence_gate.summary.closed_by_opl,
      false,
    );
    assert.equal(maturity.summary.memory_artifact_lifecycle_open_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.open_evidence_count, 1);
    assert.equal(maturity.memory_artifact_lifecycle.observed_ref_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.reconcile_issue_count, 0);
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_apply_handoff_blocked_decision_count, 0);
    assert.equal(
      maturity.memory_artifact_lifecycle.lifecycle_owner_work_order_status,
      'owner_receipt_or_typed_blocker_required_not_ready',
    );
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_owner_work_order_open_count, 1);
    assert.equal(
      maturity.memory_artifact_lifecycle.lifecycle_owner_work_order_next_required_owner_action,
      'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.lifecycle_typed_blocker_work_order_status,
      'typed_blocker_ref_accepted_if_owner_cannot_close_receipt',
    );
    assert.deepEqual(
      maturity.memory_artifact_lifecycle.missing_owner_action_ids,
      ['memory_artifact_lifecycle_owner_receipt_or_typed_blocker_required'],
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.owner_action_checklist[0].requirement_id,
      'memory_artifact_lifecycle_owner_followthrough',
    );
    assert.equal(
      maturity.memory_artifact_lifecycle.owner_action_checklist[0].ready_claim_authorized,
      false,
    );
    const lifecycleWorkOrder = maturity.foundry_agent_os_production_evidence_gate
      .owner_route_work_orders.find(
        (entry: { lane: string }) => entry.lane === 'memory_artifact_lifecycle_apply',
      );
    assert.deepEqual(
      lifecycleWorkOrder.missing_owner_action_ids,
      ['memory_artifact_lifecycle_owner_receipt_or_typed_blocker_required'],
    );
    assert.equal(
      lifecycleWorkOrder.owner_action_checklist[0].closes_memory_or_artifact_ready,
      false,
    );
    assert.equal(maturity.memory_artifact_lifecycle.lifecycle_blockers_count_as_missing_evidence, false);
    assert.equal(maturity.memory_artifact_lifecycle.opl_stores_body_or_verdict, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.authority_boundary.can_write_memory_body, false);
    assert.equal(maturity.authority_boundary.can_mutate_artifact_body, false);
    assert.equal(maturity.status, 'evidence_required');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity requires family defaults', () => {
  const failure = runCliFailure([
    'framework',
    'operating-maturity',
  ]);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
});
