import { isRecord } from './contract-validation.ts';
import { stringList, stringValue, type JsonRecord } from './json-record.ts';

export type FamilyActionEffect = 'read_only' | 'mutating';
export type FamilyActionExportFormat = 'cli' | 'mcp' | 'skill' | 'openai' | 'ai-sdk';

export interface FamilyActionSourceCommand {
  command: string;
  surface_kind: string;
}

export interface FamilyActionHandlerBinding {
  binding_kind: 'python_callable';
  callable_ref: string;
  request: {
    command: string;
  };
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

export type FamilyActionStageRoutePolicy = 'ordered_stage_attempts_no_skip';
export type FamilyActionStageRouteExemption = 'domain_handler_target_only';

export interface FamilyActionStageRoute {
  entry_stage_ref: string;
  required_stage_refs: string[];
  optional_stage_refs: string[];
  terminal_stage_refs: string[];
  route_policy: FamilyActionStageRoutePolicy;
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
  required_fields: string[];
  optional_fields: string[];
  parameter_fields_explicit?: boolean;
  workspace_locator_fields: string[];
  human_gate_ids: string[];
  stage_route?: FamilyActionStageRoute;
  stage_route_exempt?: FamilyActionStageRouteExemption;
  supported_surfaces: {
    cli: FamilyActionSurfaceDescriptor | null;
    mcp: FamilyActionSurfaceDescriptor | null;
    skill: FamilyActionSurfaceDescriptor | null;
    product_entry: FamilyActionSurfaceDescriptor | null;
    openai: FamilyActionSurfaceDescriptor | null;
    ai_sdk: FamilyActionSurfaceDescriptor | null;
  };
  authority_boundary: JsonRecord | null;
  handler_binding: FamilyActionHandlerBinding | null;
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

function optionalStringArray(value: unknown, field: string) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

const PYTHON_HANDLER_TARGET = /^(?<module>[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*):(?<callable>[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)#(?<action>[A-Za-z_][A-Za-z0-9_-]*)$/;
const PYTHON_HANDLER_PREFIX = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*\./;

export function resolveFamilyActionHandlerBinding(
  target: string,
  actionId: string,
): FamilyActionHandlerBinding | null {
  const match = PYTHON_HANDLER_TARGET.exec(target);
  if (!match?.groups) {
    if (PYTHON_HANDLER_PREFIX.test(target)) {
      throw new Error(`Invalid domain handler target: ${target}`);
    }
    return null;
  }
  if (match.groups.action !== actionId) {
    throw new Error(`Domain handler target action ${match.groups.action} does not match ${actionId}.`);
  }
  return {
    binding_kind: 'python_callable',
    callable_ref: `${match.groups.module}:${match.groups.callable}`,
    request: { command: actionId },
  };
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

function routeStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  const values = value.map((entry, index) => requireString(entry, `${field}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new Error(`${field} must not contain duplicates.`);
  }
  return values;
}

function normalizeStageRoute(value: unknown, field: string): FamilyActionStageRoute | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const requiredStageRefs = routeStringList(value.required_stage_refs, `${field}.required_stage_refs`);
  if (requiredStageRefs.length === 0) {
    throw new Error(`${field}.required_stage_refs must contain at least one stage.`);
  }
  const optionalStageRefs = routeStringList(value.optional_stage_refs, `${field}.optional_stage_refs`);
  const terminalStageRefs = routeStringList(value.terminal_stage_refs, `${field}.terminal_stage_refs`);
  if (terminalStageRefs.length === 0) {
    throw new Error(`${field}.terminal_stage_refs must contain at least one stage.`);
  }
  const entryStageRef = requireString(value.entry_stage_ref, `${field}.entry_stage_ref`);
  if (entryStageRef !== requiredStageRefs[0]) {
    throw new Error(`${field}.entry_stage_ref must equal required_stage_refs[0].`);
  }
  const overlap = optionalStageRefs.filter((entry) => requiredStageRefs.includes(entry));
  if (overlap.length > 0) {
    throw new Error(`${field}.optional_stage_refs must not repeat required stages: ${overlap.join(', ')}`);
  }
  const routeStageRefs = new Set([...requiredStageRefs, ...optionalStageRefs]);
  const unknownTerminalRefs = terminalStageRefs.filter((entry) => !routeStageRefs.has(entry));
  if (unknownTerminalRefs.length > 0) {
    throw new Error(`${field}.terminal_stage_refs must belong to the declared route: ${unknownTerminalRefs.join(', ')}`);
  }
  const routePolicy = requireString(value.route_policy, `${field}.route_policy`);
  if (routePolicy !== 'ordered_stage_attempts_no_skip') {
    throw new Error(`${field}.route_policy must be ordered_stage_attempts_no_skip.`);
  }
  return {
    entry_stage_ref: entryStageRef,
    required_stage_refs: requiredStageRefs,
    optional_stage_refs: optionalStageRefs,
    terminal_stage_refs: terminalStageRefs,
    route_policy: 'ordered_stage_attempts_no_skip',
  };
}

function normalizeStageRouteExemption(
  value: unknown,
  effect: FamilyActionEffect,
  stageRoute: FamilyActionStageRoute | null,
  supportedSurfaces: FamilyActionCatalogAction['supported_surfaces'],
  field: string,
): FamilyActionStageRouteExemption | null {
  if (value === undefined) {
    return null;
  }
  const exemption = requireString(value, `${field}.stage_route_exempt`);
  if (exemption !== 'domain_handler_target_only') {
    throw new Error(`${field}.stage_route_exempt must be domain_handler_target_only.`);
  }
  if (effect !== 'mutating') {
    throw new Error(`${field}.stage_route_exempt=domain_handler_target_only requires effect=mutating.`);
  }
  if (stageRoute) {
    throw new Error(`${field}.stage_route_exempt=domain_handler_target_only must not declare stage_route.`);
  }
  const mcpTarget = supportedSurfaces.mcp;
  const hasPublicDirectSurface = [
    supportedSurfaces.cli,
    supportedSurfaces.skill,
    supportedSurfaces.openai,
    supportedSurfaces.ai_sdk,
  ].some((surface) => surface !== null);
  if (
    !mcpTarget
    || mcpTarget.descriptor_only !== true
    || mcpTarget.public_runtime !== false
    || hasPublicDirectSurface
  ) {
    throw new Error(
      `${field}.stage_route_exempt=domain_handler_target_only requires a descriptor-only non-public MCP target.`,
    );
  }
  return 'domain_handler_target_only';
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
  const workspaceLocatorFields = optionalStringArray(
    value.workspace_locator_fields,
    `${field}.workspace_locator_fields`,
  );
  const hasExplicitRequiredFields = Object.prototype.hasOwnProperty.call(value, 'required_fields');
  const hasExplicitOptionalFields = Object.prototype.hasOwnProperty.call(value, 'optional_fields');
  const requiredFields = hasExplicitRequiredFields
    ? optionalStringArray(value.required_fields, `${field}.required_fields`)
    : workspaceLocatorFields;
  const optionalFields = optionalStringArray(value.optional_fields, `${field}.optional_fields`);
  const overlappingFields = requiredFields.filter((entry) => optionalFields.includes(entry));
  if (overlappingFields.length > 0) {
    throw new Error(`${field}.required_fields and optional_fields overlap: ${overlappingFields.join(', ')}`);
  }
  if (hasExplicitRequiredFields) {
    const parameterFields = new Set([...requiredFields, ...optionalFields]);
    const missingLocatorFields = workspaceLocatorFields.filter((entry) => !parameterFields.has(entry));
    if (missingLocatorFields.length > 0) {
      throw new Error(`${field}.workspace_locator_fields are not declared parameters: ${missingLocatorFields.join(', ')}`);
    }
  }
  const sourceCommandText = requireString(sourceCommand.command, `${field}.source_command.command`);
  const stageRoute = normalizeStageRoute(value.stage_route, `${field}.stage_route`);
  const normalizedSupportedSurfaces = {
    cli: normalizeSurfaceDescriptor(supportedSurfaces.cli),
    mcp: normalizeSurfaceDescriptor(supportedSurfaces.mcp),
    skill: normalizeSurfaceDescriptor(supportedSurfaces.skill),
    product_entry: normalizeSurfaceDescriptor(supportedSurfaces.product_entry),
    openai: normalizeSurfaceDescriptor(supportedSurfaces.openai),
    ai_sdk: normalizeSurfaceDescriptor(supportedSurfaces.ai_sdk),
  };
  const stageRouteExemption = normalizeStageRouteExemption(
    value.stage_route_exempt,
    rawEffect,
    stageRoute,
    normalizedSupportedSurfaces,
    field,
  );

  return {
    action_id: actionId,
    title: requireString(value.title, `${field}.title`),
    summary: requireString(value.summary, `${field}.summary`),
    owner: requireString(value.owner, `${field}.owner`),
    effect: rawEffect,
    source_command: {
      command: sourceCommandText,
      surface_kind: requireString(sourceCommand.surface_kind, `${field}.source_command.surface_kind`),
    },
    source_of_work: normalizeSourceOfWork(value.source_of_work, actionId, catalogId, field),
    input_schema_ref: requireString(value.input_schema_ref, `${field}.input_schema_ref`),
    output_schema_ref: requireString(value.output_schema_ref, `${field}.output_schema_ref`),
    required_fields: requiredFields,
    optional_fields: optionalFields,
    parameter_fields_explicit: hasExplicitRequiredFields || hasExplicitOptionalFields,
    workspace_locator_fields: workspaceLocatorFields,
    human_gate_ids: stringList(value.human_gate_ids),
    ...(stageRoute ? { stage_route: stageRoute } : {}),
    ...(stageRouteExemption ? { stage_route_exempt: stageRouteExemption } : {}),
    supported_surfaces: normalizedSupportedSurfaces,
    authority_boundary: isRecord(value.authority_boundary) ? value.authority_boundary : null,
    handler_binding: resolveFamilyActionHandlerBinding(sourceCommandText, actionId),
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
