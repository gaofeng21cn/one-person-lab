import { execFileSync } from 'node:child_process';

import { assert, fs, os, parseJsonText, path, repoRoot, test } from '../helpers.ts';

function writeManifest(filePath: string, input: {
  version: string;
  generatedAt: string;
  moduleHead: string;
  moduleSha: string;
  packageVersion?: string;
  frameworkHead?: string;
  frameworkSha?: string;
  frameworkVersion?: string;
}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({
      manifest_version: 1,
      release_set_generation: input.version,
      release_set: {
        surface_kind: 'opl_release_set.v2',
        components: {
          base: {
            component_id: 'opl-base',
            version: input.frameworkVersion ?? '0.2.0',
            source_commit: input.frameworkHead ?? 'e'.repeat(40),
          },
          app: {
            component_id: 'opl-app',
            version: '26.7.12',
            source_commit: '9'.repeat(40),
            artifact_digest: `sha256:${'8'.repeat(64)}`,
          },
        },
      },
      generated_at: input.generatedAt,
      packages: {
        framework_core: {
          version: input.frameworkVersion ?? '0.2.0',
          artifact: `ghcr.io/owner/one-person-lab-framework:${input.frameworkVersion ?? '0.2.0'}`,
          source_archive: { sha256: input.frameworkSha ?? 'f'.repeat(64) },
          source_git: { head_sha: input.frameworkHead ?? 'e'.repeat(40) },
        },
        package_catalog: {
          mas: {
            package_id: 'mas',
            selected_version: input.packageVersion ?? '0.1.0',
            versions: [{
              package_version: input.packageVersion ?? '0.1.0',
              selection_status: 'selected_for_release_set',
              package_content_digest: `sha256:${input.moduleSha}`,
              owner_source_commit: input.moduleHead,
            }],
          },
        },
      },
    }, null, 2)}\n`,
    'utf8',
  );
}

function runDailyCheck(args: string[]) {
  return parseJsonText(execFileSync(process.execPath, [
    'scripts/package-channel-daily-check.mjs',
    ...args,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  })) as any;
}

test('daily package channel check skips when package source fingerprints are unchanged', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const current = path.join(tempRoot, 'current.json');

  writeManifest(candidate, {
    version: '26.6.3',
    generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });
  writeManifest(current, {
    version: '26.6.3',
    generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });

  const summary = runDailyCheck([
    '--candidate-manifest',
    candidate,
    '--current-manifest',
    current,
    '--release-set-generation',
    '26.6.3',
  ]);

  assert.equal(summary.status, 'skipped');
  assert.equal(summary.reason, 'release_set_components_unchanged');
  assert.equal(summary.publish_required, false);
  assert.equal(summary.release_set_generation, '26.6.3');
  assert.deepEqual(summary.changed_packages, []);
});

test('daily package channel check publishes when a package source fingerprint changes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const current = path.join(tempRoot, 'current.json');

  writeManifest(candidate, {
    version: '26.6.3',
    generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'c'.repeat(40),
    moduleSha: 'd'.repeat(64),
    packageVersion: '0.1.1',
  });
  writeManifest(current, {
    version: '26.6.3',
    generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
    packageVersion: '0.1.0',
  });

  const summary = runDailyCheck([
    '--candidate-manifest',
    candidate,
    '--current-manifest',
    current,
    '--release-set-generation',
    '26.6.3',
  ]);

  assert.equal(summary.status, 'publish_required');
  assert.equal(summary.reason, 'release_set_component_changed');
  assert.equal(summary.publish_required, true);
  assert.deepEqual(summary.changed_packages, ['mas']);
});

test('daily package channel check bootstraps all Packages when latest-stable does not exist yet', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');

  writeManifest(candidate, {
    version: '26.6.3',
    generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });

  const summary = runDailyCheck([
    '--candidate-manifest',
    candidate,
    '--release-set-generation',
    '26.6.3',
  ]);

  assert.equal(summary.status, 'publish_required');
  assert.equal(summary.reason, 'package_channel_bootstrap');
  assert.equal(summary.current_manifest, null);
  assert.deepEqual(summary.changed_packages, ['mas']);
});

test('daily Release Set check fails closed when Base content changes without a version bump', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const current = path.join(tempRoot, 'current.json');

  writeManifest(candidate, {
    version: '26.6.3',
    generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
    frameworkHead: 'c'.repeat(40),
    frameworkSha: 'd'.repeat(64),
  });
  writeManifest(current, {
    version: '26.6.3',
    generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
    frameworkHead: 'e'.repeat(40),
    frameworkSha: 'f'.repeat(64),
  });

  assert.throws(() => runDailyCheck([
    '--candidate-manifest', candidate,
    '--current-manifest', current,
    '--release-set-generation', '26.6.3',
  ]), /component content changed without a version bump: opl-base/);
});

test('daily Release Set check publishes versioned Base changes without rebuilding Packages', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const current = path.join(tempRoot, 'current.json');
  writeManifest(candidate, {
    version: '26.6.3-r2', generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'a'.repeat(40), moduleSha: 'b'.repeat(64),
    frameworkVersion: '0.2.0', frameworkHead: 'c'.repeat(40), frameworkSha: 'd'.repeat(64),
  });
  writeManifest(current, {
    version: '26.6.3', generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40), moduleSha: 'b'.repeat(64),
    frameworkVersion: '0.1.0', frameworkHead: 'e'.repeat(40), frameworkSha: 'f'.repeat(64),
  });
  const summary = runDailyCheck([
    '--candidate-manifest', candidate,
    '--current-manifest', current,
    '--release-set-generation', '26.6.3-r2',
  ]);
  assert.equal(summary.publish_required, true);
  assert.deepEqual(summary.changed_packages, []);
  assert.deepEqual(summary.changed_components, ['opl-base']);
});

test('daily package channel check fails closed when no current channel manifest is available', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const missingCurrent = path.join(tempRoot, 'missing-current.json');

  writeManifest(candidate, {
    version: '26.6.3',
    generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });

  let stderr = '';
  assert.throws(() => {
    try {
      execFileSync(process.execPath, [
        'scripts/package-channel-daily-check.mjs',
        '--candidate-manifest',
        candidate,
        '--current-manifest',
        missingCurrent,
        '--release-set-generation',
        '26.6.3',
      ], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? '');
      throw error;
    }
  });
  assert.match(stderr, /Current channel manifest does not exist/);
});
