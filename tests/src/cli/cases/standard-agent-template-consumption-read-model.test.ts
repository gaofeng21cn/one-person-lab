import { assert, test } from '../helpers.ts';
import {
  buildStandardDomainAgentTemplateConsumptionReadModel,
} from '../../../../src/modules/pack/standard-domain-agent-scaffold.ts';

test('standard agent template consumption read model exposes replayable evidence contract', () => {
  const readModel = buildStandardDomainAgentTemplateConsumptionReadModel();

  assert.equal(readModel.surface_kind, 'opl_standard_agent_template_consumption_read_model');
  assert.equal(readModel.status, 'explicit_repeat_consumption_api_available');
  assert.equal(
    readModel.proof_api_ref,
    'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence',
  );
  assert.equal(
    readModel.evidence_contract.replay_api_ref,
    'opl.console.buildStandardDomainAgentScaffoldConsumptionEvidence',
  );
  assert.equal(
    readModel.evidence_contract.expected_output_root,
    '/standard_domain_agent_template_consumption_evidence',
  );
  assert.equal(readModel.evidence_contract.expected_success_status, 'passed');
  assert.equal(
    readModel.evidence_contract.expected_evidence_ref_path,
    '/standard_domain_agent_template_consumption_evidence/evidence_ref',
  );
  assert.equal(
    readModel.evidence_contract.expected_cohort_evidence_ref_path,
    '/standard_domain_agent_template_consumption_evidence/cohort_evidence_ref',
  );
  assert.equal(
    readModel.evidence_contract.expected_sample_evidence_ref_path,
    '/standard_domain_agent_template_consumption_evidence/consumption_cohort/samples/*/evidence_ref',
  );
  assert.equal(
    readModel.evidence_contract.evidence_ref_semantics,
    'deterministic_body_free_shape_refs_for_replayable_consumption_evidence_not_recorded_ledger_receipts',
  );
  assert.deepEqual(readModel.evidence_contract.expected_consumed_surfaces, [
    'scaffold_validation',
    'standard_agent_conformance',
    'agent_readiness',
    'app_operator_projection',
  ]);
  assert.equal(readModel.evidence_contract.implicit_temp_generation_by_drilldown_allowed, false);
  assert.deepEqual(readModel.evidence_contract.forbidden_claim_fields, [
    'domain_ready',
    'artifact_authority',
    'production_ready',
    'quality_or_export_authorized',
  ]);
  assert.equal(readModel.expected_evidence_fields.includes('evidence_ref'), true);
  assert.equal(readModel.expected_evidence_fields.includes('cohort_evidence_ref'), true);
  assert.equal(readModel.expected_evidence_fields.includes('evidence_receipt_candidate_policy'), true);
  assert.equal(readModel.summary.domain_ready_claim_count, 0);
  assert.equal(readModel.summary.production_ready_claim_count, 0);
  assert.equal(readModel.summary.artifact_authority_claim_count, 0);
  assert.equal(readModel.authority_boundary.can_claim_production_ready, false);
});
