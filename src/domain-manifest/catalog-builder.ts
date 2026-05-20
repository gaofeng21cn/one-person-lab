import type { FrameworkContracts } from '../types.ts';
import { getActiveWorkspaceBinding } from '../workspace-registry.ts';
import type { ManifestCommandTimeoutPolicy } from './resolver.ts';
import { resolveBindingManifest } from './resolver.ts';
import {
  hydrateDomainManifestCatalogFromProjectionCache,
  writeResolvedDomainManifestProjectionCache,
} from './projection-cache.ts';

export function buildDomainManifestCatalog(
  contracts: FrameworkContracts,
  options: {
    manifestCommandTimeoutMs?: number;
    manifestCommandTimeoutPolicy?: ManifestCommandTimeoutPolicy;
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
      notes: [
        'This surface executes the domain-owned manifest_command for active admitted-domain bindings only.',
        '`opl workspace list` remains the non-executing registry; `opl domain manifests` is the sibling discovery surface that resolves machine-readable product-entry manifests.',
      ],
    },
  };
}
