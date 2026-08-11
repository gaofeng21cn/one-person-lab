import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { parseStandardAgentInventoryProjection } from '../../kernel/standard-agent-interface.ts';
import {
  resolveStandardAgent,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import {
  normalizeWorkspaceProjectEntry,
  WORKSPACE_PROJECT_LIFECYCLE_STATUSES,
} from './workspace-artifacts.ts';
import type { WorkspaceAgentProfile } from './workspace-agent-defaults.ts';
import {
  isWorkspaceProfileId,
  type TopologyProfile,
  type WorkspaceProfileId,
  type WorkspaceProjectIndexEntry,
} from './workspace-topology.ts';

export function normalizeProjectEntry(project: Record<string, unknown>): WorkspaceProjectIndexEntry | null {
  const fields = [
    project.project_id,
    project.project_root,
    project.stage_outputs_root,
    project.control_root,
    project.review_root,
    project.handoff_root,
  ];
  if (!fields.every((entry) => typeof entry === 'string' && entry.trim().length > 0)) {
    return null;
  }
  return normalizeWorkspaceProjectEntry(project);
}

export function profileIdFromIndex(index: Record<string, unknown>): WorkspaceProfileId | null {
  const profile = isRecord(index.workspace_topology_profile) ? index.workspace_topology_profile : null;
  const profileId = profile?.profile_id;
  return isWorkspaceProfileId(profileId) ? profileId : null;
}

export function profileFromIndex(index: Record<string, unknown>): TopologyProfile | null {
  const profile = isRecord(index.workspace_topology_profile) ? index.workspace_topology_profile : null;
  if (!profile) {
    return null;
  }
  const mode = profile.workspace_mode;
  const sharedRoots = profile.shared_resource_roots;
  if (
    (mode !== 'one_off' && mode !== 'series' && mode !== 'portfolio')
    || typeof profile.project_collection_path !== 'string'
    || typeof profile.project_stage_outputs_root !== 'string'
    || !Array.isArray(sharedRoots)
    || !sharedRoots.every((entry) => typeof entry === 'string')
  ) {
    return null;
  }
  return {
    workspace_mode: mode,
    project_collection_path: profile.project_collection_path,
    shared_resource_roots: sharedRoots,
    project_stage_outputs_root: profile.project_stage_outputs_root,
    series_capable_skeleton: profile.series_capable_skeleton === true,
  };
}

export function agentFromIndex(index: Record<string, unknown>): WorkspaceAgentProfile | null {
  const agent = isRecord(index.agent) ? index.agent : null;
  const profile = profileFromIndex(index);
  const profileId = profileIdFromIndex(index);
  const displayLabels = isRecord(index.display_labels) ? index.display_labels : null;
  const registry = typeof agent?.agent_id === 'string'
    ? resolveStandardAgent(agent.agent_id)
    : null;
  let inventoryProjection: WorkspaceAgentProfile['inventory_projection'] = null;
  try {
    inventoryProjection = parseStandardAgentInventoryProjection(
      agent?.inventory_projection,
      'workspace_index.json#/agent/inventory_projection',
    );
  } catch {
    return null;
  }
  if (
    !agent
    || !profile
    || !profileId
    || !registry
    || registry.series_membership !== STANDARD_AGENT_SERIES_MEMBERSHIP
    || ![
      agent.project_id,
      agent.project,
      agent.label,
      agent.workspace_kind,
      agent.project_kind,
    ].every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  ) {
    return null;
  }
  return {
    agent_id: registry.agent_id,
    project_id: String(agent.project_id),
    project: String(agent.project),
    label: String(agent.label),
    workspace_kind: String(agent.workspace_kind),
    project_kind: String(agent.project_kind),
    project_collection_label: typeof displayLabels?.project_collection === 'string'
      ? displayLabels.project_collection
      : profile.project_collection_path,
    project_collection_path: profile.project_collection_path,
    inventory_projection: inventoryProjection,
    default_workspace_id: `${registry.agent_id}-workspace`,
    default_project_id: `${registry.agent_id}-001`,
    default_profile_id: profileId,
  };
}

export function readWorkspaceIndex(indexPath: string) {
  try {
    const parsed = parseJsonText(fs.readFileSync(indexPath, 'utf8'));
    if (!isRecord(parsed)) {
      return { index: null, blocker: 'workspace_index_shape_invalid' };
    }
    if (parsed.surface_kind !== 'opl_workspace_index' || parsed.version !== 'workspace-index.v1') {
      return { index: null, blocker: 'workspace_index_shape_invalid' };
    }
    return { index: parsed, blocker: null };
  } catch (error) {
    return {
      index: null,
      blocker: 'workspace_index_invalid_json',
      cause: error instanceof Error ? error.message : 'Unknown JSON parse failure.',
    };
  }
}

export function indexWorkspaceId(index: Record<string, unknown>, workspacePath: string) {
  return typeof index.workspace_id === 'string' && index.workspace_id.trim()
    ? index.workspace_id
    : path.basename(workspacePath);
}

export function indexTitle(index: Record<string, unknown>) {
  return typeof index.title === 'string' && index.title.trim() ? index.title : null;
}

export function indexUpdatedAt(index: Record<string, unknown>) {
  return typeof index.updated_at === 'string' && index.updated_at.trim()
    ? index.updated_at
    : new Date().toISOString();
}

export function indexCreatedAt(index: Record<string, unknown>, fallback: string) {
  return typeof index.created_at === 'string' && index.created_at.trim()
    ? index.created_at
    : fallback;
}

export function normalizeWorkspaceLifecycle(value: unknown): {
  status: typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number];
  archived_at: string | null;
  archive_reason: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  superseded_at: string | null;
  superseded_by_project_id: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  retention_policy: 'keep_until_explicit_archive' | 'keep_until_explicit_delete_receipt';
  safe_delete_gate: 'domain_owner_receipt_required';
} {
  const lifecycle = isRecord(value) ? value : {};
  const status = WORKSPACE_PROJECT_LIFECYCLE_STATUSES.includes(
    lifecycle.status as typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number],
  )
    ? lifecycle.status as typeof WORKSPACE_PROJECT_LIFECYCLE_STATUSES[number]
    : 'active';
  return {
    status,
    archived_at: typeof lifecycle.archived_at === 'string'
      ? lifecycle.archived_at
      : null,
    archive_reason: typeof lifecycle.archive_reason === 'string'
      ? lifecycle.archive_reason
      : null,
    paused_at: typeof lifecycle.paused_at === 'string' ? lifecycle.paused_at : null,
    pause_reason: typeof lifecycle.pause_reason === 'string' ? lifecycle.pause_reason : null,
    superseded_at: typeof lifecycle.superseded_at === 'string' ? lifecycle.superseded_at : null,
    superseded_by_project_id: typeof lifecycle.superseded_by_project_id === 'string'
      ? lifecycle.superseded_by_project_id
      : null,
    locked_at: typeof lifecycle.locked_at === 'string' ? lifecycle.locked_at : null,
    lock_reason: typeof lifecycle.lock_reason === 'string' ? lifecycle.lock_reason : null,
    retention_policy: lifecycle.retention_policy === 'keep_until_explicit_delete_receipt'
      ? 'keep_until_explicit_delete_receipt'
      : 'keep_until_explicit_archive',
    safe_delete_gate: 'domain_owner_receipt_required',
  };
}
