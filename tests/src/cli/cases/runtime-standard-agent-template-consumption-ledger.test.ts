import {
  assert,
  fs,
  os,
  path,
  runCli,
} from '../helpers.ts';
import test from 'node:test';
import { buildStandardDomainAgentScaffoldConsumptionEvidence } from '../../../../src/modules/console/standard-domain-agent-template-consumption.ts';
import { buildStandardDomainAgentTemplateConsumptionReadModel } from '../../../../src/modules/pack/standard-domain-agent-scaffold.ts';

test('runtime standard agent template consumption CLI records and verifies refs-only replay evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(
    os.tmpdir(),
    'opl-standard-agent-template-consumption-state-',
  ));
  try {
    const consumptionEvidence = buildStandardDomainAgentScaffoldConsumptionEvidence()
      .standard_domain_agent_template_consumption_evidence;
    const consumptionReadModel = buildStandardDomainAgentTemplateConsumptionReadModel();

    const payload = {
      evidence_ref: consumptionEvidence.evidence_ref,
      evidence_fingerprint: consumptionEvidence.evidence_fingerprint,
      cohort_evidence_ref: consumptionEvidence.cohort_evidence_ref,
      cohort_evidence_fingerprint: consumptionEvidence.cohort_evidence_fingerprint,
      sample_evidence_refs: consumptionEvidence.consumption_cohort.samples.map(
        (sample: { evidence_ref: string }) => sample.evidence_ref,
      ),
      sample_evidence_fingerprints: consumptionEvidence.consumption_cohort.samples.map(
        (sample: { evidence_fingerprint: string }) => sample.evidence_fingerprint,
      ),
      consumed_surface_refs: consumptionReadModel.consumed_surface_refs,
      replay_api_ref: 'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence',
      receipt_ref: 'opl://standard-agent-template-consumption-ledger/test-cohort',
    };

    const recorded = runCli([
      'runtime',
      'standard-agent-template-consumption',
      'record',
      '--payload',
      JSON.stringify(payload),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).standard_agent_template_consumption_ledger_record;

    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.recorded_receipt_count, 1);
    assert.equal(recorded.receipt_refs[0], payload.receipt_ref);
    assert.equal(
      recorded.ledger_file,
      path.join(stateRoot, 'standard-agent-template-consumption-ledger.json'),
    );
    assert.equal(recorded.receipts[0].receipt_status, 'recorded');
    assert.equal(recorded.receipts[0].target_surface, 'standard_agent_template_consumption');
    assert.equal(recorded.receipts[0].evidence_ref, consumptionEvidence.evidence_ref);
    assert.equal(recorded.receipts[0].cohort_evidence_ref, consumptionEvidence.cohort_evidence_ref);
    assert.equal(recorded.receipts[0].sample_evidence_refs.length, 3);
    assert.equal(recorded.receipts[0].replay_api_ref, payload.replay_api_ref);
    assert.equal(recorded.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recorded.receipts[0].authority_boundary.can_write_domain_truth, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_claim_domain_ready, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_claim_production_ready, false);

    const listedRecorded = runCli([
      'runtime',
      'standard-agent-template-consumption',
      'list',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).standard_agent_template_consumption_ledger;
    assert.equal(listedRecorded.receipt_count, 1);
    assert.equal(listedRecorded.verified_receipt_ref_count, 0);
    assert.equal(listedRecorded.pending_verify_receipt_ref_count, 1);
    assert.equal(listedRecorded.authority_boundary.can_claim_production_ready, false);

    const verified = runCli([
      'runtime',
      'standard-agent-template-consumption',
      'verify',
      '--receipt-ref',
      payload.receipt_ref,
    ], {
      OPL_STATE_DIR: stateRoot,
    }).standard_agent_template_consumption_ledger_verify;

    assert.equal(verified.status, 'verified');
    assert.equal(verified.verified_receipt_count, 1);
    assert.equal(verified.receipt.receipt_status, 'verified');
    assert.equal(verified.receipt.receipt_ref, payload.receipt_ref);
    assert.equal(verified.receipt.authority_boundary.can_create_owner_receipt, false);

    const listedVerified = runCli([
      'runtime',
      'standard-agent-template-consumption',
      'list',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).standard_agent_template_consumption_ledger;
    assert.equal(listedVerified.receipt_count, 1);
    assert.equal(listedVerified.verified_receipt_ref_count, 1);
    assert.equal(listedVerified.pending_verify_receipt_ref_count, 0);

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(
      drilldown.summary.standard_agent_template_consumption_ledger_receipt_ref_count,
      1,
    );
    assert.equal(
      drilldown.summary.standard_agent_template_consumption_verified_ledger_receipt_ref_count,
      1,
    );
    assert.equal(
      drilldown.summary.standard_agent_template_consumption_pending_verify_receipt_ref_count,
      0,
    );
    assert.deepEqual(
      drilldown.standard_agent_template_consumption_refs.ledger_projection.verified_receipt_refs,
      [payload.receipt_ref],
    );
    assert.equal(
      drilldown.standard_agent_template_consumption_refs.ledger_projection
        .authority_boundary.can_claim_production_ready,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime standard agent template consumption CLI blocks ready claims and incomplete payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(
    os.tmpdir(),
    'opl-standard-agent-template-consumption-blocked-state-',
  ));
  try {
    const blocked = runCli([
      'runtime',
      'standard-agent-template-consumption',
      'record',
      '--payload',
      JSON.stringify({
        evidence_ref: 'opl://standard-agent-template-consumption/award-foundry/abc123',
        evidence_fingerprint: 'sha256:abc123',
        domain_ready: true,
        production_ready: true,
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).standard_agent_template_consumption_ledger_record;

    assert.equal(blocked.status, 'no_eligible_standard_agent_template_consumption_receipts');
    assert.equal(blocked.recorded_receipt_count, 0);
    assert.equal(
      blocked.blocked_receipts[0].blocker.blocker_id,
      'standard_agent_template_consumption_payload_contains_ready_claim',
    );
    assert.deepEqual(blocked.blocked_receipts[0].missing_consumption_refs, [
      'cohort_evidence_ref',
      'cohort_evidence_fingerprint',
    ]);

    const listed = runCli([
      'runtime',
      'standard-agent-template-consumption',
      'list',
    ], {
      OPL_STATE_DIR: stateRoot,
    }).standard_agent_template_consumption_ledger;
    assert.equal(listed.receipt_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
