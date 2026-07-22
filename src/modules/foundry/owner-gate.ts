import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type {
  OwnerAuthorityReceipt,
  OwnerAuthorityReceiptStatement,
  OwnerGate,
  OwnerGateAction,
  OwnerGateDecision,
  OwnerGateVerification,
  OwnerGateVerificationContext,
} from './ports.ts';

const RECEIPT_SURFACE = 'opl_foundry_owner_authority_receipt';
const RECEIPT_VERSION = 'opl-foundry-owner-authority-receipt.v1';
const CONTEXT_SURFACE = 'opl_foundry_owner_gate_verification_context';
const CONTEXT_VERSION = 'opl-foundry-owner-gate-verification-context.v1';
const VERIFICATION_SURFACE = 'opl_foundry_owner_gate_verification';
const VERIFICATION_VERSION = 'opl-foundry-owner-gate-verification.v1';
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

const ACTION_DECISIONS: Record<OwnerGateAction, OwnerGateDecision> = {
  authorize_improve: 'approve',
  approve_canary: 'approve',
  reject_canary: 'reject',
  approve_active: 'approve',
  reject_active: 'reject',
  cancel: 'cancel',
  rollback: 'rollback',
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string) {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (canonicalJsonText(actual) !== canonicalJsonText(canonicalExpected)) {
    fail(`${label} has unknown or missing fields.`, { expected_keys: canonicalExpected, actual_keys: actual });
  }
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`);
  return value.trim();
}

function nullableString(value: unknown, field: string) {
  return value === null ? null : requiredString(value, field);
}

function expectedRevision(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(`${field} must be a non-negative safe integer.`, { actual: value });
  }
  return Number(value);
}

function timestamp(value: unknown, field: string) {
  const result = requiredString(value, field);
  if (!Number.isFinite(Date.parse(result))) fail(`${field} must be an ISO-compatible timestamp.`);
  return result;
}

function optionalDigest(value: unknown, field: string) {
  if (value === null) return null;
  const result = requiredString(value, field);
  if (!DIGEST_PATTERN.test(result)) fail(`${field} must be a SHA-256 digest.`);
  return result;
}

function action(value: unknown, field: string): OwnerGateAction {
  const result = requiredString(value, field) as OwnerGateAction;
  if (!Object.hasOwn(ACTION_DECISIONS, result)) fail(`${field} is invalid.`, { action: result });
  return result;
}

function decision(value: unknown, field: string): OwnerGateDecision {
  const result = requiredString(value, field) as OwnerGateDecision;
  if (!Object.values(ACTION_DECISIONS).includes(result)) fail(`${field} is invalid.`, { decision: result });
  return result;
}

function assertActionDecision(actionValue: OwnerGateAction, decisionValue: OwnerGateDecision, label: string) {
  if (ACTION_DECISIONS[actionValue] !== decisionValue) {
    fail(`${label} action and decision do not agree.`, { action: actionValue, decision: decisionValue });
  }
}

function assertRunVersionShape(input: {
  action: OwnerGateAction;
  run_id: string | null;
  version_digest: string | null;
}, label: string) {
  if (input.action === 'rollback') {
    if (input.run_id !== null || input.version_digest === null) {
      fail(`${label} rollback must bind one version digest and no FoundryRun id.`);
    }
    return;
  }
  if (input.run_id === null) fail(`${label} ${input.action} must bind one FoundryRun id.`);
  if (input.action !== 'cancel' && input.version_digest === null) {
    fail(`${label} ${input.action} must bind the qualified AgentVersion digest.`);
  }
}

function digest(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value), 'utf8').digest('hex')}`;
}

export function ownerAuthorityReceiptRef(receiptDigest: string) {
  if (!DIGEST_PATTERN.test(receiptDigest)) fail('Owner authority receipt digest is invalid.');
  return `opl://foundry/owner-authority-receipts/${receiptDigest}`;
}

export function validateOwnerGateVerificationContext(value: unknown): OwnerGateVerificationContext {
  if (!isRecord(value)) fail('Owner gate verification context must be an object.');
  exactKeys(value, [
    'surface_kind',
    'version',
    'authority_receipt_ref',
    'action',
    'decision',
    'target_agent_id',
    'target_domain_id',
    'run_id',
    'version_digest',
    'expected_revision',
  ], 'Owner gate verification context');
  if (value.surface_kind !== CONTEXT_SURFACE || value.version !== CONTEXT_VERSION) {
    fail('Owner gate verification context identity is invalid.');
  }
  const actionValue = action(value.action, 'Owner gate context action');
  const decisionValue = decision(value.decision, 'Owner gate context decision');
  assertActionDecision(actionValue, decisionValue, 'Owner gate verification context');
  const runId = nullableString(value.run_id, 'Owner gate context run_id');
  const versionDigest = optionalDigest(value.version_digest, 'Owner gate context version_digest');
  assertRunVersionShape({ action: actionValue, run_id: runId, version_digest: versionDigest }, 'Owner gate context');
  return {
    surface_kind: CONTEXT_SURFACE,
    version: CONTEXT_VERSION,
    authority_receipt_ref: requiredString(value.authority_receipt_ref, 'Owner gate context authority_receipt_ref'),
    action: actionValue,
    decision: decisionValue,
    target_agent_id: requiredString(value.target_agent_id, 'Owner gate context target_agent_id'),
    target_domain_id: requiredString(value.target_domain_id, 'Owner gate context target_domain_id'),
    run_id: runId,
    version_digest: versionDigest,
    expected_revision: expectedRevision(value.expected_revision, 'Owner gate context expected_revision'),
  };
}

export function validateOwnerAuthorityReceiptStatement(value: unknown): OwnerAuthorityReceiptStatement {
  if (!isRecord(value)) fail('Owner authority receipt statement must be an object.');
  exactKeys(value, [
    'surface_kind',
    'version',
    'receipt_id',
    'authority_ref',
    'action',
    'decision',
    'target_agent_id',
    'target_domain_id',
    'run_id',
    'version_digest',
    'expected_revision',
    'issued_at',
  ], 'Owner authority receipt statement');
  if (value.surface_kind !== RECEIPT_SURFACE || value.version !== RECEIPT_VERSION) {
    fail('Owner authority receipt identity is invalid.');
  }
  const actionValue = action(value.action, 'Owner authority receipt action');
  const decisionValue = decision(value.decision, 'Owner authority receipt decision');
  assertActionDecision(actionValue, decisionValue, 'Owner authority receipt');
  const runId = nullableString(value.run_id, 'Owner authority receipt run_id');
  const versionDigest = optionalDigest(value.version_digest, 'Owner authority receipt version_digest');
  assertRunVersionShape({ action: actionValue, run_id: runId, version_digest: versionDigest }, 'Owner authority receipt');
  return {
    surface_kind: RECEIPT_SURFACE,
    version: RECEIPT_VERSION,
    receipt_id: requiredString(value.receipt_id, 'Owner authority receipt receipt_id'),
    authority_ref: requiredString(value.authority_ref, 'Owner authority receipt authority_ref'),
    action: actionValue,
    decision: decisionValue,
    target_agent_id: requiredString(value.target_agent_id, 'Owner authority receipt target_agent_id'),
    target_domain_id: requiredString(value.target_domain_id, 'Owner authority receipt target_domain_id'),
    run_id: runId,
    version_digest: versionDigest,
    expected_revision: expectedRevision(value.expected_revision, 'Owner authority receipt expected_revision'),
    issued_at: timestamp(value.issued_at, 'Owner authority receipt issued_at'),
  };
}

export function materializeOwnerAuthorityReceipt(value: unknown): OwnerAuthorityReceipt {
  const statement = validateOwnerAuthorityReceiptStatement(value);
  const receiptDigest = digest(statement);
  return {
    ...statement,
    receipt_digest: receiptDigest,
    receipt_ref: ownerAuthorityReceiptRef(receiptDigest),
  };
}

export function validateOwnerAuthorityReceipt(value: unknown): OwnerAuthorityReceipt {
  if (!isRecord(value)) fail('Owner authority receipt must be an object.');
  exactKeys(value, [
    'surface_kind',
    'version',
    'receipt_id',
    'authority_ref',
    'action',
    'decision',
    'target_agent_id',
    'target_domain_id',
    'run_id',
    'version_digest',
    'expected_revision',
    'issued_at',
    'receipt_digest',
    'receipt_ref',
  ], 'Owner authority receipt');
  const { receipt_digest: claimedDigest, receipt_ref: claimedRef, ...rawStatement } = value;
  const canonical = materializeOwnerAuthorityReceipt(rawStatement);
  if (claimedDigest !== canonical.receipt_digest || claimedRef !== canonical.receipt_ref) {
    fail('Owner authority receipt ref or digest does not match its canonical statement.', {
      expected_receipt_digest: canonical.receipt_digest,
      expected_receipt_ref: canonical.receipt_ref,
      actual_receipt_digest: claimedDigest,
      actual_receipt_ref: claimedRef,
    });
  }
  return canonical;
}

export function validateOwnerGateVerification(
  contextValue: unknown,
  verificationValue: unknown,
): OwnerGateVerification {
  const context = validateOwnerGateVerificationContext(contextValue);
  if (!isRecord(verificationValue)) fail('Owner gate verification must be an object.');
  exactKeys(verificationValue, [
    'surface_kind',
    'version',
    'verifier_id',
    'verification_ref',
    'authority_policy_ref',
    'verified_at',
    'covered_authority_ref',
    'receipt',
  ], 'Owner gate verification');
  if (verificationValue.surface_kind !== VERIFICATION_SURFACE
    || verificationValue.version !== VERIFICATION_VERSION) {
    fail('Owner gate verification identity is invalid.');
  }
  const receipt = validateOwnerAuthorityReceipt(verificationValue.receipt);
  const coveredAuthorityRef = requiredString(
    verificationValue.covered_authority_ref,
    'Owner gate verification covered_authority_ref',
  );
  if (
    receipt.receipt_ref !== context.authority_receipt_ref
    || receipt.action !== context.action
    || receipt.decision !== context.decision
    || receipt.target_agent_id !== context.target_agent_id
    || receipt.target_domain_id !== context.target_domain_id
    || receipt.run_id !== context.run_id
    || receipt.version_digest !== context.version_digest
    || receipt.expected_revision !== context.expected_revision
    || receipt.authority_ref !== coveredAuthorityRef
  ) {
    fail('Owner gate verification does not cover the exact requested authority mutation.', {
      context,
      receipt,
      covered_authority_ref: coveredAuthorityRef,
    });
  }
  return {
    surface_kind: VERIFICATION_SURFACE,
    version: VERIFICATION_VERSION,
    verifier_id: requiredString(verificationValue.verifier_id, 'Owner gate verification verifier_id'),
    verification_ref: requiredString(verificationValue.verification_ref, 'Owner gate verification verification_ref'),
    authority_policy_ref: requiredString(
      verificationValue.authority_policy_ref,
      'Owner gate verification authority_policy_ref',
    ),
    verified_at: timestamp(verificationValue.verified_at, 'Owner gate verification verified_at'),
    covered_authority_ref: coveredAuthorityRef,
    receipt,
  };
}

export class FailClosedOwnerGate implements OwnerGate {
  readonly #reason: string;

  constructor(reason = 'Foundry OwnerGate has no configured authority verifier.') {
    this.#reason = reason;
  }

  async verify(_input: OwnerGateVerificationContext): Promise<never> {
    fail(this.#reason, { failure_code: 'foundry_owner_gate_verifier_unconfigured' });
  }
}
