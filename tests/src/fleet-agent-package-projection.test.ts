import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { resolvePackageHostIntegration } from '../../src/authority/packages/package-host-integration.ts';
import { normalizePackageManifest } from '../../src/adapters/integration/agent-package-registry-parts/manifest-normalizers.ts';
import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import { runAppContribution } from '../../src/read-models/operator/app-contribution-broker.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const manifestRef = 'contracts/opl-framework/packages/opl-fleet-agent.json';
const allowlistRef = 'contracts/opl-framework/package-payload-allowlists/opl-fleet-agent.json';
const appContributionsSchemaRefs = [
  'contracts/opl-framework/app-contributions.schema.json',
  'contracts/opl-framework/capability-package-manifest.schema.json',
  'contracts/opl-framework/workflow-profile-package-manifest.schema.json',
  'contracts/opl-framework/agent-package-manifest.schema.json',
] as const;

function readJson(relativePath: string) {
  return parseJsonText(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, any>;
}

function assertSchema(relativePath: string, schemaId: string, payload: unknown) {
  const schema = readJson(relativePath);
  const result = validateJsonSchemaPayload({
    schemaId,
    schema,
    sourceRef: relativePath,
  }, payload);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.errors));
}

function appContributionsSchema(relativePath: string) {
  const schema = readJson(relativePath);
  if (relativePath.endsWith('/app-contributions.schema.json')) return schema;
  return {
    $schema: schema.$schema,
    $defs: schema.$defs,
    $ref: '#/$defs/app_contributions',
  };
}

function validateAppContributionsSchema(relativePath: string, payload: unknown) {
  return validateJsonSchemaPayload({
    schemaId: `${relativePath}#/app_contributions`,
    schema: appContributionsSchema(relativePath),
    sourceRef: relativePath,
  }, payload);
}

function normalizedManifest() {
  const manifestPath = path.join(repoRoot, manifestRef);
  return normalizePackageManifest(readJson(manifestRef), pathToFileURL(manifestPath).href);
}

test('Fleet Agent owner projection is a schema-valid capability Package with one immutable payload', () => {
  const manifest = readJson(manifestRef);
  const allowlist = readJson(allowlistRef);
  const payloadRef = `contracts/opl-framework/packages/${manifest.codex_surface.plugin_payload_manifest_url}`;
  const payload = readJson(payloadRef);

  assertSchema(
    'contracts/opl-framework/capability-package-manifest.schema.json',
    'opl.capability_package_manifest.fleet_agent.v1',
    manifest,
  );
  assertSchema(
    'contracts/opl-framework/package-payload-allowlist.schema.json',
    'opl.package_payload_allowlist.fleet_agent.v1',
    allowlist,
  );
  assertSchema(
    'contracts/opl-framework/package-payload-manifest-v2.schema.json',
    'opl.package_payload_manifest.fleet_agent.v2',
    payload,
  );
  for (const schemaRef of appContributionsSchemaRefs) {
    const result = validateAppContributionsSchema(schemaRef, manifest.app_contributions);
    assert.equal(result.ok, true, result.ok ? undefined : `${schemaRef}: ${JSON.stringify(result.errors)}`);
  }

  assert.equal(manifest.package_id, 'opl-fleet-agent');
  assert.equal(manifest.source, 'first_party');
  assert.equal(manifest.codex_surface.plugin_id, 'opl-fleet-agent');
  assert.equal(manifest.codex_surface.interaction_mode, 'headless_internal');
  assert.deepEqual(manifest.capability_abi, {
    id: 'opl-fleet-agent.capabilities',
    version: '1.0.0',
    compatibility_policy: 'same_major',
  });
  assert.deepEqual(manifest.publication_source, {
    module_id: 'opl-fleet-agent',
    owner_package_manifest_ref: 'plugins/opl-fleet-agent/opl-package.json',
    owner_plugin_manifest_ref: 'plugins/opl-fleet-agent/plugin.json',
  });
  assert.deepEqual(manifest.codex_surface.configured_codex_plugin_carrier, {
    kind: 'codex_plugin_manager',
    plugin_selector: 'opl-fleet-agent@opl-fleet-agent',
    executor_route: 'codex_cli',
    marketplace_source: 'gaofeng21cn/opl-fleet-agent',
    publication_ref: null,
  });
  assert.equal(resolvePackageHostIntegration(manifest as any).integration_kind, 'capability_provider');

  const catalogEntry = normalizedManifest();
  assert.equal(catalogEntry.package_role, 'capability_package');
  assert.equal(catalogEntry.capability_provider?.capability_abi, 'opl-fleet-agent.capabilities');
  assert.deepEqual(catalogEntry.capability_provider?.module_export_ids, [
    'fleet.agent.telemetry.v1',
    'fleet.agent.doctor.v1',
  ]);

  assert.deepEqual(manifest.content_lock.paths, allowlist.paths);
  assert.deepEqual(payload.files.map((entry: any) => entry.path), allowlist.paths);
  assert.equal(payload.content_lock.digest, manifest.content_lock.digest);
  assert.equal(payload.source_commit, manifest.codex_surface.carrier_source_commit);
});

test('App contribution schema mirrors reject unknown view types', () => {
  const invalidContributions = structuredClone(readJson(manifestRef).app_contributions) as Record<string, any>;
  invalidContributions.views[0].view_type = 'unknown_view_type';
  for (const schemaRef of appContributionsSchemaRefs) {
    const result = validateAppContributionsSchema(schemaRef, invalidContributions);
    assert.equal(result.ok, false, `${schemaRef} accepted an unknown view_type`);
  }
});

test('App contribution normalizer rejects unknown view types', () => {
  const manifest = readJson(manifestRef);
  assert.doesNotThrow(() => normalizePackageManifest(manifest, 'framework://opl-fleet-agent.json'));

  const invalidManifest = structuredClone(manifest) as Record<string, any>;
  invalidManifest.app_contributions.views[0].view_type = 'unknown_view_type';
  assert.throws(
    () => normalizePackageManifest(invalidManifest, 'framework://opl-fleet-agent.json'),
    (error: unknown) => error instanceof FrameworkContractError
      && error.code === 'contract_shape_invalid'
      && error.details?.failure_code === 'agent_package_app_contributions_invalid'
      && error.details?.field === 'app_contributions.views[0].view_type',
  );
});

test('Fleet Agent native-provider absence remains a successful unavailable contribution read', () => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-fleet-agent-framework-'));
  const adapterPath = path.join(sourceRoot, 'bin', 'opl-fleet-agent.mjs');
  const manifest = normalizedManifest();
  try {
    fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
    fs.writeFileSync(adapterPath, `import fs from 'node:fs';
const request = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({
  schema_version: 'opl-package-app-contribution-response.v1',
  ok: true,
  operation: request.operation,
  ref: request.ref,
  result: {
    availability: 'unavailable',
    reason_code: 'native_provider_not_installed',
    freshness: { state: 'unavailable', last_observed_at: null, last_known: false },
    node: null,
  },
}));
`);
    const descriptor = {
      manifest,
      sourcePath: sourceRoot,
      enabled: false,
      readiness: {
        installed: true,
        physical_status: 'available',
        callability: 'disabled',
        projection_callability: 'callable',
      },
      carrier_readback: {
        kind: 'codex_plugin',
        identity: 'opl-fleet-agent@fixture',
        lifecycle_authority: 'codex_plugin_manager',
      },
    } as any;

    const output = runAppContribution({
      packageId: 'opl-fleet-agent',
      ref: 'fleet.agent.telemetry.v1#local',
      operation: 'read',
      input: {},
      confirmed: false,
    }, {
      descriptorDiscovery: {
        discover: () => new Map([['opl-fleet-agent', descriptor]]),
      },
    }) as any;

    assert.equal(output.opl_app_contribution.response.operation, 'read');
    assert.equal(output.opl_app_contribution.response.ref, 'fleet.agent.telemetry.v1#local');
    assert.equal(output.opl_app_contribution.response.result.availability, 'unavailable');
    assert.equal(output.opl_app_contribution.response.result.reason_code, 'native_provider_not_installed');
    assert.equal(output.opl_app_contribution.response.result.freshness.state, 'unavailable');
    assert.equal(output.opl_app_contribution.response.result.node, null);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});
