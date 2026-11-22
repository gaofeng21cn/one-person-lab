import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SOURCE = fs.readFileSync(
  new URL('../../src/adapters/execution/family-runtime-review-transport-store.ts', import.meta.url),
  'utf8',
);

test('every copy-stage containment check admits the framework artifact roots', () => {
  // The resolver and both copy checks used to disagree: a framework-owned artifact resolved
  // fine and then failed with "escaped its declared workspace root before copy".
  assert.match(SOURCE, /const allowedRoots = input\.trustedWorkspaceRoot\s*\n\s*\? \[input\.trustedWorkspaceRoot, \.\.\.frameworkOwnedArtifactRoots\(\)\]/);
  assert.match(SOURCE, /!pathInsideRoots\(input\.sourcePath, allowedRoots\)/);
  assert.doesNotMatch(SOURCE, /pathInside\(input\.sourcePath, input\.trustedWorkspaceRoot\)/);
});

test('still requires a trusted workspace root before copying', () => {
  assert.match(SOURCE, /allowedRoots\.length === 0 \|\| !pathInsideRoots\(input\.sourcePath, allowedRoots\)/);
});
