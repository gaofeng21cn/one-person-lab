import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const domainsPath = path.join(repoRoot, 'contracts', 'opl-framework', 'domains.json');
const publicSurfaceIndexPath = path.join(repoRoot, 'contracts', 'opl-framework', 'public-surface-index.json');
const standardAgentAdmissionGatesPath = path.join(
  repoRoot,
  'contracts',
  'opl-framework',
  'standard-agent-admission-gates.json',
);
const retiredBoundaryTermsField = ['legacy', 'boundary', 'terms'].join('_');

type DomainDefinition = {
  domain_id: string;
  registry_entry?: {
    registry_kind?: string;
    registry_source_ref?: string;
    base_contract_role?: string;
    base_contract_invariant?: boolean;
    identity_fields?: string[];
    agent_package_manifest_ref?: string;
  };
  product_layer?: string;
  foundry_agent_package?: {
    package_kind?: string;
    built_on?: string;
    app_surface?: string;
    direct_skill_entry?: boolean;
    embeds_opl_runtime?: boolean;
  };
  independent_domain_agent?: {
    agent_id?: string;
    opl_top_level_domain_agent?: boolean;
  };
  single_app_skill?: {
    skill_id?: string;
    entry_command?: string;
    manifest_command?: string;
  };
  domain_truth_owner?: string[];
  opl_projection_role?: string[];
  runtime_dependency_boundary?: {
    opl_dependency?: string;
    opl_truth_write_policy?: string;
    backend_companions?: Array<Record<string, unknown>>;
  };
};

function readDomainsContract() {
  return parseJsonText(fs.readFileSync(domainsPath, 'utf8')) as {
    version: string;
    domains: DomainDefinition[];
  };
}

function readPublicSurfaceIndex() {
  return parseJsonText(fs.readFileSync(publicSurfaceIndexPath, 'utf8')) as {
    version: string;
    surfaces: Array<{
      surface_id: string;
      category_id: string;
      surface_kind: string;
      boundary_role: string;
      owner_scope: string;
      truth_mode: string;
      routes_to: string[];
      refs: Array<{ ref_kind: string; ref: string }>;
      notes: string[];
    }>;
  };
}

function readStandardAgentAdmissionGates() {
  return parseJsonText(fs.readFileSync(standardAgentAdmissionGatesPath, 'utf8')) as {
    surface_kind: string;
    version: string;
    admission_policy: {
      applies_to: string;
      formal_domain_admission_requires_all_gates: boolean;
      conformance_or_scaffold_signal_can_claim_domain_ready: boolean;
      production_readiness_claim_allowed: boolean;
      standard_agent_registry_source_ref: string;
      managed_owner_contract_source_refs: string[];
      legacy_domain_catalog_role: string;
      human_spec_ref: string;
    };
    standard_agent_admission_package: {
      required_gate_ids: string[];
      gates: Array<{
        gate_id: string;
        requirement_kind: string;
        required_for_formal_admission: boolean;
        required_evidence_refs: string[];
        required_declarations?: string[];
        forbidden_claims: string[];
      }>;
    };
    false_authority_boundary: Record<string, boolean>;
    non_readiness_statement: Record<string, unknown>;
  };
}

function pickSkillCommands(domain: DomainDefinition | undefined) {
  return {
    skill_id: domain?.single_app_skill?.skill_id,
    entry_command: domain?.single_app_skill?.entry_command,
    manifest_command: domain?.single_app_skill?.manifest_command,
  };
}

test('domains.json g2 keeps retired boundary terms out of active domain fields', () => {
  const payload = readDomainsContract();

  assert.equal(payload.version, 'g2');
  assert.equal(Array.isArray(payload.domains), true);
  for (const domain of payload.domains) {
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'gateway_surface'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'harness_surface'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'canonical_truth_owner'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(domain, 'role'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(domain, retiredBoundaryTermsField), false);
    assert.equal(domain.registry_entry?.registry_kind, 'admitted_domain_agent_registry_entry');
    assert.equal(domain.registry_entry?.base_contract_role, 'registry_data_not_base_invariant');
    assert.equal(domain.registry_entry?.base_contract_invariant, false);
    assert.equal(domain.registry_entry?.registry_source_ref, `contracts/opl-framework/domains.json#${domain.domain_id}`);
    assert.equal(domain.registry_entry?.identity_fields?.includes('domain_id'), true);
    assert.equal(domain.product_layer, 'foundry_agent');
    assert.deepEqual(domain.foundry_agent_package, {
      package_kind: 'opl_compatible_package',
      built_on: 'opl_framework',
      app_surface: 'one_person_lab_app',
      direct_skill_entry: true,
      embeds_opl_runtime: false,
    });
    assert.equal(typeof domain.independent_domain_agent?.agent_id, 'string');
    assert.equal(domain.independent_domain_agent?.opl_top_level_domain_agent, true);
    assert.equal(typeof domain.single_app_skill?.skill_id, 'string');
    assert.equal(Array.isArray(domain.domain_truth_owner), true);
    assert.equal(Array.isArray(domain.opl_projection_role), true);
    assert.equal(domain.runtime_dependency_boundary?.opl_dependency, 'projection_consumer_only');
    assert.equal(domain.runtime_dependency_boundary?.opl_truth_write_policy, 'no_domain_truth_writes');
  }
});

test('MedAutoScience g2 definition owns research truth while MDS remains a MAS backend companion', () => {
  const payload = readDomainsContract();
  const mas = payload.domains.find((domain) => domain.domain_id === 'medautoscience');

  assert.ok(mas);
  assert.equal(mas.independent_domain_agent?.agent_id, 'mas');
  assert.equal(mas.single_app_skill?.skill_id, 'mas');
  assert.deepEqual(mas.domain_truth_owner, [
    'study_truth',
    'runtime_health',
    'publication_judgment',
    'ai_reviewer_quality_artifacts',
    'artifact_authority',
    'user_visible_progress',
  ]);
  assert.deepEqual(mas.opl_projection_role, [
    'consume_session_projections',
    'consume_progress_projections',
    'consume_artifact_projections',
    'consume_runtime_projections',
  ]);
  assert.deepEqual(mas.runtime_dependency_boundary?.backend_companions, [
    {
      project: 'med-deepscientist',
      role: 'mas_controlled_backend_oracle_intake_buffer',
      controlled_by: 'med-autoscience',
      opl_top_level_domain_agent: false,
    },
  ]);
});

test('domains.json g2 publishes current single app skill entry commands', () => {
  const payload = readDomainsContract();
  const domainById = new Map(payload.domains.map((domain) => [domain.domain_id, domain]));

  assert.deepEqual(pickSkillCommands(domainById.get('medautogrant')), {
    skill_id: 'mag',
    entry_command: 'medautogrant product status',
    manifest_command: 'medautogrant product manifest',
  });
  assert.deepEqual(pickSkillCommands(domainById.get('medautoscience')), {
    skill_id: 'mas',
    entry_command: 'medautosci product-entry-status',
    manifest_command: 'medautosci product-entry-manifest',
  });
  assert.deepEqual(pickSkillCommands(domainById.get('redcube')), {
    skill_id: 'rca',
    entry_command: 'redcube product status',
    manifest_command: 'redcube product manifest',
  });
});

test('domains.json g2 publishes Foundry Agents as OPL-compatible packages without embedded OPL runtime', () => {
  const payload = readDomainsContract();

  assert.deepEqual(
    payload.domains.map((domain) => ({
      domain_id: domain.domain_id,
      product_layer: domain.product_layer,
      package_kind: domain.foundry_agent_package?.package_kind,
      built_on: domain.foundry_agent_package?.built_on,
      app_surface: domain.foundry_agent_package?.app_surface,
      direct_skill_entry: domain.foundry_agent_package?.direct_skill_entry,
      embeds_opl_runtime: domain.foundry_agent_package?.embeds_opl_runtime,
    })),
    [
      {
        domain_id: 'medautogrant',
        product_layer: 'foundry_agent',
        package_kind: 'opl_compatible_package',
        built_on: 'opl_framework',
        app_surface: 'one_person_lab_app',
        direct_skill_entry: true,
        embeds_opl_runtime: false,
      },
      {
        domain_id: 'medautoscience',
        product_layer: 'foundry_agent',
        package_kind: 'opl_compatible_package',
        built_on: 'opl_framework',
        app_surface: 'one_person_lab_app',
        direct_skill_entry: true,
        embeds_opl_runtime: false,
      },
      {
        domain_id: 'redcube',
        product_layer: 'foundry_agent',
        package_kind: 'opl_compatible_package',
        built_on: 'opl_framework',
        app_surface: 'one_person_lab_app',
        direct_skill_entry: true,
        embeds_opl_runtime: false,
      },
    ],
  );
});

test('public-surface-index publishes the OPL Framework locator as the agent dependency environment surface', () => {
  const payload = readPublicSurfaceIndex();
  const locator = payload.surfaces.find((surface) => surface.surface_id === 'opl_framework_locator');

  assert.ok(locator);
  assert.equal(locator.category_id, 'opl_framework_contract');
  assert.equal(locator.surface_kind, 'framework_dependency_locator');
  assert.equal(locator.boundary_role, 'agent_runtime_dependency_locator');
  assert.equal(locator.owner_scope, 'opl');
  assert.equal(locator.truth_mode, 'framework_locator');
  assert.deepEqual(locator.routes_to, [
    'opl_stage_runtime_framework',
    'mag_foundry_agent_package',
    'mas_foundry_agent_package',
    'rca_foundry_agent_package',
  ]);
  assert.deepEqual(locator.refs, [
    {
      ref_kind: 'machine_cli',
      ref: 'opl framework locate',
    },
    {
      ref_kind: 'machine_contract',
      ref: 'contracts/opl-framework/public-surface-index.json#opl_framework_locator',
    },
  ]);
  assert.equal(
    locator.notes.some((note) => note.includes('OPL-compatible agents locate their external OPL Framework runtime dependency')),
    true,
  );
});

test('standard agent admission gates freeze required package boundaries without granting readiness authority', () => {
  const gates = readStandardAgentAdmissionGates();

  assert.equal(gates.surface_kind, 'opl_standard_agent_admission_gates');
  assert.equal(gates.version, 'standard-agent-admission-gates.v2');
  assert.equal(gates.admission_policy.applies_to, 'candidate_standard_opl_domain_agent');
  assert.equal(gates.admission_policy.formal_domain_admission_requires_all_gates, true);
  assert.equal(gates.admission_policy.conformance_or_scaffold_signal_can_claim_domain_ready, false);
  assert.equal(gates.admission_policy.production_readiness_claim_allowed, false);
  assert.equal(
    gates.admission_policy.standard_agent_registry_source_ref,
    'src/kernel/standard-agent-registry.ts',
  );
  assert.equal(
    gates.admission_policy.legacy_domain_catalog_role,
    'workspace_runtime_and_legacy_manifest_configuration_not_standard_agent_discovery_or_admission',
  );
  assert.deepEqual(gates.standard_agent_admission_package.required_gate_ids, [
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
  assert.equal(
    gates.standard_agent_admission_package.gates.length,
    gates.standard_agent_admission_package.required_gate_ids.length,
  );

  for (const gateId of gates.standard_agent_admission_package.required_gate_ids) {
    const gate = gates.standard_agent_admission_package.gates.find((entry) => entry.gate_id === gateId);
    assert.ok(gate, `${gateId} gate must exist`);
    assert.equal(gate.required_for_formal_admission, true);
    assert.equal(gate.required_evidence_refs.length > 0, true);
    assert.equal(gate.forbidden_claims.includes('domain_ready'), true);
    assert.equal(gate.forbidden_claims.includes('production_ready'), true);
  }

  const generated = gates.standard_agent_admission_package.gates.find(
    (entry) => entry.gate_id === 'generated_surface_default_entry',
  );
  assert.ok(generated?.required_evidence_refs.includes(
    'contracts/opl-framework/domain-pack-compiler-contract.json',
  ));
  assert.ok(generated?.required_evidence_refs.includes(
    'contracts/family-orchestration/family-action-catalog.schema.json',
  ));
  assert.ok(generated?.required_declarations?.includes('source_of_work_lineage'));

  const falseAuthority = gates.false_authority_boundary;
  assert.equal(falseAuthority.opl_can_claim_domain_ready, false);
  assert.equal(falseAuthority.opl_can_claim_production_ready, false);
  assert.equal(falseAuthority.scaffold_signal_can_admit_domain, false);
  assert.equal(falseAuthority.generated_surface_can_admit_domain, false);
  assert.equal(falseAuthority.opl_can_create_owner_receipt, false);
  assert.equal(falseAuthority.opl_can_create_typed_blocker, false);
  assert.equal(falseAuthority.human_gate_can_replace_owner_receipt, false);
  assert.equal(gates.non_readiness_statement.this_contract_admits_any_domain, false);
  assert.equal(gates.non_readiness_statement.this_contract_claims_production_ready, false);
});

test('standard agent admission gates use semantic human-doc refs instead of prose paths', () => {
  const gates = readStandardAgentAdmissionGates();
  const rawContract = fs.readFileSync(standardAgentAdmissionGatesPath, 'utf8');
  const pinnedHumanDocPathPattern =
    /\b(?:README(?:\.zh-CN)?\.md|AGENTS\.md|docs\/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_-]+)?|contracts\/[A-Za-z0-9_./-]+\.md)\b/g;

  assert.equal(gates.admission_policy.human_spec_ref, 'human_doc:opl_domain_onboarding_contract');
  assert.deepEqual(rawContract.match(pinnedHumanDocPathPattern) ?? [], []);
  assert.match(rawContract, /human_doc:opl_domain_onboarding_contract/);
  assert.match(rawContract, /human_doc:opl_runtime_naming_and_boundary_contract/);
});
