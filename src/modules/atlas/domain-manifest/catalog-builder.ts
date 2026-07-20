import type { FrameworkContracts } from '../../../kernel/types.ts';
import { getActiveWorkspaceBinding } from '../../workspace/index.ts';
import type { ManifestCommandTimeoutPolicy } from './resolver.ts';
import { resolveBindingManifest } from './resolver.ts';
import {
  hydrateDomainManifestCatalogFromProjectionCache,
  writeResolvedDomainManifestProjectionCache,
} from './projection-cache.ts';
import type { DomainManifestCatalogEntry } from './types.ts';

type DomainManifestCurrentnessOwnerAction = Record<string, unknown>;

export type DomainManifestCatalog = {
  summary: {
    total_projects_count: number;
    active_bindings_count: number;
    stale_binding_count: number;
    stale_binding_project_ids: string[];
    manifest_not_configured_count: number;
    manifest_not_configured_project_ids: string[];
    currentness_owner_action_packet_count?: number;
    currentness_owner_action_project_ids?: string[];
    manifest_configured_count: number;
    resolved_count: number;
    failed_count: number;
    projection_cache_used_count: number;
    live_failed_project_ids: string[];
    [key: string]: unknown;
  };
  projects: DomainManifestCatalogEntry[];
  currentness_owner_action_packet?: {
    surface_kind: 'opl_domain_manifest_currentness_owner_action_packet';
    status: 'clear' | 'owner_action_required';
    item_count: number;
    project_ids: string[];
    items: DomainManifestCurrentnessOwnerAction[];
    authority_boundary: Record<string, unknown>;
  };
  notes: string[];
};

function currentnessAuthorityBoundary() {
  return {
    refs_only: true,
    can_write_workspace_registry: false,
    can_execute_manifest_command: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function workspacePathOrPlaceholder(entry: DomainManifestCatalogEntry) {
  return entry.workspace_path ?? '<workspace-path>';
}

function isCurrentnessOwnerAction(
  value: DomainManifestCurrentnessOwnerAction | null,
): value is DomainManifestCurrentnessOwnerAction {
  return Boolean(value);
}

function buildCurrentnessOwnerActionPacket(
  entry: DomainManifestCatalogEntry,
): DomainManifestCurrentnessOwnerAction | null {
  if (entry.status === 'workspace_missing') {
    return {
      surface_kind: 'opl_domain_manifest_currentness_owner_action',
      status: 'owner_action_required',
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      manifest_status: entry.status,
      reason: 'active_workspace_binding_path_missing',
      owner: 'workspace_binding_owner_or_domain_agent_owner',
      action_id: 'rebind_or_archive_stale_workspace_binding',
      accepted_owner_answer_shapes: [
        'workspace_rebind_ref',
        'workspace_archive_ref',
        'typed_blocker_ref',
      ],
      safe_commands: {
        rebind_command:
          `opl workspace bind --project ${entry.project_id} --path ${workspacePathOrPlaceholder(entry)} --manifest-command <manifest-command>`,
        archive_command:
          `opl workspace archive --project ${entry.project_id} --path ${workspacePathOrPlaceholder(entry)}`,
        verify_command: 'opl domain manifests --json',
        workspace_projects_command: 'opl workspace projects --json',
      },
      authority_boundary: currentnessAuthorityBoundary(),
    };
  }
  if (entry.status === 'manifest_not_configured') {
    return {
      surface_kind: 'opl_domain_manifest_currentness_owner_action',
      status: 'owner_action_required',
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      manifest_status: entry.status,
      reason: 'manifest_command_not_configured',
      owner: 'workspace_binding_owner_or_domain_agent_owner',
      action_id: 'configure_manifest_command_or_record_typed_blocker',
      accepted_owner_answer_shapes: [
        'manifest_command_configured_ref',
        'typed_blocker_ref',
      ],
      safe_commands: {
        rebind_command:
          `opl workspace bind --project ${entry.project_id} --path ${workspacePathOrPlaceholder(entry)} --manifest-command <manifest-command>`,
        archive_command: null,
        verify_command: 'opl domain manifests --json',
        workspace_projects_command: 'opl workspace projects --json',
      },
      authority_boundary: currentnessAuthorityBoundary(),
    };
  }
  if (
    entry.status === 'command_failed'
    || entry.status === 'command_timeout'
    || entry.status === 'invalid_json'
    || entry.status === 'invalid_manifest'
  ) {
    return {
      surface_kind: 'opl_domain_manifest_currentness_owner_action',
      status: 'owner_action_required',
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      manifest_status: entry.status,
      reason: 'manifest_command_live_resolution_failed',
      owner: 'workspace_binding_owner_or_domain_agent_owner',
      action_id: 'repair_manifest_command_or_record_typed_blocker',
      accepted_owner_answer_shapes: [
        'manifest_command_repaired_ref',
        'typed_blocker_ref',
      ],
      safe_commands: {
        rebind_command:
          `opl workspace bind --project ${entry.project_id} --path ${workspacePathOrPlaceholder(entry)} --manifest-command <manifest-command>`,
        archive_command: null,
        verify_command: 'opl domain manifests --json',
        workspace_projects_command: 'opl workspace projects --json',
      },
      authority_boundary: currentnessAuthorityBoundary(),
    };
  }
  return null;
}

export function buildDomainManifestCatalog(
  contracts: FrameworkContracts,
  options: {
    manifestCommandTimeoutMs?: number;
    manifestCommandTimeoutPolicy?: ManifestCommandTimeoutPolicy;
    materializeFamilyTransitions?: boolean;
    transitionMaterializationTimeoutMs?: number;
    useProjectionCacheOnFailure?: boolean;
    writeProjectionCache?: boolean;
  } = {},
) {
  const liveProjects = contracts.domains.domains.map((domain) => {
    const binding = getActiveWorkspaceBinding(domain.domain_id);
    if (!binding) {
      return {
        project_id: domain.domain_id,
        project: domain.project,
        binding_id: null,
        workspace_path: null,
        manifest_command: null,
        status: 'not_bound' as const,
        manifest: null,
        error: null,
      };
    }

    return resolveBindingManifest(domain.domain_id, domain.project, binding, {
      timeoutMs: options.manifestCommandTimeoutMs,
      timeoutPolicy: options.manifestCommandTimeoutPolicy,
      materializeFamilyTransitions: options.materializeFamilyTransitions,
      transitionMaterializationTimeoutMs: options.transitionMaterializationTimeoutMs,
    });
  });
  if (options.writeProjectionCache !== false) {
    writeResolvedDomainManifestProjectionCache(liveProjects);
  }
  const projects = options.useProjectionCacheOnFailure
    ? hydrateDomainManifestCatalogFromProjectionCache(liveProjects)
    : liveProjects;
  const currentnessOwnerActionPackets = liveProjects
    .map(buildCurrentnessOwnerActionPacket)
    .filter(isCurrentnessOwnerAction);
  const currentnessOwnerActionByProject = new Map(currentnessOwnerActionPackets.map((entry) => [
    String(entry.project_id),
    entry,
  ]));
  const projectsWithCurrentnessOwnerAction = projects.map((entry) => ({
    ...entry,
    currentness_owner_action_packet:
      currentnessOwnerActionByProject.get(entry.project_id) ?? null,
  }));
  const currentnessOwnerActionProjectIds = currentnessOwnerActionPackets
    .map((entry) => String(entry.project_id));
  const currentnessOwnerActionPacket = {
    surface_kind: 'opl_domain_manifest_currentness_owner_action_packet' as const,
    status: currentnessOwnerActionPackets.length > 0
      ? 'owner_action_required' as const
      : 'clear' as const,
    item_count: currentnessOwnerActionPackets.length,
    project_ids: currentnessOwnerActionProjectIds,
    items: currentnessOwnerActionPackets,
    authority_boundary: currentnessAuthorityBoundary(),
  };
  const liveFailedProjectIds = new Set(liveProjects
    .filter((entry) =>
      entry.status === 'command_failed'
      || entry.status === 'command_timeout'
      || entry.status === 'invalid_json'
      || entry.status === 'invalid_manifest'
    )
    .map((entry) => entry.project_id));
  const staleBindingProjectIds = liveProjects
    .filter((entry) => entry.status === 'workspace_missing')
    .map((entry) => entry.project_id);
  const manifestNotConfiguredProjectIds = liveProjects
    .filter((entry) => entry.status === 'manifest_not_configured')
    .map((entry) => entry.project_id);

  return {
    version: 'g2',
    contracts_context: {
      contracts_dir: contracts.contractsDir,
      contracts_root_source: contracts.contractsRootSource,
    },
    domain_manifests: {
      summary: {
        total_projects_count: projects.length,
        active_bindings_count: projects.filter((entry) => entry.binding_id !== null).length,
        stale_binding_count: staleBindingProjectIds.length,
        stale_binding_project_ids: staleBindingProjectIds,
        manifest_not_configured_count: manifestNotConfiguredProjectIds.length,
        manifest_not_configured_project_ids: manifestNotConfiguredProjectIds,
        currentness_owner_action_packet_count: currentnessOwnerActionPackets.length,
        currentness_owner_action_project_ids: currentnessOwnerActionProjectIds,
        manifest_configured_count: projects.filter((entry) => entry.manifest_command !== null).length,
        resolved_count: projects.filter((entry) => entry.status === 'resolved').length,
        failed_count: liveProjects.filter((entry) =>
          entry.status === 'command_failed'
          || entry.status === 'command_timeout'
          || entry.status === 'invalid_json'
          || entry.status === 'invalid_manifest'
        ).length,
        projection_cache_used_count: projects.filter((entry) => entry.manifest_cache).length,
        live_failed_project_ids: [...liveFailedProjectIds],
      },
      projects: projectsWithCurrentnessOwnerAction,
      currentness_owner_action_packet: currentnessOwnerActionPacket,
      notes: [
        'This surface executes the domain-owned manifest_command for active admitted-domain bindings only.',
        '`opl workspace list` remains the non-executing registry; `opl domain manifests` is the sibling discovery surface that resolves machine-readable product-entry manifests.',
      ],
    } satisfies DomainManifestCatalog,
  };
}
