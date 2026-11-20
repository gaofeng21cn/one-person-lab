import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  normalizeTypedStageCloseoutPacket,
  validateCloseoutPacketForAttempt,
  type TypedStageCloseoutPacket,
} from '../family-runtime-codex-stage-runner-parts/closeout-normalization.ts';
import {
  buildFamilyConflictSubject,
  buildReceiptConflictEnvelope,
  normalizeStageQualityAttemptRole,
  sanitizeStageQualityAttemptRouteImpact,
  stageQualityAttemptOutcomeFromEnvelope,
} from '../../../authority/stages/index.ts';
import {
  type StageAttemptCloseoutRow,
  type StageAttemptRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import { stableId } from '../../../kernel/stable-id.ts';
import {
  appendActivityEventToRow,
  nowIso,
  parseStageAttemptCloseoutJson,
  stringifyStageAttemptCloseoutJson,
} from './shared.ts';
import { canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { inspectStageAttempt } from './inspect.ts';
import {
  reconcileDomainRouteTerminalTaskForAttempt,
} from '../family-runtime-domain-route-terminal-sync.ts';
import { persistStageAttemptUsageObservation } from '../family-runtime-stage-attempt-usage-observation.ts';
import {
  requireCanonicalNormalizedStageQualityCloseout,
} from '../family-runtime-codex-stage-runner-parts/closeout-derivation.ts';
import { withFamilyRuntimeSavepoint } from '../family-runtime-sqlite.ts';

function normalizeRouteImpact(
  packet: TypedStageCloseoutPacket,
  existingRouteImpact: Record<string, unknown>,
  attempt: ReturnType<typeof inspectStageAttempt>,
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
  const normalized = sanitizeStageQualityAttemptRouteImpact({
    attempt,
    routeImpact: domainRouteImpact,
  });
  if (attempt.attempt_role) {
    const stageQualityCycle = optionalRecord(normalized.stage_quality_cycle) ?? {};
    stageQualityAttemptOutcomeFromEnvelope({
      attemptRole: normalizeStageQualityAttemptRole(attempt.attempt_role),
      envelope: stageQualityCycle,
    });
  }
  return {
    ...normalized,
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
  if (!packet.closeout_refs.every((ref) => existingCloseoutRefs.has(ref))) {
    return false;
  }
  // A prior closeout may contain the same artifact refs while still carrying
  // an incomplete route-quality projection. Treat that case as absorbable
  // only after the normalized route impact is also identical.
  const normalizedRouteImpact = normalizeRouteImpact(packet, attempt.route_impact, attempt);
  return canonicalJsonText(normalizedRouteImpact) === canonicalJsonText(attempt.route_impact);
}

function closeoutReceiptStatusForPacket(packet: TypedStageCloseoutPacket) {
  const routeImpact = optionalRecord(packet.route_impact) ?? {};
  const authorityBoundary = optionalRecord(packet.authority_boundary) ?? {};
  return routeImpact.framework_generated_envelope === true
    || authorityBoundary.opl === 'raw_executor_output_progress_envelope_only'
    || authorityBoundary.opl === 'provider_quality_debt_diagnostic_projection_only'
    ? 'framework_progress_envelope'
    : 'accepted_typed_closeout';
}

function syncAttemptRowFromCloseout(
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
  const closeoutReceiptStatus = closeoutReceiptStatusForPacket(input.packet);
  if (
    input.attempt.status === 'completed'
    && input.attempt.closeout_receipt_status === closeoutReceiptStatus
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
    activity_kind: closeoutReceiptStatus === 'accepted_typed_closeout'
      ? 'typed_closeout_ingest'
      : 'framework_progress_closeout_ingest',
    activity_status: closeoutReceiptStatus === 'accepted_typed_closeout'
      ? 'completed'
      : 'completed_with_quality_debt',
    closeout_id: input.closeoutId,
    closeout_refs: input.packet.closeout_refs,
    closeout_receipt_status: closeoutReceiptStatus,
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
    JSON.stringify(normalizeRouteImpact(input.packet, input.attempt.route_impact, input.attempt)),
    closeoutReceiptStatus,
    input.observedAt,
    input.stageAttemptId,
  );
  reconcileDomainRouteTerminalTaskForAttempt(db, {
    stageAttemptId: input.stageAttemptId,
    source: 'typed-closeout-ingest:domain-route-terminal',
  });
  return inspectStageAttempt(db, input.stageAttemptId);
}

function ingestStageAttemptCloseoutInSavepoint(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    packet: TypedStageCloseoutPacket | Record<string, unknown>;
    costSummary?: Record<string, unknown> | null;
  },
  normalization: ReturnType<typeof requireCanonicalNormalizedStageQualityCloseout>,
  ) {
    const attempt = inspectStageAttempt(db, input.stageAttemptId);
    const normalizedPacket = normalizeTypedStageCloseoutPacket(input.packet);
    const admitted = validateCloseoutPacketForAttempt({
      closeoutPacket: normalizedPacket,
      attempt,
    });
    if (!admitted.closeoutPacket || admitted.rejection) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageAttempt closeout does not match the persisted execution identity.',
        {
          failure_code: 'stage_attempt_closeout_identity_rejected',
          stage_attempt_id: input.stageAttemptId,
          rejection: admitted.rejection,
        },
      );
    }
  const packet = admitted.closeoutPacket;
  const createdAt = nowIso();
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
  // Validate role/outcome ABI before writing usage or closeout rows.
  normalizeRouteImpact(packet, attempt.route_impact, attempt);
  const costSummary = optionalRecord(input.costSummary);
  const closeoutId = packet.closeout_id
    ?? stableId('closeout', [input.stageAttemptId, packet.surface_kind, packet.closeout_refs]);
  const packetJson = stringifyStageAttemptCloseoutJson(packet);
  const existingCloseout = db.prepare(`
    SELECT * FROM stage_attempt_closeouts WHERE closeout_id = ?
  `).get(closeoutId) as StageAttemptCloseoutRow | undefined;
  // Monotonicity guard: once any canonical normalized child exists for this
  // Attempt, no different closeout — derived or not — may replace it. The guard
  // must apply to incoming derived packets too: they are exactly the packets
  // that could otherwise install a second canonical child.
  const hasCanonicalDerivedChild = () => {
    const rows = db.prepare(`
      SELECT packet_json FROM stage_attempt_closeouts
      WHERE stage_attempt_id = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(input.stageAttemptId) as Pick<StageAttemptCloseoutRow, 'packet_json'>[];
    return rows.some((row) =>
      optionalRecord(optionalRecord(parseStageAttemptCloseoutJson(row.packet_json))?.closeout_normalization)
        ?.status === 'normalized'
    );
  };
  const persistOriginalAudit = () => {
    if (!normalization) return;
    const original = normalization.originalCloseout;
    const originalCloseoutId = original.closeout_id!;
    const originalPacketJson = stringifyStageAttemptCloseoutJson(original);
    const existingOriginal = db.prepare('SELECT * FROM stage_attempt_closeouts WHERE closeout_id = ?')
      .get(originalCloseoutId) as StageAttemptCloseoutRow | undefined;
    if (existingOriginal
      && (existingOriginal.stage_attempt_id !== input.stageAttemptId
        || existingOriginal.packet_json !== originalPacketJson)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Original normalization closeout id conflicts with persisted bytes.',
        {
          failure_code: 'stage_closeout_normalization_original_conflict',
          stage_attempt_id: input.stageAttemptId,
          original_closeout_id: originalCloseoutId,
        },
      );
    }
    if (existingCloseout && !existingOriginal) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Derived closeout cannot be replayed without its original audit parent.',
        {
          failure_code: 'stage_closeout_normalization_parent_missing',
          stage_attempt_id: input.stageAttemptId,
          original_closeout_id: originalCloseoutId,
          derived_closeout_id: closeoutId,
        },
      );
    }
    if (!existingOriginal) {
      db.prepare(`
        INSERT INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(originalCloseoutId, input.stageAttemptId, originalPacketJson, createdAt);
    }
  };
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
    if (hasCanonicalDerivedChild()) {
      // A derived exact replay is a no-op, but the original audit parent
      // invariant still applies: replaying a child without its persisted
      // parent must fail closed rather than silently no-op.
      persistOriginalAudit();
      return {
        attempt,
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
    persistOriginalAudit();
    if (attempt.executor_kind === 'codex_cli') {
      persistStageAttemptUsageObservation(db, {
        stageAttemptId: input.stageAttemptId,
        costSummary,
        observedAt: createdAt,
        executionSessionRef: attempt.execution_session_ref,
        sourceFallbackRef: `stage_attempt:${input.stageAttemptId}#usage_observation`,
      });
    }
    const syncedAttempt = syncAttemptRowFromCloseout(db, {
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
  if (hasCanonicalDerivedChild()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'A different closeout cannot replace an Attempt that already has a canonical normalized child.',
      {
        failure_code: 'stage_closeout_normalization_canonical_child_exists',
        stage_attempt_id: input.stageAttemptId,
        closeout_id: closeoutId,
        incoming_closeout_kind: normalization ? 'derived' : 'non_derived',
      },
    );
  }
  persistOriginalAudit();
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
  const syncedAttempt = syncAttemptRowFromCloseout(db, {
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

// The receipt list names OPL-owned transport identity. The runner canonicalizes
// it from verified closeout_ref_metadata, so any persisted packet must either
// omit/empty the claim (derivation or recovery fills it) or carry exactly the
// verified list. A divergent or malformed non-empty declaration can only come
// from a path that bypassed runner verification, so ingest fails closed before
// any durable write. The embedded original inside closeout_normalization
// lineage is audit data and is intentionally not re-validated here.
function requireConsistentDeclaredArtifactIdentityReceiptRefs(
  packet: TypedStageCloseoutPacket,
  stageAttemptId: string,
) {
  const envelope = optionalRecord(optionalRecord(packet.route_impact)?.stage_quality_cycle);
  if (!envelope) return;
  const declared = envelope.artifact_identity_receipt_refs;
  if (declared === undefined || (Array.isArray(declared) && declared.length === 0)) return;
  const artifactRefs = Array.isArray(envelope.artifact_refs) ? envelope.artifact_refs : [];
  const metadata = Array.isArray(packet.closeout_ref_metadata) ? packet.closeout_ref_metadata : [];
  const expected = artifactRefs.map((artifactRef) => {
    if (typeof artifactRef !== 'string') return null;
    const entry = metadata.find((candidate) => candidate.ref === artifactRef || candidate.uri === artifactRef);
    const receiptRef = entry?.artifact_identity_receipt_ref;
    return typeof receiptRef === 'string' && receiptRef.length > 0 ? receiptRef : null;
  });
  const matches = !expected.some((ref) => ref === null)
    && Array.isArray(declared)
    && declared.length === expected.length
    && declared.every((ref, index) => typeof ref === 'string' && ref.length > 0 && ref === expected[index]);
  if (!matches) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Declared artifact identity receipt refs must equal the verified closeout metadata receipts.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
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
  const admitted = validateCloseoutPacketForAttempt({ closeoutPacket: packet, attempt });
  if (!admitted.closeoutPacket || admitted.rejection) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageAttempt closeout does not match the persisted execution identity.',
      {
        failure_code: 'stage_attempt_closeout_identity_rejected',
        stage_attempt_id: input.stageAttemptId,
        rejection: admitted.rejection,
      },
    );
  }
  requireConsistentDeclaredArtifactIdentityReceiptRefs(admitted.closeoutPacket, input.stageAttemptId);
  const normalization = requireCanonicalNormalizedStageQualityCloseout({
    closeoutPacket: admitted.closeoutPacket,
    attempt,
  });
  if (admitted.closeoutPacket.closeout_normalization && !normalization) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Derived closeout does not match its canonical original-to-derived lineage.',
      {
        failure_code: 'stage_closeout_normalization_lineage_rejected',
        stage_attempt_id: input.stageAttemptId,
      },
    );
  }
  return withFamilyRuntimeSavepoint(db, 'stage_attempt_closeout_ingest', () =>
    ingestStageAttemptCloseoutInSavepoint(db, input, normalization));
}
