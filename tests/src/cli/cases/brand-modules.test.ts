import { assert, loadFrameworkContracts, repoRoot, runCli, test } from '../helpers.ts';

const expectedModuleIds = [
  'charter',
  'atlas',
  'workspace',
  'stagecraft',
  'runway',
  'vault',
  'console',
  'foundry-lab',
  'connect',
];

test('brand module registry is loaded as a required framework contract', () => {
  const contracts = loadFrameworkContracts(repoRoot);

  assert.equal(contracts.brandModuleRegistry.scope, 'opl_brand_module_registry');
  assert.deepEqual(
    contracts.brandModuleRegistry.modules.map((entry) => entry.module_id),
    expectedModuleIds,
  );
});

test('brand modules list exposes all nine modules at the Workspace structural baseline', () => {
  const output = runCli(['brand-modules', 'list']);

  assert.equal(output.version, 'g2');
  assert.equal(output.brand_modules.surface_kind, 'opl_brand_modules');
  assert.deepEqual(
    output.brand_modules.modules.map((entry: { module_id: string }) => entry.module_id),
    expectedModuleIds,
  );
  assert.equal(
    output.brand_modules.modules.every((entry: { maturity_level: string }) =>
      entry.maturity_level === 'L4_structural_baseline'
    ),
    true,
  );
});

test('brand modules inspect returns one module with refs-only authority flags', () => {
  const output = runCli(['brand-modules', 'inspect', '--module', 'workspace']);
  const module = output.brand_module;

  assert.equal(module.module_id, 'workspace');
  assert.equal(module.brand_name, 'OPL Workspace');
  assert.equal(module.module_doc_ref, 'human_doc:opl_brand_module_workspace');
  assert.equal(module.module_doc_path, 'docs/references/brand-modules/workspace.md');
  assert.equal(module.maturity_level, 'L4_structural_baseline');
  assert.equal(module.authority_boundary.can_claim_domain_ready, false);
  assert.equal(module.authority_boundary.can_claim_quality_verdict, false);
  assert.equal(module.authority_boundary.can_claim_artifact_authority, false);
  assert.equal(module.authority_boundary.can_claim_production_ready, false);
  assert.equal(module.authority_boundary.can_write_domain_truth, false);
  assert.equal(module.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(module.contract_refs.includes('contracts/opl-framework/workspace-index.schema.json'), true);
  assert.equal(module.cli_surfaces.includes('opl workspace ensure --json'), true);
  assert.equal(module.validation_surfaces.includes('opl workspace validate --json'), true);
});

test('brand modules maturity and validation are contract-derived', () => {
  const maturity = runCli(['brand-modules', 'maturity']).brand_module_maturity;
  assert.equal(maturity.baseline_module_id, 'workspace');
  assert.equal(maturity.module_count, 9);
  assert.equal(maturity.l4_structural_baseline_count, 9);
  assert.deepEqual(maturity.below_baseline_module_ids, []);

  const validation = runCli(['brand-modules', 'validate']).brand_module_validation;
  assert.equal(validation.status, 'valid');
  assert.equal(validation.validated_module_count, 9);
  assert.deepEqual(validation.missing_l4_gate_modules, []);
  assert.deepEqual(validation.authority_boundary_violations, []);
});

test('brand modules interfaces expose CLI, app, descriptor, and validation surfaces without mutation authority', () => {
  const interfaces = runCli(['brand-modules', 'interfaces']).brand_module_interfaces;

  assert.equal(interfaces.surface_kind, 'opl_brand_module_interface_bundle');
  assert.equal(interfaces.module_count, 9);
  assert.equal(interfaces.cli.commands.includes('opl brand-modules list --json'), true);
  assert.equal(interfaces.app.descriptors.some((entry: { action_id: string }) => entry.action_id === 'brand_modules_list'), true);
  assert.equal(interfaces.descriptor.delegates.some((entry: { delegate_id: string }) => entry.delegate_id === 'brand_modules_registry'), true);
  assert.equal(interfaces.validation.commands.includes('opl brand-modules validate --json'), true);
  assert.equal(interfaces.authority_boundary.can_claim_domain_ready, false);
  assert.equal(interfaces.authority_boundary.can_claim_quality_verdict, false);
  assert.equal(interfaces.authority_boundary.can_claim_artifact_authority, false);
  assert.equal(interfaces.authority_boundary.can_claim_production_ready, false);
  assert.equal(interfaces.authority_boundary.can_write_domain_truth, false);
  assert.equal(interfaces.authority_boundary.can_sign_owner_receipt, false);
});

test('each non-Workspace OPL platform brand module has its own executable CLI frontdoor family', () => {
  const operations = ['status', 'inspect', 'interfaces', 'validate', 'doctor'];
  const moduleIds = expectedModuleIds.filter((moduleId) => moduleId !== 'workspace');

  for (const moduleId of moduleIds) {
    for (const operation of operations) {
      const output = runCli([moduleId, operation]);
      const surface = output.brand_module_surface;

      assert.equal(surface.surface_kind, `opl_${moduleId.replace('-', '_')}_brand_module_${operation}`);
      assert.equal(surface.module_id, moduleId);
      assert.equal(surface.operation, operation);
      assert.equal(surface.canonical_frontdoor, `opl ${moduleId}`);
      assert.equal(surface.status, operation === 'doctor' ? 'pass' : 'valid');
      assert.equal(surface.registry_ref, `contracts/opl-framework/brand-module-registry.json#modules.${moduleId}`);
      assert.equal(surface.governance_ref, `contracts/opl-framework/brand-cli-governance.json#platform_frontdoors.${moduleId}`);
      assert.equal(Array.isArray(surface.contract_refs) && surface.contract_refs.length > 0, true);
      assert.equal(Array.isArray(surface.cli_surfaces) && surface.cli_surfaces.length > 0, true);
      assert.equal(Array.isArray(surface.app_surfaces) && surface.app_surfaces.length > 0, true);
      assert.equal(Array.isArray(surface.descriptor_surfaces) && surface.descriptor_surfaces.length > 0, true);
      assert.equal(Array.isArray(surface.validation_surfaces) && surface.validation_surfaces.length > 0, true);
      assert.equal(
        surface.checks.every((entry: { status: string }) => entry.status === 'pass'),
        true,
      );
      assert.equal(surface.authority_boundary.can_claim_domain_ready, false);
      assert.equal(surface.authority_boundary.can_claim_quality_verdict, false);
      assert.equal(surface.authority_boundary.can_claim_artifact_authority, false);
      assert.equal(surface.authority_boundary.can_claim_production_ready, false);
      assert.equal(surface.authority_boundary.can_write_domain_truth, false);
      assert.equal(surface.authority_boundary.can_sign_owner_receipt, false);
    }
  }
});

test('Workspace keeps existing validate doctor interfaces semantics and adds non-conflicting brand status inspect commands', () => {
  for (const operation of ['status', 'inspect']) {
    const output = runCli(['workspace', operation]);
    const surface = output.brand_module_surface;

    assert.equal(surface.surface_kind, `opl_workspace_brand_module_${operation}`);
    assert.equal(surface.module_id, 'workspace');
    assert.equal(surface.operation, operation);
    assert.equal(surface.canonical_frontdoor, 'opl workspace');
    assert.equal(surface.status, 'valid');
    assert.equal(surface.registry_ref, 'contracts/opl-framework/brand-module-registry.json#modules.workspace');
    assert.equal(surface.governance_ref, 'contracts/opl-framework/brand-cli-governance.json#platform_frontdoors.workspace');
    assert.equal(Array.isArray(surface.contract_refs) && surface.contract_refs.length > 0, true);
    assert.equal(Array.isArray(surface.validation_surfaces) && surface.validation_surfaces.length > 0, true);
    assert.equal(
      surface.checks.every((entry: { status: string }) => entry.status === 'pass'),
      true,
    );
    assert.equal(surface.frontdoor_collision_policy, 'preserve_workspace_operational_validate_doctor_interfaces');
  }
});

test('agent-owned internal modules expose the same branding spine without becoming OPL platform modules', () => {
  const list = runCli(['agents', 'modules', 'list']).agent_internal_modules;

  assert.equal(list.surface_kind, 'opl_agent_internal_brand_module_list');
  assert.deepEqual(list.platform_module_ids, expectedModuleIds);
  assert.deepEqual(list.agent_module_ids, expectedModuleIds.map((moduleId) => `agent-${moduleId}`));
  assert.equal(list.domain_count, 3);
  assert.equal(list.module_count_per_domain, 9);
  assert.equal(list.canonical_frontdoor, 'opl agents modules');
  assert.equal(list.authority_boundary.can_write_domain_truth, false);
  assert.equal(list.authority_boundary.can_replace_domain_owner, false);

  const inspect = runCli([
    'agents',
    'modules',
    'inspect',
    '--domain',
    'medautoscience',
    '--module',
    'agent-runway',
  ]).agent_internal_module;

  assert.equal(inspect.surface_kind, 'opl_agent_internal_brand_module_inspect');
  assert.equal(inspect.domain_id, 'medautoscience');
  assert.equal(inspect.agent_module_id, 'agent-runway');
  assert.equal(inspect.platform_analogue_module_id, 'runway');
  assert.equal(inspect.canonical_frontdoor, 'opl agents modules');
  assert.equal(inspect.module_frontdoor, 'opl agents modules inspect --domain medautoscience --module agent-runway');
  assert.equal(inspect.authority_boundary.can_write_domain_truth, false);
  assert.equal(inspect.authority_boundary.can_claim_production_ready, false);

  const validation = runCli(['agents', 'modules', 'validate']).agent_internal_module_validation;
  assert.equal(validation.surface_kind, 'opl_agent_internal_brand_module_validation');
  assert.equal(validation.status, 'valid');
  assert.deepEqual(validation.missing_domain_module_sets, []);

  const doctor = runCli(['agents', 'modules', 'doctor']).agent_internal_module_doctor;
  assert.equal(doctor.surface_kind, 'opl_agent_internal_brand_module_doctor');
  assert.equal(doctor.status, 'pass');
});

test('Foundry Agent series exposes a shared CLI spine instead of copying the nine OPL modules into each agent', () => {
  for (const operation of ['status', 'inspect', 'interfaces', 'validate', 'doctor', 'peers']) {
    const output = runCli(['agents', 'foundry', operation]).foundry_agent_cli_spine;

    assert.equal(output.series_id, 'opl_foundry_agent_series.v1');
    assert.equal(output.series_label, 'OPL Foundry Agent');
    assert.equal(output.operation, operation);
    assert.equal(output.canonical_frontdoor, 'opl agents foundry');
    assert.equal(output.status, operation === 'doctor' ? 'pass' : 'valid');
    assert.equal(output.frontdoor_policy.agent_cli_uses_foundry_series_spine, true);
    assert.equal(output.frontdoor_policy.agent_cli_does_not_replicate_opl_nine_brand_modules, true);
    assert.equal(output.frontdoor_policy.old_implementation_buckets_are_not_ordinary_frontdoors, true);
    assert.deepEqual(
      output.spine.map((entry: { object: string }) => entry.object),
      ['workspace', 'work', 'stage', 'run', 'vault', 'handoff', 'connect'],
    );
    assert.deepEqual(
      output.peers.map((entry: { agent_id: string }) => entry.agent_id),
      ['mas', 'mag', 'rca', 'oma'],
    );
    assert.equal(output.authority_boundary.generated_surface_can_write_domain_truth, false);
    assert.equal(output.authority_boundary.generated_surface_can_create_owner_receipt, false);
    assert.equal(output.mcp_and_skill_policy.skill_pack_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.mcp_descriptor_must_delegate_to_series_spine, true);
    assert.equal(output.mcp_and_skill_policy.expose_legacy_buckets_as_diagnostic_or_migration_only, true);
    assert.equal(
      output.retired_implementation_buckets.some((entry: { bucket: string }) => entry.bucket === 'skill'),
      true,
    );
  }
});
