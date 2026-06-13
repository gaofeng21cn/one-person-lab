import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/standard-agent-landing-acceptance-contract.json';

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
}

test('standard agent landing acceptance declares non-completion boundary', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, contractPath)), true, 'standard-agent acceptance contract is missing');
  const contract = readJson<Record<string, any>>(contractPath);

  assert.equal(contract.surface_kind, 'opl_standard_agent_landing_acceptance_contract');
  assert.equal(contract.version, 'standard-agent-landing-acceptance.v1');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.state, 'active_contract');
  assert.match(contract.machine_boundary, /^This contract defines standard-agent landing acceptance gates/);

  const policy = contract.completion_claim_policy;
  assert.equal(policy.definition_landed_status, 'acceptance_definition_landed');
  assert.equal(policy.current_completion_status, 'family_evidence_tail_open_not_complete');
  assert.equal(policy.definition_landed_can_claim_standard_agent_complete, false);
  assert.equal(policy.conformance_pass_can_claim_domain_ready, false);
  assert.equal(policy.generated_surface_ready_can_claim_caller_migration, false);
  assert.equal(policy.private_residue_classified_can_claim_physical_retired, false);
  assert.equal(policy.suite_pass_can_claim_target_owner_acceptance, false);
});

test('standard agent definition separates OPL substrate from domain authority', () => {
  const contract = readJson<Record<string, any>>(contractPath);
  const definition = contract.standard_agent_definition;

  assert.equal(
    definition.source_shape,
    'Declarative Domain Pack + OPL generated/hosted surfaces + Domain Minimal Authority Kernel',
  );
  assert.equal(definition.default_read_root, 'current_owner_delta');
  assert.ok(definition.domain_repo_must_provide.includes('agent/ declarative domain pack'));
  assert.ok(definition.opl_must_own.includes('generated CLI/MCP/Skill/product-entry/status/workbench surfaces'));
  assert.ok(definition.opl_must_own.includes('private-platform residue decision ledger'));
  assert.ok(definition.domain_must_own.includes('owner receipt signing'));
  assert.ok(definition.domain_must_own.includes('typed blocker creation'));
  assert.ok(definition.domain_must_own.includes('domain-specific recovery kernel'));
});

test('standard agent landing acceptance gates cover source shape generated surfaces residue route and OMA', () => {
  const contract = readJson<Record<string, any>>(contractPath);
  const gates = Object.fromEntries(contract.acceptance_gates.map((gate: any) => [gate.gate_id, gate]));

  assert.deepEqual(Object.keys(gates).sort(), [
    'agent_pack_semantics_real_and_current',
    'cross_agent_negative_conformance',
    'current_owner_delta_single_ordinary_route',
    'generated_surface_production_consumption',
    'oma_target_agent_work_order_guard',
    'private_platform_residue_owner_decision',
    'stage_route_arbiter_and_stop_loss',
  ]);

  for (const gate of contract.acceptance_gates) {
    assert.ok(gate.requires.length > 0, gate.gate_id);
    assert.ok(gate.cannot_be_satisfied_by.length > 0, gate.gate_id);
  }

  assert.ok(gates.generated_surface_production_consumption.cannot_be_satisfied_by.includes('generated interface ready alone'));
  assert.ok(gates.private_platform_residue_owner_decision.cannot_be_satisfied_by.includes('classification only'));
  assert.ok(gates.current_owner_delta_single_ordinary_route.cannot_be_satisfied_by.includes('provider completion'));
  assert.ok(gates.oma_target_agent_work_order_guard.cannot_be_satisfied_by.includes('Agent Lab suite pass'));
  assert.ok(gates.cross_agent_negative_conformance.requires.includes('negative conformance rejects generated-ready as production caller migration'));
});

test('standard agent landing acceptance forbids false completion claims and domain kernel copying', () => {
  const contract = readJson<Record<string, any>>(contractPath);

  for (const claim of [
    'descriptor_ready',
    'generated_interface_ready',
    'standard_pack_conformance_passed',
    'suite_pass',
    'Agent_Lab_pass',
    'functional_structure_gap_count_zero',
    'provider_completed',
    'verified_refs_only_ledger',
    'App_projection_ready',
    'contract_landed',
  ]) {
    assert.ok(contract.false_completion_claims.includes(claim), `missing false completion claim ${claim}`);
  }

  for (const evidence of [
    'domain_owner_receipt_ref',
    'domain_typed_blocker_ref',
    'generated_surface_production_consumption_ref',
    'direct_hosted_parity_ref',
    'no_active_caller_scan_ref',
    'domain_owner_physical_delete_or_keep_decision_ref',
    'cross_agent_negative_conformance_ref',
  ]) {
    assert.ok(contract.allowed_completion_evidence.includes(evidence), `missing allowed evidence ${evidence}`);
  }

  assert.equal(contract.domain_kernel_policy.copy_domain_kernel_into_opl_allowed, false);
  assert.ok(contract.domain_kernel_policy.generic_kernel_belongs_to_opl.includes('stage_route_currentness'));
  assert.ok(contract.domain_kernel_policy.domain_specific_kernel_stays_domain_owned.includes('MAS paper_recovery_state'));
  assert.ok(contract.current_open_evidence_tails.includes('OMA generated/takeover target-agent typed-blocker samples'));
});
