import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { catalogFixtureManifestPath } from './helpers/catalog-fixture.ts';

const packageIds = ['mag', 'mas', 'obf', 'oma', 'rca'];

test('canonical standard-agent Home shortcuts provide Chinese labels', () => {
  for (const packageId of packageIds) {
    const manifest = JSON.parse(
      fs.readFileSync(catalogFixtureManifestPath(packageId), 'utf8')
    ) as {
      presentation?: {
        home_shortcuts?: Array<{ label_i18n?: Record<string, unknown> }>;
      };
    };
    const shortcuts = manifest.presentation?.home_shortcuts ?? [];
    assert.ok(shortcuts.length > 0, `${packageId} must expose a Home shortcut`);
    for (const shortcut of shortcuts) {
      assert.equal(
        typeof shortcut.label_i18n?.['zh-CN'] === 'string' && shortcut.label_i18n['zh-CN'].trim().length > 0,
        true,
        `${packageId} Home shortcut must provide a zh-CN label`
      );
    }
  }
});
