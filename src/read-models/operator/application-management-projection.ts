import { isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';

type ApplicationManagementResource = {
  resource_id: string;
  resource_kind: 'knowledge_source' | 'connection' | 'model' | 'base_capability';
  label: string;
  status: 'ready' | 'attention' | 'unknown';
  source_refs: string[];
  consumer_package_ids: string[];
  owner_settings_route: string;
  relation_kind: 'required' | 'optional' | 'configured';
  owner?: string;
  source_id?: string;
  scope_ids?: string[];
  connection_id?: string;
  provider_type?: string;
  account_label?: string;
  capability_ids?: string[];
  action_ids?: string[];
  detail_ref?: string;
  reason?: string;
  authorization?: {
    status: 'authorized' | 'attention' | 'unknown';
    consumer_count: number;
    grant_count: number;
  };
  revision?: {
    status: 'current' | 'stale' | 'unknown';
    security_revision?: string;
  };
  freshness?: {
    status: 'fresh' | 'stale' | 'unknown';
    observed_at?: string;
  };
  readiness?: {
    status: 'ready' | 'attention' | 'unknown';
    reason?: string;
  };
};

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function baseCapabilityResources(managedUpdate: unknown): ApplicationManagementResource[] {
  const update = isRecord(managedUpdate) ? managedUpdate : {};
  const component = records(update.components).find((entry) => entry.component_id === 'opl_base');
  const current = component && isRecord(component.current) ? component.current : {};
  const catalog = isRecord(current.dependency_catalog) ? current.dependency_catalog : {};
  const dependencies = records(catalog.flow_dependencies);
  return dependencies.flatMap((dependency) => {
    const dependencyId = string(dependency.dependency_id);
    if (!dependencyId) return [];
    const observedStatus = string(dependency.status) ?? string(dependency.observed_status);
    const currentness = string(dependency.currentness);
    const status = currentness === 'update_available'
      || currentness === 'missing'
      || observedStatus === 'attention_needed'
      || observedStatus === 'failed'
      || observedStatus === 'missing'
      ? 'attention'
      : observedStatus === 'ready' || currentness === 'current'
        ? 'ready'
        : 'unknown';
    const dependencyKind = string(dependency.dependency_kind) ?? 'dependency';
    return [{
      resource_id: `base:${dependencyId}:${dependencyKind}`,
      resource_kind: 'base_capability',
      label: string(dependency.label) ?? dependencyId,
      status,
      source_refs: [`app_state.managed_update.components[component_id=opl_base].current.dependency_catalog.flow_dependencies[dependency_id=${dependencyId},dependency_kind=${dependencyKind}]`],
      consumer_package_ids: [],
      owner_settings_route: 'updates',
      relation_kind: dependency.relationship === 'required' ? 'required' : 'optional',
      detail_ref: 'app_state.managed_update',
    } satisfies ApplicationManagementResource];
  });
}

function connectionResources(settingsControlCenter: unknown): ApplicationManagementResource[] {
  const settings = isRecord(settingsControlCenter) ? settingsControlCenter : {};
  const registry = isRecord(settings.connection_registry) ? settings.connection_registry : {};
  const authorization = isRecord(settings.connection_authorization) ? settings.connection_authorization : {};
  const grants = records(authorization.grants);
  const authorizationConnections = records(authorization.connections);
  const readModel = isRecord(settings.app_settings_read_model) ? settings.app_settings_read_model : {};
  const connectionReadModel = isRecord(readModel.connections) ? readModel.connections : {};
  const actionIds = Array.isArray(connectionReadModel.action_ids) ? connectionReadModel.action_ids : [];
  return records(registry.connections).flatMap((connection) => {
    const connectionId = string(connection.connection_id);
    if (!connectionId || connection.connection_type === 'opl_gateway_account'
      || connectionId === 'opl-gateway-account') return [];
    const authorizedConnection = authorizationConnections.find((entry) => entry.connection_id === connectionId);
    const providerType = string(authorizedConnection?.provider_type) ?? string(connection.connection_type);
    const accountLabel = string(authorizedConnection?.account_label) ?? string(connection.account_label);
    const connectionGrants = grants.filter((grant) => grant.connection_id === connectionId);
    const activeGrants = connectionGrants.filter((grant) => grant.status === 'granted');
    const activeConsumerIds = new Set(activeGrants
      .map((grant) => string(grant.consumer_package_id) ?? string(grant.package_id))
      .filter((id): id is string => Boolean(id)));
    const hasOrphanedStaleGrant = connectionGrants
      .filter((grant) => grant.status === 'stale' || grant.status === 'revoked')
      .some((grant) => {
        const consumerId = string(grant.consumer_package_id) ?? string(grant.package_id);
        return !consumerId || !activeConsumerIds.has(consumerId);
      });
    const connectionStatus = string(connection.status);
    const status = connectionStatus === 'ready' && activeGrants.length > 0 && !hasOrphanedStaleGrant
      ? 'ready'
      : connectionStatus === 'attention_needed' || connectionStatus === 'disabled'
        || hasOrphanedStaleGrant
        ? 'attention'
        : 'unknown';
    const consumerPackageIds = [...new Set(activeGrants
      .map((grant) => string(grant.consumer_package_id) ?? string(grant.package_id))
      .filter((id): id is string => Boolean(id)))].sort();
    return [{
      resource_id: `connection:${connectionId}`,
      resource_kind: 'connection',
      owner: 'opl-connect',
      connection_id: connectionId,
      ...(providerType ? { provider_type: providerType } : {}),
      ...(accountLabel ? { account_label: accountLabel } : {}),
      capability_ids: [...new Set(activeGrants.flatMap((grant) =>
        Array.isArray(grant.capability_ids) ? grant.capability_ids.filter((id): id is string => typeof id === 'string') : []))].sort(),
      action_ids: ['connection_test', 'connection_update', 'connection_delete'].filter((id) => actionIds.includes(id)),
      label: string(connection.name) ?? string(connection.display_name) ?? connectionId,
      status,
      source_refs: [`app_state.settings_control_center.connection_registry.connections[connection_id=${connectionId}]`],
      consumer_package_ids: consumerPackageIds,
      owner_settings_route: 'connections',
      relation_kind: activeGrants.length > 0 ? 'configured' : 'optional',
      detail_ref: 'app_state.settings_control_center.connection_authorization',
      authorization: {
        status: activeGrants.length > 0 && !hasOrphanedStaleGrant
          ? 'authorized'
          : hasOrphanedStaleGrant ? 'attention' : 'unknown',
        consumer_count: consumerPackageIds.length,
        grant_count: connectionGrants.length,
      },
      revision: {
        status: connection.revision_status === 'current' || connection.revision_status === 'stale'
          ? connection.revision_status
          : 'unknown',
        ...(string(connection.security_revision) ? { security_revision: string(connection.security_revision)! } : {}),
      },
      freshness: {
        status: connection.freshness_status === 'fresh' || connection.freshness_status === 'stale'
          ? connection.freshness_status
          : 'unknown',
        ...(string(connection.last_tested_at) ? { observed_at: string(connection.last_tested_at)! } : {}),
      },
      readiness: {
        status,
        ...((status === 'attention' || status === 'unknown')
          ? { reason: hasOrphanedStaleGrant ? 'consumer_grant_stale_or_revoked' : connectionStatus === 'disabled' ? 'connection_disabled' : activeGrants.length === 0 ? 'no_active_consumer_grant' : 'connection_not_ready' }
          : {}),
      },
      ...(hasOrphanedStaleGrant
        ? { reason: 'consumer_grant_stale_or_revoked' }
        : connectionStatus === 'disabled'
          ? { reason: 'connection_disabled' }
          : activeGrants.length === 0 ? { reason: 'no_active_consumer_grant' } : {}),
    } satisfies ApplicationManagementResource];
  });
}

function modelConsumers(agentPackages: unknown, model: string) {
  const projection = isRecord(agentPackages) ? agentPackages : {};
  const statusIndex = isRecord(projection.status_index) ? projection.status_index : {};
  const packages = isRecord(statusIndex.packages) ? statusIndex.packages : {};
  return Object.entries(packages)
    .filter(([, rawStatus]) => {
      const status = isRecord(rawStatus) ? rawStatus : {};
      const modelProjection = isRecord(status.model_projection) ? status.model_projection : {};
      const selection = isRecord(modelProjection.effective_selection)
        ? modelProjection.effective_selection
        : {};
      return selection.model === model;
    })
    .map(([packageId]) => packageId)
    .sort();
}

function modelResource(settingsControlCenter: unknown, agentPackages: unknown): ApplicationManagementResource[] {
  const settings = isRecord(settingsControlCenter) ? settingsControlCenter : {};
  const readModel = isRecord(settings.app_settings_read_model) ? settings.app_settings_read_model : {};
  const policy = isRecord(readModel.codex_model_policy) ? readModel.codex_model_policy : {};
  const model = string(policy.model);
  if (!model) return [];
  const status = policy.model_access_ready === true ? 'ready'
    : policy.model_access_ready === false ? 'attention' : 'unknown';
  const reason = string(policy.access_status) ?? (status === 'attention' ? 'model_access_not_ready' : 'model_access_unknown');
  const providerType = string(policy.model_provider);
  const actionPolicy = isRecord(readModel.action_policy) ? readModel.action_policy : {};
  const actionIds = Array.isArray(actionPolicy.allowed_action_ids) ? actionPolicy.allowed_action_ids : [];
  const repairAction = string(policy.repair_action_id);
  return [{
    resource_id: 'model:codex',
    resource_kind: 'model',
    owner: 'account-and-access',
    ...(providerType ? { provider_type: providerType } : {}),
    action_ids: repairAction && actionIds.includes(repairAction) ? [repairAction] : [],
    label: model,
    status,
    source_refs: ['app_state.settings_control_center.app_settings_read_model.codex_model_policy'],
    consumer_package_ids: modelConsumers(agentPackages, model),
    owner_settings_route: 'access',
    relation_kind: 'required',
    detail_ref: 'app_state.settings_control_center.app_settings_read_model.codex_model_policy',
    readiness: {
      status,
      ...(status !== 'ready' ? { reason } : {}),
    },
    ...(status === 'ready' ? {} : { reason }),
  } satisfies ApplicationManagementResource];
}

function knowledgeResources(settingsControlCenter: unknown): ApplicationManagementResource[] {
  const settings = isRecord(settingsControlCenter) ? settingsControlCenter : {};
  const readModel = isRecord(settings.app_settings_read_model) ? settings.app_settings_read_model : {};
  const sources = isRecord(readModel.resource_sources) ? records(readModel.resource_sources.items) : [];
  return sources.flatMap((source) => {
    const sourceId = string(source.source_id);
    if (!sourceId) return [];
    const status = source.status === 'ready' ? 'ready' : source.status === 'attention' ? 'attention' : 'unknown';
    const authorization = isRecord(source.authorization) ? source.authorization : {};
    const revision = isRecord(source.revision) ? source.revision : {};
    const freshness = isRecord(source.freshness) ? source.freshness : {};
    const readiness = isRecord(source.readiness) ? source.readiness : {};
    const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
    const consumerIds = strings(source.consumer_package_ids);
    return [{
      resource_id: string(source.resource_id) ?? `knowledge:${sourceId}`,
      resource_kind: 'knowledge_source', source_id: sourceId,
      label: string(source.label) ?? sourceId, status,
      source_refs: [`app_state.settings_control_center.app_settings_read_model.resource_sources.items[source_id=${sourceId}]`],
      consumer_package_ids: consumerIds, scope_ids: strings(source.scope_ids),
      owner_settings_route: 'resources', relation_kind: 'configured',
      detail_ref: 'app_state.settings_control_center.app_settings_read_model.resource_sources',
      action_ids: strings(source.action_ids),
      authorization: { status: authorization.status === 'authorized' ? 'authorized' : authorization.status === 'attention' ? 'attention' : 'unknown',
        consumer_count: typeof authorization.consumer_count === 'number' ? authorization.consumer_count : consumerIds.length,
        grant_count: typeof authorization.grant_count === 'number' ? authorization.grant_count : 0 },
      revision: { status: revision.status === 'current' ? 'current' : revision.status === 'stale' ? 'stale' : 'unknown',
        ...(string(revision.security_revision) ? { security_revision: string(revision.security_revision)! } : {}) },
      freshness: { status: freshness.status === 'fresh' ? 'fresh' : freshness.status === 'stale' ? 'stale' : 'unknown',
        ...(string(freshness.observed_at) ? { observed_at: string(freshness.observed_at)! } : {}) },
      readiness: { status, ...(string(readiness.reason) ? { reason: string(readiness.reason)! } : {}) },
      ...(string(source.reason) ? { reason: string(source.reason)! } : {}),
    } satisfies ApplicationManagementResource];
  });
}

export function buildApplicationManagementProjection(input: {
  agentPackages: unknown;
  managedUpdate: unknown;
  settingsControlCenter: unknown;
}) {
  const sharedResources = [
    ...baseCapabilityResources(input.managedUpdate),
    ...connectionResources(input.settingsControlCenter),
    ...modelResource(input.settingsControlCenter, input.agentPackages),
    ...knowledgeResources(input.settingsControlCenter),
  ];
  return {
    surface_kind: 'opl_application_management_projection.v1',
    schema_version: 'opl_application_management_projection.v1',
    source_refs: [
      'app_state.agent_packages.directory.entries',
      'app_state.agent_packages.status_index',
      'app_state.managed_update',
      'app_state.settings_control_center.connection_authorization',
      'app_state.settings_control_center.connection_registry',
      'app_state.settings_control_center.app_settings_read_model.codex_model_policy',
      'app_state.settings_control_center.app_settings_read_model.resource_sources',
    ],
    shared_resources: sharedResources,
    authority_boundary: {
      resource_truth_owner: 'existing_package_connection_model_workspace_owners',
      app_role: 'aggregate_refs_and_dispatch_existing_app_state_actions',
      secrets_included: false,
      knowledge_bodies_included: false,
      absolute_paths_included: false,
      second_registry: false,
      second_updater: false,
    },
  };
}

export function compactFastApplicationManagementProjection(value: unknown) {
  const projection = isRecord(value) ? value : {};
  const sourceRefs = Array.isArray(projection.source_refs)
    ? projection.source_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    surface_kind: 'opl_application_management_projection.v1',
    schema_version: 'opl_application_management_projection.v1',
    source_refs: sourceRefs.slice(0, 16),
    shared_resources: records(projection.shared_resources).slice(0, 100),
    authority_boundary: isRecord(projection.authority_boundary)
      ? projection.authority_boundary
      : {},
    detail_policy: {
      detail: 'startup',
      full_detail_surface: 'opl app state --profile full --json#application_management',
    },
  };
}
