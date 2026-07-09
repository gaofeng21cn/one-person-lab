import { assert, loadFrameworkContracts, repoRoot, runCli, test } from '../helpers.ts';
import './brand-modules-cases/agent-and-foundry-surfaces.ts';
import './brand-modules-cases/l5-evidence-gate.ts';
import './brand-modules-cases/module-command-surfaces.ts';
import './brand-modules-cases/runway-control-loop.ts';
import { expectedModuleIds } from './brand-modules-cases/shared.ts';

test('brand module contracts and CLI expose the same current module set', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const list = runCli(['brand-modules', 'list']).brand_modules;
  const validation = runCli(['brand-modules', 'validate']).brand_module_validation;

  assert.deepEqual(contracts.brandModuleRegistry.modules.map((entry) => entry.module_id), expectedModuleIds);
  assert.deepEqual(list.modules.map((entry: { module_id: string }) => entry.module_id), expectedModuleIds);
  assert.equal(validation.status, 'valid');
  assert.deepEqual(validation.authority_boundary_violations, []);
});

test('brand module inspect keeps OPL as refs-only framework authority', () => {
  const module = runCli(['brand-modules', 'inspect', '--module', 'workspace']).brand_module;

  assert.equal(module.module_id, 'workspace');
  assert.equal(module.maturity_level, 'L4_structural_baseline');
  assert.equal(module.authority_boundary.can_claim_domain_ready, false);
  assert.equal(module.authority_boundary.can_write_domain_truth, false);
  assert.equal(module.authority_boundary.can_sign_owner_receipt, false);
});
