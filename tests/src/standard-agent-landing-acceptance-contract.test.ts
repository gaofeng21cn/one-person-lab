import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const contractPath = 'contracts/opl-framework/standard-agent-landing-acceptance-contract.json';
const evidenceStatusPath = 'contracts/opl-framework/standard-agent-landing-evidence-status.json';
const negativeSamplesPath = 'contracts/opl-framework/standard-agent-negative-conformance-samples.json';
const firstPartyAgentPackageIds = ['mas', 'mag', 'rca', 'oma', 'obf'];
const absoluteLocalPathPattern = /(?<!workspace:)\/Users\/[^ "]+/;

function readJson<T>(relativePath: string): T {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as T;
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
    'stage_route_currentness_and_advisory_no_progress',
  ]);

  for (const gate of contract.acceptance_gates) {
    assert.ok(gate.requires.length > 0, gate.gate_id);
    assert.ok(gate.cannot_be_satisfied_by.length > 0, gate.gate_id);
  }

  assert.ok(gates.generated_surface_production_consumption.cannot_be_satisfied_by.includes('generated interface ready alone'));
  assert.ok(gates.private_platform_residue_owner_decision.cannot_be_satisfied_by.includes('classification only'));
  assert.ok(gates.current_owner_delta_single_ordinary_route.cannot_be_satisfied_by.includes('provider completion'));
  assert.ok(
    gates.stage_route_currentness_and_advisory_no_progress.requires.includes(
      'no-progress remains advisory while canonical admission consumer is null',
    ),
  );
  assert.ok(
    gates.stage_route_currentness_and_advisory_no_progress.cannot_be_satisfied_by.includes(
      'same-identity no-progress counter or launch freeze without an active canonical owner consumer',
    ),
  );
  assert.ok(gates.oma_target_agent_work_order_guard.cannot_be_satisfied_by.includes('Agent Lab suite pass'));
  assert.ok(gates.cross_agent_negative_conformance.requires.includes('negative conformance rejects generated-ready as production caller migration'));
});

test('standard agent landing evidence status keeps evidence tails open', () => {
  assert.equal(
    fs.existsSync(path.join(repoRoot, evidenceStatusPath)),
    true,
    'standard-agent evidence status ledger is missing',
  );
  const contract = readJson<Record<string, any>>(contractPath);
  const ledger = readJson<Record<string, any>>(evidenceStatusPath);
  const gates = Object.fromEntries(ledger.gate_statuses.map((gate: any) => [gate.gate_id, gate]));

  assert.equal(ledger.surface_kind, 'opl_standard_agent_landing_evidence_status');
  assert.equal(ledger.version, 'standard-agent-landing-evidence-status.v1');
  assert.equal(ledger.owner, 'one-person-lab');
  assert.equal(ledger.state, 'active_evidence_status');
  assert.equal(ledger.completion_claim_authorized, false);
  assert.equal(ledger.current_completion_status, contract.completion_claim_policy.current_completion_status);
  assert.deepEqual(
    Object.keys(gates).sort(),
    contract.acceptance_gates.map((gate: any) => gate.gate_id).sort(),
  );

  for (const gate of contract.acceptance_gates) {
    assert.equal(gates[gate.gate_id].required_status, gate.required_status, gate.gate_id);
    assert.ok(['satisfied', 'evidence_required', 'satisfied_or_owner_typed_blocker'].includes(gates[gate.gate_id].status));
    assert.equal(gates[gate.gate_id].can_claim_complete, false, gate.gate_id);
  }

  for (const openTail of [
    'generated_surface_production_consumption',
    'oma_target_agent_work_order_guard',
    'cross_agent_negative_conformance',
    'functional_closure_default_path_followthrough',
    'long_soak_real_user_path_owner_evidence',
  ]) {
    assert.ok(
      ['evidence_required', 'functional_structure_followthrough_required'].includes(
        ledger.open_evidence_tails[openTail].status,
      ) || ledger.open_evidence_tails[openTail].status === 'functional_structure_baseline_landed',
      openTail,
    );
    assert.equal(ledger.open_evidence_tails[openTail].can_claim_complete, false, openTail);
  }

  const followthrough = ledger.functional_closure_followthrough;
  assert.equal(followthrough.surface_kind, 'opl_standard_agent_functional_closure_followthrough');
  assert.equal(followthrough.scope, 'non_live_functional_structure_only');
  assert.equal(followthrough.status, 'functional_structure_baseline_landed');
  assert.equal(followthrough.can_claim_functional_structure_baseline_complete, true);
  assert.equal(followthrough.landed_commits['med-autoscience'], '3fde902283f3e9b2e2c55ef3ff541bba70a49dca');
  assert.deepEqual(followthrough.owner_repos, [
    'one-person-lab',
    'med-autoscience',
    'med-autogrant',
    'redcube-ai',
    'opl-meta-agent',
    'opl-bookforge',
    'one-person-lab-app',
  ]);
  assert.ok(followthrough.required_followthrough_items.includes('app_docker_webui_beginner_path'));
  assert.ok(
    followthrough.required_followthrough_items.includes(
      'registry_sample_typed_blocker_executable_owner_route',
    ),
  );
  assert.ok(followthrough.accepted_closure_evidence.includes('default_path_readback_or_focused_test'));
  assert.ok(followthrough.forbidden_completion_evidence.includes('provider_long_soak'));
  assert.equal(followthrough.authority_boundary.can_claim_release_ready, false);
  assert.equal(followthrough.authority_boundary.can_create_typed_blocker, false);

  assert.ok(gates.cross_agent_negative_conformance.evidence_refs.includes(negativeSamplesPath));
  assert.equal(
    gates.cross_agent_negative_conformance.missing_evidence.includes(
      'cross-agent negative conformance scaleout across registry samples',
    ),
    false,
  );
  assert.ok(
    gates.cross_agent_negative_conformance.missing_evidence.includes(
      'production generated-surface caller negative samples',
    ),
  );
  assert.ok(gates.cross_agent_negative_conformance.missing_evidence.includes('long-soak negative samples'));
});

test('standard agent landing contract and evidence status do not pin local checkout paths as machine refs', () => {
  const surfaces = [
    readJson<Record<string, any>>(contractPath),
    readJson<Record<string, any>>(evidenceStatusPath),
    readJson<Record<string, any>>(negativeSamplesPath),
  ];

  for (const surface of surfaces) {
    assert.equal(
      absoluteLocalPathPattern.test(JSON.stringify(surface)),
      false,
      `${surface.surface_kind} must not use local checkout paths as machine references`,
    );
  }
});

test('standard agent landing negative conformance rejects false completions', () => {
  const ledger = readJson<Record<string, any>>(evidenceStatusPath);
  const cases = Object.fromEntries(ledger.negative_conformance_cases.map((entry: any) => [entry.case_id, entry]));

  assert.deepEqual(Object.keys(cases).sort(), [
    'classification_zero',
    'domain_specific_kernel_copied_to_opl',
    'generated_interface_ready',
    'provider_completed',
    'refs_only_ledger',
  ]);

  assert.equal(cases.provider_completed.rejected_completion_claim, 'standard_agent_completion');
  assert.equal(cases.classification_zero.rejected_completion_claim, 'physical_cleanup_complete');
  assert.equal(cases.generated_interface_ready.rejected_completion_claim, 'generated_surface_production_consumption');
  assert.equal(cases.refs_only_ledger.rejected_completion_claim, 'domain_ready_or_brand_l5');
  assert.equal(cases.domain_specific_kernel_copied_to_opl.rejected_completion_claim, 'opl_generic_kernel_landed');

  for (const entry of Object.values(cases) as any[]) {
    assert.equal(entry.status, 'blocked_false_completion');
    assert.equal(entry.can_claim_standard_agent_complete, false, entry.case_id);
    assert.ok(entry.required_next_shape === 'typed_blocker' || entry.required_next_shape === 'developer_work_order');
  }
});

test('standard agent landing negative conformance has repo-backed cross-agent samples', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, negativeSamplesPath)), true, 'negative samples ledger is missing');
  const samplesLedger = readJson<Record<string, any>>(negativeSamplesPath);
  const samples = samplesLedger.samples;

  assert.equal(samplesLedger.surface_kind, 'opl_standard_agent_negative_conformance_samples');
  assert.equal(samplesLedger.version, 'standard-agent-negative-conformance-samples.v1');
  assert.equal(samplesLedger.owner, 'one-person-lab');
  assert.equal(samplesLedger.state, 'active_negative_conformance_samples');
  assert.equal(samplesLedger.can_claim_family_complete, false);
  assert.equal(samplesLedger.can_claim_standard_agent_complete, false);
  assert.equal(samplesLedger.open_tail.status, 'evidence_required');
  assert.equal(samplesLedger.open_tail.can_claim_complete, false);

  assert.deepEqual(
    [...new Set(samples.map((sample: any) => sample.target_dimension))].sort(),
    ['family-default', 'registry-sample'].sort(),
  );
  assert.deepEqual(
    samples
      .filter((sample: any) => sample.target_dimension === 'registry-sample')
      .map((sample: any) => sample.registry_sample_id)
      .sort(),
    ['mag', 'mas', 'oma', 'rca'],
  );
  assert.deepEqual(
    [...new Set(samples.map((sample: any) => sample.false_completion_signal))].sort(),
    [
      'classification_zero',
      'domain_specific_kernel_copied_to_opl',
      'generated_interface_ready',
      'provider_completed',
      'stage_output_without_domain_completion_policy',
      'verified_refs_only_ledger',
    ],
  );

  for (const sample of samples) {
    assert.equal(sample.status, 'blocked_false_completion', sample.sample_id);
    assert.ok(sample.rejected_completion_claim.length > 0, sample.sample_id);
    assert.ok(
      sample.required_next_shape === 'typed_blocker'
        || sample.required_next_shape === 'developer_work_order'
        || sample.required_next_shape === 'stage_completion_policy_or_typed_blocker',
      sample.sample_id,
    );
    assert.equal(sample.can_claim_standard_agent_complete, false, sample.sample_id);
    assert.equal(sample.domain_specific_kernel_written_as_opl_generic_kernel_allowed, false, sample.sample_id);
    if (sample.target_dimension === 'registry-sample') {
      assert.equal(sample.base_contract_invariant, false, sample.sample_id);
      assert.match(sample.registry_sample_ref, /^contracts\/opl-framework\/packages\/.+\.json$/);
    }
  }
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
  assert.ok(contract.domain_kernel_policy.domain_specific_kernel_stays_domain_owned.includes('domain_recovery_state'));
  assert.ok(contract.current_open_evidence_tails.includes('generated/takeover target-agent typed-blocker samples'));
});

test('first-party agent package manifests mark registry entries as data not base invariants', () => {
  for (const packageId of firstPartyAgentPackageIds) {
    const manifestPath = `contracts/opl-framework/packages/${packageId}.json`;
    const manifest = readJson<Record<string, any>>(manifestPath);

    assert.equal(
      manifest.registry_entry?.base_contract_role,
      'registry_data_not_base_invariant',
      manifestPath,
    );
    assert.equal(manifest.registry_entry?.base_contract_invariant, false, manifestPath);
    assert.equal(manifest.registry_entry?.registry_source_ref, manifestPath);
    assert.ok(manifest.registry_entry?.identity_fields.includes('package_id'), manifestPath);
    assert.ok(manifest.registry_entry?.identity_fields.includes('agent_id'), manifestPath);
  }
});
