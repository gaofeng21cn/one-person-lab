import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildFunctionalPrivatizationAudit,
} from '../../src/functional-privatization-audit.ts';
import {
  FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT,
} from '../../src/functional-privatization-envelope.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

test('functional privatization audit envelope normalizes MAS functional consumer boundary', () => {
  const audit = buildFunctionalPrivatizationAudit({
    target_domain_id: 'med-autoscience',
    functional_consumer_boundary: {
      surface_kind: 'mas_functional_consumer_boundary',
      target_domain_id: 'med-autoscience',
      functional_module_inventory: [
        {
          module_id: 'study_stage_policy_pack',
          classification: 'declarative_pack',
          active_caller_status: 'declarative_pack_active',
        },
        {
          module_id: 'study_truth',
          classification: 'domain_minimal_authority_function',
          cannot_absorb_reason: 'Domain truth stays domain-owned.',
        },
        {
          module_id: 'runtime_lifecycle_sqlite_reference_adapter',
          classification: 'refs_only_adapter',
          active_caller_status: 'refs_only_adapter_active',
        },
      ],
    },
  });

  assert.equal(audit.envelope.surface_kind, 'opl_functional_privatization_audit_envelope');
  assert.equal(audit.envelope.state, 'resolved');
  assert.equal(audit.envelope.source_field, 'functional_consumer_boundary');
  assert.equal(audit.envelope.summary.standard_domain_pack_inventory_count, 1);
  assert.equal(audit.envelope.summary.authority_function_inventory_count, 1);
  assert.equal(audit.envelope.summary.private_platform_residue_inventory_count, 1);
  assert.equal(audit.envelope.summary.default_watchlist_count, 0);
  assert.equal(audit.envelope.ai_first_contract_light_policy.contract_floor_only, true);
  assert.equal(audit.envelope.ai_first_contract_light_policy.expert_executor_strategy_contract, false);
  assert.equal(audit.envelope.authority_boundary.envelope_can_claim_domain_ready, false);
});

test('functional privatization audit envelope reports MAG evidence requests without domain authority', () => {
  const audit = buildFunctionalPrivatizationAudit({
    target_domain_id: 'med-autogrant',
    mag_consumer_thinning_contract: {
      privatized_functional_module_audit: {
        target_domain_id: 'med-autogrant',
        refs_only_adapter_surfaces: [
          {
            module_id: 'session_ledger_attention_queue',
            classification: 'refs_only_adapter',
            active_caller_status: 'handoff_required',
          },
        ],
      },
      external_evidence_request_pack: {
        requests: [
          {
            request_id: 'generated-default-caller-proof',
            status: 'requested_not_received',
          },
        ],
      },
      opl_replacement_expectations: [
        {
          primitive_id: 'typed_attention_queue',
          owner: 'one-person-lab',
          implemented_in_domain: false,
        },
      ],
    },
  });

  assert.equal(audit.envelope.source_field, 'mag_consumer_thinning_contract.privatized_functional_module_audit');
  assert.equal(audit.envelope.summary.external_evidence_request_count, 1);
  assert.equal(audit.envelope.summary.external_evidence_open_request_count, 1);
  assert.equal(audit.envelope.summary.replacement_expectation_count, 1);
  assert.equal(audit.envelope.summary.semantic_equivalence_review_count, 1);
  assert.equal(audit.envelope.status_policy.evidence_gate_status, 'empty');
  assert.equal(audit.envelope.authority_boundary.opl_can_authorize_quality_or_export, false);
});

test('functional privatization audit envelope contract is tracked and contract-light', () => {
  const contract = readJson('contracts/opl-framework/functional-privatization-audit-envelope-contract.json');

  assert.deepEqual(contract, FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT);
  assert.equal(contract.ai_first_contract_light_policy.contract_floor_only, true);
  assert.equal(contract.ai_first_contract_light_policy.mechanical_completion_can_close_domain_quality, false);
  assert.equal(contract.authority_boundary.envelope_can_claim_private_residue_deleted, false);
  assert.ok(contract.accepted_source_shapes.includes('runtime_framework.rca_thin_surface_policy.privatized_functional_module_audit'));
});
