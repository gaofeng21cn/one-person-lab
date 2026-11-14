import assert from 'node:assert/strict';
import test from 'node:test';
import { validateScheduledPublication, publicationRequestId } from '../../../../scripts/package-publication-authority.mjs';
import { buildPlan } from '../../../../scripts/package-owner-channel-plan.mjs';

const commit = 'a'.repeat(40);
const source = 'b'.repeat(40);
function fixture() {
  const inputs = { automation_source_run_id: '123', package_id: 'fixture', expected_package_version: '1.2.3',
    expected_owner_source_commit: source, expected_framework_source_commit: commit,
    expected_latest_stable_predecessor: 'none', publication_request_id: 'daily-fixture-1.2.3-' + source };
  return { inputs, callerRepository: 'gaofeng21cn/one-person-lab',
    currentPackage: { package_id: 'fixture', version: '1.2.3', visibility: 'public',
      source_repo: 'https://github.com/example/fixture.git', codex_surface: { carrier_source_commit: source } },
    run: { id: 123, repository: { full_name: 'gaofeng21cn/one-person-lab' },
      path: '.github/workflows/daily-package-channel.yml', head_branch: 'main', head_sha: commit,
      event: 'schedule', status: 'completed', conclusion: 'success' },
    plan: { source_run_id: '123', workflow_source_commit: commit, framework_source_commit: commit,
      packages: [{ ...inputs, owner_tag_status: 'ready', owner_repository: 'example/fixture', visibility: 'public' }] } };
}

test('automatic approval requires the same trusted run, exact release inputs, and correct publisher', () => {
  assert.equal(validateScheduledPublication(fixture()), 'release-stable-automated');
  for (const mutate of [
    (f: any) => { f.run.head_branch = 'pull-request'; },
    (f: any) => { f.run.path = '.github/workflows/unrelated.yml'; },
    (f: any) => { f.run.repository.full_name = 'attacker/fork'; },
    (f: any) => { f.run.conclusion = 'failure'; },
    (f: any) => { f.inputs.expected_owner_source_commit = 'c'.repeat(40); },
    (f: any) => { f.inputs.expected_latest_stable_predecessor = 'different'; },
    (f: any) => { f.inputs.expected_framework_source_commit = 'c'.repeat(40); },
    (f: any) => { f.plan.source_run_id = '124'; },
    (f: any) => { f.currentPackage.version = '1.2.4'; },
    (f: any) => { f.callerRepository = 'example/fixture'; },
    (f: any) => { f.plan.packages.push(f.plan.packages[0]); },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateScheduledPublication(value));
  }
});

test('private publication uses the private owner identity with the same daily proof', () => {
  const value = fixture();
  value.plan.packages[0].visibility = 'authorized_only';
  value.currentPackage.visibility = 'authorized_only';
  assert.throws(() => validateScheduledPublication(value));
  value.callerRepository = 'example/fixture';
  assert.equal(validateScheduledPublication(value), 'release-stable');
});

test('a generated projection may advance main after the workflow started without changing workflow provenance', () => {
  const value = fixture();
  value.plan.framework_source_commit = 'd'.repeat(40);
  value.inputs.expected_framework_source_commit = 'd'.repeat(40);
  assert.equal(validateScheduledPublication(value), 'release-stable-automated');
});

test('release identity remains stable across daily runs', () => {
  const fingerprint = { package_version: '1.2.3', owner_source_commit: source };
  assert.equal(publicationRequestId('fixture', fingerprint), publicationRequestId('fixture', { ...fingerprint }));
  assert.notEqual(publicationRequestId('fixture', fingerprint), publicationRequestId('fixture', { ...fingerprint, package_version: '1.2.4' }));
});

test('a conflicting Package does not stop an independent valid publication', () => {
  const fingerprint = (version: string, content: string) => ({ package_version: version,
    package_content_digest: 'sha256:' + content.repeat(64), owner_source_commit: source });
  const present = (version: string) => ({ status: 'present', digest: 'sha256:' + 'e'.repeat(64), fingerprint: fingerprint(version, 'e') });
  const plan = buildPlan({ candidate_fingerprint: { good: fingerprint('1.2.4', 'a'), conflict: fingerprint('1.2.3', 'b') } },
    { packages: { good: present('1.2.3'), conflict: present('1.2.3') } });
  assert.equal(plan.status, 'partially_blocked');
  assert.equal(plan.publish_required, true);
  assert.deepEqual(plan.changed_packages, ['good']);
  assert.equal(plan.violations[0].package_id, 'conflict');
});

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
test('daily owner and channel boundaries preserve bytes, version scope, permission denial, and deduplication', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  execFileSync('python3', ['tests/package_release_test.py'], { cwd: root, stdio: 'pipe' });
});
