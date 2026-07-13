import { assert, loadFamilyManifestFixtures, test } from '../helpers.ts';

test('family manifest fixtures expose domain agent entry spec v1', () => {
  const fixtures = loadFamilyManifestFixtures();
  const scienceSpec = (fixtures.medautoscience.domain_entry_contract as Record<string, unknown>)
    .domain_agent_entry_spec as Record<string, unknown>;
  const grantSpec = (fixtures.medautogrant.product_entry_manifest as Record<string, unknown>)
    .domain_entry_contract as Record<string, unknown>;
  const grantEntrySpec = grantSpec.domain_agent_entry_spec as Record<string, unknown>;
  const redcubeSpec = (fixtures.redcube.domain_entry_contract as Record<string, unknown>)
    .domain_agent_entry_spec as Record<string, unknown>;

  assert.equal(scienceSpec.agent_id, 'mas');
  assert.equal(scienceSpec.entry_command, 'product-status');
  assert.equal(scienceSpec.manifest_command, 'product-entry-manifest');

  assert.equal(grantEntrySpec.agent_id, 'mag');
  assert.equal(grantEntrySpec.entry_command, 'product-status');
  assert.equal(grantEntrySpec.manifest_command, 'product-entry-manifest');

  assert.equal(redcubeSpec.agent_id, 'rca');
  assert.equal(redcubeSpec.entry_command, 'redcube product status');
  assert.equal(redcubeSpec.manifest_command, 'redcube product manifest');
});
