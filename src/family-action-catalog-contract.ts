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
