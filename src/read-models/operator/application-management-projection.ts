import { isRecord } from '../../kernel/contract-validation.ts';
import type { JsonRecord } from '../../kernel/json-record.ts';
import type { WorkspaceBinding } from '../../authority/workspace/public/app-state.ts';

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

function packageConsumersForDependency(agentPackages: unknown, dependencyId: string) {
  const projection = isRecord(agentPackages) ? agentPackages : {};
  const statusIndex = isRecord(projection.status_index) ? projection.status_index : {};
  const packages = isRecord(statusIndex.packages) ? statusIndex.packages : {};
  const consumers: string[] = [];
  for (const [packageId, rawStatus] of Object.entries(packages)) {
    const status = isRecord(rawStatus) ? rawStatus : {};
    const readiness = isRecord(status.dependency_readiness) ? status.dependency_readiness : {};
    for (const check of records(readiness.checks)) {
      if (check.package_id === dependencyId) {
        consumers.push(packageId);
        break;
      }
    }
  }
  return [...new Set(consumers)].sort();
}

function baseCapabilityResources(agentPackages: unknown, managedUpdate: unknown): ApplicationManagementResource[] {
  const update = isRecord(managedUpdate) ? managedUpdate : {};
  const component = records(update.components).find((entry) => entry.component_id === 'opl_base');
  const current = component && isRecord(component.current) ? component.current : {};
  const catalog = isRecord(current.dependency_catalog) ? current.dependency_catalog : {};
  const dependencies = records(catalog.flow_dependencies);
  return dependencies.flatMap((dependency) => {
    const dependencyId = string(dependency.dependency_id);
    if (!dependencyId) return [];
    const observedStatus = string(dependency.observed_status);
    const currentness = string(dependency.currentness);
    const installed = dependency.installed === true;
    const status = installed && observedStatus !== 'failed' && currentness !== 'missing'
      ? 'ready'
      : installed || observedStatus || currentness
        ? 'attention'
        : 'unknown';
    return [{
      resource_id: `base:${dependencyId}`,
      resource_kind: 'base_capability',
      label: string(dependency.label) ?? dependencyId,
      status,
      source_refs: [`app_state.managed_update.components[component_id=opl_base].current.dependency_catalog.flow_dependencies[dependency_id=${dependencyId}]`],
      consumer_package_ids: packageConsumersForDependency(agentPackages, dependencyId),
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
    const connectionGrants = grants.filter((grant) => (
      grant.connection_id === connectionId && grant.status === 'granted'
    ));
    const connectionStatus = string(connection.status);
    const status = connectionStatus === 'ready' && connectionGrants.length > 0
      ? 'ready'
      : connectionStatus === 'disabled' || connectionGrants.some((grant) => grant.status !== 'granted')
        ? 'attention'
        : 'unknown';
    return [{
      resource_id: `connection:${connectionId}`,
      resource_kind: 'connection',
      label: string(connection.display_name) ?? connectionId,
      status,
      source_refs: [`app_state.settings_control_center.connection_registry.connections[connection_id=${connectionId}]`],
      consumer_package_ids: [...new Set(connectionGrants.map((grant) => string(grant.package_id)).filter((id): id is string => Boolean(id)))].sort(),
      owner_settings_route: 'connections',
      relation_kind: connectionGrants.length > 0 ? 'configured' : 'optional',
      detail_ref: 'app_state.settings_control_center.connection_authorization',
      ...(connectionGrants.length === 0 ? { reason: 'no_active_consumer_grant' } : {}),
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

function knowledgeResources(bindings: readonly WorkspaceBinding[]): ApplicationManagementResource[] {
  return bindings.filter((binding) => binding.status === 'active').map((binding) => ({
    resource_id: `knowledge:${binding.project_id}`,
    resource_kind: 'knowledge_source' as const,
    label: binding.label ?? binding.project,
    status: 'unknown' as const,
    source_refs: [`workspace_registry.active_bindings[binding_id=${binding.binding_id}]`],
    consumer_package_ids: [],
    owner_settings_route: 'workspace',
    relation_kind: 'optional' as const,
    detail_ref: 'app_state.paths.workspace_root',
    reason: 'knowledge_binding_not_projected',
  }));
}

export function buildApplicationManagementProjection(input: {
  agentPackages: unknown;
  managedUpdate: unknown;
  settingsControlCenter: unknown;
  workspaceBindings: readonly WorkspaceBinding[];
}) {
  const sharedResources = [
    ...baseCapabilityResources(input.agentPackages, input.managedUpdate),
    ...connectionResources(input.agentPackages, input.settingsControlCenter),
    ...modelResource(input.settingsControlCenter, input.agentPackages),
    ...knowledgeResources(input.workspaceBindings),
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
      'app_state.paths.workspace_root',
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
