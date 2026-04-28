import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDomainManifestCatalog } from '../../src/domain-manifest.ts';
import {
  buildFrontDeskDashboard,
  buildProjectProgressBrief,
  buildProjectsOverview,
  buildRuntimeStatus,
  buildWorkspaceStatus,
} from '../../src/management.ts';

test('public compatibility barrels expose stable entrypoints', () => {
  assert.equal(typeof buildDomainManifestCatalog, 'function');
  assert.equal(typeof buildFrontDeskDashboard, 'function');
  assert.equal(typeof buildProjectProgressBrief, 'function');
  assert.equal(typeof buildProjectsOverview, 'function');
  assert.equal(typeof buildRuntimeStatus, 'function');
  assert.equal(typeof buildWorkspaceStatus, 'function');
});
