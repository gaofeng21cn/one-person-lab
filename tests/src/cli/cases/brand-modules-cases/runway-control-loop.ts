import { assert, fs, os, path, runCli, test } from '../../helpers.ts';
import { buildRunwayRecoveryRepairProjection } from '../../../../../src/modules/runway/family-runtime-control-loop.ts';
import { parseRegisteredFamilyRuntimeCommand } from '../../../../../src/modules/runway/family-runtime-command-parts/registry.ts';
import { buildTemporalFirstRuntimeContract } from '../../../../../src/modules/runway/family-runtime-temporal.ts';

test('Runway control-loop surfaces stay refs-only and route through family-runtime', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runway-control-loop-slim-'));
  try {
    const status = runCli(['runway', 'status']).opl_runway_status;
    const interfaces = runCli(['runway', 'interfaces']).opl_runway_interfaces;
    const controlLoop = runCli([
      'family-runtime',
      'control-loop',
      'status',
      '--provider',
      'temporal',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
    }).family_runtime_control_loop;

    assert.equal(status.not_claims.includes('provider_completion_is_semantic_progress'), true);
    assert.equal(interfaces.cli.commands.includes('opl runway control-loop status --json'), true);
    assert.equal(controlLoop.surface_kind, 'opl_family_runtime_control_loop_status');
    assert.equal(controlLoop.provider_runtime.substrate, 'temporal');
    assert.equal(controlLoop.semantic_loop.provider_completion_is_semantic_progress, false);
    assert.equal(controlLoop.authority_boundary.can_write_domain_truth, false);
    assert.equal(controlLoop.authority_boundary.can_sign_owner_receipt, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal-first runtime contract keeps false-ready and lifecycle boundaries visible', () => {
  const parsed = parseRegisteredFamilyRuntimeCommand(['control-loop', 'status', '--provider', 'temporal']);
  const contract = buildTemporalFirstRuntimeContract();

  assert.deepEqual(parsed, { mode: 'control_loop_status', providerKind: 'temporal' });
  assert.equal(contract.event_history_mapping.temporal_history_is_durable_lifecycle_truth, true);
  assert.equal(contract.event_history_mapping.sqlite_sidecar_role, 'projection_and_readback_index_only_not_runtime_provider');
  assert.equal(contract.false_ready_boundary.not_proven_by.includes('focused_tests_pass'), true);
  assert.equal(contract.authority_boundary.can_sign_owner_receipt, false);
});

test('Runway read-only repair action classifies attempts before redrive', () => {
  const recoveryRepair = buildRunwayRecoveryRepairProjection({
    recovery_repair: {
      repair_policy: 'classify_before_repair',
      repair_classes: [],
      default_repair_command: null,
      selected_repair_action: {
        action_id: 'classify_attempts_before_redrive',
        owner: 'opl_runway',
        reason: 'blocked_or_failed_stage_attempts_need_repair_classification',
        command: 'opl family-runtime attempt list --status blocked --json',
        mutation: false,
        repairable_attempt_count: 1,
        blocked_attempt_count: 1,
        failed_attempt_count: 0,
        blocks_runtime_execution: true,
        blocks_domain_progress_claim: true,
      },
      worker_restart_guard: null,
    },
    stage_attempts: {
      total: 1,
      by_status: { blocked: 1 },
      repair_breakdown: {
        sample_limit: 1,
        by_status_reason: [],
        by_status_stage_reason: [],
      },
    },
    provider_runtime: {},
    scheduler_cadence: {},
    queue: {},
    authority_boundary: {},
  } as any);
  const selectedRepairAction = recoveryRepair.selected_repair_action;
  if (!selectedRepairAction) {
    assert.fail('expected a selected repair action');
  }

  assert.equal(selectedRepairAction.action_id, 'classify_attempts_before_redrive');
  assert.equal(selectedRepairAction.mutation, false);
  assert.equal(selectedRepairAction.command, 'opl family-runtime attempt list --status blocked --json');
  assert.equal(recoveryRepair.default_repair_command, 'opl family-runtime attempt list --status blocked --json');
});
