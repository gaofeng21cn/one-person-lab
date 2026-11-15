import { isRecord } from '../contract-validation.ts';
import type { StandardAgentInterface } from '../standard-agent-interface-types.ts';
import { STANDARD_AGENT_INTERFACE_VERSION } from './constants.ts';
import { invalid, stringValue, workspaceRelativePath, stringArray, assertKnownKeys } from './validation-values.ts';
import { parseWorkspaceSharedResources, locatorFields } from './workspace-binding.ts';
import { parseStandardAgentInventoryProjection, stageCatalog } from './inventory-and-stages.ts';
import { domainDetailViews } from './task-views.ts';

export function parseStandardAgentInterface(value: unknown, sourceRef: string): StandardAgentInterface {
  if (!isRecord(value)) invalid('Standard Agent interface must be an object.', sourceRef);
  if (value.version !== STANDARD_AGENT_INTERFACE_VERSION) {
    invalid('Standard Agent interface version is unsupported.', sourceRef, {
      expected: STANDARD_AGENT_INTERFACE_VERSION,
      actual: value.version ?? null,
    });
  }
  const workspaceBinding = value.workspace_binding;
  const runtime = value.runtime;
  const progress = value.progress;
  const routing = value.routing;
  if (!isRecord(workspaceBinding) || !isRecord(runtime) || !isRecord(progress) || !isRecord(routing)) {
    invalid('Standard Agent interface must declare workspace_binding, runtime, progress, and routing objects.', sourceRef);
  }
  assertKnownKeys(
    value,
    [
      'version',
      'inventory_projection',
      'stage_catalog',
      'domain_detail_views',
      'workspace_binding',
      'runtime',
      'progress',
      'routing',
    ],
    'root',
    sourceRef,
  );
  const retiredWorkspaceCommands = ['entry_command_template', 'manifest_command_template']
    .filter((field) => Object.hasOwn(workspaceBinding, field));
  if (retiredWorkspaceCommands.length) {
    invalid('Standard Agent workspace contains unknown properties for retired private command templates.', sourceRef, {
      field: 'workspace_binding', unknown_properties: retiredWorkspaceCommands,
    });
  }
  assertKnownKeys(runtime, ['runtime_domain_id', 'registration_ref'], 'runtime', sourceRef);
  assertKnownKeys(progress, ['deliverable_delta_aliases', 'platform_delta_aliases'], 'progress', sourceRef);
  assertKnownKeys(routing, [
    'explicit_aliases',
    'workstream_ids',
    'intent_signals',
    'ambiguity_policy',
  ], 'routing', sourceRef);

  const requiredLocatorFields = locatorFields(
    workspaceBinding.required_locator_fields,
    'workspace_binding.required_locator_fields',
    sourceRef,
  );
  const optionalLocatorFields = locatorFields(
    workspaceBinding.optional_locator_fields,
    'workspace_binding.optional_locator_fields',
    sourceRef,
  );
  const overlap = requiredLocatorFields.filter((field) => optionalLocatorFields.includes(field));
  if (overlap.length > 0) {
    invalid('Standard Agent interface locator fields cannot be both required and optional.', sourceRef, { overlap });
  }

  const registrationRef = runtime.registration_ref === null
    ? null
    : stringValue(runtime.registration_ref, 'runtime.registration_ref', sourceRef);
  const defaultProfileId = stringValue(
    workspaceBinding.default_profile_id,
    'workspace_binding.default_profile_id',
    sourceRef,
  );
  if (!['one_off', 'series', 'portfolio'].includes(defaultProfileId)) {
    invalid('Standard Agent interface workspace default_profile_id is unsupported.', sourceRef, {
      default_profile_id: defaultProfileId,
    });
  }
  const workstreamIds = stringArray(routing.workstream_ids, 'routing.workstream_ids', sourceRef);
  if (workstreamIds.length > 1) {
    invalid('Standard Agent interface v1 supports at most one admitted workstream per Agent.', sourceRef, {
      workstream_ids: workstreamIds,
    });
  }
  return {
    version: STANDARD_AGENT_INTERFACE_VERSION,
    inventory_projection: parseStandardAgentInventoryProjection(value.inventory_projection, sourceRef),
    stage_catalog: stageCatalog(value.stage_catalog, sourceRef),
    domain_detail_views: domainDetailViews(value.domain_detail_views, sourceRef),
    workspace_binding: {
      // Domain metadata is opaque; only the known fields below drive Framework behavior.
      ...workspaceBinding,
      locator_surface_kind: stringValue(
        workspaceBinding.locator_surface_kind,
        'workspace_binding.locator_surface_kind',
        sourceRef,
      ),
      default_profile_id: defaultProfileId as StandardAgentInterface['workspace_binding']['default_profile_id'],
      workspace_kind: stringValue(workspaceBinding.workspace_kind, 'workspace_binding.workspace_kind', sourceRef),
      project_kind: stringValue(workspaceBinding.project_kind, 'workspace_binding.project_kind', sourceRef),
      project_collection_label: stringValue(
        workspaceBinding.project_collection_label,
        'workspace_binding.project_collection_label',
        sourceRef,
      ),
      project_collection_path: workspaceBinding.project_collection_path === undefined
        ? null
        : workspaceRelativePath(
            workspaceBinding.project_collection_path,
            'workspace_binding.project_collection_path',
            sourceRef,
          ),
      shared_resources: workspaceBinding.shared_resources === undefined
        ? null
        : parseWorkspaceSharedResources(workspaceBinding.shared_resources, sourceRef),
      default_workspace_id: stringValue(
        workspaceBinding.default_workspace_id,
        'workspace_binding.default_workspace_id',
        sourceRef,
      ),
      default_project_id: stringValue(
        workspaceBinding.default_project_id,
        'workspace_binding.default_project_id',
        sourceRef,
      ),
      required_locator_fields: requiredLocatorFields,
      optional_locator_fields: optionalLocatorFields,
    },
    runtime: {
      runtime_domain_id: stringValue(runtime.runtime_domain_id, 'runtime.runtime_domain_id', sourceRef),
      registration_ref: registrationRef,
    },
    progress: {
      deliverable_delta_aliases: stringArray(
        progress.deliverable_delta_aliases,
        'progress.deliverable_delta_aliases',
        sourceRef,
      ),
      platform_delta_aliases: stringArray(
        progress.platform_delta_aliases,
        'progress.platform_delta_aliases',
        sourceRef,
      ),
    },
    routing: {
      explicit_aliases: stringArray(routing.explicit_aliases, 'routing.explicit_aliases', sourceRef),
      workstream_ids: workstreamIds,
      intent_signals: stringArray(routing.intent_signals, 'routing.intent_signals', sourceRef),
      ambiguity_policy: stringValue(routing.ambiguity_policy, 'routing.ambiguity_policy', sourceRef),
    },
  };
}
