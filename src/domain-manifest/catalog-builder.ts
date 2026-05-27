import type { FrameworkContracts } from '../types.ts';
import { getActiveWorkspaceBinding } from '../workspace-registry.ts';
import type { ManifestCommandTimeoutPolicy } from './resolver.ts';
import { resolveBindingManifest } from './resolver.ts';
import {
  hydrateDomainManifestCatalogFromProjectionCache,
  writeResolvedDomainManifestProjectionCache,
} from './projection-cache.ts';
import { buildOplMetaAgentRegistryExtension } from '../opl-meta-agent-consumption.ts';
import type { DomainManifestCatalogEntry } from './types.ts';

export type DomainManifestCatalog = {
  summary: {
    total_projects_count: number;
    active_bindings_count: number;
    manifest_configured_count: number;
    resolved_count: number;
    failed_count: number;
    projection_cache_used_count: number;
    live_failed_project_ids: string[];
  };
  projects: DomainManifestCatalogEntry[];
  opl_meta_agent_registry?: ReturnType<typeof buildOplMetaAgentRegistryExtension>;
  notes: string[];
};

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
  const liveFailedProjectIds = new Set(liveProjects
    .filter((entry) =>
      entry.status === 'command_failed'
      || entry.status === 'command_timeout'
      || entry.status === 'invalid_json'
      || entry.status === 'invalid_manifest'
    )
    .map((entry) => entry.project_id));

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
      projects,
      opl_meta_agent_registry: buildOplMetaAgentRegistryExtension(),
      notes: [
        'This surface executes the domain-owned manifest_command for active admitted-domain bindings only.',
        '`opl workspace list` remains the non-executing registry; `opl domain manifests` is the sibling discovery surface that resolves machine-readable product-entry manifests.',
        '`opl_meta_agent_registry` is a refs-only registry/App projection extension and does not expand production domain truth or readiness authority.',
      ],
    } satisfies DomainManifestCatalog,
  };
}
