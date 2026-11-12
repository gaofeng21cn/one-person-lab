import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildDailyPackageCandidates } from '../../../../scripts/package-channel-candidates.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

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

    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/daily-package-channel.yml'), 'utf8');
    const compareStep = workflow.split('      - name: Compare independent Package fingerprints\n')[1]!
      .split('\n      - name: ')[0]!.split('        run: |\n')[1]!
      .split('\n').map((line) => line.slice(10)).join('\n');
    const compareScript = compareStep.replaceAll('${{ github.repository_owner }}', 'example')
      .replaceAll('${{ github.run_id }}', '12345').replaceAll('${{ github.run_attempt }}', '1')
      .replaceAll('${{ github.sha }}', 'e'.repeat(40));
    fs.symlinkSync(path.join(repoRoot, 'scripts'), path.join(root, 'scripts'), 'dir');
    const bin = path.join(root, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(root, 'payload.json'), JSON.stringify(publicPayload));
    fs.writeFileSync(path.join(bin, 'oras'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.ORAS_LOG, JSON.stringify(args) + '\\n');
if (process.env.ORAS_DENIED === 'true') { console.error('403 Forbidden: denied: permission_denied: read_package'); process.exit(1); }
if (args.some((arg) => arg.includes('private'))) process.exit(42);
if (args.includes('--descriptor')) console.log(JSON.stringify({digest:'sha256:'+'c'.repeat(64)}));
else if (args[0] === 'manifest') console.log(JSON.stringify({layers:[{mediaType:'application/vnd.onepersonlab.package.payload.v1+json',digest:'sha256:'+'d'.repeat(64)}]}));
else if (args[0] === 'blob') fs.copyFileSync(process.env.PAYLOAD_FILE, args[args.indexOf('--output')+1]);
else process.exit(43);
`, { mode: 0o755 });
    const summaryFile = path.join(output, 'daily-package-channel-summary.json');
    const log = path.join(root, 'oras.log');
    const runRead = (value: unknown, denied = false) => {
      fs.writeFileSync(summaryFile, JSON.stringify(value));
      fs.writeFileSync(log, '');
      return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', compareScript], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: root,
          ORAS_LOG: log, PAYLOAD_FILE: path.join(root, 'payload.json'), ORAS_DENIED: String(denied),
          GITHUB_OUTPUT: path.join(root, 'github-output'), GITHUB_STEP_SUMMARY: path.join(root, 'step-summary') },
      });
    };
    const success = runRead(summary);
    assert.equal(success.status, 0, success.stdout + success.stderr);
    assert.equal(fs.readFileSync(log, 'utf8').trim().split('\n').length, 3);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'current-owner-channels.json'), 'utf8')).packages, {
      'public-fixture': { status: 'present', digest: `sha256:${'c'.repeat(64)}`, fingerprint: candidate },
    });
    const dispatch = JSON.parse(fs.readFileSync(path.join(output, 'package-publication-dispatch-plan.json'), 'utf8'));
    assert.equal(dispatch.status, 'skipped');
    assert.deepEqual(dispatch.ready_packages, []);
    assert.deepEqual(dispatch.owner_managed_packages, summary.owner_managed_packages);
    const forged = runRead({ ...summary, candidate_fingerprint: { 'private-fixture': candidate } });
    assert.equal(forged.status, 1);
    assert.match(forged.stdout, /private publication belongs to its private owner/);
    assert.equal(fs.readFileSync(log, 'utf8'), '');
    const denied = runRead(summary, true);
    assert.equal(denied.status, 1);
    assert.match(denied.stderr, /permission_denied: read_package/);

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
