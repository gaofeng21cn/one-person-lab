import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { AnySchema } from 'ajv';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import {
  assertCordisCompositionSnapshot,
  buildCordisCompositionSnapshot,
  buildCordisPluginDescriptor,
  CordisCompositionContractError,
  validateCordisCompositionSnapshot,
  validateCordisPluginDescriptor,
  type CordisPluginDescriptor,
  type CordisPluginDescriptorInput,
} from '../../src/host/plugins/cordis-composition-contract.ts';
import {
  buildCordisAgentExecutorCompositionSnapshot,
  CORDIS_AGENT_EXECUTOR_PLUGIN_DESCRIPTORS,
  CORDIS_FRAMEWORK_INTEGRITY,
} from '../../src/host/plugins/cordis-agent-executor-experiment.ts';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

function descriptor(
  id: string,
  options: Partial<CordisPluginDescriptorInput> = {},
): CordisPluginDescriptor {
  return buildCordisPluginDescriptor({
    plugin_id: id,
    plugin_api_version: '1.0.0',
    source_ref: `src/modules/${id}.ts`,
    source_commit: 'fixture-source-commit',
    package_ref: null,
    required: true,
    provides: [],
    injects: { required: [], optional: [] },
    events: [],
    scope: 'composition',
    trust: 'first_party_privileged',
    disposer: { required: true, boundary: 'plugin_fiber' },
    authority_boundary: { forbidden_authorities: ['package_currentness', 'domain_truth'] },
    ...options,
  });
}

function snapshot(plugins: readonly CordisPluginDescriptor[]) {
  return buildCordisCompositionSnapshot({
    framework: {
      package: '@deepseek-ai/cordis',
      version: '4.0.1',
      integrity: CORDIS_FRAMEWORK_INTEGRITY,
    },
    binding: {
      executor_adapter_id: 'fixture-adapter',
      executor_route: 'opl.runway.executor',
    },
    foundry_evidence_ref: null,
    plugins,
  });
}

function assertTypedFailure(code: CordisCompositionContractError['code'], action: () => unknown) {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof CordisCompositionContractError);
    assert.equal(error.code, code);
    return true;
  });
}

test('Cordis plugin and composition schemas are valid and P2 snapshot is deterministic', () => {
  const pluginSchema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/cordis-plugin-descriptor.schema.json'),
    'utf8',
  )) as AnySchema;
  const snapshotSchema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/cordis-composition-snapshot.schema.json'),
    'utf8',
  )) as AnySchema;
  const p2 = buildCordisAgentExecutorCompositionSnapshot('fixture-adapter');
  assert.equal(validateCordisPluginDescriptor(p2.plugins[0]).ok, true);
  assert.equal(validateCordisCompositionSnapshot(p2).ok, true);
  assert.equal(validateJsonSchemaPayload({
    schemaId: 'opl.cordis_plugin_descriptor.v1',
    schema: pluginSchema,
  }, p2.plugins[0]).ok, true);
  const schemaValidation = validateJsonSchemaPayload({
    schemaId: 'opl.cordis_composition_snapshot.v1',
    schema: {
      ...(snapshotSchema as Record<string, unknown>),
      $defs: {
        plugin: Object.fromEntries(Object.entries(pluginSchema).filter(([key]) => key !== '$id' && key !== '$schema')),
        ...((pluginSchema as { $defs?: Record<string, unknown> }).$defs ?? {}),
      },
    },
  }, p2);
  assert.equal(schemaValidation.ok, true, schemaValidation.ok ? '' : JSON.stringify(schemaValidation.errors));
  assert.equal(p2.framework.package, '@deepseek-ai/cordis');
  assert.equal(p2.plugins.find((entry) => entry.plugin_id.endsWith('service'))?.plugin_api_version, '1.0.0');
  assert.equal(p2.plugins.find((entry) => entry.plugin_id.endsWith('service'))?.injects.required[0]?.service_id, 'opl.runway.executor.adapter');
  assert.equal(p2.plugins.find((entry) => entry.plugin_id.endsWith('service'))?.injects.required[0]?.plugin_api_versions[0], '1.0.0');
  assert.equal(p2.plugins.find((entry) => entry.plugin_id.endsWith('service'))?.required, true);
  assert.equal(p2.plugins.find((entry) => entry.plugin_id.endsWith('observer'))?.required, false);
  assert.match(p2.snapshot_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(p2.snapshot_id, `cordis:snapshot:${p2.snapshot_digest}`);
  assert.deepEqual(p2, buildCordisAgentExecutorCompositionSnapshot('fixture-adapter'));
  assert.equal(Object.isFrozen(p2), true);
  assert.equal(Object.isFrozen(p2.plugins[0]), true);
  assertCordisCompositionSnapshot(p2);
});

test('Cordis composition contract reports required provider and API failures', () => {
  const consumer = descriptor('consumer', {
    injects: {
      required: [{ service_id: 'service.missing', plugin_api_versions: ['1.0.0'] }],
      optional: [],
    },
  });
  assertTypedFailure('missing_required_provider', () => snapshot([consumer]));

  const provider = descriptor('provider', {
    provides: ['service.api'],
    plugin_api_version: '2.0.0',
  });
  const apiConsumer = descriptor('api-consumer', {
    injects: {
      required: [{ service_id: 'service.api', plugin_api_versions: ['1.0.0'] }],
      optional: [],
    },
  });
  assertTypedFailure('plugin_api_incompatible', () => snapshot([provider, apiConsumer]));
});

test('Cordis composition contract reports trust and scope conflicts', () => {
  const untrustedProvider = descriptor('untrusted-provider', {
    provides: ['service.trust'],
    trust: 'third_party_untrusted',
  });
  const restrictedConsumer = descriptor('restricted-consumer', {
    trust: 'first_party_restricted',
    injects: {
      required: [{ service_id: 'service.trust', plugin_api_versions: ['1.0.0'] }],
      optional: [],
    },
  });
  assertTypedFailure('trust_lane_conflict', () => snapshot([untrustedProvider, restrictedConsumer]));

  const requestProvider = descriptor('request-provider', {
    provides: ['service.scope'],
    scope: 'request',
  });
  const compositionConsumer = descriptor('composition-consumer', {
    injects: {
      required: [{ service_id: 'service.scope', plugin_api_versions: ['1.0.0'] }],
      optional: [],
    },
  });
  assertTypedFailure('scope_conflict', () => snapshot([requestProvider, compositionConsumer]));
});

test('Cordis composition contract rejects source and snapshot identity drift', () => {
  const base = descriptor('source-plugin');
  assertTypedFailure('source_identity_mismatch', () => buildCordisPluginDescriptor({
    ...base,
    source_identity: 'git:wrong-commit:src/modules/source-plugin.ts',
  }));
  const built = snapshot([base]);
  assertTypedFailure('snapshot_digest_mismatch', () => assertCordisCompositionSnapshot({
    ...built,
    snapshot_digest: 'sha256:' + '0'.repeat(64),
  }));
});

test('P2 composition exports one Pack-owned descriptor set for all real consumers', () => {
  const snapshotValue = buildCordisAgentExecutorCompositionSnapshot('adapter');
  assert.deepEqual(
    snapshotValue.plugins.map((plugin) => plugin.plugin_id),
    CORDIS_AGENT_EXECUTOR_PLUGIN_DESCRIPTORS.map((plugin) => plugin.plugin_id).sort(),
  );
  assert.equal(snapshotValue.binding.executor_route, 'opl.runway.executor');
  assert.equal(snapshotValue.foundry_evidence_ref, null);
  assert.equal(snapshotValue.plugins.every((plugin) => plugin.disposer.required), true);
});
