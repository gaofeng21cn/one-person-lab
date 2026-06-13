import { spawnSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, runCli, test } from '../../helpers.ts';
import { parseRegisteredFamilyRuntimeCommand } from '../../../../../src/family-runtime-command-parts/registry.ts';
import {
  buildRunwayRecoveryRepairProjection,
} from '../../../../../src/family-runtime-control-loop.ts';

const runwayControlLoopStateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runway-control-loop-test-'));

test('Runway status and interfaces expose control-loop command objects without semantic authority', () => {
  const status = runCli(['runway', 'status']).opl_runway_status;
  const interfaces = runCli(['runway', 'interfaces']).opl_runway_interfaces;

  for (const objectId of [
    'control_loop',
    'progress_reconciler',
    'handoff_gate',
    'recovery_repair',
  ]) {
    assert.equal(status.object_model.includes(objectId), true);
  }
  for (const command of [
    'opl runway readiness --json',
    'opl runway reconcile --json',
    'opl runway control-loop status --json',
    'opl runway handoff-gates --json',
    'opl runway recovery-repair --json',
    'opl family-runtime control-loop status --provider temporal --json',
  ]) {
    assert.equal(interfaces.cli.commands.includes(command), true);
  }
  assert.equal(status.authority_boundary.can_write_domain_truth, false);
  assert.equal(status.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(status.authority_boundary.can_create_typed_blocker, false);
  assert.equal(status.not_claims.includes('provider_completion_is_semantic_progress'), true);
});

test('family-runtime control-loop status command parses the Temporal substrate status surface', () => {
  const parsed = parseRegisteredFamilyRuntimeCommand([
    'control-loop',
    'status',
    '--provider',
    'temporal',
  ]);

  assert.deepEqual(parsed, {
    mode: 'control_loop_status',
    providerKind: 'temporal',
  });
});

test('family-runtime control-loop status distinguishes substrate liveness from semantic authority', () => {
  const output = runCli([
    'family-runtime',
    'control-loop',
    'status',
    '--provider',
    'temporal',
  ], {
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    OPL_TEMPORAL_WORKER_STATUS: '',
  });
  const controlLoop = output.family_runtime_control_loop;

  assert.equal(controlLoop.surface_kind, 'opl_family_runtime_control_loop_status');
  assert.equal(controlLoop.provider_kind, 'temporal');
  assert.equal(controlLoop.provider_runtime.substrate, 'temporal');
  assert.equal(controlLoop.worker_supervisor_liveness.substrate, 'temporal_worker_supervisor');
  assert.equal(controlLoop.scheduler_cadence.substrate, 'temporal_scheduler');
  assert.equal(controlLoop.semantic_loop.progress_reconciler_id, 'runway_progress_reconciler');
  assert.equal(controlLoop.semantic_loop.provider_completion_is_semantic_progress, false);
  assert.equal(controlLoop.authority_boundary.can_write_domain_truth, false);
  assert.equal(controlLoop.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(controlLoop.authority_boundary.can_create_typed_blocker, false);
  assert.equal(controlLoop.authority_boundary.can_authorize_domain_ready, false);
});

test('Runway control-loop status delegates to the family runtime control-loop surface', () => {
  const output = runCli([
    'runway',
    'control-loop',
    'status',
  ], {
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    OPL_TEMPORAL_WORKER_STATUS: '',
  });
  const controlLoop = output.family_runtime_control_loop;

  assert.equal(controlLoop.surface_kind, 'opl_family_runtime_control_loop_status');
  assert.equal(controlLoop.module_id, 'runway');
  assert.equal(controlLoop.provider_runtime.substrate, 'temporal');
  assert.equal(controlLoop.worker_supervisor_liveness.substrate, 'temporal_worker_supervisor');
  assert.equal(controlLoop.semantic_loop.provider_completion_is_semantic_progress, false);
});

test('Runway control-loop sibling commands execute from the module surface', () => {
  const env = {
    OPL_TEMPORAL_ADDRESS: '',
    TEMPORAL_ADDRESS: '',
    OPL_TEMPORAL_WORKER_STATUS: '',
    OPL_STATE_DIR: runwayControlLoopStateDir,
  };
  const readiness = runCli(['runway', 'readiness'], env).opl_runway_readiness;
  const reconcile = runCli(['runway', 'reconcile'], env).opl_runway_reconcile;
  const handoff = runCli(['runway', 'handoff-gates'], env).opl_runway_handoff_gates;
  const repair = runCli(['runway', 'recovery-repair'], env).opl_runway_recovery_repair;

  assert.equal(readiness.surface_kind, 'opl_runway_readiness');
  assert.equal(readiness.readiness_status, 'blocked_provider_not_ready');
  assert.equal(readiness.next_safe_action.action_id, 'repair_provider_liveness');
  assert.equal(readiness.provider_backed_runtime_ready, false);
  assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);

  assert.equal(reconcile.surface_kind, 'opl_runway_reconcile');
  assert.equal(reconcile.reconciler_id, 'runway_progress_reconciler');
  assert.equal(reconcile.selected_next_safe_action.action_id, 'repair_provider_liveness');
  assert.equal(reconcile.mutation_performed, false);
  assert.equal(reconcile.forbidden_next_actions.includes('sign_owner_receipt'), true);

  assert.equal(handoff.surface_kind, 'opl_runway_handoff_gates');
  assert.equal(handoff.accepted_owner_answer_refs.includes('domain_owner_receipt_ref'), true);
  assert.equal(handoff.provider_completion_is_owner_answer, false);
  assert.equal(handoff.provider_completion_is_semantic_progress, false);

  assert.equal(repair.surface_kind, 'opl_runway_recovery_repair');
  assert.equal(repair.repair_status, 'repair_action_available');
  assert.equal(repair.selected_repair_action.action_id, 'repair_provider_liveness');
  assert.equal(repair.authority_boundary.can_create_typed_blocker, false);
});

test('Runway recovery-repair projection exposes blocked worker restart guard without authorizing mutation', () => {
  const repair = buildRunwayRecoveryRepairProjection({
    recovery_repair: {
      repair_policy: 'classify_before_repair',
      repair_classes: ['worker_source_stale'],
      default_repair_command: 'opl family-runtime repair --provider temporal',
      selected_repair_action: {
        action_id: 'repair_provider_liveness',
        owner: 'opl_provider_runtime_manager',
        reason: 'temporal_provider_not_ready',
        command: 'opl family-runtime repair --provider temporal --json',
        mutation: true,
        blocks_runtime_execution: true,
        blocks_domain_progress_claim: true,
      },
      worker_restart_guard: {
        surface_kind: 'temporal_worker_source_stale_restart_guard',
        guard_status: 'blocked',
        blocker_ids: ['active_stage_attempts_present'],
        worker_mutation_guard: null,
        temporal_service_reachable: true,
        stage_attempt_ledger_readable: true,
        stage_attempt_ledger_error: null,
        active_stage_attempt_count: 2,
        active_stage_attempt_statuses: ['checkpointed', 'queued'],
        active_stage_attempts_by_status: {
          checkpointed: 1,
          queued: 1,
        },
        active_stage_attempt_sample_limit: 20,
        active_stage_attempts: [],
      },
    },
    provider_runtime: {
      substrate: 'temporal',
      selected_provider: 'temporal',
      selected_ready: false,
      selected_status: 'provider_code_landed_unconfigured',
      degraded_reason: 'temporal_worker_source_stale',
      runtime_dependency: 'temporal_server_and_worker_required_for_live_workflows',
      live_workflow_execution_ready: false,
    },
    scheduler_cadence: {
      substrate: 'temporal_scheduler',
      status: 'blocked_provider_not_ready',
      schedule_id: null,
      health: null,
      repair_action: null,
    },
    queue: { total: 0, by_status: {} },
    stage_attempts: {
      total: 2,
      by_status: {
        checkpointed: 1,
        queued: 1,
      },
    },
    authority_boundary: {
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_mutate_artifact_body: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  } as unknown as Parameters<typeof buildRunwayRecoveryRepairProjection>[0]);

  assert.equal(repair.repair_status, 'repair_blocked_by_worker_restart_guard');
  assert.deepEqual(repair.repair_blocker_ids, ['active_stage_attempts_present']);
  assert.equal(repair.repair_can_mutate_worker, false);
  assert.equal(repair.worker_restart_guard?.guard_status, 'blocked');
  assert.equal(repair.worker_restart_guard?.active_stage_attempt_count, 2);
  assert.equal(repair.selected_repair_action?.mutation, true);
  assert.equal(repair.authority_boundary.can_write_domain_truth, false);
});

test('bin/opl routes Runway control-loop sibling commands into OPL CLI', () => {
  for (const [args, key] of [
    [['runway', 'readiness', '--json'], 'opl_runway_readiness'],
    [['runway', 'reconcile', '--json'], 'opl_runway_reconcile'],
    [['runway', 'handoff-gates', '--json'], 'opl_runway_handoff_gates'],
    [['runway', 'recovery-repair', '--json'], 'opl_runway_recovery_repair'],
    [['runway', 'control-loop', 'status', '--json'], 'family_runtime_control_loop'],
  ] as const) {
    const result = spawnSync(
      path.join(repoRoot, 'bin', 'opl'),
      args,
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_NO_WARNINGS: '1',
          OPL_SKIP_SKILL_SYNC: '1',
          OPL_TEMPORAL_ADDRESS: '',
          TEMPORAL_ADDRESS: '',
          OPL_TEMPORAL_WORKER_STATUS: '',
          OPL_STATE_DIR: runwayControlLoopStateDir,
        },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(typeof output[key], 'object');
  }
});
