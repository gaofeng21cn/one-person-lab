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
import { insertProviderProof } from './runtime-app-operator-drilldown-helpers.ts';

test('runtime app-operator-drilldown reconciles MAS refs-only payload with OPL lifecycle ledger refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-mas-lifecycle-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);

  masManifest.runtime_inventory = {
    ...((masManifest.runtime_inventory as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_runtime_inventory_projection',
      source_refs: ['mas://runtime/inventory/latest.json'],
      freshness: {
        status: 'current',
        source_ref: 'mas://runtime/freshness/latest.json',
      },
    },
  };
  masManifest.progress_projection = {
    ...((masManifest.progress_projection as Record<string, unknown>) ?? {}),
    domain_projection: {
      surface_kind: 'mas_opl_runtime_workbench_projection',
      source_refs: ['mas://runtime/workbench/latest.json'],
      owner_receipt_refs: ['mas-owner-receipt:projection-current'],
      typed_blocker_refs: ['mas-blocker:projection-owner-chain-soak'],
      freshness: {
        status: 'current',
        source_ref: 'mas://runtime/workbench/freshness.json',
      },
    },
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
    runCli([
      'family-runtime',
      'lifecycle',
      'apply',
      '--mode',
      'apply',
      '--domain',
      'medautoscience',
      '--source-ref',
      'mas://lifecycle/cleanup-plan',
      '--manifest-ref',
      'manifest:mas:lifecycle',
      '--action',
      JSON.stringify({
        action_id: 'record-opl-cleanup-index',
        action_kind: 'cleanup',
        owner_scope: 'opl_owned_index_ref',
        target_ref: 'opl://family-runtime/index/mas-run-42',
        restore_proof_refs: ['restore-proof:mas-index'],
      }),
      '--action',
      JSON.stringify({
        action_id: 'record-domain-artifact-receipt-ref',
        action_kind: 'artifact_receipt_index',
        owner_scope: 'domain_artifact_mutation_receipt_ref',
        target_ref: 'mas://artifact/current-package.zip',
        restore_proof_refs: ['restore-proof:mas-package'],
        domain_artifact_mutation_receipt_refs: ['mas-owner-receipt:artifact-cleanup'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

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
      JSON.stringify({
        workspace_root: '/tmp/mas',
        runtime_root: '/tmp/mas/runtime',
        artifact_root: '/tmp/mas/artifacts',
        source_refs: ['source:dataset', 'mas://source/evidence-ledger'],
        material_refs: ['material:table1'],
        restore_refs: ['restore:study-run'],
        controlled_apply_request: {
          action_kind: 'mas_guarded_apply',
          owner_receipt_refs: ['mas-owner-receipt:guarded-apply'],
          no_regression_evidence_refs: ['mas-no-regression:package'],
        },
        lifecycle_apply_requests: [
          {
            action_id: 'mas-opl-ledger-cleanup',
            action_kind: 'cleanup',
            target_ref: 'opl-ledger:mas-run',
            authority_owner: 'opl_framework',
            owner_scope: 'opl_owned_ledger',
          },
          {
            action_id: 'mas-domain-package-cleanup',
            action_kind: 'cleanup',
            target_ref: 'artifact:mas-package',
            authority_owner: 'med-autoscience',
            owner_scope: 'domain_owned_artifact',
            restore_ref: 'restore:study-run',
          },
        ],
        transition_bridge: {
          transition_id: 'mas-publication-currentness',
          transition_status: 'blocked',
          current_state: 'draft_ready',
          next_state: 'publication_quality_review',
          evidence: {
            owner_receipt_refs: ['mas-owner-receipt:transition'],
            typed_blocker_refs: ['mas-blocker:publication-currentness'],
            typed_blockers: [
              {
                blocker_id: 'publication_currentness_not_proven',
                blocker_kind: 'freshness',
                required_owner: 'med-autoscience',
              },
            ],
          },
        },
      }),
      '--source-fingerprint',
      'sha256:mas-drilldown-source',
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
        consumed_refs: ['artifact:table', 'artifact:figure'],
        consumed_memory_refs: ['memory:route-policy'],
        writeback_receipt_refs: ['memory-writeback:receipt-1'],
        rejected_writes: [{ target: 'memory', reason: 'domain_memory_body_write_forbidden' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          owner_receipt_refs: ['mas-owner-receipt:route-impact'],
          typed_blocker_refs: ['mas-blocker:stale-review'],
          typed_blockers: [
            {
              blocker_id: 'ai_reviewer_currentness_stale',
              blocker_kind: 'freshness',
              required_owner: 'med-autoscience',
            },
          ],
          quality_refs: ['publication_eval/latest.json'],
          readiness_refs: ['controller_decisions/latest.json'],
          repair_command: 'medautosci sidecar dispatch --task <task.json> --format json',
          direct_skill_ref: 'skill:mas/review',
          package_refs: ['package:submission-minimal'],
          export_refs: ['export:current-package'],
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const output = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const drilldown = output.app_operator_drilldown;

    assert.equal(drilldown.authority_boundary.can_write_domain_truth, false);
    assert.equal(drilldown.authority_boundary.can_read_memory_body, false);
    assert.equal(drilldown.authority_boundary.can_read_artifact_body, false);
    assert.equal(drilldown.summary.owner_receipt_ref_count, 4);
    assert.equal(drilldown.summary.typed_blocker_count, 3);
    assert.equal(drilldown.summary.domain_dispatch_evidence_domain_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_attempt_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_owner_receipt_ref_count, 3);
    assert.equal(drilldown.summary.domain_dispatch_evidence_typed_blocker_ref_count, 2);
    assert.equal(drilldown.summary.domain_dispatch_evidence_no_regression_ref_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_memory_writeback_ref_count, 1);
    assert.equal(drilldown.summary.domain_dispatch_evidence_domain_ready_claim_count, 0);
    assert.equal(drilldown.summary.lifecycle_index_ref_count, 2);
    assert.equal(drilldown.summary.lifecycle_restore_proof_ref_count, 2);
    assert.equal(drilldown.summary.lifecycle_reconcile_missing_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_reconcile_extra_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_reconcile_stale_ref_count, 0);
    assert.equal(drilldown.summary.lifecycle_domain_physical_delete_requires_owner_receipt, true);
    assert.equal(drilldown.summary.lifecycle_domain_physical_delete_can_execute, false);
    assert.equal(drilldown.summary.lifecycle_opl_cleanup_apply_can_execute, true);
    assert.equal(drilldown.summary.safe_action_ref_count >= 2, true);
    assert.equal(drilldown.summary.freshness_signal_count >= 1, true);

    assert.equal(
      drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:guarded-apply'
      ),
      true,
    );
    assert.equal(
      drilldown.owner_receipt_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-owner-receipt:transition'
      ),
      true,
    );
    assert.equal(
      drilldown.typed_blocker_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'mas-blocker:publication-currentness'
      ),
      true,
    );
    assert.equal(
      drilldown.typed_blocker_refs.blockers.some((blocker: { blocker_id: string }) =>
        blocker.blocker_id === 'domain_owned_lifecycle_receipt_required'
      ),
      true,
    );
    assert.equal(drilldown.domain_dispatch_evidence.surface_kind, 'opl_app_drilldown_domain_dispatch_evidence');
    assert.equal(drilldown.domain_dispatch_evidence.summary.domain_count, 1);
    assert.equal(drilldown.domain_dispatch_evidence.by_domain.medautoscience.attempt_count, 1);
    assert.equal(
      drilldown.domain_dispatch_evidence.by_domain.medautoscience.domain_ready_claim_count,
      0,
    );
    assert.equal(
      drilldown.domain_dispatch_evidence.attempts[0].authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.deepEqual(
      drilldown.domain_dispatch_evidence.attempts[0].no_regression_evidence_refs,
      ['mas-no-regression:package'],
    );
    assert.deepEqual(
      drilldown.domain_dispatch_evidence.attempts[0].writeback_receipt_refs,
      ['memory-writeback:receipt-1'],
    );
    assert.equal(
      drilldown.freshness_refs.refs.some((ref: { source_fingerprint: string }) =>
        ref.source_fingerprint === 'sha256:mas-drilldown-source'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.source_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'source:dataset'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.artifact_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'artifact:table'
      ),
      true,
    );
    assert.equal(
      drilldown.ref_family_refs.memory_refs.refs.some((ref: { ref: string }) =>
        ref.ref === 'memory:route-policy'
      ),
      true,
    );
    assert.equal(
      drilldown.safe_action_refs.refs.some((ref: { role: string; ref: string }) =>
        ref.role === 'lifecycle_cleanup_receipt_ref'
          && ref.ref.startsWith('opl://family-runtime/lifecycle-apply/medautoscience')
      ),
      true,
    );
    assert.deepEqual(drilldown.lifecycle_ledger_refs.restore_proof_refs, [
      'restore-proof:mas-index',
      'restore-proof:mas-package',
    ]);
    assert.equal(drilldown.lifecycle_ledger_refs.reconcile_projection.status, 'reconciled');
    assert.equal(
      drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.can_execute_delete,
      false,
    );
    assert.equal(
      drilldown.lifecycle_ledger_refs.reconcile_projection.delete_ready_proof.opl_cleanup_apply_ready,
      true,
    );
    assert.equal(drilldown.lifecycle_ledger_refs.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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

test('runtime action execute records and verifies stage production evidence receipts through OPL ledger only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-stage-evidence-'));
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
          cohort_query_refs: [],
          trigger_refs: [],
          metric_refs: [],
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

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(drilldown.summary.stage_production_evidence_receipt_action_route_count, 1);
    assert.equal(
      drilldown.summary.stage_production_evidence_receipt_record_requires_domain_or_app_payload_count,
      1,
    );
    assert.equal(
      drilldown.summary.stage_production_evidence_receipt_record_payload_template_count,
      1,
    );
    assert.equal(
      drilldown.summary.stage_production_evidence_payload_workorder_count,
      1,
    );
    const route = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:record',
    );
    assert.equal(route.action_kind, 'stage_production_evidence_receipt_record');
    assert.equal(route.request_id, 'stage_production_evidence:medautoscience:review');
    assert.equal(route.request_pack_id, 'medautoscience.stage_production_evidence');
    assert.deepEqual(route.required_evidence_refs, [
      'mas:review-receipt',
      'owner_receipt:review',
      'metric:review/currentness',
    ]);
    assert.equal(route.creates_domain_action, false);
    assert.equal(route.creates_owner_receipt, false);
    assert.equal(route.closes_expected_receipt_refs, false);
    assert.equal(route.closes_monitor_freshness, false);
    assert.equal(
      route.route_status_detail,
      'record_route_available_waiting_for_domain_app_or_live_refs_payload',
    );
    assert.equal(
      route.open_reason,
      'unobserved_expected_receipt_or_monitor_freshness_refs_require_domain_app_or_live_payload_before_closure',
    );
    assert.equal(
      route.payload_requirement,
      'domain_app_or_live_refs_payload_required_to_record_stage_expected_receipt_or_monitor_freshness',
    );
    assert.equal(route.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.equal(route.can_close_without_domain_or_app_payload, false);
    assert.deepEqual(route.payload_template, {
      domain_receipt_refs: [],
      evidence_refs: [],
      typed_blocker_refs: [],
      no_regression_refs: [],
      owner_chain_refs: [],
    });
    assert.deepEqual(route.payload_ref_hints.domain_receipt_refs_should_cover, [
      'mas:review-receipt',
      'owner_receipt:review',
    ]);
    assert.deepEqual(route.payload_ref_hints.evidence_refs_should_cover_monitor_freshness, [
      'metric:review/currentness',
    ]);
    assert.equal(route.payload_ref_hints.typed_blocker_refs_may_close_instead_of_success, true);
    assert.equal(
      route.payload_template_policy,
      'template_is_empty_by_design_replace_with_real_domain_app_or_live_refs_before_submit',
    );
    assert.equal(
      route.payload_preflight_policy,
      'opl_preflights_stage_evidence_payload_before_recording_refs_only_receipt',
    );
    assert.equal(route.payload_workorder.surface_kind, 'opl_stage_production_evidence_payload_workorder');
    assert.deepEqual(route.payload_workorder.success_path_requires.domain_receipt_refs_cover, [
      'mas:review-receipt',
    ]);
    assert.deepEqual(
      route.payload_workorder.success_path_requires.domain_receipt_instance_required_for_declared_refs,
      ['owner_receipt:review'],
    );
    assert.equal(
      route.opl_generated_receipt_policy,
      'OPL_must_not_generate_domain_owner_receipts_monitor_freshness_or_no_regression_refs',
    );
    assert.equal(route.authority_boundary.can_write_domain_truth, false);

    const blockedTemplateExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify(route.payload_template),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    assert.equal(blockedTemplateExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      blockedTemplateExecution.payload.error.details.preflight.status,
      'blocked',
    );
    assert.deepEqual(
      blockedTemplateExecution.payload.error.details.preflight.uncovered_expected_receipt_refs,
      ['mas:review-receipt', 'owner_receipt:review'],
    );

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:record',
      '--payload',
      JSON.stringify({
        evidence_refs: ['metric:review/currentness'],
        domain_receipt_refs: ['mas:review-receipt', 'mas://receipts/review-owner-instance.json'],
        no_regression_refs: ['mas:no-regression:review-currentness'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(
      recordExecution.execution.result.stage_production_evidence_payload_preflight.status,
      'ready_to_record',
    );
    assert.equal(recordExecution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(recordExecution.execution.result.external_evidence_apply.authority_boundary.opl_records_refs_only, true);
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);

    const recordedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const verifyRoute = recordedDrilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'stage-production-evidence:medautoscience:review:verify',
    );
    assert.equal(verifyRoute.action_kind, 'stage_production_evidence_receipt_verify');
    assert.equal(verifyRoute.closes_expected_receipt_refs, true);
    assert.equal(verifyRoute.closes_monitor_freshness, true);
    assert.equal(
      verifyRoute.route_status_detail,
      'verify_route_available_for_recorded_refs_only_stage_evidence_receipt',
    );
    assert.equal(
      verifyRoute.payload_requirement,
      'previously_recorded_opl_refs_only_receipt_required_to_verify_stage_evidence',
    );
    assert.equal(verifyRoute.payload_owner, 'opl_external_evidence_ledger');
    assert.equal(verifyRoute.route_requires_domain_or_app_payload, false);
    assert.equal(verifyRoute.can_close_without_domain_or_app_payload, true);
    assert.equal(verifyRoute.payload_template, null);
    assert.equal(verifyRoute.payload_ref_hints, null);
    assert.equal(
      verifyRoute.payload_template_policy,
      'verify_route_uses_previously_recorded_opl_refs_only_receipt_no_payload_required',
    );
    assert.equal(
      recordedDrilldown.summary.stage_production_evidence_receipt_record_requires_domain_or_app_payload_count,
      0,
    );
    assert.equal(
      recordedDrilldown.summary.stage_production_evidence_receipt_record_payload_template_count,
      0,
    );
    assert.equal(
      recordedDrilldown.summary.stage_production_evidence_payload_workorder_count,
      0,
    );

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'stage-production-evidence:medautoscience:review:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(verifyExecution.execution.result.external_evidence_apply.status, 'verified');
    assert.equal(
      verifyExecution.execution.result.external_evidence_apply.receipt.receipt_refs.includes('mas:review-receipt'),
      true,
    );

    const verifiedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const stage = verifiedDrilldown.stage_production_evidence.stages.find(
      (entry: { stage_id: string }) => entry.stage_id === 'review',
    );
    assert.equal(stage.stage_evidence_receipt_status, 'verified');
    assert.deepEqual(stage.observed_expected_receipt_refs, [
      'mas:review-receipt',
      'mas://receipts/review-owner-instance.json',
    ]);
    assert.deepEqual(stage.monitor_freshness_refs, ['metric:review/currentness']);
    assert.equal(
      stage.missing_production_evidence.includes('expected_receipt_ref_not_observed'),
      false,
    );
    assert.equal(
      stage.missing_production_evidence.includes('monitor_freshness_ref_not_observed'),
      false,
    );
    assert.equal(stage.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(verifiedDrilldown.summary.stage_production_evidence_receipt_action_route_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute can run provider scheduler routes from App drilldown', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-scheduler-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).app_operator_drilldown;

    assert.equal(
      drilldown.operator_action_routing_refs.refs.some(
        (ref: { action_id: string; action_kind: string }) =>
          ref.action_id === 'provider-scheduler:temporal:status'
          && ref.action_kind === 'provider_scheduler_status',
      ),
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === 'provider-scheduler:temporal:status'
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'provider-scheduler:temporal:status',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_provider_scheduler');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(
      execution.execution.executed_runtime_command,
      'opl family-runtime scheduler status --provider temporal',
    );
    assert.equal(
      execution.execution.result.family_runtime_scheduler_cadence.status,
      'blocked_provider_not_ready',
    );
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute can apply and verify legacy cleanup plans from App drilldown', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-legacy-cleanup-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.standard_domain_agent_skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    artifact_locator_contract: {
      surface_kind: 'artifact_locator_contract',
      locator_model: 'workspace_runtime_artifact_root',
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
  };
  masManifest.physical_skeleton_follow_through = {
    surface_kind: 'mas_physical_skeleton_follow_through',
    status: 'minimum_repo_source_anchors_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
    direct_skill_parity_refs: ['proof:mas:direct-skill-parity'],
    opl_hosted_parity_refs: ['proof:mas:opl-hosted-parity'],
    replacement_parity_refs: ['proof:mas:replacement-parity'],
    provenance_refs: ['docs/history/runtime-substrate/mas-local-runtime-tombstone.md'],
    legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
    legacy_active_path_residue: [
      {
        path_family: 'default MAS local scheduler',
        state: 'tombstone_only',
        evidence_ref: 'docs/history/runtime-substrate/mas-local-scheduler-tombstone.md',
      },
    ],
  };
  masManifest.legacy_retirement_tombstone_proof = {
    status: 'no_active_default_caller_proven',
    active_default_callers: [],
    tombstone_refs: ['docs/history/runtime-substrate/mas-local-scheduler-tombstone.md'],
    source_refs: ['docs/decisions.md#temporal-runtime'],
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

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(
      drilldown.operator_action_routing_refs.refs.some(
        (ref: { action_id: string; action_kind: string }) =>
          ref.action_id === 'legacy-cleanup:medautoscience:apply'
          && ref.action_kind === 'legacy_cleanup_apply',
      ),
      true,
    );
    assert.equal(
      drilldown.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === 'legacy-cleanup:medautoscience:apply'
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );

    const applyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'legacy-cleanup:medautoscience:apply',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(applyExecution.execution.execution_kind, 'opl_cli_legacy_cleanup_apply');
    assert.equal(applyExecution.execution.execution_status, 'executed');
    assert.equal(
      applyExecution.execution.executed_runtime_command,
      'opl agents legacy-cleanup apply --domain medautoscience --mode apply --source-ref opl://agents/med-autoscience/legacy-cleanup-plan',
    );
    assert.equal(
      applyExecution.execution.result.family_agent_legacy_cleanup_apply.lifecycle_apply.status,
      'applied',
    );
    assert.equal(
      applyExecution.execution.result.family_agent_legacy_cleanup_apply.authority_boundary.opl_can_move_or_delete_domain_repo_files,
      false,
    );

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'legacy-cleanup:medautoscience:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_legacy_cleanup_apply');
    assert.equal(verifyExecution.execution.execution_status, 'executed');
    assert.equal(
      verifyExecution.execution.result.family_agent_legacy_cleanup_apply.lifecycle_apply.status,
      'verified',
    );
    assert.equal(verifyExecution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute records and verifies external evidence request routes through OPL ledger only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.functional_privatization_audit = {
    target_domain_id: 'medautoscience',
    external_evidence_request_pack: {
      request_pack_id: 'mas.external_evidence_request_pack.fixture',
      owner: 'med-autoscience',
      request_owner: 'med-autoscience',
      requested_from: ['one-person-lab', 'codex_app'],
      policy: 'request_refs_receipt_shapes_and_parity_only_no_runtime_implementation',
      requests: [
        {
          request_id: 'app_workbench_package_ref_consumption',
          status: 'requested_not_received',
          required_evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
          required_return_shapes: ['domain_owner_receipt', 'typed_blocker'],
          required_receipt_shapes: ['lifecycle_receipt_ref'],
          forbidden_payload_classes: ['domain_truth_body', 'artifact_body'],
          accepted_payload_policy: 'refs_receipts_and_shape_metadata_only',
          source_pointer: '/functional_privatization_audit/external_evidence_request_pack/requests/0',
        },
      ],
    },
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

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(drilldown.summary.domain_open_evidence_request_count, 1);
    assert.equal(drilldown.summary.external_evidence_action_route_count, 1);
    const recordRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
    );
    assert.equal(recordRoute.owner, 'opl');
    assert.equal(recordRoute.route_target_kind, 'opl_cli');
    assert.equal(recordRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(recordRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(recordRoute.required_return_shapes.includes('domain_owner_receipt'), true);

    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(dryRun.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(dryRun.execution.result, null);

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
      '--payload',
      JSON.stringify({
        evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
        domain_receipt_refs: ['mas://receipts/package-lifecycle/latest.json'],
        typed_blocker_refs: ['mas://blockers/package-lifecycle-currentness.json'],
        no_regression_refs: ['mas://proof/no-regression/package-lifecycle.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(recordExecution.execution.execution_status, 'executed');
    assert.equal(recordExecution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(recordExecution.execution.result.external_evidence_apply.authority_boundary.opl_records_refs_only, true);
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);

    const recordedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(recordedDrilldown.summary.domain_recorded_evidence_receipt_request_count, 1);
    assert.equal(recordedDrilldown.summary.external_evidence_action_route_count, 1);
    const verifyRoute = recordedDrilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:verify',
    );
    assert.equal(verifyRoute.action_kind, 'external_evidence_receipt_verify');

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(verifyExecution.execution.result.external_evidence_apply.status, 'verified');
    assert.equal(verifyExecution.execution.result.external_evidence_apply.receipt.receipt_refs.includes(
      'mas://receipts/package-lifecycle/latest.json',
    ), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
