import assert from 'node:assert/strict';
import test from 'node:test';
import { validateScheduledPublication } from '../scripts/package-publication-authority.mjs';

test('publisher authority requires trusted daily commit and exact v2 Catalog release', () => {
  const callerRepository = 'gaofeng21cn/one-person-lab';
  const workflowSource = '1'.repeat(40);
  const wrongSource = '2'.repeat(40);
  const catalogSource = '3'.repeat(40);
  const ownerSource = '4'.repeat(40);
  const run = { repository: { full_name: callerRepository }, path: '.github/workflows/daily-package-channel.yml',
    head_branch: 'main', head_sha: workflowSource, event: 'schedule', status: 'completed', conclusion: 'success', id: 42 };
  const currentPackage = { package_id: 'demo', source_repo: 'https://github.com/gaofeng21cn/demo.git', version: '1.2.2',
    v2_release: { version: '1.2.3', source_commit: ownerSource, payload_manifest_ref: 'payloads/demo-1.2.3.json',
      payload_sha256: `sha256:${'6'.repeat(64)}` } };
  const plan = { source_run_id: '42', workflow_source_commit: workflowSource,
    framework_source_commit: workflowSource, catalog_source_commit: catalogSource };
  const inputs = { automation_source_run_id: '42', package_id: 'demo', expected_catalog_source_commit: catalogSource,
    expected_package_version: '1.2.3', expected_owner_source_commit: ownerSource,
    expected_framework_source_commit: workflowSource, expected_latest_stable_predecessor: 'none',
    publication_request_id: 'daily-demo-1.2.3' };
  const entry = { ...inputs, package_format: 'v2', owner_tag_status: 'ready', owner_repository: 'gaofeng21cn/demo' };
  assert.equal(validateScheduledPublication({ run, plan: { ...plan, packages: [entry] }, inputs, callerRepository,
    currentPackage }), 'release-stable-automated');
  const privatePackage = { ...currentPackage, visibility: 'authorized_only' };
  const privateEntry = { ...entry, visibility: 'authorized_only' };
  assert.equal(validateScheduledPublication({ run, plan: { ...plan, packages: [privateEntry] },
    inputs, callerRepository: 'gaofeng21cn/demo', currentPackage: privatePackage }), 'release-stable');
  assert.throws(() => validateScheduledPublication({ run, plan: { ...plan, packages: [privateEntry] },
    inputs, callerRepository, currentPackage: privatePackage }), /access policy/);
  const wrongTooling = { ...inputs, expected_framework_source_commit: wrongSource };
  assert.throws(() => validateScheduledPublication({ run, plan: { ...plan, packages: [{ ...entry, ...wrongTooling }] },
    inputs: wrongTooling, callerRepository, currentPackage }), /current canonical Package release/);
  assert.throws(() => validateScheduledPublication({ run, plan: { ...plan, packages: [{ ...entry, package_format: 'v1' }] },
    inputs, callerRepository, currentPackage }), /current canonical Package release/);
  const missingCatalog = { ...inputs, expected_catalog_source_commit: '' };
  assert.throws(() => validateScheduledPublication({ run,
    plan: { ...plan, catalog_source_commit: '', packages: [{ ...entry, ...missingCatalog }] },
    inputs: missingCatalog, callerRepository, currentPackage }), /current canonical Package release/);
});
