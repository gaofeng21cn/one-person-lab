import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
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
    assert.equal(nextRequiredOwnerAction.owner, 'one-person-lab');
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
