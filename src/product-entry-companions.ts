import {
  validateFamilyDomainEntryContract as validateSharedFamilyDomainEntryContract,
  validateGatewayInteractionContract as validateSharedGatewayInteractionContract,
} from './family-entry-contracts.ts';

export type JsonRecord = Record<string, unknown>;

export interface ProductEntryResumeContract {
  surface_kind: string;
  session_locator_field: string;
  checkpoint_locator_field?: string | null;
}

export interface ProductEntryStartResumeSurface {
  surface_kind: string;
  command?: string | null;
  session_locator_field?: string | null;
  checkpoint_locator_field?: string | null;
}

export interface ProductEntryStepInput {
  step_id: string;
  title: string;
  command: string;
  surface_kind: string;
  summary: string;
  requires: string[];
}

export interface ProductEntryProgressSurfaceInput {
  surface_kind: string;
  command: string;
  step_id?: string | null;
}

export interface ProductEntryStartModeInput {
  mode_id: string;
  title: string;
  command: string;
  surface_kind: string;
  summary: string;
  requires: string[];
}

export interface BuildProductEntryQuickstartInput {
  summary: string;
  recommended_step_id: string;
  steps: ProductEntryStepInput[];
  resume_contract: ProductEntryResumeContract;
  human_gate_ids: string[];
}

export interface BuildProductEntryOverviewInput {
  summary: string;
  frontdesk_command: string;
  recommended_command: string;
  operator_loop_command: string;
  progress_surface: ProductEntryProgressSurfaceInput;
  resume_surface: ReturnType<typeof buildProductEntryResumeSurface>;
  recommended_step_id: string;
  next_focus: string[];
  remaining_gaps_count: number;
  human_gate_ids: string[];
}

export interface BuildProductEntryReadinessInput {
  verdict: string;
  usable_now: boolean;
  good_to_use_now: boolean;
  fully_automatic: boolean;
  summary: string;
  recommended_start_surface: string;
  recommended_start_command: string;
  recommended_loop_surface: string;
  recommended_loop_command: string;
  blocking_gaps: string[];
}

export interface BuildProductEntryStartInput {
  summary: string;
  recommended_mode_id: string;
  modes: ProductEntryStartModeInput[];
  resume_surface: ProductEntryStartResumeSurface;
  human_gate_ids: string[];
}

export interface BuildProductFrontdeskSummaryInput {
  frontdesk_command: string;
  recommended_command: string;
  operator_loop_command: string;
}

export interface BuildProductFrontdeskInput {
  recommended_action: string;
  target_domain_id: string;
  workspace_locator: JsonRecord;
  runtime: JsonRecord;
  product_entry_status: JsonRecord;
  frontdesk_surface: JsonRecord;
  operator_loop_surface: JsonRecord;
  operator_loop_actions: JsonRecord;
  product_entry_start: JsonRecord;
  product_entry_overview: JsonRecord;
  product_entry_preflight: JsonRecord;
  product_entry_readiness: JsonRecord;
  product_entry_quickstart: JsonRecord;
  family_orchestration: JsonRecord;
  product_entry_manifest: JsonRecord;
  entry_surfaces: JsonRecord;
  summary: BuildProductFrontdeskSummaryInput;
  notes: string[];
  extra_payload?: JsonRecord;
}

export interface BuildFamilyProductFrontdeskInput {
  recommended_action: string;
  product_entry_manifest: JsonRecord;
  entry_surfaces: JsonRecord;
  notes: string[];
  extra_payload?: JsonRecord;
}

export interface BuildFamilyProductEntryManifestInput {
  manifest_kind: string;
  target_domain_id: string;
  formal_entry: JsonRecord;
  workspace_locator: JsonRecord;
  product_entry_shell: JsonRecord;
  shared_handoff: JsonRecord;
  product_entry_start: JsonRecord;
  family_orchestration: JsonRecord;
  runtime?: JsonRecord | null;
  managed_runtime_contract?: JsonRecord | null;
  repo_mainline?: JsonRecord | null;
  product_entry_status?: JsonRecord | null;
  frontdesk_surface?: JsonRecord | null;
  operator_loop_surface?: JsonRecord | null;
  operator_loop_actions?: JsonRecord | null;
  recommended_shell?: string | null;
  recommended_command?: string | null;
  runtime_inventory?: JsonRecord | null;
  task_lifecycle?: JsonRecord | null;
  skill_catalog?: JsonRecord | null;
  automation?: JsonRecord | null;
  product_entry_overview?: JsonRecord | null;
  product_entry_preflight?: JsonRecord | null;
  product_entry_readiness?: JsonRecord | null;
  product_entry_quickstart?: JsonRecord | null;
  remaining_gaps?: string[] | null;
  notes?: string[] | null;
  extra_payload?: JsonRecord;
}

export interface FamilyProductEntryValidationOptions {
  requireContractBundle?: boolean;
  requireRuntimeCompanions?: boolean;
}

export type FamilyOrchestrationReferenceRef = JsonRecord & {
  ref_kind: string;
  ref: string;
  label?: string;
};

export type FamilyOrchestrationGatePreview = JsonRecord & {
  gate_id: string;
  title?: string;
  status?: string;
  review_surface?: FamilyOrchestrationReferenceRef;
};

export type FamilyOrchestrationCompanion = JsonRecord & {
  action_graph_ref?: FamilyOrchestrationReferenceRef;
  action_graph?: JsonRecord;
  human_gates: FamilyOrchestrationGatePreview[];
  resume_contract: ProductEntryResumeContract;
  event_envelope_surface?: FamilyOrchestrationReferenceRef;
  checkpoint_lineage_surface?: FamilyOrchestrationReferenceRef;
};

export type ProductEntryQuickstartSurface = JsonRecord & {
  surface_kind: 'product_entry_quickstart';
  recommended_step_id: string;
  summary: string;
  steps: ProductEntryStepInput[];
  resume_contract: ProductEntryResumeContract;
  human_gate_ids: string[];
};

export type ProductEntryStartSurface = JsonRecord & {
  surface_kind: 'product_entry_start';
  summary: string;
  recommended_mode_id: string;
  modes: ProductEntryStartModeInput[];
  resume_surface: ProductEntryStartResumeSurface;
  human_gate_ids: string[];
};

export type ProductEntryOverviewSurface = JsonRecord & {
  surface_kind: 'product_entry_overview';
  summary: string;
  frontdesk_command: string;
  recommended_command: string;
  operator_loop_command: string;
  progress_surface: ProductEntryProgressSurfaceInput;
  resume_surface: ReturnType<typeof buildProductEntryResumeSurface>;
  recommended_step_id: string;
  next_focus: string[];
  remaining_gaps_count: number;
  human_gate_ids: string[];
};

export type ProductEntryReadinessSurface = JsonRecord & {
  surface_kind: 'product_entry_readiness';
  verdict: string;
  usable_now: boolean;
  good_to_use_now: boolean;
  fully_automatic: boolean;
  summary: string;
  recommended_start_surface: string;
  recommended_start_command: string;
  recommended_loop_surface: string;
  recommended_loop_command: string;
  blocking_gaps: string[];
};

export type ProductEntryPreflightSurface = JsonRecord & {
  surface_kind: 'product_entry_preflight';
  summary: string;
  ready_to_try_now: boolean;
  recommended_check_command: string;
  recommended_start_command: string;
  blocking_check_ids: string[];
  checks: unknown[];
};

export type FamilyProductEntryManifestSurface = JsonRecord & {
  surface_kind: 'product_entry_manifest';
  manifest_version: number;
  manifest_kind: string;
  target_domain_id: string;
  formal_entry: JsonRecord;
  workspace_locator: JsonRecord;
  product_entry_shell: JsonRecord;
  shared_handoff: JsonRecord;
  product_entry_start: ProductEntryStartSurface;
  family_orchestration: FamilyOrchestrationCompanion;
  runtime?: JsonRecord;
  managed_runtime_contract?: JsonRecord;
  repo_mainline?: JsonRecord;
  product_entry_status?: JsonRecord;
  frontdesk_surface?: JsonRecord;
  operator_loop_surface?: JsonRecord;
  operator_loop_actions?: JsonRecord;
  recommended_shell?: string;
  recommended_command?: string;
  runtime_inventory?: JsonRecord;
  task_lifecycle?: JsonRecord;
  skill_catalog?: JsonRecord;
  automation?: JsonRecord;
  product_entry_overview?: ProductEntryOverviewSurface;
  product_entry_preflight?: ProductEntryPreflightSurface;
  product_entry_readiness?: ProductEntryReadinessSurface;
  product_entry_quickstart?: ProductEntryQuickstartSurface;
  remaining_gaps?: string[];
  notes?: string[];
  schema_ref?: string;
  domain_entry_contract?: JsonRecord;
  gateway_interaction_contract?: JsonRecord;
};

export type FamilyProductFrontdeskSurface = JsonRecord & {
  surface_kind: 'product_frontdesk';
  recommended_action: string;
  target_domain_id: string;
  workspace_locator: JsonRecord;
  runtime: JsonRecord;
  product_entry_status: JsonRecord;
  frontdesk_surface: JsonRecord;
  operator_loop_surface: JsonRecord;
  operator_loop_actions: JsonRecord;
  product_entry_start: ProductEntryStartSurface;
  product_entry_overview: ProductEntryOverviewSurface;
  product_entry_preflight: ProductEntryPreflightSurface;
  product_entry_readiness: ProductEntryReadinessSurface;
  product_entry_quickstart: ProductEntryQuickstartSurface;
  family_orchestration: FamilyOrchestrationCompanion;
  product_entry_manifest: FamilyProductEntryManifestSurface;
  entry_surfaces: JsonRecord;
  summary: BuildProductFrontdeskSummaryInput;
  notes: string[];
  schema_ref?: string;
  domain_entry_contract?: JsonRecord;
  gateway_interaction_contract?: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`product entry companion 缺少字符串字段: ${field}`);
  }
  return text;
}

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`product entry companion 缺少布尔字段: ${field}`);
  }
  return value;
}

function requireInteger(value: unknown, field: string) {
  if (!Number.isInteger(value)) {
    throw new Error(`product entry companion 缺少整数字段: ${field}`);
  }
  return Number(value);
}

function requireRecord(value: unknown, field: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`product entry companion 缺少对象字段: ${field}`);
  }
  return value;
}

function readOptionalStringProperty(value: JsonRecord, key: string, field: string) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return undefined;
  }
  return requireString(value[key], field);
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`product entry companion 缺少数组字段: ${field}`);
  }
  const normalized = value
    .map((entry, index) => requireString(entry, `${field}[${index}]`));
  return normalized;
}

function optionalStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function normalizeResumeContract(value: unknown, field: string): ProductEntryResumeContract {
  const payload = requireRecord(value, field);
  return {
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    session_locator_field: requireString(payload.session_locator_field, `${field}.session_locator_field`),
    checkpoint_locator_field: optionalString(payload.checkpoint_locator_field),
  };
}

function normalizeStep(value: unknown, field: string): ProductEntryStepInput {
  const payload = requireRecord(value, field);
  return {
    step_id: requireString(payload.step_id, `${field}.step_id`),
    title: requireString(payload.title, `${field}.title`),
    command: requireString(payload.command, `${field}.command`),
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    summary: requireString(payload.summary, `${field}.summary`),
    requires: readStringList(payload.requires, `${field}.requires`),
  };
}

function normalizeProgressSurface(value: unknown, field: string): ProductEntryProgressSurfaceInput {
  const payload = requireRecord(value, field);
  return {
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    command: requireString(payload.command, `${field}.command`),
    step_id: optionalString(payload.step_id),
  };
}

function normalizeStartMode(value: unknown, field: string): ProductEntryStartModeInput {
  const payload = requireRecord(value, field);
  return {
    mode_id: requireString(payload.mode_id, `${field}.mode_id`),
    title: requireString(payload.title, `${field}.title`),
    command: requireString(payload.command, `${field}.command`),
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
    summary: requireString(payload.summary, `${field}.summary`),
    requires: readStringList(payload.requires, `${field}.requires`),
  };
}

function normalizeStartResumeSurface(value: unknown, field: string): ProductEntryStartResumeSurface {
  const payload = requireRecord(value, field);
  const normalized: ProductEntryStartResumeSurface = {
    surface_kind: requireString(payload.surface_kind, `${field}.surface_kind`),
  };
  const command = readOptionalStringProperty(payload, 'command', `${field}.command`);
  if (command !== undefined) {
    normalized.command = command;
  }
  const sessionLocatorField = readOptionalStringProperty(
    payload,
    'session_locator_field',
    `${field}.session_locator_field`,
  );
  if (sessionLocatorField !== undefined) {
    normalized.session_locator_field = sessionLocatorField;
  }
  const checkpointLocatorField = readOptionalStringProperty(
    payload,
    'checkpoint_locator_field',
    `${field}.checkpoint_locator_field`,
  );
  if (checkpointLocatorField !== undefined) {
    normalized.checkpoint_locator_field = checkpointLocatorField;
  }
  return normalized;
}

function cloneRecord(value: unknown, field: string) {
  return { ...requireRecord(value, field) };
}

function normalizeFrontdeskSummary(value: unknown, field: string) {
  const payload = requireRecord(value, field);
  return {
    frontdesk_command: requireString(payload.frontdesk_command, `${field}.frontdesk_command`),
    recommended_command: requireString(payload.recommended_command, `${field}.recommended_command`),
    operator_loop_command: requireString(payload.operator_loop_command, `${field}.operator_loop_command`),
  };
}

function mergeExtraPayload(base: JsonRecord, extraPayload: unknown, surfaceKind: string) {
  if (extraPayload === undefined) {
    return base;
  }
  const normalizedExtraPayload = cloneRecord(extraPayload, 'extra_payload');
  for (const key of Object.keys(normalizedExtraPayload)) {
    if (Object.prototype.hasOwnProperty.call(base, key)) {
      throw new Error(`${surfaceKind} extra_payload 不允许覆盖核心字段: ${key}`);
    }
  }
  return {
    ...base,
    ...normalizedExtraPayload,
  };
}

function validateFamilyReferenceRef(value: unknown, field: string): FamilyOrchestrationReferenceRef {
  const payload = requireRecord(value, field);
  const normalized: FamilyOrchestrationReferenceRef = {
    ...payload,
    ref_kind: requireString(payload.ref_kind, `${field}.ref_kind`),
    ref: requireString(payload.ref, `${field}.ref`),
  };
  const label = readOptionalStringProperty(payload, 'label', `${field}.label`);
  if (label !== undefined) {
    normalized.label = label;
  }
  return normalized;
}

function validateOptionalFamilyReferenceRef(value: unknown, field: string) {
  if (value === undefined) {
    return undefined;
  }
  return validateFamilyReferenceRef(value, field);
}

function validateDomainEntryContractShape(value: unknown, field: string) {
  return validateSharedFamilyDomainEntryContract(value, field);
}

function validateGatewayInteractionContractShape(value: unknown, field: string) {
  return validateSharedGatewayInteractionContract(value, field);
}

function validateSurfaceKindRecord(
  value: unknown,
  field: string,
  expectedSurfaceKind: string,
) {
  const payload = requireRecord(value, field);
  const surfaceKind = requireString(payload.surface_kind, `${field}.surface_kind`);
  if (surfaceKind !== expectedSurfaceKind) {
    throw new Error(
      `product entry companion ${field}.surface_kind 必须是 ${expectedSurfaceKind}，当前为 ${surfaceKind}`,
    );
  }
  return {
    ...payload,
    surface_kind: surfaceKind,
  };
}

function validateFamilyOrchestrationCompanion(
  value: unknown,
  field: string,
): FamilyOrchestrationCompanion {
  const payload = requireRecord(value, field);
  const normalized: FamilyOrchestrationCompanion = {
    ...payload,
    human_gates: Array.isArray(payload.human_gates)
      ? payload.human_gates.map((gate, index) => {
        const normalizedGate = requireRecord(gate, `${field}.human_gates[${index}]`);
        const preview: FamilyOrchestrationGatePreview = {
          ...normalizedGate,
          gate_id: requireString(normalizedGate.gate_id, `${field}.human_gates[${index}].gate_id`),
        };
        const title = readOptionalStringProperty(
          normalizedGate,
          'title',
          `${field}.human_gates[${index}].title`,
        );
        if (title !== undefined) {
          preview.title = title;
        }
        const status = readOptionalStringProperty(
          normalizedGate,
          'status',
          `${field}.human_gates[${index}].status`,
        );
        if (status !== undefined) {
          preview.status = status;
        }
        const reviewSurface = validateOptionalFamilyReferenceRef(
          normalizedGate.review_surface,
          `${field}.human_gates[${index}].review_surface`,
        );
        if (reviewSurface !== undefined) {
          preview.review_surface = reviewSurface;
        }
        return preview;
      })
      : [],
    resume_contract: normalizeResumeContract(payload.resume_contract, `${field}.resume_contract`),
  };
  const actionGraphRef = validateOptionalFamilyReferenceRef(
    payload.action_graph_ref,
    `${field}.action_graph_ref`,
  );
  if (actionGraphRef !== undefined) {
    normalized.action_graph_ref = actionGraphRef;
  }
  if (payload.action_graph !== undefined) {
    normalized.action_graph = cloneRecord(payload.action_graph, `${field}.action_graph`);
  }
  const eventEnvelopeSurface = validateOptionalFamilyReferenceRef(
    payload.event_envelope_surface,
    `${field}.event_envelope_surface`,
  );
  if (eventEnvelopeSurface !== undefined) {
    normalized.event_envelope_surface = eventEnvelopeSurface;
  }
  const checkpointLineageSurface = validateOptionalFamilyReferenceRef(
    payload.checkpoint_lineage_surface,
    `${field}.checkpoint_lineage_surface`,
  );
  if (checkpointLineageSurface !== undefined) {
    normalized.checkpoint_lineage_surface = checkpointLineageSurface;
  }
  return normalized;
}

function validateProductEntryQuickstartSurface(
  value: unknown,
  field: string,
): ProductEntryQuickstartSurface {
  const payload = requireRecord(value, field);
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((step, index) => normalizeStep(step, `${field}.steps[${index}]`))
    : [];
  const recommendedStepId = requireString(payload.recommended_step_id, `${field}.recommended_step_id`);
  if (!steps.some((step) => step.step_id === recommendedStepId)) {
    throw new Error(`product entry companion ${field}.recommended_step_id 必须引用现有 step_id`);
  }
  return {
    ...payload,
    surface_kind: 'product_entry_quickstart',
    recommended_step_id: recommendedStepId,
    summary: requireString(payload.summary, `${field}.summary`),
    steps,
    resume_contract: normalizeResumeContract(payload.resume_contract, `${field}.resume_contract`),
    human_gate_ids: readStringList(payload.human_gate_ids, `${field}.human_gate_ids`),
  };
}

function validateProductEntryStartSurface(
  value: unknown,
  field: string,
): ProductEntryStartSurface {
  const payload = requireRecord(value, field);
  const modes = Array.isArray(payload.modes)
    ? payload.modes.map((mode, index) => normalizeStartMode(mode, `${field}.modes[${index}]`))
    : [];
  const recommendedModeId = requireString(payload.recommended_mode_id, `${field}.recommended_mode_id`);
  if (!modes.some((mode) => mode.mode_id === recommendedModeId)) {
    throw new Error(`product entry companion ${field}.recommended_mode_id 必须引用现有 mode_id`);
  }
  return {
    ...payload,
    surface_kind: 'product_entry_start',
    summary: requireString(payload.summary, `${field}.summary`),
    recommended_mode_id: recommendedModeId,
    modes,
    resume_surface: normalizeStartResumeSurface(payload.resume_surface, `${field}.resume_surface`),
    human_gate_ids: readStringList(payload.human_gate_ids, `${field}.human_gate_ids`),
  };
}

function validateProductEntryOverviewSurface(
  value: unknown,
  field: string,
): ProductEntryOverviewSurface {
  const payload = requireRecord(value, field);
  const resumeSurface = normalizeStartResumeSurface(payload.resume_surface, `${field}.resume_surface`);
  const command = requireString(resumeSurface.command, `${field}.resume_surface.command`);
  return {
    ...payload,
    surface_kind: 'product_entry_overview',
    summary: requireString(payload.summary, `${field}.summary`),
    frontdesk_command: requireString(payload.frontdesk_command, `${field}.frontdesk_command`),
    recommended_command: requireString(payload.recommended_command, `${field}.recommended_command`),
    operator_loop_command: requireString(payload.operator_loop_command, `${field}.operator_loop_command`),
    progress_surface: normalizeProgressSurface(payload.progress_surface, `${field}.progress_surface`),
    resume_surface: buildProductEntryResumeSurface(command, resumeSurface),
    recommended_step_id: requireString(payload.recommended_step_id, `${field}.recommended_step_id`),
    next_focus: readStringList(payload.next_focus, `${field}.next_focus`),
    remaining_gaps_count: requireInteger(payload.remaining_gaps_count, `${field}.remaining_gaps_count`),
    human_gate_ids: readStringList(payload.human_gate_ids, `${field}.human_gate_ids`),
  };
}

function validateProductEntryReadinessSurface(
  value: unknown,
  field: string,
): ProductEntryReadinessSurface {
  const payload = requireRecord(value, field);
  return {
    ...payload,
    surface_kind: 'product_entry_readiness',
    verdict: requireString(payload.verdict, `${field}.verdict`),
    usable_now: requireBoolean(payload.usable_now, `${field}.usable_now`),
    good_to_use_now: requireBoolean(payload.good_to_use_now, `${field}.good_to_use_now`),
    fully_automatic: requireBoolean(payload.fully_automatic, `${field}.fully_automatic`),
    summary: requireString(payload.summary, `${field}.summary`),
    recommended_start_surface: requireString(
      payload.recommended_start_surface,
      `${field}.recommended_start_surface`,
    ),
    recommended_start_command: requireString(
      payload.recommended_start_command,
      `${field}.recommended_start_command`,
    ),
    recommended_loop_surface: requireString(
      payload.recommended_loop_surface,
      `${field}.recommended_loop_surface`,
    ),
    recommended_loop_command: requireString(
      payload.recommended_loop_command,
      `${field}.recommended_loop_command`,
    ),
    blocking_gaps: readStringList(payload.blocking_gaps, `${field}.blocking_gaps`),
  };
}

function validateProductEntryPreflightSurface(
  value: unknown,
  field: string,
): ProductEntryPreflightSurface {
  const payload = requireRecord(value, field);
  return {
    ...payload,
    surface_kind: 'product_entry_preflight',
    summary: requireString(payload.summary, `${field}.summary`),
    ready_to_try_now: requireBoolean(payload.ready_to_try_now, `${field}.ready_to_try_now`),
    recommended_check_command: requireString(
      payload.recommended_check_command,
      `${field}.recommended_check_command`,
    ),
    recommended_start_command: requireString(
      payload.recommended_start_command,
      `${field}.recommended_start_command`,
    ),
    blocking_check_ids: readStringList(payload.blocking_check_ids, `${field}.blocking_check_ids`),
    checks: Array.isArray(payload.checks) ? payload.checks : [],
  };
}

export function collectFamilyHumanGateIds(familyOrchestration: unknown) {
  if (!isRecord(familyOrchestration) || !Array.isArray(familyOrchestration.human_gates)) {
    return [];
  }
  return familyOrchestration.human_gates
    .map((gate, index) => (isRecord(gate) ? requireString(gate.gate_id, `human_gates[${index}].gate_id`) : null))
    .filter((gateId): gateId is string => Boolean(gateId));
}

export function buildProductEntryResumeSurface(command: string, resumeContract: unknown) {
  const normalizedContract = normalizeResumeContract(resumeContract, 'resume_contract');
  return {
    surface_kind: normalizedContract.surface_kind,
    command: requireString(command, 'command'),
    session_locator_field: normalizedContract.session_locator_field,
    checkpoint_locator_field: normalizedContract.checkpoint_locator_field,
  };
}

export function buildProductEntryQuickstart(input: BuildProductEntryQuickstartInput) {
  const normalizedResumeContract = normalizeResumeContract(input.resume_contract, 'resume_contract');
  const normalizedSteps = input.steps.map((step, index) => normalizeStep(step, `steps[${index}]`));
  const recommendedStepId = requireString(input.recommended_step_id, 'recommended_step_id');
  if (!normalizedSteps.some((step) => step.step_id === recommendedStepId)) {
    throw new Error('product entry quickstart recommended_step_id 必须引用现有 step_id。');
  }
  return {
    surface_kind: 'product_entry_quickstart',
    recommended_step_id: recommendedStepId,
    summary: requireString(input.summary, 'summary'),
    steps: normalizedSteps,
    resume_contract: normalizedResumeContract,
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
  };
}

export function buildProductEntryOverview(input: BuildProductEntryOverviewInput) {
  return {
    surface_kind: 'product_entry_overview',
    summary: requireString(input.summary, 'summary'),
    frontdesk_command: requireString(input.frontdesk_command, 'frontdesk_command'),
    recommended_command: requireString(input.recommended_command, 'recommended_command'),
    operator_loop_command: requireString(input.operator_loop_command, 'operator_loop_command'),
    progress_surface: normalizeProgressSurface(input.progress_surface, 'progress_surface'),
    resume_surface: buildProductEntryResumeSurface(input.resume_surface.command, input.resume_surface),
    recommended_step_id: requireString(input.recommended_step_id, 'recommended_step_id'),
    next_focus: readStringList(input.next_focus, 'next_focus'),
    remaining_gaps_count: requireInteger(input.remaining_gaps_count, 'remaining_gaps_count'),
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
  };
}

export function buildProductEntryReadiness(input: BuildProductEntryReadinessInput) {
  return {
    surface_kind: 'product_entry_readiness',
    verdict: requireString(input.verdict, 'verdict'),
    usable_now: requireBoolean(input.usable_now, 'usable_now'),
    good_to_use_now: requireBoolean(input.good_to_use_now, 'good_to_use_now'),
    fully_automatic: requireBoolean(input.fully_automatic, 'fully_automatic'),
    summary: requireString(input.summary, 'summary'),
    recommended_start_surface: requireString(input.recommended_start_surface, 'recommended_start_surface'),
    recommended_start_command: requireString(input.recommended_start_command, 'recommended_start_command'),
    recommended_loop_surface: requireString(input.recommended_loop_surface, 'recommended_loop_surface'),
    recommended_loop_command: requireString(input.recommended_loop_command, 'recommended_loop_command'),
    blocking_gaps: readStringList(input.blocking_gaps, 'blocking_gaps'),
  };
}

export function buildProductEntryStart(input: BuildProductEntryStartInput) {
  const normalizedModes = input.modes.map((mode, index) => normalizeStartMode(mode, `modes[${index}]`));
  const recommendedModeId = requireString(input.recommended_mode_id, 'recommended_mode_id');
  if (!normalizedModes.some((mode) => mode.mode_id === recommendedModeId)) {
    throw new Error('product entry start recommended_mode_id 必须引用现有 mode_id。');
  }
  return {
    surface_kind: 'product_entry_start',
    summary: requireString(input.summary, 'summary'),
    recommended_mode_id: recommendedModeId,
    modes: normalizedModes,
    resume_surface: normalizeStartResumeSurface(input.resume_surface, 'resume_surface'),
    human_gate_ids: readStringList(input.human_gate_ids, 'human_gate_ids'),
  };
}

export function buildProductFrontdesk(input: BuildProductFrontdeskInput) {
  const payload: JsonRecord = {
    surface_kind: 'product_frontdesk',
    recommended_action: requireString(input.recommended_action, 'recommended_action'),
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    workspace_locator: cloneRecord(input.workspace_locator, 'workspace_locator'),
    runtime: cloneRecord(input.runtime, 'runtime'),
    product_entry_status: cloneRecord(input.product_entry_status, 'product_entry_status'),
    frontdesk_surface: cloneRecord(input.frontdesk_surface, 'frontdesk_surface'),
    operator_loop_surface: cloneRecord(input.operator_loop_surface, 'operator_loop_surface'),
    operator_loop_actions: cloneRecord(input.operator_loop_actions, 'operator_loop_actions'),
    product_entry_start: cloneRecord(input.product_entry_start, 'product_entry_start'),
    product_entry_overview: cloneRecord(input.product_entry_overview, 'product_entry_overview'),
    product_entry_preflight: cloneRecord(input.product_entry_preflight, 'product_entry_preflight'),
    product_entry_readiness: cloneRecord(input.product_entry_readiness, 'product_entry_readiness'),
    product_entry_quickstart: cloneRecord(input.product_entry_quickstart, 'product_entry_quickstart'),
    family_orchestration: cloneRecord(input.family_orchestration, 'family_orchestration'),
    product_entry_manifest: cloneRecord(input.product_entry_manifest, 'product_entry_manifest'),
    entry_surfaces: cloneRecord(input.entry_surfaces, 'entry_surfaces'),
    summary: normalizeFrontdeskSummary(input.summary, 'summary'),
    notes: readStringList(input.notes, 'notes'),
  };
  return mergeExtraPayload(payload, input.extra_payload, 'product frontdesk');
}

export function buildFamilyProductFrontdesk(input: BuildFamilyProductFrontdeskInput) {
  const manifest = cloneRecord(input.product_entry_manifest, 'product_entry_manifest');
  const frontdeskSurface = cloneRecord(
    manifest.frontdesk_surface,
    'product_entry_manifest.frontdesk_surface',
  );
  const operatorLoopSurface = cloneRecord(
    manifest.operator_loop_surface,
    'product_entry_manifest.operator_loop_surface',
  );
  return buildProductFrontdesk({
    recommended_action: requireString(input.recommended_action, 'recommended_action'),
    target_domain_id: requireString(
      manifest.target_domain_id,
      'product_entry_manifest.target_domain_id',
    ),
    workspace_locator: cloneRecord(
      manifest.workspace_locator,
      'product_entry_manifest.workspace_locator',
    ),
    runtime: cloneRecord(manifest.runtime, 'product_entry_manifest.runtime'),
    product_entry_status: cloneRecord(
      manifest.product_entry_status,
      'product_entry_manifest.product_entry_status',
    ),
    frontdesk_surface: frontdeskSurface,
    operator_loop_surface: operatorLoopSurface,
    operator_loop_actions: cloneRecord(
      manifest.operator_loop_actions,
      'product_entry_manifest.operator_loop_actions',
    ),
    product_entry_start: cloneRecord(
      manifest.product_entry_start,
      'product_entry_manifest.product_entry_start',
    ),
    product_entry_overview: cloneRecord(
      manifest.product_entry_overview,
      'product_entry_manifest.product_entry_overview',
    ),
    product_entry_preflight: cloneRecord(
      manifest.product_entry_preflight,
      'product_entry_manifest.product_entry_preflight',
    ),
    product_entry_readiness: cloneRecord(
      manifest.product_entry_readiness,
      'product_entry_manifest.product_entry_readiness',
    ),
    product_entry_quickstart: cloneRecord(
      manifest.product_entry_quickstart,
      'product_entry_manifest.product_entry_quickstart',
    ),
    family_orchestration: cloneRecord(
      manifest.family_orchestration,
      'product_entry_manifest.family_orchestration',
    ),
    product_entry_manifest: manifest,
    entry_surfaces: cloneRecord(input.entry_surfaces, 'entry_surfaces'),
    summary: {
      frontdesk_command: requireString(
        frontdeskSurface.command,
        'product_entry_manifest.frontdesk_surface.command',
      ),
      recommended_command: requireString(
        manifest.recommended_command,
        'product_entry_manifest.recommended_command',
      ),
      operator_loop_command: requireString(
        operatorLoopSurface.command,
        'product_entry_manifest.operator_loop_surface.command',
      ),
    },
    notes: readStringList(input.notes, 'notes'),
    extra_payload: input.extra_payload,
  });
}

export function buildFamilyProductEntryManifest(input: BuildFamilyProductEntryManifestInput) {
  const payload: JsonRecord = {
    surface_kind: 'product_entry_manifest',
    manifest_version: 2,
    manifest_kind: requireString(input.manifest_kind, 'manifest_kind'),
    target_domain_id: requireString(input.target_domain_id, 'target_domain_id'),
    formal_entry: cloneRecord(input.formal_entry, 'formal_entry'),
    workspace_locator: cloneRecord(input.workspace_locator, 'workspace_locator'),
    product_entry_shell: cloneRecord(input.product_entry_shell, 'product_entry_shell'),
    shared_handoff: cloneRecord(input.shared_handoff, 'shared_handoff'),
    product_entry_start: cloneRecord(input.product_entry_start, 'product_entry_start'),
    family_orchestration: cloneRecord(input.family_orchestration, 'family_orchestration'),
  };

  const optionalRecords: Array<[string, unknown]> = [
    ['runtime', input.runtime],
    ['managed_runtime_contract', input.managed_runtime_contract],
    ['repo_mainline', input.repo_mainline],
    ['product_entry_status', input.product_entry_status],
    ['frontdesk_surface', input.frontdesk_surface],
    ['operator_loop_surface', input.operator_loop_surface],
    ['operator_loop_actions', input.operator_loop_actions],
    ['runtime_inventory', input.runtime_inventory],
    ['task_lifecycle', input.task_lifecycle],
    ['skill_catalog', input.skill_catalog],
    ['automation', input.automation],
    ['product_entry_overview', input.product_entry_overview],
    ['product_entry_preflight', input.product_entry_preflight],
    ['product_entry_readiness', input.product_entry_readiness],
    ['product_entry_quickstart', input.product_entry_quickstart],
  ];

  for (const [key, value] of optionalRecords) {
    if (value !== undefined && value !== null) {
      payload[key] = cloneRecord(value, key);
    }
  }

  const recommendedShell = optionalString(input.recommended_shell);
  if (recommendedShell) {
    payload.recommended_shell = recommendedShell;
  }
  const recommendedCommand = optionalString(input.recommended_command);
  if (recommendedCommand) {
    payload.recommended_command = recommendedCommand;
  }
  const remainingGaps = optionalStringList(input.remaining_gaps, 'remaining_gaps');
  if (remainingGaps) {
    payload.remaining_gaps = remainingGaps;
  }
  const notes = optionalStringList(input.notes, 'notes');
  if (notes) {
    payload.notes = notes;
  }

  return mergeExtraPayload(payload, input.extra_payload, 'product entry manifest');
}

export function validateFamilyProductEntryManifest(
  value: unknown,
  options: FamilyProductEntryValidationOptions = {},
): FamilyProductEntryManifestSurface {
  const payload = requireRecord(value, 'product_entry_manifest');
  const normalized: FamilyProductEntryManifestSurface = {
    ...payload,
    surface_kind: 'product_entry_manifest',
    manifest_version: requireInteger(payload.manifest_version, 'product_entry_manifest.manifest_version'),
    manifest_kind: requireString(payload.manifest_kind, 'product_entry_manifest.manifest_kind'),
    target_domain_id: requireString(payload.target_domain_id, 'product_entry_manifest.target_domain_id'),
    formal_entry: cloneRecord(payload.formal_entry, 'product_entry_manifest.formal_entry'),
    workspace_locator: cloneRecord(payload.workspace_locator, 'product_entry_manifest.workspace_locator'),
    product_entry_shell: cloneRecord(payload.product_entry_shell, 'product_entry_manifest.product_entry_shell'),
    shared_handoff: cloneRecord(payload.shared_handoff, 'product_entry_manifest.shared_handoff'),
    product_entry_start: validateProductEntryStartSurface(
      payload.product_entry_start,
      'product_entry_manifest.product_entry_start',
    ),
    family_orchestration: validateFamilyOrchestrationCompanion(
      payload.family_orchestration,
      'product_entry_manifest.family_orchestration',
    ),
  };

  for (const field of [
    'runtime',
    'managed_runtime_contract',
    'repo_mainline',
    'product_entry_status',
    'frontdesk_surface',
    'operator_loop_surface',
    'operator_loop_actions',
  ] as const) {
    if (payload[field] !== undefined) {
      normalized[field] = cloneRecord(payload[field], `product_entry_manifest.${field}`);
    }
  }
  const recommendedShell = readOptionalStringProperty(
    payload,
    'recommended_shell',
    'product_entry_manifest.recommended_shell',
  );
  if (recommendedShell !== undefined) {
    normalized.recommended_shell = recommendedShell;
  }
  const recommendedCommand = readOptionalStringProperty(
    payload,
    'recommended_command',
    'product_entry_manifest.recommended_command',
  );
  if (recommendedCommand !== undefined) {
    normalized.recommended_command = recommendedCommand;
  }
  if (payload.runtime_inventory !== undefined) {
    normalized.runtime_inventory = cloneRecord(
      payload.runtime_inventory,
      'product_entry_manifest.runtime_inventory',
    );
  }
  if (payload.task_lifecycle !== undefined) {
    normalized.task_lifecycle = cloneRecord(
      payload.task_lifecycle,
      'product_entry_manifest.task_lifecycle',
    );
  }
  if (payload.skill_catalog !== undefined) {
    normalized.skill_catalog = cloneRecord(
      payload.skill_catalog,
      'product_entry_manifest.skill_catalog',
    );
  }
  if (payload.automation !== undefined) {
    normalized.automation = cloneRecord(payload.automation, 'product_entry_manifest.automation');
  }
  if (payload.product_entry_overview !== undefined) {
    normalized.product_entry_overview = validateProductEntryOverviewSurface(
      payload.product_entry_overview,
      'product_entry_manifest.product_entry_overview',
    );
  }
  if (payload.product_entry_preflight !== undefined) {
    normalized.product_entry_preflight = validateProductEntryPreflightSurface(
      payload.product_entry_preflight,
      'product_entry_manifest.product_entry_preflight',
    );
  }
  if (payload.product_entry_readiness !== undefined) {
    normalized.product_entry_readiness = validateProductEntryReadinessSurface(
      payload.product_entry_readiness,
      'product_entry_manifest.product_entry_readiness',
    );
  }
  if (payload.product_entry_quickstart !== undefined) {
    normalized.product_entry_quickstart = validateProductEntryQuickstartSurface(
      payload.product_entry_quickstart,
      'product_entry_manifest.product_entry_quickstart',
    );
  }
  const remainingGaps = optionalStringList(payload.remaining_gaps, 'product_entry_manifest.remaining_gaps');
  if (remainingGaps !== null) {
    normalized.remaining_gaps = remainingGaps;
  }
  const notes = optionalStringList(payload.notes, 'product_entry_manifest.notes');
  if (notes !== null) {
    normalized.notes = notes;
  }
  if (payload.schema_ref !== undefined || options.requireContractBundle) {
    normalized.schema_ref = requireString(payload.schema_ref, 'product_entry_manifest.schema_ref');
  }
  if (payload.domain_entry_contract !== undefined || options.requireContractBundle) {
    normalized.domain_entry_contract = validateDomainEntryContractShape(
      payload.domain_entry_contract,
      'product_entry_manifest.domain_entry_contract',
    );
  }
  if (payload.gateway_interaction_contract !== undefined || options.requireContractBundle) {
    normalized.gateway_interaction_contract = validateGatewayInteractionContractShape(
      payload.gateway_interaction_contract,
      'product_entry_manifest.gateway_interaction_contract',
    );
  }
  if (options.requireRuntimeCompanions) {
    normalized.runtime_inventory = validateSurfaceKindRecord(
      payload.runtime_inventory,
      'product_entry_manifest.runtime_inventory',
      'runtime_inventory',
    );
    normalized.task_lifecycle = validateSurfaceKindRecord(
      payload.task_lifecycle,
      'product_entry_manifest.task_lifecycle',
      'task_lifecycle',
    );
    normalized.skill_catalog = validateSurfaceKindRecord(
      payload.skill_catalog,
      'product_entry_manifest.skill_catalog',
      'skill_catalog',
    );
    normalized.automation = validateSurfaceKindRecord(
      payload.automation,
      'product_entry_manifest.automation',
      'automation',
    );
  }

  return normalized;
}

export function validateFamilyProductFrontdesk(
  value: unknown,
  options: FamilyProductEntryValidationOptions = {},
): FamilyProductFrontdeskSurface {
  const payload = requireRecord(value, 'product_frontdesk');
  const normalized: FamilyProductFrontdeskSurface = {
    ...payload,
    surface_kind: 'product_frontdesk',
    recommended_action: requireString(payload.recommended_action, 'product_frontdesk.recommended_action'),
    target_domain_id: requireString(payload.target_domain_id, 'product_frontdesk.target_domain_id'),
    workspace_locator: cloneRecord(payload.workspace_locator, 'product_frontdesk.workspace_locator'),
    runtime: cloneRecord(payload.runtime, 'product_frontdesk.runtime'),
    product_entry_status: cloneRecord(payload.product_entry_status, 'product_frontdesk.product_entry_status'),
    frontdesk_surface: cloneRecord(payload.frontdesk_surface, 'product_frontdesk.frontdesk_surface'),
    operator_loop_surface: cloneRecord(
      payload.operator_loop_surface,
      'product_frontdesk.operator_loop_surface',
    ),
    operator_loop_actions: cloneRecord(
      payload.operator_loop_actions,
      'product_frontdesk.operator_loop_actions',
    ),
    product_entry_start: validateProductEntryStartSurface(
      payload.product_entry_start,
      'product_frontdesk.product_entry_start',
    ),
    product_entry_overview: validateProductEntryOverviewSurface(
      payload.product_entry_overview,
      'product_frontdesk.product_entry_overview',
    ),
    product_entry_preflight: validateProductEntryPreflightSurface(
      payload.product_entry_preflight,
      'product_frontdesk.product_entry_preflight',
    ),
    product_entry_readiness: validateProductEntryReadinessSurface(
      payload.product_entry_readiness,
      'product_frontdesk.product_entry_readiness',
    ),
    product_entry_quickstart: validateProductEntryQuickstartSurface(
      payload.product_entry_quickstart,
      'product_frontdesk.product_entry_quickstart',
    ),
    family_orchestration: validateFamilyOrchestrationCompanion(
      payload.family_orchestration,
      'product_frontdesk.family_orchestration',
    ),
    product_entry_manifest: validateFamilyProductEntryManifest(payload.product_entry_manifest, options),
    entry_surfaces: cloneRecord(payload.entry_surfaces, 'product_frontdesk.entry_surfaces'),
    summary: normalizeFrontdeskSummary(payload.summary, 'product_frontdesk.summary'),
    notes: readStringList(payload.notes, 'product_frontdesk.notes'),
  };
  if (payload.schema_ref !== undefined || options.requireContractBundle) {
    normalized.schema_ref = requireString(payload.schema_ref, 'product_frontdesk.schema_ref');
  }
  if (payload.domain_entry_contract !== undefined || options.requireContractBundle) {
    normalized.domain_entry_contract = validateDomainEntryContractShape(
      payload.domain_entry_contract,
      'product_frontdesk.domain_entry_contract',
    );
  }
  if (payload.gateway_interaction_contract !== undefined || options.requireContractBundle) {
    normalized.gateway_interaction_contract = validateGatewayInteractionContractShape(
      payload.gateway_interaction_contract,
      'product_frontdesk.gateway_interaction_contract',
    );
  }
  return normalized;
}
