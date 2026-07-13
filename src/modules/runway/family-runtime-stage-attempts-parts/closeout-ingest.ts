import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from '../family-runtime-codex-stage-runner.ts';
import {
  buildFamilyConflictSubject,
  buildReceiptConflictEnvelope,
} from '../../stagecraft/index.ts';
import {
  type StageAttemptCloseoutRow,
  type StageAttemptRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import { stableId } from '../../../kernel/stable-id.ts';
import {
  appendActivityEventToRow,
  nowIso,
} from './shared.ts';
import { inspectStageAttempt } from './inspect.ts';
import {
  reconcileDomainRouteTerminalTaskForAttempt,
} from '../family-runtime-domain-route-terminal-sync.ts';
import { persistStageAttemptUsageObservation } from '../family-runtime-stage-attempt-usage-observation.ts';

function normalizeRouteImpact(
  packet: TypedStageCloseoutPacket,
  existingRouteImpact: Record<string, unknown>,
) {
  const routeImpact = packet.route_impact && typeof packet.route_impact === 'object' && !Array.isArray(packet.route_impact)
    ? packet.route_impact
    : {};
  const {
    selected_action_id: _ignoredSelectedActionId,
    selected_stage_route: _ignoredSelectedStageRoute,
    ...domainRouteImpact
  } = routeImpact;
  const selectedActionId = typeof existingRouteImpact.selected_action_id === 'string'
    ? existingRouteImpact.selected_action_id
    : null;
  const selectedStageRoute = optionalRecord(existingRouteImpact.selected_stage_route);
  return {
    ...domainRouteImpact,
    next_owner: packet.next_owner,
    domain_ready_verdict: packet.domain_ready_verdict,
    ...(selectedActionId ? { selected_action_id: selectedActionId } : {}),
    ...(selectedStageRoute ? { selected_stage_route: selectedStageRoute } : {}),
  };
}

function closeoutRefsForAttempt(
  attempt: ReturnType<typeof inspectStageAttempt>,
  packet: TypedStageCloseoutPacket,
) {
  const existingCloseoutRefs = Array.isArray(attempt.closeout_refs)
    ? attempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return [...new Set([...existingCloseoutRefs, ...packet.closeout_refs])];
}

function humanGateRefsForAttempt(attempt: ReturnType<typeof inspectStageAttempt>) {
  return Array.isArray(attempt.human_gate_refs)
    ? attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function optionalRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function attemptAlreadyAbsorbedCloseout(
  attempt: ReturnType<typeof inspectStageAttempt>,
  packet: TypedStageCloseoutPacket,
) {
  const existingCloseoutRefs = new Set(
    Array.isArray(attempt.closeout_refs)
      ? attempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string')
      : [],
  );
  return packet.closeout_refs.every((ref) => existingCloseoutRefs.has(ref));
}

function syncAttemptRowFromAcceptedCloseout(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    attempt: ReturnType<typeof inspectStageAttempt>;
    packet: TypedStageCloseoutPacket;
    closeoutId: string;
    observedAt: string;
    costSummary?: Record<string, unknown> | null;
  },
) {
  if (
    input.attempt.status === 'completed'
    && input.attempt.closeout_receipt_status === 'accepted_typed_closeout'
    && attemptAlreadyAbsorbedCloseout(input.attempt, input.packet)
    && (!input.costSummary || optionalRecord(input.attempt.provider_run.cost_summary))
  ) {
    reconcileDomainRouteTerminalTaskForAttempt(db, {
      stageAttemptId: input.stageAttemptId,
      source: 'typed-closeout-ingest:domain-route-terminal',
    });
    return input.attempt;
  }
  const currentRow = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow;
  const providerRun = {
    ...input.attempt.provider_run,
    provider_status: 'completed',
    completed_at: input.observedAt,
    last_heartbeat_at: input.observedAt,
    ...(input.costSummary ? { cost_summary: input.costSummary } : {}),
  };
  const activityEvents = appendActivityEventToRow(currentRow, {
    activity_kind: 'typed_closeout_ingest',
    activity_status: 'completed',
    closeout_id: input.closeoutId,
    closeout_refs: input.packet.closeout_refs,
    ...(input.costSummary
      ? {
          usage_projection_source: 'provider_run.cost_summary',
          cost_summary_persisted_to_provider_run: true,
        }
      : {}),
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'completed', closeout_refs_json = ?, human_gate_refs_json = ?, blocked_reason = NULL,
      provider_run_json = ?, activity_events_json = ?, route_impact_json = ?, closeout_receipt_status = ?,
      updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    JSON.stringify(closeoutRefsForAttempt(input.attempt, input.packet)),
    JSON.stringify(humanGateRefsForAttempt(input.attempt)),
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    JSON.stringify(normalizeRouteImpact(input.packet, input.attempt.route_impact)),
    'accepted_typed_closeout',
    input.observedAt,
    input.stageAttemptId,
  );
  reconcileDomainRouteTerminalTaskForAttempt(db, {
    stageAttemptId: input.stageAttemptId,
    source: 'typed-closeout-ingest:domain-route-terminal',
  });
  return inspectStageAttempt(db, input.stageAttemptId);
}

export function ingestStageAttemptCloseout(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    packet: TypedStageCloseoutPacket | Record<string, unknown>;
    costSummary?: Record<string, unknown> | null;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const packet = normalizeTypedStageCloseoutPacket(input.packet);
  if (packet.domain_output && packet.domain_output.domain_id !== attempt.domain_id) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'domain_output.domain_id must match the stage attempt domain.',
      {
        stage_attempt_id: input.stageAttemptId,
        attempt_domain_id: attempt.domain_id,
        domain_output_domain_id: packet.domain_output.domain_id,
      },
    );
  }
  const costSummary = optionalRecord(input.costSummary);
  const createdAt = nowIso();
  const closeoutId = packet.closeout_id
    ?? stableId('closeout', [input.stageAttemptId, packet.surface_kind, packet.closeout_refs]);
  const packetJson = JSON.stringify(packet);
  const existingCloseout = db.prepare(`
    SELECT * FROM stage_attempt_closeouts WHERE closeout_id = ?
  `).get(closeoutId) as StageAttemptCloseoutRow | undefined;
  if (existingCloseout) {
    if (existingCloseout.stage_attempt_id !== input.stageAttemptId || existingCloseout.packet_json !== packetJson) {
      const subject = buildFamilyConflictSubject({
        domain: attempt.domain_id,
        stageId: attempt.stage_id,
        taskKind: attempt.stage_id,
        sourceFingerprint: attempt.source_fingerprint,
        idempotencyKey: attempt.idempotency_key,
        stageAttemptId: attempt.stage_attempt_id,
        taskId: attempt.task_id,
      });
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage closeout id already exists with a different typed closeout packet.',
        {
          closeout_id: closeoutId,
          stage_attempt_id: input.stageAttemptId,
          existing_stage_attempt_id: existingCloseout.stage_attempt_id,
          required: ['unique closeout_id per typed packet'],
          receipt_conflict: buildReceiptConflictEnvelope({
            subject,
            reason: 'stage_closeout_id_already_exists_with_different_packet',
            evidenceRefs: [
              `opl://stage_attempt_closeouts/${closeoutId}`,
              `opl://stage_attempts/${input.stageAttemptId}`,
            ],
          }),
        },
      );
    }
    if (attempt.executor_kind === 'codex_cli') {
      persistStageAttemptUsageObservation(db, {
        stageAttemptId: input.stageAttemptId,
        costSummary,
        observedAt: createdAt,
        executionSessionRef: attempt.execution_session_ref,
        sourceFallbackRef: `stage_attempt:${input.stageAttemptId}#usage_observation`,
      });
    }
    const syncedAttempt = syncAttemptRowFromAcceptedCloseout(db, {
      stageAttemptId: input.stageAttemptId,
      attempt,
      packet,
      closeoutId,
      observedAt: createdAt,
      costSummary,
    });
    return {
      attempt: syncedAttempt,
      closeout: {
        closeout_id: closeoutId,
        stage_attempt_id: input.stageAttemptId,
        packet,
        created_at: existingCloseout.created_at,
        persisted_count: 1,
        idempotent_noop: true,
      },
    };
  }
  if (attempt.executor_kind === 'codex_cli') {
    persistStageAttemptUsageObservation(db, {
      stageAttemptId: input.stageAttemptId,
      costSummary,
      observedAt: createdAt,
      executionSessionRef: attempt.execution_session_ref,
      sourceFallbackRef: `stage_attempt:${input.stageAttemptId}#usage_observation`,
    });
  }
  db.prepare(`
    INSERT OR IGNORE INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(closeoutId, input.stageAttemptId, packetJson, createdAt);
  const persistedCloseouts = db.prepare(
    'SELECT COUNT(*) AS count FROM stage_attempt_closeouts WHERE closeout_id = ?',
  ).get(closeoutId) as { count: number };
  const syncedAttempt = syncAttemptRowFromAcceptedCloseout(db, {
    stageAttemptId: input.stageAttemptId,
    attempt,
    packet,
    closeoutId,
    observedAt: createdAt,
    costSummary,
  });
  return {
    attempt: syncedAttempt,
    closeout: {
      closeout_id: closeoutId,
      stage_attempt_id: input.stageAttemptId,
      packet,
      created_at: createdAt,
      persisted_count: persistedCloseouts.count,
      idempotent_noop: false,
    },
  };
}
