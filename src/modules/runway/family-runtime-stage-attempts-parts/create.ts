import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import {
  buildStageAttemptProviderReceipt,
  resolveFamilyRuntimeProviderKind,
} from '../family-runtime-providers.ts';
import type {
  FamilyRuntimeDomainId,
  FamilyRuntimeProviderKind,
} from '../family-runtime-types.ts';
import {
  stageAttemptToPayload,
  type StageAttemptRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import { stableId } from '../../../kernel/stable-id.ts';
import {
  buildDuplicateTaskEnvelope,
  buildFamilyConflictSubject,
  normalizeStageQualityAttemptRole,
  normalizeStageQualityScopeBudget,
  type StageQualityAttemptRole,
} from '../../stagecraft/index.ts';
import { validateStageQualityAttemptContextManifest } from '../family-runtime-stage-quality-context-manifest.ts';
import {
  normalizeJsonList,
  normalizeStageId,
  nowIso,
} from './shared.ts';
import { taskRetryBudgetProjection } from '../family-runtime-queue-projection-boundary.ts';
import { requireStageQualityAttemptBoundary } from '../family-runtime-stage-quality-attempt-boundary.ts';
import type { WorkItemExecutionScopeSnapshot } from '../../workspace/index.ts';
import {
  assertRuntimeRowScopeMatchesWrite,
  normalizeRuntimeExecutionScopeWrite,
  persistRuntimeExecutionScope,
  requireRuntimeExecutionScopeMutationAllowed,
  type RuntimeExecutionScopeWriteKind,
} from '../family-runtime-execution-scope-persistence.ts';
import { requireNoActiveUnresolvedRuntimeIdentityConflict } from '../family-runtime-legacy-identity-admission.ts';
import { requireFamilyRuntimeExecutionScope } from '../family-runtime-execution-scope.ts';
export type StageAttemptCreateInput = {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  actionId?: string;
  providerKind?: FamilyRuntimeProviderKind;
  workspaceLocator: Record<string, unknown>;
  idempotencyWorkspaceLocator?: Record<string, unknown>;
  idempotencyBoundaryId?: string;
  sourceFingerprint?: string;
  executorKind?: string;
  stageAttemptExecutorPolicy?: Record<string, unknown> | null;
  scopeKind?: RuntimeExecutionScopeWriteKind;
  executionScope?: WorkItemExecutionScopeSnapshot | null;
  executorBindingRef?: string;
  invocationMode?: string;
  boundedEditRef?: string;
  taskId?: string;
  retryBudget?: Record<string, unknown>;
  checkpointRefs?: string[];
  closeoutRefs?: string[];
  humanGateRefs?: string[];
  routeImpact?: Record<string, unknown>;
  blockedReason?: string;
  launchContextObservation?: object;
  launchInvocation?: object;
  newAttempt?: boolean;
  start?: boolean;
  stageRunId?: string;
  qualityCycleId?: string;
  attemptRole?: StageQualityAttemptRole;
  qualityRoundIndex?: number;
  parentAttemptRef?: string;
  inputArtifactRefs?: string[];
  reviewedArtifactHashes?: string[];
  qualitySourceRefs?: string[];
  qualityStageGoalRefs?: string[];
  qualityLineageRefs?: string[];
  qualityRubricRefs?: string[];
  priorFindingRefs?: string[];
  repairMapRefs?: string[];
  qualityContext?: Record<string, unknown>;
  qualityRolePromptRef?: string;
  executionSessionRef?: string;
  contextManifestRef?: string;
  contextManifest?: Record<string, unknown>;
  noContextInheritance?: boolean;
};

function explicitStageAttemptIdempotencyKey(input: {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  providerKind?: FamilyRuntimeProviderKind;
  idempotencyBoundaryId?: string;
}) {
  if (input.idempotencyBoundaryId === undefined) return null;
  const boundaryId = input.idempotencyBoundaryId.trim();
  if (!boundaryId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageAttempt idempotency boundary id must be non-empty when provided.',
    );
  }
  return stableId('idem', [
    'explicit_attempt_boundary.v1',
    input.domainId,
    normalizedStageId(input.stageId),
    resolveFamilyRuntimeProviderKind(input.providerKind),
    boundaryId,
  ]);
}

function stageAttemptBaseIdempotencyKey(input: StageAttemptCreateInput) {
  const explicitKey = explicitStageAttemptIdempotencyKey(input);
  if (explicitKey) return explicitKey;
  return stableId('idem', [
    input.domainId,
    normalizedStageId(input.stageId),
    input.actionId?.trim() || null,
    resolveFamilyRuntimeProviderKind(input.providerKind),
    input.idempotencyWorkspaceLocator ?? input.workspaceLocator,
    input.sourceFingerprint?.trim() || null,
    input.stageAttemptExecutorPolicy ?? null,
    input.scopeKind ?? null,
    input.executionScope?.scope_digest ?? null,
    input.taskId?.trim() || null,
    input.stageRunId?.trim() || null,
    input.qualityCycleId?.trim() || null,
    input.attemptRole ?? null,
    input.qualityRoundIndex ?? null,
    input.parentAttemptRef?.trim() || null,
    normalizeJsonList(input.inputArtifactRefs),
    normalizeJsonList(input.reviewedArtifactHashes),
    normalizeJsonList(input.qualitySourceRefs),
    normalizeJsonList(input.qualityStageGoalRefs),
    normalizeJsonList(input.qualityLineageRefs),
    normalizeJsonList(input.qualityRubricRefs),
    normalizeJsonList(input.priorFindingRefs),
    normalizeJsonList(input.repairMapRefs),
    input.qualityContext ?? null,
    input.retryBudget ?? null,
    input.qualityRolePromptRef?.trim() || null,
    input.contextManifestRef?.trim() || null,
    input.contextManifest ?? null,
    input.noContextInheritance ?? null,
  ]);
}

export function findStageAttemptByIdempotencyBoundary(
  db: DatabaseSync,
  input: {
    domainId: FamilyRuntimeDomainId;
    stageId: string;
    providerKind?: FamilyRuntimeProviderKind;
    idempotencyBoundaryId: string;
  },
) {
  const idempotencyKey = explicitStageAttemptIdempotencyKey(input)!;
  const existing = db.prepare(`
    SELECT * FROM stage_attempts WHERE idempotency_key = ? ORDER BY created_at ASC LIMIT 1
  `).get(idempotencyKey) as StageAttemptRow | undefined;
  return existing ? stageAttemptToPayload(existing) : null;
}

export function findIdempotentStageAttempt(db: DatabaseSync, input: StageAttemptCreateInput) {
  if (input.newAttempt) return null;
  const idempotencyKey = stageAttemptBaseIdempotencyKey(input);
  const existing = db.prepare(`
    SELECT * FROM stage_attempts WHERE idempotency_key = ? ORDER BY created_at ASC LIMIT 1
  `).get(idempotencyKey) as StageAttemptRow | undefined;
  return existing ? stageAttemptToPayload(existing) : null;
}

function normalizedStageId(stageId: string) {
  try {
    return normalizeStageId(stageId);
  } catch {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt requires a non-empty stage id.', {
      required: ['--stage'],
    });
  }
}

function stageAttemptOrdinalForNewAttempt(
  db: DatabaseSync,
  input: {
    domainId: FamilyRuntimeDomainId;
    stageId: string;
    providerKind: FamilyRuntimeProviderKind;
    taskId: string | null;
  },
) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stage_attempts
    WHERE domain_id = ? AND stage_id = ? AND provider_kind = ?
      AND COALESCE(task_id, '') = COALESCE(?, '')
  `).get(input.domainId, input.stageId, input.providerKind, input.taskId) as { count: number };
  return row.count + 1;
}

function idempotentStageAttemptResult(existing: StageAttemptRow) {
  const attempt = stageAttemptToPayload(existing);
  return {
    created: false,
    idempotent_noop: true,
    attempt,
    conflict_or_blocker_envelopes: [
      buildDuplicateTaskEnvelope({
        subject: buildFamilyConflictSubject({
          domain: attempt.domain_id,
          stageId: attempt.stage_id,
          taskKind: attempt.stage_id,
          sourceFingerprint: attempt.source_fingerprint,
          idempotencyKey: attempt.idempotency_key,
          stageAttemptId: attempt.stage_attempt_id,
          taskId: attempt.task_id,
        }),
        existingAttemptRef: `opl://stage_attempts/${attempt.stage_attempt_id}`,
      }),
    ],
  };
}

function assertWorkItemStageRunScope(
  db: DatabaseSync,
  input: {
    domainId: string;
    stageId: string;
    stageRunId?: string;
    scope: ReturnType<typeof normalizeRuntimeExecutionScopeWrite>;
  },
) {
  const stageRunId = input.stageRunId?.trim();
  if (!stageRunId) {
    if (input.scope.columns.scope_kind === 'work_item') {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'New work-item scoped StageAttempt requires stageRunId.',
        { failure_code: 'work_item_stage_attempt_stage_run_missing' },
      );
    }
    return;
  }
  const table = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_run_launches'
  `).get();
  const stageRun = table
    ? db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?')
        .get(stageRunId) as Record<string, unknown> | undefined
    : undefined;
  if (!stageRun) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageAttempt with explicit StageRun lineage requires a registered StageRun.',
      {
        failure_code: input.scope.columns.scope_kind === 'work_item'
          ? 'work_item_stage_attempt_stage_run_unregistered'
          : 'stage_attempt_stage_run_unregistered',
        stage_run_id: stageRunId,
      },
    );
  }
  requireRuntimeExecutionScopeMutationAllowed(db, stageRun, 'create_stage_attempt:stage_run');
  const mismatches = [
    ['domain_id', input.domainId, stageRun.domain_id],
    ['stage_id', input.stageId, stageRun.stage_id],
    ['scope_kind', input.scope.columns.scope_kind, stageRun.scope_kind],
    ['scope_digest', input.scope.columns.scope_digest, stageRun.scope_digest],
    ['identity_state', 'resolved', stageRun.identity_state],
  ].flatMap(([field, expected, actual]) => expected === actual
    ? []
    : [{ field, expected, actual }]);
  if (mismatches.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageAttempt execution scope does not match its registered StageRun.',
      {
        failure_code: 'stage_attempt_stage_run_scope_mismatch',
        stage_run_id: stageRunId,
        mismatches,
      },
    );
  }
}

export function createStageAttempt(db: DatabaseSync, input: StageAttemptCreateInput) {
  const forbiddenAttemptSemantics = [
    'next_stage_refs', 'requires', 'ensures', 'stage_route', 'sub_stage_graph',
    'independent_owner', 'stage_current_pointer', 'stage_transition_authority',
  ].filter((field) => Object.hasOwn(input, field));
  if (forbiddenAttemptSemantics.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageAttempt cannot own Stage semantics or transition authority.',
      { forbidden_fields: forbiddenAttemptSemantics },
    );
  }
  const stageId = normalizedStageId(input.stageId);
  const providerKind = resolveFamilyRuntimeProviderKind(input.providerKind);
  const createdAt = nowIso();
  const sourceFingerprint = input.sourceFingerprint?.trim() || null;
  const executorKind = input.executorKind?.trim() || 'codex_cli';
  const stageAttemptExecutorPolicy = input.stageAttemptExecutorPolicy ?? null;
  const scope = normalizeRuntimeExecutionScopeWrite({
    domainId: input.domainId,
    scopeKind: input.scopeKind,
    executionScope: input.executionScope,
  });
  let retryBudget: Record<string, unknown> = input.retryBudget ?? taskRetryBudgetProjection(3);
  const taskId = input.taskId?.trim() || null;
  const attemptRole = input.attemptRole ? normalizeStageQualityAttemptRole(input.attemptRole) : null;
  if (attemptRole) {
    retryBudget = {
      ...retryBudget,
      quality_scope_budget: normalizeStageQualityScopeBudget(retryBudget['quality_scope_budget']),
    };
  }
  const qualityRoundIndex = input.qualityRoundIndex ?? (attemptRole ? 0 : null);
  if (qualityRoundIndex !== null && (!Number.isInteger(qualityRoundIndex) || qualityRoundIndex < 0)) {
    throw new FrameworkContractError('contract_shape_invalid', 'qualityRoundIndex must be a non-negative integer.');
  }
  const isolatedReviewRoles: StageQualityAttemptRole[] = [
    'reviewer', 're_reviewer',
  ];
  if (attemptRole && !input.stageRunId?.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Quality-cycle StageAttempt requires stageRunId.');
  }
  if (attemptRole && !input.qualityCycleId?.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Quality-cycle StageAttempt requires qualityCycleId.');
  }
  let parentAttemptLineage: { stage_run_id: string; quality_cycle_id: string } | null = null;
  let parentAttemptId: string | null = null;
  if (attemptRole === 'producer') {
    if (qualityRoundIndex !== 0 || input.parentAttemptRef) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Producer StageAttempt must be round zero without a parent Attempt.',
      );
    }
  } else if (attemptRole) {
    const expectedRound = attemptRole === 'reviewer'
      ? qualityRoundIndex === 0
      : Number(qualityRoundIndex) >= 1 && Number(qualityRoundIndex) <= 3;
    if (!expectedRound || !input.parentAttemptRef?.trim()) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Quality-cycle child Attempt role, round, and parent lineage are inconsistent.',
        { attempt_role: attemptRole, quality_round_index: qualityRoundIndex },
      );
    }
    parentAttemptId = input.parentAttemptRef.startsWith('opl://stage_attempts/')
      ? input.parentAttemptRef.slice('opl://stage_attempts/'.length)
      : '';
    const parent = parentAttemptId
      ? db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(parentAttemptId) as StageAttemptRow | undefined
      : undefined;
    if (
      !parent
      || parent.stage_run_id !== input.stageRunId?.trim()
      || parent.quality_cycle_id !== input.qualityCycleId?.trim()
      || parent.domain_id !== input.domainId
      || parent.stage_id !== stageId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Parent StageAttempt must be persisted under the same domain, Stage, StageRun, and quality cycle.',
        { parent_attempt_ref: input.parentAttemptRef },
      );
    }
    requireRuntimeExecutionScopeMutationAllowed(
      db,
      parent as unknown as Record<string, unknown>,
      'create_stage_attempt:parent_attempt',
    );
    parentAttemptLineage = {
      stage_run_id: parent.stage_run_id!,
      quality_cycle_id: parent.quality_cycle_id!,
    };
    const parentRole = parent.attempt_role ? normalizeStageQualityAttemptRole(parent.attempt_role) : null;
    const parentRound = parent.quality_round_index;
    const validParentTopology = (
      attemptRole === 'reviewer'
      && qualityRoundIndex === 0
      && parentRole === 'producer'
      && parentRound === 0
    ) || (
      attemptRole === 'repairer'
      && qualityRoundIndex === 1
      && parentRole === 'reviewer'
      && parentRound === 0
    ) || (
      attemptRole === 'repairer'
      && Number(qualityRoundIndex) >= 2
      && parentRole === 're_reviewer'
      && parentRound === Number(qualityRoundIndex) - 1
    ) || (
      attemptRole === 're_reviewer'
      && parentRole === 'repairer'
      && parentRound === qualityRoundIndex
    );
    if (!validParentTopology) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Quality-cycle child Attempt parent role and round do not match the bounded controller topology.',
        {
          attempt_role: attemptRole,
          quality_round_index: qualityRoundIndex,
          parent_attempt_role: parentRole,
          parent_quality_round_index: parentRound,
        },
      );
    }
  }
  if (attemptRole) {
    if (
      input.noContextInheritance !== true
      || !input.contextManifestRef?.trim()
      || !input.qualityRolePromptRef?.trim()
      || normalizeJsonList(input.qualityRubricRefs).length === 0
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Quality-cycle StageAttempt requires a fresh isolated context, role prompt, and quality rubric.',
        { attempt_role: attemptRole },
      );
    }
    validateStageQualityAttemptContextManifest({
      attemptRole,
      stageRunId: input.stageRunId!,
      qualityCycleId: input.qualityCycleId!,
      artifactRefs: input.inputArtifactRefs,
      artifactHashes: input.reviewedArtifactHashes,
      stageGoalRefs: input.qualityStageGoalRefs,
      sourceRefs: input.qualitySourceRefs,
      lineageRefs: input.qualityLineageRefs,
      priorFindingRefs: input.priorFindingRefs,
      repairMapRefs: input.repairMapRefs,
      rubricRefs: input.qualityRubricRefs ?? [],
      contextManifestRef: input.contextManifestRef!,
      contextManifest: input.contextManifest,
    });
  }
  if (attemptRole && isolatedReviewRoles.includes(attemptRole)) {
    if (normalizeJsonList(input.inputArtifactRefs).length === 0 || normalizeJsonList(input.reviewedArtifactHashes).length === 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Formal review StageAttempt requires exact artifact refs and hashes.');
    }
  }
  if (attemptRole === 'repairer' && normalizeJsonList(input.priorFindingRefs).length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Repairer StageAttempt requires prior finding refs.');
  }
  if (
    attemptRole === 're_reviewer'
    && (
      normalizeJsonList(input.priorFindingRefs).length === 0
      || normalizeJsonList(input.repairMapRefs).length === 0
    )
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-reviewer StageAttempt requires prior finding and repair map refs.',
    );
  }
  if (attemptRole) {
    requireStageQualityAttemptBoundary({
      attempt_role: attemptRole,
      quality_round_index: qualityRoundIndex,
      stage_run_id: input.stageRunId,
      quality_cycle_id: input.qualityCycleId,
      parent_attempt_ref: input.parentAttemptRef ?? null,
      parent_attempt_lineage: parentAttemptLineage,
      input_artifact_refs: input.inputArtifactRefs ?? [],
      reviewed_artifact_hashes: input.reviewedArtifactHashes ?? [],
      quality_source_refs: input.qualitySourceRefs ?? [],
      quality_rubric_refs: input.qualityRubricRefs ?? [],
      prior_finding_refs: input.priorFindingRefs ?? [],
      repair_map_refs: input.repairMapRefs ?? [],
      quality_role_prompt_ref: input.qualityRolePromptRef,
      context_manifest_ref: input.contextManifestRef,
      no_context_inheritance: input.noContextInheritance,
      role_overlay: input.stageAttemptExecutorPolicy ?? {},
      quality_context: input.qualityContext ?? {},
    });
  }
  const baseIdempotencyKey = stageAttemptBaseIdempotencyKey(input);
  const newAttemptOrdinal = input.newAttempt
    ? stageAttemptOrdinalForNewAttempt(db, {
        domainId: input.domainId,
        stageId,
        providerKind,
        taskId,
      })
    : null;
  const idempotencyKey = input.newAttempt
    ? stableId('idem', [baseIdempotencyKey, 'new_attempt', newAttemptOrdinal])
    : baseIdempotencyKey;
  if (!input.newAttempt) {
    const existing = db.prepare(`
      SELECT * FROM stage_attempts WHERE idempotency_key = ? ORDER BY created_at ASC LIMIT 1
    `).get(idempotencyKey) as StageAttemptRow | undefined;
    if (existing) {
      requireRuntimeExecutionScopeMutationAllowed(
        db,
        existing as unknown as Record<string, unknown>,
        'create_stage_attempt:idempotent_existing_attempt',
      );
      assertRuntimeRowScopeMatchesWrite(existing, scope, {
        stage_attempt_id: existing.stage_attempt_id,
        idempotency_key: idempotencyKey,
      });
      return idempotentStageAttemptResult(existing);
    }
  }
  const stageAttemptId = input.idempotencyBoundaryId && !input.newAttempt
    ? stableId('sat', ['explicit_attempt_boundary.v1', idempotencyKey])
    : stableId('sat', [
        input.domainId,
        stageId,
        input.actionId?.trim() || null,
        providerKind,
        input.workspaceLocator,
        sourceFingerprint,
        stageAttemptExecutorPolicy,
        input.taskId ?? null,
        input.stageRunId?.trim() || null,
        input.qualityCycleId?.trim() || null,
        attemptRole,
        qualityRoundIndex,
        input.parentAttemptRef?.trim() || null,
        input.newAttempt ? newAttemptOrdinal : createdAt,
      ]);
  const workflowId = stableId('wf', [input.domainId, stageId, stageAttemptId]);
  const workspaceLocator = scope.executionScope
    ? { ...input.workspaceLocator, execution_scope: scope.executionScope }
    : input.workspaceLocator;
  requireFamilyRuntimeExecutionScope({
    scopeKind: scope.columns.scope_kind,
    executionScope: scope.executionScope,
    workspaceLocator,
    domainId: input.domainId,
    operation: 'create_stage_attempt:workspace_locator',
  });
  if (
    scope.executionScope
    && !(
      (typeof workspaceLocator.workspace_root === 'string' && workspaceLocator.workspace_root.trim())
      || (typeof workspaceLocator.repo_root === 'string' && workspaceLocator.repo_root.trim())
    )
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Work-item StageAttempt workspace locator requires its canonical workspace root.',
      { failure_code: 'execution_scope_workspace_root_missing' },
    );
  }
  const providerReceipt = buildStageAttemptProviderReceipt({
    providerKind,
    stageAttemptId,
    workflowId,
  });
  const providerRun = {
    provider_kind: providerKind,
    workflow_id: workflowId,
    namespace: providerKind === 'temporal' ? process.env.OPL_TEMPORAL_NAMESPACE?.trim() || 'default' : null,
    task_queue: providerKind === 'temporal' ? process.env.OPL_TEMPORAL_TASK_QUEUE?.trim() || 'opl-stage-attempts' : null,
    provider_status: 'registered',
    started_at: null,
    completed_at: null,
    last_heartbeat_at: null,
  };
  const initialActivityEvents: Record<string, unknown>[] = input.launchContextObservation
    ? [{
        event_kind: 'stage_context_observed',
        event_time: createdAt,
        observation: input.launchContextObservation,
      }]
    : [];
  if (input.launchInvocation) {
    initialActivityEvents.push({
      event_kind: 'stage_launch_invocation',
      event_time: createdAt,
      invocation: input.launchInvocation,
    });
  }
  const row = {
    stage_attempt_id: stageAttemptId,
    idempotency_key: idempotencyKey,
    provider_kind: providerKind,
    workflow_id: workflowId,
    domain_id: input.domainId,
    stage_id: stageId,
    workspace_locator_json: JSON.stringify(workspaceLocator),
    source_fingerprint: sourceFingerprint,
    executor_kind: executorKind,
    stage_attempt_executor_policy_json: stageAttemptExecutorPolicy
      ? JSON.stringify(stageAttemptExecutorPolicy)
      : null,
    stage_run_id: input.stageRunId?.trim() || null,
    ...scope.columns,
    quality_cycle_id: input.qualityCycleId?.trim() || null,
    attempt_role: attemptRole,
    quality_round_index: qualityRoundIndex,
    parent_attempt_ref: input.parentAttemptRef?.trim() || null,
    input_artifact_refs_json: JSON.stringify(normalizeJsonList(input.inputArtifactRefs)),
    reviewed_artifact_hashes_json: JSON.stringify(normalizeJsonList(input.reviewedArtifactHashes)),
    quality_source_refs_json: JSON.stringify(normalizeJsonList(input.qualitySourceRefs)),
    quality_stage_goal_refs_json: JSON.stringify(normalizeJsonList(input.qualityStageGoalRefs)),
    quality_lineage_refs_json: JSON.stringify(normalizeJsonList(input.qualityLineageRefs)),
    quality_rubric_refs_json: JSON.stringify(normalizeJsonList(input.qualityRubricRefs)),
    prior_finding_refs_json: JSON.stringify(normalizeJsonList(input.priorFindingRefs)),
    repair_map_refs_json: JSON.stringify(normalizeJsonList(input.repairMapRefs)),
    quality_context_json: JSON.stringify(input.qualityContext ?? {}),
    quality_role_prompt_ref: input.qualityRolePromptRef?.trim() || null,
    execution_session_ref: input.executionSessionRef?.trim() || null,
    usage_observation_json: null,
    context_manifest_ref: input.contextManifestRef?.trim() || null,
    context_manifest_json: input.contextManifest ? JSON.stringify(input.contextManifest) : null,
    no_context_inheritance: input.noContextInheritance === undefined
      ? null
      : input.noContextInheritance ? 1 : 0,
    status: input.blockedReason ? 'blocked' : 'queued',
    checkpoint_refs_json: JSON.stringify(normalizeJsonList(input.checkpointRefs)),
    closeout_refs_json: JSON.stringify(normalizeJsonList(input.closeoutRefs)),
    human_gate_refs_json: JSON.stringify(normalizeJsonList(input.humanGateRefs)),
    retry_budget_json: JSON.stringify(retryBudget),
    attempt_count: 0,
    task_id: taskId,
    blocked_reason: input.blockedReason?.trim() || null,
    provider_receipt_json: JSON.stringify(providerReceipt),
    provider_run_json: JSON.stringify(providerRun),
    activity_events_json: JSON.stringify(initialActivityEvents),
    route_impact_json: JSON.stringify(input.routeImpact ?? {}),
    closeout_receipt_status: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    requireNoActiveUnresolvedRuntimeIdentityConflict({
      db,
      domainId: input.domainId,
      stageId,
      executionScope: scope.executionScope,
      operation: 'create_stage_attempt',
      candidateStageRunId: input.stageRunId?.trim() || null,
      candidateStageAttemptId: stageAttemptId,
    });
    persistRuntimeExecutionScope(db, scope, input.domainId);
    assertWorkItemStageRunScope(db, {
      domainId: input.domainId,
      stageId,
      stageRunId: input.stageRunId,
      scope,
    });
    if (parentAttemptId) {
      const persistedParent = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
        parentAttemptId,
      ) as StageAttemptRow | undefined;
      if (
        !persistedParent
        || persistedParent.stage_run_id !== input.stageRunId?.trim()
        || persistedParent.quality_cycle_id !== input.qualityCycleId?.trim()
        || persistedParent.domain_id !== input.domainId
        || persistedParent.stage_id !== stageId
      ) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Parent StageAttempt lineage changed before child Attempt persistence.',
          {
            failure_code: 'stage_attempt_parent_lineage_changed',
            parent_attempt_ref: input.parentAttemptRef,
          },
        );
      }
      requireRuntimeExecutionScopeMutationAllowed(
        db,
        persistedParent as unknown as Record<string, unknown>,
        'create_stage_attempt:parent_attempt_recheck',
      );
    }
    db.prepare(`
      INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id, workspace_locator_json,
      source_fingerprint, executor_kind, stage_attempt_executor_policy_json, stage_run_id,
      scope_kind, project_scope_id, work_item_scope_id, workspace_binding_id, binding_version_id,
      scope_digest, execution_scope_json, identity_state, quality_cycle_id,
      attempt_role, quality_round_index, parent_attempt_ref, input_artifact_refs_json, reviewed_artifact_hashes_json,
      quality_source_refs_json, quality_stage_goal_refs_json, quality_lineage_refs_json,
      quality_rubric_refs_json, prior_finding_refs_json, repair_map_refs_json, quality_context_json,
      quality_role_prompt_ref,
      execution_session_ref, usage_observation_json, context_manifest_ref, context_manifest_json, no_context_inheritance, status, checkpoint_refs_json, closeout_refs_json,
      human_gate_refs_json, retry_budget_json, attempt_count, task_id, blocked_reason,
      provider_receipt_json, provider_run_json, activity_events_json, route_impact_json,
      closeout_receipt_status, created_at, updated_at
    )
      VALUES (
      @stage_attempt_id, @idempotency_key, @provider_kind, @workflow_id, @domain_id, @stage_id, @workspace_locator_json,
      @source_fingerprint, @executor_kind, @stage_attempt_executor_policy_json, @stage_run_id,
      @scope_kind, @project_scope_id, @work_item_scope_id, @workspace_binding_id, @binding_version_id,
      @scope_digest, @execution_scope_json, @identity_state, @quality_cycle_id,
      @attempt_role, @quality_round_index, @parent_attempt_ref, @input_artifact_refs_json, @reviewed_artifact_hashes_json,
      @quality_source_refs_json, @quality_stage_goal_refs_json, @quality_lineage_refs_json,
      @quality_rubric_refs_json, @prior_finding_refs_json, @repair_map_refs_json, @quality_context_json,
      @quality_role_prompt_ref,
      @execution_session_ref, @usage_observation_json, @context_manifest_ref, @context_manifest_json, @no_context_inheritance, @status, @checkpoint_refs_json, @closeout_refs_json,
      @human_gate_refs_json, @retry_budget_json, @attempt_count, @task_id, @blocked_reason,
      @provider_receipt_json, @provider_run_json, @activity_events_json, @route_impact_json,
      @closeout_receipt_status, @created_at, @updated_at
      )
    `).run(row);
    if (ownsTransaction) db.exec('COMMIT');
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    if (input.idempotencyBoundaryId && !input.newAttempt) {
      const existing = db.prepare(`
        SELECT * FROM stage_attempts WHERE stage_attempt_id = ? AND idempotency_key = ? LIMIT 1
      `).get(stageAttemptId, idempotencyKey) as StageAttemptRow | undefined;
      if (existing) {
        requireRuntimeExecutionScopeMutationAllowed(
          db,
          existing as unknown as Record<string, unknown>,
          'create_stage_attempt:conflict_existing_attempt',
        );
        assertRuntimeRowScopeMatchesWrite(existing, scope, {
          stage_attempt_id: existing.stage_attempt_id,
          idempotency_key: idempotencyKey,
        });
        return idempotentStageAttemptResult(existing);
      }
    }
    throw error;
  }
  return {
    created: true,
    idempotent_noop: false,
    attempt: stageAttemptToPayload(row as StageAttemptRow),
  };
}
