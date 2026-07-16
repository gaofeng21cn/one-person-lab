import { isRecord } from '../../kernel/contract-validation.ts';
import {
  optionalString,
  readJsonFileOrNull,
  writeJsonPayloadFile,
} from '../../kernel/json-file.ts';
import {
  stringList as arrayStringList,
} from '../../kernel/json-record.ts';
import { ensureOplStateDir, resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

type DeveloperModeCloseoutRouteDecision = 'direct-fix' | 'fork-PR' | 'observe-only';

export type DeveloperModeCloseoutReceipt = {
  surface_kind: 'opl_developer_mode_closeout_receipt';
  receipt_ref: string;
  receipt_status: 'recorded' | 'verified';
  recorded_at: string;
  target_surface: 'opl_developer_mode_live_closeout';
  target_repo_id: string;
  route_decision: DeveloperModeCloseoutRouteDecision;
  route_eligibility: string;
  patrol_observation_ref: string;
  diff_ref: string;
  verification_refs: string[];
  no_forbidden_write_ref: string;
  commit_ref: string | null;
  fork_repo_ref: string | null;
  pr_review_ref: string | null;
  owner_acceptance_ref: string;
  route_repetition_refs: string[];
  foundry_activation_transaction_refs: string[];
  app_patrol_mount_refs: string[];
  source_surface: 'opl_developer_mode_closeout_evidence';
  authority_boundary: {
    refs_only: true;
    can_write_domain_truth: false;
    can_write_memory_body: false;
    can_read_memory_body: false;
    can_read_artifact_body: false;
    can_mutate_artifact_body: false;
    can_authorize_quality_or_export: false;
    can_create_owner_receipt: false;
    can_write_owner_receipt: false;
    can_modify_managed_runtime: false;
    can_close_domain_ready: false;
    can_claim_release_ready: false;
    can_claim_production_ready: false;
    can_close_developer_mode_live_route: false;
  };
};

export type DeveloperModeCloseoutReceiptInput = {
  target_repo_id?: string | null;
  route_decision?: string | null;
  route_eligibility?: string | null;
  patrol_observation_ref?: string | null;
  diff_ref?: string | null;
  verification_refs?: string[];
  no_forbidden_write_ref?: string | null;
  commit_ref?: string | null;
  fork_repo_ref?: string | null;
  pr_review_ref?: string | null;
  owner_acceptance_ref?: string | null;
  route_repetition_refs?: string[];
  foundry_activation_transaction_refs?: string[];
  app_patrol_mount_refs?: string[];
  receipt_ref?: string | null;
};

export type DeveloperModeCloseoutReceiptVerifyInput = {
  receipt_ref?: string | null;
};

type DeveloperModeCloseoutBlockedReceipt = {
  surface_kind: 'opl_developer_mode_closeout_blocked_receipt';
  status: 'blocked';
  target_repo_id: string | null;
  route_decision: string | null;
  missing_closeout_refs: string[];
  blocker: {
    blocker_kind: 'developer_mode_closeout_receipt_gate';
    blocker_id: string;
    required_owner: 'external_repo_owner_or_developer_mode_operator';
  };
  authority_boundary: DeveloperModeCloseoutReceipt['authority_boundary'];
};

type DeveloperModeCloseoutLedger = {
  surface_kind: 'opl_developer_mode_closeout_ledger';
  version: 'opl-developer-mode-closeout-ledger.v1';
  receipts: DeveloperModeCloseoutReceipt[];
};

function nowIso() {
  return new Date().toISOString();
}

function stringArrayOrScalar(value: unknown) {
  const scalar = optionalString(value);
  if (scalar) {
    return [scalar];
  }
  return arrayStringList(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsOnlyAuthorityBoundary(): DeveloperModeCloseoutReceipt['authority_boundary'] {
  return {
    refs_only: true,
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact_body: false,
    can_authorize_quality_or_export: false,
    can_create_owner_receipt: false,
    can_write_owner_receipt: false,
    can_modify_managed_runtime: false,
    can_close_domain_ready: false,
    can_claim_release_ready: false,
    can_claim_production_ready: false,
    can_close_developer_mode_live_route: false,
  };
}

function emptyLedger(): DeveloperModeCloseoutLedger {
  return {
    surface_kind: 'opl_developer_mode_closeout_ledger',
    version: 'opl-developer-mode-closeout-ledger.v1',
    receipts: [],
  };
}

function ledgerPath() {
  return resolveOplStatePaths().developer_mode_closeout_ledger_file;
}

function allCloseoutRefs(input: DeveloperModeCloseoutReceiptInput) {
  return uniqueStrings([
    optionalString(input.patrol_observation_ref) ?? '',
    optionalString(input.diff_ref) ?? '',
    ...(input.verification_refs ?? []),
    optionalString(input.no_forbidden_write_ref) ?? '',
    optionalString(input.commit_ref) ?? '',
    optionalString(input.fork_repo_ref) ?? '',
    optionalString(input.pr_review_ref) ?? '',
    optionalString(input.owner_acceptance_ref) ?? '',
    ...(input.route_repetition_refs ?? []),
    ...(input.foundry_activation_transaction_refs ?? []),
    ...(input.app_patrol_mount_refs ?? []),
  ]);
}

function receiptRef(input: DeveloperModeCloseoutReceiptInput) {
  const explicitRef = optionalString(input.receipt_ref);
  if (explicitRef) {
    return explicitRef;
  }
  const targetRepoId = optionalString(input.target_repo_id) ?? 'unknown-target-repo';
  const primaryRef = allCloseoutRefs(input)[0] ?? 'developer-mode-closeout';
  return `opl://developer-mode-closeout/${encodeURIComponent(targetRepoId)}/${encodeURIComponent(primaryRef)}`;
}

function routeDecision(value: unknown): DeveloperModeCloseoutRouteDecision | null {
  const text = optionalString(value);
  if (text === 'direct-fix' || text === 'fork-PR' || text === 'observe-only') {
    return text;
  }
  return null;
}

function isExternalOwnerAcceptanceRef(value: string | null) {
  return Boolean(
    value
    && (value.startsWith('external-owner-ref:')
      || value.startsWith('external-owner-acceptance-ref:')),
  );
}

function isGithubHttpRepoUrl(value: string | null) {
  return Boolean(value && /^https:\/\/github\.com\/[^/\s]+\/[^/\s#?]+\/?$/.test(value));
}

function isGithubSshRepoUrl(value: string | null) {
  return Boolean(value && /^git@github\.com:[^/\s]+\/[^/\s#?]+(?:\.git)?$/.test(value));
}

function isGithubTypedRepoRef(value: string | null) {
  const typedRef = value?.match(/^github-fork-ref:(.+)$/);
  return Boolean(typedRef && (
    isGithubHttpRepoUrl(typedRef[1])
    || isGithubSshRepoUrl(typedRef[1])
  ));
}

function isGithubHttpPullRequestUrl(value: string | null) {
  return Boolean(value && /^https:\/\/github\.com\/[^/\s]+\/[^/\s#?]+\/pull\/\d+(?:[#?].*)?$/.test(value));
}

function isGithubTypedPullRequestRef(value: string | null) {
  const typedRef = value?.match(/^github-pr-(?:review-)?ref:(.+)$/);
  return Boolean(typedRef && isGithubHttpPullRequestUrl(typedRef[1]));
}

function isGithubTypedPullRequestOwnerAcceptanceRef(value: string | null) {
  const typedRef = value?.match(/^github-pr-owner-acceptance-ref:(.+)$/);
  return Boolean(typedRef && isGithubHttpPullRequestUrl(typedRef[1]));
}

function isLiveGithubForkRef(value: string | null) {
  return Boolean(
    isGithubTypedRepoRef(value)
    || isGithubHttpRepoUrl(value)
    || isGithubSshRepoUrl(value),
  );
}

function isLiveGithubPullRequestRef(value: string | null) {
  return Boolean(
    isGithubTypedPullRequestRef(value)
    || isGithubHttpPullRequestUrl(value),
  );
}

function isLiveGithubPullRequestOwnerAcceptanceRef(value: string | null) {
  return isGithubTypedPullRequestOwnerAcceptanceRef(value);
}

function requiredCloseoutRefs(decision: DeveloperModeCloseoutRouteDecision) {
  if (decision === 'direct-fix') {
    return [
      'route_eligibility',
      'patrol_observation_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'commit_ref',
      'owner_acceptance_ref',
    ] as const;
  }
  if (decision === 'fork-PR') {
    return [
      'route_eligibility',
      'patrol_observation_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'fork_repo_ref',
      'pr_review_ref',
      'owner_acceptance_ref',
    ] as const;
  }
  return [
    'route_eligibility',
    'patrol_observation_ref',
    'diff_ref',
    'verification_refs',
    'no_forbidden_write_ref',
    'owner_acceptance_ref',
  ] as const;
}

function missingCloseoutRefs(
  input: DeveloperModeCloseoutReceiptInput,
  decision: DeveloperModeCloseoutRouteDecision,
) {
  return requiredCloseoutRefs(decision).filter((field) => {
    if (field === 'verification_refs') {
      return uniqueStrings(input.verification_refs ?? []).length === 0;
    }
    return !optionalString(input[field]);
  });
}

function blockedReceipt(
  input: DeveloperModeCloseoutReceiptInput,
  blockerId: string,
  missingRefs: string[] = [],
): DeveloperModeCloseoutBlockedReceipt {
  return {
    surface_kind: 'opl_developer_mode_closeout_blocked_receipt',
    status: 'blocked',
    target_repo_id: optionalString(input.target_repo_id),
    route_decision: optionalString(input.route_decision),
    missing_closeout_refs: uniqueStrings(missingRefs),
    blocker: {
      blocker_kind: 'developer_mode_closeout_receipt_gate',
      blocker_id: blockerId,
      required_owner: 'external_repo_owner_or_developer_mode_operator',
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function normalizeReceiptInput(input: DeveloperModeCloseoutReceiptInput) {
  const targetRepoId = optionalString(input.target_repo_id);
  if (!targetRepoId) {
    return blockedReceipt(input, 'developer_mode_target_repo_id_missing', ['target_repo_id']);
  }
  const decision = routeDecision(input.route_decision);
  if (!decision) {
    return blockedReceipt(input, 'developer_mode_route_decision_unsupported', ['route_decision']);
  }
  const ownerAcceptanceRef = optionalString(input.owner_acceptance_ref);
  if (
    ownerAcceptanceRef
    && decision !== 'fork-PR'
    && !isExternalOwnerAcceptanceRef(ownerAcceptanceRef)
  ) {
    return blockedReceipt(input, 'developer_mode_owner_acceptance_ref_not_external', [
      'external_owner_acceptance_ref',
    ]);
  }
  const missingRefs = missingCloseoutRefs(input, decision);
  if (missingRefs.length > 0) {
    return blockedReceipt(input, 'developer_mode_closeout_refs_incomplete', missingRefs);
  }
  if (
    decision === 'fork-PR'
    && (
      !isLiveGithubForkRef(optionalString(input.fork_repo_ref))
      || !isLiveGithubPullRequestRef(optionalString(input.pr_review_ref))
    )
  ) {
    const invalidLiveRefs = [
      !isLiveGithubForkRef(optionalString(input.fork_repo_ref)) ? 'live_fork_repo_ref' : '',
      !isLiveGithubPullRequestRef(optionalString(input.pr_review_ref)) ? 'live_pr_review_ref' : '',
    ];
    return blockedReceipt(input, 'developer_mode_fork_pr_refs_not_live_external_refs', invalidLiveRefs);
  }
  if (
    decision === 'fork-PR'
    && !isLiveGithubPullRequestOwnerAcceptanceRef(ownerAcceptanceRef)
  ) {
    return blockedReceipt(input, 'developer_mode_fork_pr_owner_acceptance_not_pr_backed', [
      'github_pr_owner_acceptance_ref',
    ]);
  }
  const foundryActivationTransactionRefs = uniqueStrings(
    input.foundry_activation_transaction_refs ?? [],
  );

  const receipt: DeveloperModeCloseoutReceipt = {
    surface_kind: 'opl_developer_mode_closeout_receipt',
    receipt_ref: receiptRef(input),
    receipt_status: 'recorded',
    recorded_at: nowIso(),
    target_surface: 'opl_developer_mode_live_closeout',
    target_repo_id: targetRepoId,
    route_decision: decision,
    route_eligibility: optionalString(input.route_eligibility) ?? '',
    patrol_observation_ref: optionalString(input.patrol_observation_ref) ?? '',
    diff_ref: optionalString(input.diff_ref) ?? '',
    verification_refs: uniqueStrings(input.verification_refs ?? []),
    no_forbidden_write_ref: optionalString(input.no_forbidden_write_ref) ?? '',
    commit_ref: decision === 'direct-fix' ? optionalString(input.commit_ref) : null,
    fork_repo_ref: decision === 'fork-PR' ? optionalString(input.fork_repo_ref) : null,
    pr_review_ref: decision === 'fork-PR' ? optionalString(input.pr_review_ref) : null,
    owner_acceptance_ref: ownerAcceptanceRef ?? '',
    route_repetition_refs: uniqueStrings(input.route_repetition_refs ?? []),
    foundry_activation_transaction_refs: foundryActivationTransactionRefs,
    app_patrol_mount_refs: uniqueStrings(input.app_patrol_mount_refs ?? []),
    source_surface: 'opl_developer_mode_closeout_evidence',
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
  return receipt;
}

function normalizeReceipt(value: unknown): DeveloperModeCloseoutReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const receiptRefValue = optionalString(value.receipt_ref);
  const targetRepoId = optionalString(value.target_repo_id);
  const decision = routeDecision(value.route_decision);
  const ownerAcceptanceRef = optionalString(value.owner_acceptance_ref);
  if (
    !receiptRefValue
    || !targetRepoId
    || !decision
    || (decision === 'fork-PR'
      ? !isLiveGithubPullRequestOwnerAcceptanceRef(ownerAcceptanceRef)
      : !isExternalOwnerAcceptanceRef(ownerAcceptanceRef))
  ) {
    return null;
  }
  const input: DeveloperModeCloseoutReceiptInput = {
    target_repo_id: targetRepoId,
    route_decision: decision,
    route_eligibility: optionalString(value.route_eligibility),
    patrol_observation_ref: optionalString(value.patrol_observation_ref),
    diff_ref: optionalString(value.diff_ref),
    verification_refs: stringArrayOrScalar(value.verification_refs),
    no_forbidden_write_ref: optionalString(value.no_forbidden_write_ref),
    commit_ref: optionalString(value.commit_ref),
    fork_repo_ref: optionalString(value.fork_repo_ref),
    pr_review_ref: optionalString(value.pr_review_ref),
    owner_acceptance_ref: ownerAcceptanceRef,
    route_repetition_refs: stringArrayOrScalar(value.route_repetition_refs),
    foundry_activation_transaction_refs: stringArrayOrScalar(
      value.foundry_activation_transaction_refs,
    ),
    app_patrol_mount_refs: stringArrayOrScalar(value.app_patrol_mount_refs),
    receipt_ref: receiptRefValue,
  };
  const normalized = normalizeReceiptInput(input);
  if (normalized.surface_kind !== 'opl_developer_mode_closeout_receipt') {
    return null;
  }
  return {
    ...normalized,
    receipt_status: value.receipt_status === 'verified' ? 'verified' : 'recorded',
    recorded_at: optionalString(value.recorded_at) ?? nowIso(),
  };
}

function readDeveloperModeCloseoutLedger(): DeveloperModeCloseoutLedger {
  const file = ledgerPath();
  const parsed = readJsonFileOrNull(file);
  if (!isRecord(parsed) || !Array.isArray(parsed.receipts)) {
    return emptyLedger();
  }
  return {
    ...emptyLedger(),
    receipts: parsed.receipts
      .map(normalizeReceipt)
      .filter((receipt): receipt is DeveloperModeCloseoutReceipt => Boolean(receipt)),
  };
}

function writeDeveloperModeCloseoutLedger(ledger: DeveloperModeCloseoutLedger) {
  const paths = ensureOplStateDir();
  writeJsonPayloadFile(paths.developer_mode_closeout_ledger_file, ledger);
}

export function recordDeveloperModeCloseoutReceipts(
  inputs: DeveloperModeCloseoutReceiptInput[],
) {
  const normalized = inputs.map(normalizeReceiptInput);
  const receipts = normalized.filter(
    (entry): entry is DeveloperModeCloseoutReceipt =>
      entry.surface_kind === 'opl_developer_mode_closeout_receipt',
  );
  const blockedReceipts = normalized.filter(
    (entry): entry is DeveloperModeCloseoutBlockedReceipt =>
      entry.surface_kind === 'opl_developer_mode_closeout_blocked_receipt',
  );

  if (receipts.length === 0) {
    return {
      surface_kind: 'opl_developer_mode_closeout_ledger_record',
      status: 'no_eligible_developer_mode_closeout_receipts',
      recorded_receipt_count: 0,
      receipt_refs: [],
      ledger_file: ledgerPath(),
      receipts: [],
      blocked_receipts: blockedReceipts,
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  const ledger = readDeveloperModeCloseoutLedger();
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
  writeDeveloperModeCloseoutLedger(ledger);
  return {
    surface_kind: 'opl_developer_mode_closeout_ledger_record',
    status: 'recorded',
    recorded_receipt_count: receipts.length,
    receipt_refs: receipts.map((receipt) => receipt.receipt_ref),
    ledger_file: ledgerPath(),
    receipts,
    blocked_receipts: blockedReceipts,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function verifyDeveloperModeCloseoutReceipt(
  input: DeveloperModeCloseoutReceiptVerifyInput = {},
) {
  const ledger = readDeveloperModeCloseoutLedger();
  const requestedReceiptRef = optionalString(input.receipt_ref);
  const receiptIndex = requestedReceiptRef
    ? ledger.receipts.findIndex((receipt) => receipt.receipt_ref === requestedReceiptRef)
    : ledger.receipts.findIndex((receipt) => receipt.receipt_status === 'recorded');
  const fallbackIndex = requestedReceiptRef ? -1 : ledger.receipts.findIndex(Boolean);
  const selectedIndex = receiptIndex >= 0 ? receiptIndex : fallbackIndex;

  if (selectedIndex < 0) {
    return {
      surface_kind: 'opl_developer_mode_closeout_ledger_verify',
      status: 'blocked',
      writes_performed: false,
      receipt_ref: requestedReceiptRef,
      verified_receipt_count: 0,
      ledger_file: ledgerPath(),
      blocker: {
        blocker_kind: 'developer_mode_closeout_receipt_gate',
        blocker_id: 'developer_mode_closeout_receipt_not_found',
        required_owner: 'external_repo_owner_or_developer_mode_operator',
      },
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  const current = ledger.receipts[selectedIndex];
  const verified = {
    ...current,
    receipt_status: 'verified' as const,
  };
  ledger.receipts[selectedIndex] = verified;
  writeDeveloperModeCloseoutLedger(ledger);
  return {
    surface_kind: 'opl_developer_mode_closeout_ledger_verify',
    status: 'verified',
    writes_performed: current.receipt_status !== 'verified',
    receipt_ref: verified.receipt_ref,
    verified_receipt_count: 1,
    ledger_file: ledgerPath(),
    receipt: verified,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function listDeveloperModeCloseoutReceipts() {
  return readDeveloperModeCloseoutLedger().receipts;
}
