import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(repoRoot, 'scripts', 'run-domain-whitepaper.ts');

function runRunner(args: string[]) {
  return spawnSync(process.execPath, [
    '--experimental-strip-types',
    runner,
    ...args,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('domain whitepaper runner exposes only its repo and profile inputs', () => {
  const result = runRunner(['--help']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: node scripts\/run-domain-whitepaper\.ts/);
  assert.match(result.stdout, /--repo-root <path>/);
  assert.match(result.stdout, /--profile <path>/);
  assert.equal(result.stderr, '');
});

test('domain whitepaper runner rejects a profile outside its domain repository', (t) => {
  const domainRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-whitepaper-repo-'));
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-whitepaper-external-'));
  const externalProfile = path.join(externalDir, 'profile.json');
  fs.writeFileSync(externalProfile, '{}\n', 'utf8');
  t.after(() => {
    fs.rmSync(domainRepo, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
  });

  const result = runRunner([
    '--repo-root', domainRepo,
    '--profile', externalProfile,
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Whitepaper profile must be inside repo root/);
});

test('domain whitepaper runner requires non-empty verification terms', (t) => {
  const domainRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-whitepaper-profile-'));
  const profilePath = path.join(domainRepo, 'whitepaper-profile.json');
  fs.writeFileSync(profilePath, `${JSON.stringify({
    sourceMarkdown: 'docs/whitepaper.md',
    outputName: 'domain-whitepaper',
    status: 'domain_whitepaper_ready',
    owner: 'Domain Owner',
    coverLine: 'Domain whitepaper',
    headerTitle: 'Domain Whitepaper',
    requiredTerms: [],
    requiredSections: ['## Summary'],
    minPdfPages: 1,
  })}\n`, 'utf8');
  t.after(() => fs.rmSync(domainRepo, { recursive: true, force: true }));

  const result = runRunner([
    '--repo-root', domainRepo,
    '--profile', path.basename(profilePath),
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Whitepaper profile requires requiredTerms as a non-empty string array/);
});
