import type { GatewayContracts } from './types.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import type {
  DomainManifestCatalogEntry,
  NormalizedDomainManifest,
} from './domain-manifest/types.ts';
import { GatewayContractError } from './contracts.ts';

type JsonRecord = Record<string, unknown>;

export type FamilyActionEffect = 'read_only' | 'mutating';
export type FamilyActionExportFormat = 'cli' | 'mcp' | 'skill' | 'openai' | 'ai-sdk';

export interface FamilyActionSourceCommand {
  command: string;
  surface_kind: string;
}

export interface FamilyActionSurfaceDescriptor {
  command?: string;
  surface_kind?: string;
  tool_name?: string;
  command_contract_id?: string;
  action_key?: string;
  public_runtime?: boolean;
  descriptor_only?: boolean;
}

export interface FamilyActionCatalogAction {
  action_id: string;
  title: string;
  summary: string;
  owner: string;
  effect: FamilyActionEffect;
  source_command: FamilyActionSourceCommand;
  input_schema_ref: string;
  output_schema_ref: string;
  workspace_locator_fields: string[];
  human_gate_ids: string[];
  supported_surfaces: {
    cli: FamilyActionSurfaceDescriptor | null;
    mcp: FamilyActionSurfaceDescriptor | null;
    skill: FamilyActionSurfaceDescriptor | null;
    product_entry: FamilyActionSurfaceDescriptor | null;
    openai: FamilyActionSurfaceDescriptor | null;
    ai_sdk: FamilyActionSurfaceDescriptor | null;
  };
  authority_boundary: JsonRecord | null;
}

export interface FamilyActionCatalog {
  surface_kind: 'family_action_catalog';
  version: 'family-action-catalog.v1';
  catalog_id: string;
  target_domain_id: string;
  owner: string;
  authority_boundary: JsonRecord;
  actions: FamilyActionCatalogAction[];
  notes: string[];
}

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

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeSurfaceDescriptor(value: unknown): FamilyActionSurfaceDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    ...(optionalString(value.command) ? { command: optionalString(value.command)! } : {}),
    ...(optionalString(value.surface_kind) ? { surface_kind: optionalString(value.surface_kind)! } : {}),
    ...(optionalString(value.tool_name) ? { tool_name: optionalString(value.tool_name)! } : {}),
    ...(optionalString(value.command_contract_id)
      ? { command_contract_id: optionalString(value.command_contract_id)! }
      : {}),
    ...(optionalString(value.action_key) ? { action_key: optionalString(value.action_key)! } : {}),
    ...(typeof value.public_runtime === 'boolean' ? { public_runtime: value.public_runtime } : {}),
    ...(typeof value.descriptor_only === 'boolean' ? { descriptor_only: value.descriptor_only } : {}),
  };
}

function normalizeFamilyAction(value: unknown, field: string): FamilyActionCatalogAction {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }

  const rawEffect = requireString(value.effect, `${field}.effect`);
  if (rawEffect !== 'read_only' && rawEffect !== 'mutating') {
    throw new Error(`${field}.effect must be read_only or mutating.`);
  }

  const sourceCommand = isRecord(value.source_command) ? value.source_command : null;
  if (!sourceCommand) {
    throw new Error(`${field}.source_command must be an object.`);
  }
  const supportedSurfaces = isRecord(value.supported_surfaces) ? value.supported_surfaces : {};

  return {
    action_id: requireString(value.action_id, `${field}.action_id`),
    title: requireString(value.title, `${field}.title`),
    summary: requireString(value.summary, `${field}.summary`),
    owner: requireString(value.owner, `${field}.owner`),
    effect: rawEffect,
    source_command: {
      command: requireString(sourceCommand.command, `${field}.source_command.command`),
      surface_kind: requireString(sourceCommand.surface_kind, `${field}.source_command.surface_kind`),
    },
    input_schema_ref: requireString(value.input_schema_ref, `${field}.input_schema_ref`),
    output_schema_ref: requireString(value.output_schema_ref, `${field}.output_schema_ref`),
    workspace_locator_fields: readStringList(value.workspace_locator_fields),
    human_gate_ids: readStringList(value.human_gate_ids),
    supported_surfaces: {
      cli: normalizeSurfaceDescriptor(supportedSurfaces.cli),
      mcp: normalizeSurfaceDescriptor(supportedSurfaces.mcp),
      skill: normalizeSurfaceDescriptor(supportedSurfaces.skill),
      product_entry: normalizeSurfaceDescriptor(supportedSurfaces.product_entry),
      openai: normalizeSurfaceDescriptor(supportedSurfaces.openai),
      ai_sdk: normalizeSurfaceDescriptor(supportedSurfaces.ai_sdk),
    },
    authority_boundary: isRecord(value.authority_boundary) ? value.authority_boundary : null,
  };
}

export function normalizeFamilyActionCatalog(value: unknown, field = 'family_action_catalog'): FamilyActionCatalog | null {
  if (!isRecord(value)) {
    return null;
  }

  const surfaceKind = requireString(value.surface_kind, `${field}.surface_kind`);
  if (surfaceKind !== 'family_action_catalog') {
    throw new Error(`${field}.surface_kind must be family_action_catalog.`);
  }
  const version = requireString(value.version, `${field}.version`);
  if (version !== 'family-action-catalog.v1') {
    throw new Error(`${field}.version must be family-action-catalog.v1.`);
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    throw new Error(`${field}.actions must contain at least one action.`);
  }

  const seen = new Set<string>();
  const actions = value.actions.map((entry, index) => {
    const action = normalizeFamilyAction(entry, `${field}.actions[${index}]`);
    if (seen.has(action.action_id)) {
      throw new Error(`${field}.actions contains duplicate action_id: ${action.action_id}`);
    }
    seen.add(action.action_id);
    return action;
  });

  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: requireString(value.catalog_id, `${field}.catalog_id`),
    target_domain_id: requireString(value.target_domain_id, `${field}.target_domain_id`),
    owner: requireString(value.owner, `${field}.owner`),
    authority_boundary: isRecord(value.authority_boundary) ? value.authority_boundary : {},
    actions,
    notes: readStringList(value.notes),
  };
}

function surfaceCommand(action: FamilyActionCatalogAction, surface: FamilyActionSurfaceDescriptor | null) {
  return optionalString(surface?.command) ?? action.source_command.command;
}

function surfaceKind(action: FamilyActionCatalogAction, surface: FamilyActionSurfaceDescriptor | null) {
  return optionalString(surface?.surface_kind) ?? action.source_command.surface_kind;
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
    },
    skill: {
      command_contract_id: optionalString(skillSurface?.command_contract_id) ?? action.action_id,
      action_id: action.action_id,
      command,
      surface_kind: kind,
      summary: action.summary,
      required_fields: action.workspace_locator_fields,
      effect: action.effect,
    },
    product_entry: {
      action_key: optionalString(productEntrySurface?.action_key) ?? action.action_id,
      command: surfaceCommand(action, productEntrySurface),
      surface_kind: surfaceKind(action, productEntrySurface),
      summary: action.summary,
      requires: action.workspace_locator_fields,
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
    },
    ai_sdk: {
      name: optionalString(aiSdkSurface?.tool_name) ?? action.action_id,
      description: action.summary,
      inputSchemaRef: action.input_schema_ref,
      outputSchemaRef: action.output_schema_ref,
      command,
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

function buildActionIndex(contracts: GatewayContracts) {
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

export function buildFamilyActionsList(contracts: GatewayContracts) {
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

function findDomainEntry(contracts: GatewayContracts, domain: string) {
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
    throw new GatewayContractError('cli_usage_error', `Unknown family action domain: ${domain}.`, {
      domain,
      allowed_domains: index.domain_manifests.projects.map((project) => project.project_id),
    });
  }
  const catalog = resolveCatalogFromEntry(entry);
  if (!catalog) {
    throw new GatewayContractError('missing_family_action_catalog', `Domain does not expose a family action catalog: ${domain}.`, {
      domain,
      manifest_status: entry.status,
    });
  }
  return { entry, catalog };
}

function findAction(catalog: FamilyActionCatalog, actionId: string) {
  const action = catalog.actions.find((candidate) => candidate.action_id === actionId);
  if (!action) {
    throw new GatewayContractError('cli_usage_error', `Unknown family action: ${actionId}.`, {
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
      throw new GatewayContractError('cli_usage_error', `Unexpected positional argument: ${token}.`, { token });
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new GatewayContractError('cli_usage_error', `Missing value for option: ${token}.`, { option: token });
    }
    parsed[token.slice(2)] = value;
    index += 1;
  }
  for (const field of required) {
    if (!parsed[field]) {
      throw new GatewayContractError('cli_usage_error', `Missing required option: --${field}.`, {
        required: required.map((entry) => `--${entry}`),
      });
    }
  }
  return parsed;
}

export function buildFamilyActionInspect(contracts: GatewayContracts, args: string[]) {
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
  throw new GatewayContractError('cli_usage_error', `Unsupported family action export format: ${value}.`, {
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

export function buildFamilyActionExport(contracts: GatewayContracts, args: string[]) {
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
