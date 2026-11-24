import { isRecord } from '../../../kernel/contract-validation.ts';
import crypto from 'node:crypto';
import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { fail, requiredString, assertDigest } from './validation-values.ts';
import { FOUNDRY_PROTOCOL_VERSION } from './types.ts';
import type { DesignRequest } from './types.ts';

const FORBIDDEN_FIELD_NAMES = new Set([
  'repo_path',
  'repo_dir',
  'repo_root',
  'repository_path',
  'file_path',
  'worktree',
  'worktree_path',
  'branch',
  'branch_name',
  'cli',
  'command',
  'commands',
  'queue',
  'queue_id',
  'lease',
  'lease_id',
  'attempt',
  'attempt_id',
  'overwrite_policy',
  'promotion_ledger',
  'hidden_test_body',
  'hidden_test_bodies',
  'protected_test_body',
  'protected_test_bodies',
  'protected_case_body',
  'protected_case_bodies',
  'patch',
  'patches',
  'work_order',
  'work_orders',
]);

function looksLikePhysicalPath(value: string) {
  return value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || value.startsWith('file:')
    || /^[A-Za-z]:[\\/]/.test(value);
}

function scanForbidden(value: unknown, at: string, violations: string[]) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!at.endsWith('/semantic_path') && looksLikePhysicalPath(normalized)) {
      violations.push(`${at}:physical_path`);
    }
    if (normalized.toLowerCase().startsWith('attempt:')) violations.push(`${at}:forbidden_attempt_ref`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbidden(entry, `${at}/${index}`, violations));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/-/g, '_')
      .toLowerCase();
    if (FORBIDDEN_FIELD_NAMES.has(normalizedKey) || normalizedKey.split('_').includes('attempt')) {
      violations.push(`${at}/${key}:forbidden_field`);
    }
    scanForbidden(entry, `${at}/${key}`, violations);
  }
}

export function assertFoundryProtocolPurity(value: unknown, label: string) {
  const violations: string[] = [];
  scanForbidden(value, '$', violations);
  if (violations.length > 0) {
    fail(`${label} crosses the Foundry semantic protocol boundary.`, { violations });
  }
}

function assertIdentity(value: Record<string, unknown>, label: string) {
  requiredString(value.target_agent_id, `${label}.target_agent_id`);
  requiredString(value.target_domain_id, `${label}.target_domain_id`);
  if (value.target_version_ref !== null) assertDigest(value.target_version_ref, `${label}.target_version_ref`);
}

export function assertBase(value: unknown, surfaceKind: string, label: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  if (value.surface_kind !== surfaceKind) fail(`${label}.surface_kind must be ${surfaceKind}.`);
  if (value.version !== FOUNDRY_PROTOCOL_VERSION) fail(`${label}.version must be ${FOUNDRY_PROTOCOL_VERSION}.`);
  assertIdentity(value, label);
  assertFoundryProtocolPurity(value, label);
  return value;
}

export function foundryContentDigest(value: unknown) {
  assertFoundryProtocolPurity(value, 'Foundry protocol object');
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value), 'utf8').digest('hex')}`;
}

export function assertSameTarget(
  left: Pick<DesignRequest, 'target_agent_id' | 'target_domain_id' | 'target_version_ref'>,
  right: Pick<DesignRequest, 'target_agent_id' | 'target_domain_id' | 'target_version_ref'>,
  label: string,
) {
  if (
    left.target_agent_id !== right.target_agent_id
    || left.target_domain_id !== right.target_domain_id
    || left.target_version_ref !== right.target_version_ref
  ) {
    fail(`${label} target identity is stale or mismatched.`, { expected: left, actual: right });
  }
}
