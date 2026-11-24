import { createHash } from 'node:crypto';

import capabilityPackageHostContract from '../../../contracts/opl-framework/capability-package-host-contract.json' with { type: 'json' };
import hostContextSchema from '../../../contracts/opl-framework/package-host-context.schema.json' with { type: 'json' };
import hostIntegrationSchema from '../../../contracts/opl-framework/package-host-integration.schema.json' with { type: 'json' };
import standardAgentHostContract from '../../../contracts/opl-framework/standard-agent-host-contract.json' with { type: 'json' };
import workflowProfileHostContract from '../../../contracts/opl-framework/workflow-profile-host-contract.json' with { type: 'json' };
import { canonicalJsonBytes } from '../../kernel/canonical-json.ts';
import {
  assertCordisCompositionSnapshot,
  type CordisCompositionSnapshot,
  type CordisPluginDescriptor,
  type CordisPluginScope,
} from '../../kernel/cordis-abi.ts';
import {
  assertJsonSchemaPayload,
  validateJsonSchemaPayload,
  type JsonSchemaRegistryEntry,
} from '../../kernel/schema-registry.ts';

export const PACKAGE_HOST_INTEGRATION_SCHEMA_REF =
  'contracts/opl-framework/package-host-integration.schema.json' as const;
export const PACKAGE_HOST_CONTEXT_SCHEMA_REF =
  'contracts/opl-framework/package-host-context.schema.json' as const;
export const STANDARD_AGENT_HOST_CONTRACT_REF =
  'contracts/opl-framework/standard-agent-host-contract.json' as const;
export const CAPABILITY_PACKAGE_HOST_CONTRACT_REF =
  'contracts/opl-framework/capability-package-host-contract.json' as const;
export const WORKFLOW_PROFILE_HOST_CONTRACT_REF =
  'contracts/opl-framework/workflow-profile-host-contract.json' as const;

export type PackageHostIntegrationKind =
  | 'standard_agent_runtime'
  | 'capability_provider'
  | 'remote_companion_connector'
  | 'host_client'
  | 'workflow_profile_source';

export type PackageHostIntegrationTrigger =
  | 'handler_ref'
  | 'stage_binding'
  | 'foundry_binding'
  | 'app_contribution'
  | 'channel_provider'
  | 'remote_companion_connector'
  | 'profile_materialization'
  | 'descriptor_discovery';

export type PackageHostCapabilityRequirement = Readonly<{
  service_id: string;
  api_versions: readonly string[];
  scope: CordisPluginScope;
}>;

export type PackageHostIntegrationPoint = Readonly<{
  integration_id: string;
  trigger: PackageHostIntegrationTrigger;
  allowed_profiles: readonly PackageHostProfileId[];
  requirements: Readonly<{
    required: readonly PackageHostCapabilityRequirement[];
    optional: readonly PackageHostCapabilityRequirement[];
  }>;
  failure_policy: Readonly<{
    required_missing: 'reject_launch';
    optional_missing: 'diagnostic_only';
  }>;
}>;

export type PackageHostChannelProviderContract = Readonly<{
  host_service_id: 'opl.connect.channel-provider-host';
  callback_api_version: '1.0.0';
  activation: 'optional_shell_injected';
  provider_source: 'installed_descriptor_entrypoint';
  provider_identity: 'manifest_package_id';
  thread_binding_fields: readonly ['provider_id', 'account_id', 'channel_session_id'];
  thread_ref_fields: readonly ['canonical_thread_host', 'canonical_thread_id'];
  turn_ref_field: 'canonical_turn_id';
  methods: readonly ['startThread', 'resumeThread', 'startTurn', 'subscribeTurn'];
  terminal_statuses: readonly ['completed', 'failed', 'cancelled'];
  subscription_lifecycle: 'disposable';
  transport_boundary: 'current_shell_codex_app_server_only';
  channel_access_controller: 'optional_descriptor_bound';
  channel_access_methods: readonly ['readChannelAccess', 'executeChannelAccessAction'];
  forbidden_surfaces: readonly [
    'unrestricted_json_rpc',
    'second_app_server',
    'secret_persistence',
    'session_persistence',
    'thread_persistence',
  ];
}>;

export type PackageHostRemoteCompanionConnectorContract = Readonly<{
  host_service_id: 'opl.connect.remote-companion-connector-host';
  callback_api_version: '1.0.0';
  activation: 'optional_shell_injected';
  connector_source: 'installed_descriptor_entrypoint';
  connector_identity: 'manifest_package_id';
  conversation_methods: readonly [
    'listDirectory',
    'readHistory',
    'startConversation',
    'openConversation',
    'sendMessage',
    'subscribeEvents',
    'stopTurn',
    'respondApproval',
    'refresh',
  ];
  protected_blob_port: 'package_scoped_opaque_uint8array';
  protected_blob_max_bytes: 262144;
  protected_blob_methods: readonly ['read', 'replace', 'clear'];
  connector_factory: 'zero_argument_synchronous';
  connector_start_fields: readonly [
    'activation_context',
    'canonical_conversation_bridge',
    'protected_blob',
  ];
  activation_context_fields: readonly [
    'environment',
    'cohort_id',
    'protocol_version',
    'provider',
    'service_origin',
    'config_digest',
    'package_content_digest',
    'package_artifact_digest',
  ];
  remote_companion_access_controller: 'optional_descriptor_bound';
  remote_companion_access_methods: readonly [
    'readRemoteCompanionAccess',
    'executeRemoteCompanionAction',
  ];
  forbidden_surfaces: readonly [
    'second_cordis_host',
    'second_app_server',
    'provider_history_as_conversation_truth',
    'conversation_history_persistence',
    'credential_material_persistence',
    'unrestricted_json_rpc',
  ];
}>;

export type PackageHostIntegration = Readonly<{
  surface_kind: 'opl_package_host_integration.v1';
  integration_kind: PackageHostIntegrationKind;
  standalone_policy: 'forbidden' | 'allowed' | 'descriptor_only';
  integration_points: readonly PackageHostIntegrationPoint[];
  composition_policy: Readonly<{
    freeze: 'composition_start' | 'invocation_start' | 'attempt_start';
    hot_swap: false;
    teardown_owner: 'opl_host' | 'package';
  }>;
  channel_provider?: PackageHostChannelProviderContract;
  remote_companion_connector?: PackageHostRemoteCompanionConnectorContract;
  authority_boundary: Readonly<{
    forbidden_authorities: readonly string[];
  }>;
}>;

export type PackageHostProfileId = 'base-headless' | 'app-full' | 'foundry-dev';

export const CHANNEL_THREAD_CALLBACK_API_VERSION = '1.0.0' as const;
export const CHANNEL_PROVIDER_HOST_SERVICE_ID = 'opl.connect.channel-provider-host' as const;

export type ChannelConversationIdentity = Readonly<{
  provider_id: string;
  account_id: string;
  channel_session_id: string;
}>;

export type ChannelThreadRef = Readonly<{
  canonical_thread_host: string;
  canonical_thread_id: string;
}>;

export type ChannelTurnRef = ChannelThreadRef & Readonly<{
  canonical_turn_id: string;
}>;

export type ChannelTurnTerminalEvent = ChannelTurnRef & (
  | Readonly<{
    status: 'completed';
    response_text: string;
  }>
  | Readonly<{
    status: 'failed';
    error: Readonly<{
      code: string;
      message: string;
    }>;
  }>
  | Readonly<{
    status: 'cancelled';
  }>
);

export type ChannelTurnTerminalObserver = Readonly<{
  onTerminal(event: ChannelTurnTerminalEvent): void | Promise<void>;
}>;

export type ChannelDisposable = Readonly<{
  dispose(): void | Promise<void>;
}>;

export type ChannelThreadCallback = Readonly<{
  startThread(input: ChannelConversationIdentity): Promise<ChannelThreadRef>;
  resumeThread(input: ChannelThreadRef): Promise<void>;
  startTurn(input: ChannelThreadRef & Readonly<{ text: string }>): Promise<ChannelTurnRef>;
  subscribeTurn(input: ChannelTurnRef, observer: ChannelTurnTerminalObserver): ChannelDisposable;
}>;

export type ChannelAccessController = Readonly<{
  data_ref: string;
  action_refs: readonly string[];
  read(input: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
  execute(input: Readonly<{
    action_ref: string;
    input: Readonly<Record<string, unknown>>;
  }>): unknown | Promise<unknown>;
}>;

export type ChannelProvider = Readonly<{
  provider_id: string;
  channel_access?: ChannelAccessController;
  start(input: Readonly<{
    callback_api_version: typeof CHANNEL_THREAD_CALLBACK_API_VERSION;
    callback: ChannelThreadCallback;
  }>): ChannelDisposable | Promise<ChannelDisposable>;
}>;

function hasMethod(value: unknown, method: string): boolean {
  return Boolean(value && typeof value === 'object'
    && typeof (value as Record<string, unknown>)[method] === 'function');
}

export function assertChannelThreadCallback(
  value: unknown,
): asserts value is ChannelThreadCallback {
  for (const method of ['startThread', 'resumeThread', 'startTurn', 'subscribeTurn']) {
    if (!hasMethod(value, method)) {
      throw new TypeError(`Channel thread callback requires ${method}().`);
    }
  }
}

export function assertChannelDisposable(value: unknown): asserts value is ChannelDisposable {
  if (!hasMethod(value, 'dispose')) {
    throw new TypeError('Channel provider lifecycle requires a Disposable.');
  }
}

export function assertChannelProvider(value: unknown): asserts value is ChannelProvider {
  const providerId = value && typeof value === 'object'
    ? (value as Record<string, unknown>).provider_id
    : null;
  if (typeof providerId !== 'string' || !/^[a-z][a-z0-9._-]*$/.test(providerId)) {
    throw new TypeError('Channel provider requires a stable provider_id.');
  }
  if (!hasMethod(value, 'start')) {
    throw new TypeError(`Channel provider ${providerId} requires start().`);
  }
  const controller = (value as Record<string, unknown>).channel_access;
  if (controller === undefined) return;
  if (!controller || typeof controller !== 'object') {
    throw new TypeError('Channel provider channel_access controller must be an object.');
  }
  if (
    typeof (controller as Record<string, unknown>).data_ref !== 'string'
    || ((controller as Record<string, unknown>).data_ref as string).length === 0
  ) {
    throw new TypeError('Channel provider channel_access controller requires data_ref.');
  }
  const actionRefs = (controller as Record<string, unknown>).action_refs;
  if (
    !Array.isArray(actionRefs)
    || actionRefs.length === 0
    || actionRefs.some((ref) => typeof ref !== 'string' || ref.length === 0)
    || new Set(actionRefs).size !== actionRefs.length
  ) {
    throw new TypeError('Channel provider channel_access controller requires unique action_refs.');
  }
  for (const method of ['read', 'execute']) {
    if (!hasMethod(controller, method)) {
      throw new TypeError(`Channel provider channel_access controller requires ${method}().`);
    }
  }
}

export type PackageHostManifest = Readonly<{
  surface_kind:
    | 'opl_agent_package_manifest.v1'
    | 'opl_capability_package_manifest.v2'
    | 'opl_workflow_profile_package_manifest.v1';
  package_id: string;
}>;

export type PackageHostCompositionSnapshot = Readonly<{
  composition_id: string;
  snapshot: CordisCompositionSnapshot;
}>;

export type PackageHostEnvironment = Readonly<{
  profile_id: PackageHostProfileId;
  snapshots: readonly PackageHostCompositionSnapshot[];
}>;

export type PackageHostCapabilityResolution = Readonly<{
  service_id: string;
  requested_api_versions: readonly string[];
  requested_scope: CordisPluginScope;
  status: 'resolved' | 'missing' | 'api_incompatible' | 'scope_incompatible';
  provider: Readonly<{
    plugin_id: string;
    plugin_api_version: string;
    scope: CordisPluginScope;
    snapshot_id: string;
    snapshot_digest: string;
    disposer: CordisPluginDescriptor['disposer'];
  }> | null;
}>;

export type PackageHostContext = Readonly<{
  surface_kind: 'opl_package_host_context.v1';
  context_id: string;
  context_digest: string;
  package_id: string;
  integration_kind: PackageHostIntegrationKind;
  integration_point: string;
  profile_id: PackageHostProfileId;
  status: 'ready' | 'degraded' | 'blocked';
  composition_snapshot_refs: readonly Readonly<{
    composition_id: string;
    snapshot_id: string;
    snapshot_digest: string;
  }>[];
  capabilities: Readonly<{
    required: readonly PackageHostCapabilityResolution[];
    optional: readonly PackageHostCapabilityResolution[];
  }>;
  blockers: readonly string[];
  composition_policy: PackageHostIntegration['composition_policy'];
  authority_boundary: PackageHostIntegration['authority_boundary'];
}>;

const integrationSchemaEntry: JsonSchemaRegistryEntry = {
  schemaId: 'opl.package_host_integration.v1',
  schema: hostIntegrationSchema,
  sourceRef: PACKAGE_HOST_INTEGRATION_SCHEMA_REF,
};

const contextSchemaEntry: JsonSchemaRegistryEntry = {
  schemaId: 'opl.package_host_context.v1',
  schema: hostContextSchema,
  sourceRef: PACKAGE_HOST_CONTEXT_SCHEMA_REF,
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function assertPackageHostIntegration(
  payload: unknown,
): asserts payload is PackageHostIntegration {
  assertJsonSchemaPayload(integrationSchemaEntry, payload);
}

export function validatePackageHostIntegration(payload: unknown) {
  return validateJsonSchemaPayload(integrationSchemaEntry, payload);
}

export function readStandardAgentHostContract(): PackageHostIntegration {
  assertPackageHostIntegration(standardAgentHostContract);
  return deepFreeze(structuredClone(standardAgentHostContract) as PackageHostIntegration);
}

export function readCapabilityPackageHostContract(): PackageHostIntegration {
  assertPackageHostIntegration(capabilityPackageHostContract);
  return deepFreeze(structuredClone(capabilityPackageHostContract) as PackageHostIntegration);
}

export function readWorkflowProfileHostContract(): PackageHostIntegration {
  assertPackageHostIntegration(workflowProfileHostContract);
  return deepFreeze(structuredClone(workflowProfileHostContract) as PackageHostIntegration);
}

export function resolvePackageHostIntegration(manifest: PackageHostManifest): PackageHostIntegration {
  if (!manifest.package_id) throw new Error('Package host integration requires package_id.');
  switch (manifest.surface_kind) {
    case 'opl_agent_package_manifest.v1':
      return readStandardAgentHostContract();
    case 'opl_capability_package_manifest.v2':
      return readCapabilityPackageHostContract();
    case 'opl_workflow_profile_package_manifest.v1':
      return readWorkflowProfileHostContract();
  }
}

function providersForService(
  environment: PackageHostEnvironment,
  serviceId: string,
) {
  return environment.snapshots.flatMap(({ snapshot }) => snapshot.plugins.flatMap((plugin) =>
    plugin.provides.includes(serviceId) ? [{ plugin, snapshot }] : []))
    .sort((left, right) => left.plugin.plugin_id.localeCompare(right.plugin.plugin_id));
}

function providerReadback(
  candidate: ReturnType<typeof providersForService>[number] | undefined,
) {
  if (!candidate) return null;
  return {
    plugin_id: candidate.plugin.plugin_id,
    plugin_api_version: candidate.plugin.plugin_api_version,
    scope: candidate.plugin.scope,
    snapshot_id: candidate.snapshot.snapshot_id,
    snapshot_digest: candidate.snapshot.snapshot_digest,
    disposer: { ...candidate.plugin.disposer },
  };
}

const scopeRank: Readonly<Record<CordisPluginScope, number>> = {
  request: 0,
  attempt: 1,
  session: 2,
  composition: 3,
  process: 4,
};

function resolveCapability(
  environment: PackageHostEnvironment,
  requirement: PackageHostCapabilityRequirement,
): PackageHostCapabilityResolution {
  const candidates = providersForService(environment, requirement.service_id);
  const exact = candidates.find(({ plugin }) =>
    requirement.api_versions.includes(plugin.plugin_api_version)
    && scopeRank[plugin.scope] >= scopeRank[requirement.scope]);
  if (exact) {
    return {
      service_id: requirement.service_id,
      requested_api_versions: [...requirement.api_versions],
      requested_scope: requirement.scope,
      status: 'resolved',
      provider: providerReadback(exact),
    };
  }
  const versionMatch = candidates.find(({ plugin }) =>
    requirement.api_versions.includes(plugin.plugin_api_version));
  const status = candidates.length === 0
    ? 'missing'
    : versionMatch
      ? 'scope_incompatible'
      : 'api_incompatible';
  return {
    service_id: requirement.service_id,
    requested_api_versions: [...requirement.api_versions],
    requested_scope: requirement.scope,
    status,
    provider: providerReadback(versionMatch ?? candidates[0]),
  };
}

function contextDigest(value: Omit<PackageHostContext, 'context_id' | 'context_digest'>) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

export function buildPackageHostContext(input: {
  package_id: string;
  integration: PackageHostIntegration;
  integration_trigger: PackageHostIntegrationTrigger;
  environment: PackageHostEnvironment;
}): PackageHostContext {
  assertPackageHostIntegration(input.integration);
  if (!input.package_id) throw new Error('Package host context requires package_id.');
  if (input.environment.snapshots.length === 0) {
    throw new Error('Package host context requires at least one composition snapshot.');
  }
  for (const { snapshot } of input.environment.snapshots) {
    assertCordisCompositionSnapshot(snapshot);
  }
  const point = input.integration.integration_points.find((entry) =>
    entry.trigger === input.integration_trigger);
  if (!point) {
    throw new Error(
      `Package host integration does not declare trigger: ${input.integration_trigger}`,
    );
  }
  const required = point.requirements.required.map((requirement) =>
    resolveCapability(input.environment, requirement));
  const optional = point.requirements.optional.map((requirement) =>
    resolveCapability(input.environment, requirement));
  const blockers = [
    ...(!point.allowed_profiles.includes(input.environment.profile_id)
      ? [`host_profile_not_allowed:${input.environment.profile_id}`]
      : []),
    ...required.flatMap((resolution) => resolution.status === 'resolved'
      ? []
      : [`required_host_capability_${resolution.status}:${resolution.service_id}`]),
  ];
  const optionalUnavailable = optional.some((resolution) => resolution.status !== 'resolved');
  const unsigned = {
    surface_kind: 'opl_package_host_context.v1' as const,
    package_id: input.package_id,
    integration_kind: input.integration.integration_kind,
    integration_point: point.integration_id,
    profile_id: input.environment.profile_id,
    status: blockers.length > 0 ? 'blocked' as const : optionalUnavailable ? 'degraded' as const : 'ready' as const,
    composition_snapshot_refs: input.environment.snapshots
      .map(({ composition_id: compositionId, snapshot }) => ({
        composition_id: compositionId,
        snapshot_id: snapshot.snapshot_id,
        snapshot_digest: snapshot.snapshot_digest,
      }))
      .sort((left, right) => left.composition_id.localeCompare(right.composition_id)),
    capabilities: { required, optional },
    blockers,
    composition_policy: { ...input.integration.composition_policy },
    authority_boundary: {
      forbidden_authorities: [...input.integration.authority_boundary.forbidden_authorities],
    },
  };
  const digest = contextDigest(unsigned);
  const context: PackageHostContext = {
    ...unsigned,
    context_id: `opl:host-context:${digest}`,
    context_digest: digest,
  };
  assertJsonSchemaPayload(contextSchemaEntry, context);
  return deepFreeze(context);
}

export function assertPackageHostContext(payload: unknown): asserts payload is PackageHostContext {
  assertJsonSchemaPayload(contextSchemaEntry, payload);
  const context = payload as PackageHostContext;
  const { context_id: _contextId, context_digest: _contextDigest, ...unsigned } = context;
  const digest = contextDigest(unsigned);
  if (context.context_digest !== digest || context.context_id !== `opl:host-context:${digest}`) {
    throw new Error('Package host context digest does not match its canonical payload.');
  }
}

export function validatePackageHostContext(payload: unknown) {
  return validateJsonSchemaPayload(contextSchemaEntry, payload);
}

export * from './remote-companion-abi.ts';
