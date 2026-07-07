import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
  writeMasCleanRunnerFixture,
} from '../helpers.ts';
import { buildAppStageRunCockpit } from '../../../../src/modules/stagecraft/stage-run-cockpit.ts';
import { findOwnerAnswerProjection } from '../../../../src/modules/stagecraft/mas-owner-answer-projection.ts';

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
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    domain_context: {
      domain_id: 'medautoscience',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      stage_id: 'finalize_and_publication_handoff',
    },
    action_type: 'complete_medical_paper_readiness_surface',
    work_unit_id: '08-publication_package_handoff',
    work_unit_fingerprint:
      'stage-artifact-index::08-publication_package_handoff::publication_handoff_owner_gate::003-dpcc-primary-care-phenotype-treatment-gap',
    decision: 'authorize',
    reason: 'operator_authorized_refs_only_stage_attempt_execution',
    operator: 'human_operator:gaofeng',
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

test('runtime StageRun execution authorization dry-run validates exact identity without writing ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-authorization-dry-run-'));
  try {
    const dryRun = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload()),
      '--dry-run',
      '--json',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;

    assert.equal(dryRun.status, 'planned');
    assert.equal(dryRun.dry_run, true);
    assert.equal(dryRun.writes_performed, false);
    assert.equal(dryRun.planned_receipt_count, 1);
    assert.equal(dryRun.receipt_refs.length, 1);
    assert.equal(dryRun.receipts[0].study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(dryRun.receipts[0].domain_context.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(dryRun.receipts[0].action_type, 'complete_medical_paper_readiness_surface');
    assert.equal(dryRun.receipts[0].work_unit_id, '08-publication_package_handoff');
    assert.equal(
      dryRun.receipts[0].work_unit_fingerprint,
      dryRun.receipts[0].source_fingerprint,
    );
    assert.equal(dryRun.receipts[0].decision, 'authorize');
    assert.equal(dryRun.receipts[0].operator, 'human_operator:gaofeng');
    assert.equal(dryRun.authority_boundary.can_write_domain_truth, false);
    assert.equal(
      fs.existsSync(path.join(stateRoot, 'stage-run-execution-authorization-ledger.json')),
      false,
    );

    const mismatch = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload({
        domain_context: {
          domain_id: 'medautoscience',
          study_id: 'stale-study',
          stage_id: 'finalize_and_publication_handoff',
        },
      })),
      '--dry-run',
      '--json',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;

    assert.equal(mismatch.status, 'blocked');
    assert.equal(mismatch.dry_run, true);
    assert.equal(mismatch.writes_performed, false);
    assert.equal(mismatch.recorded_receipt_count, 0);
    assert.equal(
      mismatch.blocker.blocker_id,
      'stage_run_execution_authorization_identity_invalid',
    );
    assert.equal(
      mismatch.blocker.blocker_reasons.includes('domain_context_study_id_mismatch'),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(stateRoot, 'stage-run-execution-authorization-ledger.json')),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime StageRun execution authorization accepts distinct work unit and source identities', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-authorization-mas-identities-'));
  try {
    const stageRunId = 'app-stage-run:medautoscience:domain-owner-default-executor-dispatch';
    const currentPointerRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`;
    const stageManifestRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/manifest`;
    const typedBlockerRef =
      'artifacts/supervision/consumer/default_executor_execution/sat_e1063d97901cc3d70424fc5c.closeout.json';
    const sourceFingerprint = 'truth-snapshot::eb10e8316639d4839970dc15';
    const idempotencyKey =
      'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::truth-event-000035-39f0b8e96689a623::gate_clearing_batch::repair_progress_gate_replay_required::6c520342c1c99c25';
    const dryRun = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(authorizationPayload({
        phase: 'closeout',
        stage_run_id: stageRunId,
        stage_id: 'domain_owner/default-executor-dispatch',
        domain_context: {
          domain_id: 'medautoscience',
          study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
          stage_id: 'domain_owner/default-executor-dispatch',
        },
        provider_attempt_ref: 'opl://stage_attempts/sat_e1063d97901cc3d70424fc5c',
        stage_attempt_id: 'sat_e1063d97901cc3d70424fc5c',
        attempt_lease_ref: 'opl://stage_attempts/sat_e1063d97901cc3d70424fc5c/lease',
        action_type: 'run_gate_clearing_batch',
        work_unit_id: 'publication_gate_replay',
        work_unit_fingerprint:
          'sha256:2c4793a4e41859fd21a0bc088459c85f298bacb7d06eea811b44beae568fbf9f',
        reason: 'operator_authorized_exact_identity_after_domain_typed_blocker_observed',
        execution_authorization_decision_ref:
          'opl://stage_attempts/sat_e1063d97901cc3d70424fc5c/execution-authorization',
        workspace_scope_ref: 'medautoscience:frt_fd682ae13a7920705c231336',
        artifact_scope_ref: 'sat_e1063d97901cc3d70424fc5c',
        source_fingerprint: sourceFingerprint,
        idempotency_key: idempotencyKey,
        current_pointer_ref: currentPointerRef,
        stage_manifest_ref: stageManifestRef,
        owner_answer_ref: typedBlockerRef,
        owner_answer_kind: 'typed_blocker',
        closeout_receipt_ref: typedBlockerRef,
        owner_answer_stage_run_id: stageRunId,
        owner_answer_generation: 0,
        owner_answer_manifest_ref: stageManifestRef,
        owner_answer_current_pointer_ref: currentPointerRef,
        owner_answer_source_fingerprint: sourceFingerprint,
        owner_answer_idempotency_key: idempotencyKey,
      })),
      '--dry-run',
      '--json',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;

    assert.equal(dryRun.status, 'planned');
    assert.equal(dryRun.dry_run, true);
    assert.equal(dryRun.writes_performed, false);
    assert.equal(dryRun.planned_receipt_count, 1);
    assert.equal(dryRun.receipts[0].work_unit_fingerprint !== dryRun.receipts[0].source_fingerprint, true);
    assert.equal(dryRun.receipts[0].source_fingerprint, sourceFingerprint);
    assert.equal(dryRun.receipts[0].idempotency_key, idempotencyKey);
    const report = dryRun.receipts[0].execution_authorization_report;
    assert.equal(report.status, 'authorized');
    assert.deepEqual(report.launch_blockers, []);
    assert.deepEqual(report.closeout_binding_blockers, []);
    assert.equal(report.closeout_binding.owner_answer_kind, 'typed_blocker');
    assert.equal(report.closeout_binding.bound_to_stage_run, true);
    assert.equal(report.closeout_binding.bound_to_stage_manifest, true);
    assert.equal(report.closeout_binding.bound_to_current_pointer, true);
    assert.equal(report.closeout_binding.bound_to_source_fingerprint, true);
    assert.equal(report.closeout_binding.bound_to_idempotency_key, true);
    assert.equal(
      fs.existsSync(path.join(stateRoot, 'stage-run-execution-authorization-ledger.json')),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime StageRun execution authorization records independent quality gate attempt binding', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-authorization-quality-gate-'));
  try {
    const stageRunId = 'app-stage-run:medautoscience:publication-quality-gate';
    const currentPointerRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`;
    const stageManifestRef = `opl://stage-runs/${encodeURIComponent(stageRunId)}/manifest`;
    const qualityGateRef = 'mas://quality-gate/receipt/publication-review';
    const providerAttemptRef = 'temporal://attempt/mas-paper-author';
    const qualityGateAttemptRef = 'temporal://attempt/mas-quality-reviewer';
    const sourceFingerprint = 'sha256:quality-gate-runtime-source';
    const idempotencyKey = 'quality-gate-runtime:g0';
    const payload = authorizationPayload({
      phase: 'closeout',
      stage_run_id: stageRunId,
      stage_id: 'publication_quality_gate',
      generation: 0,
      domain_context: {
        domain_id: 'medautoscience',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        stage_id: 'publication_quality_gate',
      },
      provider_attempt_ref: providerAttemptRef,
      stage_attempt_id: 'sat_quality_gate',
      attempt_lease_ref: 'opl://stage_attempts/sat_quality_gate/lease',
      action_type: 'review_publication_quality_gate',
      work_unit_id: 'publication_quality_review',
      work_unit_fingerprint: 'sha256:quality-gate-runtime-work-unit',
      reason: 'operator_authorized_independent_quality_gate_receipt',
      execution_authorization_decision_ref:
        'opl://stage_attempts/sat_quality_gate/execution-authorization',
      workspace_scope_ref: 'medautoscience:quality-gate-workspace',
      artifact_scope_ref: 'publication-quality-gate',
      source_fingerprint: sourceFingerprint,
      idempotency_key: idempotencyKey,
      current_pointer_ref: currentPointerRef,
      stage_manifest_ref: stageManifestRef,
      owner_answer_ref: qualityGateRef,
      owner_answer_kind: 'quality_gate_receipt',
      closeout_receipt_ref: qualityGateRef,
      owner_answer_stage_run_id: stageRunId,
      owner_answer_generation: 0,
      owner_answer_manifest_ref: stageManifestRef,
      owner_answer_current_pointer_ref: currentPointerRef,
      owner_answer_source_fingerprint: sourceFingerprint,
      owner_answer_idempotency_key: idempotencyKey,
      quality_gate_attempt_ref: qualityGateAttemptRef,
    });

    const record = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify(payload),
      '--json',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;

    assert.equal(record.status, 'recorded');
    assert.equal(record.recorded_receipt_count, 1);
    assert.equal(record.receipts[0].quality_gate_attempt_ref, qualityGateAttemptRef);
    assert.equal(
      record.receipts[0].execution_authorization_report.closeout_binding.quality_gate_attempt_ref,
      qualityGateAttemptRef,
    );
    assert.deepEqual(record.receipts[0].execution_authorization_report.closeout_binding_blockers, []);

    const list = runCli([
      'runtime',
      'stage-run-authorization',
      'list',
      '--json',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger;

    assert.equal(list.receipts[0].quality_gate_attempt_ref, qualityGateAttemptRef);
    assert.equal(
      list.receipts[0].execution_authorization_report.closeout_binding.quality_gate_attempt_ref,
      qualityGateAttemptRef,
    );

    const sameAttempt = runCli([
      'runtime',
      'stage-run-authorization',
      'record',
      '--payload',
      JSON.stringify({
        ...payload,
        quality_gate_attempt_ref: providerAttemptRef,
      }),
      '--dry-run',
      '--json',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger_record;

    assert.equal(sameAttempt.status, 'blocked');
    assert.equal(
      sameAttempt.blocker.blocker_reasons.includes('quality_gate_same_attempt_self_review_forbidden'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

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

test('runtime StageRun execution authorization list reports strict schema rejected legacy receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-authorization-legacy-'));
  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(
      path.join(stateRoot, 'stage-run-execution-authorization-ledger.json'),
      `${JSON.stringify({
        surface_kind: 'opl_stage_run_execution_authorization_ledger',
        version: 'stage-run-execution-authorization-ledger.v1',
        receipts: [
          {
            surface_kind: 'opl_stage_run_execution_authorization_receipt',
            version: 'stage-run-execution-authorization-ledger.v1',
            receipt_ref: 'opl://stage-run-execution-authorization/legacy',
            receipt_status: 'verified',
            stage_run_id: 'app-stage-run:medautoscience:legacy',
            domain_id: 'medautoscience',
            stage_id: 'legacy_stage',
            provider_attempt_ref: 'opl://stage_attempts/sat_legacy',
            stage_attempt_id: 'sat_legacy',
            attempt_lease_ref: 'opl://stage_attempts/sat_legacy/lease',
            execution_authorization_decision_ref:
              'opl://stage_attempts/sat_legacy/execution-authorization',
            workspace_scope_ref: 'workspace:legacy',
            artifact_scope_ref: 'artifact:legacy',
            source_fingerprint: 'sha256:legacy',
            idempotency_key: 'idem_legacy',
            current_pointer_ref: 'opl://stage-runs/app-stage-run%3Alegacy/current',
            execution_authorization_report: {
              status: 'authorized',
              execution_authorized: true,
              launch_blockers: [],
              closeout_binding_blockers: [],
            },
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    const list = runCli([
      'runtime',
      'stage-run-authorization',
      'list',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger;
    assert.equal(list.ledger_exists, true);
    assert.equal(list.raw_receipt_count, 1);
    assert.equal(list.receipt_count, 0);
    assert.equal(list.verified_receipt_count, 0);
    assert.equal(list.strict_schema_rejected_receipt_count, 1);
    assert.equal(
      list.strict_schema_required_identity_fields.includes('domain_context'),
      true,
    );
    assert.equal(list.authority_boundary.can_claim_production_ready, false);
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

test('App StageRun cockpit requires independent attempt binding for quality gate receipt closeout', () => {
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

  assert.equal(
    cockpit.execution_authorization.closeout_binding.owner_answer_ref,
    'runtime/quests/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/reports/publishability_gate/2026-06-07T015349Z.json',
  );
  assert.equal(cockpit.execution_authorization.closeout_binding.owner_answer_kind, 'quality_gate_receipt');
  assert.equal(
    cockpit.stage_run_current_owner_delta.missing_role_or_answer_summary
      .owner_receipt_or_typed_blocker_missing,
    false,
  );
  assert.equal(cockpit.execution_authorization.execution_authorized, false);
  assert.equal(
    cockpit.execution_authorization.closeout_binding_blockers.includes(
      'quality_gate_independent_attempt_binding_missing',
    ),
    true,
  );
  assert.equal(
    cockpit.execution_authorization.closeout_binding_blockers.includes(
      'closeout_receipt_ref_missing',
    ),
    false,
  );
  assert.equal(
    cockpit.next_required_owner_action?.missing_input_refs.includes('quality_gate_attempt_ref'),
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

test('owner-answer projection lookup accepts injected domain profile', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-answer-generic-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-answer-generic-workspace-'));
  const previousStateDir = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateRoot;
  try {
    const receipt = {
      domain_id: 'example-domain',
      provider_attempt_ref: 'opl://stage_attempts/sat_example',
      attempt_lease_ref: 'opl://stage_attempts/sat_example/lease/current',
      attempt_lease_status: 'active',
      execution_authorization_decision_ref: 'opl://stage_attempts/sat_example/execution-authorization/current',
      source_fingerprint: 'fingerprint:example',
      idempotency_key: 'idem_example',
    } as any;
    fs.mkdirSync(stateRoot, { recursive: true });
    fs.writeFileSync(
      path.join(stateRoot, 'workspace-registry.json'),
      `${JSON.stringify({
        version: 'g2',
        bindings: [
          {
            binding_id: 'example-owner-answer',
            project_id: 'example-domain',
            project: 'example-domain',
            workspace_path: workspaceRoot,
            label: null,
            status: 'active',
            direct_entry: {
              command: null,
              manifest_command: null,
              url: null,
              workspace_locator: {
                surface_kind: 'example_workspace_profile',
                workspace_root: workspaceRoot,
                profile_ref: null,
                input_path: null,
              },
            },
            created_at: '2026-07-07T00:00:00.000Z',
            updated_at: '2026-07-07T00:00:00.000Z',
            archived_at: null,
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );
    const projectionPath = path.join(workspaceRoot, 'cases', 'case-1', 'owner-answer.json');
    fs.mkdirSync(path.dirname(projectionPath), { recursive: true });
    fs.writeFileSync(
      projectionPath,
      `${JSON.stringify({
        closeout_binding: {
          trusted_opl_execution_authorization: true,
          provider_attempt_ref: receipt.provider_attempt_ref,
          attempt_lease_ref: receipt.attempt_lease_ref,
          attempt_lease_status: receipt.attempt_lease_status,
          execution_authorization_decision_ref: receipt.execution_authorization_decision_ref,
          source_fingerprint: receipt.source_fingerprint,
          idempotency_key: receipt.idempotency_key,
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const projection = findOwnerAnswerProjection({
      receipt,
      profiles: [
        {
          domainId: 'example-domain',
          bindingProjectId: 'example-domain',
          sourceOwner: 'example-domain',
          studiesDirName: 'cases',
          projectionRelativePath: ['owner-answer.json'],
        },
      ],
    });

    assert.equal(projection?.projection_ref, projectionPath);
    assert.equal(projection?.workspace_root, workspaceRoot);
    assert.equal(projection?.study_id, 'case-1');
    assert.equal(projection?.authority_boundary.source_owner, 'example-domain');
    assert.equal(projection?.authority_boundary.can_write_domain_truth, false);
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
