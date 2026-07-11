import { spawnSync } from 'node:child_process';

import { buildFamilyRuntimeControlledApplyContract } from '../../../../src/modules/runway/index.ts';
import { assert, createFamilyContractsFixtureRoot, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('controlled apply projects one generic return contract across domains', () => {
  const expectedReturnShapes = [
    'domain_owner_receipt_ref',
    'quality_gate_receipt_ref',
    'typed_blocker_ref',
    'human_gate_ref',
    'route_back_evidence_ref',
    'no_regression_evidence_ref',
  ];
  const domains = [
    ['medautoscience', 'opl_temporal_controlled_domain_stage_attempt_apply_contract'],
    ['medautogrant', 'opl_temporal_controlled_domain_stage_attempt_apply_contract'],
    ['redcube', 'opl_temporal_controlled_domain_stage_attempt_apply_contract'],
    ['opl-meta-agent', 'opl_temporal_controlled_domain_stage_attempt_apply_contract'],
  ] as const;

  for (const [domainId, contractId] of domains) {
    const contract = buildFamilyRuntimeControlledApplyContract({
      domainId,
      stageId: 'review',
      workspaceLocator: {
        controlled_apply_request: { action_kind: 'controlled_apply' },
      },
    });
    assert.equal(contract.contract_id, contractId);
    assert.deepEqual(contract.authority_boundary.allowed_return_shapes, expectedReturnShapes);
    assert.deepEqual(contract.typed_blockers[0]?.required_return_shapes, expectedReturnShapes);
  }
});

test('runtime snapshot projects stage attempt workbench without owning domain verdicts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: '/tmp/mas',
        runtime_root: '/tmp/mas/runtime',
        artifact_root: '/tmp/mas/artifacts',
        source_refs: ['source:dataset'],
        material_refs: ['material:table1'],
        missing_material_refs: ['material:irb'],
        restore_refs: ['restore:mas-runtime-loop'],
      }),
      '--task',
      'task-runtime-snapshot-attempt',
      '--checkpoint-ref',
      'checkpoint:analysis-seed',
      '--source-fingerprint',
      'sha256:analysis-source',
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
      '--stage-packet-ref',
      'packet:analysis',
      '--checkpoint-ref',
      'checkpoint:analysis-midpoint',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:analysis-closeout'],
        consumed_refs: ['evidence:table1'],
        consumed_memory_refs: ['memory:route-policy'],
        writeback_receipt_refs: ['memory-writeback:receipt-1'],
        rejected_writes: [{ reason: 'domain_truth_write_forbidden' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          quality_refs: ['publication_eval/latest.json'],
          readiness_refs: ['controller_decisions/latest.json'],
          slo_ref: 'slo:analysis-currentness',
          breached_slo_ids: ['ai_reviewer_currentness'],
          repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
          package_refs: ['package:submission-minimal'],
          export_refs: ['export:current-package'],
          gap_report_refs: ['gap:package-readiness'],
          handoff_refs: ['handoff:manual-submission'],
          external_submission_status_ref: 'portal:manual-boundary',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_tray_snapshot;
    const workbench = snapshot.stage_attempt_workbench;
    const projectedAttempt = workbench.attempts[0];

    assert.equal(workbench.surface_kind, 'opl_stage_attempt_workbench');
    assert.equal(workbench.summary.total, 1);
    assert.equal(workbench.summary.by_domain.medautoscience, 1);
    assert.equal(workbench.summary.by_status.completed, 1);
    assert.equal(workbench.provider_completion_is_domain_ready, false);
    assert.equal(projectedAttempt.stage_attempt_id, attemptId);
    assert.equal(projectedAttempt.completion_boundary.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(projectedAttempt.completion_boundary.provider_completion_is_domain_ready, false);
    assert.deepEqual(projectedAttempt.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(projectedAttempt.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(projectedAttempt.lifecycle_primitives.restore_proof.opl_cleanup_allowed, false);
    assert.equal(projectedAttempt.controlled_apply_contract.apply_status, 'no_controlled_apply_request');
    assert.equal(projectedAttempt.rejected_writes[0].reason, 'domain_truth_write_forbidden');

    for (const [surface, boundaryKey] of [
      ['artifact_gallery', 'can_read_artifact_body'],
      ['route_decision_graph', 'can_write_domain_truth'],
      ['review_repair_queue', 'can_write_domain_truth'],
      ['quality_readiness', 'can_authorize_quality_verdict'],
      ['observability_slo', 'can_execute_repair_command'],
      ['workspace_source_intake', 'can_authorize_source_readiness'],
      ['memory_locator_index', 'can_read_memory_body'],
      ['package_export_lifecycle', 'can_authorize_export_verdict'],
      ['action_routing', 'can_execute_domain_action'],
      ['control_loop_summary', 'can_write_domain_truth'],
    ] as const) {
      assert.equal(projectedAttempt[surface].authority_boundary[boundaryKey], false, `${surface}.${boundaryKey}`);
    }

    assert.equal(
      projectedAttempt.action_routing.actions.some((action: { route_target_kind: string }) =>
        action.route_target_kind === 'domain_handler'
      ),
      true,
    );
    assert.equal(
      [...snapshot.attention_items, ...snapshot.running_items, ...snapshot.recent_items]
        .some((item: { item_id: string }) => item.item_id === `opl:stage-attempt:${attemptId}`),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime snapshot groups multi-attempt workbench attention and counters', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-ledger-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attemptIds = [
      ['medautoscience', 'analysis-campaign'],
      ['redcube', 'review'],
      ['medautogrant', 'draft'],
    ].map(([domain, stage]) => runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      domain,
      '--stage',
      stage,
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({ workspace_root: `/tmp/${domain}` }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_stage_attempt.attempt.stage_attempt_id);

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptIds[0],
      '--stage-packet-ref',
      'packet:analysis',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:analysis-closeout'],
        consumed_memory_refs: ['memory:route-policy', 'memory:dataset-policy'],
        writeback_receipt_refs: ['memory-writeback:receipt-1'],
        domain_ready_verdict: 'domain_gate_pending',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '-e',
      `import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(${JSON.stringify(path.join(stateRoot, 'family-runtime', 'queue.sqlite'))});
db.prepare("UPDATE stage_attempts SET status = 'human_gate', human_gate_refs_json = '[\\"gate:review\\"]', blocked_reason = NULL WHERE stage_attempt_id = ?").run(${JSON.stringify(attemptIds[1])});
db.prepare("UPDATE stage_attempts SET status = 'dead_lettered', blocked_reason = 'retry_budget_exhausted' WHERE stage_attempt_id = ?").run(${JSON.stringify(attemptIds[2])});
db.prepare("INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?)").run('sig_gated_human_gate_fixture', ${JSON.stringify(attemptIds[1])}, 'human_gate', '{"human_gate_ref":"gate:review","reason":"operator_review"}', 'test-fixture-projection', '2026-05-14T00:00:01.000Z');
db.prepare("INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?)").run('sig_gated_resume_fixture', ${JSON.stringify(attemptIds[1])}, 'resume', '{"resume_token":"resume:review"}', 'test-fixture-projection', '2026-05-14T00:00:02.000Z');
db.close();`,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    assert.equal(result.status, 0, result.stderr);

    const snapshot = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_tray_snapshot;
    const workbench = snapshot.stage_attempt_workbench;
    const trayItems = [...snapshot.running_items, ...snapshot.attention_items, ...snapshot.recent_items];

    assert.equal(workbench.provider_completion_is_domain_ready, false);
    assert.equal(workbench.summary.total, 3);
    assert.equal(workbench.summary.by_status.completed, 1);
    assert.equal(workbench.summary.by_status.human_gate, 1);
    assert.equal(workbench.summary.by_status.dead_lettered, 1);
    assert.equal(workbench.summary.attention_count, 2);
    assert.equal(workbench.summary.memory_ref_counters.consumed_memory_ref_count, 2);
    assert.equal(workbench.groups.by_domain.medautoscience.memory_ref_counters.consumed_memory_ref_count, 2);
    assert.equal(workbench.groups.by_domain.redcube.human_gate_count, 1);
    assert.equal(workbench.groups.by_domain.medautogrant.dead_letter_count, 1);
    assert.equal(workbench.action_routing.authority_boundary.can_execute_domain_action, false);
    assert.equal(trayItems.some((item: { item_id: string }) => item.item_id === `opl:stage-attempt:${attemptIds[0]}`), false);
    assert.equal(trayItems.some((item: { item_id: string }) => item.item_id === `opl:stage-attempt:${attemptIds[1]}`), true);
    assert.equal(trayItems.some((item: { item_id: string }) => item.item_id === `opl:stage-attempt:${attemptIds[2]}`), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
