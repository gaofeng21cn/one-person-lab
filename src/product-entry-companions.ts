type JsonRecord = Record<string, unknown>;

export interface ProductEntryResumeContract {
  surface_kind: string;
  session_locator_field: string;
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

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`product entry companion 缺少数组字段: ${field}`);
  }
  const normalized = value
    .map((entry, index) => requireString(entry, `${field}[${index}]`));
  return normalized;
}

function normalizeResumeContract(value: unknown, field: string): ProductEntryResumeContract {
  if (!isRecord(value)) {
    throw new Error(`product entry companion 缺少对象字段: ${field}`);
  }
  return {
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    session_locator_field: requireString(value.session_locator_field, `${field}.session_locator_field`),
    checkpoint_locator_field: optionalString(value.checkpoint_locator_field),
  };
}

function normalizeStep(value: unknown, field: string): ProductEntryStepInput {
  if (!isRecord(value)) {
    throw new Error(`product entry companion 缺少对象字段: ${field}`);
  }
  return {
    step_id: requireString(value.step_id, `${field}.step_id`),
    title: requireString(value.title, `${field}.title`),
    command: requireString(value.command, `${field}.command`),
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    summary: requireString(value.summary, `${field}.summary`),
    requires: readStringList(value.requires, `${field}.requires`),
  };
}

function normalizeProgressSurface(value: unknown, field: string): ProductEntryProgressSurfaceInput {
  if (!isRecord(value)) {
    throw new Error(`product entry companion 缺少对象字段: ${field}`);
  }
  return {
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    command: requireString(value.command, `${field}.command`),
    step_id: optionalString(value.step_id),
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
