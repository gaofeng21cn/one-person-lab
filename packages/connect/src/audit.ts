import { assertTrustedHost, newId, nowIso, type ClientContext } from '@opl/core';
import { appendEntryWithDb } from '@opl/ledger';

import { ConnectError, redactSensitiveText } from './errors.ts';
import type { ConnectAuditInput } from './types.ts';

export function requireTrustedHost(
  clientContext: ClientContext | null | undefined,
  action: string,
): ClientContext {
  try {
    if (!clientContext || typeof clientContext !== 'object') {
      assertTrustedHost('external', action);
    } else {
      assertTrustedHost(clientContext, action);
    }
    return clientContext!;
  } catch {
    const clientKind = clientContext && typeof clientContext === 'object'
      ? String((clientContext as { client_kind?: unknown }).client_kind ?? 'external')
      : 'external';
    throw new ConnectError(
      'TRUSTED_HOST_REQUIRED',
      `Trusted interactive host required for ${action}; got client_kind='${clientKind}'.`,
      {
        reason_code: 'trusted_host_required',
        details: { action, client_kind: clientKind },
      },
    );
  }
}

export function recordConnectAudit(input: ConnectAuditInput): string {
  const eventId = newId('caud');
  const createdAt = nowIso();
  const safeSummary = redactSensitiveText(input.summary).slice(0, 512);

  input.db
    .prepare(
      'INSERT INTO connect_audit_events (event_id, kind, connection_id, grant_id, consumer_package_id, capability_id, capability_risk, disposition, actor_kind, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      eventId,
      input.kind,
      input.connection_id,
      input.grant_id ?? null,
      input.consumer_package_id ?? null,
      input.capability_id ?? null,
      input.capability_risk ?? null,
      input.disposition ?? null,
      input.actor_kind,
      safeSummary,
      createdAt,
    );

  const taskId = input.audit_context?.task_id?.trim();
  if (taskId) {
    const ownerId = input.audit_context?.owner_id?.trim() || 'opl-connect';
    const evidenceRefs = (input.evidence_refs && input.evidence_refs.length > 0
      ? input.evidence_refs
      : [`connect/connections/${input.connection_id}`]
    ).map((r) => redactSensitiveText(r));

    const ledgerKind = input.ledger_kind ?? 'human_decision';
    if (ledgerKind === 'owner_receipt') {
      appendEntryWithDb(input.db, {
        task_id: taskId,
        stage_run_id: input.audit_context?.stage_run_id ?? null,
        attempt_id: input.audit_context?.attempt_id ?? null,
        entry_kind: 'owner_receipt',
        owner_id: ownerId,
        payload: {
          status: 'completed',
          delta_classification: 'deliverable_progress_delta',
          evidence_refs: [...evidenceRefs],
          summary: safeSummary,
        },
        created_at: createdAt,
      });
    } else if (ledgerKind === 'typed_blocker') {
      appendEntryWithDb(input.db, {
        task_id: taskId,
        stage_run_id: input.audit_context?.stage_run_id ?? null,
        attempt_id: input.audit_context?.attempt_id ?? null,
        entry_kind: 'typed_blocker',
        owner_id: ownerId,
        payload: {
          code: input.ledger_blocker_code ?? 'connect_invocation_failed',
          blocker_class: 'connect_authorization',
          summary: safeSummary,
          retryable: false,
          evidence_refs: [...evidenceRefs],
        },
        created_at: createdAt,
      });
    } else {
      appendEntryWithDb(input.db, {
        task_id: taskId,
        stage_run_id: input.audit_context?.stage_run_id ?? null,
        attempt_id: input.audit_context?.attempt_id ?? null,
        entry_kind: 'human_decision',
        owner_id: ownerId,
        payload: {
          decision: input.ledger_decision ?? input.kind,
          ...(input.audit_context?.actor_id ? { actor_id: input.audit_context.actor_id } : {}),
          reason: safeSummary,
          evidence_refs: [...evidenceRefs],
        },
        created_at: createdAt,
      });
    }
  }

  return eventId;
}
