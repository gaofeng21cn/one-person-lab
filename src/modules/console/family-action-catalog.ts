import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  matchesStandardDomainAgentCatalogEntry,
  normalizeStandardDomainAgentId,
  resolveStandardAgent,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../kernel/standard-agent-registry.ts';
import {
  resolveBindingManifest,
  loadManagedStandardAgentContractCatalog,
} from '../atlas/index.ts';
import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { resolveStandardAgentContractCheckout } from '../connect/index.ts';
import { getActiveWorkspaceBinding } from '../workspace/index.ts';
import type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionEffect,
  FamilyActionExportFormat,
} from './family-action-catalog-contract.ts';
import {
  buildFamilyActionCatalogParity,
  projectFamilyAction,
  projectFamilyActionCatalog,
} from '../../kernel/family-action-catalog-projection.ts';
export {
  buildFamilyActionCatalogParity,
  projectFamilyAction,
  projectFamilyActionCatalog,
} from '../../kernel/family-action-catalog-projection.ts';
export {
  assertFamilyActionHandlerRefsResolve,
  normalizeDomainHandlerRegistry,
  normalizeFamilyActionCatalog,
} from './family-action-catalog-contract.ts';
export type {
  DomainHandlerImplementation,
  DomainHandlerRegistry,
  DomainHandlerRegistryEntry,
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionEffect,
  FamilyActionExecutionBinding,
  FamilyActionExportFormat,
  FamilyActionSurfaceDescriptor,
} from './family-action-catalog-contract.ts';

export interface FamilyActionListEntry {
  project_id: string;
  project: string;
  target_domain_id: string;
  catalog_id: string;
  action_id: string;
  title: string;
  summary: string;
  owner: string;
  effect: FamilyActionEffect;
  command: string;
  surface_kind: string;
  supported_surface_kinds: string[];
  human_gate_ids: string[];
}

type FamilyActionDomainEntry = {
  project_id: string;
  project: string;
  binding_id: string | null;
  workspace_path: string | null;
  manifest_status: string;
  target_domain_id: string | null;
  catalog: FamilyActionCatalog | null;
  projection_manifest: DomainManifestCatalogEntry['manifest'];
  catalog_source: Record<string, unknown> | null;
  stage_catalog: Record<string, unknown> | null;
  legacy_binding: Record<string, unknown>;
  error: unknown;
};

function actionWorkspace(entry: FamilyActionDomainEntry) {
  if (!entry.workspace_path) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Resolved family action catalogs require an absolute workspace path.',
      { project_id: entry.project_id, target_domain_id: entry.target_domain_id },
    );
  }
  return entry.workspace_path;
}

function buildFamilyActionListEntry(
  entry: FamilyActionDomainEntry,
  catalog: FamilyActionCatalog,
  action: FamilyActionCatalogAction,
): FamilyActionListEntry {
  const projection = projectFamilyAction(action, catalog.target_domain_id, actionWorkspace(entry)).cli;
  return {
    project_id: entry.project_id,
    project: entry.project,
    target_domain_id: catalog.target_domain_id,
    catalog_id: catalog.catalog_id,
    action_id: action.action_id,
    title: action.title,
    summary: action.summary,
    owner: action.owner,
    effect: action.effect,
    command: projection.command,
    surface_kind: projection.surface_kind,
    supported_surface_kinds: Object.entries(action.supported_surfaces)
      .filter(([, descriptor]) => descriptor !== null)
      .map(([surface]) => surface),
    human_gate_ids: action.human_gate_ids,
  };
}

function legacyBindingProjection(
  binding: ReturnType<typeof getActiveWorkspaceBinding>,
  status: 'not_bound' | 'migration_diagnostic_only' | 'active_legacy_source',
) {
  return {
    source_role: status,
    binding_id: binding?.binding_id ?? null,
    workspace_path: binding?.workspace_path ?? null,
    manifest_command_configured: Boolean(binding?.direct_entry.manifest_command),
    used_for_catalog_resolution: status === 'active_legacy_source',
  };
}

function managedContractError(error: unknown) {
  return {
    code: error instanceof FrameworkContractError ? error.code : 'managed_contract_invalid',
    message: error instanceof Error ? error.message : String(error),
    details: error instanceof FrameworkContractError ? error.details : {},
  };
}

function buildManagedActionDomainEntry(
  agent: typeof STANDARD_AGENT_REGISTRY[number],
): FamilyActionDomainEntry {
  const binding = getActiveWorkspaceBinding(agent.domain_id);
  try {
    const source = resolveStandardAgentContractCheckout(agent.domain_id);
    if (!source) {
      return {
        project_id: agent.domain_id,
        project: agent.project,
        binding_id: binding?.binding_id ?? null,
        workspace_path: process.cwd(),
        manifest_status: 'managed_contract_unavailable',
        target_domain_id: agent.target_domain_id,
        catalog: null,
        projection_manifest: null,
        catalog_source: null,
        stage_catalog: null,
        legacy_binding: legacyBindingProjection(binding, binding ? 'migration_diagnostic_only' : 'not_bound'),
        error: {
          code: 'managed_contract_unavailable',
          message: 'The Standard Agent managed source checkout is unavailable or not current.',
        },
      };
    }
    const resolved = loadManagedStandardAgentContractCatalog({
      requested_domain_id: agent.domain_id,
      checkout_agent_id: source.agent_id,
      checkout_path: source.checkout_path,
    });

    return {
      project_id: agent.domain_id,
      project: agent.project,
      binding_id: binding?.binding_id ?? null,
      workspace_path: process.cwd(),
      manifest_status: 'resolved',
      target_domain_id: resolved.catalog.target_domain_id,
      catalog: resolved.catalog,
      projection_manifest: null,
      catalog_source: {
        source_kind: 'managed_standard_agent_contract',
        package_id: source.package_id,
        checkout_source_kind: source.source_kind,
        install_origin: source.install_origin,
        checkout_path: source.checkout_path,
        action_catalog_ref: resolved.action_catalog_ref,
        authority_boundary: resolved.authority_boundary,
      },
      stage_catalog: {
        source_kind: 'compiled_managed_standard_agent_stage_catalog',
        source_ref: resolved.stage_catalog_ref,
        plane_id: resolved.stage_control_plane.plane_id,
        stage_count: resolved.stage_control_plane.stages.length,
        stage_ids: resolved.stage_control_plane.stages.map((stage) => stage.stage_id),
      },
      legacy_binding: legacyBindingProjection(binding, binding ? 'migration_diagnostic_only' : 'not_bound'),
      error: null,
    };
  } catch (error) {
    return {
      project_id: agent.domain_id,
      project: agent.project,
      binding_id: binding?.binding_id ?? null,
      workspace_path: process.cwd(),
      manifest_status: 'managed_contract_invalid',
      target_domain_id: agent.target_domain_id,
      catalog: null,
      projection_manifest: null,
      catalog_source: null,
      stage_catalog: null,
      legacy_binding: legacyBindingProjection(binding, binding ? 'migration_diagnostic_only' : 'not_bound'),
      error: managedContractError(error),
    };
  }
}

function buildLegacyActionDomainEntry(
  domain: FrameworkContracts['domains']['domains'][number],
): FamilyActionDomainEntry {
  const binding = getActiveWorkspaceBinding(domain.domain_id);
  if (!binding) {
    return {
      project_id: domain.domain_id,
      project: domain.project,
      binding_id: null,
      workspace_path: null,
      manifest_status: 'not_bound',
      target_domain_id: null,
      catalog: null,
      projection_manifest: null,
      catalog_source: null,
      stage_catalog: null,
      legacy_binding: legacyBindingProjection(null, 'not_bound'),
      error: null,
    };
  }
  const manifestEntry = resolveBindingManifest(domain.domain_id, domain.project, binding);
  const catalog = manifestEntry.status === 'resolved'
    ? manifestEntry.manifest?.family_action_catalog ?? null
    : null;
  const stageControlPlane = manifestEntry.status === 'resolved'
    ? manifestEntry.manifest?.family_stage_control_plane ?? null
    : null;
  return {
    project_id: domain.domain_id,
    project: domain.project,
    binding_id: binding.binding_id,
    workspace_path: binding.workspace_path,
    manifest_status: manifestEntry.status,
    target_domain_id: catalog?.target_domain_id ?? manifestEntry.manifest?.target_domain_id ?? null,
    catalog,
    projection_manifest: manifestEntry.manifest,
    catalog_source: catalog
      ? {
          source_kind: 'legacy_direct_entry_manifest',
          workspace_path: binding.workspace_path,
          authority_boundary: {
            source_role: 'non_standard_or_migration_only',
            opl_can_write_domain_truth: false,
          },
        }
      : null,
    stage_catalog: stageControlPlane
      ? {
          source_kind: 'legacy_direct_entry_manifest',
          plane_id: stageControlPlane.plane_id,
          stage_count: stageControlPlane.stages.length,
          stage_ids: stageControlPlane.stages.map((stage) => stage.stage_id),
        }
      : null,
    legacy_binding: legacyBindingProjection(binding, 'active_legacy_source'),
    error: manifestEntry.error,
  };
}

function buildActionIndex(contracts: FrameworkContracts) {
  const standardAgents = STANDARD_AGENT_REGISTRY.filter(
    (agent) => agent.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP,
  );
  const standardAgentIds = new Set<string>(standardAgents.map((agent) => agent.agent_id));
  const entries = [
    ...standardAgents.map(buildManagedActionDomainEntry),
    ...contracts.domains.domains
      .filter((domain) => {
        const agent = resolveStandardAgent(domain.domain_id);
        return !agent || !standardAgentIds.has(agent.agent_id);
      })
      .map(buildLegacyActionDomainEntry),
  ];
  const domains = entries.map((entry) => {
    const actionCatalog = entry.catalog;
    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      manifest_status: entry.manifest_status,
      target_domain_id: actionCatalog?.target_domain_id ?? entry.target_domain_id,
      catalog_id: actionCatalog?.catalog_id ?? null,
      action_count: actionCatalog?.actions.length ?? 0,
      ready: Boolean(actionCatalog),
      catalog_source: entry.catalog_source,
      stage_catalog: entry.stage_catalog,
      legacy_binding: entry.legacy_binding,
      error: entry.error,
    };
  });
  const actions = entries.flatMap((entry) => {
    const actionCatalog = entry.catalog;
    return actionCatalog
      ? actionCatalog.actions.map((action) => buildFamilyActionListEntry(entry, actionCatalog, action))
      : [];
  });

  return {
    entries,
    domains,
    actions,
  };
}

export function buildFamilyActionsList(contracts: FrameworkContracts) {
  const index = buildActionIndex(contracts);
  return {
    version: 'g2',
    family_actions: {
      surface_kind: 'opl_family_action_catalog_index',
      summary: {
        total_projects_count: index.domains.length,
        resolved_catalogs_count: index.domains.filter((entry) => entry.ready).length,
        managed_catalogs_count: index.domains.filter(
          (entry) => entry.catalog_source?.source_kind === 'managed_standard_agent_contract',
        ).length,
        legacy_catalogs_count: index.domains.filter(
          (entry) => entry.catalog_source?.source_kind === 'legacy_direct_entry_manifest',
        ).length,
        actions_count: index.actions.length,
      },
      domains: index.domains,
      actions: index.actions,
    },
  };
}

function normalizeDomainSelection(value: string) {
  return normalizeStandardDomainAgentId(value);
}

function findDomainEntry(contracts: FrameworkContracts, domain: string) {
  const index = buildActionIndex(contracts);
  const normalized = normalizeDomainSelection(domain);
  const entry = index.entries.find((candidate) => {
    const catalog = candidate.catalog;
    return candidate.project_id === normalized
      || candidate.project === normalized
      || matchesStandardDomainAgentCatalogEntry(domain, candidate)
      || catalog?.target_domain_id === domain
      || catalog?.target_domain_id === normalized
      || candidate.target_domain_id === normalized;
  });
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family action domain: ${domain}.`, {
      domain,
      allowed_domains: index.entries.map((project) => project.project_id),
    });
  }
  const catalog = entry.catalog;
  if (!catalog) {
    throw new FrameworkContractError('missing_family_action_catalog', `Domain does not expose a family action catalog: ${domain}.`, {
      domain,
      manifest_status: entry.manifest_status,
      error: entry.error,
    });
  }
  return { entry, catalog };
}

function findAction(catalog: FamilyActionCatalog, actionId: string) {
  const action = catalog.actions.find((candidate) => candidate.action_id === actionId);
  if (!action) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family action: ${actionId}.`, {
      action_id: actionId,
      allowed_actions: catalog.actions.map((candidate) => candidate.action_id),
    });
  }
  return action;
}

function parseOptionArgs(args: string[], required: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new FrameworkContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    parsed[token.slice(2)] = value;
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new FrameworkContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return parsed;
}

export function buildFamilyActionInspect(contracts: FrameworkContracts, args: string[]) {
  const parsed = parseOptionArgs(args, ['domain', 'action']);
  const { entry, catalog } = findDomainEntry(contracts, parsed.domain);
  const action = findAction(catalog, parsed.action);
  const workspacePath = actionWorkspace(entry);
  const projections = projectFamilyAction(action, catalog.target_domain_id, workspacePath);
  return {
    version: 'g2',
    family_action: {
      surface_kind: 'opl_family_action_inspection',
      project_id: entry.project_id,
      project: entry.project,
      target_domain_id: catalog.target_domain_id,
      catalog_id: catalog.catalog_id,
      catalog_source: entry.catalog_source,
      stage_catalog: entry.stage_catalog,
      legacy_binding: entry.legacy_binding,
      action,
      projections,
      parity: buildFamilyActionCatalogParity(catalog, workspacePath, entry.projection_manifest),
    },
  };
}

function parseExportFormat(value: string): FamilyActionExportFormat {
  if (['cli', 'mcp', 'skill', 'openai', 'ai-sdk'].includes(value)) {
    return value as FamilyActionExportFormat;
  }
  throw new FrameworkContractError('cli_usage_error', `Unsupported family action export format: ${value}.`, {
    format: value,
    allowed_formats: ['cli', 'mcp', 'skill', 'openai', 'ai-sdk'],
  });
}

export function buildFamilyActionExport(contracts: FrameworkContracts, args: string[]) {
  const parsed = parseOptionArgs(args, ['domain', 'format']);
  const format = parseExportFormat(parsed.format);
  const { entry, catalog } = findDomainEntry(contracts, parsed.domain);
  const workspacePath = actionWorkspace(entry);
  return {
    version: 'g2',
    family_action_export: {
      surface_kind: 'opl_family_action_catalog_export',
      project_id: entry.project_id,
      project: entry.project,
      target_domain_id: catalog.target_domain_id,
      catalog_id: catalog.catalog_id,
      catalog_source: entry.catalog_source,
      stage_catalog: entry.stage_catalog,
      legacy_binding: entry.legacy_binding,
      format,
      descriptors: projectFamilyActionCatalog(catalog, format, workspacePath),
      parity: buildFamilyActionCatalogParity(catalog, workspacePath, entry.projection_manifest),
    },
  };
}
