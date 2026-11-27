import {
  LEDGER_ENTRY_KINDS,
  type LedgerEntryKind,
  type RecordReviewInput,
  type ReviewVerdictValue,
} from '@opl/ledger';
import { DaemonRpcError } from '../../errors.ts';
import type { RpcHandler } from '../../server/socket-server.ts';
import type { DaemonRuntime } from '../../state/runtime.ts';
import {
  pickBoolean,
  pickNumber,
  pickRecord,
  pickString,
  pickStringArray,
} from '../../utils/normalize.ts';

export function registerLedgerRoutes(handlers: Map<string, RpcHandler>, runtime: DaemonRuntime): void {
  // ledger.* is append-only; NEVER expose update/delete.
  handlers.set('ledger.append', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const attemptId = pickString(params, 'attempt_id', 'attemptId');
    const entryKind = pickString(params, 'entry_kind', 'entryKind') ?? '';
    const ownerId = pickString(params, 'owner_id', 'ownerId') ?? '';
    const payload = pickRecord(params, 'payload');
    const entryId = pickString(params, 'entry_id', 'entryId');
    const createdAt = pickString(params, 'created_at', 'createdAt');

    if (!LEDGER_ENTRY_KINDS.includes(entryKind as LedgerEntryKind)) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', `Unsupported ledger entry_kind '${entryKind}'.`);
    }
    if (!payload) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.append requires payload object.');
    }

    return runtime.ledgerStore.append({
      ...(entryId ? { entry_id: entryId } : {}),
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
      ...(attemptId ? { attempt_id: attemptId } : {}),
      entry_kind: entryKind as LedgerEntryKind,
      owner_id: ownerId,
      payload: payload as never,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
  });

  handlers.set('ledger.timeline', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId');
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const attemptId = pickString(params, 'attempt_id', 'attemptId');
    const ownerId = pickString(params, 'owner_id', 'ownerId');
    const entryKind = pickString(params, 'entry_kind', 'entryKind') as LedgerEntryKind | undefined;
    const since = pickString(params, 'since');
    const limit = pickNumber(params, 'limit');
    const offset = pickNumber(params, 'offset');
    const order = pickString(params, 'order') as 'asc' | 'desc' | undefined;
    const entries = runtime.ledgerStore.timeline({
      ...(taskId ? { task_id: taskId } : {}),
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
      ...(attemptId ? { attempt_id: attemptId } : {}),
      ...(ownerId ? { owner_id: ownerId } : {}),
      ...(entryKind ? { entry_kind: entryKind } : {}),
      ...(since ? { since } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(order ? { order } : {}),
    });
    return {
      task_id: taskId ?? null,
      entries,
      timeline: entries,
    };
  });

  handlers.set('ledger.artifacts', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.artifacts requires task_id.');
    }
    const artifacts = runtime.ledgerStore.artifacts({
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
    });
    return { task_id: taskId, artifacts, entries: artifacts };
  });

  handlers.set('ledger.receipts', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.receipts requires task_id.');
    }
    const receipts = runtime.ledgerStore.receipts({
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
    });
    return { task_id: taskId, receipts, entries: receipts };
  });

  handlers.set('ledger.debts', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const unresolvedOnly = pickBoolean(params, 'unresolved_only', 'unresolvedOnly');
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.debts requires task_id.');
    }
    const debts = runtime.ledgerStore.debts({
      task_id: taskId,
      ...(unresolvedOnly !== undefined ? { unresolved_only: unresolvedOnly } : {}),
    });
    return { task_id: taskId, debts, entries: debts };
  });

  handlers.set('ledger.review.record', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    const stageRunId = pickString(params, 'stage_run_id', 'stageRunId');
    const attemptId = pickString(params, 'attempt_id', 'attemptId');
    const ownerId = pickString(params, 'owner_id', 'ownerId') ?? '';
    const verdict = pickString(params, 'verdict') as ReviewVerdictValue | undefined;
    const reviewerId = pickString(params, 'reviewer_id', 'reviewerId');
    const reviewerRole = pickString(params, 'reviewer_role', 'reviewerRole');
    const reviewedArtifactRefs = pickStringArray(params, 'reviewed_artifact_refs', 'reviewedArtifactRefs');
    const verifiedHashes = pickStringArray(params, 'verified_hashes', 'verifiedHashes');
    const findingRefs = pickStringArray(params, 'finding_refs', 'findingRefs');
    const qualityDebtIds = pickStringArray(params, 'quality_debt_ids', 'qualityDebtIds');
    const hardStopClass = pickString(params, 'hard_stop_class', 'hardStopClass');
    const summary = pickString(params, 'summary');

    if (!taskId || !ownerId || !verdict) {
      throw new DaemonRpcError(
        -32602,
        'INVALID_LEDGER_INPUT',
        'ledger.review.record requires task_id, owner_id, and verdict.',
      );
    }

    return runtime.ledgerStore.recordReview({
      task_id: taskId,
      ...(stageRunId ? { stage_run_id: stageRunId } : {}),
      ...(attemptId ? { attempt_id: attemptId } : {}),
      owner_id: ownerId,
      verdict,
      ...(reviewerId ? { reviewer_id: reviewerId } : {}),
      ...(reviewerRole ? { reviewer_role: reviewerRole as 'human' | 're_reviewer' | 'reviewer' } : {}),
      ...(reviewedArtifactRefs ? { reviewed_artifact_refs: reviewedArtifactRefs } : {}),
      ...(verifiedHashes ? { verified_hashes: verifiedHashes } : {}),
      ...(findingRefs ? { finding_refs: findingRefs } : {}),
      ...(qualityDebtIds ? { quality_debt_ids: qualityDebtIds } : {}),
      ...(hardStopClass ? { hard_stop_class: hardStopClass as NonNullable<RecordReviewInput['hard_stop_class']> } : {}),
      ...(summary ? { summary } : {}),
    });
  });

  handlers.set('ledger.verify', (params) => {
    const taskId = pickString(params, 'task_id', 'taskId') ?? '';
    if (!taskId) {
      throw new DaemonRpcError(-32602, 'INVALID_LEDGER_INPUT', 'ledger.verify requires task_id.');
    }
    const checkFileHashes = pickBoolean(params, 'check_file_hashes', 'checkFileHashes') ?? true;
    return runtime.verifyLedgerTask(taskId, checkFileHashes);
  });
}
