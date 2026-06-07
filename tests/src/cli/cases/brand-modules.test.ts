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
