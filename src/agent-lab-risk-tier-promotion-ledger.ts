import fs from 'node:fs';
import path from 'node:path';

import { assessIndependentAiReviewReceipt } from './agent-lab.ts';
import { AGENT_LAB_PROMOTION_AUTHORITY_BOUNDARY } from './agent-lab-promotion.ts';
import { ensureOplStateDir, resolveOplStatePaths } from './runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

type AgentLabRiskTier = 'low_risk' | 'medium_risk';

export type AgentLabRiskTierAutoPromotionReceipt = {
  surface_kind: 'opl_agent_lab_risk_tier_auto_promotion_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_surface: 'opl_agent_lab_risk_tier_auto_promotion';
  target_repo_id: string;
  mechanism_candidate_ref: string;
  risk_tier: AgentLabRiskTier;
  failure_delta_refs: string[];
  independent_ai_review_receipt_ref: string;
  independent_ai_review_receipt: JsonRecord;
  independent_ai_review_assessment: ReturnType<typeof assessIndependentAiReviewReceipt>;
  promotion_receipt_refs: string[];
  rollback_target_refs: string[];
  canary_observation_refs: string[];
  no_forbidden_write_refs: string[];
  verification_refs: string[];
  source_surface: 'opl_agent_lab_risk_tier_auto_promotion_evidence';
  authority_boundary: typeof AGENT_LAB_PROMOTION_AUTHORITY_BOUNDARY & {
    refs_only: true;
    can_claim_developer_mode_live_route_ready: false;
    can_claim_production_ready: false;
  };
};

export type AgentLabRiskTierAutoPromotionReceiptInput = {
  target_repo_id?: string | null;
  mechanism_candidate_ref?: string | null;
  risk_tier?: string | null;
  failure_delta_refs?: string[];
  independent_ai_review_receipt_ref?: string | null;
  independent_ai_review_receipt?: unknown;
  promotion_receipt_refs?: string[];
  rollback_target_refs?: string[];
  canary_observation_refs?: string[];
  no_forbidden_write_refs?: string[];
  verification_refs?: string[];
  receipt_ref?: string | null;
};

export type AgentLabRiskTierAutoPromotionVerifyInput = {
  receipt_ref?: string | null;
};

type AgentLabRiskTierAutoPromotionBlockedReceipt = {
  surface_kind: 'opl_agent_lab_risk_tier_auto_promotion_blocked_receipt';
  status: 'blocked';
  target_repo_id: string | null;
  mechanism_candidate_ref: string | null;
  risk_tier: string | null;
  missing_promotion_refs: string[];
  blocker: {
    blocker_kind: 'agent_lab_risk_tier_auto_promotion_receipt_gate';
    blocker_id:
      | 'agent_lab_risk_tier_auto_promotion_refs_incomplete'
      | 'agent_lab_risk_tier_auto_promotion_requires_low_or_medium_risk'
      | 'agent_lab_risk_tier_auto_promotion_independent_ai_review_not_verified'
      | 'agent_lab_risk_tier_auto_promotion_independent_ai_review_ref_mismatch'
      | 'agent_lab_risk_tier_auto_promotion_candidate_ref_mismatch';
    required_owner: 'opl_agent_lab_independent_ai_reviewer';
  };
  authority_boundary: AgentLabRiskTierAutoPromotionReceipt['authority_boundary'];
};

type AgentLabRiskTierAutoPromotionLedger = {
  surface_kind: 'opl_agent_lab_risk_tier_auto_promotion_ledger';
  version: 'opl-agent-lab-risk-tier-auto-promotion-ledger.v1';
  receipts: AgentLabRiskTierAutoPromotionReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return Array.isArray(value)
    ? value.map(optionalString).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function authorityBoundary(): AgentLabRiskTierAutoPromotionReceipt['authority_boundary'] {
  return {
    ...AGENT_LAB_PROMOTION_AUTHORITY_BOUNDARY,
    refs_only: true,
    can_claim_developer_mode_live_route_ready: false,
    can_claim_production_ready: false,
  };
}

function emptyLedger(): AgentLabRiskTierAutoPromotionLedger {
  return {
    surface_kind: 'opl_agent_lab_risk_tier_auto_promotion_ledger',
    version: 'opl-agent-lab-risk-tier-auto-promotion-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().agent_lab_risk_tier_auto_promotion_ledger_file;
}

function receiptRef(input: AgentLabRiskTierAutoPromotionReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const targetRepoId = optionalString(input.target_repo_id) ?? 'unknown-target-repo';
  const riskTier = optionalString(input.risk_tier) ?? 'unknown-risk-tier';
  const candidateRef = optionalString(input.mechanism_candidate_ref) ?? 'unknown-candidate';
  return `agent-lab-risk-tier-auto-promotion-ref:${encodeURIComponent(targetRepoId)}/${encodeURIComponent(riskTier)}/${encodeURIComponent(candidateRef)}`;
}

function riskTier(value: unknown): AgentLabRiskTier | null {
  const text = optionalString(value);
  if (text === 'low_risk' || text === 'medium_risk') {
    return text;
  }
  return null;
}

function requiredRefs(input: AgentLabRiskTierAutoPromotionReceiptInput) {
  const required: Array<[string, string[]]> = [
    ['target_repo_id', optionalString(input.target_repo_id) ? ['present'] : []],
    ['mechanism_candidate_ref', optionalString(input.mechanism_candidate_ref) ? ['present'] : []],
    ['risk_tier', optionalString(input.risk_tier) ? ['present'] : []],
    ['failure_delta_refs', uniqueStrings(input.failure_delta_refs ?? [])],
    ['independent_ai_review_receipt_ref', optionalString(input.independent_ai_review_receipt_ref) ? ['present'] : []],
    ['independent_ai_review_receipt', isRecord(input.independent_ai_review_receipt) ? ['present'] : []],
    ['promotion_receipt_refs', uniqueStrings(input.promotion_receipt_refs ?? [])],
    ['rollback_target_refs', uniqueStrings(input.rollback_target_refs ?? [])],
    ['canary_observation_refs', uniqueStrings(input.canary_observation_refs ?? [])],
    ['no_forbidden_write_refs', uniqueStrings(input.no_forbidden_write_refs ?? [])],
    ['verification_refs', uniqueStrings(input.verification_refs ?? [])],
  ];
  return required.filter(([, refs]) => refs.length === 0).map(([field]) => field);
}

function blockedReceipt(
  input: AgentLabRiskTierAutoPromotionReceiptInput,
  blockerId: AgentLabRiskTierAutoPromotionBlockedReceipt['blocker']['blocker_id'],
  missingRefs: string[] = [],
): AgentLabRiskTierAutoPromotionBlockedReceipt {
  return {
    surface_kind: 'opl_agent_lab_risk_tier_auto_promotion_blocked_receipt',
    status: 'blocked',
    target_repo_id: optionalString(input.target_repo_id),
    mechanism_candidate_ref: optionalString(input.mechanism_candidate_ref),
    risk_tier: optionalString(input.risk_tier),
    missing_promotion_refs: uniqueStrings(missingRefs),
    blocker: {
      blocker_kind: 'agent_lab_risk_tier_auto_promotion_receipt_gate',
      blocker_id: blockerId,
      required_owner: 'opl_agent_lab_independent_ai_reviewer',
    },
    authority_boundary: authorityBoundary(),
  };
}

function normalizeInput(input: AgentLabRiskTierAutoPromotionReceiptInput) {
  const missingRefs = requiredRefs(input);
  if (missingRefs.length > 0) {
    return blockedReceipt(
      input,
      'agent_lab_risk_tier_auto_promotion_refs_incomplete',
      missingRefs,
    );
  }

  const normalizedRiskTier = riskTier(input.risk_tier);
  if (!normalizedRiskTier) {
    return blockedReceipt(
      input,
      'agent_lab_risk_tier_auto_promotion_requires_low_or_medium_risk',
      ['low_or_medium_risk_tier'],
    );
  }

  const reviewReceipt = input.independent_ai_review_receipt as JsonRecord;
  const assessment = assessIndependentAiReviewReceipt(reviewReceipt);
  const independentReviewRef = optionalString(input.independent_ai_review_receipt_ref);
  const candidateRef = optionalString(input.mechanism_candidate_ref);

  if (!assessment.ai_review_approved) {
    return blockedReceipt(
      input,
      'agent_lab_risk_tier_auto_promotion_independent_ai_review_not_verified',
      ['real_independent_ai_review_receipt'],
    );
  }
  if (assessment.receipt_ref !== independentReviewRef) {
    return blockedReceipt(
      input,
      'agent_lab_risk_tier_auto_promotion_independent_ai_review_ref_mismatch',
      ['matching_independent_ai_review_receipt_ref'],
    );
  }
  if (assessment.reviewed_mechanism_candidate_ref !== candidateRef) {
    return blockedReceipt(
      input,
      'agent_lab_risk_tier_auto_promotion_candidate_ref_mismatch',
      ['matching_reviewed_mechanism_candidate_ref'],
    );
  }

  const receipt: AgentLabRiskTierAutoPromotionReceipt = {
    surface_kind: 'opl_agent_lab_risk_tier_auto_promotion_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_surface: 'opl_agent_lab_risk_tier_auto_promotion',
    target_repo_id: optionalString(input.target_repo_id) ?? '',
    mechanism_candidate_ref: candidateRef ?? '',
    risk_tier: normalizedRiskTier,
    failure_delta_refs: uniqueStrings(input.failure_delta_refs ?? []),
    independent_ai_review_receipt_ref: independentReviewRef ?? '',
    independent_ai_review_receipt: reviewReceipt,
    independent_ai_review_assessment: assessment,
    promotion_receipt_refs: uniqueStrings(input.promotion_receipt_refs ?? []),
    rollback_target_refs: uniqueStrings(input.rollback_target_refs ?? []),
    canary_observation_refs: uniqueStrings(input.canary_observation_refs ?? []),
    no_forbidden_write_refs: uniqueStrings(input.no_forbidden_write_refs ?? []),
    verification_refs: uniqueStrings(input.verification_refs ?? []),
    source_surface: 'opl_agent_lab_risk_tier_auto_promotion_evidence',
    authority_boundary: authorityBoundary(),
  };
  return receipt;
}

function normalizeReceipt(value: unknown): AgentLabRiskTierAutoPromotionReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const input: AgentLabRiskTierAutoPromotionReceiptInput = {
    target_repo_id: optionalString(value.target_repo_id),
    mechanism_candidate_ref: optionalString(value.mechanism_candidate_ref),
    risk_tier: optionalString(value.risk_tier),
    failure_delta_refs: stringList(value.failure_delta_refs),
    independent_ai_review_receipt_ref: optionalString(value.independent_ai_review_receipt_ref),
    independent_ai_review_receipt: value.independent_ai_review_receipt,
    promotion_receipt_refs: stringList(value.promotion_receipt_refs),
    rollback_target_refs: stringList(value.rollback_target_refs),
    canary_observation_refs: stringList(value.canary_observation_refs),
    no_forbidden_write_refs: stringList(value.no_forbidden_write_refs),
    verification_refs: stringList(value.verification_refs),
    receipt_ref: optionalString(value.receipt_ref),
  };
  const normalized = normalizeInput(input);
  if (normalized.surface_kind !== 'opl_agent_lab_risk_tier_auto_promotion_receipt') {
    return null;
  }
  return {
    ...normalized,
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
  };
}

export function readAgentLabRiskTierAutoPromotionLedger():
  AgentLabRiskTierAutoPromotionLedger {
  const file = ledgerPath();
  if (!fs.existsSync(file)) {
    return emptyLedger();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
      return emptyLedger();
    }
    return {
      ...emptyLedger(),
      receipts: parsed.receipts
        .map(normalizeReceipt)
        .filter((receipt): receipt is AgentLabRiskTierAutoPromotionReceipt =>
          Boolean(receipt)
        ),
    };
  } catch {
    return emptyLedger();
  }
}

function writeAgentLabRiskTierAutoPromotionLedger(
  ledger: AgentLabRiskTierAutoPromotionLedger,
) {
  const paths = ensureOplStateDir();
  fs.writeFileSync(
    paths.agent_lab_risk_tier_auto_promotion_ledger_file,
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
}

export function recordAgentLabRiskTierAutoPromotionReceipts(
  inputs: AgentLabRiskTierAutoPromotionReceiptInput[],
) {
  const normalized = inputs.map(normalizeInput);
  const receipts = normalized.filter(
    (entry): entry is AgentLabRiskTierAutoPromotionReceipt =>
      entry.surface_kind === 'opl_agent_lab_risk_tier_auto_promotion_receipt',
  );
  const blockedReceipts = normalized.filter(
    (entry): entry is AgentLabRiskTierAutoPromotionBlockedReceipt =>
      entry.surface_kind === 'opl_agent_lab_risk_tier_auto_promotion_blocked_receipt',
  );

  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_agent_lab_risk_tier_promotion_ledger_record',
      status: 'no_eligible_agent_lab_risk_tier_auto_promotion_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
      blocked_receipts: blockedReceipts,
      authority_boundary: authorityBoundary(),
    };
  }

  const ledger = readAgentLabRiskTierAutoPromotionLedger();
  for (const receipt of receipts) {
    const existingIndex = ledger.receipts.findIndex((entry) =>
      entry.receipt_ref === receipt.receipt_ref
    );
    if (existingIndex >= 0) {
      ledger.receipts[existingIndex] = receipt;
    } else {
      ledger.receipts.unshift(receipt);
    }
  }
  writeAgentLabRiskTierAutoPromotionLedger(ledger);
  return {
    surface_kind: 'opl_agent_lab_risk_tier_promotion_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
    blocked_receipts: blockedReceipts,
    authority_boundary: authorityBoundary(),
  };
}

export function verifyAgentLabRiskTierAutoPromotionReceipt(
  input: AgentLabRiskTierAutoPromotionVerifyInput = {},
) {
  const ledger = readAgentLabRiskTierAutoPromotionLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_agent_lab_risk_tier_promotion_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'agent_lab_risk_tier_auto_promotion_receipt_gate',
        blocker_id: 'agent_lab_risk_tier_auto_promotion_receipt_not_found',
        required_owner: 'opl_agent_lab_independent_ai_reviewer',
      },
      authority_boundary: authorityBoundary(),
    };
  }

  const current = ledger.receipts[selectedIndex];
  const verified = {
    ...current,
    receipt_status: 'verified' as const,
  };
  ledger.receipts[selectedIndex] = verified;
  writeAgentLabRiskTierAutoPromotionLedger(ledger);
  return {
    surface_kind: 'opl_agent_lab_risk_tier_promotion_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: authorityBoundary(),
  };
}

export function listAgentLabRiskTierAutoPromotionReceipts() {
  return readAgentLabRiskTierAutoPromotionLedger().receipts;
}

export function verifiedAgentLabRiskTierAutoPromotionReceiptRefs() {
  return listAgentLabRiskTierAutoPromotionReceipts()
    .filter((receipt) => receipt.receipt_status === 'verified')
    .map((receipt) => receipt.receipt_ref);
}

export function hasVerifiedAgentLabRiskTierAutoPromotionReceiptRef(
  receiptRef: string,
) {
  return verifiedAgentLabRiskTierAutoPromotionReceiptRefs().includes(receiptRef);
}

export function agentLabRiskTierAutoPromotionLedgerFilePath() {
  return path.resolve(ledgerPath());
}
