import test from 'node:test';
import assert from 'node:assert/strict';
import { selectHomebrewProductTargets } from '../../src/adapters/integration/homebrew-product-selection.ts';

test('publisher defaults select a release track and edition, while a receipt keeps an explicit track', () => {
  const items = ['one-person-lab-nightly', 'one-person-lab-full', 'one-person-lab'].map(name => ({
    name: `gaofeng21cn/one-person-lab/${name}`, item_id: name, kind: 'cask',
    product_id: 'github:gaofeng21cn/one-person-lab-app', homebrew_installed: false,
  }));
  const selection = selectHomebrewProductTargets(items);
  assert.equal(selection.find(row => row.selected_for_product)?.item_id, 'one-person-lab');
  assert.equal(selection[1].release_channel, 'stable');
  assert.equal(selection[1].installation_variant, 'full');
  items[0].homebrew_installed = true;
  assert.equal(selectHomebrewProductTargets(items).find(row => row.selected_for_product)?.item_id, 'one-person-lab-nightly');
  const development = items.map(item => ({ ...item, installed_build_kind: 'local-development' }));
  assert.equal(selectHomebrewProductTargets(development).find(row => row.selected_for_product)?.item_id, 'one-person-lab');
});

test('an unknown multi-source product requires an owner default rather than version or name ranking', () => {
  const items = ['short', 'long-name'].map(name => ({ name, item_id: name, kind: 'cask', product_id: 'another-product' }));
  assert.equal(selectHomebrewProductTargets(items).some(item => item.selected_for_product), false);
  assert.equal(selectHomebrewProductTargets([items[0]])[0].selection_basis, 'only_source');
});
