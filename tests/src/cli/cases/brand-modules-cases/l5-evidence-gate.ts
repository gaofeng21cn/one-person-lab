import { assert, loadFrameworkContracts, repoRoot, runCli, test } from '../../helpers.ts';

test('brand-module L5 gate remains non-closing without production evidence authority', () => {
  const contracts = loadFrameworkContracts(repoRoot);
  const maturity = runCli(['brand-modules', 'maturity']).brand_module_maturity;
  const evidence = contracts.brandModuleL5OperatingEvidence;

  assert.equal(maturity.l5_claimed_count, 0);
  assert.equal(maturity.l5_open_gap_count, maturity.module_count);
  assert.equal(evidence.owner_route_work_order_policy.non_closing_inputs.includes('brand_experience_profile'), true);
  assert.equal(evidence.owner_route_work_order_policy.work_orders_close_l5, false);
  assert.equal(evidence.owner_route_work_order_policy.work_orders_can_claim_production_ready, false);
});
