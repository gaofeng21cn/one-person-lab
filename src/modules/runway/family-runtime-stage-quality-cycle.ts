import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  initialStageQualityCycleState,
  normalizeStageQualityCyclePolicy,
  type StageQualityCyclePolicy,
  type StageQualityCycleState,
} from '../stagecraft/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import type { TemporalStageRunWorkflowState } from './family-runtime-temporal.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';
import { materializePersistedStageReviewReceipt } from './family-runtime-stage-attempt-ledger.ts';
import { readOplRevisionIntake } from './family-runtime-revision-intake.ts';
import { buildStageRouteDecisionIdentity } from './family-runtime-stage-run-identity.ts';

type StageQualityCycleRow = {
  quality_cycle_id: string;
  stage_run_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  policy_json: string;
  state_json: string;
  current_attempt_ref: string | null;
  created_at: string;
  updated_at: string;
};

function parsePolicy(row: StageQualityCycleRow) {
  return normalizeStageQualityCyclePolicy(parseJsonText(row.policy_json));
}

function parseState(row: StageQualityCycleRow) {
  return parseJsonText(row.state_json) as StageQualityCycleState;
}

function getRow(db: DatabaseSync, qualityCycleId: string) {
  return db.prepare('SELECT * FROM stage_quality_cycles WHERE quality_cycle_id = ?').get(
    qualityCycleId,
  ) as StageQualityCycleRow | undefined;
}

function payload(row: StageQualityCycleRow) {
  return {
    quality_cycle_id: row.quality_cycle_id,
    stage_run_id: row.stage_run_id,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    policy: parsePolicy(row),
    state: parseState(row),
    current_attempt_ref: row.current_attempt_ref,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function withQualityCycleMutation<T>(db: DatabaseSync, mutation: () => T) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const result = mutation();
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

function stageRunMutationAuthority(
  db: DatabaseSync,
  stageRunId: string,
  operation: string,
) {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_run_launches'",
  ).get();
  const row = table
    ? db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?').get(
        stageRunId,
      ) as Record<string, unknown> | undefined
    : undefined;
  if (!row) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality cycle requires a registered StageRun authority.',
      {
        failure_code: 'stage_quality_cycle_stage_run_unregistered',
        stage_run_id: stageRunId,
        operation,
      },
    );
  }
  return {
    row,
    admission: requireRuntimeExecutionScopeMutationAllowed(db, row, operation),
  };
}

function stageAttemptIdFromRef(attemptRef: string) {
  const prefix = 'opl://stage_attempts/';
  const stageAttemptId = attemptRef.startsWith(prefix)
    ? attemptRef.slice(prefix.length).trim()
    : '';
  if (!stageAttemptId || attemptRef !== `${prefix}${stageAttemptId}`) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage quality cycle Attempt ref is invalid.', {
      failure_code: 'stage_quality_cycle_attempt_ref_invalid',
      attempt_ref: attemptRef,
    });
  }
  return stageAttemptId;
}

function executionIdentityLineage(admission: ReturnType<typeof requireRuntimeExecutionScopeMutationAllowed>) {
  return {
    columns: {
      scope_kind: admission.columns.scope_kind,
      project_scope_id: admission.columns.project_scope_id,
      work_item_scope_id: admission.columns.work_item_scope_id,
      workspace_binding_id: admission.columns.workspace_binding_id,
      binding_version_id: admission.columns.binding_version_id,
      scope_digest: admission.columns.scope_digest,
      identity_state: admission.columns.identity_state,
    },
    execution_scope: admission.executionScope,
  };
}

function requireCycleAttemptMutationAuthority(input: {
  db: DatabaseSync;
  cycle: StageQualityCycleRow;
  stageRunAdmission: ReturnType<typeof requireRuntimeExecutionScopeMutationAllowed>;
  stageAttemptId: string;
  operation: string;
}) {
  const attempt = input.db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as Record<string, unknown> | undefined;
  if (!attempt) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage quality cycle Attempt is not persisted.', {
      failure_code: 'stage_quality_cycle_attempt_not_found',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const attemptAdmission = requireRuntimeExecutionScopeMutationAllowed(
    input.db,
    attempt,
    input.operation,
  );
  if (
    attempt.stage_run_id !== input.cycle.stage_run_id
    || attempt.quality_cycle_id !== input.cycle.quality_cycle_id
    || attempt.domain_id !== input.cycle.domain_id
    || attempt.stage_id !== input.cycle.stage_id
    || canonicalJsonText(executionIdentityLineage(input.stageRunAdmission))
      !== canonicalJsonText(executionIdentityLineage(attemptAdmission))
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality cycle Attempt lineage does not match its cycle and StageRun.',
      {
        failure_code: 'stage_quality_cycle_attempt_lineage_mismatch',
        quality_cycle_id: input.cycle.quality_cycle_id,
        stage_run_id: input.cycle.stage_run_id,
        stage_attempt_id: input.stageAttemptId,
      },
    );
  }
  return { attempt, admission: attemptAdmission };
}

function persistedArtifactProducerAttemptRef(
  attempt: Record<string, unknown>,
  stageAttemptId: string,
) {
  const rawContextManifest = attempt.context_manifest_json;
  if (typeof rawContextManifest !== 'string' || !rawContextManifest.trim()) return null;
  let contextManifest: unknown;
  try {
    contextManifest = parseJsonText(rawContextManifest);
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt context manifest is invalid JSON.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: stageAttemptId,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  if (!contextManifest || typeof contextManifest !== 'object' || Array.isArray(contextManifest)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt context manifest must be an object.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  const producerRef = (contextManifest as Record<string, unknown>).artifact_producer_attempt_ref;
  if (producerRef === undefined || producerRef === null) return null;
  if (typeof producerRef !== 'string' || !producerRef.trim()) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt artifact producer ref is invalid.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  return producerRef.trim();
}

function projectedAttemptStatusFromPersisted(status: unknown) {
  if (status === 'queued') return 'registered';
  if (
    status === 'running'
    || status === 'checkpointed'
    || status === 'blocked'
    || status === 'human_gate'
    || status === 'completed'
    || status === 'failed'
  ) {
    return status;
  }
  return null;
}

function requireProjectedAttemptSummaryMatchesPersisted(
  summary: TemporalStageRunWorkflowState['attempts'][number],
  attempt: Record<string, unknown>,
) {
  const persisted = {
    attempt_role: attempt.attempt_role ?? null,
    quality_round_index: attempt.quality_round_index ?? null,
    stage_attempt_id: attempt.stage_attempt_id ?? null,
    workflow_id: attempt.workflow_id ?? null,
    execution_session_ref: attempt.execution_session_ref ?? null,
    artifact_producer_attempt_ref: persistedArtifactProducerAttemptRef(
      attempt,
      summary.stage_attempt_id,
    ),
    status: projectedAttemptStatusFromPersisted(attempt.status),
  };
  const projected = {
    attempt_role: summary.attempt_role,
    quality_round_index: summary.quality_round_index,
    stage_attempt_id: summary.stage_attempt_id,
    workflow_id: summary.workflow_id,
    execution_session_ref: summary.execution_session_ref,
    artifact_producer_attempt_ref: summary.artifact_producer_attempt_ref,
    status: summary.status,
  };
  if (canonicalJsonText(persisted) !== canonicalJsonText(projected)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun Attempt summary does not match its durable StageAttempt.',
      {
        failure_code: 'stage_quality_cycle_attempt_summary_mismatch',
        stage_attempt_id: summary.stage_attempt_id,
        persisted,
        projected,
      },
    );
  }
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function persistedJsonRecord(value: unknown, input: {
  stageAttemptId: string;
  field: string;
}) {
  if (typeof value !== 'string' || !value.trim()) return {};
  let parsed: unknown;
  try {
    parsed = parseJsonText(value);
  } catch (error) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt JSON is invalid.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.stageAttemptId,
        field: input.field,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
  const parsedRecord = recordValue(parsed);
  if (!parsedRecord) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality Attempt JSON must contain an object.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.stageAttemptId,
        field: input.field,
      },
    );
  }
  return parsedRecord;
}

function exactStringArray(value: unknown, input: {
  stageAttemptId: string;
  field: string;
}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact identity must contain exact non-empty string arrays.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.stageAttemptId,
        field: input.field,
      },
    );
  }
  return value.map((entry) => (entry as string).trim());
}

function persistedAttemptOutputArtifactIdentity(
  db: DatabaseSync,
  attempt: Record<string, unknown>,
) {
  const stageAttemptId = String(attempt.stage_attempt_id ?? '');
  const routeImpact = persistedJsonRecord(attempt.route_impact_json, {
    stageAttemptId,
    field: 'route_impact_json',
  });
  const envelope = recordValue(routeImpact.stage_quality_cycle) ?? {};
  const artifactRefs = exactStringArray(envelope.artifact_refs, {
    stageAttemptId,
    field: 'route_impact_json.stage_quality_cycle.artifact_refs',
  });
  const artifactHashes = exactStringArray(envelope.artifact_hashes, {
    stageAttemptId,
    field: 'route_impact_json.stage_quality_cycle.artifact_hashes',
  });
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact refs and hashes must have exact cardinality.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  if (artifactRefs.length === 0) {
    return {
      artifact_refs: [],
      artifact_hashes: [],
      artifact_identity_receipt_refs: [],
    };
  }
  const closeoutRow = db.prepare(`
    SELECT packet_json FROM stage_attempt_closeouts
    WHERE stage_attempt_id = ?
    ORDER BY created_at DESC, closeout_id DESC
    LIMIT 1
  `).get(stageAttemptId) as { packet_json?: unknown } | undefined;
  const packet = persistedJsonRecord(closeoutRow?.packet_json, {
    stageAttemptId,
    field: 'stage_attempt_closeouts.packet_json',
  });
  const metadata = packet.closeout_ref_metadata;
  if (!Array.isArray(metadata)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact identity requires closeout receipt metadata.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  const artifactIdentityReceiptRefs = artifactRefs.map((artifactRef, index) => {
    const entry = metadata.map(recordValue).find((candidate) => (
      candidate
      && (candidate.ref === artifactRef || candidate.uri === artifactRef)
      && candidate.sha256 === artifactHashes[index]
    ));
    const receiptRef = entry?.artifact_identity_receipt_ref;
    if (typeof receiptRef !== 'string' || !receiptRef.trim()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Persisted Stage quality artifact receipt metadata does not match its ref and hash.',
        {
          failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
          stage_attempt_id: stageAttemptId,
          artifact_ref: artifactRef,
        },
      );
    }
    return receiptRef.trim();
  });
  const declaredReceiptRefs = exactStringArray(envelope.artifact_identity_receipt_refs, {
    stageAttemptId,
    field: 'route_impact_json.stage_quality_cycle.artifact_identity_receipt_refs',
  });
  if (
    declaredReceiptRefs.length > 0
    && canonicalJsonText(declaredReceiptRefs) !== canonicalJsonText(artifactIdentityReceiptRefs)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Persisted Stage quality artifact receipt refs conflict with closeout metadata.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: stageAttemptId,
      },
    );
  }
  return {
    artifact_refs: artifactRefs,
    artifact_hashes: artifactHashes,
    artifact_identity_receipt_refs: artifactIdentityReceiptRefs,
  };
}

function requireProjectedAttemptArtifactIdentityMatchesPersisted(input: {
  db: DatabaseSync;
  summary: TemporalStageRunWorkflowState['attempts'][number];
  attempt: Record<string, unknown>;
  attemptAuthorities: Map<string, Record<string, unknown>>;
}) {
  const artifactProducerAttemptRef = persistedArtifactProducerAttemptRef(
    input.attempt,
    input.summary.stage_attempt_id,
  );
  const artifactAuthority = (
    input.summary.attempt_role === 'reviewer' || input.summary.attempt_role === 're_reviewer'
  )
    ? artifactProducerAttemptRef
      ? input.attemptAuthorities.get(stageAttemptIdFromRef(artifactProducerAttemptRef))
      : null
    : input.attempt;
  if (!artifactAuthority) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun review summary is missing its durable artifact producer authority.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.summary.stage_attempt_id,
      },
    );
  }
  const persisted = persistedAttemptOutputArtifactIdentity(input.db, artifactAuthority);
  const projected = {
    artifact_refs: input.summary.artifact_refs,
    artifact_hashes: input.summary.artifact_hashes,
    artifact_identity_receipt_refs: input.summary.artifact_identity_receipt_refs,
  };
  if (canonicalJsonText(persisted) !== canonicalJsonText(projected)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun Attempt artifact identity does not match durable closeout evidence.',
      {
        failure_code: 'stage_quality_cycle_attempt_artifact_identity_mismatch',
        stage_attempt_id: input.summary.stage_attempt_id,
        artifact_authority_attempt_id: artifactAuthority.stage_attempt_id,
        persisted,
        projected,
      },
    );
  }
}

function requireProjectedReviewReceiptMatchesPersisted(
  db: DatabaseSync,
  receipt: TemporalStageRunWorkflowState['review_receipts'][number],
) {
  const persisted = materializePersistedStageReviewReceipt(db, {
    producerAttemptId: stageAttemptIdFromRef(receipt.producer_attempt_ref),
    reviewerAttemptId: stageAttemptIdFromRef(receipt.reviewer_attempt_ref),
    rubricRefs: receipt.rubric_refs,
    verdict: receipt.verdict,
  });
  const projectedRecord = { ...(receipt as unknown as Record<string, unknown>) };
  const revisionTransport = projectedRecord.revision_transport;
  delete projectedRecord.revision_transport;
  if (canonicalJsonText(projectedRecord) !== canonicalJsonText(persisted)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun review receipt does not match durable StageAttempt evidence.',
      {
        failure_code: 'stage_quality_cycle_review_receipt_content_mismatch',
        producer_attempt_ref: receipt.producer_attempt_ref,
        reviewer_attempt_ref: receipt.reviewer_attempt_ref,
      },
    );
  }
  if (revisionTransport === undefined) return;
  const transport = recordValue(revisionTransport);
  if (!transport) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun revision transport is invalid.',
      { failure_code: 'stage_quality_cycle_revision_transport_mismatch' },
    );
  }
  const readback = readOplRevisionIntake(transport.opl_revision_intake_ref);
  if (
    transport.surface_kind !== 'opl_revision_transport'
    || transport.schema_version !== 1
    || canonicalJsonText(transport.opl_stage_review_receipt_ref)
      !== canonicalJsonText(readback.stage_review_receipt_ref)
    || canonicalJsonText(transport.opl_revision_intake_ref)
      !== canonicalJsonText(readback.revision_intake_ref)
    || canonicalJsonText(transport.opl_revision_intake)
      !== canonicalJsonText(readback.revision_intake)
    || canonicalJsonText(transport.authority_boundary)
      !== canonicalJsonText(readback.revision_intake.authority_boundary)
    || canonicalJsonText(readback.stage_review_receipt) !== canonicalJsonText(persisted)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun revision transport does not exactly bind its durable review receipt.',
      { failure_code: 'stage_quality_cycle_revision_transport_mismatch' },
    );
  }
}

const STAGE_ROUTE_LAUNCH_AUTHORITY_BOUNDARY = {
  semantic_route_decision_owner: 'decisive_codex_attempt',
  stage_transition_materialization_owner: 'opl_stage_run_controller',
  opl_can_select_semantic_stage_route: false,
} as const;

function requireProjectedRouteLaunchMatchesPersisted(input: {
  db: DatabaseSync;
  receipt: NonNullable<TemporalStageRunWorkflowState['next_stage_run_launch']>;
  selectedStageRoute: TemporalStageRunWorkflowState['selected_stage_route'];
  stageRun: Record<string, unknown>;
  stageRunAdmission: ReturnType<typeof requireRuntimeExecutionScopeMutationAllowed>;
  decisiveAttempt: Record<string, unknown>;
}) {
  if (
    input.receipt.surface_kind !== 'opl_stage_run_route_launch_receipt'
    || input.receipt.version !== 'opl-stage-run-route-launch-receipt.v1'
    || canonicalJsonText(input.receipt.decision) !== canonicalJsonText(input.selectedStageRoute)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch receipt envelope does not match the selected Stage route.',
      { failure_code: 'stage_quality_cycle_route_launch_envelope_mismatch' },
    );
  }
  const decision = recordValue(input.receipt.decision);
  if (!decision) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch decision is invalid.',
      { failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch' },
    );
  }
  const identity = buildStageRouteDecisionIdentity({
    parentStageRunId: String(input.stageRun.stage_run_id),
    decisiveAttemptRef: input.receipt.decisive_attempt_ref,
    decision,
  });
  const decisiveQualityContext = persistedJsonRecord(input.decisiveAttempt.quality_context_json, {
    stageAttemptId: String(input.decisiveAttempt.stage_attempt_id),
    field: 'quality_context_json',
  });
  const decisiveExecutionBinding = recordValue(decisiveQualityContext.execution_content_binding);
  const decisiveBindingSha256 = decisiveExecutionBinding?.binding_sha256;
  if (
    typeof decisiveBindingSha256 !== 'string'
    || !decisiveBindingSha256.trim()
    || input.receipt.parent_route_decision_ref !== identity.parent_route_decision_ref
    || input.receipt.route_decision_sha256 !== identity.route_decision_sha256
    || input.receipt.decisive_execution_content_binding_sha256 !== decisiveBindingSha256.trim()
    || canonicalJsonText(input.receipt.authority_boundary)
      !== canonicalJsonText(STAGE_ROUTE_LAUNCH_AUTHORITY_BOUNDARY)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch receipt does not match its decisive Attempt binding.',
      { failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch' },
    );
  }
  if (decision.decision_kind === 'complete') {
    if (
      input.receipt.materialization_status !== 'workflow_complete'
      || input.receipt.target_stage_run_id !== null
      || input.receipt.target_stage_run_invocation_id !== null
      || input.receipt.target_stage_run_spec_sha256 !== null
      || input.receipt.target_workflow_id !== null
      || input.receipt.durable_launch !== null
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Complete Stage route receipt cannot carry a target StageRun.',
        { failure_code: 'stage_quality_cycle_route_launch_target_mismatch' },
      );
    }
    return;
  }
  const targetStageRunId = input.receipt.target_stage_run_id;
  const target = typeof targetStageRunId === 'string' && targetStageRunId.trim()
    ? input.db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?').get(
        targetStageRunId,
      ) as Record<string, unknown> | undefined
    : undefined;
  if (!target) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch target is not registered.',
      {
        failure_code: 'stage_quality_cycle_route_launch_target_mismatch',
        target_stage_run_id: targetStageRunId,
      },
    );
  }
  const targetAdmission = requireRuntimeExecutionScopeMutationAllowed(
    input.db,
    target,
    'project_temporal_stage_run_quality_cycle:target_stage_run',
  );
  const durableLaunch = recordValue(input.receipt.durable_launch);
  const durableLaunchRow = recordValue(durableLaunch?.launch);
  const expectedTarget = {
    stage_run_id: target.stage_run_id,
    stage_run_invocation_id: target.stage_run_invocation_id,
    stage_run_spec_sha256: target.stage_run_spec_sha256,
    domain_id: target.domain_id,
    stage_id: target.stage_id,
    workflow_id: target.workflow_id,
    parent_route_decision_ref: target.parent_route_decision_ref,
    scope_digest: target.scope_digest ?? null,
  };
  const projectedTarget = {
    stage_run_id: input.receipt.target_stage_run_id,
    stage_run_invocation_id: input.receipt.target_stage_run_invocation_id,
    stage_run_spec_sha256: input.receipt.target_stage_run_spec_sha256,
    domain_id: durableLaunchRow?.domain_id ?? null,
    stage_id: decision.target_stage_id ?? null,
    workflow_id: input.receipt.target_workflow_id,
    parent_route_decision_ref: input.receipt.parent_route_decision_ref,
    scope_digest: durableLaunchRow?.scope_digest ?? null,
  };
  const startStatus = durableLaunch?.start_status;
  const expectedMaterializationStatus = startStatus === 'existing' ? 'existing' : 'launched';
  if (
    canonicalJsonText(executionIdentityLineage(targetAdmission))
      !== canonicalJsonText(executionIdentityLineage(input.stageRunAdmission))
    || canonicalJsonText(expectedTarget) !== canonicalJsonText(projectedTarget)
    || target.domain_id !== input.stageRun.domain_id
    || input.receipt.materialization_status !== expectedMaterializationStatus
    || !['registered', 'existing', 'starting', 'started', 'recovered'].includes(String(startStatus))
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal next StageRun launch target does not match its durable registry authority.',
      {
        failure_code: 'stage_quality_cycle_route_launch_target_mismatch',
        target_stage_run_id: targetStageRunId,
      },
    );
  }
}

export function createStageQualityCycle(db: DatabaseSync, input: {
  qualityCycleId?: string;
  stageRunId: string;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  policy: StageQualityCyclePolicy | Record<string, unknown>;
}) {
  return withQualityCycleMutation(db, () => {
    const stageRun = stageRunMutationAuthority(db, input.stageRunId, 'create_stage_quality_cycle');
    if (
      stageRun.row.domain_id !== input.domainId || stageRun.row.stage_id !== input.stageId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage quality cycle identity does not match its persisted StageRun.',
        { failure_code: 'stage_quality_cycle_stage_run_identity_mismatch' },
      );
    }
    const policy = normalizeStageQualityCyclePolicy(input.policy);
    if (input.qualityCycleId !== undefined && !input.qualityCycleId.trim()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage quality cycle id must be non-empty.');
    }
    const qualityCycleId = input.qualityCycleId?.trim()
      ?? stableId('sqc', [input.stageRunId, input.domainId, input.stageId, policy]);
    const existing = getRow(db, qualityCycleId);
    if (existing) {
      const identityMatches = existing.stage_run_id === input.stageRunId
        && existing.domain_id === input.domainId
        && existing.stage_id === input.stageId;
      const policyMatches = JSON.stringify(parsePolicy(existing)) === JSON.stringify(policy);
      if (!identityMatches || !policyMatches) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Stage quality cycle id is already bound to a different StageRun identity or policy.',
          {
            quality_cycle_id: qualityCycleId,
            existing_stage_run_id: existing.stage_run_id,
            received_stage_run_id: input.stageRunId,
          },
        );
      }
      return { created: false, cycle: payload(existing) };
    }
    const now = new Date().toISOString();
    const state = initialStageQualityCycleState({
      stageRunId: input.stageRunId,
      qualityCycleId,
      maxRepairRounds: policy.formal_review.max_repair_rounds,
      scopeBudget: policy.formal_review.scope_budget,
    });
    db.prepare(`
      INSERT INTO stage_quality_cycles(
        quality_cycle_id, stage_run_id, domain_id, stage_id, policy_json, state_json,
        current_attempt_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      qualityCycleId,
      input.stageRunId,
      input.domainId,
      input.stageId,
      JSON.stringify(policy),
      JSON.stringify(state),
      now,
      now,
    );
    return { created: true, cycle: payload(getRow(db, qualityCycleId) as StageQualityCycleRow) };
  });
}

export function inspectStageQualityCycle(db: DatabaseSync, qualityCycleId: string) {
  const row = getRow(db, qualityCycleId);
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
      quality_cycle_id: qualityCycleId,
    });
  }
  return payload(row);
}

export function markStageQualityCycleCurrentAttempt(db: DatabaseSync, input: {
  qualityCycleId: string;
  attemptRef: string;
}) {
  return withQualityCycleMutation(db, () => {
    const row = getRow(db, input.qualityCycleId);
    if (!row) {
      throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
        quality_cycle_id: input.qualityCycleId,
      });
    }
    const stageRun = stageRunMutationAuthority(
      db,
      row.stage_run_id,
      'mark_stage_quality_cycle_current_attempt:stage_run',
    );
    const stageAttemptId = stageAttemptIdFromRef(input.attemptRef);
    requireCycleAttemptMutationAuthority({
      db,
      cycle: row,
      stageRunAdmission: stageRun.admission,
      stageAttemptId,
      operation: 'mark_stage_quality_cycle_current_attempt:attempt',
    });
    db.prepare(`
      UPDATE stage_quality_cycles SET current_attempt_ref = ?, updated_at = ? WHERE quality_cycle_id = ?
    `).run(input.attemptRef, new Date().toISOString(), input.qualityCycleId);
  });
}

function projectedCycleStatus(state: TemporalStageRunWorkflowState): StageQualityCycleState['status'] {
  if (state.status === 'completed') return 'passed';
  if (state.status === 'completed_with_quality_debt') return 'quality_debt';
  if (state.status === 'blocked' || state.status === 'human_gate' || state.status === 'failed') {
    return 'hard_stopped';
  }
  if (state.current_role === 'reviewer' || state.current_role === 're_reviewer') return 'awaiting_review';
  if (state.current_role === 'repairer') return 'awaiting_repair';
  return 'awaiting_producer';
}

export function projectTemporalStageRunQualityCycle(
  db: DatabaseSync,
  state: TemporalStageRunWorkflowState,
) {
  return withQualityCycleMutation(db, () => {
    const row = getRow(db, state.quality_cycle_id);
    if (!row) {
      throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
        quality_cycle_id: state.quality_cycle_id,
      });
    }
    const stageRun = stageRunMutationAuthority(
      db,
      row.stage_run_id,
      'project_temporal_stage_run_quality_cycle',
    );
    if (
      row.stage_run_id !== state.stage_run_id
      || row.domain_id !== state.domain_id
      || row.stage_id !== state.stage_id
      || stageRun.row.workflow_id !== state.workflow_id
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'Temporal StageRun quality projection identity mismatch.', {
        expected: {
          stage_run_id: row.stage_run_id,
          domain_id: row.domain_id,
          stage_id: row.stage_id,
          workflow_id: stageRun.row.workflow_id,
        },
        received: {
          stage_run_id: state.stage_run_id,
          domain_id: state.domain_id,
          stage_id: state.stage_id,
          workflow_id: state.workflow_id,
        },
      });
    }
    const projectedAttemptIds = state.attempts.map((attempt) => attempt.stage_attempt_id);
    if (
      projectedAttemptIds.some((stageAttemptId) => !stageAttemptId.trim() || stageAttemptId !== stageAttemptId.trim())
      || new Set(projectedAttemptIds).size !== projectedAttemptIds.length
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun Attempt summaries must contain unique canonical ids.',
        { failure_code: 'stage_quality_cycle_attempt_summary_duplicate' },
      );
    }
    const attemptIds = new Set(projectedAttemptIds);
    for (const attempt of state.attempts) {
      if (attempt.artifact_producer_attempt_ref) {
        attemptIds.add(stageAttemptIdFromRef(attempt.artifact_producer_attempt_ref));
      }
    }
    if (state.decisive_attempt_ref) attemptIds.add(stageAttemptIdFromRef(state.decisive_attempt_ref));
    if (state.source_attempt_ref) attemptIds.add(stageAttemptIdFromRef(state.source_attempt_ref));
    const reviewReceiptKeys = new Set<string>();
    for (const receipt of state.review_receipts) {
      if (receipt.stage_run_id !== row.stage_run_id || receipt.quality_cycle_id !== row.quality_cycle_id) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal StageRun review receipt does not match its durable quality cycle.',
          {
            failure_code: 'stage_quality_cycle_review_receipt_lineage_mismatch',
            quality_cycle_id: row.quality_cycle_id,
            stage_run_id: row.stage_run_id,
          },
        );
      }
      const receiptKey = `${receipt.producer_attempt_ref}\n${receipt.reviewer_attempt_ref}`;
      if (reviewReceiptKeys.has(receiptKey)) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal StageRun review receipts must be unique by Attempt pair.',
          { failure_code: 'stage_quality_cycle_review_receipt_duplicate' },
        );
      }
      reviewReceiptKeys.add(receiptKey);
      attemptIds.add(stageAttemptIdFromRef(receipt.producer_attempt_ref));
      attemptIds.add(stageAttemptIdFromRef(receipt.reviewer_attempt_ref));
    }
    if (state.next_stage_run_launch) {
      if (
        state.next_stage_run_launch.parent_stage_run_id !== row.stage_run_id
        || state.next_stage_run_launch.decisive_attempt_ref !== state.decisive_attempt_ref
      ) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal next StageRun launch receipt does not match its decisive Attempt lineage.',
          {
            failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch',
            quality_cycle_id: row.quality_cycle_id,
            stage_run_id: row.stage_run_id,
          },
        );
      }
      attemptIds.add(stageAttemptIdFromRef(state.next_stage_run_launch.decisive_attempt_ref));
    }
    const attemptAuthorities = new Map<string, Record<string, unknown>>();
    for (const stageAttemptId of attemptIds) {
      const authority = requireCycleAttemptMutationAuthority({
        db,
        cycle: row,
        stageRunAdmission: stageRun.admission,
        stageAttemptId,
        operation: 'project_temporal_stage_run_quality_cycle:attempt',
      });
      attemptAuthorities.set(stageAttemptId, authority.attempt);
    }
    for (const summary of state.attempts) {
      requireProjectedAttemptSummaryMatchesPersisted(
        summary,
        attemptAuthorities.get(summary.stage_attempt_id)!,
      );
      requireProjectedAttemptArtifactIdentityMatchesPersisted({
        db,
        summary,
        attempt: attemptAuthorities.get(summary.stage_attempt_id)!,
        attemptAuthorities,
      });
    }
    for (const receipt of state.review_receipts) {
      requireProjectedReviewReceiptMatchesPersisted(db, receipt);
    }
    const decisiveAttempt = state.decisive_attempt_ref
      ? attemptAuthorities.get(stageAttemptIdFromRef(state.decisive_attempt_ref))
      : null;
    if (
      (decisiveAttempt?.attempt_role ?? null) !== state.decisive_attempt_role
      || Boolean(state.decisive_attempt_ref) !== Boolean(state.decisive_attempt_role)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun decisive Attempt role does not match durable Attempt lineage.',
        { failure_code: 'stage_quality_cycle_decisive_attempt_mismatch' },
      );
    }
    if (state.next_stage_run_launch) {
      if (!decisiveAttempt) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Temporal next StageRun launch requires a durable decisive Attempt.',
          { failure_code: 'stage_quality_cycle_route_launch_lineage_mismatch' },
        );
      }
      requireProjectedRouteLaunchMatchesPersisted({
        db,
        receipt: state.next_stage_run_launch,
        selectedStageRoute: state.selected_stage_route,
        stageRun: stageRun.row,
        stageRunAdmission: stageRun.admission,
        decisiveAttempt,
      });
    }
    const projectedArtifactIdentity = {
      artifact_refs: state.artifact_refs,
      artifact_hashes: state.artifact_hashes,
      artifact_identity_receipt_refs: state.artifact_identity_receipt_refs,
    };
    const stageRunInput = persistedJsonRecord(stageRun.row.stage_run_input_json, {
      stageAttemptId: row.stage_run_id,
      field: 'stage_run_input_json',
    });
    const stageRunInputArtifactIdentity = {
      artifact_refs: exactStringArray(stageRunInput.artifact_refs, {
        stageAttemptId: row.stage_run_id,
        field: 'stage_run_input_json.artifact_refs',
      }),
      artifact_hashes: exactStringArray(stageRunInput.artifact_hashes, {
        stageAttemptId: row.stage_run_id,
        field: 'stage_run_input_json.artifact_hashes',
      }),
      artifact_identity_receipt_refs: exactStringArray(stageRunInput.artifact_identity_receipt_refs, {
        stageAttemptId: row.stage_run_id,
        field: 'stage_run_input_json.artifact_identity_receipt_refs',
      }),
    };
    const projectedArtifactIdentityIsBound = state.attempts.some((summary) => (
      canonicalJsonText({
        artifact_refs: summary.artifact_refs,
        artifact_hashes: summary.artifact_hashes,
        artifact_identity_receipt_refs: summary.artifact_identity_receipt_refs,
      }) === canonicalJsonText(projectedArtifactIdentity)
    )) || canonicalJsonText(stageRunInputArtifactIdentity) === canonicalJsonText(projectedArtifactIdentity);
    if (!projectedArtifactIdentityIsBound) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun selected artifact identity is not bound by a durable Attempt or StageRun input.',
        { failure_code: 'stage_quality_cycle_selected_artifact_identity_mismatch' },
      );
    }
    const projected: StageQualityCycleState & { controller_readback: Record<string, unknown> } = {
      ...parseState(row),
      quality_scope_budget: parsePolicy(row).formal_review.scope_budget,
      quality_scope_budget_usage: state.quality_scope_budget_usage ?? null,
      quality_scope_budget_stop_reason: state.quality_scope_budget_stop_reason ?? null,
      repair_rounds_used: state.repair_rounds_used,
      current_role: state.current_role,
      status: projectedCycleStatus(state),
      selected_artifact_refs: [...state.artifact_refs],
      quality_debt_refs: [...state.quality_debt_refs],
      controller_readback: {
        surface_kind: state.surface_kind,
        workflow_id: state.workflow_id,
        controller_status: state.status,
        artifact_hashes: [...state.artifact_hashes],
        artifact_identity_receipt_refs: [...state.artifact_identity_receipt_refs],
        attempts: state.attempts.map((attempt) => ({
          attempt_role: attempt.attempt_role,
          quality_round_index: attempt.quality_round_index,
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          execution_session_ref: attempt.execution_session_ref,
          status: attempt.status,
          total_tokens_observed: attempt.total_tokens_observed ?? null,
        })),
        quality_scope_budget: parsePolicy(row).formal_review.scope_budget,
        quality_scope_budget_usage: state.quality_scope_budget_usage ?? null,
        quality_scope_budget_stop_reason: state.quality_scope_budget_stop_reason ?? null,
        findings: state.findings,
        repair_map: state.repair_map,
        finding_closures: state.finding_closures,
        review_receipts: state.review_receipts,
        decisive_attempt_role: state.decisive_attempt_role,
        decisive_attempt_ref: state.decisive_attempt_ref,
        selected_stage_route: state.selected_stage_route,
        route_evidence_refs: state.route_evidence_refs,
        route_recommendations: state.route_recommendations,
        route_quality_debt_refs: state.route_quality_debt_refs,
        blocked_reason: state.blocked_reason,
        hard_stop_class: state.hard_stop_class ?? null,
        typed_blocker_refs: [...(state.typed_blocker_refs ?? [])],
        human_gate_refs: [...(state.human_gate_refs ?? [])],
        source_attempt_ref: state.source_attempt_ref ?? null,
      },
    };
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE stage_quality_cycles
      SET state_json = ?, current_attempt_ref = NULL, updated_at = ?
      WHERE quality_cycle_id = ?
    `).run(JSON.stringify(projected), now, state.quality_cycle_id);
    return inspectStageQualityCycle(db, state.quality_cycle_id);
  });
}
