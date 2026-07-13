import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringValue, type JsonRecord } from '../../../kernel/json-record.ts';
import type { StandardAgentDescriptorInterface } from '../../../kernel/standard-agent-interface.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../kernel/standard-agent-registry.ts';
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

function stableProjectId(agentId: string, workspacePath: string) {
  const digest = createHash('sha256').update(workspacePath).digest('hex').slice(0, 16);
  return `${agentId}:${digest}`;
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
    return resolveStandardAgent(packageId)?.agent_id === agentId;
  }) ?? null;
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
  for (const agent of STANDARD_AGENT_REGISTRY) {
    if (agent.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP) continue;
    agents.push({
      agent_id: agent.agent_id,
      domain_id: agent.domain_id,
      display_name: agent.display_name,
      short_label: agent.short_label,
      package_id: agent.agent_id,
      scope_id: `agent:${agent.agent_id}`,
    });
    const packageItem = packageItemForAgent(agent.agent_id, packageItems);
    const descriptorChecked = input.descriptorByAgent?.has(agent.agent_id) ?? false;
    const descriptor = input.descriptorByAgent?.get(agent.agent_id) ?? null;
    const descriptorStatus = descriptor
      ? 'readable'
      : descriptorChecked
        ? 'unreadable'
        : 'not_checked';
    const packageStatus = input.packageStatusById?.[agent.agent_id];
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
    const packageInstalled = Boolean(packageStatus);
    const state: AgentAvailability['availability'] = !packageInstalled
      ? 'unavailable'
      : profile === 'fast'
        ? codexVisible === false ? 'attention_required' : 'available'
        : launchAllowed === true ? 'available' : 'attention_required';
    const reason = state === 'unavailable'
      ? 'package_not_installed'
      : profile === 'fast'
        ? codexVisible === false
          ? 'package_installed_but_not_visible_to_codex'
          : 'package_installed_and_visible'
        : launchAllowed === true
          ? 'package_launch_allowed'
          : launchReason;
    availability.push({
      agent_id: agent.agent_id,
      domain_id: agent.domain_id,
      display_name: agent.display_name,
      availability: state,
      reason,
      last_checked_at: checkedAt,
      source: profile === 'fast' ? 'package_directory' : 'package_status',
      independent_from_work_item_state: true,
      package_id: agent.agent_id,
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

export function buildProjectCatalog(bindings: ReadonlyArray<WorkspaceBinding>) {
  const diagnostics: WorkItemProjectionDiagnostic[] = [];
  const grouped = new Map<string, WorkspaceBinding[]>();
  for (const binding of bindings) {
    if (binding.status === 'archived') continue;
    if (!fs.existsSync(binding.workspace_path)) {
      diagnostics.push({
        reason: 'workspace_binding_path_missing',
        ref: binding.workspace_path,
        details: { binding_id: binding.binding_id, binding_status: binding.status },
      });
      continue;
    }
    const agent = resolveStandardAgent(binding.project_id) ?? resolveStandardAgent(binding.project);
    const agentId = agent?.agent_id ?? binding.project_id;
    const workspacePath = canonicalWorkspacePath(binding.workspace_path);
    const key = `${agentId}\u0000${workspacePath}`;
    grouped.set(key, [...(grouped.get(key) ?? []), binding]);
  }

  const projects: ProjectCatalogEntry[] = [];
  for (const bindingsForPath of grouped.values()) {
    const selected = newestBinding(bindingsForPath);
    const agent = resolveStandardAgent(selected.project_id) ?? resolveStandardAgent(selected.project);
    const agentId = agent?.agent_id ?? selected.project_id;
    const workspacePath = canonicalWorkspacePath(selected.workspace_path);
    const projectId = stableProjectId(agentId, workspacePath);
    const label = stringValue(selected.label) ?? path.basename(workspacePath);
    projects.push({
      project_id: projectId,
      scope_id: `project:${projectId}`,
      agent_id: agentId,
      agent_display_name: agent?.display_name ?? agentId,
      domain_id: agent?.domain_id ?? selected.project_id,
      display_name: label,
      workspace_path: workspacePath,
      binding_status: bindingsForPath.some((binding) => binding.status === 'active') ? 'active' : 'inactive',
      selected_binding_id: selected.binding_id,
      binding_ids: bindingsForPath.map((binding) => binding.binding_id).sort(),
      source_refs: bindingsForPath.map((binding) => ({
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
