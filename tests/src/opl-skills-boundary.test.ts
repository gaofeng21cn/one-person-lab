import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFamilySkillPacks } from '../../src/opl-skills.ts';

test('OPL system skill sync catalog excludes MAS/MDS project-local stage skills', () => {
  const catalog = readFamilySkillPacks().skill_catalog;
  const domainIds = catalog.packs.map((pack) => pack.domain_id);
  const pluginNames = catalog.packs.map((pack) => pack.canonical_plugin_name);

  assert.deepEqual(domainIds, ['medautoscience', 'medautogrant', 'redcube']);
  assert.equal(domainIds.includes('meddeepscientist'), false);
  assert.equal(pluginNames.includes('deepscientist'), false);
});
