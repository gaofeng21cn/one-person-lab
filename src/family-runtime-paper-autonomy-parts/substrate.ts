import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  PaperAutonomyRecoveryObligation,
  PaperAutonomyStageRunIdentity,
  PaperAutonomySupervisorDecisionKind,
  PaperAutonomySupervisorDecisionReadback,
} from '../family-runtime-paper-autonomy.ts';

type PaperAutonomySubstrateAuthorityBoundary = {
  opl_can_write_mas_truth: false;
  opl_can_create_domain_owner_receipt: false;
  opl_can_create_domain_typed_blocker: false;
  provider_completion_is_domain_ready: false;
};

type PaperAutonomyEntryProjection = {
  append_only_jsonl_compatible: true;
  payload_refs_only: true;
  identity_bound: true;
};

export type PaperAutonomyRecoveryObligationStoreEntry = {
  surface_kind: 'opl_paper_autonomy_recovery_obligation_store_entry';
  entry_kind: 'obligation_appended' | 'obligation_apply_succeeded' | 'obligation_apply_rejected';
  obligation_id: string;
  current_identity: PaperAutonomyStageRunIdentity;
  obligation: PaperAutonomyRecoveryObligation | null;
  supervisor_decision_ref: string | null;
  transition_ref: string | null;
  reason: 'stale_supervisor_decision' | 'obligation_not_found' | 'identity_mismatch' | null;
  recorded_at: string;
  projection: PaperAutonomyEntryProjection;
  authority_boundary: PaperAutonomySubstrateAuthorityBoundary;
};

export type PaperAutonomySupervisorDecisionLedgerEntry = {
  surface_kind: 'opl_paper_autonomy_supervisor_decision_ledger_entry';
  entry_kind: 'supervisor_decision_appended' | 'supervisor_decision_rejected';
  obligation_id: string;
  current_identity: PaperAutonomyStageRunIdentity;
  decision: PaperAutonomySupervisorDecisionReadback | null;
  decision_id: string | null;
  decision_kind: PaperAutonomySupervisorDecisionKind | null;
  reason: 'identity_mismatch' | null;
  recorded_at: string;
  projection: PaperAutonomyEntryProjection & {
    current_latest_by_identity: true;
  };
  authority_boundary: PaperAutonomySubstrateAuthorityBoundary;
};

export type PaperAutonomyCloseoutInboxEntry = {
  surface_kind: 'opl_paper_autonomy_closeout_inbox_entry';
  entry_kind: 'closeout_pending' | 'closeout_consumed' | 'closeout_rejected';
  status: 'pending' | 'consumed' | 'rejected';
  closeout_ref: string;
  obligation_id: string;
  current_identity: PaperAutonomyStageRunIdentity;
  terminal_closeout_ref: string;
  supervisor_decision_ref: string | null;
  reason: string | null;
  recorded_at: string;
  projection: PaperAutonomyEntryProjection;
  authority_boundary: PaperAutonomySubstrateAuthorityBoundary;
};

type PaperAutonomyJsonlLedgerEntry =
  | PaperAutonomyRecoveryObligationStoreEntry
  | PaperAutonomySupervisorDecisionLedgerEntry
  | PaperAutonomyCloseoutInboxEntry;

type PaperAutonomyJsonlSurfaceKind = PaperAutonomyJsonlLedgerEntry['surface_kind'];

const authorityBoundary: PaperAutonomySubstrateAuthorityBoundary = {
  opl_can_write_mas_truth: false,
  opl_can_create_domain_owner_receipt: false,
  opl_can_create_domain_typed_blocker: false,
  provider_completion_is_domain_ready: false,
};

const baseProjection: PaperAutonomyEntryProjection = {
  append_only_jsonl_compatible: true,
  payload_refs_only: true,
  identity_bound: true,
};

function decisionProjection(): PaperAutonomySupervisorDecisionLedgerEntry['projection'] {
  return {
    ...baseProjection,
    current_latest_by_identity: true,
  };
}

export function appendPaperAutonomyRecoveryObligation(
  entries: PaperAutonomyRecoveryObligationStoreEntry[],
  input: {
    obligation: PaperAutonomyRecoveryObligation;
    appended_at: string;
  },
) {
  const entry: PaperAutonomyRecoveryObligationStoreEntry = {
    surface_kind: 'opl_paper_autonomy_recovery_obligation_store_entry',
    entry_kind: 'obligation_appended',
    obligation_id: input.obligation.obligation_id,
    current_identity: input.obligation.current_identity,
    obligation: input.obligation,
    supervisor_decision_ref: input.obligation.supervisor_decision_ref ?? null,
    transition_ref: null,
    reason: null,
    recorded_at: input.appended_at,
    projection: baseProjection,
    authority_boundary: authorityBoundary,
  };
  return {
    appended: true as const,
    entry,
    entries: [...entries, entry],
    obligation: input.obligation,
  };
}

export function readPaperAutonomyRecoveryObligationStoreJsonl(
  ledgerPath: string,
): PaperAutonomyRecoveryObligationStoreEntry[] {
  return readPaperAutonomyJsonlLedger(
    ledgerPath,
    'opl_paper_autonomy_recovery_obligation_store_entry',
  ) as PaperAutonomyRecoveryObligationStoreEntry[];
}

export function appendPaperAutonomyRecoveryObligationStoreJsonl(
  ledgerPath: string,
  entry: PaperAutonomyRecoveryObligationStoreEntry,
) {
  appendPaperAutonomyJsonlLedgerEntry(
    ledgerPath,
    entry,
    'opl_paper_autonomy_recovery_obligation_store_entry',
  );
}

export function currentPaperAutonomyRecoveryObligation(
  entries: PaperAutonomyRecoveryObligationStoreEntry[],
  input: {
    obligation_id: string;
    current_identity: PaperAutonomyStageRunIdentity;
  },
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.entry_kind === 'obligation_apply_rejected') {
      continue;
    }
    if (
      entry.obligation_id === input.obligation_id
      && samePaperAutonomyStageRunIdentity(entry.current_identity, input.current_identity)
    ) {
      return entry.obligation;
    }
  }
  return null;
}

export function recordPaperAutonomySupervisorDecision(
  entries: PaperAutonomySupervisorDecisionLedgerEntry[],
  input: {
    obligation_id: string;
    current_identity: PaperAutonomyStageRunIdentity;
    decision: PaperAutonomySupervisorDecisionReadback;
    appended_at: string;
  },
) {
  if (
    input.decision.obligation_id !== input.obligation_id
    || !samePaperAutonomyStageRunIdentity(input.decision.current_identity, input.current_identity)
  ) {
    const entry = supervisorDecisionEntry({
      entry_kind: 'supervisor_decision_rejected',
      obligation_id: input.obligation_id,
      current_identity: input.current_identity,
      decision: input.decision,
      reason: 'identity_mismatch',
      recorded_at: input.appended_at,
    });
    return {
      accepted: false as const,
      reason: 'identity_mismatch' as const,
      entry,
      entries: [...entries, entry],
    };
  }

  const entry = supervisorDecisionEntry({
    entry_kind: 'supervisor_decision_appended',
    obligation_id: input.obligation_id,
    current_identity: input.current_identity,
    decision: input.decision,
    reason: null,
    recorded_at: input.appended_at,
  });
  return {
    accepted: true as const,
    entry,
    entries: [...entries, entry],
    decision: input.decision,
  };
}

export function readPaperAutonomySupervisorDecisionLedgerJsonl(
  ledgerPath: string,
): PaperAutonomySupervisorDecisionLedgerEntry[] {
  return readPaperAutonomyJsonlLedger(
    ledgerPath,
    'opl_paper_autonomy_supervisor_decision_ledger_entry',
  ) as PaperAutonomySupervisorDecisionLedgerEntry[];
}

export function appendPaperAutonomySupervisorDecisionLedgerJsonl(
  ledgerPath: string,
  entry: PaperAutonomySupervisorDecisionLedgerEntry,
) {
  appendPaperAutonomyJsonlLedgerEntry(
    ledgerPath,
    entry,
    'opl_paper_autonomy_supervisor_decision_ledger_entry',
  );
}

export function currentPaperAutonomySupervisorDecision(
  entries: PaperAutonomySupervisorDecisionLedgerEntry[],
  input: {
    obligation_id: string;
    current_identity: PaperAutonomyStageRunIdentity;
  },
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.entry_kind !== 'supervisor_decision_appended' || !entry.decision) {
      continue;
    }
    if (
      entry.obligation_id === input.obligation_id
      && samePaperAutonomyStageRunIdentity(entry.current_identity, input.current_identity)
    ) {
      return entry.decision;
    }
  }
  return null;
}

export function listCurrentPaperAutonomySupervisorDecisions(
  entries: PaperAutonomySupervisorDecisionLedgerEntry[],
  input: {
    obligation_id?: string;
  } = {},
) {
  const latestByIdentity = new Map<string, PaperAutonomySupervisorDecisionReadback>();
  for (const entry of entries) {
    if (entry.entry_kind !== 'supervisor_decision_appended' || !entry.decision) {
      continue;
    }
    if (input.obligation_id && entry.obligation_id !== input.obligation_id) {
      continue;
    }
    latestByIdentity.set(
      paperAutonomyIdentityKey(entry.obligation_id, entry.current_identity),
      entry.decision,
    );
  }
  return [...latestByIdentity.values()];
}

export function applyPaperAutonomySupervisorDecisionFromLedger(input: {
  obligation_entries: PaperAutonomyRecoveryObligationStoreEntry[];
  decision_entries: PaperAutonomySupervisorDecisionLedgerEntry[];
  decision: PaperAutonomySupervisorDecisionReadback;
  applied_at: string;
}):
  | {
    applied: true;
    obligation: PaperAutonomyRecoveryObligation;
    entry: PaperAutonomyRecoveryObligationStoreEntry;
    entries: PaperAutonomyRecoveryObligationStoreEntry[];
  }
  | {
    applied: false;
    reason: 'stale_supervisor_decision' | 'obligation_not_found';
    entry: PaperAutonomyRecoveryObligationStoreEntry;
    entries: PaperAutonomyRecoveryObligationStoreEntry[];
  } {
  const latestDecision = currentPaperAutonomySupervisorDecision(input.decision_entries, {
    obligation_id: input.decision.obligation_id,
    current_identity: input.decision.current_identity,
  });
  if (!latestDecision || latestDecision.decision_id !== input.decision.decision_id) {
    return rejectedObligationApply(input, 'stale_supervisor_decision');
  }

  const obligation = currentPaperAutonomyRecoveryObligation(input.obligation_entries, {
    obligation_id: input.decision.obligation_id,
    current_identity: input.decision.current_identity,
  });
  if (!obligation) {
    return rejectedObligationApply(input, 'obligation_not_found');
  }

  const nextObligation: PaperAutonomyRecoveryObligation = {
    ...obligation,
    status: obligationStatusForDecision(input.decision.decision_kind),
    supervisor_decision_ref: input.decision.decision_id,
    last_evidence_refs: input.decision.evidence_refs,
  };
  const entry: PaperAutonomyRecoveryObligationStoreEntry = {
    surface_kind: 'opl_paper_autonomy_recovery_obligation_store_entry',
    entry_kind: 'obligation_apply_succeeded',
    obligation_id: nextObligation.obligation_id,
    current_identity: nextObligation.current_identity,
    obligation: nextObligation,
    supervisor_decision_ref: input.decision.decision_id,
    transition_ref: input.decision.transition_ref,
    reason: null,
    recorded_at: input.applied_at,
    projection: baseProjection,
    authority_boundary: authorityBoundary,
  };
  return {
    applied: true,
    obligation: nextObligation,
    entry,
    entries: [...input.obligation_entries, entry],
  };
}

export function appendPaperAutonomyCloseoutInboxPending(
  entries: PaperAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    obligation_id: string;
    current_identity: PaperAutonomyStageRunIdentity;
    terminal_closeout_ref: string;
    appended_at: string;
  },
) {
  const entry: PaperAutonomyCloseoutInboxEntry = {
    surface_kind: 'opl_paper_autonomy_closeout_inbox_entry',
    entry_kind: 'closeout_pending',
    status: 'pending',
    closeout_ref: input.closeout_ref,
    obligation_id: input.obligation_id,
    current_identity: input.current_identity,
    terminal_closeout_ref: input.terminal_closeout_ref,
    supervisor_decision_ref: null,
    reason: null,
    recorded_at: input.appended_at,
    projection: baseProjection,
    authority_boundary: authorityBoundary,
  };
  return {
    appended: true as const,
    entry,
    entries: [...entries, entry],
  };
}

export function readPaperAutonomyCloseoutInboxJsonl(
  ledgerPath: string,
): PaperAutonomyCloseoutInboxEntry[] {
  return readPaperAutonomyJsonlLedger(
    ledgerPath,
    'opl_paper_autonomy_closeout_inbox_entry',
  ) as PaperAutonomyCloseoutInboxEntry[];
}

export function appendPaperAutonomyCloseoutInboxJsonl(
  ledgerPath: string,
  entry: PaperAutonomyCloseoutInboxEntry,
) {
  appendPaperAutonomyJsonlLedgerEntry(
    ledgerPath,
    entry,
    'opl_paper_autonomy_closeout_inbox_entry',
  );
}

export function readPaperAutonomyCloseoutInboxEntry(
  entries: PaperAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    current_identity: PaperAutonomyStageRunIdentity;
  },
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      entry.closeout_ref === input.closeout_ref
      && samePaperAutonomyStageRunIdentity(entry.current_identity, input.current_identity)
    ) {
      return entry;
    }
  }
  return null;
}

export function consumePaperAutonomyCloseoutInboxEntry(
  entries: PaperAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    current_identity: PaperAutonomyStageRunIdentity;
    supervisor_decision_ref: string;
    consumed_at: string;
  },
) {
  const pending = readPaperAutonomyCloseoutInboxEntry(entries, input);
  if (!pending || pending.status !== 'pending') {
    return {
      consumed: false as const,
      reason: 'closeout_not_pending' as const,
      entries,
    };
  }
  const entry: PaperAutonomyCloseoutInboxEntry = {
    ...pending,
    entry_kind: 'closeout_consumed',
    status: 'consumed',
    supervisor_decision_ref: input.supervisor_decision_ref,
    recorded_at: input.consumed_at,
  };
  return {
    consumed: true as const,
    entry,
    entries: [...entries, entry],
  };
}

export function rejectPaperAutonomyCloseoutInboxEntry(
  entries: PaperAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    current_identity: PaperAutonomyStageRunIdentity;
    reason: string;
    rejected_at: string;
  },
) {
  const pending = readPaperAutonomyCloseoutInboxEntry(entries, input);
  if (!pending || pending.status !== 'pending') {
    return {
      rejected: false as const,
      reason: 'closeout_not_pending' as const,
      entries,
    };
  }
  const entry: PaperAutonomyCloseoutInboxEntry = {
    ...pending,
    entry_kind: 'closeout_rejected',
    status: 'rejected',
    reason: input.reason,
    recorded_at: input.rejected_at,
  };
  return {
    rejected: true as const,
    entry,
    entries: [...entries, entry],
  };
}

function supervisorDecisionEntry(input: {
  entry_kind: PaperAutonomySupervisorDecisionLedgerEntry['entry_kind'];
  obligation_id: string;
  current_identity: PaperAutonomyStageRunIdentity;
  decision: PaperAutonomySupervisorDecisionReadback;
  reason: PaperAutonomySupervisorDecisionLedgerEntry['reason'];
  recorded_at: string;
}): PaperAutonomySupervisorDecisionLedgerEntry {
  return {
    surface_kind: 'opl_paper_autonomy_supervisor_decision_ledger_entry',
    entry_kind: input.entry_kind,
    obligation_id: input.obligation_id,
    current_identity: input.current_identity,
    decision: input.entry_kind === 'supervisor_decision_appended' ? input.decision : null,
    decision_id: input.decision.decision_id,
    decision_kind: input.decision.decision_kind,
    reason: input.reason,
    recorded_at: input.recorded_at,
    projection: decisionProjection(),
    authority_boundary: authorityBoundary,
  };
}

function rejectedObligationApply(
  input: {
    obligation_entries: PaperAutonomyRecoveryObligationStoreEntry[];
    decision: PaperAutonomySupervisorDecisionReadback;
    applied_at: string;
  },
  reason: 'stale_supervisor_decision' | 'obligation_not_found',
) {
  const entry: PaperAutonomyRecoveryObligationStoreEntry = {
    surface_kind: 'opl_paper_autonomy_recovery_obligation_store_entry',
    entry_kind: 'obligation_apply_rejected',
    obligation_id: input.decision.obligation_id,
    current_identity: input.decision.current_identity,
    obligation: null,
    supervisor_decision_ref: input.decision.decision_id,
    transition_ref: input.decision.transition_ref,
    reason,
    recorded_at: input.applied_at,
    projection: baseProjection,
    authority_boundary: authorityBoundary,
  };
  return {
    applied: false as const,
    reason,
    entry,
    entries: [...input.obligation_entries, entry],
  };
}

function readPaperAutonomyJsonlLedger(
  ledgerPath: string,
  expectedSurfaceKind: PaperAutonomyJsonlSurfaceKind,
): PaperAutonomyJsonlLedgerEntry[] {
  if (!existsSync(ledgerPath)) {
    return [];
  }
  const raw = readFileSync(ledgerPath, 'utf8');
  const entries: PaperAutonomyJsonlLedgerEntry[] = [];
  for (const [index, line] of raw.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = JSON.parse(trimmed) as Partial<PaperAutonomyJsonlLedgerEntry>;
    if (parsed.surface_kind !== expectedSurfaceKind) {
      throw new Error(
        `Unexpected paper autonomy JSONL surface at line ${index + 1}: ${String(parsed.surface_kind)}`,
      );
    }
    entries.push(parsed as PaperAutonomyJsonlLedgerEntry);
  }
  return entries;
}

function appendPaperAutonomyJsonlLedgerEntry(
  ledgerPath: string,
  entry: PaperAutonomyJsonlLedgerEntry,
  expectedSurfaceKind: PaperAutonomyJsonlSurfaceKind,
) {
  if (entry.surface_kind !== expectedSurfaceKind) {
    throw new Error(
      `Unexpected paper autonomy JSONL append surface: ${entry.surface_kind}`,
    );
  }
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function obligationStatusForDecision(
  decisionKind: PaperAutonomySupervisorDecisionKind,
): PaperAutonomyRecoveryObligation['status'] {
  switch (decisionKind) {
    case 'execute_current_owner_delta':
      return 'current_owner_delta_executed';
    case 'consume_terminal_closeout':
      return 'terminal_closeout_consumed';
    case 'materialize_recovery_action':
      return 'recovery_materialized';
    case 'wait_for_owner_with_resume_token':
      return 'waiting_for_owner';
    case 'stop_with_stable_typed_blocker':
      return 'stopped_with_typed_blocker';
    case 'stop_with_owner_receipt':
      return 'stopped_with_owner_receipt';
  }
}

function paperAutonomyIdentityKey(
  obligationId: string,
  identity: PaperAutonomyStageRunIdentity,
) {
  return JSON.stringify([
    obligationId,
    identity.stage_run_id,
    identity.route_identity_key,
    identity.attempt_idempotency_key,
    identity.selected_dispatch_ref,
    identity.stage_packet_ref,
    identity.stage_packet_refs,
    identity.provider_attempt_ref,
    identity.attempt_lease_ref,
    identity.workflow_ref,
    identity.source_fingerprint,
    identity.truth_epoch,
    identity.runtime_health_epoch,
    identity.work_unit_fingerprint,
  ]);
}

function samePaperAutonomyStageRunIdentity(
  left: PaperAutonomyStageRunIdentity,
  right: PaperAutonomyStageRunIdentity,
) {
  return left.stage_run_id === right.stage_run_id
    && left.route_identity_key === right.route_identity_key
    && left.attempt_idempotency_key === right.attempt_idempotency_key
    && left.selected_dispatch_ref === right.selected_dispatch_ref
    && left.stage_packet_ref === right.stage_packet_ref
    && sameStringArray(left.stage_packet_refs, right.stage_packet_refs)
    && left.provider_attempt_ref === right.provider_attempt_ref
    && left.attempt_lease_ref === right.attempt_lease_ref
    && left.workflow_ref === right.workflow_ref
    && left.source_fingerprint === right.source_fingerprint
    && left.truth_epoch === right.truth_epoch
    && left.runtime_health_epoch === right.runtime_health_epoch
    && left.work_unit_fingerprint === right.work_unit_fingerprint;
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
