import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
  writeMasCleanRunnerFixture,
} from '../helpers.ts';
import { buildAppStageRunCockpit } from '../../../../src/app-state-stage-run-cockpit.ts';

function authorizationPayload(overrides: Record<string, unknown> = {}) {
  return {
    stage_run_id: 'app-stage-run:medautoscience:finalize-and-publication-handoff',
    domain_id: 'medautoscience',
    stage_id: 'finalize_and_publication_handoff',
    generation: 0,
    phase: 'launch',
    selected_executor: 'codex_cli',
    provider_attempt_ref: 'opl://stage_attempts/sat_live',
    stage_attempt_id: 'sat_live',
    attempt_lease_ref: 'opl://stage_attempts/sat_live/lease/current',
    attempt_lease_status: 'active',
    execution_authorization_decision_ref:
      'opl://stage_attempts/sat_live/execution-authorization/current',
    workspace_scope_ref: 'workspace:/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk',
    artifact_scope_ref: 'stage-artifact:08-publication_package_handoff',
    source_fingerprint:
      'stage-artifact-index::08-publication_package_handoff::publication_handoff_owner_gate::003-dpcc-primary-care-phenotype-treatment-gap',
    idempotency_key: 'idem_live',
    current_pointer_ref:
      'opl://stage-runs/app-stage-run%3Amedautoscience%3Afinalize-and-publication-handoff/current',
    stage_manifest_ref: 'mas://stage-manifest/08-publication_package_handoff',
    ...overrides,
  };
}

function bindMasWorkspaceForAuthorization(input: {
  stateRoot: string;
  workspaceRoot: string;
  profilePath: string;
}) {
  const now = new Date().toISOString();
  fs.mkdirSync(input.stateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(input.stateRoot, 'workspace-registry.json'),
    `${JSON.stringify({
      version: 'g2',
      bindings: [
        {
          binding_id: 'mas-stage-run-owner-answer',
          project_id: 'medautoscience',
          project: 'med-autoscience',
          workspace_path: input.workspaceRoot,
          label: null,
          status: 'active',
          direct_entry: {
            command: null,
            manifest_command: null,
            url: null,
            workspace_locator: {
              surface_kind: 'med_autoscience_workspace_profile',
              workspace_root: input.workspaceRoot,
              profile_ref: input.profilePath,
              input_path: null,
            },
          },
          created_at: now,
          updated_at: now,
          archived_at: null,
        },
      ],
    }, null, 2)}\n`,
    'utf8',
  );
}

function writeMasOwnerAnswerProjection(input: {
  workspaceRoot: string;
  studyId: string;
  receipt: Record<string, unknown>;
  blockerId?: string;
}) {
  const stageRoot = path.join(
    input.workspaceRoot,
    'studies',
    input.studyId,
    'artifacts',
    'stage_outputs',
    '08-publication_package_handoff',
  );
  const projectionPath = path.join(stageRoot, 'projection', 'current_owner_delta.json');
  fs.mkdirSync(path.dirname(projectionPath), { recursive: true });
  const stageRunId = `stage-run::${input.studyId}::08-publication_package_handoff`;
  const closeoutBinding = {
    surface_kind: 'publication_handoff_closeout_binding',
    trusted_opl_execution_authorization: true,
    provider_attempt_ref: input.receipt.provider_attempt_ref,
    attempt_lease_ref: input.receipt.attempt_lease_ref,
    attempt_lease_status: input.receipt.attempt_lease_status,
    execution_authorization_decision_ref: input.receipt.execution_authorization_decision_ref,
    source_fingerprint: input.receipt.source_fingerprint,
    idempotency_key: input.receipt.idempotency_key,
    stage_run_id: stageRunId,
    stage_run_ref: stageRunId,
    generation: 0,
    stage_manifest_ref: 'artifacts/stage_outputs/08-publication_package_handoff/stage_manifest.json',
    current_pointer_ref: 'artifacts/stage_outputs/08-publication_package_handoff/current.json',
    body_included: false,
    bound_to_stage_run: true,
    bound_to_stage_manifest: true,
    bound_to_current_pointer: true,
    bound_to_source_fingerprint: true,
  };
  fs.writeFileSync(
    projectionPath,
    `${JSON.stringify({
      action: 'complete_medical_paper_readiness_surface',
      closeout_binding: closeoutBinding,
      current_pointer_ref: closeoutBinding.current_pointer_ref,
      delta_id: input.receipt.idempotency_key,
      hard_gate: {
        state: 'domain_owner_answer_recorded',
        owner_answer_kind: 'typed_blocker',
        owner_answer_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
        owner_answer_stage_run_id: stageRunId,
        owner_answer_generation: 0,
        owner_answer_manifest_ref: closeoutBinding.stage_manifest_ref,
        owner_answer_current_pointer_ref: closeoutBinding.current_pointer_ref,
        owner_answer_source_fingerprint: input.receipt.source_fingerprint,
        owner_answer_idempotency_key: input.receipt.idempotency_key,
        stage_manifest_ref: closeoutBinding.stage_manifest_ref,
        current_pointer_ref: closeoutBinding.current_pointer_ref,
      },
      latest_owner_answer_kind: 'typed_blocker',
      latest_owner_answer_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
      latest_typed_blocker_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
      owner: 'MedAutoScience',
      reason: input.blockerId ?? 'medical_paper_readiness_not_ready',
      source_fingerprint: input.receipt.source_fingerprint,
      stage_manifest_ref: closeoutBinding.stage_manifest_ref,
      stage_run_id: stageRunId,
    }, null, 2)}\n`,
    'utf8',
  );
}

test('runtime StageRun execution authorization ledger records refs-only OPL authorization', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-authorization-'));
  try {
    const blocked = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload({
        attempt_lease_ref: null,
      })),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.recorded_receipt_count, 0);
    assert.equal(blocked.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      fs.existsSync(path.join(stateRoot, 'stage-run-execution-authorization-ledger.json')),
      false,
    );

    const record = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload()),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;
    assert.equal(record.status, 'recorded');
    assert.equal(record.recorded_receipt_count, 1);
    assert.equal(
      record.ledger_file,
      path.join(stateRoot, 'stage-run-execution-authorization-ledger.json'),
    );
    assert.equal(record.receipts[0].execution_authorization_report.status, 'authorized');
    assert.equal(record.receipts[0].execution_authorization_report.execution_authorized, true);
    assert.deepEqual(record.receipts[0].execution_authorization_report.launch_blockers, []);
    assert.equal(record.receipts[0].authority_boundary.refs_only, true);
    assert.equal(record.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(record.receipts[0].authority_boundary.can_create_typed_blocker, false);
    assert.equal(
      record.receipts[0].authority_boundary.authorization_receipt_is_domain_owner_answer,
      false,
    );

    const verify = runCli([
      'runtime',
      'stage-run-authorization',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_verify;
    assert.equal(verify.status, 'verified');
    assert.equal(verify.receipt.receipt_status, 'verified');
    assert.equal(verify.authority_boundary.can_claim_domain_ready, false);

    const list = runCli([
      'runtime',
      'stage-run-authorization',
      'list',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger;
    assert.equal(list.receipt_count, 1);
    assert.equal(list.verified_receipt_count, 1);
    assert.equal(list.authority_boundary.can_execute_domain_action, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('App StageRun cockpit consumes authorization ledger while preserving domain owner-answer gate', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-cockpit-auth-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const currentOwnerDelta = {
    domain: 'medautoscience',
    current_owner: 'medautoscience',
    stage_id: 'finalize_and_publication_handoff',
    desired_delta_kind: 'owner_delta',
    desired_delta_description: 'publication_handoff_owner_receipt_or_typed_blocker',
    accepted_answer_shape: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
    task_or_study_ref: 'mas://study/003-dpcc-primary-care-phenotype-treatment-gap',
    lineage_ref: 'mas://stage-artifact-unit/DM003/08-publication_package_handoff',
    source_fingerprint:
      'stage-artifact-index::08-publication_package_handoff::publication_handoff_owner_gate::003-dpcc-primary-care-phenotype-treatment-gap',
    delta_id: 'dm003-publication-handoff:g0',
    live_attempt_ref: 'opl://stage_attempts/sat_live',
    hard_gate: {
      state: 'owner_delta_open',
    },
    audit_refs: {
      workspace_scope_ref: 'workspace:/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk',
      artifact_scope_ref: 'stage-artifact:08-publication_package_handoff',
      app_operator_drilldown_ref: 'opl://drilldown/current-owner-delta',
    },
  };
  try {
    const before = buildAppStageRunCockpit(currentOwnerDelta);
    assert.equal(before.stage_run_current_owner_delta.stage_id, 'finalize_and_publication_handoff');
    assert.equal(
      before.execution_authorization.launch_blockers.includes('attempt_lease_ref_missing'),
      true,
    );
    assert.equal(
      before.execution_authorization.launch_blockers.includes(
        'execution_authorization_decision_ref_missing',
      ),
      true,
    );

    const record = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload()),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;
    assert.equal(record.status, 'recorded');

    const after = buildAppStageRunCockpit(currentOwnerDelta);
    assert.equal(after.stage_run_current_owner_delta.execution_authorization_receipt_ref, record.receipt_refs[0]);
    const authorizationLedgerReceipt = after.execution_authorization_ledger_receipt;
    if (!authorizationLedgerReceipt) {
      throw new Error('expected cockpit to expose execution authorization ledger receipt');
    }
    assert.equal(authorizationLedgerReceipt.receipt_ref, record.receipt_refs[0]);
    assert.deepEqual(after.execution_authorization.launch_blockers, []);
    assert.equal(
      after.execution_authorization.closeout_binding_blockers.includes('closeout_receipt_ref_missing'),
      true,
    );
    assert.equal(after.execution_authorization.status, 'blocked');
    assert.equal(after.execution_authorization.execution_authorized, false);
    const nextRequiredOwnerAction = after.next_required_owner_action;
    if (!nextRequiredOwnerAction) {
      throw new Error('expected closeout binding to remain blocked after refs-only authorization');
    }
    assert.equal(nextRequiredOwnerAction.owner, 'medautoscience');
    assert.equal(nextRequiredOwnerAction.owner_answer_missing_before_opl_closeout_binding, true);
    assert.equal(
      nextRequiredOwnerAction.missing_input_refs.includes('attempt_lease_ref'),
      false,
    );
    assert.equal(
      nextRequiredOwnerAction.missing_input_refs.includes('owner_answer_ref'),
      true,
    );
    assert.equal(after.authority_boundary.can_write_domain_truth, false);
    assert.equal(after.authority_boundary.can_create_owner_receipt, false);
    assert.equal(after.authority_boundary.can_create_typed_blocker, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('App StageRun cockpit does not promote quality gate receipt to StageRun closeout owner answer', () => {
  const cockpit = buildAppStageRunCockpit({
    domain: 'medautoscience',
    current_owner: 'medautoscience',
    stage_id: 'domain_owner/default-executor-dispatch',
    desired_delta_kind: 'owner_delta',
    desired_delta_description: 'publication_gate_replay_blocked',
    accepted_answer_shape: [
      'domain_owner_receipt_ref',
      'quality_gate_receipt_ref',
      'typed_blocker_ref',
    ],
    task_or_study_ref: 'mas://study/003-dpcc-primary-care-phenotype-treatment-gap',
    lineage_ref: 'sat_current_gate_replay',
    source_fingerprint: 'mas_default_executor_source_gate_replay',
    delta_id: 'dm003-gate-replay:g0',
    latest_owner_answer_kind: 'quality_gate_receipt',
    latest_owner_answer_ref:
      'runtime/quests/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/reports/publishability_gate/2026-06-07T015349Z.json',
    hard_gate: {
      state: 'domain_owner_answer_recorded',
      owner_answer_kind: 'quality_gate_receipt',
      owner_answer_ref:
        'runtime/quests/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/reports/publishability_gate/2026-06-07T015349Z.json',
      domain_ready_authorized: false,
      quality_or_export_authorized: false,
    },
    audit_refs: {
      workspace_scope_ref: 'workspace:/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk',
      artifact_scope_ref: 'stage-packet:studies/003-dpcc-primary-care-phenotype-treatment-gap/gate-replay.json',
      app_operator_drilldown_ref: 'opl://drilldown/current-owner-delta',
    },
  });

  assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_ref, null);
  assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_kind, null);
  assert.equal(
    cockpit.stage_run_current_owner_delta.missing_role_or_answer_summary
      .owner_receipt_or_typed_blocker_missing,
    true,
  );
  assert.equal(cockpit.execution_authorization.execution_authorized, false);
  assert.equal(
    cockpit.execution_authorization.closeout_binding_blockers.includes(
      'closeout_receipt_ref_missing',
    ),
    true,
  );
  assert.equal(
    cockpit.stage_run_current_owner_delta.hard_gate.domain_ready_authorized,
    false,
  );
});

test('App StageRun cockpit ignores authorization ledger receipt from another stage attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-cockpit-auth-stale-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const record = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload({
        provider_attempt_ref: 'opl://stage_attempts/sat_stale',
        stage_attempt_id: 'sat_stale',
        attempt_lease_ref: 'opl://stage_attempts/sat_stale/lease/current',
        execution_authorization_decision_ref:
          'opl://stage_attempts/sat_stale/execution-authorization/current',
        idempotency_key: 'idem_stale',
      })),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;
    assert.equal(record.status, 'recorded');

    const cockpit = buildAppStageRunCockpit({
      domain: 'medautoscience',
      current_owner: 'medautoscience',
      stage_id: 'finalize_and_publication_handoff',
      desired_delta_kind: 'owner_delta',
      desired_delta_description: 'publication_handoff_owner_receipt_or_typed_blocker',
      accepted_answer_shape: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
      task_or_study_ref: 'mas://study/003-dpcc-primary-care-phenotype-treatment-gap',
      lineage_ref: 'sat_current',
      source_fingerprint:
        'stage-artifact-index::08-publication_package_handoff::publication_handoff_owner_gate::003-dpcc-primary-care-phenotype-treatment-gap',
      delta_id: 'dm003-publication-handoff:g0',
      live_attempt_ref: 'opl://stage_attempts/sat_current',
      hard_gate: {
        state: 'owner_delta_open',
      },
      audit_refs: {
        workspace_scope_ref: 'workspace:/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk',
        artifact_scope_ref: 'stage-artifact:08-publication_package_handoff',
      },
    });

    assert.equal(cockpit.stage_run_current_owner_delta.execution_authorization_receipt_ref, null);
    assert.equal(cockpit.execution_authorization_ledger_receipt, null);
    assert.equal(
      cockpit.execution_authorization.launch_blockers.includes('attempt_lease_ref_missing'),
      true,
    );
    assert.equal(
      cockpit.execution_authorization.launch_blockers.includes(
        'execution_authorization_decision_ref_missing',
      ),
      true,
    );
    assert.equal(cockpit.execution_authorization.status, 'blocked');
    assert.equal(cockpit.execution_authorization.execution_authorized, false);
    const nextRequiredOwnerAction = cockpit.next_required_owner_action;
    if (!nextRequiredOwnerAction) {
      throw new Error('expected stale authorization mismatch to require OPL runtime refs');
    }
    assert.equal(nextRequiredOwnerAction.next_required_owner, 'one-person-lab');
    assert.equal(nextRequiredOwnerAction.route_requires_opl_runtime_refs, true);
    assert.equal(nextRequiredOwnerAction.route_requires_domain_or_app_payload, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('App StageRun cockpit folds MAS owner-answer projection when it matches OPL authorization refs', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-cockpit-mas-answer-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-cockpit-mas-workspace-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm.workspace.toml');
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, 'workspace_name = "dm-cvd-mortality-risk"\n', 'utf8');
  writeMasCleanRunnerFixture(workspaceRoot);
  try {
    bindMasWorkspaceForAuthorization({ stateRoot, workspaceRoot, profilePath });
    const record = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload()),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;
    assert.equal(record.status, 'recorded');
    writeMasOwnerAnswerProjection({
      workspaceRoot,
      studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
      receipt: record.receipts[0],
    });

    const cockpit = buildAppStageRunCockpit({
      domain: 'medautoscience',
      current_owner: 'medautoscience',
      stage_id: 'finalize_and_publication_handoff',
      desired_delta_kind: 'owner_delta',
      desired_delta_description: 'publication_handoff_owner_receipt_or_typed_blocker',
      accepted_answer_shape: ['domain_owner_receipt_ref', 'typed_blocker_ref'],
      task_or_study_ref: 'mas://study/003-dpcc-primary-care-phenotype-treatment-gap',
      lineage_ref: 'mas://stage-artifact-unit/DM003/08-publication_package_handoff',
      hard_gate: {
        state: 'owner_delta_open',
      },
      audit_refs: {
        workspace_scope_ref: 'workspace:/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk',
        artifact_scope_ref: 'stage-artifact:08-publication_package_handoff',
      },
    });

    assert.equal(cockpit.execution_authorization.status, 'authorized');
    assert.deepEqual(cockpit.execution_authorization.launch_blockers, []);
    assert.deepEqual(cockpit.execution_authorization.closeout_binding_blockers, []);
    assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_kind, 'typed_blocker');
    assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_stage_run, true);
    assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_stage_manifest, true);
    assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_current_pointer, true);
    assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_source_fingerprint, true);
    assert.equal(cockpit.execution_authorization.closeout_binding.bound_to_idempotency_key, true);
    assert.equal(cockpit.stage_run_current_owner_delta.missing_role_or_answer_summary.owner_receipt_or_typed_blocker_missing, false);
    const projection = cockpit.stage_run_current_owner_delta.owner_answer_binding_projection;
    if (!projection) {
      throw new Error('expected MAS owner-answer binding projection');
    }
    assert.equal(projection.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(
      projection.authority_boundary.can_claim_domain_ready,
      false,
    );
    assert.equal(cockpit.authority_boundary.can_create_typed_blocker, false);
    assert.equal(cockpit.authority_boundary.can_claim_production_ready, false);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
