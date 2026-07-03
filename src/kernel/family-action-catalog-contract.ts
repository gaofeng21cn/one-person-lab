import { isRecord } from './contract-validation.ts';
import { stringList, stringValue, type JsonRecord } from './json-record.ts';

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

export interface FamilyActionSourceOfWork {
  source_catalog: 'family_action_catalog';
  source_catalog_ref: string;
  source_action_id: string;
  stage_catalog_ref: string;
  derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog';
  domain_repo_wrapper_policy?: 'handler_target_refs_only_adapter_or_tombstone_candidate';
}

export interface FamilyActionCatalogAction {
  action_id: string;
  title: string;
  summary: string;
  owner: string;
  effect: FamilyActionEffect;
  source_command: FamilyActionSourceCommand;
  source_of_work?: FamilyActionSourceOfWork;
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

const REQUIRED_SUPPORTED_SURFACE_KEYS = [
  'cli',
  'mcp',
  'skill',
  'product_entry',
  'openai',
  'ai_sdk',
] as const;

function requireString(value: unknown, field: string) {
  const text = stringValue(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

function normalizeSurfaceDescriptor(value: unknown): FamilyActionSurfaceDescriptor | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    ...(stringValue(value.command) ? { command: stringValue(value.command)! } : {}),
    ...(stringValue(value.surface_kind) ? { surface_kind: stringValue(value.surface_kind)! } : {}),
    ...(stringValue(value.tool_name) ? { tool_name: stringValue(value.tool_name)! } : {}),
    ...(stringValue(value.command_contract_id)
      ? { command_contract_id: stringValue(value.command_contract_id)! }
      : {}),
    ...(stringValue(value.action_key) ? { action_key: stringValue(value.action_key)! } : {}),
    ...(typeof value.public_runtime === 'boolean' ? { public_runtime: value.public_runtime } : {}),
    ...(typeof value.descriptor_only === 'boolean' ? { descriptor_only: value.descriptor_only } : {}),
  };
}

function requireSupportedSurfaceSlots(value: JsonRecord, field: string) {
  for (const key of REQUIRED_SUPPORTED_SURFACE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(`Missing required supported surface slot: ${field}.supported_surfaces.${key}`);
    }
  }
}

function normalizeSourceOfWork(
  value: unknown,
  actionId: string,
  catalogId: string | null,
  field: string,
): FamilyActionSourceOfWork {
  const fallback = {
    source_catalog: 'family_action_catalog' as const,
    source_catalog_ref: catalogId ? `family_action_catalog:${catalogId}` : 'family_action_catalog',
    source_action_id: actionId,
    stage_catalog_ref: 'family_stage_control_plane',
    derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog' as const,
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate' as const,
  };
  if (!isRecord(value)) {
    return fallback;
  }
  const sourceCatalog = stringValue(value.source_catalog) ?? fallback.source_catalog;
  if (sourceCatalog !== 'family_action_catalog') {
    throw new Error(`${field}.source_of_work.source_catalog must be family_action_catalog.`);
  }
  const derivedSurfacePolicy = stringValue(value.derived_surface_policy)
    ?? fallback.derived_surface_policy;
  if (derivedSurfacePolicy !== fallback.derived_surface_policy) {
    throw new Error(`${field}.source_of_work.derived_surface_policy must be ${fallback.derived_surface_policy}.`);
  }
  const wrapperPolicy = stringValue(value.domain_repo_wrapper_policy)
    ?? fallback.domain_repo_wrapper_policy;
  if (wrapperPolicy !== fallback.domain_repo_wrapper_policy) {
    throw new Error(`${field}.source_of_work.domain_repo_wrapper_policy must be ${fallback.domain_repo_wrapper_policy}.`);
  }
  return {
    source_catalog: 'family_action_catalog',
    source_catalog_ref: requireString(value.source_catalog_ref, `${field}.source_of_work.source_catalog_ref`),
    source_action_id: requireString(value.source_action_id, `${field}.source_of_work.source_action_id`),
    stage_catalog_ref: requireString(value.stage_catalog_ref, `${field}.source_of_work.stage_catalog_ref`),
    derived_surface_policy: fallback.derived_surface_policy,
    domain_repo_wrapper_policy: fallback.domain_repo_wrapper_policy,
  };
}

function normalizeFamilyAction(value: unknown, field: string, catalogId: string | null): FamilyActionCatalogAction {
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
  requireSupportedSurfaceSlots(supportedSurfaces, field);

  const actionId = requireString(value.action_id, `${field}.action_id`);

  return {
    action_id: actionId,
    title: requireString(value.title, `${field}.title`),
    summary: requireString(value.summary, `${field}.summary`),
    owner: requireString(value.owner, `${field}.owner`),
    effect: rawEffect,
    source_command: {
      command: requireString(sourceCommand.command, `${field}.source_command.command`),
      surface_kind: requireString(sourceCommand.surface_kind, `${field}.source_command.surface_kind`),
    },
    source_of_work: normalizeSourceOfWork(value.source_of_work, actionId, catalogId, field),
    input_schema_ref: requireString(value.input_schema_ref, `${field}.input_schema_ref`),
    output_schema_ref: requireString(value.output_schema_ref, `${field}.output_schema_ref`),
    workspace_locator_fields: stringList(value.workspace_locator_fields),
    human_gate_ids: stringList(value.human_gate_ids),
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
  const catalogId = requireString(value.catalog_id, `${field}.catalog_id`);
  const actions = value.actions.map((entry, index) => {
    const action = normalizeFamilyAction(entry, `${field}.actions[${index}]`, catalogId);
    if (seen.has(action.action_id)) {
      throw new Error(`${field}.actions contains duplicate action_id: ${action.action_id}`);
    }
    seen.add(action.action_id);
    return action;
  });

  return {
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v1',
    catalog_id: catalogId,
    target_domain_id: requireString(value.target_domain_id, `${field}.target_domain_id`),
    owner: requireString(value.owner, `${field}.owner`),
    authority_boundary: isRecord(value.authority_boundary) ? value.authority_boundary : {},
    actions,
    notes: stringList(value.notes),
  };
}
