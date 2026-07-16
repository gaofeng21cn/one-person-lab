import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { FORBIDDEN_AGENT_PACKAGE_FIELDS } from './constants.ts';
import type { AgentPackageAuthorityBoundary, AgentPackageSourceKind, FetchJsonResult } from './types.ts';

const RESERVED_FIRST_PARTY_REGISTRY_CLAIMS = [
  'first_party',
  'first_party_managed',
  'first_party_managed_cohort',
  'first_party_release_catalog',
] as const;

function externalRegistryClaimKey(claim: string) {
  return claim
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function nowIso() {
  return new Date().toISOString();
}

export function sha256Text(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function refsOnlyAuthorityBoundary(): AgentPackageAuthorityBoundary {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_mutate_domain_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

export function resolveHomeDir() {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || process.cwd();
}

export function resolveCodexHome(home = resolveHomeDir()) {
  return process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
}

export function resolveCodexConfigPath(codexHome = resolveCodexHome()) {
  return path.join(codexHome, 'config.toml');
}

export function safePathSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '-');
}

export function normalizeSourceKind(value: string | null | undefined, manifestUrl: string): AgentPackageSourceKind {
  if (
    value === 'first_party_managed_cohort'
    || value === 'bundled_full_runtime_modules'
    || value === 'local_manifest_file'
    || value === 'manifest_url'
    || value === 'manifest_import'
    || value === 'developer_checkout_override'
  ) {
    return value;
  }
  return manifestUrl.startsWith('file:') || path.isAbsolute(manifestUrl)
    ? 'local_manifest_file'
    : 'manifest_url';
}

export function validateUrlLike(value: string, field: string) {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('file:')) {
    return;
  }
  if (path.isAbsolute(value)) {
    return;
  }
  throw new FrameworkContractError('cli_usage_error', `${field} must be http(s), file://, or an absolute local file path.`, {
    field,
    value,
  });
}

export async function fetchJsonSource(
  sourceUrl: string,
  input: { timeoutMs?: number } = {},
): Promise<FetchJsonResult> {
  validateUrlLike(sourceUrl, 'source_url');
  let raw: string;
  let sourceKind: FetchJsonResult['source_kind'];
  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    const timeoutMs = Number.isFinite(input.timeoutMs) && Number(input.timeoutMs) > 0
      ? Math.floor(Number(input.timeoutMs))
      : 60_000;
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new FrameworkContractError('codex_command_failed', 'Agent package source fetch failed.', {
        source_url: sourceUrl,
        status: response.status,
        status_text: response.statusText,
      });
    }
    raw = await response.text();
    sourceKind = 'http_url';
  } else {
    const filePath = sourceUrl.startsWith('file:')
      ? fileURLToPath(sourceUrl)
      : path.resolve(sourceUrl);
    raw = fs.readFileSync(filePath, 'utf8');
    sourceKind = sourceUrl.startsWith('file:') ? 'file_url' : 'local_file';
  }

  try {
    return {
      source_url: sourceUrl,
      source_kind: sourceKind,
      source_sha256: sha256Text(raw),
      payload: parseJsonText(raw),
    };
  } catch (error) {
    throw new FrameworkContractError('contract_json_invalid', 'Agent package source must be valid JSON.', {
      source_url: sourceUrl,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export function missingFields(record: Record<string, unknown>, fields: readonly string[]) {
  return fields.filter((field) => {
    const value = record[field];
    if (typeof value === 'string') {
      return value.trim().length === 0;
    }
    return value === undefined || value === null;
  });
}

export function assertNoForbiddenFields(record: Record<string, unknown>, sourceLabel: string) {
  const forbidden = FORBIDDEN_AGENT_PACKAGE_FIELDS.filter((field) => field in record);
  if (forbidden.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package metadata must not define session or domain behavior authority.', {
      source: sourceLabel,
      forbidden_fields: forbidden,
      forbidden_reason: 'OPL App and Framework only manage package install/launch/receipt boundaries.',
    });
  }
}

export function assertStringValue(value: unknown, field: string): string {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package field is required.', {
      field,
      failure_code: 'agent_package_field_required',
    });
  }
  return normalized;
}

export function assertExplicitExternalRegistryClaim(
  value: unknown,
  input: {
    field: 'source' | 'trust_tier';
    sourceLabel: string;
    failureCode: string;
  },
) {
  const claim = stringValue(value);
  const claimKey = claim ? externalRegistryClaimKey(claim) : null;
  if (
    !claim
    || claimKey?.startsWith('firstparty') === true
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `External package registries require an explicit non-first-party ${input.field}.`,
      {
        source: input.sourceLabel,
        field: input.field,
        declared_claim: claim,
        forbidden_first_party_claims: [...RESERVED_FIRST_PARTY_REGISTRY_CLAIMS],
        failure_code: input.failureCode,
      },
    );
  }
  return claim;
}
