import { isRecord } from '../../kernel/contract-validation.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';

export interface BuildExecutorAttemptDiagnosticInput {
  contract_id: 'opl_family_runtime_attempt_contract.v1';
  domain_id: string;
  stage_id: string;
  route_ref: string;
  executor_kind: string;
  attempt_index: number;
  adapter: JsonRecord;
  error: {
    message: string;
    code?: string | null;
    failure_kind?: string | null;
  };
  runtime_projection?: JsonRecord | null;
  telemetry?: JsonRecord | null;
  artifact_refs?: JsonRecord[] | null;
  domain_projection?: JsonRecord | null;
}

function requireString(value: unknown, field: string) {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`executor attempt diagnostic 缺少字符串字段: ${field}`);
  }
  return text;
}

function cloneRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`executor attempt diagnostic ${field} 必须是 object`);
  }
  return structuredClone(value) as JsonRecord;
}

function keyAllowsRefOnlyAuthorityField(key: string) {
  return key.endsWith('_ref') || key.endsWith('_refs') || key.endsWith('_ref_count');
}

function rejectAuthorityBodies(value: unknown, field: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectAuthorityBodies(entry, `${field}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [rawKey, entry] of Object.entries(value)) {
    const key = rawKey.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
    const forbidden = [
      'artifact_body',
      'domain_truth',
      'memory_body',
      'owner_receipt',
      'receipt_body',
      'typed_blocker',
      'verdict_body',
    ].some((token) => key.includes(token));
    if (forbidden && !keyAllowsRefOnlyAuthorityField(key)) {
      throw new Error(`executor attempt diagnostic ${field}.${rawKey} 不得携带 authority body`);
    }
    rejectAuthorityBodies(entry, `${field}.${rawKey}`);
  }
}

function normalizeTelemetry(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const telemetry = cloneRecord(value, 'telemetry');
  for (const [key, entry] of Object.entries(telemetry)) {
    if (typeof entry === 'number' && !Number.isFinite(entry)) {
      throw new Error(`executor attempt diagnostic telemetry.${key} 必须是有限数值`);
    }
  }
  rejectAuthorityBodies(telemetry, 'telemetry');
  return telemetry;
}

export function buildExecutorAttemptDiagnostic(input: BuildExecutorAttemptDiagnosticInput) {
  if (input.contract_id !== 'opl_family_runtime_attempt_contract.v1') {
    throw new Error('executor attempt diagnostic contract_id 不受支持');
  }
  if (!Number.isInteger(input.attempt_index) || input.attempt_index < 0) {
    throw new Error('executor attempt diagnostic attempt_index 必须是非负整数');
  }
  const adapter = cloneRecord(input.adapter, 'adapter');
  const runtimeProjection = input.runtime_projection
    ? cloneRecord(input.runtime_projection, 'runtime_projection')
    : null;
  const domainProjection = input.domain_projection
    ? cloneRecord(input.domain_projection, 'domain_projection')
    : null;
  const artifactRefs = (input.artifact_refs ?? []).map((entry, index) => {
    const ref = cloneRecord(entry, `artifact_refs[${index}]`);
    rejectAuthorityBodies(ref, `artifact_refs[${index}]`);
    return ref;
  });
  rejectAuthorityBodies(adapter, 'adapter');
  rejectAuthorityBodies(runtimeProjection, 'runtime_projection');
  rejectAuthorityBodies(domainProjection, 'domain_projection');
  const telemetry = normalizeTelemetry(input.telemetry);

  return {
    surface_kind: 'opl_executor_attempt_diagnostic',
    version: 'opl-executor-attempt-diagnostic.v1',
    contract_id: input.contract_id,
    status: 'failed',
    domain_id: requireString(input.domain_id, 'domain_id'),
    stage_id: requireString(input.stage_id, 'stage_id'),
    route_ref: requireString(input.route_ref, 'route_ref'),
    executor_kind: requireString(input.executor_kind, 'executor_kind'),
    attempt_index: input.attempt_index,
    adapter,
    error: {
      message: requireString(input.error?.message, 'error.message'),
      ...(optionalString(input.error?.code) ? { code: optionalString(input.error.code)! } : {}),
      ...(optionalString(input.error?.failure_kind)
        ? { failure_kind: optionalString(input.error.failure_kind)! }
        : {}),
    },
    ...(runtimeProjection ? { runtime_projection: runtimeProjection } : {}),
    ...(telemetry ? { telemetry } : {}),
    artifact_refs: artifactRefs,
    ...(domainProjection ? { domain_projection: domainProjection } : {}),
    authority_boundary: {
      diagnostic_only: true,
      typed_blocker_created: false,
      owner_receipt_created: false,
      domain_truth_written: false,
      artifact_body_written: false,
      domain_verdict_issued: false,
    },
  };
}
