import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import type {
  CordisPackStageBindingService,
  resolveStandardAgentStageQualityRuntimeBinding,
} from '../../../authority/packages/index.ts';
import type { CordisStagecraftContextService } from '../../../authority/stages/index.ts';
import {
  inspectStageAttempt,
  listStageAttemptsForTask,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../family-runtime-stage-attempts.ts';
import { queryTemporalStageAttemptReadModel } from '../family-runtime-temporal-query.ts';
import {
  familyRuntimePaths,
} from '../family-runtime-store.ts';
import { readManagedProviderProjectionSummary } from '../family-runtime-managed-provider-projection.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from '../family-runtime-execution-scope-persistence.ts';
import { ensureFamilyRuntimePackageLaunchReady } from '../family-runtime-package-readiness.ts';
import { launchRegisteredStageRun } from '../family-runtime-stage-run-launch.ts';
import { canonicalStageRunSha256 } from '../family-runtime-stage-run-identity-parts/content-bindings.ts';
import {
  buildCliStageRunInvocationId,
  stageRunWorkspaceIdentity,
} from '../family-runtime-stage-run-identity.ts';

type FamilyRuntimeAttemptStageRuntime = {
  ensurePackageLaunchReady?: typeof ensureFamilyRuntimePackageLaunchReady;
  resolveStageBinding?: typeof resolveStandardAgentStageQualityRuntimeBinding;
  startWorkflow?: (
    input: Parameters<typeof launchRegisteredStageRun>[0]['stageRunInput'],
    context: { paths: ReturnType<typeof familyRuntimePaths> },
  ) => Promise<Record<string, unknown>>;
  describeWorkflow?: (
    input: Parameters<typeof launchRegisteredStageRun>[0]['stageRunInput'],
    context: { paths: ReturnType<typeof familyRuntimePaths> },
  ) => Promise<Record<string, unknown>>;
  cancelWorkflow?: (
    input: {
      attempt: ReturnType<typeof inspectStageAttempt>;
      reason: string;
      source?: string;
    },
    context: { paths: ReturnType<typeof familyRuntimePaths> },
  ) => Promise<Record<string, unknown>>;
};

export type FamilyRuntimeAttemptCommandContext = {
  db: DatabaseSync;
  paths: ReturnType<typeof familyRuntimePaths>;
  stageRunRuntime?: FamilyRuntimeAttemptStageRuntime;
  getCordisPackStagecraft: () => Promise<{
    stageBinding: CordisPackStageBindingService;
    stageContext: CordisStagecraftContextService;
  }>;
  managedProviderProjection: () => ReturnType<typeof readManagedProviderProjectionSummary>;
};

export async function temporalProviderModule() {
  return await import('../family-runtime-temporal-provider.ts');
}

export function parsedRuntimeRecord(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = parseJsonText(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function rawStageAttemptMutationAuthority(
  db: DatabaseSync,
  stageAttemptId: string,
  operation: string,
) {
  const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    stageAttemptId,
  ) as Record<string, unknown> | undefined;
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt not found.', {
      stage_attempt_id: stageAttemptId,
      operation,
    });
  }
  requireRuntimeExecutionScopeMutationAllowed(db, row, operation);
  return row;
}

export function stageAttemptAllowsRuntimeRefresh(
  db: DatabaseSync,
  stageAttemptId: string,
  operation: string,
) {
  try {
    rawStageAttemptMutationAuthority(db, stageAttemptId, operation);
    return true;
  } catch (error) {
    if (
      error instanceof FrameworkContractError
      && error.details?.failure_code === 'runtime_execution_identity_unresolved'
    ) {
      return false;
    }
    throw error;
  }
}

export function runtimeRowWorkspaceRoot(row: Record<string, unknown>) {
  const locator = parsedRuntimeRecord(row.workspace_locator_json);
  if (locator) {
    return typeof locator.workspace_root === 'string'
      ? locator.workspace_root.trim()
      : typeof locator.repo_root === 'string'
        ? locator.repo_root.trim()
        : null;
  }
  const stageRunInput = parsedRuntimeRecord(row.stage_run_input_json);
  const stageRunLocator = isRecord(stageRunInput?.workspace_locator)
    ? stageRunInput.workspace_locator
    : null;
  return typeof stageRunLocator?.workspace_root === 'string'
    ? stageRunLocator.workspace_root.trim()
    : typeof stageRunLocator?.repo_root === 'string'
      ? stageRunLocator.repo_root.trim()
      : null;
}

export function requireCurrentRuntimeRowsBeforeLaunchSideEffects(input: {
  db: DatabaseSync;
  domainId: string;
  stageId: string;
  workspaceRoot: string | null;
  operation: string;
}) {
  for (const table of ['stage_attempts', 'stage_run_launches'] as const) {
    const exists = input.db.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
    ).get(table);
    if (!exists) continue;
    const statusPredicate = table === 'stage_attempts'
      ? "status NOT IN ('completed', 'failed', 'dead_lettered') AND archived_at IS NULL"
      : "launch_status <> 'closed'";
    const rows = input.db.prepare(`
      SELECT * FROM ${table}
      WHERE domain_id = ? AND stage_id = ? AND ${statusPredicate}
    `).all(input.domainId, input.stageId) as Record<string, unknown>[];
    for (const row of rows) {
      try {
        const admission = requireRuntimeExecutionScopeMutationAllowed(input.db, row, input.operation);
        const rowWorkspaceRoot = admission.executionScope?.workspace_root ?? runtimeRowWorkspaceRoot(row);
        if (input.workspaceRoot && rowWorkspaceRoot && rowWorkspaceRoot !== input.workspaceRoot) continue;
      } catch (error) {
        if (
          error instanceof FrameworkContractError
          && error.details?.failure_code === 'runtime_execution_identity_unresolved'
        ) {
          const rowWorkspaceRoot = typeof error.details.workspace_root === 'string'
            ? error.details.workspace_root
            : null;
          if (input.workspaceRoot && !rowWorkspaceRoot) continue;
          if (input.workspaceRoot && rowWorkspaceRoot && rowWorkspaceRoot !== input.workspaceRoot) continue;
        }
        throw error;
      }
    }
  }
}

export function stageRunReplayBusinessIdentity(
  input: Parameters<typeof launchRegisteredStageRun>[0]['stageRunInput'],
) {
  const spec = input.stage_run_spec;
  return {
    scope_kind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
    execution_scope: input.execution_scope ?? null,
    domain_id: spec.domain_id,
    stage_id: spec.stage_id,
    action_id: spec.action_id,
    task_id: spec.task_id,
    workspace_identity: stageRunWorkspaceIdentity(spec.workspace_identity),
    source_fingerprint: spec.source_fingerprint,
    input_artifacts: spec.input_artifacts,
    executor_kind: spec.executor_kind,
    stage_attempt_executor_policy: spec.stage_attempt_executor_policy,
    parent_route_decision_ref: spec.parent_route_decision_ref,
    checkpoint_refs: spec.checkpoint_refs.filter((ref) => ref !== spec.stage_packet_ref),
  };
}

export function normalizedReplayStringList(values: unknown) {
  return Array.isArray(values)
    ? [...new Set(values
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => value.trim()))]
    : [];
}

export function stageRunReplayRequestBusinessIdentity(input: {
  domainId: Parameters<typeof buildCliStageRunInvocationId>[0]['domainId'];
  stageId: string;
  actionId?: string;
  taskId?: string;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint?: string;
  executorKind?: string;
  executorBindingRef?: string;
  invocationMode?: string;
  boundedEditRef?: string;
  reviewLane?: string;
  parentRouteDecisionRef?: string;
  checkpointRefs?: string[];
  inputArtifactRefs?: string[];
  inputArtifactHashes?: string[];
  scopeKind?: 'work_item' | 'domain' | 'system';
  executionScope?: Record<string, unknown> | null;
}) {
  const artifactRefs = Array.isArray(input.inputArtifactRefs)
    ? input.inputArtifactRefs
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => value.trim())
    : [];
  const artifactHashes = input.inputArtifactHashes ?? [];
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable input artifact refs and hashes must have equal cardinality.',
      { artifact_ref_count: artifactRefs.length, artifact_hash_count: artifactHashes.length },
    );
  }
  const artifactIndex = new Map<string, { sha256: string; identity_receipt_ref: null }>();
  artifactRefs.forEach((ref, index) => {
    const artifact = {
      sha256: canonicalStageRunSha256(artifactHashes[index], `input_artifact_hashes[${index}]`),
      identity_receipt_ref: null,
    };
    const existing = artifactIndex.get(ref);
    if (existing && existing.sha256 !== artifact.sha256) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'One StageRun input artifact ref cannot be bound to conflicting hashes or receipts.',
        {
          artifact_ref: ref,
          existing_sha256: existing.sha256,
          received_sha256: artifact.sha256,
        },
      );
    }
    artifactIndex.set(ref, artifact);
  });
  const inputArtifacts = [...artifactIndex.entries()]
    .map(([ref, artifact]) => ({ ref, ...artifact }))
    .sort((left, right) => left.ref.localeCompare(right.ref) || left.sha256.localeCompare(right.sha256));
  const checkpointRefs = normalizedReplayStringList(input.checkpointRefs);
  const stagePacketRef = checkpointRefs[0] ?? null;
  const stageAttemptExecutorPolicy = {
    ...(input.executorBindingRef ? { executor_binding_ref: input.executorBindingRef } : {}),
    ...(input.invocationMode ? { invocation_mode: input.invocationMode } : {}),
    ...(input.boundedEditRef ? { bounded_edit_ref: input.boundedEditRef } : {}),
    ...(input.reviewLane ? { review_lane_binding: input.reviewLane } : {}),
  };
  return {
    scope_kind: input.scopeKind ?? (input.executionScope ? 'work_item' : 'domain'),
    execution_scope: input.executionScope ?? null,
    domain_id: input.domainId,
    stage_id: input.stageId.trim(),
    action_id: input.actionId?.trim() || null,
    task_id: input.taskId?.trim() || null,
    workspace_identity: stageRunWorkspaceIdentity(input.workspaceLocator),
    source_fingerprint: input.sourceFingerprint?.trim()
      ? canonicalStageRunSha256(input.sourceFingerprint, 'source_fingerprint')
      : null,
    input_artifacts: inputArtifacts,
    executor_kind: input.executorKind?.trim() || 'codex_cli',
    stage_attempt_executor_policy: stageAttemptExecutorPolicy,
    parent_route_decision_ref: input.parentRouteDecisionRef?.trim() || null,
    checkpoint_refs: stagePacketRef
      ? checkpointRefs.filter((ref) => ref !== stagePacketRef)
      : checkpointRefs,
  };
}

export async function syncTemporalStageAttemptsForTask(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  taskId: string,
) {
  const attempts = listStageAttemptsForTask(db, taskId).filter((attempt) => attempt.provider_kind === 'temporal');
  for (const attempt of attempts) {
    if (attempt.status === 'completed' && attempt.closeout_receipt_status) {
      continue;
    }
    if (!stageAttemptAllowsRuntimeRefresh(
      db,
      attempt.stage_attempt_id,
      'sync_temporal_stage_attempts_for_task',
    )) {
      continue;
    }
    const temporalQuery = await queryTemporalStageAttemptReadModel(attempt, { paths });
    syncStageAttemptFromTemporalTerminalObservation(db, temporalQuery);
  }
}
