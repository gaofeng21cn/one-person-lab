type JsonRecord = Record<string, unknown>;

export interface ProgramCheckInput {
  check_id: string;
  title: string;
  status: string;
  blocking: boolean;
  summary: string;
  command: string;
}

export interface WorkflowCoverageItemInput {
  step_id: string;
  manual_flow_label: string;
  coverage_status: string;
  current_surface: string;
  remaining_gap: string;
}

export interface GuardrailClassInput {
  guardrail_id: string;
  trigger: string;
  symptom: string;
  recommended_command: string;
}

export interface ProgramStepInput {
  step_id: string;
  command: string;
  surface_kind: string;
  title?: string;
}

export interface ProgramSurfaceInput {
  surface_kind: string;
  command?: string;
  ref?: string;
}

export interface ClearanceTargetInput {
  target_id: string;
  title: string;
  commands: string[];
}

export interface ProgramCapabilityInput {
  capability_id: string;
  owner: string;
  summary: string;
}

export interface ProgramSequenceStepInput {
  step_id: string;
  phase_id: string;
  status: string;
  summary: string;
  title?: string;
}

export interface DetailedReadinessInput {
  surface_kind: string;
  verdict: string;
  usable_now: boolean;
  good_to_use_now: boolean;
  fully_automatic: boolean;
  user_experience_level: string;
  summary: string;
  recommended_start_surface: string;
  recommended_start_command: string;
  recommended_loop_surface: string;
  recommended_loop_command: string;
  workflow_coverage: WorkflowCoverageItemInput[];
  blocking_gaps: string[];
}

export interface ProductEntryPreflightInput {
  summary: string;
  recommended_check_command: string;
  recommended_start_command: string;
  checks: ProgramCheckInput[];
}

export interface ProductEntryGuardrailsInput {
  summary: string;
  guardrail_classes: GuardrailClassInput[];
  recovery_loop: ProgramStepInput[];
}

export interface ClearanceLaneInput {
  surface_kind: string;
  summary: string;
  recommended_step_id: string;
  recommended_command: string;
  clearance_targets: ClearanceTargetInput[];
  clearance_loop: ProgramStepInput[];
  proof_surfaces: ProgramSurfaceInput[];
  recommended_phase_command: string;
}

export interface BackendDeconstructionLaneInput {
  summary: string;
  substrate_targets: ProgramCapabilityInput[];
  backend_retained_now: string[];
  current_backend_chain: string[];
  optional_executor_proofs: JsonRecord[];
  promotion_rules: string[];
  deconstruction_map_doc: string;
  recommended_phase_command: string;
  surface_kind?: string;
}

export interface PlatformTargetInput {
  summary: string;
  sequence_scope: string;
  current_step_id: string;
  current_readiness_summary: string;
  north_star_topology: JsonRecord;
  target_internal_modules: string[];
  landing_sequence: ProgramSequenceStepInput[];
  completed_step_ids: string[];
  remaining_step_ids: string[];
  promotion_gates: string[];
  recommended_phase_command: string;
  surface_kind?: string;
  land_now?: string[];
  not_yet?: string[];
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`product entry program companion 缺少字符串字段: ${field}`);
  }
  return text;
}

function requireBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') {
    throw new Error(`product entry program companion 缺少布尔字段: ${field}`);
  }
  return value;
}

function requireRecord(value: unknown, field: string) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`product entry program companion 缺少对象字段: ${field}`);
  }
  return value as JsonRecord;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`product entry program companion 缺少数组字段: ${field}`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

function normalizeProgramCheck(value: ProgramCheckInput, field: string) {
  return {
    check_id: requireString(value.check_id, `${field}.check_id`),
    title: requireString(value.title, `${field}.title`),
    status: requireString(value.status, `${field}.status`),
    blocking: requireBoolean(value.blocking, `${field}.blocking`),
    summary: requireString(value.summary, `${field}.summary`),
    command: requireString(value.command, `${field}.command`),
  };
}

function normalizeWorkflowCoverageItem(value: WorkflowCoverageItemInput, field: string) {
  return {
    step_id: requireString(value.step_id, `${field}.step_id`),
    manual_flow_label: requireString(value.manual_flow_label, `${field}.manual_flow_label`),
    coverage_status: requireString(value.coverage_status, `${field}.coverage_status`),
    current_surface: requireString(value.current_surface, `${field}.current_surface`),
    remaining_gap: requireString(value.remaining_gap, `${field}.remaining_gap`),
  };
}

function normalizeGuardrailClass(value: GuardrailClassInput, field: string) {
  return {
    guardrail_id: requireString(value.guardrail_id, `${field}.guardrail_id`),
    trigger: requireString(value.trigger, `${field}.trigger`),
    symptom: requireString(value.symptom, `${field}.symptom`),
    recommended_command: requireString(value.recommended_command, `${field}.recommended_command`),
  };
}

function normalizeProgramStep(value: ProgramStepInput, field: string) {
  return {
    step_id: requireString(value.step_id, `${field}.step_id`),
    command: requireString(value.command, `${field}.command`),
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    ...(optionalString(value.title) ? { title: optionalString(value.title)! } : {}),
  };
}

function normalizeProgramSurface(value: ProgramSurfaceInput, field: string) {
  const command = optionalString(value.command);
  const ref = optionalString(value.ref);
  if (!command && !ref) {
    throw new Error('product entry program surface 至少要提供 command 或 ref。');
  }
  return {
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    ...(command ? { command } : {}),
    ...(ref ? { ref } : {}),
  };
}

function normalizeClearanceTarget(value: ClearanceTargetInput, field: string) {
  return {
    target_id: requireString(value.target_id, `${field}.target_id`),
    title: requireString(value.title, `${field}.title`),
    commands: readStringList(value.commands, `${field}.commands`),
  };
}

function normalizeProgramCapability(value: ProgramCapabilityInput, field: string) {
  return {
    capability_id: requireString(value.capability_id, `${field}.capability_id`),
    owner: requireString(value.owner, `${field}.owner`),
    summary: requireString(value.summary, `${field}.summary`),
  };
}

function normalizeProgramSequenceStep(value: ProgramSequenceStepInput, field: string) {
  return {
    step_id: requireString(value.step_id, `${field}.step_id`),
    phase_id: requireString(value.phase_id, `${field}.phase_id`),
    status: requireString(value.status, `${field}.status`),
    summary: requireString(value.summary, `${field}.summary`),
    ...(optionalString(value.title) ? { title: optionalString(value.title)! } : {}),
  };
}

export function buildProgramCheck(input: ProgramCheckInput) {
  return normalizeProgramCheck(input, 'program_check');
}

export function buildProductEntryPreflight(input: ProductEntryPreflightInput) {
  const checks = input.checks.map((check, index) => normalizeProgramCheck(check, `checks[${index}]`));
  const blockingCheckIds = checks
    .filter((check) => check.blocking && check.status !== 'pass')
    .map((check) => check.check_id);
  return {
    surface_kind: 'product_entry_preflight',
    summary: requireString(input.summary, 'summary'),
    ready_to_try_now: blockingCheckIds.length === 0,
    recommended_check_command: requireString(input.recommended_check_command, 'recommended_check_command'),
    recommended_start_command: requireString(input.recommended_start_command, 'recommended_start_command'),
    blocking_check_ids: blockingCheckIds,
    checks,
  };
}

export function buildWorkflowCoverageItem(input: WorkflowCoverageItemInput) {
  return normalizeWorkflowCoverageItem(input, 'workflow_coverage_item');
}

export function buildGuardrailClass(input: GuardrailClassInput) {
  return normalizeGuardrailClass(input, 'guardrail_class');
}

export function buildProgramStep(input: ProgramStepInput) {
  return normalizeProgramStep(input, 'program_step');
}

export function buildProgramSurface(input: ProgramSurfaceInput) {
  return normalizeProgramSurface(input, 'program_surface');
}

export function buildClearanceTarget(input: ClearanceTargetInput) {
  return normalizeClearanceTarget(input, 'clearance_target');
}

export function buildProgramCapability(input: ProgramCapabilityInput) {
  return normalizeProgramCapability(input, 'program_capability');
}

export function buildProgramSequenceStep(input: ProgramSequenceStepInput) {
  return normalizeProgramSequenceStep(input, 'program_sequence_step');
}

export function buildDetailedReadiness(input: DetailedReadinessInput) {
  return {
    surface_kind: requireString(input.surface_kind, 'surface_kind'),
    verdict: requireString(input.verdict, 'verdict'),
    usable_now: requireBoolean(input.usable_now, 'usable_now'),
    good_to_use_now: requireBoolean(input.good_to_use_now, 'good_to_use_now'),
    fully_automatic: requireBoolean(input.fully_automatic, 'fully_automatic'),
    user_experience_level: requireString(input.user_experience_level, 'user_experience_level'),
    summary: requireString(input.summary, 'summary'),
    recommended_start_surface: requireString(input.recommended_start_surface, 'recommended_start_surface'),
    recommended_start_command: requireString(input.recommended_start_command, 'recommended_start_command'),
    recommended_loop_surface: requireString(input.recommended_loop_surface, 'recommended_loop_surface'),
    recommended_loop_command: requireString(input.recommended_loop_command, 'recommended_loop_command'),
    workflow_coverage: input.workflow_coverage.map((item, index) => (
      normalizeWorkflowCoverageItem(item, `workflow_coverage[${index}]`)
    )),
    blocking_gaps: readStringList(input.blocking_gaps, 'blocking_gaps'),
  };
}

export function buildProductEntryGuardrails(input: ProductEntryGuardrailsInput) {
  return {
    surface_kind: 'product_entry_guardrails',
    summary: requireString(input.summary, 'summary'),
    guardrail_classes: input.guardrail_classes.map((entry, index) => (
      normalizeGuardrailClass(entry, `guardrail_classes[${index}]`)
    )),
    recovery_loop: input.recovery_loop.map((entry, index) => (
      normalizeProgramStep(entry, `recovery_loop[${index}]`)
    )),
  };
}

export function buildClearanceLane(input: ClearanceLaneInput) {
  return {
    surface_kind: requireString(input.surface_kind, 'surface_kind'),
    summary: requireString(input.summary, 'summary'),
    recommended_step_id: requireString(input.recommended_step_id, 'recommended_step_id'),
    recommended_command: requireString(input.recommended_command, 'recommended_command'),
    clearance_targets: input.clearance_targets.map((entry, index) => (
      normalizeClearanceTarget(entry, `clearance_targets[${index}]`)
    )),
    clearance_loop: input.clearance_loop.map((entry, index) => (
      normalizeProgramStep(entry, `clearance_loop[${index}]`)
    )),
    proof_surfaces: input.proof_surfaces.map((entry, index) => (
      normalizeProgramSurface(entry, `proof_surfaces[${index}]`)
    )),
    recommended_phase_command: requireString(input.recommended_phase_command, 'recommended_phase_command'),
  };
}

export function buildBackendDeconstructionLane(input: BackendDeconstructionLaneInput) {
  return {
    surface_kind: requireString(input.surface_kind ?? 'phase4_backend_deconstruction_lane', 'surface_kind'),
    summary: requireString(input.summary, 'summary'),
    substrate_targets: input.substrate_targets.map((entry, index) => (
      normalizeProgramCapability(entry, `substrate_targets[${index}]`)
    )),
    backend_retained_now: readStringList(input.backend_retained_now, 'backend_retained_now'),
    current_backend_chain: readStringList(input.current_backend_chain, 'current_backend_chain'),
    optional_executor_proofs: input.optional_executor_proofs.map((entry, index) => (
      { ...requireRecord(entry, `optional_executor_proofs[${index}]`) }
    )),
    promotion_rules: readStringList(input.promotion_rules, 'promotion_rules'),
    deconstruction_map_doc: requireString(input.deconstruction_map_doc, 'deconstruction_map_doc'),
    recommended_phase_command: requireString(input.recommended_phase_command, 'recommended_phase_command'),
  };
}

export function buildPlatformTarget(input: PlatformTargetInput) {
  const landingSequence = input.landing_sequence.map((entry, index) => (
    normalizeProgramSequenceStep(entry, `landing_sequence[${index}]`)
  ));
  const knownStepIds = new Set(landingSequence.map((entry) => entry.step_id));
  for (const [field, values] of [
    ['completed_step_ids', input.completed_step_ids],
    ['remaining_step_ids', input.remaining_step_ids],
  ] as const) {
    for (const stepId of readStringList(values, field)) {
      if (!knownStepIds.has(stepId)) {
        throw new Error(`platform target ${field} 必须引用 landing_sequence 中的 step_id。`);
      }
    }
  }

  return {
    surface_kind: requireString(input.surface_kind ?? 'phase5_platform_target', 'surface_kind'),
    summary: requireString(input.summary, 'summary'),
    sequence_scope: requireString(input.sequence_scope, 'sequence_scope'),
    current_step_id: requireString(input.current_step_id, 'current_step_id'),
    current_readiness_summary: requireString(input.current_readiness_summary, 'current_readiness_summary'),
    north_star_topology: { ...requireRecord(input.north_star_topology, 'north_star_topology') },
    target_internal_modules: readStringList(input.target_internal_modules, 'target_internal_modules'),
    landing_sequence: landingSequence,
    completed_step_ids: readStringList(input.completed_step_ids, 'completed_step_ids'),
    remaining_step_ids: readStringList(input.remaining_step_ids, 'remaining_step_ids'),
    promotion_gates: readStringList(input.promotion_gates, 'promotion_gates'),
    recommended_phase_command: requireString(input.recommended_phase_command, 'recommended_phase_command'),
    ...(input.land_now ? { land_now: readStringList(input.land_now, 'land_now') } : {}),
    ...(input.not_yet ? { not_yet: readStringList(input.not_yet, 'not_yet') } : {}),
  };
}
