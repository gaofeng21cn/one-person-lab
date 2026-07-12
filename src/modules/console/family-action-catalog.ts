import type { FrameworkContracts } from '../../kernel/types.ts';
import { normalizeStandardDomainAgentId } from '../../kernel/standard-agent-registry.ts';
import { buildDomainManifestCatalog } from '../atlas/index.ts';
import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
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
  normalizeFamilyActionCatalog,
  resolveFamilyActionHandlerBinding,
} from './family-action-catalog-contract.ts';
export type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionEffect,
  FamilyActionExportFormat,
  FamilyActionHandlerBinding,
  FamilyActionSourceCommand,
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

export function buildFamilyActionListEntry(
  entry: DomainManifestCatalogEntry,
  catalog: FamilyActionCatalog,
  action: FamilyActionCatalogAction,
): FamilyActionListEntry {
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
    command: action.source_command.command,
    surface_kind: action.source_command.surface_kind,
    supported_surface_kinds: Object.entries(action.supported_surfaces)
      .filter(([, descriptor]) => descriptor !== null)
      .map(([surface]) => surface),
    human_gate_ids: action.human_gate_ids,
  };
}

function resolveCatalogFromEntry(entry: DomainManifestCatalogEntry) {
  return entry.status === 'resolved' ? entry.manifest?.family_action_catalog ?? null : null;
}

function buildActionIndex(contracts: FrameworkContracts) {
  const catalog = buildDomainManifestCatalog(contracts).domain_manifests;
  const domains = catalog.projects.map((entry) => {
    const actionCatalog = resolveCatalogFromEntry(entry);
    return {
      project_id: entry.project_id,
      project: entry.project,
      binding_id: entry.binding_id,
      manifest_status: entry.status,
      target_domain_id: actionCatalog?.target_domain_id ?? entry.manifest?.target_domain_id ?? null,
      catalog_id: actionCatalog?.catalog_id ?? null,
      action_count: actionCatalog?.actions.length ?? 0,
      ready: Boolean(actionCatalog),
      error: entry.error,
    };
  });
  const actions = catalog.projects.flatMap((entry) => {
    const actionCatalog = resolveCatalogFromEntry(entry);
    return actionCatalog
      ? actionCatalog.actions.map((action) => buildFamilyActionListEntry(entry, actionCatalog, action))
      : [];
  });

  return {
    domain_manifests: catalog,
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
  const entry = index.domain_manifests.projects.find((candidate) => {
    const catalog = resolveCatalogFromEntry(candidate);
    return candidate.project_id === normalized
      || candidate.project === normalized
      || catalog?.target_domain_id === domain
      || catalog?.target_domain_id === normalized
      || candidate.manifest?.domain_entry_contract?.domain_agent_entry_spec?.agent_id === normalized;
  });
  if (!entry) {
    throw new FrameworkContractError('cli_usage_error', `Unknown family action domain: ${domain}.`, {
      domain,
      allowed_domains: index.domain_manifests.projects.map((project) => project.project_id),
    });
  }
  const catalog = resolveCatalogFromEntry(entry);
  if (!catalog) {
    throw new FrameworkContractError('missing_family_action_catalog', `Domain does not expose a family action catalog: ${domain}.`, {
      domain,
      manifest_status: entry.status,
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
  const projections = projectFamilyAction(action);
  return {
    version: 'g2',
    family_action: {
      surface_kind: 'opl_family_action_inspection',
      project_id: entry.project_id,
      project: entry.project,
      target_domain_id: catalog.target_domain_id,
      catalog_id: catalog.catalog_id,
      action,
      projections,
      parity: buildFamilyActionCatalogParity(catalog, entry.manifest),
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
  return {
    version: 'g2',
    family_action_export: {
      surface_kind: 'opl_family_action_catalog_export',
      project_id: entry.project_id,
      project: entry.project,
      target_domain_id: catalog.target_domain_id,
      catalog_id: catalog.catalog_id,
      format,
      descriptors: projectFamilyActionCatalog(catalog, format),
      parity: buildFamilyActionCatalogParity(catalog, entry.manifest),
    },
  };
}
