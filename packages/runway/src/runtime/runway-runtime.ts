import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ConsumerBindTokenAuthority } from '@opl/connect';
import { isProcessAlive, newId, nowIso, type ClientContext, type SqliteDb } from '@opl/core';
import {
  queryArtifacts,
  queryDebts,
  queryReceipts,
  queryTimeline,
  type AppendLedgerEntryInput,
  type LedgerEntry,
  type QualityDebtRecord,
} from '@opl/ledger';
import { resolveSafePackagePath, type PackStore } from '@opl/pack';
import {
  resolveConfinedReadPath,
  sha256Prefixed,
  type WorkspaceService,
} from '@opl/workspace';

import { RunwayError } from '../errors.ts';
import type { ExecutorRegistry } from '../executors/registry.ts';
import type {
  ExecutionOutcome,
  ExecutorCapabilities,
  ExecutorEvent,
  ExecutorHealthStatus,
  StageExecutionRequest,
  StageMcpServerConfig,
} from '../executors/spi.ts';
import type { RunwayStore } from '../store/spi.ts';
import type {
  AttemptRole,
  CancelTaskInput,
  CreateTaskInput,
  ListTasksFilter,
  PauseTaskInput,
  ReconcileReport,
  ResolveHumanGateInput,
  ResolveHumanGateResult,
  ResumeTaskInput,
  RunningAttemptContext,
  RunwayChangedEvent,
  SandboxMode,
  StageRunRow,
  TaskBundle,
  TaskControlResult,
  TaskRow,
  TaskStatus,
} from '../types.ts';
import { LeaseManager } from './lease-manager.ts';

const MAX_LEDGER_SUMMARY_LENGTH = 1_800;

function sanitizeLedgerSummary(raw: string | undefined, fallback: string, maxLen = MAX_LEDGER_SUMMARY_LENGTH): string {
  const redacted = (raw ?? '')
    .replace(/data:[^;\s]+(?:;[^;\s]+)*;base64,[A-Za-z0-9+/=]*/gi, '[REDACTED_DATA_URI]')
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9_]{8,}|Bearer\s+[A-Za-z0-9._+/=-]{8,})(?=\s|$|['",;}\])])/g, '[REDACTED_TOKEN]')
    .replace(/\s+/g, ' ')
    .trim();
  const base = redacted.length > 0 ? redacted : fallback;
  if (base.length <= maxLen) return base;
  return `${base.slice(0, Math.max(1, maxLen - 3))}...`;
}

export interface RunwayRuntimeOptions {
  readonly db: SqliteDb;
  readonly store: RunwayStore;
  readonly registry: ExecutorRegistry;
  readonly workspaceService: WorkspaceService;
  readonly packStore?: PackStore;
  readonly bindTokenAuthority?: ConsumerBindTokenAuthority;
  readonly trustedHostClientContext?: ClientContext;
  readonly daemonSessionId?: string;
  readonly leaseManager?: LeaseManager;
  readonly heartbeatIntervalMs?: number;
  readonly leaseTtlMs?: number;
  readonly expirySweepIntervalMs?: number;
  readonly gracefulInterruptMs?: number;
  readonly preSnapshotDir?: string;
  readonly onRunwayChanged?: (event: RunwayChangedEvent) => void;
  readonly now?: () => Date;
}

export interface StageHandoffPacket {
  readonly task_id: string;
  readonly stage_run_id: string;
  readonly stage_id: string;
  readonly seq_no: number;
  readonly workspace_root: string;
  readonly knowledge_snapshot_refs: readonly string[];
  readonly skill_dirs: readonly string[];
  readonly mcp_servers: readonly StageMcpServerConfig[];
  readonly consumer_bind_token?: string;
  readonly prior_artifacts: readonly LedgerEntry<'artifact_ref'>[];
  readonly open_debts: readonly QualityDebtRecord[];
  readonly prior_receipts: readonly LedgerEntry<'owner_receipt'>[];
  readonly prior_timeline: readonly LedgerEntry[];
}

export interface ExecuteStageOptions {
  readonly role?: AttemptRole;
  readonly sandbox_mode?: SandboxMode;
  readonly model_id?: string;
  readonly reasoning_effort?: StageExecutionRequest['reasoning_effort'];
  readonly resume_session_ref?: string;
  readonly timeout_ms?: number;
  readonly prompt_override?: string;
  readonly complete_stage_status?: 'completed' | 'awaiting_review';
  readonly extra_skill_dirs?: readonly string[];
  readonly extra_mcp_servers?: readonly StageMcpServerConfig[];
  readonly json_schema?: StageExecutionRequest['json_schema'];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExecuteStageResult {
  readonly attempt_id: string;
  readonly stage_run: StageRunRow;
  readonly task: TaskRow;
  readonly outcome: ExecutionOutcome;
  readonly ledger_entries: readonly LedgerEntry[];
}

export class RunwayRuntime {
  readonly #db: SqliteDb;
  readonly #store: RunwayStore;
  readonly #registry: ExecutorRegistry;
  readonly #workspaceService: WorkspaceService;
  readonly #packStore?: PackStore;
  readonly #bindTokenAuthority?: ConsumerBindTokenAuthority;
  readonly #trustedHostClientContext?: ClientContext;
  readonly #daemonSessionId: string;
  readonly #leaseManager: LeaseManager;
  readonly #preSnapshotDir: string;
  readonly #onRunwayChanged?: (event: RunwayChangedEvent) => void;
  readonly #now: () => Date;
  readonly #reattachPromises = new Set<Promise<void>>();

  constructor(options: RunwayRuntimeOptions) {
    this.#db = options.db;
    this.#store = options.store;
    this.#registry = options.registry;
    this.#workspaceService = options.workspaceService;
    this.#packStore = options.packStore;
    this.#bindTokenAuthority = options.bindTokenAuthority;
    this.#trustedHostClientContext = options.trustedHostClientContext;
    this.#daemonSessionId = options.daemonSessionId ?? newId('runway_sess');
    this.#preSnapshotDir =
      options.preSnapshotDir ?? path.join(os.tmpdir(), 'opl-runway-pre-snapshots');
    this.#onRunwayChanged = options.onRunwayChanged;
    this.#now = options.now ?? (() => new Date());
    this.#leaseManager =
      options.leaseManager
      ?? new LeaseManager({
        store: options.store,
        heartbeatIntervalMs: options.heartbeatIntervalMs,
        leaseTtlMs: options.leaseTtlMs,
        expirySweepIntervalMs: options.expirySweepIntervalMs,
        gracefulInterruptMs: options.gracefulInterruptMs,
        now: options.now,
      });
  }

  get store(): RunwayStore {
    return this.#store;
  }

  get leaseManager(): LeaseManager {
    return this.#leaseManager;
  }

  get registry(): ExecutorRegistry {
    return this.#registry;
  }

  start(): void {
    this.#leaseManager.startExpirySweep(async (ctx) => {
      await this.reconcileAttemptContext(ctx);
    });
  }

  async detachOnShutdown(): Promise<void> {
    this.#leaseManager.detachAll();
    if (this.#reattachPromises.size > 0) {
      await Promise.allSettled([...this.#reattachPromises]);
    }
  }

  listExecutors(): ExecutorCapabilities[] {
    return this.#registry.listCapabilities();
  }

  async healthCheckExecutors(): Promise<
    Record<string, ExecutorHealthStatus & { readonly capabilities: ExecutorCapabilities }>
  > {
    return await this.#registry.healthCheckAll();
  }

  createTask(input: CreateTaskInput): TaskBundle {
    return this.#store.createTask(input);
  }

  getTask(taskId: string): TaskBundle {
    return this.#store.getTask(taskId);
  }

  listTasks(filter?: ListTasksFilter): {
    readonly tasks: TaskRow[];
    readonly stage_runs: StageRunRow[];
  } {
    return this.#store.listTasks(filter);
  }

  async pauseTask(input: PauseTaskInput): Promise<TaskControlResult> {
    const reason = input.reason?.trim() || 'paused_by_human';
    const result = this.#store.pauseTaskAtomic(input);
    await this.#leaseManager.interruptTask(input.task_id, reason);

    // Converge any remaining 'running' attempts (e.g. reattached PID-watcher or untracked attempts)
    // only AFTER process termination has completed, preserving crash-before-kill reconcile() invariants.
    const latest = this.#store.getTask(input.task_id);
    for (const att of latest.attempts) {
      if (att.status !== 'running') continue;
      await this.#leaseManager.interruptAttempt(att.attempt_id, reason);
      this.#store.markAttemptInterrupted(att.attempt_id, 'paused_by_human_preserved', {
        task_id: input.task_id,
        stage_run_id: att.stage_run_id,
      });
    }

    return result;
  }

  resumeTask(input: ResumeTaskInput): TaskControlResult {
    return this.#store.resumeTaskAtomic(input);
  }

  async cancelTask(input: CancelTaskInput): Promise<TaskControlResult> {
    const result = this.#store.cancelTaskAtomic(input);
    await this.#leaseManager.interruptTask(
      input.task_id,
      input.reason?.trim() || 'cancelled_by_human',
    );
    return result;
  }

  resolveHumanGate(input: ResolveHumanGateInput): ResolveHumanGateResult {
    return this.#store.resolveHumanGateAtomic(input);
  }

  async interruptTask(taskId: string, reason: string): Promise<number> {
    return await this.#leaseManager.interruptTask(taskId, reason);
  }

  async buildStageHandoffPacket(
    task: TaskRow,
    stageRun: StageRunRow,
  ): Promise<StageHandoffPacket> {
    const workspace = this.#workspaceService.getWorkspace(task.workspace_id);

    const stageSnapshots = this.#workspaceService.listSnapshots({
      stage_run_id: stageRun.stage_run_id,
    });
    const workspaceSnapshots =
      stageSnapshots.length > 0
        ? stageSnapshots
        : this.#workspaceService.listSnapshots({ workspace_id: task.workspace_id });

    const snapshotDirSet = new Set<string>();
    for (const snap of workspaceSnapshots) {
      try {
        const src = this.#workspaceService.getSource(snap.source_id);
        if (src.status === 'active' && fs.existsSync(src.root_path)) {
          snapshotDirSet.add(src.root_path);
        }
      } catch {
        // Ignore unavailable or removed source
      }
    }
    try {
      for (const src of this.#workspaceService.listSources(task.workspace_id)) {
        if (src.status === 'active' && fs.existsSync(src.root_path)) {
          snapshotDirSet.add(src.root_path);
        }
      }
    } catch {
      // Ignore source listing issues if workspace has no valid sources
    }

    const priorArtifacts = queryArtifacts(this.#db, { task_id: task.task_id });
    const openDebts = queryDebts(this.#db, { task_id: task.task_id, unresolved_only: true });
    const priorReceipts = queryReceipts(this.#db, { task_id: task.task_id });
    const priorTimeline = queryTimeline(this.#db, { task_id: task.task_id });

    const skillDirs: string[] = [];
    const mcpServers: StageMcpServerConfig[] = [];
    let consumerBindToken: string | undefined;

    if (task.agent_id && this.#packStore) {
      const pkg = this.#packStore.getInstalledPackage(task.agent_id);
      if (pkg && pkg.enabled) {
        for (const skill of pkg.manifest.provides?.skills ?? []) {
          try {
            const absSkillDir = resolveSafePackagePath(pkg.install_path, skill.path);
            if (fs.existsSync(absSkillDir)) {
              skillDirs.push(absSkillDir);
            }
          } catch {
            // Skip invalid/escaping paths safely
          }
        }
        for (const srv of pkg.manifest.provides?.mcp_servers ?? []) {
          mcpServers.push({
            id: srv.id,
            transport: srv.transport,
            ...(srv.command ? { command: srv.command } : {}),
            ...(srv.args ? { args: [...srv.args] } : {}),
            ...(srv.url ? { url: srv.url } : {}),
          });
        }

        if (this.#bindTokenAuthority && this.#trustedHostClientContext) {
          try {
            const issued = await this.#bindTokenAuthority.issueConsumerBindToken(
              this.#trustedHostClientContext,
              {
                session_id: this.#daemonSessionId,
                consumer_package_id: pkg.package_id,
              },
            );
            consumerBindToken = issued.token;
          } catch {
            // Optional bind token issuance; do not block stages without connect grants
          }
        }
      }
    }

    return {
      task_id: task.task_id,
      stage_run_id: stageRun.stage_run_id,
      stage_id: stageRun.stage_id,
      seq_no: stageRun.seq_no,
      workspace_root: workspace.root_path,
      knowledge_snapshot_refs: [...snapshotDirSet],
      skill_dirs: skillDirs,
      mcp_servers: mcpServers,
      ...(consumerBindToken ? { consumer_bind_token: consumerBindToken } : {}),
      prior_artifacts: priorArtifacts,
      open_debts: openDebts,
      prior_receipts: priorReceipts,
      prior_timeline: priorTimeline,
    };
  }

  formatStageHandoffPrompt(
    task: TaskRow,
    stageRun: StageRunRow,
    packet: StageHandoffPacket,
  ): string {
    const lines: string[] = [
      `Goal: ${task.goal_prompt}`,
      `Stage: ${stageRun.stage_id} (seq=${stageRun.seq_no}, executor=${stageRun.executor_id})`,
      `Workspace: ${packet.workspace_root}`,
    ];
    if (packet.knowledge_snapshot_refs.length > 0) {
      lines.push(`Knowledge snapshots: ${packet.knowledge_snapshot_refs.join(', ')}`);
    }
    if (packet.prior_artifacts.length > 0) {
      lines.push('Prior Ledger artifacts:');
      for (const art of packet.prior_artifacts) {
        lines.push(`- ${art.payload.path} (sha256=${art.payload.sha256}, owner=${art.owner_id})`);
      }
    }
    if (packet.open_debts.length > 0) {
      lines.push('Open quality debts:');
      for (const debt of packet.open_debts) {
        lines.push(
          `- ${debt.debt_key}: ${debt.entry.payload.summary ?? 'open debt'} (severity=${debt.entry.payload.severity ?? 'medium'})`,
        );
      }
    }
    if (packet.prior_receipts.length > 0) {
      lines.push(`Prior owner receipts: ${packet.prior_receipts.length}`);
    }
    return lines.join('\n');
  }

  #snapshotWorkspaceFiles(workspaceRoot: string, maxFiles = 2000): Map<string, string> {
    const result = new Map<string, string>();
    if (!fs.existsSync(workspaceRoot)) return result;
    const ignoredDirs = new Set(['.git', 'node_modules', '.codegraph', 'dist', '.opl']);
    const stack: Array<{ dir: string; rel: string }> = [{ dir: workspaceRoot, rel: '' }];

    while (stack.length > 0 && result.size < maxFiles) {
      const current = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (result.size >= maxFiles) break;
        if (entry.isSymbolicLink()) continue;
        const rel = current.rel ? `${current.rel}/${entry.name}` : entry.name;
        const abs = path.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            stack.push({ dir: abs, rel });
          }
          continue;
        }
        if (entry.isFile()) {
          try {
            const st = fs.statSync(abs);
            if (st.size <= 10 * 1024 * 1024) {
              result.set(rel, sha256Prefixed(fs.readFileSync(abs)));
            }
          } catch {
            // ignore transient unreadable files
          }
        }
      }
    }
    return result;
  }

  #normalizeObservedArtifacts(
    workspaceRoot: string,
    rawArtifacts: ReadonlyArray<{ readonly path: string; readonly sha256?: string }>,
  ): Array<{ readonly path: string; readonly sha256: string }> {
    const verified: Array<{ readonly path: string; readonly sha256: string }> = [];
    const seen = new Set<string>();
    for (const item of rawArtifacts) {
      try {
        const resolved = resolveConfinedReadPath(workspaceRoot, item.path);
        const bytes = fs.readFileSync(resolved.resolvedPath);
        const sha = sha256Prefixed(bytes);
        if (seen.has(resolved.normalizedRelPath)) continue;
        seen.add(resolved.normalizedRelPath);
        verified.push({ path: resolved.normalizedRelPath, sha256: sha });
      } catch {
        // Ignore unverified or missing paths outside workspace
      }
    }
    return verified;
  }

  #computeNextTaskStatusAfterStage(
    taskId: string,
    currentStageRunId: string,
    nextStageStatus: StageRunRow['status'],
  ): TaskStatus {
    if (nextStageStatus === 'human_gate') return 'awaiting_human';
    if (nextStageStatus === 'paused_by_human') return 'paused_by_human';
    if (nextStageStatus === 'failed') return 'failed';
    if (nextStageStatus === 'cancelled') return 'cancelled';
    if (nextStageStatus === 'completed') {
      const others = this.#store
        .listStageRuns(taskId)
        .filter((s) => s.stage_run_id !== currentStageRunId);
      const anyRemaining = others.some((s) => s.status !== 'completed');
      return anyRemaining ? 'active' : 'completed';
    }
    return 'active';
  }

  async executeStage(
    stageRunId: string,
    options: ExecuteStageOptions = {},
  ): Promise<ExecuteStageResult> {
    const initialStage = this.#store.getStageRun(stageRunId);
    const taskBundle = this.#store.getTask(initialStage.task_id);
    if (taskBundle.task.status === 'paused_by_human' || initialStage.status === 'paused_by_human') {
      throw new RunwayError(
        'TASK_PAUSED_BY_HUMAN',
        `StageRun '${stageRunId}' is paused_by_human and cannot be executed.`,
        { task_id: taskBundle.task_id, stage_run_id: stageRunId },
      );
    }

    const adapter = this.#registry.get(initialStage.executor_id);
    const role: AttemptRole = options.role ?? 'producer';
    const sandboxMode: SandboxMode =
      options.sandbox_mode ?? (role === 'reviewer' ? 'read-only' : 'workspace-write');

    if (this.#workspaceService.listSnapshots({ stage_run_id: initialStage.stage_run_id }).length === 0) {
      try {
        const activeSources = this.#workspaceService
          .listSources(taskBundle.task.workspace_id)
          .filter((s) => s.status === 'active' && fs.existsSync(s.root_path));
        if (activeSources.length > 0) {
          this.#workspaceService.createSnapshot({
            workspace_id: taskBundle.task.workspace_id,
            stage_run_id: initialStage.stage_run_id,
          });
        }
      } catch {
        // Best-effort snapshot freeze before stage execution
      }
    }

    const packet = await this.buildStageHandoffPacket(taskBundle.task, initialStage);
    const created = this.#store.createAttempt({
      stage_run_id: initialStage.stage_run_id,
      expected_stage_revision: initialStage.revision,
      role,
      executor_id: initialStage.executor_id,
      lease_expires_at: this.#leaseManager.nextLeaseExpiryIso(),
    });

    const attempt = created.attempt;
    const runningStage = created.stage_run;
    const controller = new AbortController();
    const handle = this.#leaseManager.register({
      attemptId: attempt.attempt_id,
      stageRunId: runningStage.stage_run_id,
      taskId: taskBundle.task_id,
      executorId: initialStage.executor_id,
      controller,
    });

    const observedArtifacts: Array<{ readonly path: string; readonly sha256?: string }> = [];
    const preWorkspaceFiles =
      sandboxMode !== 'read-only' ? this.#snapshotWorkspaceFiles(packet.workspace_root) : null;
    if (preWorkspaceFiles) {
      this.#persistPreSnapshot(attempt.attempt_id, preWorkspaceFiles);
    }
    const prompt =
      options.prompt_override
      ?? this.formatStageHandoffPrompt(taskBundle.task, runningStage, packet);

    const skillDirs = [...new Set([...packet.skill_dirs, ...(options.extra_skill_dirs ?? [])])];
    const mcpServers = [...packet.mcp_servers, ...(options.extra_mcp_servers ?? [])];

    const req: StageExecutionRequest = {
      attempt_id: attempt.attempt_id,
      task_id: taskBundle.task_id,
      stage_run_id: runningStage.stage_run_id,
      stage_id: runningStage.stage_id,
      role,
      workspace_root: packet.workspace_root,
      sandbox_mode: sandboxMode,
      model_id: options.model_id ?? runningStage.model_id ?? undefined,
      ...(options.reasoning_effort ? { reasoning_effort: options.reasoning_effort } : {}),
      prompt,
      knowledge_snapshot_refs: packet.knowledge_snapshot_refs,
      skill_dirs: skillDirs,
      mcp_servers: mcpServers,
      ...(options.resume_session_ref ? { resume_session_ref: options.resume_session_ref } : {}),
      ...(options.timeout_ms !== undefined ? { timeout_ms: options.timeout_ms } : {}),
      ...(options.json_schema !== undefined ? { json_schema: options.json_schema } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };

    const emit = (ev: ExecutorEvent): void => {
      if (ev.kind === 'session_bound') {
        try {
          this.#leaseManager.updateSessionBinding(attempt.attempt_id, {
            sessionRef: ev.session_ref,
            localPid: ev.local_pid,
          });
        } catch {
          // Best-effort binding
        }
      } else if (ev.kind === 'artifact_observed') {
        observedArtifacts.push({ path: ev.path, sha256: ev.sha256 });
      }
      this.#onRunwayChanged?.({
        kind: 'executor_event',
        task_id: taskBundle.task_id,
        stage_run_id: runningStage.stage_run_id,
        attempt_id: attempt.attempt_id,
        event: ev,
      });
    };

    let outcome: ExecutionOutcome;
    try {
      outcome = await adapter.execute(req, emit, handle.controller.signal);
    } catch (error) {
      outcome = {
        status: 'failed',
        artifact_refs: [],
        error: {
          code: 'EXECUTOR_THREW',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      };
    } finally {
      this.#leaseManager.unregister(attempt.attempt_id);
    }

    const latestStage = this.#store.getStageRun(runningStage.stage_run_id);
    const latestTask = this.#store.getTask(taskBundle.task_id).task;
    const ownerId = taskBundle.task.agent_id ?? 'opl.runway';
    const ts = nowIso();
    const usageJson = outcome.usage ? JSON.stringify(outcome.usage) : undefined;

    // Preserve pause/cancel sovereignty if task/stage transitioned concurrently while attempt was aborting
    if (
      latestStage.status === 'paused_by_human'
      || latestTask.status === 'paused_by_human'
      || latestStage.status === 'cancelled'
      || latestTask.status === 'cancelled'
    ) {
      const commitRes = this.#store.commitStageTransitionAtomic({
        stage_run_id: latestStage.stage_run_id,
        expected_revision: latestStage.revision,
        next_stage_status: latestStage.status,
        attempt_update: {
          attempt_id: attempt.attempt_id,
          status: latestStage.status === 'cancelled' ? 'cancelled' : 'interrupted',
          usage_json: usageJson,
          error_json: JSON.stringify({
            code: latestStage.status === 'cancelled' ? 'cancelled_by_human' : 'paused_by_human_preserved',
          }),
        },
        ledger_entries: [],
      });
      this.#removePreSnapshot(attempt.attempt_id);
      return {
        attempt_id: attempt.attempt_id,
        stage_run: commitRes.stage_run,
        task: commitRes.task,
        outcome,
        ledger_entries: commitRes.ledger_entries,
      };
    }

    const diffArtifacts: Array<{ readonly path: string; readonly sha256?: string }> = [];
    if (preWorkspaceFiles && outcome.status === 'succeeded') {
      const postFiles = this.#snapshotWorkspaceFiles(packet.workspace_root);
      for (const [rel, sha] of postFiles.entries()) {
        if (preWorkspaceFiles.get(rel) !== sha) {
          diffArtifacts.push({ path: rel, sha256: sha });
        }
      }
    }

    const verifiedArtifacts = this.#normalizeObservedArtifacts(packet.workspace_root, [
      ...outcome.artifact_refs,
      ...observedArtifacts,
      ...diffArtifacts,
    ]);

    const ledgerInputs: AppendLedgerEntryInput[] = [];
    for (const art of verifiedArtifacts) {
      ledgerInputs.push({
        task_id: taskBundle.task_id,
        stage_run_id: latestStage.stage_run_id,
        attempt_id: attempt.attempt_id,
        entry_kind: 'artifact_ref',
        owner_id: ownerId,
        payload: { path: art.path, sha256: art.sha256 },
        created_at: ts,
      });
    }

    let nextStageStatus: StageRunRow['status'];
    let humanGateJson: string | null | undefined;
    let attemptStatus: 'succeeded' | 'failed' | 'interrupted' | 'cancelled' | 'timed_out';

    if (outcome.status === 'succeeded') {
      nextStageStatus = options.complete_stage_status ?? 'completed';
      attemptStatus = 'succeeded';
      ledgerInputs.push({
        task_id: taskBundle.task_id,
        stage_run_id: latestStage.stage_run_id,
        attempt_id: attempt.attempt_id,
        entry_kind: 'owner_receipt',
        owner_id: ownerId,
        payload: {
          status: nextStageStatus === 'awaiting_review' ? 'ready_for_review' : 'completed',
          stage_id: latestStage.stage_id,
          executor_id: latestStage.executor_id,
          ...(outcome.session_ref ? { session_ref: outcome.session_ref } : {}),
        },
        created_at: ts,
      });
    } else if (outcome.status === 'human_gate') {
      nextStageStatus = 'human_gate';
      attemptStatus = 'succeeded';
      humanGateJson = JSON.stringify(
        outcome.human_gate ?? { question: 'Human decision required to proceed.' },
      );
      ledgerInputs.push({
        task_id: taskBundle.task_id,
        stage_run_id: latestStage.stage_run_id,
        attempt_id: attempt.attempt_id,
        entry_kind: 'typed_blocker',
        owner_id: 'opl.runway',
        payload: {
          code: 'human_gate_requested',
          summary: outcome.human_gate?.question ?? 'Human gate requested by executor.',
          retryable: true,
        },
        created_at: ts,
      });
    } else if (outcome.status === 'cancelled') {
      nextStageStatus = 'cancelled';
      attemptStatus = 'cancelled';
      ledgerInputs.push({
        task_id: taskBundle.task_id,
        stage_run_id: latestStage.stage_run_id,
        attempt_id: attempt.attempt_id,
        entry_kind: 'human_decision',
        owner_id: 'opl.runway',
        payload: {
          decision: 'cancel',
          actor_id: 'opl.runway',
          reason: sanitizeLedgerSummary(outcome.error?.message, 'execution_cancelled'),
        },
        created_at: ts,
      });
    } else {
      nextStageStatus = 'human_gate';
      attemptStatus = outcome.status === 'timed_out' ? 'timed_out' : 'failed';
      const errCode = outcome.error?.code ?? (outcome.status === 'timed_out' ? 'TIMED_OUT' : 'EXECUTOR_FAILED');
      const errMsg = sanitizeLedgerSummary(outcome.error?.message, 'Stage execution failed.');
      humanGateJson = JSON.stringify({
        kind: 'execution_blocker',
        question: sanitizeLedgerSummary(`${errCode}: ${errMsg}`, errCode),
        options: ['retry_stage', 'cancel'],
      });
      ledgerInputs.push({
        task_id: taskBundle.task_id,
        stage_run_id: latestStage.stage_run_id,
        attempt_id: attempt.attempt_id,
        entry_kind: 'typed_blocker',
        owner_id: 'opl.runway',
        payload: {
          code: errCode,
          summary: errMsg,
          retryable: outcome.error?.retryable ?? true,
        },
        created_at: ts,
      });
      ledgerInputs.push({
        task_id: taskBundle.task_id,
        stage_run_id: latestStage.stage_run_id,
        attempt_id: attempt.attempt_id,
        entry_kind: 'failed_path_note',
        owner_id: 'opl.runway',
        payload: {
          stage_id: latestStage.stage_id,
          executor_id: latestStage.executor_id,
          error_code: errCode,
          summary: errMsg,
        },
        created_at: ts,
      });
    }

    const nextTaskStatus = this.#computeNextTaskStatusAfterStage(
      taskBundle.task_id,
      latestStage.stage_run_id,
      nextStageStatus,
    );

    const committed = this.#store.commitStageTransitionAtomic({
      stage_run_id: latestStage.stage_run_id,
      expected_revision: latestStage.revision,
      next_stage_status: nextStageStatus,
      human_gate_json: humanGateJson,
      task_status: nextTaskStatus,
      attempt_update: {
        attempt_id: attempt.attempt_id,
        status: attemptStatus,
        usage_json: usageJson,
        error_json: outcome.error ? JSON.stringify(outcome.error) : null,
      },
      ledger_entries: ledgerInputs,
    });

    this.#removePreSnapshot(attempt.attempt_id);
    return {
      attempt_id: attempt.attempt_id,
      stage_run: committed.stage_run,
      task: committed.task,
      outcome: { ...outcome, artifact_refs: verifiedArtifacts },
      ledger_entries: committed.ledger_entries,
    };
  }

  async runNextStage(
    taskId: string,
    options: ExecuteStageOptions = {},
  ): Promise<ExecuteStageResult | null> {
    const next = this.#store.claimNextQueuedStage(taskId);
    if (!next) return null;
    return await this.executeStage(next.stage_run_id, options);
  }

  async reconcileAttemptContext(
    ctx: RunningAttemptContext,
    options?: { readonly skipReattachStream?: boolean },
  ): Promise<'reattached' | 'harvested' | 'interrupted' | 'skipped_paused' | 'skipped_preserved'> {
    // Guardrail 2: ABSOLUTE paused_by_human & human_gate/cancelled sovereignty!
    if (ctx.task_status === 'paused_by_human' || ctx.stage_status === 'paused_by_human') {
      this.#store.markAttemptInterrupted(ctx.attempt_id, 'paused_by_human_preserved', {
        task_id: ctx.task_id,
        stage_run_id: ctx.stage_run_id,
      });
      return 'skipped_paused';
    }

    if (
      ctx.stage_status === 'human_gate'
      || ctx.stage_status === 'cancelled'
      || ctx.task_status === 'cancelled'
    ) {
      this.#store.markAttemptInterrupted(ctx.attempt_id, 'stage_state_preserved', {
        stage_status: ctx.stage_status,
        task_status: ctx.task_status,
      });
      return 'skipped_preserved';
    }

    const adapter = this.#registry.getOptional(ctx.executor_id);
    let recState: 'still_running' | 'completed' | 'failed' | 'lost' = 'lost';
    let recOutcome: ExecutionOutcome | undefined;
    let reattachFn: (() => AsyncIterable<ExecutorEvent>) | undefined;

    if (adapter) {
      try {
        const res = await adapter.reconcile({
          attempt_id: ctx.attempt_id,
          session_ref: ctx.executor_session_ref ?? undefined,
          local_pid: ctx.local_pid ?? undefined,
          workspace_root: ctx.workspace_root,
        });
        recState = res.state;
        recOutcome = res.outcome;
        reattachFn = res.reattach;
      } catch (error) {
        recState = 'failed';
        recOutcome = {
          status: 'failed',
          artifact_refs: [],
          error: {
            code: 'RECONCILE_ERROR',
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        };
      }
    } else if (ctx.local_pid && isProcessAlive(ctx.local_pid)) {
      recState = 'still_running';
    }

    if (recState === 'still_running') {
      if (reattachFn && !options?.skipReattachStream) {
        this.#store.renewAttemptLease(ctx.attempt_id, this.#leaseManager.nextLeaseExpiryIso(this.#now()));
        const handle = this.#leaseManager.register({
          attemptId: ctx.attempt_id,
          stageRunId: ctx.stage_run_id,
          taskId: ctx.task_id,
          executorId: ctx.executor_id,
          localPid: ctx.local_pid ?? undefined,
          sessionRef: ctx.executor_session_ref ?? undefined,
          hasInProcessRunner: false,
        });
        const observedArtifacts: Array<{ readonly path: string; readonly sha256?: string }> = [];
        const p = (async () => {
          try {
            for await (const ev of reattachFn()) {
              if (handle.detached || handle.controller.signal.aborted) break;
              if (ev.kind === 'artifact_observed') {
                observedArtifacts.push({ path: ev.path, sha256: ev.sha256 });
              } else if (ev.kind === 'session_bound') {
                try {
                  this.#leaseManager.updateSessionBinding(ctx.attempt_id, {
                    sessionRef: ev.session_ref,
                    localPid: ev.local_pid,
                  });
                } catch {
                  // Best-effort binding
                }
              }
              this.#onRunwayChanged?.({
                kind: 'executor_event',
                task_id: ctx.task_id,
                stage_run_id: ctx.stage_run_id,
                attempt_id: ctx.attempt_id,
                event: ev,
              });
            }
          } catch {
            // Fall through to post-stream reconciliation
          } finally {
            this.#leaseManager.unregister(ctx.attempt_id);
          }

          if (handle.detached) return;

          const latestCtx = this.#store
            .listRunningAttemptsWithContext()
            .find((r) => r.attempt_id === ctx.attempt_id);
          if (!latestCtx) return;

          if (handle.controller.signal.aborted) {
            if (
              latestCtx.task_status === 'paused_by_human'
              || latestCtx.stage_status === 'paused_by_human'
              || latestCtx.task_status === 'cancelled'
              || latestCtx.stage_status === 'cancelled'
            ) {
              await this.reconcileAttemptContext(latestCtx);
            }
            return;
          }

          await this.#settleReattachedAttempt(latestCtx, observedArtifacts);
        })();
        this.#reattachPromises.add(p);
        void p.finally(() => this.#reattachPromises.delete(p));
      } else if (ctx.local_pid && isProcessAlive(ctx.local_pid)) {
        this.#store.renewAttemptLease(ctx.attempt_id, this.#leaseManager.nextLeaseExpiryIso(this.#now()));
        const handle = this.#leaseManager.register({
          attemptId: ctx.attempt_id,
          stageRunId: ctx.stage_run_id,
          taskId: ctx.task_id,
          executorId: ctx.executor_id,
          localPid: ctx.local_pid,
          sessionRef: ctx.executor_session_ref ?? undefined,
          hasInProcessRunner: false,
        });
        const watchedPid = ctx.local_pid;
        const watcher = setInterval(() => {
          if (
            handle.detached
            || handle.controller.signal.aborted
            || this.#leaseManager.getActiveHandle(ctx.attempt_id) !== handle
          ) {
            clearInterval(watcher);
            return;
          }
          if (isProcessAlive(watchedPid)) {
            return;
          }
          clearInterval(watcher);
          this.#leaseManager.unregister(ctx.attempt_id);
          const settlePromise = (async () => {
            if (handle.detached) return;
            const latestCtx = this.#store
              .listRunningAttemptsWithContext()
              .find((r) => r.attempt_id === ctx.attempt_id);
            if (!latestCtx) return;
            await this.reconcileAttemptContext(latestCtx);
          })();
          this.#reattachPromises.add(settlePromise);
          void settlePromise.finally(() => this.#reattachPromises.delete(settlePromise));
        }, 200);
        watcher.unref?.();
        handle.onDispose = () => {
          clearInterval(watcher);
        };
      } else {
        return this.#commitReconciledOutcome(ctx, 'lost', recOutcome);
      }

      this.#onRunwayChanged?.({
        kind: 'reconciled',
        task_id: ctx.task_id,
        stage_run_id: ctx.stage_run_id,
        attempt_id: ctx.attempt_id,
        state: 'still_running',
      });
      return 'reattached';
    }

    return this.#commitReconciledOutcome(ctx, recState, recOutcome);
  }

  async #settleReattachedAttempt(
    ctx: RunningAttemptContext,
    observedArtifacts: ReadonlyArray<{ readonly path: string; readonly sha256?: string }>,
  ): Promise<'reattached' | 'harvested' | 'interrupted' | 'skipped_paused' | 'skipped_preserved'> {
    if (ctx.task_status === 'paused_by_human' || ctx.stage_status === 'paused_by_human') {
      this.#store.markAttemptInterrupted(ctx.attempt_id, 'paused_by_human_preserved', {
        task_id: ctx.task_id,
        stage_run_id: ctx.stage_run_id,
      });
      return 'skipped_paused';
    }

    if (
      ctx.stage_status === 'human_gate'
      || ctx.stage_status === 'cancelled'
      || ctx.task_status === 'cancelled'
    ) {
      this.#store.markAttemptInterrupted(ctx.attempt_id, 'stage_state_preserved', {
        stage_status: ctx.stage_status,
        task_status: ctx.task_status,
      });
      return 'skipped_preserved';
    }

    const adapter = this.#registry.getOptional(ctx.executor_id);
    let recState: 'still_running' | 'completed' | 'failed' | 'lost' = 'lost';
    let recOutcome: ExecutionOutcome | undefined;

    if (adapter) {
      try {
        const res = await adapter.reconcile({
          attempt_id: ctx.attempt_id,
          session_ref: ctx.executor_session_ref ?? undefined,
          local_pid: ctx.local_pid ?? undefined,
          workspace_root: ctx.workspace_root,
        });
        recState = res.state;
        recOutcome = res.outcome;
      } catch (error) {
        recState = 'failed';
        recOutcome = {
          status: 'failed',
          artifact_refs: [],
          error: {
            code: 'RECONCILE_ERROR',
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        };
      }
    } else if (ctx.local_pid && isProcessAlive(ctx.local_pid)) {
      recState = 'still_running';
    }

    if (recState === 'still_running') {
      if (ctx.local_pid && isProcessAlive(ctx.local_pid)) {
        return await this.reconcileAttemptContext(ctx, { skipReattachStream: true });
      }
      recState = 'lost';
    }

    return this.#commitReconciledOutcome(ctx, recState, recOutcome, observedArtifacts);
  }

  #preSnapshotPath(attemptId: string): string {
    const safeId = attemptId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.#preSnapshotDir, `${safeId}.json`);
  }

  #persistPreSnapshot(attemptId: string, files: Map<string, string>): void {
    try {
      fs.mkdirSync(this.#preSnapshotDir, { recursive: true, mode: 0o700 });
      const filePath = this.#preSnapshotPath(attemptId);
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(Object.fromEntries(files)), { mode: 0o600 });
      fs.renameSync(tmpPath, filePath);
    } catch {
      // Best-effort baseline persistence
    }
  }

  #loadPreSnapshot(attemptId: string): Map<string, string> | null {
    const filePath = this.#preSnapshotPath(attemptId);
    if (!fs.existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const out = new Map<string, string>();
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out.set(k, v);
      }
      return out;
    } catch {
      return null;
    }
  }

  #removePreSnapshot(attemptId: string): void {
    try {
      fs.rmSync(this.#preSnapshotPath(attemptId), { force: true });
    } catch {
      // ignore
    }
  }

  #harvestWorkspaceDiffForReconcile(
    ctx: RunningAttemptContext,
  ): Array<{ readonly path: string; readonly sha256?: string }> {
    const diffArtifacts: Array<{ readonly path: string; readonly sha256?: string }> = [];
    const preFiles = this.#loadPreSnapshot(ctx.attempt_id);
    if (preFiles) {
      const postFiles = this.#snapshotWorkspaceFiles(ctx.workspace_root);
      for (const [rel, sha] of postFiles.entries()) {
        if (preFiles.get(rel) !== sha) {
          diffArtifacts.push({ path: rel, sha256: sha });
        }
      }
      return diffArtifacts;
    }
    if (ctx.role === 'reviewer' || !fs.existsSync(ctx.workspace_root)) {
      return diffArtifacts;
    }
    const startedMs = Date.parse(ctx.started_at);
    const cutoffMs = Number.isFinite(startedMs) ? startedMs - 1000 : 0;
    const ignoredDirs = new Set(['.git', 'node_modules', '.codegraph', 'dist', '.opl']);
    const stack: Array<{ dir: string; rel: string }> = [{ dir: ctx.workspace_root, rel: '' }];
    while (stack.length > 0 && diffArtifacts.length < 500) {
      const current = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const rel = current.rel ? `${current.rel}/${entry.name}` : entry.name;
        const abs = path.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoredDirs.has(entry.name)) {
            stack.push({ dir: abs, rel });
          }
          continue;
        }
        if (entry.isFile()) {
          try {
            const st = fs.statSync(abs);
            if (st.mtimeMs >= cutoffMs && st.size <= 10 * 1024 * 1024) {
              diffArtifacts.push({ path: rel, sha256: sha256Prefixed(fs.readFileSync(abs)) });
            }
          } catch {
            // ignore
          }
        }
      }
    }
    return diffArtifacts;
  }

  #commitReconciledOutcome(
    ctx: RunningAttemptContext,
    recState: 'completed' | 'failed' | 'lost',
    recOutcome: ExecutionOutcome | undefined,
    extraArtifacts: ReadonlyArray<{ readonly path: string; readonly sha256?: string }> = [],
  ): 'harvested' | 'interrupted' {
    const ts = nowIso();
    const ownerId = ctx.agent_id ?? 'opl.runway';

    if (recState === 'completed') {
      const diffArtifacts = this.#harvestWorkspaceDiffForReconcile(ctx);
      const verifiedArtifacts = this.#normalizeObservedArtifacts(ctx.workspace_root, [
        ...(recOutcome?.artifact_refs ?? []),
        ...extraArtifacts,
        ...diffArtifacts,
      ]);
      const ledgerInputs: AppendLedgerEntryInput[] = verifiedArtifacts.map((art) => ({
        task_id: ctx.task_id,
        stage_run_id: ctx.stage_run_id,
        attempt_id: ctx.attempt_id,
        entry_kind: 'artifact_ref',
        owner_id: ownerId,
        payload: { path: art.path, sha256: art.sha256 },
        created_at: ts,
      }));
      ledgerInputs.push({
        task_id: ctx.task_id,
        stage_run_id: ctx.stage_run_id,
        attempt_id: ctx.attempt_id,
        entry_kind: 'owner_receipt',
        owner_id: ownerId,
        payload: {
          status: 'completed_reconciled',
          stage_id: ctx.stage_id,
          executor_id: ctx.executor_id,
          ...(recOutcome?.session_ref ?? ctx.executor_session_ref
            ? { session_ref: recOutcome?.session_ref ?? ctx.executor_session_ref }
            : {}),
        },
        created_at: ts,
      });

      const nextTaskStatus = this.#computeNextTaskStatusAfterStage(
        ctx.task_id,
        ctx.stage_run_id,
        'completed',
      );
      this.#store.commitStageTransitionAtomic({
        stage_run_id: ctx.stage_run_id,
        expected_revision: ctx.stage_revision,
        next_stage_status: 'completed',
        task_status: nextTaskStatus,
        attempt_update: {
          attempt_id: ctx.attempt_id,
          status: 'succeeded',
          usage_json: recOutcome?.usage ? JSON.stringify(recOutcome.usage) : undefined,
          error_json: null,
        },
        ledger_entries: ledgerInputs,
      });
      this.#removePreSnapshot(ctx.attempt_id);
      this.#onRunwayChanged?.({
        kind: 'reconciled',
        task_id: ctx.task_id,
        stage_run_id: ctx.stage_run_id,
        attempt_id: ctx.attempt_id,
        state: 'completed',
      });
      return 'harvested';
    }

    // 'failed' or 'lost' -> NEVER auto-replay; converge to human_gate + typed_blocker
    const blockerCode =
      recState === 'failed'
        ? recOutcome?.error?.code ?? 'executor_failed_after_restart'
        : 'executor_lost_after_restart';
    const blockerMsg = sanitizeLedgerSummary(
      recOutcome?.error?.message,
      `Attempt '${ctx.attempt_id}' was ${recState} across daemon restart; inspect workspace before retrying.`,
    );
    const humanGateJson = JSON.stringify({
      kind: 'restart_reconcile_blocker',
      attempt_id: ctx.attempt_id,
      question: blockerMsg,
      options: ['retry_stage', 'resume_with_note', 'cancel'],
    });

    this.#store.commitStageTransitionAtomic({
      stage_run_id: ctx.stage_run_id,
      expected_revision: ctx.stage_revision,
      next_stage_status: 'human_gate',
      human_gate_json: humanGateJson,
      task_status: 'awaiting_human',
      attempt_update: {
        attempt_id: ctx.attempt_id,
        status: recState === 'failed' ? 'failed' : 'interrupted',
        usage_json: recOutcome?.usage ? JSON.stringify(recOutcome.usage) : undefined,
        error_json: JSON.stringify({ code: blockerCode, message: blockerMsg }),
      },
      ledger_entries: [
        {
          task_id: ctx.task_id,
          stage_run_id: ctx.stage_run_id,
          attempt_id: ctx.attempt_id,
          entry_kind: 'typed_blocker',
          owner_id: 'opl.runway',
          payload: {
            code: blockerCode,
            summary: blockerMsg,
            retryable: true,
            next_safe_action: 'inspect_and_decide',
          },
          created_at: ts,
        },
      ],
    });
    this.#removePreSnapshot(ctx.attempt_id);
    this.#onRunwayChanged?.({
      kind: 'reconciled',
      task_id: ctx.task_id,
      stage_run_id: ctx.stage_run_id,
      attempt_id: ctx.attempt_id,
      state: recState,
    });
    return 'interrupted';
  }

  async reconcile(): Promise<ReconcileReport> {
    const runningAttempts = this.#store.listRunningAttemptsWithContext();
    let reattached = 0;
    let harvested = 0;
    let interrupted = 0;
    let skippedPaused = 0;
    let skippedPreserved = 0;

    for (const ctx of runningAttempts) {
      const outcome = await this.reconcileAttemptContext(ctx);
      if (outcome === 'reattached') reattached += 1;
      else if (outcome === 'harvested') harvested += 1;
      else if (outcome === 'interrupted') interrupted += 1;
      else if (outcome === 'skipped_paused') skippedPaused += 1;
      else skippedPreserved += 1;
    }

    const orphanedStages = this.#store.listOrphanedRunningStages();
    const ts = nowIso();
    for (const orphan of orphanedStages) {
      if (orphan.task_status === 'paused_by_human' || orphan.task_status === 'cancelled') {
        skippedPaused += 1;
        continue;
      }
      this.#store.commitStageTransitionAtomic({
        stage_run_id: orphan.stage_run_id,
        expected_revision: orphan.revision,
        next_stage_status: 'human_gate',
        human_gate_json: JSON.stringify({
          kind: 'orphaned_running_stage',
          question: `Stage '${orphan.stage_id}' was left in running state without an active attempt.`,
          options: ['retry_stage', 'cancel'],
        }),
        task_status: 'awaiting_human',
        ledger_entries: [
          {
            task_id: orphan.task_id,
            stage_run_id: orphan.stage_run_id,
            entry_kind: 'typed_blocker',
            owner_id: 'opl.runway',
            payload: {
              code: 'orphaned_running_stage',
              summary: 'Stage had status=running with no live attempt after restart.',
              retryable: true,
            },
            created_at: ts,
          },
        ],
      });
      interrupted += 1;
    }

    return {
      scanned_attempts: runningAttempts.length,
      scanned_orphaned_stages: orphanedStages.length,
      reattached,
      harvested,
      interrupted,
      skipped_paused: skippedPaused,
      skipped_preserved: skippedPreserved,
    };
  }
}
