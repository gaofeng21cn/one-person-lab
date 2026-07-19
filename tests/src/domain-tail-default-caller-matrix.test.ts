import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultCallerSurfaceGates } from '../../src/kernel/default-caller-surface-gates.ts';
import {
  aggregateDefaultCallerOwnerDecisionResultShape,
  buildDefaultCallerOwnerDecisionReadModel,
} from '../../src/kernel/default-caller-retirement-guard.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

type TailGate = {
  physical_delete_authorized: boolean;
  owner_acceptance_claimed: boolean;
  owner_decision_required: boolean;
  required_refs: string[];
};

type TailRow = {
  domain_id: string;
  surface_id: string;
  private_tail_class: string[];
  replacement_opl_primitive: string[];
  authority_retained: string[];
  delete_or_tombstone_gate: TailGate;
  forbidden_claims: string[];
  owner_decision_required: boolean;
  verification_surface: {
    primary_readback: string;
    focused_test: string;
    domain_owner_readback_required_before_delete: boolean;
  };
};

function readContract() {
  return parseJsonText(
    fs.readFileSync(
    path.join(repoRoot, 'contracts', 'opl-framework', 'domain-private-platform-tail-matrix.json'),
    'utf8',
    ),
  ) as {
    surface_kind: string;
    required_surface_fields: string[];
    surfaces: TailRow[];
    summary: {
      surface_count: number;
      physical_delete_authorized: boolean;
      owner_acceptance_claimed: boolean;
      domain_ready_claimed: boolean;
      production_ready_claimed: boolean;
    };
    authority_boundary: Record<string, boolean>;
  };
}

test('domain private platform tail matrix seeds the required family surfaces', () => {
  const contract = readContract();
  const rowsByDomain = new Map(contract.surfaces.map((row) => [row.domain_id, row]));

  assert.equal(contract.surface_kind, 'opl_domain_private_platform_tail_matrix.v1');
  assert.equal(contract.summary.surface_count, contract.surfaces.length);
  assert.deepEqual([...rowsByDomain.keys()].sort(), [
    'mas-scholar-skills',
    'med-autogrant',
    'med-autoscience',
    'opl-bookforge',
    'opl-meta-agent',
    'redcube-ai',
  ]);

  for (const field of [
    'private_tail_class',
    'replacement_opl_primitive',
    'authority_retained',
    'delete_or_tombstone_gate',
    'forbidden_claims',
    'owner_decision_required',
    'verification_surface',
  ]) {
    assert.ok(contract.required_surface_fields.includes(field));
  }

  assert.ok(rowsByDomain.get('med-autoscience')?.private_tail_class.includes('runtime_watch'));
  assert.ok(rowsByDomain.get('med-autogrant')?.private_tail_class.includes('control_plane_shell'));
  assert.ok(rowsByDomain.get('redcube-ai')?.private_tail_class.includes('session_store'));
  assert.ok(rowsByDomain.get('opl-meta-agent')?.private_tail_class.includes('helper_materializer'));
  assert.ok(rowsByDomain.get('opl-bookforge')?.private_tail_class.includes('helper_materializer'));
  assert.ok(rowsByDomain.get('mas-scholar-skills')?.private_tail_class.includes('package_capability_channel'));
});

test('domain private platform tail matrix stays refs-only and non-authorizing', () => {
  const contract = readContract();

  assert.equal(contract.summary.physical_delete_authorized, false);
  assert.equal(contract.summary.owner_acceptance_claimed, false);
  assert.equal(contract.summary.domain_ready_claimed, false);
  assert.equal(contract.summary.production_ready_claimed, false);
  assert.equal(contract.authority_boundary.matrix_can_mutate_domain_repo_files, false);
  assert.equal(contract.authority_boundary.matrix_can_authorize_domain_repo_physical_delete, false);
  assert.equal(contract.authority_boundary.matrix_can_claim_owner_acceptance, false);

  for (const row of contract.surfaces) {
    assert.ok(row.surface_id);
    assert.notEqual(row.private_tail_class.length, 0);
    assert.notEqual(row.replacement_opl_primitive.length, 0);
    assert.notEqual(row.authority_retained.length, 0);
    assert.notEqual(row.delete_or_tombstone_gate.required_refs.length, 0);
    assert.equal(row.delete_or_tombstone_gate.physical_delete_authorized, false);
    assert.equal(row.delete_or_tombstone_gate.owner_acceptance_claimed, false);
    assert.equal(typeof row.delete_or_tombstone_gate.owner_decision_required, 'boolean');
    assert.equal(row.owner_decision_required, row.delete_or_tombstone_gate.owner_decision_required);
    assert.equal(row.forbidden_claims.includes('physical_delete_authorized_by_opl'), true);
    assert.ok(row.verification_surface.primary_readback.startsWith('opl agents '));
    assert.equal(
      row.verification_surface.focused_test,
      'tests/src/domain-tail-default-caller-matrix.test.ts',
    );
  }
});

test('ScholarSkills remains a refs-only capability package outside domain-agent authority', () => {
  const contract = readContract();
  const scholarSkills = contract.surfaces.find((row) => row.domain_id === 'mas-scholar-skills');

  assert.ok(scholarSkills);
  assert.equal(
    scholarSkills.verification_surface.primary_readback,
    'opl agents conformance --family-defaults --json',
  );
  assert.equal(scholarSkills.owner_decision_required, false);
  assert.equal(scholarSkills.delete_or_tombstone_gate.owner_decision_required, false);
  assert.equal(scholarSkills.verification_surface.domain_owner_readback_required_before_delete, false);
  assert.ok(scholarSkills.forbidden_claims.includes('standard_domain_agent'));
  assert.ok(scholarSkills.forbidden_claims.includes('mas_truth'));
  assert.ok(scholarSkills.forbidden_claims.includes('typed_blocker_authority'));
});

test('default caller gate treats keep-as-authority adapter as OPL closeout, not delete readiness', () => {
  const gates = defaultCallerSurfaceGates({
    generated_wrapper_bundle: {
      descriptor_scope: [
        {
          surface_id: 'product_entry',
          status: 'ready',
          active_caller_proof_status: 'observed',
          active_caller_target_kind: 'refs_only_domain_adapter_target',
        },
      ],
    },
    active_caller_target_proof: {
      surface_targets: [
        {
          surface_id: 'product_entry',
          proof_status: 'observed',
          target_kind: 'refs_only_domain_adapter_target',
          bridge_exit_gate: {
            no_active_caller_refs: ['no-active-caller:mag/product-entry'],
            no_forbidden_write_refs: ['no-forbidden-write:mag/product-entry'],
            tombstone_refs: ['tombstone:mag/product-entry'],
            keep_as_authority_adapter_refs: ['keep-as-authority-adapter:mag/product-entry'],
          },
        },
      ],
    },
  });

  assert.equal(gates.length, 1);
  const worklist = gates[0].deletion_evidence_worklist as Record<string, unknown>;
  assert.equal(worklist.owner_decision_result_shape, 'keep_as_authority_adapter_ref');
  assert.equal(worklist.keep_as_authority_adapter_observed, true);
  assert.equal(
    worklist.owner_decision_closeout_status,
    'keep_as_authority_adapter_observed_no_further_opl_delete_work',
  );
  assert.equal(worklist.no_further_opl_default_caller_delete_work, true);
  assert.equal(worklist.active_deletion_worklist_item, false);
  assert.equal(worklist.physical_delete_authorization_request_observed, false);
  assert.equal(worklist.physical_delete_authorized, false);
  assert.equal(worklist.default_caller_delete_ready, false);
});

test('default caller owner-decision read model preserves result precedence without granting delete authority', () => {
  const ownerDecisionResultShape = aggregateDefaultCallerOwnerDecisionResultShape({
    resultShapes: [
      'owner_receipt_ref',
      'typed_blocker_ref',
      'keep_as_authority_adapter_ref',
    ],
  });
  const readModel = buildDefaultCallerOwnerDecisionReadModel({
    prerequisitesObserved: true,
    ownerDecisionObserved: true,
    ownerDecisionResultShape,
  });

  assert.equal(ownerDecisionResultShape, 'keep_as_authority_adapter_ref');
  assert.equal(readModel.owner_decision_status, 'owner_decision_observed_refs_only_not_delete_authorized');
  assert.equal(readModel.keep_as_authority_adapter_observed, true);
  assert.equal(readModel.physical_delete_authorization_request_observed, false);
  assert.equal(
    aggregateDefaultCallerOwnerDecisionResultShape({
      physicalDeleteAuthorized: true,
      resultShapes: ['typed_blocker_ref'],
    }),
    'physical_delete_authorization_ref',
  );
});
