import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseJsonText } from '../../../kernel/json-file.ts';
import type {
  DomainAutonomyRecoveryObligation,
  DomainAutonomyStageRunIdentity,
  DomainAutonomySupervisorDecisionKind,
  DomainAutonomySupervisorDecisionReadback,
} from '../family-runtime-domain-autonomy.ts';

type DomainAutonomySubstrateAuthorityBoundary = {
  opl_can_write_domain_truth: false;
  opl_can_create_domain_owner_receipt: false;
  opl_can_create_domain_typed_blocker: false;
  provider_completion_is_domain_ready: false;
};

type DomainAutonomyEntryProjection = {
  append_only_jsonl_compatible: true;
  payload_refs_only: true;
  identity_bound: true;
};

export type DomainAutonomyRecoveryObligationStoreEntry = {
  surface_kind: 'opl_domain_autonomy_recovery_obligation_store_entry';
  entry_kind: 'obligation_appended' | 'obligation_apply_succeeded' | 'obligation_apply_rejected';
  obligation_id: string;
  current_identity: DomainAutonomyStageRunIdentity;
  obligation: DomainAutonomyRecoveryObligation | null;
  supervisor_decision_ref: string | null;
  transition_ref: string | null;
  reason: 'stale_supervisor_decision' | 'obligation_not_found' | 'identity_mismatch' | null;
  recorded_at: string;
  projection: DomainAutonomyEntryProjection;
  authority_boundary: DomainAutonomySubstrateAuthorityBoundary;
};

export type DomainAutonomySupervisorDecisionLedgerEntry = {
  surface_kind: 'opl_domain_autonomy_supervisor_decision_ledger_entry';
  entry_kind: 'supervisor_decision_appended' | 'supervisor_decision_rejected';
  obligation_id: string;
  current_identity: DomainAutonomyStageRunIdentity;
  decision: DomainAutonomySupervisorDecisionReadback | null;
  decision_id: string | null;
  decision_kind: DomainAutonomySupervisorDecisionKind | null;
  reason: 'identity_mismatch' | null;
  recorded_at: string;
  projection: DomainAutonomyEntryProjection & {
    current_latest_by_identity: true;
  };
  authority_boundary: DomainAutonomySubstrateAuthorityBoundary;
};

export type DomainAutonomyCloseoutInboxEntry = {
  surface_kind: 'opl_domain_autonomy_closeout_inbox_entry';
  entry_kind: 'closeout_pending' | 'closeout_consumed' | 'closeout_rejected';
  status: 'pending' | 'consumed' | 'rejected';
  closeout_ref: string;
  obligation_id: string;
  current_identity: DomainAutonomyStageRunIdentity;
  terminal_closeout_ref: string;
  supervisor_decision_ref: string | null;
  reason: string | null;
  recorded_at: string;
  projection: DomainAutonomyEntryProjection;
  authority_boundary: DomainAutonomySubstrateAuthorityBoundary;
};

type DomainAutonomyJsonlLedgerEntry =
  | DomainAutonomyRecoveryObligationStoreEntry
  | DomainAutonomySupervisorDecisionLedgerEntry
  | DomainAutonomyCloseoutInboxEntry;

type DomainAutonomyJsonlSurfaceKind = DomainAutonomyJsonlLedgerEntry['surface_kind'];

const authorityBoundary: DomainAutonomySubstrateAuthorityBoundary = {
  opl_can_write_domain_truth: false,
  opl_can_create_domain_owner_receipt: false,
  opl_can_create_domain_typed_blocker: false,
  provider_completion_is_domain_ready: false,
};

const baseProjection: DomainAutonomyEntryProjection = {
  append_only_jsonl_compatible: true,
  payload_refs_only: true,
  identity_bound: true,
};

function decisionProjection(): DomainAutonomySupervisorDecisionLedgerEntry['projection'] {
  return {
    ...baseProjection,
    current_latest_by_identity: true,
  };
}

export function appendDomainAutonomyRecoveryObligation(
  entries: DomainAutonomyRecoveryObligationStoreEntry[],
  input: {
    obligation: DomainAutonomyRecoveryObligation;
    appended_at: string;
  },
) {
  const entry: DomainAutonomyRecoveryObligationStoreEntry = {
    surface_kind: 'opl_domain_autonomy_recovery_obligation_store_entry',
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

export function readDomainAutonomyRecoveryObligationStoreJsonl(
  ledgerPath: string,
): DomainAutonomyRecoveryObligationStoreEntry[] {
  return readDomainAutonomyJsonlLedger(
    ledgerPath,
    'opl_domain_autonomy_recovery_obligation_store_entry',
  ) as DomainAutonomyRecoveryObligationStoreEntry[];
}

export function appendDomainAutonomyRecoveryObligationStoreJsonl(
  ledgerPath: string,
  entry: DomainAutonomyRecoveryObligationStoreEntry,
) {
  appendDomainAutonomyJsonlLedgerEntry(
    ledgerPath,
    entry,
    'opl_domain_autonomy_recovery_obligation_store_entry',
  );
}

export function currentDomainAutonomyRecoveryObligation(
  entries: DomainAutonomyRecoveryObligationStoreEntry[],
  input: {
    obligation_id: string;
    current_identity: DomainAutonomyStageRunIdentity;
  },
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.entry_kind === 'obligation_apply_rejected') {
      continue;
    }
    if (
      entry.obligation_id === input.obligation_id
      && sameDomainAutonomyStageRunIdentity(entry.current_identity, input.current_identity)
    ) {
      return entry.obligation;
    }
  }
  return null;
}

export function recordDomainAutonomySupervisorDecision(
  entries: DomainAutonomySupervisorDecisionLedgerEntry[],
  input: {
    obligation_id: string;
    current_identity: DomainAutonomyStageRunIdentity;
    decision: DomainAutonomySupervisorDecisionReadback;
    appended_at: string;
  },
) {
  if (
    input.decision.obligation_id !== input.obligation_id
    || !sameDomainAutonomyStageRunIdentity(input.decision.current_identity, input.current_identity)
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

export function readDomainAutonomySupervisorDecisionLedgerJsonl(
  ledgerPath: string,
): DomainAutonomySupervisorDecisionLedgerEntry[] {
  return readDomainAutonomyJsonlLedger(
    ledgerPath,
    'opl_domain_autonomy_supervisor_decision_ledger_entry',
  ) as DomainAutonomySupervisorDecisionLedgerEntry[];
}

export function appendDomainAutonomySupervisorDecisionLedgerJsonl(
  ledgerPath: string,
  entry: DomainAutonomySupervisorDecisionLedgerEntry,
) {
  appendDomainAutonomyJsonlLedgerEntry(
    ledgerPath,
    entry,
    'opl_domain_autonomy_supervisor_decision_ledger_entry',
  );
}

export function currentDomainAutonomySupervisorDecision(
  entries: DomainAutonomySupervisorDecisionLedgerEntry[],
  input: {
    obligation_id: string;
    current_identity: DomainAutonomyStageRunIdentity;
  },
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.entry_kind !== 'supervisor_decision_appended' || !entry.decision) {
      continue;
    }
    if (
      entry.obligation_id === input.obligation_id
      && sameDomainAutonomyStageRunIdentity(entry.current_identity, input.current_identity)
    ) {
      return entry.decision;
    }
  }
  return null;
}

export function listCurrentDomainAutonomySupervisorDecisions(
  entries: DomainAutonomySupervisorDecisionLedgerEntry[],
  input: {
    obligation_id?: string;
  } = {},
) {
  const latestByIdentity = new Map<string, DomainAutonomySupervisorDecisionReadback>();
  for (const entry of entries) {
    if (entry.entry_kind !== 'supervisor_decision_appended' || !entry.decision) {
      continue;
    }
    if (input.obligation_id && entry.obligation_id !== input.obligation_id) {
      continue;
    }
    latestByIdentity.set(
      domainAutonomyIdentityKey(entry.obligation_id, entry.current_identity),
      entry.decision,
    );
  }
  return [...latestByIdentity.values()];
}

export function applyDomainAutonomySupervisorDecisionFromLedger(input: {
  obligation_entries: DomainAutonomyRecoveryObligationStoreEntry[];
  decision_entries: DomainAutonomySupervisorDecisionLedgerEntry[];
  decision: DomainAutonomySupervisorDecisionReadback;
  applied_at: string;
}):
  | {
    applied: true;
    obligation: DomainAutonomyRecoveryObligation;
    entry: DomainAutonomyRecoveryObligationStoreEntry;
    entries: DomainAutonomyRecoveryObligationStoreEntry[];
  }
  | {
    applied: false;
    reason: 'stale_supervisor_decision' | 'obligation_not_found';
    entry: DomainAutonomyRecoveryObligationStoreEntry;
    entries: DomainAutonomyRecoveryObligationStoreEntry[];
  } {
  const latestDecision = currentDomainAutonomySupervisorDecision(input.decision_entries, {
    obligation_id: input.decision.obligation_id,
    current_identity: input.decision.current_identity,
  });
  if (!latestDecision || latestDecision.decision_id !== input.decision.decision_id) {
    return rejectedObligationApply(input, 'stale_supervisor_decision');
  }

  const obligation = currentDomainAutonomyRecoveryObligation(input.obligation_entries, {
    obligation_id: input.decision.obligation_id,
    current_identity: input.decision.current_identity,
  });
  if (!obligation) {
    return rejectedObligationApply(input, 'obligation_not_found');
  }

  const nextObligation: DomainAutonomyRecoveryObligation = {
    ...obligation,
    status: obligationStatusForDecision(input.decision.decision_kind),
    supervisor_decision_ref: input.decision.decision_id,
    last_evidence_refs: input.decision.evidence_refs,
  };
  const entry: DomainAutonomyRecoveryObligationStoreEntry = {
    surface_kind: 'opl_domain_autonomy_recovery_obligation_store_entry',
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

export function appendDomainAutonomyCloseoutInboxPending(
  entries: DomainAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    obligation_id: string;
    current_identity: DomainAutonomyStageRunIdentity;
    terminal_closeout_ref: string;
    appended_at: string;
  },
) {
  const entry: DomainAutonomyCloseoutInboxEntry = {
    surface_kind: 'opl_domain_autonomy_closeout_inbox_entry',
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

export function readDomainAutonomyCloseoutInboxJsonl(
  ledgerPath: string,
): DomainAutonomyCloseoutInboxEntry[] {
  return readDomainAutonomyJsonlLedger(
    ledgerPath,
    'opl_domain_autonomy_closeout_inbox_entry',
  ) as DomainAutonomyCloseoutInboxEntry[];
}

export function appendDomainAutonomyCloseoutInboxJsonl(
  ledgerPath: string,
  entry: DomainAutonomyCloseoutInboxEntry,
) {
  appendDomainAutonomyJsonlLedgerEntry(
    ledgerPath,
    entry,
    'opl_domain_autonomy_closeout_inbox_entry',
  );
}

export function readDomainAutonomyCloseoutInboxEntry(
  entries: DomainAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    current_identity: DomainAutonomyStageRunIdentity;
  },
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      entry.closeout_ref === input.closeout_ref
      && sameDomainAutonomyStageRunIdentity(entry.current_identity, input.current_identity)
    ) {
      return entry;
    }
  }
  return null;
}

export function consumeDomainAutonomyCloseoutInboxEntry(
  entries: DomainAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    current_identity: DomainAutonomyStageRunIdentity;
    supervisor_decision_ref: string;
    consumed_at: string;
  },
) {
  const pending = readDomainAutonomyCloseoutInboxEntry(entries, input);
  if (!pending || pending.status !== 'pending') {
    return {
      consumed: false as const,
      reason: 'closeout_not_pending' as const,
      entries,
    };
  }
  const entry: DomainAutonomyCloseoutInboxEntry = {
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

export function rejectDomainAutonomyCloseoutInboxEntry(
  entries: DomainAutonomyCloseoutInboxEntry[],
  input: {
    closeout_ref: string;
    current_identity: DomainAutonomyStageRunIdentity;
    reason: string;
    rejected_at: string;
  },
) {
  const pending = readDomainAutonomyCloseoutInboxEntry(entries, input);
  if (!pending || pending.status !== 'pending') {
    return {
      rejected: false as const,
      reason: 'closeout_not_pending' as const,
      entries,
    };
  }
  const entry: DomainAutonomyCloseoutInboxEntry = {
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
  entry_kind: DomainAutonomySupervisorDecisionLedgerEntry['entry_kind'];
  obligation_id: string;
  current_identity: DomainAutonomyStageRunIdentity;
  decision: DomainAutonomySupervisorDecisionReadback;
  reason: DomainAutonomySupervisorDecisionLedgerEntry['reason'];
  recorded_at: string;
}): DomainAutonomySupervisorDecisionLedgerEntry {
  return {
    surface_kind: 'opl_domain_autonomy_supervisor_decision_ledger_entry',
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
    obligation_entries: DomainAutonomyRecoveryObligationStoreEntry[];
    decision: DomainAutonomySupervisorDecisionReadback;
    applied_at: string;
  },
  reason: 'stale_supervisor_decision' | 'obligation_not_found',
) {
  const entry: DomainAutonomyRecoveryObligationStoreEntry = {
    surface_kind: 'opl_domain_autonomy_recovery_obligation_store_entry',
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

function readDomainAutonomyJsonlLedger(
  ledgerPath: string,
  expectedSurfaceKind: DomainAutonomyJsonlSurfaceKind,
): DomainAutonomyJsonlLedgerEntry[] {
  if (!existsSync(ledgerPath)) {
    return [];
  }
  const raw = readFileSync(ledgerPath, 'utf8');
  const entries: DomainAutonomyJsonlLedgerEntry[] = [];
  for (const [index, line] of raw.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = parseJsonText(trimmed) as Partial<DomainAutonomyJsonlLedgerEntry>;
    if (parsed.surface_kind !== expectedSurfaceKind) {
      throw new Error(
        `Unexpected domain autonomy JSONL surface at line ${index + 1}: ${String(parsed.surface_kind)}`,
      );
    }
    entries.push(parsed as DomainAutonomyJsonlLedgerEntry);
  }
  return entries;
}

function appendDomainAutonomyJsonlLedgerEntry(
  ledgerPath: string,
  entry: DomainAutonomyJsonlLedgerEntry,
  expectedSurfaceKind: DomainAutonomyJsonlSurfaceKind,
) {
  if (entry.surface_kind !== expectedSurfaceKind) {
    throw new Error(
      `Unexpected domain autonomy JSONL append surface: ${entry.surface_kind}`,
    );
  }
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function obligationStatusForDecision(
  decisionKind: DomainAutonomySupervisorDecisionKind,
): DomainAutonomyRecoveryObligation['status'] {
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

function domainAutonomyIdentityKey(
  obligationId: string,
  identity: DomainAutonomyStageRunIdentity,
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

function sameDomainAutonomyStageRunIdentity(
  left: DomainAutonomyStageRunIdentity,
  right: DomainAutonomyStageRunIdentity,
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
