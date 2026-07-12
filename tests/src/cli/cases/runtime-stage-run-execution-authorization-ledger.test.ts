import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

const STUDY_ID = '003-dpcc-primary-care-phenotype-treatment-gap';
const SOURCE_FINGERPRINT =
  'stage-artifact-index::08-publication_package_handoff::publication_handoff_owner_gate::003-dpcc-primary-care-phenotype-treatment-gap';
const LEDGER_FILE = 'stage-run-execution-authorization-ledger.json';

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
    study_id: STUDY_ID,
    domain_context: {
      domain_id: 'medautoscience',
      study_id: STUDY_ID,
      stage_id: 'finalize_and_publication_handoff',
    },
    action_type: 'complete_medical_paper_readiness_surface',
    work_unit_id: '08-publication_package_handoff',
    work_unit_fingerprint: SOURCE_FINGERPRINT,
    decision: 'authorize',
    reason: 'operator_authorized_refs_only_stage_attempt_execution',
    operator: 'human_operator:gaofeng',
    execution_authorization_decision_ref:
      'opl://stage_attempts/sat_live/execution-authorization/current',
    workspace_scope_ref: 'workspace:/Users/gaofeng/workspace/Yang/DM-CVD-Mortality-Risk',
    artifact_scope_ref: 'stage-artifact:08-publication_package_handoff',
    source_fingerprint: SOURCE_FINGERPRINT,
    idempotency_key: 'idem_live',
    current_pointer_ref:
      'opl://stage-runs/app-stage-run%3Amedautoscience%3Afinalize-and-publication-handoff/current',
    stage_manifest_ref: 'mas://stage-manifest/08-publication_package_handoff',
    ...overrides,
  };
}

function recordAuthorization(
  stateRoot: string,
  payload: Record<string, unknown>,
  extraArgs: string[] = [],
) {
  return runCli([
    'runtime',
    'stage-run-authorization',
    'record',
    '--payload',
    JSON.stringify(payload),
    ...extraArgs,
  ], { OPL_STATE_DIR: stateRoot }).stage_run_execution_authorization_ledger_record;
}

test('single-source runtime payload commands reject repeated payload flags', () => {
  const commands = [
    ['runtime', 'stage-candidate-portfolio', 'summary'],
    ['runtime', 'stage-replay-missing-receipt', 'record'],
    ['runtime', 'stage-run-authorization', 'record'],
    ['runtime', 'stage-run-evidence-pack', 'summary'],
    ['runtime', 'standard-agent-template-consumption', 'record'],
  ];

  const duplicateSources = [
    ['--payload', '{}', '--payload', '{}'],
    ['--payload-file', 'unused.json', '--payload-file', 'unused.json'],
    ['--payload', '{}', '--payload-file', 'unused.json'],
  ];
  for (const command of commands) {
    for (const duplicateSource of duplicateSources) {
      assert.throws(
        () => runCli([...command, ...duplicateSource]),
        /Use either --payload or --payload-file, not both/,
      );
    }
  }
});

test('StageRun authorization dry-run validates current identity without writing ledger', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-auth-dry-'));
  try {
    const planned = recordAuthorization(stateRoot, authorizationPayload(), ['--dry-run']);
    assert.equal(planned.status, 'planned');
    assert.equal(planned.writes_performed, false);
    assert.equal(planned.receipts[0].study_id, STUDY_ID);
    assert.equal(planned.authority_boundary.can_write_domain_truth, false);
    assert.equal(fs.existsSync(path.join(stateRoot, LEDGER_FILE)), false);

    const conflict = recordAuthorization(stateRoot, authorizationPayload({
      domain_context: {
        domain_id: 'medautoscience',
        study_id: 'stale-study',
        stage_id: 'finalize_and_publication_handoff',
      },
    }), ['--dry-run']);
    assert.equal(conflict.status, 'blocked');
    assert.equal(conflict.writes_performed, false);
    assert.equal(
      conflict.blocker.blocker_reasons.includes('domain_context_study_id_mismatch'),
      true,
    );
    assert.equal(fs.existsSync(path.join(stateRoot, LEDGER_FILE)), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun authorization records and verifies refs-only authority, rejecting incomplete input', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-auth-record-'));
  const env = { OPL_STATE_DIR: stateRoot };
  try {
    for (const payload of [{}, authorizationPayload({ attempt_lease_ref: null })]) {
      const blocked = recordAuthorization(stateRoot, payload);
      assert.equal(blocked.status, 'blocked');
      assert.equal(blocked.recorded_receipt_count, 0);
      assert.equal(blocked.authority_boundary.can_write_domain_truth, false);
    }
    assert.equal(fs.existsSync(path.join(stateRoot, LEDGER_FILE)), false);

    const recorded = recordAuthorization(stateRoot, authorizationPayload());
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recorded.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_create_typed_blocker, false);

    const verified = runCli([
      'runtime',
      'stage-run-authorization',
      'verify',
      '--receipt-ref',
      recorded.receipt_refs[0],
    ], env).stage_run_execution_authorization_ledger_verify;
    assert.equal(verified.status, 'verified');
    assert.equal(verified.authority_boundary.can_claim_domain_ready, false);

    const listed = runCli(['runtime', 'stage-run-authorization', 'list'], env)
      .stage_run_execution_authorization_ledger;
    assert.equal(listed.receipt_count, 1);
    assert.equal(listed.verified_receipt_count, 1);
    assert.equal(listed.authority_boundary.can_execute_domain_action, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun authorization fails closed on self-reviewed quality gates', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-auth-quality-'));
  try {
    const stageRunId = 'app-stage-run:medautoscience:publication-quality-gate';
    const providerAttemptRef = 'temporal://attempt/mas-paper-author';
    const sourceFingerprint = 'sha256:quality-gate-runtime-source';
    const payload = authorizationPayload({
      phase: 'closeout',
      stage_run_id: stageRunId,
      stage_id: 'publication_quality_gate',
      domain_context: {
        domain_id: 'medautoscience',
        study_id: STUDY_ID,
        stage_id: 'publication_quality_gate',
      },
      provider_attempt_ref: providerAttemptRef,
      stage_attempt_id: 'sat_quality_gate',
      action_type: 'review_publication_quality_gate',
      work_unit_id: 'publication_quality_review',
      work_unit_fingerprint: 'sha256:quality-gate-runtime-work-unit',
      execution_authorization_decision_ref:
        'opl://stage_attempts/sat_quality_gate/execution-authorization',
      source_fingerprint: sourceFingerprint,
      idempotency_key: 'quality-gate-runtime:g0',
      current_pointer_ref: `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`,
      stage_manifest_ref: `opl://stage-runs/${encodeURIComponent(stageRunId)}/manifest`,
      owner_answer_ref: 'mas://quality-gate/receipt/publication-review',
      owner_answer_kind: 'quality_gate_receipt',
      closeout_receipt_ref: 'mas://quality-gate/receipt/publication-review',
      owner_answer_stage_run_id: stageRunId,
      owner_answer_generation: 0,
      owner_answer_manifest_ref: `opl://stage-runs/${encodeURIComponent(stageRunId)}/manifest`,
      owner_answer_current_pointer_ref: `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`,
      owner_answer_source_fingerprint: sourceFingerprint,
      owner_answer_idempotency_key: 'quality-gate-runtime:g0',
      quality_gate_attempt_ref: 'temporal://attempt/mas-quality-reviewer',
    });
    assert.equal(recordAuthorization(stateRoot, payload).status, 'recorded');

    const blocked = recordAuthorization(
      stateRoot,
      { ...payload, quality_gate_attempt_ref: providerAttemptRef },
      ['--dry-run'],
    );
    assert.equal(blocked.status, 'blocked');
    assert.equal(
      blocked.blocker.blocker_reasons.includes('quality_gate_same_attempt_self_review_forbidden'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('StageRun authorization list rejects legacy receipts missing strict identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-run-auth-legacy-'));
  try {
    fs.writeFileSync(path.join(stateRoot, LEDGER_FILE), `${JSON.stringify({
      surface_kind: 'opl_stage_run_execution_authorization_ledger',
      version: 'stage-run-execution-authorization-ledger.v1',
      receipts: [{
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
        execution_authorization_decision_ref: 'opl://stage_attempts/sat_legacy/authorization',
        workspace_scope_ref: 'workspace:legacy',
        artifact_scope_ref: 'artifact:legacy',
        source_fingerprint: 'sha256:legacy',
        idempotency_key: 'idem_legacy',
        execution_authorization_report: {
          status: 'authorized',
          execution_authorized: true,
          launch_blockers: [],
          closeout_binding_blockers: [],
        },
      }],
    }, null, 2)}\n`);

    const listed = runCli(['runtime', 'stage-run-authorization', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).stage_run_execution_authorization_ledger;
    assert.equal(listed.raw_receipt_count, 1);
    assert.equal(listed.receipt_count, 0);
    assert.equal(listed.strict_schema_rejected_receipt_count, 1);
    assert.equal(listed.authority_boundary.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
