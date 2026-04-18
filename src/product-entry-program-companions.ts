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
