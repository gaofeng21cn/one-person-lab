import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import {
  buildFunctionalPrivatizationAudit,
} from '../../src/modules/pack/functional-privatization-audit.ts';
import {
  FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT,
} from '../../src/modules/pack/functional-privatization-envelope.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

test('functional privatization audit ignores retired repo-local source shapes', () => {
  const legacyManifests = [
    {
      functional_consumer_boundary: {
        functional_module_inventory: [{ module_id: 'mas_legacy_surface' }],
      },
    },
    {
      privatized_functional_module_audit: {
        modules: [{ module_id: 'top_level_legacy_surface' }],
      },
    },
    {
      mag_consumer_thinning_contract: {
        privatized_functional_module_audit: {
          modules: [{ module_id: 'mag_legacy_surface' }],
        },
      },
    },
    {
      runtime_framework: {
        rca_thin_surface_policy: {
          privatized_functional_module_audit: {
            modules: [{ module_id: 'rca_legacy_surface' }],
          },
        },
      },
    },
  ];

  for (const manifest of legacyManifests) {
    const audit = buildFunctionalPrivatizationAudit({
      target_domain_id: 'legacy-domain',
      ...manifest,
    });
    assert.equal(audit.envelope.surface_kind, 'opl_functional_privatization_audit_envelope');
    assert.equal(audit.envelope.state, 'missing');
    assert.equal(audit.envelope.source_field, null);
    assert.equal(audit.envelope.source_field_role, null);
    assert.deepEqual(audit.envelope.accepted_source_shapes, ['functional_privatization_audit']);
    assert.deepEqual(audit.envelope.legacy_import_source_fields, []);
    assert.deepEqual(audit.envelope.legacy_import_source_shapes, []);
    assert.equal(audit.envelope.source_shape_policy.legacy_import_adapter_available, false);
    assert.equal(audit.summary.total_module_count, 0);
  }
});

test('functional privatization audit envelope reports canonical evidence requests without domain authority', () => {
  const audit = buildFunctionalPrivatizationAudit({
    target_domain_id: 'med-autogrant',
    functional_privatization_audit: {
      surface_kind: 'functional_privatization_audit',
      target_domain_id: 'med-autogrant',
      modules: [
        {
          module_id: 'session_ledger_attention_queue',
          classification: 'refs_only_adapter',
          active_caller_status: 'handoff_required',
        },
      ],
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

  assert.equal(audit.envelope.source_field, 'functional_privatization_audit');
  assert.equal(audit.envelope.source_field_role, 'standard_contract_source');
  assert.deepEqual(audit.envelope.accepted_source_shapes, ['functional_privatization_audit']);
  assert.deepEqual(audit.envelope.legacy_import_source_fields, []);
  assert.equal(audit.envelope.summary.external_evidence_request_count, 1);
  assert.equal(audit.envelope.summary.external_evidence_open_request_count, 1);
  assert.equal(audit.envelope.summary.replacement_expectation_count, 1);
  assert.equal(audit.envelope.summary.semantic_equivalence_review_count, 1);
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.status, 'evidence_required');
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.review_required_count, 1);
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.active_private_generic_residue_count, 0);
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.open_external_evidence_request_count, 1);
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.evidence_gate_status, 'empty');
  assert.match(
    audit.envelope.semantic_equivalence_evidence_gate.required_evidence_policy,
    /domain_or_app_live_evidence_refs/,
  );
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.can_close_without_evidence, false);
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.mechanical_completion_can_close, false);
  assert.equal(
    audit.envelope.semantic_equivalence_evidence_gate.authority_boundary.can_claim_domain_ready,
    false,
  );
  assert.equal(
    audit.envelope.semantic_equivalence_evidence_gate.authority_boundary.can_claim_private_residue_deleted,
    false,
  );
  assert.equal(
    audit.envelope.semantic_equivalence_evidence_gate.authority_boundary.can_authorize_quality_or_export,
    false,
  );
  assert.equal(
    audit.envelope.semantic_equivalence_evidence_gate.authority_boundary.can_replace_domain_owner,
    false,
  );
  assert.equal(audit.envelope.status_policy.evidence_gate_status, 'empty');
  assert.equal(audit.envelope.authority_boundary.opl_can_authorize_quality_or_export, false);
});

test('functional privatization audit reads MAS canonical modules as standard contract source', () => {
  const audit = buildFunctionalPrivatizationAudit({
    target_domain_id: 'med-autoscience',
    functional_privatization_audit: {
      surface_kind: 'functional_privatization_audit',
      target_domain_id: 'med-autoscience',
      functional_surface_classification: {
        A_opl_owned_mas_consumes: ['legacy_helper_name_not_the_source'],
      },
      modules: [
        {
          module_id: 'domain_authority_refs_index',
          classification: 'domain_authority_refs',
          owner: 'med-autoscience',
          code_paths: ['src/med_autoscience/runtime_protocol/domain_authority_refs_index.py'],
        },
        {
          module_id: 'study_stage_policy_pack',
          classification: 'declarative_pack_generated_surface',
          owner: 'med-autoscience',
        },
        {
          module_id: 'study_truth',
          classification: 'minimal_authority_function',
          owner: 'med-autoscience',
        },
      ],
    },
  });

  assert.equal(audit.envelope.source_field, 'functional_privatization_audit');
  assert.equal(audit.envelope.source_field_role, 'standard_contract_source');
  assert.deepEqual(audit.envelope.legacy_import_source_fields, []);
  assert.equal(audit.summary.total_module_count, 3);
  assert.deepEqual(audit.modules.map((entry) => entry.module_id), [
    'domain_authority_refs_index',
    'study_stage_policy_pack',
    'study_truth',
  ]);
  assert.equal(audit.modules[0].migration_class, 'refs_only_domain_adapter');
  assert.equal(audit.summary.refs_only_domain_adapter_count, 1);
  assert.equal(audit.summary.declarative_pack_count, 1);
  assert.equal(audit.summary.minimal_authority_function_count, 1);
});

test('functional privatization audit accepts explicit semantic equivalence evidence refs', () => {
  const audit = buildFunctionalPrivatizationAudit({
    target_domain_id: 'redcube',
    functional_privatization_audit: {
      surface_kind: 'functional_privatization_audit',
      target_domain_id: 'redcube',
      modules: [
        {
          module_id: 'codex_executor_adapter',
          migration_class: 'refs_only_adapter',
          active_caller_status: 'route_run_record_adapter_split_landed_opl_attempt_shell_pending',
          semantic_equivalence_status: 'cleared_by_boundary',
          semantic_equivalence_reason:
            'domain-owned refs-only boundary proof recorded; OPL attempt shell parity is still a bridge-exit blocker, not semantic ambiguity',
          semantic_equivalence_evidence_refs: [
            'semantic-equivalence:rca/codex-executor-adapter/refs-only-boundary',
          ],
          semantic_equivalence_typed_blocker_refs: [
            'typed-blocker:rca/default-caller-deletion/codex_executor_adapter/physical-delete-requires-explicit-owner-receipt',
          ],
          semantic_equivalence_no_regression_refs: [
            'no-forbidden-write:rca/default-caller-deletion/codex_executor_adapter/refs-only-boundary',
          ],
        },
      ],
    },
  });

  const module = audit.modules[0];
  assert.equal(audit.envelope.source_field, 'functional_privatization_audit');
  assert.equal(audit.envelope.source_field_role, 'standard_contract_source');
  assert.deepEqual(audit.envelope.legacy_import_source_fields, []);
  assert.equal(module.semantic_equivalence_status, 'cleared_by_boundary');
  assert.match(module.semantic_equivalence_reason, /refs-only boundary proof/);
  assert.deepEqual(module.semantic_equivalence_evidence_refs, [
    'semantic-equivalence:rca/codex-executor-adapter/refs-only-boundary',
  ]);
  assert.deepEqual(module.semantic_equivalence_typed_blocker_refs, [
    'typed-blocker:rca/default-caller-deletion/codex_executor_adapter/physical-delete-requires-explicit-owner-receipt',
  ]);
  assert.deepEqual(module.semantic_equivalence_no_regression_refs, [
    'no-forbidden-write:rca/default-caller-deletion/codex_executor_adapter/refs-only-boundary',
  ]);
  assert.equal(audit.summary.semantic_equivalence_review_count, 0);
  assert.equal(audit.envelope.semantic_equivalence_evidence_gate.status, 'not_required');
  assert.equal(audit.envelope.authority_boundary.envelope_can_claim_private_residue_deleted, false);
});

test('functional privatization audit envelope contract is tracked and contract-light', () => {
  const contract = readJson('contracts/opl-framework/functional-privatization-audit-envelope-contract.json');

  assert.deepEqual(contract, FUNCTIONAL_PRIVATIZATION_AUDIT_ENVELOPE_CONTRACT);
  assert.equal(contract.ai_first_contract_light_policy.contract_floor_only, true);
  assert.deepEqual(contract.accepted_source_shapes, ['functional_privatization_audit']);
  assert.deepEqual(contract.legacy_import_source_shapes, []);
  assert.equal(contract.source_shape_policy.legacy_repo_local_shapes_are_standard_contract, false);
  assert.equal(contract.source_shape_policy.legacy_import_adapter_available, false);
  assert.equal(contract.source_shape_policy.new_agents_must_emit_canonical_functional_privatization_audit, true);
  assert.equal(contract.ai_first_contract_light_policy.mechanical_completion_can_close_domain_quality, false);
  assert.deepEqual(contract.semantic_equivalence_evidence_gate.status_values, [
    'not_required',
    'evidence_required',
  ]);
  assert.equal(contract.semantic_equivalence_evidence_gate.can_close_without_evidence, false);
  assert.equal(contract.semantic_equivalence_evidence_gate.mechanical_completion_can_close, false);
  assert.match(
    contract.semantic_equivalence_evidence_gate.required_evidence_policy,
    /owner receipt before private residue closure/,
  );
  assert.equal(contract.authority_boundary.envelope_can_claim_private_residue_deleted, false);
});
