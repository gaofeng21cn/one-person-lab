import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(repoRoot, 'scripts', 'run-domain-whitepaper.ts');
const fixtureProfile = path.join(repoRoot, 'tests', 'fixtures', 'domain-whitepaper', 'whitepaper_profile.json');

function runRunner(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['--experimental-strip-types', runner, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function makeDomainRepo(t: TestContext) {
  const domainRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-whitepaper-'));
  const binDir = path.join(domainRepo, 'bin');
  fs.mkdirSync(path.join(domainRepo, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(domainRepo, 'docs', 'whitepapers'), { recursive: true });
  fs.mkdirSync(path.join(domainRepo, 'assets', 'branding'), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.copyFileSync(fixtureProfile, path.join(domainRepo, 'contracts', 'whitepaper_profile.json'));
  fs.writeFileSync(path.join(domainRepo, 'assets', 'branding', 'domain-journey.png'), 'image fixture\n');
  fs.writeFileSync(path.join(domainRepo, 'docs', 'whitepapers', 'domain-whitepaper.md'), [
    '# Domain Whitepaper',
    '',
    '> A generic domain profile rendered by OPL.',
    '',
    '发布日期：2026-07-11',
    '',
    '核心判断：The shared renderer owns delivery mechanics.',
    '',
    '## Summary',
    '',
    'One Person Lab keeps domain truth in the domain repository.',
    '',
    '![Domain journey](../../assets/branding/domain-journey.png)',
    '',
  ].join('\n'));
  writeCommand(binDir, 'pandoc', [
    '#!/bin/sh',
    'output=""',
    'title_block=""',
    'resource_path=""',
    'while [ "$#" -gt 0 ]; do',
    '  if [ "$1" = "-o" ]; then output="$2"; shift; fi',
    '  if [ "$1" = "--metadata" ] && [ "${2#title=}" != "$2" ]; then title_block="yes"; fi',
    '  if [ "$1" = "--resource-path" ]; then resource_path="$2"; shift; fi',
    '  shift',
    'done',
    'case "$resource_path" in',
    '  *"$PWD/docs/whitepapers"*) ;;',
    '  *) printf "missing source Markdown resource path\\n" >&2; exit 2 ;;',
    'esac',
    'mkdir -p "$(dirname "$output")"',
    'if [ "${output##*.}" = "html" ]; then',
    '  if [ -n "$title_block" ]; then printf "<header id=\\"title-block-header\\"><h1>Domain Whitepaper</h1></header>" > "$output"; fi',
    '  printf "<h1>Domain Whitepaper</h1>\\n" >> "$output"',
    'else',
    '  printf "rendered\\n" > "$output"',
    'fi',
  ].join('\n'));
  writeCommand(binDir, 'pdfinfo', '#!/bin/sh\nprintf "Pages: 1\\nPage size: 595 x 842 pts\\n"\n');
  writeCommand(binDir, 'pdftoppm', [
    '#!/bin/sh',
    'if [ "$1" = "-v" ]; then printf "pdftoppm test version\\n" >&2; exit 0; fi',
    'for value; do output="$value"; done',
    'printf "page\\n" > "${output}-1.png"',
  ].join('\n'));
  writeCommand(binDir, 'pdftotext', '#!/bin/sh\nprintf "Domain Whitepaper\\nThe shared renderer owns delivery mechanics.\\n"\n');
  t.after(() => fs.rmSync(domainRepo, { recursive: true, force: true }));
  return { domainRepo, binDir };
}

function writeCommand(binDir: string, name: string, body: string) {
  const commandPath = path.join(binDir, name);
  fs.writeFileSync(commandPath, `${body}\n`, { mode: 0o755 });
}

function fingerprint(filePath: string) {
  const bytes = fs.readFileSync(filePath);
  return {
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    size: bytes.byteLength,
  };
}

function assertBoundFile(
  domainRepo: string,
  verification: Record<string, unknown>,
  field: 'source_profile' | 'source_markdown' | 'generated_markdown' | 'generated_html' | 'generated_pdf',
) {
  const relativePath = verification[field];
  assert.equal(typeof relativePath, 'string');
  const actual = fingerprint(path.join(domainRepo, relativePath as string));
  assert.equal(verification[`${field}_sha256`], actual.sha256);
  assert.equal(verification[`${field}_size`], actual.size);
}

test('domain whitepaper runner renders a generic domain profile through the shared builder', (t) => {
  const { domainRepo, binDir } = makeDomainRepo(t);
  const result = runRunner([
    '--repo-root', domainRepo,
    '--profile', 'contracts/whitepaper_profile.json',
  ], { PATH: `${binDir}:${process.env.PATH ?? ''}` });

  assert.equal(result.status, 0, result.stderr);
  const verification = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(verification.schema_version, 'opl_whitepaper_artifact_verification.v2');
  assert.equal(verification.status, 'whitepaper_artifact_verified');
  assert.equal(verification.pdf_pages, 1);
  assert.equal(verification.source_profile, 'contracts/whitepaper_profile.json');
  for (const field of ['source_profile', 'source_markdown', 'generated_markdown', 'generated_html', 'generated_pdf'] as const) {
    assertBoundFile(domainRepo, verification, field);
  }
  const renderedPageHashes = verification.rendered_page_hashes as Array<Record<string, unknown>>;
  assert.equal(renderedPageHashes.length, 1);
  const renderedPage = path.join(domainRepo, verification.rendered_dir as string, renderedPageHashes[0].page as string);
  assert.deepEqual(
    { sha256: renderedPageHashes[0].sha256, size: renderedPageHashes[0].size },
    fingerprint(renderedPage),
  );
  const verificationPath = path.join(domainRepo, 'docs', 'site', 'latest', 'whitepapers', 'domain-whitepaper.verification.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(verificationPath, 'utf8')), verification);
  const html = fs.readFileSync(path.join(domainRepo, verification.generated_html as string), 'utf8');
  assert.doesNotMatch(html, /title-block-header/);
  assert.equal(html.match(/<h1/g)?.length, 1);
});

test('domain whitepaper runner binds verification to profile bytes', (t) => {
  const { domainRepo, binDir } = makeDomainRepo(t);
  const args = ['--repo-root', domainRepo, '--profile', 'contracts/whitepaper_profile.json'];
  const env = { PATH: `${binDir}:${process.env.PATH ?? ''}` };
  const first = runRunner(args, env);
  assert.equal(first.status, 0, first.stderr);
  const firstVerification = JSON.parse(first.stdout) as Record<string, unknown>;

  const profilePath = path.join(domainRepo, 'contracts', 'whitepaper_profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Record<string, unknown>;
  profile.coverLine = 'Updated generic domain delivery profile';
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  const second = runRunner(args, env);
  assert.equal(second.status, 0, second.stderr);
  const secondVerification = JSON.parse(second.stdout) as Record<string, unknown>;

  assert.notEqual(secondVerification.source_profile_sha256, firstVerification.source_profile_sha256);
  assertBoundFile(domainRepo, secondVerification, 'source_profile');
});

test('domain whitepaper runner rejects malformed profile JSON before rendering', (t) => {
  const { domainRepo } = makeDomainRepo(t);
  fs.writeFileSync(path.join(domainRepo, 'contracts', 'whitepaper_profile.json'), '{invalid json\n');

  const result = runRunner([
    '--repo-root', domainRepo,
    '--profile', 'contracts/whitepaper_profile.json',
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Whitepaper profile must be valid JSON/);
});

test('domain whitepaper runner rejects an invalid maximum page policy', (t) => {
  const { domainRepo } = makeDomainRepo(t);
  const profilePath = path.join(domainRepo, 'contracts', 'whitepaper_profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Record<string, unknown>;
  profile.maxPdfPages = 0;
  fs.writeFileSync(profilePath, `${JSON.stringify(profile)}\n`);

  const result = runRunner([
    '--repo-root', domainRepo,
    '--profile', 'contracts/whitepaper_profile.json',
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Whitepaper profile requires positive integer maxPdfPages/);
});
