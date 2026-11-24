import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  createCordisAppFullComposition,
  createCordisBaseHeadlessComposition,
} from '../../src/host/composition-profiles.ts';
import {
  CORDIS_RELEASE_OPERATION_SERVICE,
  createCordisReleaseOperationComposition,
  type CordisReleaseOperationService,
} from '../../src/host/plugins/cordis-release-operation.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

test('release operation service is injected for one request and revoked on teardown', async () => {
  let statusCalls = 0;
  const service = {
    status(input: unknown) {
      statusCalls += 1;
      return { input, source: 'injected-release-operation-service' };
    },
  } as unknown as CordisReleaseOperationService;
  const composition = await createCordisReleaseOperationComposition({ service });
  assert.equal(composition.ctx.get(CORDIS_RELEASE_OPERATION_SERVICE), service);
  assert.deepEqual(composition.service.status({
    bundleDigest: `sha256:${'0'.repeat(64)}`,
  }), {
    input: { bundleDigest: `sha256:${'0'.repeat(64)}` },
    source: 'injected-release-operation-service',
  });
  assert.equal(statusCalls, 1);

  await composition.dispose();
  assert.equal(composition.ctx.get(CORDIS_RELEASE_OPERATION_SERVICE), undefined);
});

test('only base-headless exposes the release-operation child factory', async () => {
  const base = await createCordisBaseHeadlessComposition();
  const app = await createCordisAppFullComposition({
    runtimeSnapshotProvider: async () => ({ runtime_tray_snapshot: {} }),
  });
  try {
    assert.equal(typeof base.services.childFactories.createReleaseOperationComposition, 'function');
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        app.services.childFactories,
        'createReleaseOperationComposition',
      ),
      false,
    );
    const release = await base.services.childFactories.createReleaseOperationComposition();
    try {
      assert.equal(release.ctx.root, base.ctx.root);
      assert.notEqual(release.ctx, base.ctx);
      assert.equal(
        release.ctx.get(CORDIS_RELEASE_OPERATION_SERVICE),
        release.service,
      );
      assert.equal(base.ctx.get(CORDIS_RELEASE_OPERATION_SERVICE), undefined);
    } finally {
      await release.dispose();
    }
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        base.snapshot.binding.child_composition_snapshot_refs,
        'release_operation',
      ),
      true,
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        app.snapshot.binding.child_composition_snapshot_refs,
        'release_operation',
      ),
      false,
    );
  } finally {
    await app.dispose();
    await base.dispose();
  }
});

test('public release commands resolve the base-headless child service instead of direct Bundle calls', () => {
  const releaseSpecs = fs.readFileSync(
    path.join(repoRoot, 'src/entrypoints/cli/cases/public-command-specs/release.ts'),
    'utf8',
  );
  const publicSpecs = fs.readFileSync(
    path.join(repoRoot, 'src/entrypoints/cli/cases/public-command-specs.ts'),
    'utf8',
  );
  assert.match(releaseSpecs, /createReleaseOperationComposition/);
  assert.match(releaseSpecs, /composition\.service/);
  assert.match(releaseSpecs, /await composition\.dispose\(\)/);
  assert.doesNotMatch(releaseSpecs, /import\s*\{[^}]*freezeReleaseBundle/);
  assert.match(publicSpecs, /cordis\?\.profileId === 'base-headless'/);
  assert.match(publicSpecs, /childFactories\.createReleaseOperationComposition/);
});
