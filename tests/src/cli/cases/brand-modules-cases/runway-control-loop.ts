import { spawnSync } from 'node:child_process';

import { assert, fs, os, parseJsonText, path, repoRoot, runCli, test } from '../../helpers.ts';
import { parseRegisteredFamilyRuntimeCommand } from '../../../../../src/modules/runway/family-runtime-command-parts/registry.ts';
import {
  buildRunwayReconcileProjection,
  buildRunwayRecoveryRepairProjection,
} from '../../../../../src/modules/runway/family-runtime-control-loop.ts';
import {
  buildTemporalFirstRuntimeContract,
} from '../../../../../src/modules/runway/family-runtime-temporal.ts';
import {
  TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS,
} from '../../../../../src/modules/runway/family-runtime-types.ts';

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
  assert.equal(
    controlLoop.provider_runtime.temporal_first_runtime_contract.workflow_activity_signal_mapping
      .stage_run_workflow.contract_name,
    'StageRunWorkflow',
  );
  assert.equal(
    controlLoop.provider_runtime.temporal_first_runtime_contract.workflow_activity_signal_mapping
      .stage_attempt_activity.contract_name,
    'StageAttemptActivity',
  );
  assert.equal(
    controlLoop.provider_runtime.temporal_first_runtime_contract.workflow_activity_signal_mapping
      .reconcile_workflow.contract_name,
    'ReconcileWorkflow',
  );
  assert.equal(
    controlLoop.provider_runtime.temporal_first_runtime_contract.workflow_activity_signal_mapping
      .owner_receipt_signal.contract_name,
    'OwnerReceiptSignal',
  );
  assert.equal(
    controlLoop.provider_runtime.temporal_first_runtime_contract.event_history_mapping
      .temporal_history_is_durable_lifecycle_truth,
    true,
  );
  assert.equal(
    controlLoop.provider_runtime.temporal_first_runtime_contract.event_history_mapping
      .local_provider_role,
    'dev_ci_offline_diagnostic_baseline_only_not_online_readiness_substitute',
  );
  assert.equal(
    controlLoop.provider_runtime.temporal_first_runtime_contract.false_ready_boundary
      .not_proven_by.includes('focused_tests_pass'),
    true,
  );
  assert.equal(controlLoop.worker_supervisor_liveness.substrate, 'temporal_worker_supervisor');
  assert.equal(controlLoop.scheduler_cadence.substrate, 'temporal_scheduler');
  assert.equal(controlLoop.semantic_loop.progress_reconciler_id, 'runway_progress_reconciler');
  assert.equal(controlLoop.semantic_loop.provider_completion_is_semantic_progress, false);
  assert.equal(controlLoop.authority_boundary.can_write_domain_truth, false);
  assert.equal(controlLoop.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(controlLoop.authority_boundary.can_create_typed_blocker, false);
  assert.equal(controlLoop.authority_boundary.can_authorize_domain_ready, false);
});

test('Runway Temporal-first contract readback maps workflows activities signals and false-ready boundary', () => {
  const contract = buildTemporalFirstRuntimeContract();
  const contractPath = path.join(repoRoot, 'contracts/opl-framework/family-runtime-temporal-first-contract.json');

  assert.equal(contract.surface_kind, 'opl_temporal_first_runtime_contract');
  assert.equal(contract.contract_ref, 'contracts/opl-framework/family-runtime-temporal-first-contract.json');
  assert.equal(fs.existsSync(contractPath), true);
  assert.equal(contract.workflow_activity_signal_mapping.stage_run_workflow.current_workflow_type, 'StageAttemptWorkflow');
  assert.equal(contract.workflow_activity_signal_mapping.stage_attempt_activity.contract_name, 'StageAttemptActivity');
  assert.deepEqual(contract.workflow_activity_signal_mapping.stage_attempt_activity.current_activity_types, [
    'CodexStageActivity',
    'DomainHandlerDispatchActivity',
  ]);
  assert.equal(contract.workflow_activity_signal_mapping.reconcile_workflow.contract_name, 'ReconcileWorkflow');
  assert.equal(contract.schedule_mapping.scheduler_may_write_terminal_state, false);
  assert.equal(contract.task_queue_mapping.default_task_queue, 'opl-stage-attempts');
  assert.equal(contract.retry_mapping.codex_stage_activity.maximum_attempts, 1);
  assert.equal(contract.retry_mapping.short_idempotent_activities.maximum_attempts, 3);
  assert.equal(contract.event_history_mapping.temporal_history_is_durable_lifecycle_truth, true);
  assert.equal(contract.event_history_mapping.sqlite_projection_only_fields.includes('tasks.status'), true);
  assert.equal(
    contract.durable_lifecycle_readback.command_surface,
    'opl family-runtime attempt query <stage_attempt_id>',
  );
  assert.equal(
    contract.durable_lifecycle_readback.required_evidence.includes('temporal_schedule_identity'),
    true,
  );
  assert.equal(contract.durable_lifecycle_readback.ready_claim_allowed_without_temporal_history, false);
  assert.equal(
    contract.event_history_mapping.local_provider_role,
    'dev_ci_offline_diagnostic_baseline_only_not_online_readiness_substitute',
  );
  assert.equal(contract.workflow_activity_signal_mapping.human_gate_signal.contract_name, 'HumanGateSignal');
  assert.equal(contract.workflow_activity_signal_mapping.owner_receipt_signal.contract_name, 'OwnerReceiptSignal');
  assert.equal(TEMPORAL_STAGE_ATTEMPT_SIGNAL_KINDS.includes('owner_receipt'), true);
  assert.equal(contract.workflow_activity_signal_mapping.owner_receipt_signal.opl_can_sign_owner_receipt, false);
  assert.equal(contract.false_ready_boundary.not_proven_by.includes('contract_readback'), true);
  assert.equal(contract.false_ready_boundary.forbidden_claims.includes('production_ready'), true);
  assert.equal(contract.authority_boundary.can_write_domain_truth, false);
  assert.equal(contract.authority_boundary.can_sign_owner_receipt, false);
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
  assert.equal(
    controlLoop.queue_lifecycle_boundary.temporal_durable_lifecycle_handoff.local_projection_field_policy
      .tasks_max_attempts, // reuse-first: allow local max_attempts vocabulary boundary.
    'handoff_readback_only_temporal_retry_policy_required',
  );
  assert.equal(
    controlLoop.queue_lifecycle_boundary.temporal_durable_lifecycle_handoff.handoff_claims
      .domain_progress_claim_allowed,
    false,
  );
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
  assert.equal(reconcile.observed_state.queue_lifecycle_boundary.gate.status, 'pass');

  assert.equal(handoff.surface_kind, 'opl_runway_handoff_gates');
  assert.equal(handoff.accepted_owner_answer_refs.includes('domain_owner_receipt_ref'), true);
  assert.equal(handoff.provider_completion_is_owner_answer, false);
  assert.equal(handoff.provider_completion_is_semantic_progress, false);

  assert.equal(repair.surface_kind, 'opl_runway_recovery_repair');
  assert.equal(repair.repair_status, 'repair_action_available');
  assert.equal(repair.selected_repair_action.action_id, 'repair_provider_liveness');
  assert.equal(repair.authority_boundary.can_create_typed_blocker, false);
});

test('Runway reconcile projects competing local queue lifecycle as read-only observed status', () => {
  const reconcile = buildRunwayReconcileProjection({
    control_loop_status: 'attention_required',
    desired_current_reconciliation: {
      reconciler_id: 'runway_progress_reconciler',
      desired_state_ref: 'current_owner_delta',
      current_state_refs: [
        'typed_family_queue',
        'temporal_workflow_visibility',
        'stage_attempt_ledger',
        'provider_worker_lifecycle',
        'scheduler_cadence',
      ],
      allowed_next_actions: ['observe_queue_lifecycle_boundary'],
      selected_next_safe_action: {
        action_id: 'observe_queue_lifecycle_boundary',
        owner: 'opl_runway',
        reason: 'local_sqlite_queue_lifecycle_competes_with_temporal',
        command: 'opl family-runtime queue list --json',
        mutation: false,
        competing_task_count: 1,
        blocks_runtime_execution: true,
        blocks_domain_progress_claim: true,
      },
      forbidden_next_actions: [
        'write_domain_truth',
        'sign_owner_receipt',
        'create_domain_typed_blocker',
        'authorize_quality_verdict',
        'claim_domain_ready',
      ],
    },
    provider_runtime: {
      substrate: 'temporal',
      selected_provider: 'temporal',
      selected_ready: true,
      selected_status: 'ready',
      degraded_reason: 'local_sqlite_queue_lifecycle_competes_with_temporal',
      runtime_dependency: 'temporal_server_and_worker_required_for_live_workflows',
      local_provider_role: 'dev_ci_offline_diagnostic_baseline_only_not_online_readiness_substitute',
      live_workflow_execution_ready: false,
    },
    scheduler_cadence: {
      substrate: 'temporal_scheduler',
      status: 'ok',
      schedule_id: 'opl-family-runtime-provider-scheduler',
      health: null,
      repair_action: null,
    },
    queue: { total: 1, by_status: { retry_waiting: 1 } },
    queue_lifecycle_boundary: {
      surface_kind: 'opl_family_runtime_queue_temporal_lifecycle_boundary',
      selected_provider: 'temporal',
      sqlite_role: 'projection_audit_cache_not_durable_lifecycle_truth',
      temporal_role: 'durable_workflow_activity_retry_dead_letter_and_schedule_truth',
      field_roles: {
        projection_or_audit_when_temporal_selected: ['tasks.status'],
        queue_intake_and_dedupe_fields: ['tasks.task_id'],
        temporal_owned_lifecycle_when_temporal_selected: ['workflow_history'],
      },
      gate: {
        status: 'attention_needed',
        reason: 'local_sqlite_task_lifecycle_status_without_temporal_stage_attempt',
        temporal_migration_required: true,
        required_evidence: [
          'workflow_id',
          'temporal_workflow_history_or_query_readback',
          'stage_attempt_identity',
          'temporal_retry_policy_readback_for_attempt_budget',
          'temporal_activity_failure_or_dead_letter_history', // reuse-first: allow Temporal-owned dead-letter evidence vocabulary.
          'authority_event_ref_or_projection_rebuild_ref',
          'operator_projection_repair_or_retirement_receipt',
        ],
        allowed_readbacks: [
          'opl family-runtime queue list --json',
          'opl family-runtime queue inspect <task_id> --json',
          'opl runway reconcile --json',
        ],
        competing_statuses: ['running', 'retry_waiting', 'blocked', 'dead_letter', 'succeeded'], // reuse-first: allow legacy status fixture
        competing_task_count: 1,
        competing_tasks: [
          {
            task_id: 'frt_retry_waiting',
            status: 'retry_waiting',
            task_kind: 'stage-attempt/closeout',
            dedupe_key: 'mag:test:temporal-queue-boundary',
            attempts: 1,
            max_attempts: 3, // reuse-first: allow local max_attempts vocabulary boundary.
            lease: null,
            last_error: 'planned local queue retry',
            dead_letter_reason: null, // reuse-first: allow local dead-letter vocabulary boundary.
            stage_attempt_count: 0,
            temporal_stage_attempt_count: 0,
            projection_handoff: {
              status_role: 'local_lifecycle_status_projection_only',
              lease_role: 'local_worker_pickup_projection_only_not_live_attempt_truth',
              retry_budget_role: 'local_retry_budget_projection_only_temporal_retry_policy_required',
              terminal_reason_role: 'local_failure_projection_only_temporal_history_required',
              allowed_local_action: 'read_projection_and_emit_operator_handoff_only',
              scheduler_mutation_allowed: false,
              domain_progress_claim_allowed: false,
              ready_claim_allowed: false,
            },
          },
        ],
        readiness_effect: 'full_online_ready_false_until_temporal_history_or_authority_projection_rebuilds_lifecycle',
        scheduler_mutation_allowed: false,
        domain_progress_claim_allowed: false,
        ready_claim_allowed: false,
        forbidden_mutations_when_attention_needed: [
          'scheduler_tick_from_sqlite_lifecycle_projection',
          'queue_redrive_without_temporal_history',
          'domain_progress_or_ready_claim_from_sqlite_projection',
        ],
      },
      temporal_durable_lifecycle_handoff: {
        surface_kind: 'opl_temporal_durable_lifecycle_handoff',
        mature_substrate: 'Temporal workflow history/task queue/retry policy/schedule',
        status: 'required',
        owner: 'opl_runway',
        migration_policy: 'rebuild_or_link_lifecycle_from_temporal_history_before_runtime_ready_claim',
        required_evidence: [
          'workflow_id',
          'temporal_workflow_history_or_query_readback',
          'stage_attempt_identity',
          'temporal_retry_policy_readback_for_attempt_budget',
          'temporal_activity_failure_or_dead_letter_history', // reuse-first: allow Temporal-owned dead-letter evidence vocabulary.
          'authority_event_ref_or_projection_rebuild_ref',
          'operator_projection_repair_or_retirement_receipt',
        ],
        readback_surfaces: [
          'opl family-runtime queue list --json',
          'opl family-runtime queue inspect <task_id> --json',
          'opl runway reconcile --json',
        ],
        local_projection_field_policy: {
          tasks_status: 'handoff_readback_only_not_temporal_workflow_status',
          tasks_attempts: 'handoff_readback_only_temporal_retry_policy_required',
          tasks_max_attempts: 'handoff_readback_only_temporal_retry_policy_required', // reuse-first: allow local max_attempts vocabulary boundary.
          tasks_lease_owner: 'handoff_readback_only_not_worker_or_activity_ownership', // reuse-first: allow local lease_owner vocabulary boundary.
          tasks_lease_expires_at: 'handoff_readback_only_not_worker_or_activity_ownership', // reuse-first: allow local lease_owner vocabulary boundary.
          tasks_dead_letter_reason: 'handoff_readback_only_temporal_failure_history_required', // reuse-first: allow local dead-letter vocabulary boundary.
        },
        allowed_local_action: 'read_projection_and_emit_operator_handoff_only',
        forbidden_local_actions: [
          'treat_sqlite_task_status_as_temporal_lifecycle_truth',
          'retry_or_dead_letter_without_temporal_history',
          'derive_retry_budget_from_tasks_max_attempts', // reuse-first: allow local max_attempts vocabulary boundary.
          'derive_worker_liveness_from_tasks_lease_owner', // reuse-first: allow local lease_owner vocabulary boundary.
          'derive_terminal_failure_from_tasks_dead_letter_reason', // reuse-first: allow local dead-letter vocabulary boundary.
          'claim_provider_backed_runtime_ready',
          'claim_domain_progress_or_domain_ready',
          'schedule_tick_from_local_lifecycle_projection',
        ],
        handoff_claims: {
          scheduler_mutation_allowed: false,
          domain_progress_claim_allowed: false,
          provider_ready_claim_authority: 'not_this_handoff_readback',
          ready_claim_allowed_without_temporal_history: false,
        },
      },
      authority_boundary: {
        opl_sqlite_can_project_runtime_state: true,
        opl_sqlite_can_own_temporal_durable_lifecycle: false,
        temporal_owns_durable_lifecycle_when_selected: true,
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        provider_completion_is_domain_ready: false,
      },
    },
    stage_attempts: { total: 0, by_status: {} },
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
  } as unknown as Parameters<typeof buildRunwayReconcileProjection>[0]);

  assert.equal(reconcile.selected_next_safe_action.action_id, 'observe_queue_lifecycle_boundary');
  assert.equal(reconcile.selected_next_safe_action.command, 'opl family-runtime queue list --json');
  assert.equal(reconcile.selected_next_safe_action.mutation, false);
  assert.equal(reconcile.apply_command, null);
  assert.equal(reconcile.observed_state.queue_lifecycle_boundary.gate.status, 'attention_needed');
  assert.equal(reconcile.observed_state.queue_lifecycle_boundary.gate.scheduler_mutation_allowed, false);
  assert.equal(
    reconcile.observed_state.queue_lifecycle_boundary.gate.competing_tasks[0].projection_handoff
      .domain_progress_claim_allowed,
    false,
  );
  assert.equal(reconcile.observed_state.queue_lifecycle_boundary.authority_boundary.can_write_domain_truth, false);
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
        active_stage_attempt_count: 1,
        active_stage_attempt_statuses: ['running'],
        active_stage_attempts_by_status: {
          running: 1,
        },
        active_stage_attempt_sample_limit: 20,
        active_stage_attempts: [],
        diagnostic_stage_attempt_count: 3,
        diagnostic_stage_attempt_statuses: ['checkpointed', 'queued', 'running'],
        diagnostic_stage_attempts_by_status: {
          checkpointed: 1,
          queued: 1,
          running: 1,
        },
        diagnostic_stage_attempt_sample_limit: 20,
        diagnostic_stage_attempts: [],
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
  assert.equal(repair.worker_restart_guard?.active_stage_attempt_count, 1);
  assert.equal(repair.selected_repair_action?.mutation, true);
  assert.equal(repair.authority_boundary.can_write_domain_truth, false);
});

test('Runway recovery-repair allows worker repair when only restart diagnostic backlog remains', () => {
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
        guard_status: 'ready',
        blocker_ids: [],
        worker_mutation_guard: null,
        temporal_service_reachable: true,
        stage_attempt_ledger_readable: true,
        stage_attempt_ledger_error: null,
        active_stage_attempt_count: 0,
        active_stage_attempt_statuses: [],
        active_stage_attempts_by_status: {},
        active_stage_attempt_sample_limit: 20,
        active_stage_attempts: [],
        diagnostic_stage_attempt_count: 2,
        diagnostic_stage_attempt_statuses: ['checkpointed', 'queued'],
        diagnostic_stage_attempts_by_status: {
          checkpointed: 1,
          queued: 1,
        },
        diagnostic_stage_attempt_sample_limit: 20,
        diagnostic_stage_attempts: [],
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

  assert.equal(repair.repair_status, 'repair_action_available');
  assert.deepEqual(repair.repair_blocker_ids, []);
  assert.equal(repair.repair_can_mutate_worker, true);
  assert.equal(repair.worker_restart_guard?.guard_status, 'ready');
  assert.equal(repair.worker_restart_guard?.active_stage_attempt_count, 0);
  assert.equal(repair.worker_restart_guard?.diagnostic_stage_attempt_count, 2);
  assert.equal(repair.authority_boundary.can_write_domain_truth, false);
});

test('Runway recovery-repair classifies blocked and failed attempts into operator repair queries', () => {
  const repair = buildRunwayRecoveryRepairProjection({
    recovery_repair: {
      repair_policy: 'classify_before_repair',
      repair_classes: [
        'worker_not_ready',
        'worker_source_stale',
        'scheduler_not_installed',
        'workflow_stale',
        'queue_missing_current_owner_delta',
        'receipt_invalid',
        'domain_owner_blocked',
      ],
      default_repair_command: null,
      selected_repair_action: {
        action_id: 'retry',
        owner: 'opl_runway',
        reason: 'blocked_or_failed_stage_attempts_need_repair_classification',
        command: 'opl runway recovery-repair --json',
        mutation: false,
        repairable_attempt_count: 5,
        blocks_runtime_execution: true,
        blocks_domain_progress_claim: true,
      },
      worker_restart_guard: null,
    },
    provider_runtime: {
      substrate: 'temporal',
      selected_provider: 'temporal',
      selected_ready: true,
      selected_status: 'ready',
      degraded_reason: null,
      runtime_dependency: 'temporal_server_and_worker_required_for_live_workflows',
      live_workflow_execution_ready: true,
    },
    scheduler_cadence: {
      substrate: 'temporal_scheduler',
      status: 'ok',
      schedule_id: 'opl-family-runtime-provider-scheduler',
      health: null,
      repair_action: null,
    },
    queue: { total: 0, by_status: {} },
    stage_attempts: {
      total: 5,
      by_status: {
        blocked: 3,
        failed: 2,
      },
      repair_breakdown: {
        sample_limit: 25,
        by_status_reason: [
          {
            status: 'blocked',
            reason: 'mas_owner_answer_typed_blocker_observed',
            attempt_count: 3,
          },
          {
            status: 'failed',
            reason: 'temporal_workflow_failed',
            attempt_count: 2,
          },
        ],
        by_status_stage_reason: [
          {
            status: 'blocked',
            stage_id: 'domain_route/reconcile-apply',
            reason: 'mas_owner_answer_typed_blocker_observed',
            attempt_count: 3,
          },
          {
            status: 'failed',
            stage_id: 'domain_owner/default-executor-dispatch',
            reason: 'temporal_workflow_failed',
            attempt_count: 2,
          },
        ],
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

  assert.equal(repair.repair_status, 'repair_action_available');
  assert.equal(repair.default_repair_command, 'opl family-runtime attempt list --status blocked --json');
  const selectedRepairAction = repair.selected_repair_action;
  assert.ok(selectedRepairAction);
  assert.equal(selectedRepairAction.command, 'opl family-runtime attempt list --status blocked --json');
  assert.equal(selectedRepairAction.mutation, false);
  assert.deepEqual(repair.attempt_repair_queue.summary, {
    repairable_attempt_count: 5,
    blocked_attempt_count: 3,
    failed_attempt_count: 2,
  });
  assert.deepEqual(repair.attempt_repair_queue.items.map((item: Record<string, unknown>) => item.status), [
    'blocked',
    'failed',
  ]);
  assert.deepEqual(repair.attempt_repair_queue.items.map((item: Record<string, unknown>) => item.command), [
    'opl family-runtime attempt list --status blocked --json',
    'opl family-runtime attempt list --status failed --json',
  ]);
  assert.deepEqual(repair.attempt_repair_queue.breakdown.by_status_reason, [
    {
      status: 'blocked',
      reason: 'mas_owner_answer_typed_blocker_observed',
      attempt_count: 3,
    },
    {
      status: 'failed',
      reason: 'temporal_workflow_failed',
      attempt_count: 2,
    },
  ]);
  assert.deepEqual(repair.attempt_repair_queue.breakdown.by_status_stage_reason, [
    {
      status: 'blocked',
      stage_id: 'domain_route/reconcile-apply',
      reason: 'mas_owner_answer_typed_blocker_observed',
      attempt_count: 3,
    },
    {
      status: 'failed',
      stage_id: 'domain_owner/default-executor-dispatch',
      reason: 'temporal_workflow_failed',
      attempt_count: 2,
    },
  ]);
  assert.equal(repair.attempt_repair_queue.authority_boundary.can_write_domain_truth, false);
  assert.equal(repair.attempt_repair_queue.authority_boundary.can_create_typed_blocker, false);
  assert.equal(repair.attempt_repair_queue.authority_boundary.can_authorize_domain_ready, false);
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
    const output = parseJsonText(result.stdout) as Record<string, unknown>;
    assert.equal(typeof output[key], 'object');
  }
});
