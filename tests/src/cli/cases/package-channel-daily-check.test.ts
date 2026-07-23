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
        generation: input.version,
        component_count: 3,
        component_ids: ['opl-base', 'opl-app', 'mas'],
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
  assert.equal(summary.reason, 'packages_unchanged');
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
  assert.equal(summary.reason, 'package_changed');
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

test('daily Package check reports an unversioned Base change without blocking Package publication', () => {
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

  const summary = runDailyCheck([
    '--candidate-manifest', candidate,
    '--current-manifest', current,
    '--release-set-generation', '26.6.3',
  ]);
  assert.equal(summary.status, 'skipped');
  assert.equal(summary.reason, 'non_package_ecosystem_changed');
  assert.equal(summary.publish_required, false);
  assert.deepEqual(summary.changed_components, ['opl-base']);
  assert.deepEqual(summary.observed_changed_components, ['opl-base']);
  assert.deepEqual(summary.non_package_changed_components, ['opl-base']);
  assert.equal(summary.publication_scope, 'packages_only');
});

test('daily package channel emits LKG evidence for a failed candidate build', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const current = path.join(tempRoot, 'current.json');
  const detailLog = path.join(tempRoot, 'candidate-build.log');
  const summaryPath = path.join(tempRoot, 'summary.json');
  writeManifest(current, {
    version: '26.6.3',
    generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });
  fs.writeFileSync(detailLog, 'version_bump_required: mas\n', 'utf8');

  const summary = runDailyCheck([
    '--current-manifest', current,
    '--release-set-generation', '26.6.4',
    '--fallback-stage', 'candidate_manifest_build',
    '--fallback-exit-code', '1',
    '--fallback-log', detailLog,
    '--summary-path', summaryPath,
  ]);
  assert.equal(summary.status, 'retained_previous_stable');
  assert.equal(summary.reason, 'candidate_build_failed');
  assert.equal(summary.publish_required, false);
  assert.deepEqual(summary.changed_packages, []);
  assert.deepEqual(summary.retained_components, ['opl-base', 'opl-app', 'mas']);
  assert.equal(summary.fallback.exit_code, 1);
  assert.equal(summary.fallback.detail_log, 'candidate-build.log');
  assert.equal(summary.fallback.retained_release_set_generation, '26.6.3');
  assert.deepEqual(parseJsonText(fs.readFileSync(summaryPath, 'utf8')), summary);
});

test('daily package channel cannot fall back without a current stable manifest', () => {
  assert.throws(() => runDailyCheck([
    '--release-set-generation', '26.6.4',
    '--fallback-stage', 'candidate_manifest_build',
    '--fallback-exit-code', '1',
  ]), /Usage:/);
});

test('daily package channel rejects a malformed current manifest instead of treating it as LKG', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const current = path.join(tempRoot, 'current.json');
  fs.writeFileSync(current, `${JSON.stringify({
    release_set_generation: '26.6.3',
    release_set: { surface_kind: 'unknown_release_set' },
  })}\n`, 'utf8');

  assert.throws(() => runDailyCheck([
    '--current-manifest', current,
    '--release-set-generation', '26.6.4',
    '--fallback-stage', 'candidate_manifest_build',
    '--fallback-exit-code', '1',
  ]), /not a verified opl_release_set\.v2 LKG/);
});

test('daily Package check treats versioned Base changes as snapshot diagnostics', () => {
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
  assert.equal(summary.status, 'skipped');
  assert.equal(summary.reason, 'non_package_ecosystem_changed');
  assert.equal(summary.publish_required, false);
  assert.deepEqual(summary.changed_packages, []);
  assert.deepEqual(summary.changed_components, ['opl-base']);
  assert.deepEqual(summary.non_package_changed_components, ['opl-base']);
});

test('daily Package check publishes an independent Package when Base also changes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const current = path.join(tempRoot, 'current.json');
  writeManifest(candidate, {
    version: '26.6.3-r3', generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'c'.repeat(40), moduleSha: 'd'.repeat(64), packageVersion: '0.1.1',
    frameworkVersion: '0.2.0', frameworkHead: 'c'.repeat(40), frameworkSha: 'd'.repeat(64),
  });
  writeManifest(current, {
    version: '26.6.3', generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40), moduleSha: 'b'.repeat(64), packageVersion: '0.1.0',
    frameworkVersion: '0.1.0', frameworkHead: 'e'.repeat(40), frameworkSha: 'f'.repeat(64),
  });
  const summary = runDailyCheck([
    '--candidate-manifest', candidate,
    '--current-manifest', current,
    '--release-set-generation', '26.6.3-r3',
  ]);
  assert.equal(summary.status, 'publish_required');
  assert.equal(summary.reason, 'package_changed');
  assert.equal(summary.publish_required, true);
  assert.deepEqual(summary.changed_packages, ['mas']);
  assert.deepEqual(summary.non_package_changed_components, ['opl-base']);
  assert.deepEqual(summary.observed_changed_components, ['mas', 'opl-base']);
  assert.equal(summary.publication_scope, 'packages_only');
});

test('daily Package check reads projection manifests without building Package archives', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-projection-check-'));
  const packageRoot = path.join(tempRoot, 'contracts/opl-framework/packages');
  const payloadRoot = path.join(packageRoot, 'payloads');
  const current = path.join(tempRoot, 'current.json');
  fs.mkdirSync(payloadRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'mas.json'), `${JSON.stringify({
    package_id: 'mas',
    version: '0.1.1',
    codex_surface: {
      plugin_payload_manifest_url: 'payloads/mas-0.1.1.json',
      carrier_source_commit: 'c'.repeat(40),
    },
  })}\n`, 'utf8');
  fs.writeFileSync(path.join(payloadRoot, 'mas-0.1.1.json'), `${JSON.stringify({
    package_id: 'mas',
    package_version: '0.1.1',
    source_commit: 'c'.repeat(40),
    content_lock: { digest: `sha256:${'d'.repeat(64)}` },
  })}\n`, 'utf8');
  writeManifest(current, {
    version: '26.6.3',
    generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
    packageVersion: '0.1.0',
  });

  const summary = runDailyCheck([
    '--projection-root', tempRoot,
    '--current-manifest', current,
    '--release-set-generation', '26.6.3-r4',
  ]);
  assert.equal(summary.publish_required, true);
  assert.deepEqual(summary.changed_packages, ['mas']);
  assert.deepEqual(summary.non_package_changed_components, ['opl-app', 'opl-base']);
  assert.equal(summary.publication_scope, 'packages_only');
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
