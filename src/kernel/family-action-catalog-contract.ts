import { isRecord } from './contract-validation.ts';
import { stringValue, type JsonRecord } from './json-record.ts';

export const FAMILY_ACTION_CATALOG_VERSION = 'family-action-catalog.v2' as const;
export const DOMAIN_HANDLER_REGISTRY_VERSION = 'domain-handler-registry.v1' as const;
export const FAMILY_ACTION_STAGE_MANIFEST_REF = 'agent/stages/manifest.json' as const;
export const FOUNDRY_PROVIDER_MANIFEST_REF = 'contracts/foundry_provider.json' as const;

export type FamilyActionEffect = 'read_only' | 'mutating';
export type FamilyActionExportFormat = 'cli' | 'mcp' | 'skill' | 'openai' | 'ai-sdk';

export type FamilyActionExecutionBinding =
  | {
      kind: 'handler_ref';
      handler_ref: `handler:${string}`;
    }
  | {
      kind: 'stage_binding';
      stage_manifest_ref: typeof FAMILY_ACTION_STAGE_MANIFEST_REF;
    }
  | {
      kind: 'foundry_binding';
      provider_manifest_ref: typeof FOUNDRY_PROVIDER_MANIFEST_REF;
    };

export interface FamilyActionSurfaceDescriptor {
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

export type FamilyActionStageRoutePolicy = 'ai_selected_progress_route';

export type FamilyActionExecutionScope =
  | {
      kind: 'work_item';
      alias_fields: string[];
    }
  | {
      kind: 'none';
    };

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
  execution_binding: FamilyActionExecutionBinding;
  source_of_work?: FamilyActionSourceOfWork;
  input_schema_ref: string;
  output_schema_ref: string;
  required_fields: string[];
  optional_fields: string[];
  parameter_fields_explicit?: boolean;
  workspace_locator_fields: string[];
  human_gate_ids: string[];
  execution_scope?: FamilyActionExecutionScope;
  stage_route?: FamilyActionStageRoute;
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
  version: typeof FAMILY_ACTION_CATALOG_VERSION;
  catalog_id: string;
  target_domain_id: string;
  owner: string;
  authority_boundary: JsonRecord;
  actions: FamilyActionCatalogAction[];
  notes: string[];
}

export type DomainHandlerImplementation =
  | {
      kind: 'typescript_export';
      file: string;
      export: string;
    }
  | {
      kind: 'python_callable';
      module: string;
      callable: string;
    };

export interface DomainHandlerRegistryEntry {
  handler_id: string;
  binding: DomainHandlerImplementation;
}

export interface DomainHandlerRegistry {
  surface_kind: 'domain_handler_registry';
  version: typeof DOMAIN_HANDLER_REGISTRY_VERSION;
  handlers: DomainHandlerRegistryEntry[];
}

const REQUIRED_SUPPORTED_SURFACE_KEYS = [
  'cli',
  'mcp',
  'skill',
  'product_entry',
  'openai',
  'ai_sdk',
] as const;
const ACTION_KEYS = [
  'action_id',
  'title',
  'summary',
  'owner',
  'effect',
  'execution_binding',
  'source_of_work',
  'input_schema_ref',
  'output_schema_ref',
  'required_fields',
  'optional_fields',
  'workspace_locator_fields',
  'human_gate_ids',
  'execution_scope',
  'stage_route',
  'supported_surfaces',
  'authority_boundary',
] as const;
const SURFACE_DESCRIPTOR_KEYS = [
  'surface_kind',
  'tool_name',
  'command_contract_id',
  'action_key',
  'public_runtime',
  'descriptor_only',
] as const;
const HANDLER_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const PYTHON_MODULE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;
const SYMBOL_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function requireString(value: unknown, field: string) {
  const text = stringValue(value);
  if (!text) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return text;
}

function assertKnownKeys(value: JsonRecord, allowed: readonly string[], field: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${field} contains unknown properties: ${unknown.join(', ')}`);
  }
}

function requiredStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array of strings.`);
  }
  const values = value.map((entry, index) => requireString(entry, `${field}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new Error(`${field} must not contain duplicates.`);
  }
  return values;
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

function optionalStringProperty(value: JsonRecord, key: string, field: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
    ? requireString(value[key], `${field}.${key}`)
    : null;
}

function optionalBooleanProperty(value: JsonRecord, key: string, field: string) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return null;
  }
  if (typeof value[key] !== 'boolean') {
    throw new Error(`${field}.${key} must be a boolean.`);
  }
  return value[key];
}

function assertNoForbiddenOplAuthority(value: JsonRecord, field: string) {
  for (const ownerField of ['quality_verdict_owner', 'artifact_authority_owner'] as const) {
    if (Object.prototype.hasOwnProperty.call(value, ownerField) && !stringValue(value[ownerField])) {
      throw new Error(`${field}.${ownerField} must be a non-empty domain owner string.`);
    }
  }
  const forbidden = Object.entries(value).filter(([key, entry]) => (
    (
      key.startsWith('opl_can_')
      || key === 'provider_completion_is_domain_completion'
      || key === 'provider_completion_counts_as_domain_completion'
    )
      ? entry !== false
      : (
          key === 'quality_verdict_owner'
          || key === 'artifact_authority_owner'
        ) && stringValue(entry) === 'one-person-lab'
  ));
  if (forbidden.length > 0) {
    throw new Error(`${field} grants forbidden OPL or provider authority: ${forbidden.map(([key]) => key).join(', ')}`);
  }
}

function normalizeCatalogAuthorityBoundary(value: unknown, field: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  requireString(value.domain_truth_owner, `${field}.domain_truth_owner`);
  if (value.opl_role !== 'projection_consumer_only' && value.opl_role !== 'foundry_runtime_owner') {
    throw new Error(`${field}.opl_role must be projection_consumer_only or foundry_runtime_owner.`);
  }
  if (value.write_policy !== 'no_domain_truth_writes') {
    throw new Error(`${field}.write_policy must be no_domain_truth_writes.`);
  }
  assertNoForbiddenOplAuthority(value, field);
  return value;
}

function normalizeActionAuthorityBoundary(value: unknown, field: string): JsonRecord | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  assertNoForbiddenOplAuthority(value, field);
  return value;
}

function normalizeSurfaceDescriptor(value: unknown, field: string): FamilyActionSurfaceDescriptor | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object or null.`);
  }
  assertKnownKeys(value, SURFACE_DESCRIPTOR_KEYS, field);
  const descriptorSurfaceKind = optionalStringProperty(value, 'surface_kind', field);
  const toolName = optionalStringProperty(value, 'tool_name', field);
  const commandContractId = optionalStringProperty(value, 'command_contract_id', field);
  const actionKey = optionalStringProperty(value, 'action_key', field);
  const publicRuntime = optionalBooleanProperty(value, 'public_runtime', field);
  const descriptorOnly = optionalBooleanProperty(value, 'descriptor_only', field);
  return {
    ...(descriptorSurfaceKind ? { surface_kind: descriptorSurfaceKind } : {}),
    ...(toolName ? { tool_name: toolName } : {}),
    ...(commandContractId ? { command_contract_id: commandContractId } : {}),
    ...(actionKey ? { action_key: actionKey } : {}),
    ...(publicRuntime !== null ? { public_runtime: publicRuntime } : {}),
    ...(descriptorOnly !== null ? { descriptor_only: descriptorOnly } : {}),
  };
}

function normalizeSupportedSurfaces(
  value: unknown,
  field: string,
): FamilyActionCatalogAction['supported_surfaces'] {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  assertKnownKeys(value, REQUIRED_SUPPORTED_SURFACE_KEYS, field);
  for (const key of REQUIRED_SUPPORTED_SURFACE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(`Missing required supported surface slot: ${field}.${key}`);
    }
  }
  return {
    cli: normalizeSurfaceDescriptor(value.cli, `${field}.cli`),
    mcp: normalizeSurfaceDescriptor(value.mcp, `${field}.mcp`),
    skill: normalizeSurfaceDescriptor(value.skill, `${field}.skill`),
    product_entry: normalizeSurfaceDescriptor(value.product_entry, `${field}.product_entry`),
    openai: normalizeSurfaceDescriptor(value.openai, `${field}.openai`),
    ai_sdk: normalizeSurfaceDescriptor(value.ai_sdk, `${field}.ai_sdk`),
  };
}

function normalizeSourceOfWork(
  value: unknown,
  actionId: string,
  catalogId: string,
  field: string,
): FamilyActionSourceOfWork {
  const fallback: FamilyActionSourceOfWork = {
    source_catalog: 'family_action_catalog',
    source_catalog_ref: `family_action_catalog:${catalogId}`,
    source_action_id: actionId,
    stage_catalog_ref: 'family_stage_control_plane',
    derived_surface_policy: 'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
    domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
  };
  if (value === undefined) {
    return fallback;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  assertKnownKeys(value, [
    'source_catalog',
    'source_catalog_ref',
    'source_action_id',
    'stage_catalog_ref',
    'derived_surface_policy',
    'domain_repo_wrapper_policy',
  ], field);
  if (value.source_catalog !== 'family_action_catalog') {
    throw new Error(`${field}.source_catalog must be family_action_catalog.`);
  }
  if (value.derived_surface_policy !== fallback.derived_surface_policy) {
    throw new Error(`${field}.derived_surface_policy must be ${fallback.derived_surface_policy}.`);
  }
  if (
    value.domain_repo_wrapper_policy !== undefined
    && value.domain_repo_wrapper_policy !== fallback.domain_repo_wrapper_policy
  ) {
    throw new Error(`${field}.domain_repo_wrapper_policy must be ${fallback.domain_repo_wrapper_policy}.`);
  }
  const sourceActionId = requireString(value.source_action_id, `${field}.source_action_id`);
  if (sourceActionId !== actionId) {
    throw new Error(`${field}.source_action_id must match action_id ${actionId}.`);
  }
  return {
    source_catalog: 'family_action_catalog',
    source_catalog_ref: requireString(value.source_catalog_ref, `${field}.source_catalog_ref`),
    source_action_id: sourceActionId,
    stage_catalog_ref: requireString(value.stage_catalog_ref, `${field}.stage_catalog_ref`),
    derived_surface_policy: fallback.derived_surface_policy,
    domain_repo_wrapper_policy: fallback.domain_repo_wrapper_policy,
  };
}

function normalizeStageRoute(value: unknown, field: string): FamilyActionStageRoute {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  assertKnownKeys(value, [
    'entry_stage_ref',
    'required_stage_refs',
    'optional_stage_refs',
    'terminal_stage_refs',
    'route_policy',
  ], field);
  const requiredStageRefs = requiredStringArray(value.required_stage_refs, `${field}.required_stage_refs`);
  if (requiredStageRefs.length === 0) {
    throw new Error(`${field}.required_stage_refs must contain at least one stage.`);
  }
  const optionalStageRefs = requiredStringArray(value.optional_stage_refs, `${field}.optional_stage_refs`);
  const terminalStageRefs = requiredStringArray(value.terminal_stage_refs, `${field}.terminal_stage_refs`);
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
  if (value.route_policy !== 'ai_selected_progress_route') {
    throw new Error(`${field}.route_policy must be ai_selected_progress_route.`);
  }
  return {
    entry_stage_ref: entryStageRef,
    required_stage_refs: requiredStageRefs,
    optional_stage_refs: optionalStageRefs,
    terminal_stage_refs: terminalStageRefs,
    route_policy: 'ai_selected_progress_route',
  };
}

function normalizeExecutionBinding(value: unknown, field: string): FamilyActionExecutionBinding {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const kind = requireString(value.kind, `${field}.kind`);
  if (kind === 'handler_ref') {
    assertKnownKeys(value, ['kind', 'handler_ref'], field);
    const handlerRef = requireString(value.handler_ref, `${field}.handler_ref`);
    const handlerId = handlerRef.startsWith('handler:') ? handlerRef.slice('handler:'.length) : '';
    if (!handlerId || !HANDLER_ID.test(handlerId)) {
      throw new Error(`${field}.handler_ref must use handler:<handler_id> with a bare canonical handler id.`);
    }
    return { kind: 'handler_ref', handler_ref: handlerRef as `handler:${string}` };
  }
  if (kind === 'stage_binding') {
    assertKnownKeys(value, ['kind', 'stage_manifest_ref'], field);
    const stageManifestRef = requireString(value.stage_manifest_ref, `${field}.stage_manifest_ref`);
    if (stageManifestRef !== FAMILY_ACTION_STAGE_MANIFEST_REF) {
      throw new Error(`${field}.stage_manifest_ref must be ${FAMILY_ACTION_STAGE_MANIFEST_REF}.`);
    }
    return { kind: 'stage_binding', stage_manifest_ref: FAMILY_ACTION_STAGE_MANIFEST_REF };
  }
  if (kind === 'foundry_binding') {
    assertKnownKeys(value, ['kind', 'provider_manifest_ref'], field);
    const providerManifestRef = requireString(value.provider_manifest_ref, `${field}.provider_manifest_ref`);
    if (providerManifestRef !== FOUNDRY_PROVIDER_MANIFEST_REF) {
      throw new Error(`${field}.provider_manifest_ref must be ${FOUNDRY_PROVIDER_MANIFEST_REF}.`);
    }
    return { kind: 'foundry_binding', provider_manifest_ref: FOUNDRY_PROVIDER_MANIFEST_REF };
  }
  throw new Error(`${field}.kind must be handler_ref, stage_binding, or foundry_binding.`);
}

function normalizeExecutionScope(
  value: unknown,
  field: string,
  parameterFields: ReadonlySet<string>,
): FamilyActionExecutionScope | null {
  if (value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const kind = requireString(value.kind, `${field}.kind`);
  if (kind === 'none') {
    assertKnownKeys(value, ['kind'], field);
    return { kind: 'none' };
  }
  if (kind !== 'work_item') {
    throw new Error(`${field}.kind must be work_item or none.`);
  }
  assertKnownKeys(value, ['kind', 'alias_fields'], field);
  const aliasFields = requiredStringArray(value.alias_fields, `${field}.alias_fields`);
  if (aliasFields.length === 0) {
    throw new Error(`${field}.alias_fields must contain at least one domain identity alias.`);
  }
  const undeclaredAliases = aliasFields.filter((aliasField) => {
    const rootField = aliasField.split('.')[0] ?? '';
    return !parameterFields.has(rootField);
  });
  if (undeclaredAliases.length > 0) {
    throw new Error(`${field}.alias_fields reference undeclared action parameters: ${undeclaredAliases.join(', ')}`);
  }
  return {
    kind: 'work_item',
    alias_fields: aliasFields,
  };
}

function normalizeFamilyAction(
  value: unknown,
  field: string,
  catalogId: string,
): FamilyActionCatalogAction {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  assertKnownKeys(value, ACTION_KEYS, field);
  const rawEffect = requireString(value.effect, `${field}.effect`);
  if (rawEffect !== 'read_only' && rawEffect !== 'mutating') {
    throw new Error(`${field}.effect must be read_only or mutating.`);
  }
  const actionId = requireString(value.action_id, `${field}.action_id`);
  const executionBinding = normalizeExecutionBinding(value.execution_binding, `${field}.execution_binding`);
  const stageRoute = value.stage_route === undefined
    ? null
    : normalizeStageRoute(value.stage_route, `${field}.stage_route`);
  if (executionBinding.kind === 'stage_binding' && !stageRoute) {
    throw new Error(`${field}.execution_binding.kind=stage_binding requires stage_route.`);
  }
  if (executionBinding.kind !== 'stage_binding' && stageRoute) {
    throw new Error(`${field}.execution_binding.kind=${executionBinding.kind} must not declare stage_route.`);
  }
  const requiredFields = requiredStringArray(value.required_fields, `${field}.required_fields`);
  const optionalFields = requiredStringArray(value.optional_fields, `${field}.optional_fields`);
  const overlappingFields = requiredFields.filter((entry) => optionalFields.includes(entry));
  if (overlappingFields.length > 0) {
    throw new Error(`${field}.required_fields and optional_fields overlap: ${overlappingFields.join(', ')}`);
  }
  const workspaceLocatorFields = requiredStringArray(
    value.workspace_locator_fields,
    `${field}.workspace_locator_fields`,
  );
  const parameterFields = new Set([...requiredFields, ...optionalFields]);
  const missingLocatorFields = workspaceLocatorFields.filter((entry) => !parameterFields.has(entry));
  if (missingLocatorFields.length > 0) {
    throw new Error(`${field}.workspace_locator_fields are not declared parameters: ${missingLocatorFields.join(', ')}`);
  }
  const executionScope = normalizeExecutionScope(
    value.execution_scope,
    `${field}.execution_scope`,
    parameterFields,
  );
  return {
    action_id: actionId,
    title: requireString(value.title, `${field}.title`),
    summary: requireString(value.summary, `${field}.summary`),
    owner: requireString(value.owner, `${field}.owner`),
    effect: rawEffect,
    execution_binding: executionBinding,
    source_of_work: normalizeSourceOfWork(value.source_of_work, actionId, catalogId, `${field}.source_of_work`),
    input_schema_ref: requireString(value.input_schema_ref, `${field}.input_schema_ref`),
    output_schema_ref: requireString(value.output_schema_ref, `${field}.output_schema_ref`),
    required_fields: requiredFields,
    optional_fields: optionalFields,
    parameter_fields_explicit: true,
    workspace_locator_fields: workspaceLocatorFields,
    human_gate_ids: requiredStringArray(value.human_gate_ids, `${field}.human_gate_ids`),
    ...(executionScope ? { execution_scope: executionScope } : {}),
    ...(stageRoute ? { stage_route: stageRoute } : {}),
    supported_surfaces: normalizeSupportedSurfaces(value.supported_surfaces, `${field}.supported_surfaces`),
    authority_boundary: normalizeActionAuthorityBoundary(
      value.authority_boundary,
      `${field}.authority_boundary`,
    ),
  };
}

function assertUniqueProjectedSurfaceIds(actions: FamilyActionCatalogAction[], field: string) {
  const surfaces = [
    ['mcp', 'tool_name'],
    ['skill', 'command_contract_id'],
    ['product_entry', 'action_key'],
    ['openai', 'tool_name'],
    ['ai_sdk', 'tool_name'],
  ] as const;
  for (const [surface, idField] of surfaces) {
    const seen = new Map<string, string>();
    for (const action of actions) {
      const descriptor = action.supported_surfaces[surface];
      if (descriptor === null) {
        continue;
      }
      const projectedId = descriptor[idField] ?? action.action_id;
      const firstActionId = seen.get(projectedId);
      if (firstActionId) {
        throw new Error(
          `${field}.actions contains duplicate ${surface} descriptor id ${projectedId}: ${firstActionId}, ${action.action_id}`,
        );
      }
      seen.set(projectedId, action.action_id);
    }
  }
}

export function normalizeFamilyActionCatalog(
  value: unknown,
  field = 'family_action_catalog',
): FamilyActionCatalog | null {
  if (!isRecord(value)) {
    return null;
  }
  assertKnownKeys(value, [
    'surface_kind',
    'version',
    'catalog_id',
    'target_domain_id',
    'owner',
    'authority_boundary',
    'actions',
    'notes',
  ], field);
  if (value.surface_kind !== 'family_action_catalog') {
    throw new Error(`${field}.surface_kind must be family_action_catalog.`);
  }
  if (value.version !== FAMILY_ACTION_CATALOG_VERSION) {
    throw new Error(`${field}.version must be ${FAMILY_ACTION_CATALOG_VERSION}.`);
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    throw new Error(`${field}.actions must contain at least one action.`);
  }
  const catalogId = requireString(value.catalog_id, `${field}.catalog_id`);
  const seen = new Set<string>();
  const actions = value.actions.map((entry, index) => {
    const action = normalizeFamilyAction(entry, `${field}.actions[${index}]`, catalogId);
    if (seen.has(action.action_id)) {
      throw new Error(`${field}.actions contains duplicate action_id: ${action.action_id}`);
    }
    seen.add(action.action_id);
    return action;
  });
  const foundryActionCount = actions.filter((action) => action.execution_binding.kind === 'foundry_binding').length;
  if (foundryActionCount > 0 && foundryActionCount !== actions.length) {
    throw new Error(`${field}.actions must not mix foundry_binding with domain action bindings.`);
  }
  const authorityBoundary = normalizeCatalogAuthorityBoundary(
    value.authority_boundary,
    `${field}.authority_boundary`,
  );
  const expectedOplRole = foundryActionCount > 0 ? 'foundry_runtime_owner' : 'projection_consumer_only';
  if (authorityBoundary.opl_role !== expectedOplRole) {
    throw new Error(
      `${field}.authority_boundary.opl_role must be ${expectedOplRole} for the declared execution bindings.`,
    );
  }
  assertUniqueProjectedSurfaceIds(actions, field);
  return {
    surface_kind: 'family_action_catalog',
    version: FAMILY_ACTION_CATALOG_VERSION,
    catalog_id: catalogId,
    target_domain_id: requireString(value.target_domain_id, `${field}.target_domain_id`),
    owner: requireString(value.owner, `${field}.owner`),
    authority_boundary: authorityBoundary,
    actions,
    notes: optionalStringArray(value.notes, `${field}.notes`),
  };
}

function normalizeDomainHandlerBinding(value: unknown, field: string): DomainHandlerImplementation {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object.`);
  }
  const kind = requireString(value.kind, `${field}.kind`);
  if (kind === 'typescript_export') {
    assertKnownKeys(value, ['kind', 'file', 'export'], field);
    const exportName = requireString(value.export, `${field}.export`);
    if (!SYMBOL_NAME.test(exportName)) {
      throw new Error(`${field}.export must be a TypeScript export identifier.`);
    }
    return {
      kind: 'typescript_export',
      file: requireString(value.file, `${field}.file`),
      export: exportName,
    };
  }
  if (kind === 'python_callable') {
    assertKnownKeys(value, ['kind', 'module', 'callable'], field);
    const moduleName = requireString(value.module, `${field}.module`);
    const callableName = requireString(value.callable, `${field}.callable`);
    if (!PYTHON_MODULE.test(moduleName) || !PYTHON_MODULE.test(callableName)) {
      throw new Error(`${field} must declare a valid Python module and callable path.`);
    }
    return {
      kind: 'python_callable',
      module: moduleName,
      callable: callableName,
    };
  }
  throw new Error(`${field}.kind must be typescript_export or python_callable.`);
}

export function normalizeDomainHandlerRegistry(
  value: unknown,
  field = 'domain_handler_registry',
): DomainHandlerRegistry | null {
  if (!isRecord(value)) {
    return null;
  }
  assertKnownKeys(value, ['surface_kind', 'version', 'handlers'], field);
  if (value.surface_kind !== 'domain_handler_registry') {
    throw new Error(`${field}.surface_kind must be domain_handler_registry.`);
  }
  if (value.version !== DOMAIN_HANDLER_REGISTRY_VERSION) {
    throw new Error(`${field}.version must be ${DOMAIN_HANDLER_REGISTRY_VERSION}.`);
  }
  if (!Array.isArray(value.handlers)) {
    throw new Error(`${field}.handlers must be an array.`);
  }
  const seen = new Set<string>();
  const handlers = value.handlers.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${field}.handlers[${index}] must be an object.`);
    }
    assertKnownKeys(entry, ['handler_id', 'binding'], `${field}.handlers[${index}]`);
    const handlerId = requireString(entry.handler_id, `${field}.handlers[${index}].handler_id`);
    if (handlerId.startsWith('handler:') || !HANDLER_ID.test(handlerId)) {
      throw new Error(`${field}.handlers[${index}].handler_id must be a bare canonical handler id.`);
    }
    if (seen.has(handlerId)) {
      throw new Error(`${field}.handlers contains duplicate handler_id: ${handlerId}`);
    }
    seen.add(handlerId);
    return {
      handler_id: handlerId,
      binding: normalizeDomainHandlerBinding(entry.binding, `${field}.handlers[${index}].binding`),
    };
  });
  return {
    surface_kind: 'domain_handler_registry',
    version: DOMAIN_HANDLER_REGISTRY_VERSION,
    handlers,
  };
}

export function assertFamilyActionHandlerRefsResolve(
  catalog: FamilyActionCatalog,
  registry: DomainHandlerRegistry | null,
) {
  const handlerActions = catalog.actions.filter(
    (action): action is FamilyActionCatalogAction & {
      execution_binding: Extract<FamilyActionExecutionBinding, { kind: 'handler_ref' }>;
    } => action.execution_binding.kind === 'handler_ref',
  );
  if (handlerActions.length === 0) {
    return;
  }
  if (!registry) {
    throw new Error('contracts/domain_handler_registry.json is required by handler_ref execution bindings.');
  }
  const registered = new Set(registry.handlers.map((handler) => handler.handler_id));
  const unresolved = handlerActions
    .map((action) => action.execution_binding.handler_ref.slice('handler:'.length))
    .filter((handlerId) => !registered.has(handlerId));
  if (unresolved.length > 0) {
    throw new Error(`Unresolved domain handler refs: ${[...new Set(unresolved)].join(', ')}`);
  }
}
