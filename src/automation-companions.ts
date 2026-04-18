type JsonRecord = Record<string, unknown>;

interface BuildAutomationDescriptorInput {
  automation_id: string;
  title: string;
  owner: string;
  trigger_kind: string;
  target_surface_kind: string;
  summary: string;
  readiness_status: string;
  gate_policy: string;
  output_expectation: string[];
  target_command?: string | null;
  domain_projection?: JsonRecord | null;
}

interface BuildAutomationCatalogInput {
  summary: string;
  automations: ReturnType<typeof buildAutomationDescriptor>[];
  readiness_summary?: string | null;
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
    throw new Error(`automation companion 缺少字符串字段: ${field}`);
  }
  return text;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`automation companion 缺少数组字段: ${field}`);
  }
  return value.map((entry, index) => requireString(entry, `${field}[${index}]`));
}

export function buildAutomationDescriptor(input: BuildAutomationDescriptorInput) {
  return {
    surface_kind: 'automation_descriptor',
    automation_id: requireString(input.automation_id, 'automation_id'),
    title: requireString(input.title, 'title'),
    owner: requireString(input.owner, 'owner'),
    trigger_kind: requireString(input.trigger_kind, 'trigger_kind'),
    target_surface_kind: requireString(input.target_surface_kind, 'target_surface_kind'),
    summary: requireString(input.summary, 'summary'),
    readiness_status: requireString(input.readiness_status, 'readiness_status'),
    gate_policy: requireString(input.gate_policy, 'gate_policy'),
    output_expectation: readStringList(input.output_expectation, 'output_expectation'),
    ...(optionalString(input.target_command) ? { target_command: optionalString(input.target_command)! } : {}),
    ...(isRecord(input.domain_projection) ? { domain_projection: { ...input.domain_projection } } : {}),
  };
}

export function buildAutomationCatalog(input: BuildAutomationCatalogInput) {
  if (!Array.isArray(input.automations) || input.automations.length === 0) {
    throw new Error('automation catalog 需要至少一个 automation descriptor。');
  }
  return {
    surface_kind: 'automation',
    summary: requireString(input.summary, 'summary'),
    automations: input.automations.map((entry) => buildAutomationDescriptor(entry)),
    ...(optionalString(input.readiness_summary) ? { readiness_summary: optionalString(input.readiness_summary)! } : {}),
  };
}
