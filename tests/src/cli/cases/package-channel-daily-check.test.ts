import { execFileSync } from 'node:child_process';

import { assert, fs, os, path, repoRoot, test } from '../helpers.ts';

function writeManifest(filePath: string, input: {
  version: string;
  generatedAt: string;
  moduleHead: string;
  moduleSha: string;
}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({
      manifest_version: 1,
      opl_version: input.version,
      generated_at: input.generatedAt,
      packages: {
        modules: {
          medautoscience: {
            module_id: 'medautoscience',
            artifact: `ghcr.io/owner/one-person-lab-modules/med-autoscience:${input.version}`,
            source_archive: { sha256: input.moduleSha },
            source_git: { head_sha: input.moduleHead },
          },
        },
      },
    }, null, 2)}\n`,
    'utf8',
  );
}

function runDailyCheck(args: string[]) {
  return JSON.parse(execFileSync(process.execPath, [
    'scripts/package-channel-daily-check.mjs',
    ...args,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  }));
}

test('daily package channel check skips when module source fingerprints are unchanged', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const current = path.join(tempRoot, 'current.json');

  writeManifest(candidate, {
    version: '26.5.28-daily.20260603',
    generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });
  writeManifest(current, {
    version: '26.5.28-daily.20260602',
    generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });

  const summary = runDailyCheck([
    '--candidate-manifest',
    candidate,
    '--current-manifest',
    current,
    '--version',
    '26.5.28-daily.20260603',
  ]);

  assert.equal(summary.status, 'skipped');
  assert.equal(summary.reason, 'package_channel_unchanged');
  assert.equal(summary.publish_required, false);
  assert.equal(summary.version, '26.5.28-daily.20260603');
  assert.deepEqual(summary.changed_modules, []);
});

test('daily package channel check publishes when a module source fingerprint changes', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const current = path.join(tempRoot, 'current.json');

  writeManifest(candidate, {
    version: '26.5.28-daily.20260603',
    generatedAt: '2026-06-03T00:00:00.000Z',
    moduleHead: 'c'.repeat(40),
    moduleSha: 'd'.repeat(64),
  });
  writeManifest(current, {
    version: '26.5.28-daily.20260602',
    generatedAt: '2026-06-02T00:00:00.000Z',
    moduleHead: 'a'.repeat(40),
    moduleSha: 'b'.repeat(64),
  });

  const summary = runDailyCheck([
    '--candidate-manifest',
    candidate,
    '--current-manifest',
    current,
    '--version',
    '26.5.28-daily.20260603',
  ]);

  assert.equal(summary.status, 'publish_required');
  assert.equal(summary.reason, 'package_channel_changed');
  assert.equal(summary.publish_required, true);
  assert.deepEqual(summary.changed_modules, ['medautoscience']);
});

test('daily package channel check fails closed when no current channel manifest is available', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-daily-check-'));
  const candidate = path.join(tempRoot, 'candidate.json');
  const missingCurrent = path.join(tempRoot, 'missing-current.json');

  writeManifest(candidate, {
    version: '26.5.28-daily.20260603',
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
        '--version',
        '26.5.28-daily.20260603',
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
