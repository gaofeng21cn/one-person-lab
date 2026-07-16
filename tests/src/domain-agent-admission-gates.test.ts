import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const gatesPath = path.join(repoRoot, 'contracts', 'opl-framework', 'standard-agent-admission-gates.json');

type AdmissionGate = {
  gate_id: string;
  requirement_kind: string;
  required_for_formal_admission: boolean;
  required_evidence_refs: string[];
  forbidden_claims: string[];
  currentness_or_provenance_observation_alone_can_block_execution?: boolean;
  new_hosted_action_and_child_attempt_resolve_latest_or_lkg?: boolean;
  active_attempt_hot_reload?: boolean;
  historical_artifact_or_evidence_invalidated_by_package_update?: boolean;
  hard_stop_reasons?: string[];
};

type AdmissionGateContract = {
  surface_kind: string;
  version: string;
  owner: string;
  state: string;
  purpose: string;
  machine_boundary: string;
  admission_policy: {
    applies_to: string;
    formal_domain_admission_requires_all_gates: boolean;
    candidate_backlog_or_direction_signal_can_admit_domain: boolean;
    conformance_or_scaffold_signal_can_claim_domain_ready: boolean;
    production_readiness_claim_allowed: boolean;
  };
  standard_agent_admission_package: {
    required_gate_ids: string[];
    gates: AdmissionGate[];
  };
  false_authority_boundary: Record<string, boolean>;
  non_readiness_statement: Record<string, unknown>;
};

function readAdmissionGateContract() {
  return parseJsonText(fs.readFileSync(gatesPath, 'utf8')) as AdmissionGateContract;
}

test('standard domain-agent admission gates freeze required package sections as machine truth', () => {
  const contract = readAdmissionGateContract();

  assert.equal(contract.surface_kind, 'opl_standard_agent_admission_gates');
  assert.equal(contract.version, 'standard-agent-admission-gates.v1');
  assert.equal(contract.owner, 'one-person-lab');
  assert.equal(contract.state, 'active_contract');
  assert.equal(typeof contract.purpose, 'string');
  assert.equal(typeof contract.machine_boundary, 'string');
  assert.equal(contract.admission_policy.applies_to, 'candidate_standard_opl_domain_agent');
  assert.equal(contract.admission_policy.formal_domain_admission_requires_all_gates, true);
  assert.equal(contract.admission_policy.candidate_backlog_or_direction_signal_can_admit_domain, false);
  assert.equal(contract.admission_policy.conformance_or_scaffold_signal_can_claim_domain_ready, false);
  assert.equal(contract.admission_policy.production_readiness_claim_allowed, false);
  assert.equal(contract.non_readiness_statement.this_contract_admits_any_domain, false);
  assert.equal(contract.non_readiness_statement.this_contract_claims_existing_domain_ready, false);
  assert.equal(contract.non_readiness_statement.this_contract_claims_production_ready, false);

  assert.deepEqual(contract.standard_agent_admission_package.required_gate_ids, [
    'identity',
    'domain_truth_owner',
    'generated_surface_default_entry',
    'clean_checkout_currentness_gate',
    'standard_pack_abi',
    'stage_artifact_contract',
    'execution_model',
    'authority_boundary',
    'owner_receipt_boundary',
    'typed_blocker_boundary',
    'human_gate_false_authority',
  ]);

  const gatesById = new Map(contract.standard_agent_admission_package.gates.map((gate) => [gate.gate_id, gate]));
  assert.equal(gatesById.size, contract.standard_agent_admission_package.required_gate_ids.length);
  for (const gateId of contract.standard_agent_admission_package.required_gate_ids) {
    const gate = gatesById.get(gateId);
    assert.ok(gate, `missing admission gate ${gateId}`);
    assert.equal(gate.required_for_formal_admission, true);
    assert.equal(gate.required_evidence_refs.length > 0, true, `${gateId} must require evidence refs`);
    assert.equal(gate.forbidden_claims.includes('domain_ready'), true, `${gateId} must not claim domain ready`);
    assert.equal(gate.forbidden_claims.includes('production_ready'), true, `${gateId} must not claim production ready`);
  }

  const sourceResolutionGate = gatesById.get('clean_checkout_currentness_gate');
  assert.ok(sourceResolutionGate);
  assert.equal(sourceResolutionGate.requirement_kind, 'runtime_source_resolution_and_observation');
  assert.equal(sourceResolutionGate.currentness_or_provenance_observation_alone_can_block_execution, false);
  assert.equal(sourceResolutionGate.new_hosted_action_and_child_attempt_resolve_latest_or_lkg, true);
  assert.equal(sourceResolutionGate.active_attempt_hot_reload, false);
  assert.equal(sourceResolutionGate.historical_artifact_or_evidence_invalidated_by_package_update, false);
  assert.deepEqual(sourceResolutionGate.hard_stop_reasons, [
    'no_current_or_lkg_runnable_generation',
    'required_abi_or_export_missing',
    'required_module_or_skill_missing',
    'runtime_path_permission_or_safety_failure',
    'health_or_handler_probe_failed',
  ]);
});

test('standard domain-agent admission contract keeps false-authority boundaries explicit', () => {
  const contract = readAdmissionGateContract();

  assert.deepEqual(contract.false_authority_boundary, {
    opl_can_write_domain_truth: false,
    opl_can_claim_domain_ready: false,
    opl_can_claim_production_ready: false,
    scaffold_signal_can_admit_domain: false,
    generated_surface_can_admit_domain: false,
    clean_checkout_currentness_gate_can_claim_domain_ready: false,
    clean_checkout_currentness_gate_can_write_domain_truth: false,
    clean_checkout_currentness_gate_can_create_owner_receipt: false,
    clean_checkout_currentness_gate_can_create_typed_blocker: false,
    clean_checkout_currentness_gate_is_hot_reload: false,
    descriptor_pass_can_claim_domain_ready: false,
    conformance_pass_can_claim_production_ready: false,
    file_presence_counts_as_stage_complete: false,
    provider_completion_counts_as_stage_complete: false,
    opl_can_create_owner_receipt: false,
    opl_can_create_typed_blocker: false,
    human_gate_can_replace_owner_receipt: false,
    human_gate_can_write_domain_truth: false,
    human_gate_can_claim_domain_ready: false,
    stage_output_without_domain_completion_policy_counts_as_stage_complete: false,
  });

  const gatesById = new Map(contract.standard_agent_admission_package.gates.map((gate) => [gate.gate_id, gate]));
  assert.equal(gatesById.get('generated_surface_default_entry')?.requirement_kind, 'generated_surface_default_entry');
  assert.equal(gatesById.get('owner_receipt_boundary')?.requirement_kind, 'owner_receipt_boundary');
  assert.equal(gatesById.get('typed_blocker_boundary')?.requirement_kind, 'typed_blocker_boundary');
  assert.equal(gatesById.get('human_gate_false_authority')?.requirement_kind, 'human_gate_false_authority');
});

test('standard domain-agent admission contract references human docs through semantic ids', () => {
  const rawContract = fs.readFileSync(gatesPath, 'utf8');
  const pinnedHumanDocPathPattern =
    /\b(?:README(?:\.zh-CN)?\.md|AGENTS\.md|docs\/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_-]+)?|contracts\/[A-Za-z0-9_./-]+\.md)\b/g;

  assert.deepEqual(rawContract.match(pinnedHumanDocPathPattern) ?? [], []);
  assert.match(rawContract, /human_doc:opl_domain_onboarding_contract/);
  assert.match(rawContract, /human_doc:opl_runtime_naming_and_boundary_contract/);
});
