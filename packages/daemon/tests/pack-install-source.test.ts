import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { coerceInstallSourceSpec } from '../src/utils/normalize.ts';

test('a local .oplpack uses the verified Package archive install path', () => {
  assert.deepEqual(coerceInstallSourceSpec('./demo-1.2.3.oplpack', 'demo'), {
    kind: 'tarball',
    path: path.resolve('demo-1.2.3.oplpack'),
    package_id: 'demo',
  });
});
