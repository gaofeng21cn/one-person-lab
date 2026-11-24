import { createHash } from 'node:crypto';

import compositionSnapshotSchema from '../../contracts/opl-framework/cordis-composition-snapshot.schema.json' with { type: 'json' };
import pluginDescriptorSchema from '../../contracts/opl-framework/cordis-plugin-descriptor.schema.json' with { type: 'json' };
import { canonicalJsonBytes } from './canonical-json.ts';
import {
  assertJsonSchemaPayload,
  validateJsonSchemaPayload,
  type JsonSchemaRegistryEntry,
} from './schema-registry.ts';

export const CORDIS_FRAMEWORK_PACKAGE = '@deepseek-ai/cordis';
export const CORDIS_FRAMEWORK_VERSION = '4.1.0';
export const CORDIS_FRAMEWORK_INTEGRITY =
  'sha512-CJrjNyBkKn1SfvBQUcgFYKFnLjS+uKrhdMsbHU60xabvi12d+xQ+IQSNlME5Z+B+4Zi6n4BDknKY94tEPeo47w==';

// Cordis exposes fiber.state, while its const enum is erased from ESM output.
export const CORDIS_FIBER_STATE = {
  PENDING: 0,
  ACTIVE: 2,
} as const;

export const CORDIS_ABI_PACKAGE_REF = Object.freeze({
  package_id: '@one-person-lab/cordis-abi',
  package_version: '0.1.0',
  package_ref: 'npm:@one-person-lab/cordis-abi@0.1.0',
});

export const CORDIS_PLUGIN_DESCRIPTOR_VERSION = 'cordis-plugin-descriptor.v1' as const;
export const CORDIS_COMPOSITION_SNAPSHOT_VERSION = 'cordis-composition-snapshot.v1' as const;
export const CORDIS_PLUGIN_DESCRIPTOR_SCHEMA_REF =
  'contracts/opl-framework/cordis-plugin-descriptor.schema.json' as const;
export const CORDIS_COMPOSITION_SNAPSHOT_SCHEMA_REF =
  'contracts/opl-framework/cordis-composition-snapshot.schema.json' as const;

export type CordisCompositionContractErrorCode =
  | 'missing_required_provider'
  | 'plugin_api_incompatible'
  | 'trust_lane_conflict'
  | 'scope_conflict'
  | 'source_identity_mismatch'
  | 'snapshot_digest_mismatch';

export class CordisCompositionContractError extends Error {
  readonly code: CordisCompositionContractErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: CordisCompositionContractErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'CordisCompositionContractError';
    this.code = code;
    this.details = details;
  }
}

export type CordisPluginScope = 'process' | 'composition' | 'session' | 'attempt' | 'request';
export type CordisPluginTrust =
  | 'first_party_privileged'
  | 'first_party_restricted'
  | 'third_party_untrusted';
export type CordisPluginEventMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall' | 'observe';
export type CordisPluginEventRole = 'publish' | 'observe';

export type CordisPluginInjection = {
  readonly service_id: string;
  readonly plugin_api_versions: readonly string[];
};

export type CordisPluginEvent = {
  readonly name: string;
  readonly mode: CordisPluginEventMode;
  readonly role: CordisPluginEventRole;
  readonly payload_schema_ref?: string | null;
};

export type CordisPackageRef = {
  readonly package_id: string;
  readonly package_version: string;
  readonly package_ref: string;
  readonly manifest_sha256?: string;
  readonly content_sha256?: string;
};

export type CordisPluginDescriptor = {
  readonly descriptor_version: typeof CORDIS_PLUGIN_DESCRIPTOR_VERSION;
  readonly id: string;
  readonly plugin_id: string;
  readonly plugin_ref: string;
  readonly plugin_api_version: string;
  readonly source_ref: string;
  readonly source_commit: string;
  readonly source_identity: string;
  readonly package_ref: CordisPackageRef | null;
  readonly required: boolean;
  readonly provides: readonly string[];
  readonly injects: {
    readonly required: readonly CordisPluginInjection[];
    readonly optional: readonly CordisPluginInjection[];
  };
  readonly events: readonly CordisPluginEvent[];
  readonly scope: CordisPluginScope;
  readonly trust: CordisPluginTrust;
  readonly disposer: {
    readonly required: true;
    readonly boundary: 'plugin_fiber' | 'composition_context';
  };
  readonly authority_boundary: {
    readonly forbidden_authorities: readonly string[];
  };
};

export type CordisPluginDescriptorInput = Omit<
  CordisPluginDescriptor,
  'descriptor_version' | 'id' | 'plugin_ref' | 'source_identity'
> & {
  readonly id?: string;
  readonly plugin_ref?: string;
  readonly source_identity?: string;
};

export type CordisCompositionSnapshot = {
  readonly snapshot_version: typeof CORDIS_COMPOSITION_SNAPSHOT_VERSION;
  readonly version: typeof CORDIS_COMPOSITION_SNAPSHOT_VERSION;
  readonly snapshot_id: string;
  readonly snapshot_digest: string;
  readonly framework: {
    readonly package: string;
    readonly version: string;
    readonly integrity: string;
  };
  readonly binding: {
    readonly executor_adapter_id: string;
    readonly executor_route: string;
    readonly child_composition_snapshot_refs?: Readonly<Record<string, {
      readonly snapshot_id: string;
      readonly snapshot_digest: string;
    }>>;
  };
  readonly foundry_evidence_ref?: string | null;
  readonly plugins: readonly CordisPluginDescriptor[];
};

export type CordisCompositionSnapshotInput = Omit<
  CordisCompositionSnapshot,
  'snapshot_version' | 'version' | 'snapshot_id' | 'snapshot_digest' | 'plugins'
> & {
  readonly plugins: readonly (CordisPluginDescriptor | CordisPluginDescriptorInput)[];
};

const pluginSchemaEntry: JsonSchemaRegistryEntry = {
  schemaId: 'opl.cordis_plugin_descriptor.v1',
  schema: pluginDescriptorSchema,
  sourceRef: CORDIS_PLUGIN_DESCRIPTOR_SCHEMA_REF,
};

const embeddedPluginSchema = Object.fromEntries(
  Object.entries(pluginDescriptorSchema).filter(([key]) => key !== '$id' && key !== '$schema'),
);
const snapshotSchemaEntry: JsonSchemaRegistryEntry = {
  schemaId: 'opl.cordis_composition_snapshot.v1',
  schema: {
    ...compositionSnapshotSchema,
    $defs: {
      plugin: embeddedPluginSchema,
      ...((pluginDescriptorSchema as { $defs?: Record<string, unknown> }).$defs ?? {}),
    },
  },
  sourceRef: CORDIS_COMPOSITION_SNAPSHOT_SCHEMA_REF,
};

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

function injectionKey(injection: CordisPluginInjection): string {
  return `${injection.service_id}:${injection.plugin_api_versions.join(',')}`;
}

function normalizeInjections(values: readonly CordisPluginInjection[]): CordisPluginInjection[] {
  return values
    .map((value) => ({
      service_id: value.service_id,
      plugin_api_versions: sortedUnique(value.plugin_api_versions),
    }))
    .sort((left, right) => compareStrings(injectionKey(left), injectionKey(right)));
}

function normalizeEvents(values: readonly CordisPluginEvent[]): CordisPluginEvent[] {
  return values
    .map((event) => ({
      name: event.name,
      mode: event.mode,
      role: event.role,
      ...(event.payload_schema_ref !== undefined
        ? { payload_schema_ref: event.payload_schema_ref }
        : {}),
    }))
    .sort((left, right) => compareStrings(
      `${left.name}:${left.mode}:${left.role}:${left.payload_schema_ref ?? ''}`,
      `${right.name}:${right.mode}:${right.role}:${right.payload_schema_ref ?? ''}`,
    ));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  }
  return value;
}

function pluginRef(pluginId: string, pluginApiVersion: string): string {
  return `cordis:plugin:${pluginId}@${pluginApiVersion}`;
}

function sourceIdentity(sourceRef: string, sourceCommit: string): string {
  return `git:${sourceCommit}:${sourceRef}`;
}

function assertPluginIdentity(descriptor: CordisPluginDescriptor): void {
  if (descriptor.id !== descriptor.plugin_id) {
    throw new CordisCompositionContractError(
      'source_identity_mismatch',
      'Cordis plugin id alias does not match plugin_id.',
      { id: descriptor.id, plugin_id: descriptor.plugin_id },
    );
  }
  const expectedPluginRef = pluginRef(descriptor.plugin_id, descriptor.plugin_api_version);
  if (descriptor.plugin_ref !== expectedPluginRef) {
    throw new CordisCompositionContractError(
      'plugin_api_incompatible',
      'Cordis plugin_ref does not bind the declared plugin API version.',
      { plugin_id: descriptor.plugin_id, expected: expectedPluginRef, actual: descriptor.plugin_ref },
    );
  }
  const expectedSourceIdentity = sourceIdentity(descriptor.source_ref, descriptor.source_commit);
  if (descriptor.source_identity !== expectedSourceIdentity) {
    throw new CordisCompositionContractError(
      'source_identity_mismatch',
      'Cordis source identity does not bind the declared source ref and commit.',
      { plugin_id: descriptor.plugin_id, expected: expectedSourceIdentity, actual: descriptor.source_identity },
    );
  }
}

export function buildCordisPluginDescriptor(
  input: CordisPluginDescriptorInput | CordisPluginDescriptor,
): CordisPluginDescriptor {
  const descriptor: CordisPluginDescriptor = {
    descriptor_version: CORDIS_PLUGIN_DESCRIPTOR_VERSION,
    id: input.id ?? input.plugin_id,
    plugin_id: input.plugin_id,
    plugin_ref: input.plugin_ref ?? pluginRef(input.plugin_id, input.plugin_api_version),
    plugin_api_version: input.plugin_api_version,
    source_ref: input.source_ref,
    source_commit: input.source_commit,
    source_identity: input.source_identity ?? sourceIdentity(input.source_ref, input.source_commit),
    package_ref: input.package_ref ? { ...input.package_ref } : null,
    required: input.required,
    provides: sortedUnique(input.provides),
    injects: {
      required: normalizeInjections(input.injects.required),
      optional: normalizeInjections(input.injects.optional),
    },
    events: normalizeEvents(input.events),
    scope: input.scope,
    trust: input.trust,
    disposer: { ...input.disposer },
    authority_boundary: {
      forbidden_authorities: sortedUnique(input.authority_boundary.forbidden_authorities),
    },
  };
  assertJsonSchemaPayload(pluginSchemaEntry, descriptor);
  assertPluginIdentity(descriptor);
  return deepFreeze(descriptor);
}

export function assertCordisPluginDescriptor(payload: unknown): asserts payload is CordisPluginDescriptor {
  assertJsonSchemaPayload(pluginSchemaEntry, payload);
  assertPluginIdentity(payload as CordisPluginDescriptor);
}

const scopeRank: Readonly<Record<CordisPluginScope, number>> = {
  request: 0,
  attempt: 1,
  session: 2,
  composition: 3,
  process: 4,
};
const trustRank: Readonly<Record<CordisPluginTrust, number>> = {
  third_party_untrusted: 0,
  first_party_restricted: 1,
  first_party_privileged: 2,
};

function validateInjection(
  consumer: CordisPluginDescriptor,
  injection: CordisPluginInjection,
  provider: CordisPluginDescriptor | undefined,
  required: boolean,
): void {
  if (!provider) {
    if (!required) return;
    throw new CordisCompositionContractError(
      'missing_required_provider',
      'Cordis composition is missing a required service provider.',
      { plugin_id: consumer.plugin_id, service_id: injection.service_id },
    );
  }
  if (!injection.plugin_api_versions.includes(provider.plugin_api_version)) {
    throw new CordisCompositionContractError(
      'plugin_api_incompatible',
      'Cordis provider plugin API version is incompatible with the consumer.',
      {
        plugin_id: consumer.plugin_id,
        service_id: injection.service_id,
        provider_plugin_id: provider.plugin_id,
        provider_plugin_api_version: provider.plugin_api_version,
        compatible_plugin_api_versions: injection.plugin_api_versions,
      },
    );
  }
  if (trustRank[provider.trust] < trustRank[consumer.trust]) {
    throw new CordisCompositionContractError(
      'trust_lane_conflict',
      'Cordis provider trust lane is weaker than its consumer.',
      { plugin_id: consumer.plugin_id, provider_plugin_id: provider.plugin_id },
    );
  }
  if (scopeRank[provider.scope] < scopeRank[consumer.scope]) {
    throw new CordisCompositionContractError(
      'scope_conflict',
      'Cordis provider scope is shorter lived than its consumer.',
      { plugin_id: consumer.plugin_id, provider_plugin_id: provider.plugin_id },
    );
  }
}

function validateCompositionPlugins(plugins: readonly CordisPluginDescriptor[]): void {
  const pluginIds = new Set<string>();
  const providers = new Map<string, CordisPluginDescriptor>();
  for (const plugin of plugins) {
    assertPluginIdentity(plugin);
    if (pluginIds.has(plugin.plugin_id)) {
      throw new CordisCompositionContractError(
        'source_identity_mismatch',
        'Cordis composition contains duplicate plugin identities.',
        { plugin_id: plugin.plugin_id },
      );
    }
    pluginIds.add(plugin.plugin_id);
    for (const serviceId of plugin.provides) {
      const existing = providers.get(serviceId);
      if (existing) {
        throw new CordisCompositionContractError(
          'source_identity_mismatch',
          'Cordis composition binds more than one provider to a service.',
          { service_id: serviceId, plugin_ids: [existing.plugin_id, plugin.plugin_id] },
        );
      }
      providers.set(serviceId, plugin);
    }
  }
  for (const plugin of plugins) {
    for (const injection of plugin.injects.required) {
      validateInjection(plugin, injection, providers.get(injection.service_id), true);
    }
    for (const injection of plugin.injects.optional) {
      validateInjection(plugin, injection, providers.get(injection.service_id), false);
    }
  }
}

function snapshotDigest(unsignedSnapshot: Omit<CordisCompositionSnapshot, 'snapshot_id' | 'snapshot_digest'>): string {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(unsignedSnapshot)).digest('hex')}`;
}

function unsignedSnapshot(snapshot: CordisCompositionSnapshot) {
  const { snapshot_id: _snapshotId, snapshot_digest: _snapshotDigest, ...unsigned } = snapshot;
  return unsigned;
}

export function buildCordisCompositionSnapshot(
  input: CordisCompositionSnapshotInput,
): CordisCompositionSnapshot {
  const plugins = input.plugins
    .map((plugin) => buildCordisPluginDescriptor(plugin))
    .sort((left, right) => compareStrings(left.plugin_id, right.plugin_id));
  validateCompositionPlugins(plugins);
  const unsigned = {
    snapshot_version: CORDIS_COMPOSITION_SNAPSHOT_VERSION,
    version: CORDIS_COMPOSITION_SNAPSHOT_VERSION,
    framework: { ...input.framework },
    binding: { ...input.binding },
    ...(input.foundry_evidence_ref !== undefined
      ? { foundry_evidence_ref: input.foundry_evidence_ref }
      : {}),
    plugins,
  };
  const digest = snapshotDigest(unsigned);
  const snapshot: CordisCompositionSnapshot = {
    ...unsigned,
    snapshot_id: `cordis:snapshot:${digest}`,
    snapshot_digest: digest,
  };
  assertJsonSchemaPayload(snapshotSchemaEntry, snapshot);
  return deepFreeze(snapshot);
}

export function assertCordisCompositionSnapshot(payload: unknown): asserts payload is CordisCompositionSnapshot {
  assertJsonSchemaPayload(snapshotSchemaEntry, payload);
  const snapshot = payload as CordisCompositionSnapshot;
  const plugins = snapshot.plugins.map((plugin) => buildCordisPluginDescriptor(plugin));
  validateCompositionPlugins(plugins);
  const actualDigest = snapshotDigest(unsignedSnapshot(snapshot));
  const actualId = `cordis:snapshot:${actualDigest}`;
  if (snapshot.snapshot_digest !== actualDigest || snapshot.snapshot_id !== actualId) {
    throw new CordisCompositionContractError(
      'snapshot_digest_mismatch',
      'Cordis composition snapshot digest does not match its canonical payload.',
      {
        expected_snapshot_digest: actualDigest,
        actual_snapshot_digest: snapshot.snapshot_digest,
        expected_snapshot_id: actualId,
        actual_snapshot_id: snapshot.snapshot_id,
      },
    );
  }
}

export function validateCordisPluginDescriptor(payload: unknown) {
  return validateJsonSchemaPayload(pluginSchemaEntry, payload);
}

export function validateCordisCompositionSnapshot(payload: unknown) {
  return validateJsonSchemaPayload(snapshotSchemaEntry, payload);
}

export const OPL_CLIENT_GRAPH_VERSION = 'opl-host-derived-client-graph.v1' as const;

export type OplClientContribution = Readonly<{
  contribution_id: string;
  package_id: string;
  package_version: string;
  client_entry: string;
  client_integrity: string;
  injects: readonly string[];
  provides: readonly string[];
  slots: readonly string[];
  actions: readonly string[];
  trust: 'first_party';
}>;

export type OplHostDerivedClientGraph = Readonly<{
  version: typeof OPL_CLIENT_GRAPH_VERSION;
  profile_id: string;
  host_snapshot_id: string;
  graph_digest: string;
  contributions: readonly OplClientContribution[];
  authority_boundary: Readonly<{
    graph_owner: 'framework_host';
    product_profile_owner: 'opl_app';
    client_discovery: false;
    client_package_install: false;
    client_package_currentness: false;
    client_product_truth: false;
  }>;
}>;

export function buildHostDerivedClientGraph(input: {
  profile_id: string;
  host_snapshot_id: string;
  contributions: readonly OplClientContribution[];
}): OplHostDerivedClientGraph {
  const contributions = [...input.contributions]
    .map((entry) => Object.freeze({
      ...entry,
      injects: [...entry.injects].sort(),
      provides: [...entry.provides].sort(),
      slots: [...entry.slots].sort(),
      actions: [...entry.actions].sort(),
    }))
    .sort((left, right) => left.contribution_id.localeCompare(right.contribution_id));
  const unsigned = {
    version: OPL_CLIENT_GRAPH_VERSION,
    profile_id: input.profile_id,
    host_snapshot_id: input.host_snapshot_id,
    contributions,
    authority_boundary: {
      graph_owner: 'framework_host' as const,
      product_profile_owner: 'opl_app' as const,
      client_discovery: false as const,
      client_package_install: false as const,
      client_package_currentness: false as const,
      client_product_truth: false as const,
    },
  };
  const graph_digest = `sha256:${createHash('sha256').update(canonicalJsonBytes(unsigned)).digest('hex')}`;
  return Object.freeze({ ...unsigned, graph_digest });
}
