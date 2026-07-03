import type { FrameworkContracts } from '../../kernel/types.ts';
import { buildDomainManifestCatalog } from '../atlas/index.ts';
import type {
  DomainManifestCatalogEntry,
  NormalizedDomainManifest,
} from '../atlas/index.ts';
import { FrameworkContractError } from '../charter/index.ts';
import type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionEffect,
  FamilyActionExportFormat,
  FamilyActionSurfaceDescriptor,
} from './family-action-catalog-contract.ts';
export {
  normalizeFamilyActionCatalog,
} from './family-action-catalog-contract.ts';
export type {
  FamilyActionCatalog,
  FamilyActionCatalogAction,
  FamilyActionEffect,
  FamilyActionExportFormat,
  FamilyActionSourceCommand,
  FamilyActionSurfaceDescriptor,
} from './family-action-catalog-contract.ts';

type JsonRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}


function surfaceCommand(action: FamilyActionCatalogAction, surface: FamilyActionSurfaceDescriptor | null) {
  return optionalString(surface?.command) ?? action.source_command.command;
}

function surfaceKind(action: FamilyActionCatalogAction, surface: FamilyActionSurfaceDescriptor | null) {
  return optionalString(surface?.surface_kind) ?? action.source_command.surface_kind;
}

function sourceOfWork(action: FamilyActionCatalogAction) {
  return action.source_of_work ?? {
    source_catalog: 'family_action_catalog' as const,
    source_catalog_ref: 'family_action_catalog',
    source_action_id: action.action_id,
    stage_catalog_ref: 'family_stage_control_plane',
    derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog' as const,
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate' as const,
  };
}

export function projectFamilyAction(action: FamilyActionCatalogAction) {
  const cliSurface = action.supported_surfaces.cli;
  const mcpSurface = action.supported_surfaces.mcp;
  const skillSurface = action.supported_surfaces.skill;
  const productEntrySurface = action.supported_surfaces.product_entry;
  const openaiSurface = action.supported_surfaces.openai;
  const aiSdkSurface = action.supported_surfaces.ai_sdk;
  const command = surfaceCommand(action, cliSurface);
  const kind = surfaceKind(action, cliSurface);
  const lineage = sourceOfWork(action);

  return {
    operator_loop_action: {
      command: surfaceCommand(action, productEntrySurface),
      surface_kind: surfaceKind(action, productEntrySurface),
      summary: action.summary,
      requires: action.workspace_locator_fields,
    },
    cli: {
      action_id: action.action_id,
      command,
      surface_kind: kind,
      summary: action.summary,
      effect: action.effect,
      input_schema_ref: action.input_schema_ref,
      output_schema_ref: action.output_schema_ref,
      source_of_work: lineage,
    },
    mcp: {
      name: optionalString(mcpSurface?.tool_name) ?? action.action_id,
      description: action.summary,
      command: surfaceCommand(action, mcpSurface),
      surface_kind: surfaceKind(action, mcpSurface),
      input_schema_ref: action.input_schema_ref,
      output_schema_ref: action.output_schema_ref,
      public_runtime: mcpSurface?.public_runtime !== false,
      descriptor_only: mcpSurface?.descriptor_only === true,
      source_of_work: lineage,
    },
    skill: {
      command_contract_id: optionalString(skillSurface?.command_contract_id) ?? action.action_id,
      action_id: action.action_id,
      command,
      surface_kind: kind,
      summary: action.summary,
      required_fields: action.workspace_locator_fields,
      effect: action.effect,
      output_schema_ref: action.output_schema_ref,
      accepted_answer_shape_ref: action.output_schema_ref,
      source_of_work: lineage,
    },
    product_entry: {
      action_key: optionalString(productEntrySurface?.action_key) ?? action.action_id,
      command: surfaceCommand(action, productEntrySurface),
      surface_kind: surfaceKind(action, productEntrySurface),
      summary: action.summary,
      requires: action.workspace_locator_fields,
      output_schema_ref: action.output_schema_ref,
      accepted_answer_shape_ref: action.output_schema_ref,
      source_of_work: lineage,
    },
    openai: {
      type: 'function',
      function: {
        name: optionalString(openaiSurface?.tool_name) ?? action.action_id,
        description: action.summary,
        parameters: {
          type: 'object',
          additionalProperties: true,
          schema_ref: action.input_schema_ref,
        },
      },
      output_schema_ref: action.output_schema_ref,
      accepted_answer_shape_ref: action.output_schema_ref,
      source_of_work: lineage,
    },
    ai_sdk: {
      name: optionalString(aiSdkSurface?.tool_name) ?? action.action_id,
      description: action.summary,
      inputSchemaRef: action.input_schema_ref,
      outputSchemaRef: action.output_schema_ref,
      command,
      source_of_work: lineage,
    },
  };
}

function projectionMatchesAction(value: unknown, action: FamilyActionCatalogAction, command: string) {
  if (!isRecord(value)) {
    return false;
  }
  return optionalString(value.action_id) === action.action_id
    || optionalString(value.command_contract_id) === action.action_id
    || optionalString(value.command_contract_id) === optionalString(action.supported_surfaces.skill?.command_contract_id)
    || optionalString(value.command) === command;
}

function collectSkillProjectionEntries(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectSkillProjectionEntries(entry));
  }
  if (!isRecord(value)) {
    return [];
  }

  const entries: JsonRecord[] = [];
  if (
    optionalString(value.action_id)
    || optionalString(value.command_contract_id)
    || optionalString(value.command)
  ) {
    entries.push(value);
  }

  const directProjection = value.action_catalog_projection;
  entries.push(...collectSkillProjectionEntries(directProjection));

  const groupedProjection = value.action_catalog_projections;
  if (isRecord(groupedProjection)) {
    entries.push(...collectSkillProjectionEntries(groupedProjection.skill));
  }

  return entries;
}

function hasSkillProjectionContract(
  manifest: Pick<NormalizedDomainManifest, 'skill_catalog'> | null,
  action: FamilyActionCatalogAction,
  command: string,
) {
  const skillCatalog = manifest?.skill_catalog;
  if (!skillCatalog) {
    return true;
  }

  const contracts = skillCatalog.command_contracts ?? [];
  if (contracts.some((entry) => projectionMatchesAction(entry, action, command))) {
    return true;
  }

  return skillCatalog.skills.some((skill) =>
    collectSkillProjectionEntries(skill.domain_projection).some((entry) =>
      projectionMatchesAction(entry, action, command)
    )
  );
}

export function buildFamilyActionCatalogParity(
  catalog: FamilyActionCatalog,
  manifest: Pick<NormalizedDomainManifest, 'operator_loop_actions' | 'skill_catalog'> | null = null,
) {
  const issues: string[] = [];
  for (const action of catalog.actions) {
    const projections = projectFamilyAction(action);
    const lineage = sourceOfWork(action);
    if (lineage.source_catalog !== 'family_action_catalog') {
      issues.push(`${action.action_id}: source-of-work must originate in family_action_catalog`);
    }
    if (lineage.source_action_id !== action.action_id) {
      issues.push(`${action.action_id}: source-of-work action id diverges from action catalog`);
    }
    if (
      lineage.derived_surface_policy
      !== 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog'
    ) {
      issues.push(`${action.action_id}: source-of-work derived surface policy is not canonical`);
    }
    const projectedLineages = [
      projections.cli.source_of_work,
      projections.mcp.source_of_work,
      projections.skill.source_of_work,
      projections.product_entry.source_of_work,
      projections.openai.source_of_work,
      projections.ai_sdk.source_of_work,
    ];
    if (!projectedLineages.every((lineage) => lineage.source_action_id === action.action_id)) {
      issues.push(`${action.action_id}: generated surface lineage diverges from source action`);
    }
    if (projections.cli.command !== action.source_command.command) {
      issues.push(`${action.action_id}: cli command diverges from source command`);
    }
    if (action.supported_surfaces.product_entry?.command) {
      const expected = action.supported_surfaces.product_entry.command;
      if (projections.product_entry.command !== expected) {
        issues.push(`${action.action_id}: product-entry command projection diverges`);
      }
    }

    const manifestAction =
      manifest?.operator_loop_actions?.[action.action_id]
      ?? manifest?.operator_loop_actions?.[projections.product_entry.action_key];
    if (manifestAction && optionalString(manifestAction.command) !== projections.product_entry.command) {
      issues.push(`${action.action_id}: operator_loop_actions command diverges from action catalog`);
    }

    if (action.supported_surfaces.skill && !hasSkillProjectionContract(manifest, action, projections.skill.command)) {
      issues.push(`${action.action_id}: skill command contract missing`);
    }
  }

  return {
    surface_kind: 'family_action_catalog_parity',
    status: issues.length === 0 ? 'aligned' : 'drift_detected',
    issues,
  };
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
  const key = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    mas: 'medautoscience',
    'med-autoscience': 'medautoscience',
    medautoscience: 'medautoscience',
    mag: 'medautogrant',
    'med-autogrant': 'medautogrant',
    medautogrant: 'medautogrant',
    rca: 'redcube',
    redcube: 'redcube',
    'redcube-ai': 'redcube',
    redcube_ai: 'redcube',
  };
  return aliases[key] ?? key;
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

export function projectFamilyActionCatalog(catalog: FamilyActionCatalog, format: FamilyActionExportFormat) {
  return catalog.actions.map((action) => {
    const projections = projectFamilyAction(action);
    switch (format) {
      case 'cli':
        return projections.cli;
      case 'mcp':
        return projections.mcp;
      case 'skill':
        return projections.skill;
      case 'openai':
        return projections.openai;
      case 'ai-sdk':
        return projections.ai_sdk;
    }
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
