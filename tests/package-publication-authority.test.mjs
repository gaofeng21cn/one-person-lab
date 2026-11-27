import assert from 'node:assert/strict';
import test from 'node:test';
import { validateScheduledPublication } from '../scripts/package-publication-authority.mjs';

test('publisher authority uses the trusted daily commit for v2 and retains immutable v1 selection', () => {
  const callerRepository = 'gaofeng21cn/one-person-lab';
  const workflowSource = '1'.repeat(40);
  const legacySource = '2'.repeat(40);
  const catalogSource = '3'.repeat(40);
  const ownerSource = '4'.repeat(40);
  const oldOwnerSource = '5'.repeat(40);
  const run = { repository: { full_name: callerRepository }, path: '.github/workflows/daily-package-channel.yml',
    head_branch: 'main', head_sha: workflowSource, event: 'schedule', status: 'completed', conclusion: 'success', id: 42 };
  const currentPackage = { package_id: 'demo', source_repo: 'https://github.com/gaofeng21cn/demo.git', version: '1.2.2',
    codex_surface: { carrier_source_commit: oldOwnerSource, plugin_payload_manifest_url: 'payloads/demo-1.2.2.json' },
    v2_release: { version: '1.2.3', source_commit: ownerSource, payload_manifest_ref: 'payloads/demo-1.2.3.json',
      payload_sha256: `sha256:${'6'.repeat(64)}` } };
  const plan = { source_run_id: '42', workflow_source_commit: workflowSource,
    framework_source_commit: legacySource, catalog_source_commit: catalogSource };
  const inputs = { automation_source_run_id: '42', package_id: 'demo', expected_catalog_source_commit: catalogSource,
    expected_package_version: '1.2.3', expected_owner_source_commit: ownerSource,
    expected_framework_source_commit: workflowSource, expected_latest_stable_predecessor: 'none',
    publication_request_id: 'daily-demo-1.2.3' };
  const entry = { ...inputs, package_format: 'v2', owner_tag_status: 'ready', owner_repository: 'gaofeng21cn/demo' };
  assert.equal(validateScheduledPublication({ run, plan: { ...plan, packages: [entry] }, inputs, callerRepository,
    currentPackage }), 'release-stable-automated');
  const wrongTooling = { ...inputs, expected_framework_source_commit: legacySource };
  assert.throws(() => validateScheduledPublication({ run, plan: { ...plan, packages: [{ ...entry, ...wrongTooling }] },
    inputs: wrongTooling, callerRepository, currentPackage }), /current canonical Package release/);

  const legacy = { ...inputs, expected_framework_source_commit: legacySource,
    expected_package_version: '1.2.2', expected_owner_source_commit: oldOwnerSource };
  assert.equal(validateScheduledPublication({ run, plan: { ...plan, packages: [{ ...entry, ...legacy, package_format: 'v1' }] },
    inputs: legacy, callerRepository, currentPackage }), 'release-stable-automated');
  const unfrozenLegacy = { ...legacy, expected_latest_stable_predecessor: 'resolve-authenticated' };
  assert.throws(() => validateScheduledPublication({ run,
    plan: { ...plan, packages: [{ ...entry, ...unfrozenLegacy, package_format: 'v1' }] },
    inputs: unfrozenLegacy, callerRepository, currentPackage }), /current canonical Package release/);
});
