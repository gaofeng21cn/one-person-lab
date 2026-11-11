import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import {
  readCapabilityPackageHostContract,
  resolvePackageHostIntegration,
  type PackageHostManifest,
} from '../../src/authority/packages/package-host-integration.ts';
import { normalizePackageManifest } from '../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import {
  getOplPackageSpecs,
  getPublicationAdmittedOplPackageSpecs,
} from '../../src/adapters/integration/package-distribution.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { buildAppUiContributionsProjection } from '../../src/read-models/operator/app-state-ui-contributions.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const manifestRef = 'contracts/opl-framework/packages/opl-link-desktop-connector.json';
const allowlistRef = 'contracts/opl-framework/package-payload-allowlists/opl-link-desktop-connector.json';

function readJson(relativePath: string): Record<string, any> {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

function assertSchema(relativePath: string, payload: unknown) {
  const schema = readJson(relativePath);
  const result = validateJsonSchemaPayload({
    schemaId: String(schema.$id),
    schema,
    sourceRef: relativePath,
  }, payload);
  assert.equal(result.ok, true, result.ok ? '' : JSON.stringify(result.errors));
}

test('OPL Link projection, payload, and allowlist bind one exact owner cohort', () => {
  const manifest = readJson(manifestRef);
  const allowlist = readJson(allowlistRef);
  const payloadRef = path.join(path.dirname(manifestRef), manifest.codex_surface.plugin_payload_manifest_url);
  const payload = readJson(payloadRef);
  const ownerCommit = manifest.codex_surface.carrier_source_commit;
  const contentLockDigest = manifest.content_lock.digest;

  assertSchema('contracts/opl-framework/capability-package-manifest.schema.json', manifest);
  assertSchema('contracts/opl-framework/package-payload-allowlist.schema.json', allowlist);
  assertSchema('contracts/opl-framework/package-payload-manifest-v2.schema.json', payload);

  assert.equal(manifest.package_id, 'opl-link-desktop-connector');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.source_repo, 'https://github.com/gaofeng21cn/opl-link.git');
  assert.equal(manifest.publication_channel_admission, 'admitted');
  assert.equal(manifest.visibility, 'authorized_only');
  assert.equal(manifest.codex_surface.configured_codex_plugin_carrier.publication_ref,
    'ghcr.io/gaofeng21cn/one-person-lab-private-packages/opl-link-desktop-connector:latest-stable');
  assert.match(ownerCommit, /^[0-9a-f]{40}$/);
  assert.match(contentLockDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(manifest.codex_surface.plugin_id, manifest.package_id);
  assert.equal(manifest.codex_surface.interaction_mode, 'headless_internal');
  assert.equal(manifest.codex_surface.carrier_source_commit, ownerCommit);
  assert.equal(manifest.content_lock.digest, contentLockDigest);
  assert.equal(allowlist.package_id, manifest.package_id);
  assert.equal(allowlist.plugin_id, manifest.codex_surface.plugin_id);
  assert.equal(payload.package_id, manifest.package_id);
  assert.equal(payload.plugin_id, manifest.codex_surface.plugin_id);
  assert.equal(payload.package_version, manifest.version);
  assert.equal(payload.source_commit, ownerCommit);
  assert.equal(payload.content_lock.digest, contentLockDigest);

  const contentLockPaths = manifest.content_lock.paths as string[];
  const allowlistPaths = allowlist.paths as string[];
  const payloadPaths = (payload.files as Array<Record<string, string>>).map((entry) => entry.path);
  assert.deepEqual(
    allowlistPaths.filter((entry) => entry !== 'opl-package.json'),
    contentLockPaths,
  );
  assert.deepEqual(payloadPaths, allowlistPaths);
  assert.deepEqual(
    payloadPaths.filter((entry) => !contentLockPaths.includes(entry)),
    ['opl-package.json'],
  );
  assert.equal(new Set(payloadPaths).size, payloadPaths.length);
  assert.equal(
    (payload.files as Array<Record<string, string>>).every((entry) => entry.mode === '100644'),
    true,
  );
});

test('dynamic package discovery admits one remote companion Host contribution and hides absent Package', () => {
  const manifest = readJson(manifestRef);
  const hostManifest = manifest as PackageHostManifest;
  const manifestPath = path.join(repoRoot, manifestRef);
  const normalized = normalizePackageManifest(hostManifest, pathToFileURL(manifestPath).href);
  const specs = getOplPackageSpecs();
  const spec = specs.find((entry) => entry.package_id === manifest.package_id);
  const publicationSpec = getPublicationAdmittedOplPackageSpecs()
    .find((entry) => entry.package_id === manifest.package_id);

  assert.ok(spec);
  assert.ok(publicationSpec);
  assert.equal(spec.publication_channel_admission, 'admitted');
  assert.equal(spec.scope, 'capability_package');
  assert.equal(spec.version, manifest.version);
  assert.equal(spec.repo_url, manifest.source_repo);
  assert.deepEqual(normalized.entrypoints, manifest.entrypoints);
  assert.deepEqual(normalized.capability_provider?.module_export_ids, [
    'opl.link.remote-companion.connector.v1',
  ]);
  assert.deepEqual(normalized.app_contributions, manifest.app_contributions);

  const integration = resolvePackageHostIntegration(hostManifest);
  assert.equal(integration.integration_kind, 'capability_provider');
  const remoteCompanionPoint = readCapabilityPackageHostContract().integration_points.find(
    (point) => point.trigger === 'remote_companion_connector',
  );
  assert.ok(remoteCompanionPoint);
  assert.deepEqual(remoteCompanionPoint.allowed_profiles, ['app-full']);
  assert.deepEqual(remoteCompanionPoint.requirements.required, [{
    service_id: 'opl.connect.remote-companion-connector-host',
    api_versions: ['1.0.0'],
    scope: 'composition',
  }]);

  const available = buildAppUiContributionsProjection({
    [manifest.package_id]: {
      presence: { installed: true },
      capability_exposure: { status: 'enabled' },
      app_contributions: normalized.app_contributions,
    },
  }, { actionRoute: 'opl.connect.remote-companion-connector-host' });
  assert.equal(available.contribution_count, 1);
  assert.equal(available.slots['settings.section'].length, 1);

  const missing = buildAppUiContributionsProjection({});
  assert.equal(missing.contribution_count, 0);
  assert.deepEqual(missing.slots['settings.section'], []);
});

test('remote companion projection keeps credential, conversation, and offline queue surfaces forbidden', () => {
  const manifest = readJson(manifestRef);
  assert.equal(manifest.authority_boundary.credential_injection, 'framework_protected_opaque_blob_only');
  assert.equal(manifest.authority_boundary.persistent_conversation_store_allowed, false);
  assert.equal(manifest.authority_boundary.persistent_task_control_plane_allowed, false);
  assert.equal(manifest.authority_boundary.offline_command_queue_allowed, false);
  assert.equal(manifest.authority_boundary.second_host_allowed, false);
  assert.equal(manifest.authority_boundary.provider_api_key_in_client_allowed, false);
});
