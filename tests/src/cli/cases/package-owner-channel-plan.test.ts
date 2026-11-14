import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildDailyPackageCandidates } from '../../../../scripts/package-channel-candidates.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('daily release preparation handles version metadata, binary payloads, denial and partial failures', () => {
  execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'package_release_test.py'],
    { cwd: repoRoot, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: 'pipe' });
});

function fingerprint(version: string, content: string, commit: string) {
  return {
    package_version: version,
    package_content_digest: `sha256:${content.repeat(64)}`,
    owner_source_commit: commit.repeat(40),
  };
}

function runPlan(candidate: unknown, current: unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-channel-plan-'));
  const candidatePath = path.join(root, 'candidate.json');
  const currentPath = path.join(root, 'current.json');
  fs.writeFileSync(candidatePath, `${JSON.stringify({ candidate_fingerprint: candidate })}\n`);
  fs.writeFileSync(currentPath, `${JSON.stringify({ packages: current })}\n`);
  return JSON.parse(execFileSync(process.execPath, [
    'scripts/package-owner-channel-plan.mjs',
    '--candidate-summary', candidatePath,
    '--current-state', currentPath,
  ], { cwd: repoRoot, encoding: 'utf8' }));
}

test('daily public candidates delegate private owners without reading their payloads or channels', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-daily-public-candidates-'));
  try {
    const manifests = path.join(root, 'contracts/opl-framework/packages');
    const output = path.join(root, 'dist/opl-daily-packages');
    fs.mkdirSync(manifests, { recursive: true });
    fs.mkdirSync(output, { recursive: true });
    const candidate = fingerprint('1.2.3', 'a', 'b');
    const publicPayload = {
      package_id: 'public-fixture', package_version: candidate.package_version,
      source_commit: candidate.owner_source_commit,
      content_lock: { digest: candidate.package_content_digest },
    };
    fs.writeFileSync(path.join(manifests, 'public-fixture.json'), JSON.stringify({
      version: '1.2.3', visibility: 'public',
      codex_surface: { plugin_payload_manifest_url: 'public-payload.json' },
    }));
    fs.writeFileSync(path.join(manifests, 'public-payload.json'), JSON.stringify(publicPayload));
    fs.writeFileSync(path.join(manifests, 'private-fixture.json'), JSON.stringify({
      visibility: 'authorized_only', source_repo: 'https://github.com/example/private-owner.git',
      codex_surface: { plugin_payload_manifest_url: 'does-not-exist.json' },
    }));
    const summary = buildDailyPackageCandidates([
      { package_id: 'public-fixture', visibility: 'public', package_manifest_ref: path.join(manifests, 'public-fixture.json') },
      { package_id: 'private-fixture', visibility: 'authorized_only', package_manifest_ref: path.join(manifests, 'private-fixture.json') },
    ]);
    assert.deepEqual(summary.candidate_fingerprint, { 'public-fixture': candidate });
    assert.deepEqual(summary.owner_managed_packages, {
      'private-fixture': {
        status: 'delegated_to_private_owner', source_repo: 'https://github.com/example/private-owner.git',
        registry_readback: 'not_performed', publication_status: 'not_evaluated',
      },
    });
    const plan = runPlan(summary.candidate_fingerprint, {
      'public-fixture': { status: 'present', digest: `sha256:${'c'.repeat(64)}`, fingerprint: candidate },
    });
    assert.equal(plan.status, 'skipped');
    assert.deepEqual(plan.unchanged_packages, ['public-fixture']);

    fs.writeFileSync(path.join(manifests, 'public-payload.json'), JSON.stringify({ ...publicPayload, package_id: 'wrong-id' }));
    assert.throws(() => buildDailyPackageCandidates([
      { package_id: 'public-fixture', visibility: 'public', package_manifest_ref: path.join(manifests, 'public-fixture.json') },
    ]), /Invalid Package candidate/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('owner-channel plan skips the same version and semantic content across a newer source commit', () => {
  const plan = runPlan(
    { 'opl-fleet-agent': fingerprint('0.2.41', 'a', 'b') },
    {
      'opl-fleet-agent': {
        status: 'present',
        digest: `sha256:${'c'.repeat(64)}`,
        fingerprint: fingerprint('0.2.41', 'a', 'd'),
      },
    },
  );
  assert.equal(plan.status, 'skipped');
  assert.equal(plan.publish_required, false);
  assert.deepEqual(plan.changed_packages, []);
  assert.deepEqual(plan.unchanged_packages, ['opl-fleet-agent']);
});

test('owner-channel plan publishes only a new version with changed semantic content', () => {
  const plan = runPlan(
    { mas: fingerprint('0.2.28', 'a', 'b') },
    {
      mas: {
        status: 'present',
        digest: `sha256:${'c'.repeat(64)}`,
        fingerprint: fingerprint('0.2.27', 'd', 'e'),
      },
    },
  );
  assert.equal(plan.status, 'publish_required');
  assert.equal(plan.publish_required, true);
  assert.deepEqual(plan.changed_packages, ['mas']);
});

test('owner-channel plan bootstraps a verified absent Package channel', () => {
  const plan = runPlan(
    { rca: fingerprint('0.2.15', 'a', 'b') },
    { rca: { status: 'absent', digest: null, fingerprint: null } },
  );
  assert.equal(plan.publish_required, true);
  assert.deepEqual(plan.changed_packages, ['rca']);
});

test('owner-channel plan requires a version bump when semantic content changes in place', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-channel-plan-'));
  const candidatePath = path.join(root, 'candidate.json');
  const currentPath = path.join(root, 'current.json');
  fs.writeFileSync(candidatePath, `${JSON.stringify({
    candidate_fingerprint: { 'opl-fleet-agent': fingerprint('0.2.41', 'a', 'b') },
  })}\n`);
  fs.writeFileSync(currentPath, `${JSON.stringify({
    packages: {
      'opl-fleet-agent': {
        status: 'present',
        digest: `sha256:${'c'.repeat(64)}`,
        fingerprint: fingerprint('0.2.41', 'd', 'e'),
      },
    },
  })}\n`);
  const result = spawnSync(process.execPath, [
    'scripts/package-owner-channel-plan.mjs',
    '--candidate-summary', candidatePath,
    '--current-state', currentPath,
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 2);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.violations[0].reason, 'version_bump_required');
});

test('owner-channel plan rejects a version-only publication', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-channel-plan-'));
  const candidatePath = path.join(root, 'candidate.json');
  const currentPath = path.join(root, 'current.json');
  fs.writeFileSync(candidatePath, `${JSON.stringify({
    candidate_fingerprint: { oma: fingerprint('0.4.10', 'a', 'b') },
  })}\n`);
  fs.writeFileSync(currentPath, `${JSON.stringify({
    packages: {
      oma: {
        status: 'present',
        digest: `sha256:${'c'.repeat(64)}`,
        fingerprint: fingerprint('0.4.9', 'a', 'd'),
      },
    },
  })}\n`);
  const result = spawnSync(process.execPath, [
    'scripts/package-owner-channel-plan.mjs',
    '--candidate-summary', candidatePath,
    '--current-state', currentPath,
  ], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).violations[0].reason, 'version_change_without_content_change');
});
