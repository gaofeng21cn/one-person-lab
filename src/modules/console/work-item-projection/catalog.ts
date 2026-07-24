import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import type { StandardAgentDescriptorInterface } from '../../../kernel/standard-agent-interface.ts';
import type { WorkspaceBinding } from '../../workspace/public/app-state.ts';
import type {
  AgentAvailability,
  AgentCatalogEntry,
  ProjectCatalogEntry,
  WorkItemProjectionDiagnostic,
} from './types.ts';

export function canonicalWorkspacePath(workspacePath: string) {
  const resolved = path.resolve(workspacePath);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function newestBinding(bindings: WorkspaceBinding[]) {
  return [...bindings].sort((left, right) => {
    const statusDelta = Number(right.status === 'active') - Number(left.status === 'active');
    if (statusDelta !== 0) return statusDelta;
    return Date.parse(right.updated_at) - Date.parse(left.updated_at);
  })[0]!;
}

function packageItemForAgent(agentId: string, packageItems: ReadonlyArray<JsonRecord>) {
  return packageItems.find((item) => {
    const packageId = stringValue(item.package_id) ?? stringValue(item.agent_id) ?? '';
    return packageId === agentId;
  }) ?? null;
}

function projectedPresence(status: JsonRecord | undefined) {
  const presence = isRecord(status?.presence) ? status.presence : null;
  if (typeof presence?.present === 'boolean') return presence.present;
  return typeof status?.installed_package_count === 'number'
    ? status.installed_package_count > 0
    : status?.status === 'installed' || status?.status === 'present';
}

function projectedCallable(status: JsonRecord | undefined) {
  const presence = isRecord(status?.presence) ? status.presence : null;
  return typeof presence?.callable === 'boolean' ? presence.callable : status?.launch_allowed === true;
}

function descriptorIdentities(descriptor: StandardAgentDescriptorInterface) {
  return [
    descriptor.agent_id ?? '',
    descriptor.package_id ?? '',
    descriptor.domain_id,
    descriptor.interface.runtime.runtime_domain_id,
    ...descriptor.interface.routing.explicit_aliases,
  ].map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
}

export function buildAgentCatalog(input: {
  profile?: 'fast' | 'full';
  checkedAt?: string;
  packageItems?: ReadonlyArray<JsonRecord>;
  packageStatusById?: Readonly<Record<string, JsonRecord>>;
  descriptorByAgent?: ReadonlyMap<string, StandardAgentDescriptorInterface | null>;
} = {}) {
  const profile = input.profile ?? 'full';
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const packageItems = input.packageItems ?? [];
  const agents: AgentCatalogEntry[] = [];
  const availability: AgentAvailability[] = [];
  for (const packageId of Object.keys(input.packageStatusById ?? {}).sort()) {
    const packageStatus = input.packageStatusById?.[packageId];
    if (!projectedPresence(packageStatus)) continue;
    const descriptor = input.descriptorByAgent?.get(packageId) ?? null;
    if (descriptor?.kind !== 'agent') continue;
    const agentId = descriptor.agent_id ?? packageId;
    const descriptorPackageId = descriptor.package_id ?? packageId;
    const displayName = descriptor.display_name ?? agentId;
    agents.push({
      agent_id: agentId,
      domain_id: descriptor.domain_id,
      display_name: displayName,
      short_label: agentId.toUpperCase(),
      package_id: descriptorPackageId,
      scope_id: `agent:${agentId}`,
    });
    const packageItem = packageItemForAgent(packageId, packageItems);
    const descriptorChecked = input.descriptorByAgent?.has(packageId) ?? false;
    const descriptorStatus = descriptor
      ? 'readable'
      : descriptorChecked
        ? 'unreadable'
        : 'not_checked';
    const packageStatusUnavailable = packageStatus?.status === 'unavailable'
      || isRecord(packageStatus?.status_read_error);
    const capabilityExposure = isRecord(packageStatus?.capability_exposure)
      ? packageStatus.capability_exposure
      : null;
    const codexVisible = typeof packageStatus?.codex_visible === 'boolean'
      ? packageStatus.codex_visible
      : typeof capabilityExposure?.codex_visible === 'boolean'
        ? capabilityExposure.codex_visible
        : null;
    const launchAllowed = typeof packageStatus?.launch_allowed === 'boolean'
      ? packageStatus.launch_allowed
      : null;
    const launchStatus = launchAllowed === true ? 'ready' : launchAllowed === false ? 'blocked' : 'unknown';
    const launchReason = launchAllowed === true
      ? 'package_launch_allowed'
      : launchAllowed === false
        ? stringValue(packageStatus?.launch_blocked_reason) ?? 'package_launch_blocked'
        : input.packageStatusById && !packageStatus
          ? 'package_not_installed'
          : 'package_launch_readiness_not_projected';
    const packageInstalled = projectedPresence(packageStatus) && !packageStatusUnavailable;
    const callable = projectedCallable(packageStatus);
    const state: AgentAvailability['availability'] = packageStatusUnavailable
      ? 'unavailable'
      : !packageInstalled
        ? 'unavailable'
        : profile === 'fast'
          ? codexVisible === false ? 'attention_required' : 'available'
          : callable ? 'available' : 'attention_required';
    const reason = packageStatusUnavailable
      ? 'package_status_read_failed'
      : state === 'unavailable'
        ? 'package_not_installed'
        : profile === 'fast'
          ? codexVisible === false
            ? 'package_installed_but_not_visible_to_codex'
            : 'package_installed_and_visible'
          : callable
            ? 'package_launch_allowed'
            : launchReason;
    availability.push({
      agent_id: agentId,
      domain_id: descriptor.domain_id,
      display_name: displayName,
      availability: state,
      reason,
      last_checked_at: checkedAt,
      source: profile === 'fast' ? 'package_directory' : 'package_status',
      independent_from_work_item_state: true,
      package_id: descriptorPackageId,
      source_ref: stringValue(packageStatus?.package_lock_ref)
        ?? stringValue(packageStatus?.lock_ref)
        ?? stringValue(packageItem?.source_path)
        ?? stringValue(packageItem?.managed_source_path),
      inventory_descriptor: {
        status: descriptorStatus,
        reason: descriptorStatus === 'readable'
          ? 'standard_agent_inventory_descriptor_readable'
          : descriptorStatus === 'unreadable'
            ? 'standard_agent_inventory_descriptor_unreadable'
            : 'no_bound_project_required_descriptor_read',
        source_ref: descriptor?.repo_dir ?? null,
      },
      package_launch_readiness: {
        status: profile === 'fast' ? 'unknown' : launchStatus,
        launch_allowed: profile === 'fast' ? null : launchAllowed,
        reason: profile === 'fast' ? 'launch_readiness_deferred_to_full_profile' : launchReason,
      },
    });
  }
  return { agents, availability };
}

export function buildProjectCatalog(
  bindings: ReadonlyArray<WorkspaceBinding>,
  descriptors: ReadonlyArray<StandardAgentDescriptorInterface> = [],
) {
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const grouped = new Map<string, WorkspaceBinding[]>();
  for (const binding of bindings) {
    if (binding.status === 'archived') continue;
    const key = binding.project_scope_id;
    grouped.set(key, [...(grouped.get(key) ?? []), binding]);
    if (!fs.existsSync(binding.workspace_path)) {
      diagnostics.push({
        reason: 'workspace_binding_path_missing',
        ref: binding.workspace_path,
        details: {
          binding_id: binding.binding_id,
          binding_status: binding.status,
          project_scope_id: binding.project_scope_id,
        },
      });
    }
  }

  const projects: ProjectCatalogEntry[] = [];
  for (const bindingsForScope of grouped.values()) {
    const readableBindings = bindingsForScope.filter((binding) => fs.existsSync(binding.workspace_path));
    if (readableBindings.length === 0) {
      diagnostics.push({
        reason: 'project_scope_has_no_readable_workspace_binding',
        project_id: bindingsForScope[0]?.project_scope_id,
        details: {
          project_scope_id: bindingsForScope[0]?.project_scope_id,
          binding_ids: bindingsForScope.map((binding) => binding.binding_id).sort(),
        },
      });
      continue;
    }
    const selected = newestBinding(readableBindings);
    const requested = [selected.project_id, selected.project]
      .map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const descriptor = descriptors.find((candidate) =>
      descriptorIdentities(candidate).some((identity) => requested.includes(identity))
    ) ?? null;
    const agentId = descriptor?.agent_id ?? selected.project_id;
    const workspacePath = canonicalWorkspacePath(selected.workspace_path);
    const projectScopeId = selected.project_scope_id;
    projects.push({
      project_id: projectScopeId,
      scope_id: projectScopeId,
      agent_id: agentId,
      agent_display_name: descriptor?.display_name ?? agentId,
      domain_id: descriptor?.domain_id ?? selected.project_id,
      display_name: path.basename(workspacePath),
      workspace_path: workspacePath,
      binding_status: readableBindings.some((binding) => binding.status === 'active') ? 'active' : 'inactive',
      selected_binding_id: selected.binding_id,
      binding_ids: bindingsForScope.map((binding) => binding.binding_id).sort(),
      source_refs: bindingsForScope.map((binding) => ({
        ref_kind: 'projection',
        ref: `workspace-binding:${binding.binding_id}`,
        role: 'workspace_binding',
      })),
    });
  }
  projects.sort((left, right) =>
    left.agent_id.localeCompare(right.agent_id) || left.display_name.localeCompare(right.display_name)
  );
  return { projects, diagnostics };
}

export function recordPackageItems(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
