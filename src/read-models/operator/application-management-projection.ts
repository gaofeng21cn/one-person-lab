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
  detail_ref?: string;
  reason?: string;
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

function connectionResources(agentPackages: unknown, settingsControlCenter: unknown): ApplicationManagementResource[] {
  const settings = isRecord(settingsControlCenter) ? settingsControlCenter : {};
  const registry = isRecord(settings.connection_registry) ? settings.connection_registry : {};
  const authorization = isRecord(settings.connection_authorization) ? settings.connection_authorization : {};
  const grants = records(authorization.grants);
  return records(registry.connections).flatMap((connection) => {
    const connectionId = string(connection.connection_id);
    if (!connectionId) return [];
    const connectionGrants = grants.filter((grant) => grant.connection_id === connectionId);
    const activeGrants = connectionGrants.filter((grant) => grant.status === 'granted');
    const hasStaleGrant = connectionGrants.some((grant) => grant.status === 'stale' || grant.status === 'revoked');
    const connectionStatus = string(connection.status);
    const status = connectionStatus === 'ready' && activeGrants.length > 0 && !hasStaleGrant
      ? 'ready'
      : connectionStatus === 'attention_needed' || connectionStatus === 'disabled' || hasStaleGrant
        ? 'attention'
        : 'unknown';
    const consumerPackageIds = [...new Set(activeGrants
      .map((grant) => string(grant.consumer_package_id) ?? string(grant.package_id))
      .filter((id): id is string => Boolean(id)))].sort();
    return [{
      resource_id: `connection:${connectionId}`,
      resource_kind: 'connection',
      label: string(connection.name) ?? string(connection.display_name) ?? connectionId,
      status,
      source_refs: [`app_state.settings_control_center.connection_registry.connections[connection_id=${connectionId}]`],
      consumer_package_ids: consumerPackageIds,
      owner_settings_route: 'connections',
      relation_kind: activeGrants.length > 0 ? 'configured' : 'optional',
      detail_ref: 'app_state.settings_control_center.connection_authorization',
      ...(hasStaleGrant
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
  const ready = policy.model_access_ready === true;
  return [{
    resource_id: 'model:codex',
    resource_kind: 'model',
    label: model,
    status: ready ? 'ready' : 'attention',
    source_refs: ['app_state.settings_control_center.app_settings_read_model.codex_model_policy'],
    consumer_package_ids: modelConsumers(agentPackages, model),
    owner_settings_route: 'access',
    relation_kind: 'required',
    detail_ref: 'app_state.settings_control_center.app_settings_read_model.codex_model_policy',
    ...(ready ? {} : { reason: string(policy.access_status) ?? 'model_access_not_ready' }),
  } satisfies ApplicationManagementResource];
}

function knowledgeResources(settingsControlCenter: unknown): ApplicationManagementResource[] {
  const settings = isRecord(settingsControlCenter) ? settingsControlCenter : {};
  const readModel = isRecord(settings.app_settings_read_model) ? settings.app_settings_read_model : {};
  const sources = isRecord(readModel.resource_sources)
    ? records(readModel.resource_sources.items)
    : records(readModel.resource_sources);
  if (sources.length === 0) {
    return [{
      resource_id: 'knowledge:personal',
      resource_kind: 'knowledge_source',
      label: 'Personal knowledge sources',
      status: 'unknown',
      source_refs: ['app_state.settings_control_center.app_settings_read_model.resource_sources'],
      consumer_package_ids: [],
      owner_settings_route: 'workspace',
      relation_kind: 'optional',
      detail_ref: 'app_state.settings_control_center.app_settings_read_model.resource_sources',
      reason: 'knowledge_owner_projection_unavailable',
    }];
  }
  return sources.flatMap((source) => {
    const sourceId = string(source.source_id) ?? string(source.resource_id) ?? string(source.id);
    if (!sourceId) return [];
    const rawStatus = string(source.status) ?? string(source.state);
    const status = rawStatus === 'ready' || rawStatus === 'available'
      ? 'ready'
      : rawStatus === 'attention' || rawStatus === 'attention_needed' || rawStatus === 'unavailable'
        ? 'attention'
        : 'unknown';
    const consumerIds = Array.isArray(source.consumer_package_ids)
      ? source.consumer_package_ids.filter((id): id is string => typeof id === 'string')
      : [string(source.consumer_package_id)].filter((id): id is string => Boolean(id));
    return [{
      resource_id: `knowledge:${sourceId}`,
      resource_kind: 'knowledge_source',
      label: string(source.label) ?? string(source.title) ?? sourceId,
      status,
      source_refs: [`app_state.settings_control_center.app_settings_read_model.resource_sources[source_id=${sourceId}]`],
      consumer_package_ids: [...new Set(consumerIds)].sort(),
      owner_settings_route: 'workspace',
      relation_kind: 'configured',
      detail_ref: 'app_state.settings_control_center.app_settings_read_model.resource_sources',
      ...(status === 'ready' ? {} : { reason: 'knowledge_source_requires_owner_attention' }),
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
    ...connectionResources(input.agentPackages, input.settingsControlCenter),
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
