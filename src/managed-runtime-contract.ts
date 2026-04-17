import fs from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

export interface ManagedRuntimeThreeLayerContract {
  contract_ref: string;
  contract_id: string;
  required_owner_fields: string[];
  required_surface_locator_fields: string[];
  canonical_fail_closed_rules: string[];
}

export interface NormalizedManagedRuntimeContract {
  shared_contract_ref: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  supervision_status_surface: {
    surface_kind: string;
    owner: string;
  };
  attention_queue_surface: {
    surface_kind: string;
    owner: string;
  };
  recovery_contract_surface: {
    surface_kind: string;
    owner: string;
  };
  fail_closed_rules: string[];
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
    throw new Error(`managed runtime contract 缺少字符串字段: ${field}`);
  }
  return text;
}

function readStringList(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`managed runtime contract 缺少数组字段: ${field}`);
  }
  const normalized = value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (normalized.length !== value.length) {
    throw new Error(`managed runtime contract 数组字段包含空字符串: ${field}`);
  }
  return normalized;
}

function normalizeSurface(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new Error(`managed runtime contract 缺少对象字段: ${field}`);
  }
  return {
    surface_kind: requireString(value.surface_kind, `${field}.surface_kind`),
    owner: requireString(value.owner, `${field}.owner`),
  };
}

export function readManagedRuntimeThreeLayerContract(repoRoot: string): ManagedRuntimeThreeLayerContract {
  const filePath = path.join(repoRoot, 'contracts', 'opl-gateway', 'managed-runtime-three-layer-contract.json');
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
  return {
    contract_ref: requireString(payload.contract_ref, 'contract_ref'),
    contract_id: requireString(payload.contract_id, 'contract_id'),
    required_owner_fields: readStringList(payload.required_owner_fields, 'required_owner_fields'),
    required_surface_locator_fields: readStringList(
      payload.required_surface_locator_fields,
      'required_surface_locator_fields',
    ),
    canonical_fail_closed_rules: readStringList(
      payload.canonical_fail_closed_rules,
      'canonical_fail_closed_rules',
    ),
  };
}

export function normalizeManagedRuntimeContract(value: unknown): NormalizedManagedRuntimeContract | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    shared_contract_ref: requireString(value.shared_contract_ref, 'shared_contract_ref'),
    runtime_owner: requireString(value.runtime_owner, 'runtime_owner'),
    domain_owner: requireString(value.domain_owner, 'domain_owner'),
    executor_owner: requireString(value.executor_owner, 'executor_owner'),
    supervision_status_surface: normalizeSurface(
      value.supervision_status_surface,
      'supervision_status_surface',
    ),
    attention_queue_surface: normalizeSurface(
      value.attention_queue_surface,
      'attention_queue_surface',
    ),
    recovery_contract_surface: normalizeSurface(
      value.recovery_contract_surface,
      'recovery_contract_surface',
    ),
    fail_closed_rules: readStringList(value.fail_closed_rules, 'fail_closed_rules'),
  };
}
