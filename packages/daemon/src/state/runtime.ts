import fs from 'node:fs';
import path from 'node:path';
import {
  acquireAdvisoryLock,
  createClientContext,
  ensureStateDir,
  EventBus,
  newId,
  nowIso,
  openSqliteStore,
  resolveStatePaths,
  txImmediate,
  type AdvisoryLockHandle,
  type ClientContext,
  type SqliteDb,
  type StatePaths,
} from '@opl/core';
import {
  ChannelError,
  ChannelProviderHost,
  SqliteChannelPackageDiscovery,
  SqliteChannelThreadBindingStore,
  createConnectService,
  ensureConnectSchema,
  resolveCapabilityTitle,
  type ChannelTurnRef,
  type ChannelTurnTerminalEvent,
  type ChannelTurnTerminalObserver,
  type ConnectService,
  type ConnectionProvider,
  type ConsumerBindTokenAuthority,
} from '@opl/connect';
import { LedgerStore, verifyTaskLineage } from '@opl/ledger';
import {
  createPackService,
  createProcessCodexRunner,
  discoverExternalCodexPlugins,
  OPL_LOCAL_MARKETPLACE_NAME,
  PackError,
  projectPackageToCodexMarketplace,
  prunePackStateArtifacts,
  readPackageManifestFromDir,
  removeCodexMarketplaceProjection,
  resolveCodexPluginName,
  shouldSyncToCodex,
  type CodexSyncProjectionResult,
  type InstalledPackageRecord,
  type ModuleOrCommandEntrypoint,
  type OplPackageManifestV2,
  type PackService,
} from '@opl/pack';
import {
  AntigravityExecutorAdapter,
  CodexExecutorAdapter,
  ExecutorRegistry,
  RunwayRuntime,
  ScheduleRunner,
  SqliteRunwayStore,
  ensureRunwaySchema,
  type AttemptRole,
  type ExecuteStageOptions,
} from '@opl/runway';
import {
  createWorkspaceService,
  ensureWorkspaceSchema,
  type WorkspaceService,
} from '@opl/workspace';
import { ContributionDispatcher } from '../contributions/dispatcher.ts';
import { DaemonRpcError } from '../errors.ts';
import { runCliEntrypoint, runEsmEntrypoint, runModuleOrCommandEntrypoint } from '../utils/subprocess-esm.ts';
import { AppStateCache } from './app-state-cache.ts';
import { initializeAppPackagePreferences, isAppPackageEnabled } from './app-package-preferences.ts';

export interface DaemonRuntimeOptions {
  readonly stateDir?: string;
  readonly version?: string;
  readonly onEvent?: (method: string, params: Record<string, unknown>) => void;
}

export interface DiscoveredCliExtension {
  readonly package_id: string;
  readonly namespace: string;
  readonly install_path: string;
  readonly entrypoint: ModuleOrCommandEntrypoint;
}

function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(import.meta.dirname, '../../package.json');
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
    return typeof raw.version === 'string' && raw.version.trim() ? raw.version.trim() : '2.0.0';
  } catch {
    return '2.0.0';
  }
}

function resolveMarketplaceRoot(paths: StatePaths): string {
  const override = process.env.OPL_CODEX_MARKETPLACE_DIR?.trim();
  if (override) return path.resolve(override);
  const oplHome = process.env.OPL_HOME?.trim();
  if (oplHome) return path.join(path.resolve(oplHome), 'carriers', 'codex-marketplace');
  return path.join(paths.home_dir, '.opl', 'carriers', 'codex-marketplace');
}

export class DaemonRuntime {
  readonly paths: StatePaths;
  readonly version: string;
  readonly startedAt: string;
  readonly marketplaceRoot: string;
  readonly db: SqliteDb;
  readonly lock: AdvisoryLockHandle;
  readonly eventBus: EventBus<Record<string, Record<string, unknown>>>;
  readonly ledgerStore: LedgerStore;
  readonly packService: PackService;
  readonly connectService: ConnectService;
  readonly channelBindingStore: SqliteChannelThreadBindingStore;
  readonly channelHost: ChannelProviderHost;
  readonly workspaceService: WorkspaceService;
  readonly runwayStore: SqliteRunwayStore;
  readonly executorRegistry: ExecutorRegistry;
  readonly runwayRuntime: RunwayRuntime;
  readonly scheduleRunner: ScheduleRunner;
  readonly appStateCache: AppStateCache;
  readonly contributionDispatcher: ContributionDispatcher;
  readonly #daemonSessionId = newId('opld_sess');
  readonly #onEvent?: (method: string, params: Record<string, unknown>) => void;
  readonly #registeredProviderTypes = new Set<string>();
  readonly #activeChannelTurns = new Map<string, ChannelTurnRef>();
  readonly #channelTurnObservers = new Map<string, Set<ChannelTurnTerminalObserver>>();
  readonly #channelTurnCompleted = new Map<string, ChannelTurnTerminalEvent>();
  readonly #backgroundStagePromises = new Set<Promise<void>>();
  readonly #activeTaskLoops = new Map<string, Promise<void>>();
  readonly #pendingTaskLoops = new Set<string>();
  readonly #launchingTaskStages = new Map<string, { readonly stageRunId: string; readonly promise: Promise<void> }>();
  #initializedAsync = false;
  #closed = false;

  private constructor(options: {
    readonly paths: StatePaths;
    readonly version: string;
    readonly startedAt: string;
    readonly marketplaceRoot: string;
    readonly db: SqliteDb;
    readonly lock: AdvisoryLockHandle;
    readonly onEvent?: (method: string, params: Record<string, unknown>) => void;
  }) {
    this.paths = options.paths;
    this.version = options.version;
    this.startedAt = options.startedAt;
    this.marketplaceRoot = options.marketplaceRoot;
    this.db = options.db;
    this.lock = options.lock;
    this.#onEvent = options.onEvent;
    this.eventBus = new EventBus();

    const emitPush = (method: string, params: Record<string, unknown>) => {
      this.#onEvent?.(method, params);
    };

    this.ledgerStore = new LedgerStore(this.db, {
      onAppended: (entries) => {
        this.appStateCache?.invalidate();
        for (const entry of entries) {
          emitPush('event.ledger.appended', {
            task_id: entry.task_id,
            stage_run_id: entry.stage_run_id,
            attempt_id: entry.attempt_id,
            entry_id: entry.entry_id,
            entry_kind: entry.entry_kind,
            owner_id: entry.owner_id,
            entry,
          });
        }
      },
    });

    // Omit codexRunner on PackService so link/install/update/uninstall/toggle perform
    // deterministic filesystem projection without invoking external `codex plugin add`.
    this.packService = createPackService({
      db: this.db,
      stateDir: this.paths.state_dir,
      marketplaceRoot: this.marketplaceRoot,
      skipMigrations: true,
    });

    this.connectService = createConnectService({
      db: this.db,
      stateDir: this.paths.state_dir,
      skipMigrations: true,
      verifyRuntimeDigest: (snap) => this.packService.verifyRuntimeDigest(snap),
    });

    this.channelBindingStore = new SqliteChannelThreadBindingStore(this.db);

    this.channelHost = new ChannelProviderHost({
      discovery: new SqliteChannelPackageDiscovery(this.db),
      callback: {
        startThread: async (identity) => this.channelBindingStore.startThread(identity),
        resumeThread: async (ref) => {
          this.channelBindingStore.resumeThread(ref);
        },
        startTurn: async (input) => {
          if (this.#closed) {
            throw new ChannelError('CHANNEL_PROVIDER_UNAVAILABLE', 'Daemon runtime is shutting down.');
          }
          const binding = this.channelBindingStore.getBindingByThread(input);
          if (!binding) {
            throw new ChannelError(
              'CHANNEL_IDENTITY_MISMATCH',
              `Channel thread binding not found: ${input.canonical_thread_host}:${input.canonical_thread_id}`,
            );
          }

          let workspace;
          if (binding.workspace_id) {
            try {
              workspace = this.workspaceService.getWorkspace(binding.workspace_id);
            } catch (error) {
              throw new ChannelError(
                'CHANNEL_PROVIDER_UNAVAILABLE',
                `Bound workspace '${binding.workspace_id}' is unavailable for channel turn.`,
                { cause: error },
              );
            }
          } else {
            const workspaces = this.workspaceService.listWorkspaces();
            if (workspaces.length === 0) {
              throw new ChannelError(
                'CHANNEL_PROVIDER_UNAVAILABLE',
                'No workspace is bound or available to execute channel turn.',
              );
            }
            workspace = workspaces[workspaces.length - 1]!;
          }

          const candidateExecutors = [
            'codex',
            'antigravity',
            ...this.executorRegistry.list().map((a) => a.capabilities.executor_id),
          ];
          const seenExecutors = new Set<string>();
          let selectedExecutorId: string | null = null;
          for (const execId of candidateExecutors) {
            if (seenExecutors.has(execId)) continue;
            seenExecutors.add(execId);
            const adapter = this.executorRegistry.getOptional(execId);
            if (!adapter) continue;
            try {
              const health = await adapter.healthCheck();
              if (health.available) {
                selectedExecutorId = execId;
                break;
              }
            } catch {
              // treat failing health check as unavailable
            }
          }
          if (!selectedExecutorId) {
            throw new ChannelError(
              'CHANNEL_PROVIDER_UNAVAILABLE',
              'No healthy executor is available to execute channel turn.',
            );
          }

          const bundle = this.runwayRuntime.createTask({
            workspace_id: workspace.workspace_id,
            agent_id: null,
            title: `Channel turn (${binding.provider_id}:${binding.channel_session_id})`,
            goal_prompt: input.text,
            stages: [{ stage_id: 'channel_turn', executor_id: selectedExecutorId }],
          });
          const stageRunId = bundle.stage_runs[0]!.stage_run_id;
          this.channelBindingStore.recordTurnDispatch({
            binding_id: binding.binding_id,
            workspace_id: workspace.workspace_id,
            last_task_id: bundle.task_id,
          });

          const turnRef: ChannelTurnRef = {
            canonical_thread_host: input.canonical_thread_host,
            canonical_thread_id: input.canonical_thread_id,
            canonical_turn_id: newId('turn'),
          };
          this.#activeChannelTurns.set(turnRef.canonical_turn_id, turnRef);

          const turnPromise = this.runwayRuntime
            .executeStage(stageRunId, { prompt_override: input.text })
            .then((res): ChannelTurnTerminalEvent => {
              if (res.outcome.status === 'succeeded') {
                return {
                  ...turnRef,
                  status: 'completed',
                  response_text:
                    res.outcome.summary_text?.trim()
                    || `Completed stage '${res.stage_run.stage_id}' (task=${res.task.task_id}, attempt=${res.attempt_id}).`,
                };
              }
              if (
                res.outcome.status === 'cancelled'
                || res.stage_run.status === 'cancelled'
                || res.task.status === 'cancelled'
              ) {
                return { ...turnRef, status: 'cancelled' };
              }
              return {
                ...turnRef,
                status: 'failed',
                error: {
                  code:
                    res.outcome.error?.code
                    ?? (res.outcome.status === 'human_gate' ? 'HUMAN_GATE_REQUIRED' : 'EXECUTOR_FAILED'),
                  message:
                    res.outcome.error?.message
                    ?? res.outcome.human_gate?.question
                    ?? `Channel turn ended with status '${res.outcome.status}'.`,
                },
              };
            })
            .catch((err): ChannelTurnTerminalEvent => ({
              ...turnRef,
              status: 'failed',
              error: {
                code:
                  err instanceof Error && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
                    ? String((err as { code: unknown }).code)
                    : 'CHANNEL_TURN_FAILED',
                message: err instanceof Error ? err.message : String(err),
              },
            }))
            .then((terminalEvent) => {
              this.#completeChannelTurn(turnRef.canonical_turn_id, terminalEvent);
            })
            .finally(() => {
              this.#backgroundStagePromises.delete(turnPromise);
            });
          this.#backgroundStagePromises.add(turnPromise);
          return turnRef;
        },
        subscribeTurn: (input, observer) => {
          const ref =
            this.#activeChannelTurns.get(input.canonical_turn_id)
            ?? this.#channelTurnCompleted.get(input.canonical_turn_id);
          if (
            !ref
            || ref.canonical_thread_host !== input.canonical_thread_host
            || ref.canonical_thread_id !== input.canonical_thread_id
          ) {
            throw new ChannelError(
              'CHANNEL_IDENTITY_MISMATCH',
              `Channel turn '${input.canonical_turn_id}' is unknown or thread-mismatched.`,
            );
          }

          const observersMap = this.#channelTurnObservers;
          let set = observersMap.get(input.canonical_turn_id);
          if (!set) {
            set = new Set();
            observersMap.set(input.canonical_turn_id, set);
          }
          set.add(observer);
          const alreadyDone = this.#channelTurnCompleted.get(input.canonical_turn_id);
          if (alreadyDone) {
            setImmediate(() => {
              if (set?.has(observer)) {
                set.delete(observer);
                if (set.size === 0 && observersMap.get(input.canonical_turn_id) === set) {
                  observersMap.delete(input.canonical_turn_id);
                }
                void Promise.resolve()
                  .then(() => observer.onTerminal(alreadyDone))
                  .catch(() => {});
              }
            });
          }
          return {
            dispose() {
              set?.delete(observer);
              if (set && set.size === 0 && observersMap.get(input.canonical_turn_id) === set) {
                observersMap.delete(input.canonical_turn_id);
              }
            },
          };
        },
        readTransportBindings: async () => this.channelBindingStore.listBindings(),
      },
    });

    const emitLedgerEntries = (entries: readonly unknown[]) => {
      for (const entry of entries) {
        const rec = entry as Record<string, unknown>;
        emitPush('event.ledger.appended', {
          task_id: rec.task_id,
          stage_run_id: rec.stage_run_id,
          attempt_id: rec.attempt_id,
          entry_id: rec.entry_id,
          entry_kind: rec.entry_kind,
          owner_id: rec.owner_id,
          entry: rec,
        });
      }
    };

    this.workspaceService = createWorkspaceService({
      db: this.db,
      stateDir: this.paths.state_dir,
      onMutate: () => {
        this.appStateCache.invalidate();
      },
      onLedgerAppended: emitLedgerEntries,
    });

    this.runwayStore = new SqliteRunwayStore({
      db: this.db,
      onMutate: () => {
        this.appStateCache.invalidate();
      },
      onRunwayChanged: (ev) => {
        emitPush('event.runway.changed', { ...ev });
      },
      onLedgerAppended: emitLedgerEntries,
    });

    this.executorRegistry = new ExecutorRegistry();
    this.executorRegistry.register(new CodexExecutorAdapter());
    this.executorRegistry.register(
      new AntigravityExecutorAdapter({
        spoolDir: path.join(this.paths.state_dir, 'runway', 'spools'),
      }),
    );

    this.runwayRuntime = new RunwayRuntime({
      db: this.db,
      store: this.runwayStore,
      registry: this.executorRegistry,
      workspaceService: this.workspaceService,
      packStore: this.packService.store,
      bindTokenAuthority: this.connectService as unknown as ConsumerBindTokenAuthority,
      trustedHostClientContext: createClientContext({
        session_id: this.#daemonSessionId,
        client_kind: 'opl_app',
      }),
      daemonSessionId: this.#daemonSessionId,
      preSnapshotDir: path.join(this.paths.state_dir, 'runway', 'pre-snapshots'),
      onRunwayChanged: (ev) => {
        emitPush('event.runway.changed', { ...ev });
      },
    });

    this.scheduleRunner = new ScheduleRunner({
      store: this.runwayStore,
      onCancelTask: async (taskId, reason) => {
        await this.runwayRuntime.interruptTask(taskId, reason);
      },
      onTaskLaunched: (taskId) => {
        this.launchNextStageInBackground(taskId);
      },
    });

    initializeAppPackagePreferences(this.db, this.paths.state_dir);
    this.appStateCache = new AppStateCache({
      db: this.db,
      packService: this.packService,
      connectService: this.connectService,
      version: this.version,
      onCatalogChanged: () => emitPush('event.pack.catalog.changed', {}),
    });

    this.contributionDispatcher = new ContributionDispatcher({
      isAppPackageEnabled: (packageId: string) => isAppPackageEnabled(this.db, packageId),
      packService: this.packService,
      connectService: this.connectService,
      workspaceService: this.workspaceService,
    });

    this.packService.eventBus.on('event.pack.progress', (ev) => {
      this.appStateCache.invalidate();
      emitPush('event.pack.progress', { ...ev });
    });

    this.connectService.eventBus.on('event.connect.changed', (ev) => {
      this.appStateCache.invalidate();
      emitPush('event.connect.changed', { ...ev });
    });

    this.channelHost.eventBus.on('channel.provider.status_changed', (ev) => {
      this.appStateCache.invalidate();
      emitPush('event.connect.changed', { topic: 'channel.provider.status_changed', ...ev });
    });
    this.channelHost.eventBus.on('channel.transport.bound', (ev) => {
      this.appStateCache.invalidate();
      emitPush('event.connect.changed', { topic: 'channel.transport.bound', ...ev });
    });
    this.channelHost.eventBus.on('channel.transport.error', (ev) => {
      this.appStateCache.invalidate();
      emitPush('event.connect.changed', { topic: 'channel.transport.error', ...ev });
    });

    this.packService.reconcileOperations();
    this.syncDeclaredProviders();
  }

  static start(options: DaemonRuntimeOptions = {}): DaemonRuntime {
    const paths = ensureStateDir(resolveStatePaths({ stateDir: options.stateDir }));
    fs.mkdirSync(path.join(paths.state_dir, 'logs'), { recursive: true });
    const lock = acquireAdvisoryLock(paths.lock_file, {
      ownerId: 'opld',
      timeoutMs: 0,
      mode: 0o600,
    });

    let db: SqliteDb | null = null;
    try {
      db = openSqliteStore(paths.db_file);
      ensureConnectSchema(db);
      ensureWorkspaceSchema(db);
      ensureRunwaySchema(db);
      try {
        prunePackStateArtifacts({
          stateDir: paths.state_dir,
          env: process.env,
          skipCodexHomeTmp: Boolean(process.env.NODE_TEST_CONTEXT && !process.env.CODEX_HOME?.trim()),
        });
      } catch {
        // Best-effort state hygiene must never block daemon startup.
      }
      return new DaemonRuntime({
        paths,
        version: options.version ?? readPackageVersion(),
        startedAt: nowIso(),
        marketplaceRoot: resolveMarketplaceRoot(paths),
        db,
        lock,
        onEvent: options.onEvent,
      });
    } catch (error) {
      try {
        db?.close();
      } catch {
        // ignore close error on failed boot
      }
      lock.release();
      throw error;
    }
  }

  async initializeAsync(): Promise<void> {
    if (this.#initializedAsync || this.#closed) return;
    this.#initializedAsync = true;
    await this.runwayRuntime.reconcile();
    this.runwayRuntime.start();
    this.scheduleRunner.start();
    await this.channelHost.reconcileWithInstalledPackages().catch(() => {});
    await this.channelHost.refreshTransportBindings().catch(() => {});
  }

  resolveAgentStages(agentId?: string | null): Array<{
    readonly stage_id: string;
    readonly executor_id?: string;
    readonly model_id?: string | null;
    readonly role?: AttemptRole;
  }> {
    if (!agentId) return [];
    const pkg = this.packService.inspect(agentId);
    const stagesRef = pkg?.manifest.provides?.agent?.stages_ref;
    if (!pkg || !stagesRef) return [];
    try {
      const realRoot = fs.realpathSync(pkg.install_path);
      const candidate = path.resolve(realRoot, stagesRef);
      const realStages = fs.realpathSync(candidate);
      if (realStages !== realRoot && !realStages.startsWith(`${realRoot}${path.sep}`)) {
        return [];
      }
      const parsed = JSON.parse(fs.readFileSync(realStages, 'utf8')) as unknown;
      const rawStages = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { stages?: unknown }).stages)
          ? (parsed as { stages: unknown[] }).stages
          : [];
      const out: Array<{
        readonly stage_id: string;
        readonly executor_id?: string;
        readonly model_id?: string | null;
        readonly role?: AttemptRole;
      }> = [];
      for (const item of rawStages) {
        if (typeof item === 'string' && item.trim()) {
          out.push({ stage_id: item.trim() });
        } else if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const sid = typeof rec.stage_id === 'string' ? rec.stage_id.trim() : typeof rec.id === 'string' ? rec.id.trim() : '';
          if (!sid) continue;
          const execId = typeof rec.executor_id === 'string' ? rec.executor_id.trim() : typeof rec.executor === 'string' ? rec.executor.trim() : undefined;
          const modId = typeof rec.model_id === 'string' ? rec.model_id.trim() : typeof rec.model === 'string' ? rec.model.trim() : undefined;
          const rawRole = typeof rec.role === 'string' ? rec.role.trim() : undefined;
          const role: AttemptRole | undefined =
            rawRole === 'producer' || rawRole === 'reviewer' || rawRole === 'repairer'
              ? rawRole
              : rawRole === 're_reviewer'
                ? 'reviewer'
                : undefined;
          out.push({
            stage_id: sid,
            ...(execId ? { executor_id: execId } : {}),
            ...(modId ? { model_id: modId } : {}),
            ...(role ? { role } : {}),
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  prepareDynamicStageForStart(input: {
    readonly task_id: string;
    readonly stage_id: string;
    readonly executor_id?: string;
    readonly model_id?: string | null;
  }): string {
    const bundle = this.runwayRuntime.getTask(input.task_id);
    const existing = bundle.stage_runs.find((sr) => sr.stage_id === input.stage_id);
    if (existing) {
      return existing.stage_run_id;
    }
    const ts = nowIso();
    return txImmediate(this.db, () => {
      const stages = this.runwayStore.listStageRuns(input.task_id);
      const placeholder =
        stages.length === 1
        && stages[0]!.stage_id === 'stage_1'
        && stages[0]!.status === 'queued'
        && !bundle.attempts.some((a) => a.stage_run_id === stages[0]!.stage_run_id)
          ? stages[0]!
          : null;
      if (placeholder) {
        this.db
          .prepare(
            'UPDATE stage_runs SET stage_id = ?, executor_id = COALESCE(?, executor_id), model_id = COALESCE(?, model_id), revision = revision + 1, updated_at = ? WHERE stage_run_id = ?',
          )
          .run(
            input.stage_id,
            input.executor_id ?? null,
            input.model_id ?? null,
            ts,
            placeholder.stage_run_id,
          );
        return placeholder.stage_run_id;
      }
      const maxSeq = stages.reduce((max, sr) => Math.max(max, sr.seq_no), 0);
      const stageRunId = newId('sr');
      this.db
        .prepare(
          'INSERT INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES (?, ?, ?, ?, \'queued\', ?, ?, NULL, 1, NULL, NULL, ?)',
        )
        .run(
          stageRunId,
          input.task_id,
          input.stage_id,
          maxSeq + 1,
          input.executor_id ?? 'codex',
          input.model_id ?? null,
          ts,
        );
      return stageRunId;
    });
  }

  requeueStageForResume(stageRunId: string): void {
    const ts = nowIso();
    txImmediate(this.db, () => {
      this.db
        .prepare(
          'UPDATE stage_runs SET status = \'queued\', revision = revision + 1, updated_at = ? WHERE stage_run_id = ?',
        )
        .run(ts, stageRunId);
    });
  }

  hasActiveTaskLoop(taskId: string): boolean {
    return this.#activeTaskLoops.has(taskId);
  }

  getLaunchingTaskStage(taskId: string): string | null {
    return this.#launchingTaskStages.get(taskId)?.stageRunId ?? null;
  }

  getChannelTurnObserverCount(turnId?: string): number {
    if (turnId !== undefined) {
      return this.#channelTurnObservers.get(turnId)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.#channelTurnObservers.values()) {
      total += set.size;
    }
    return total;
  }

  async runStageExecutionTracked<T>(
    taskId: string,
    stageRunId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#launchingTaskStages.set(taskId, { stageRunId, promise: barrier });
    try {
      return await fn();
    } finally {
      const current = this.#launchingTaskStages.get(taskId);
      if (current?.promise === barrier) {
        this.#launchingTaskStages.delete(taskId);
      }
      release();
    }
  }

  launchStageInBackground(
    stageRunId: string,
    options: ExecuteStageOptions = {},
    taskId?: string,
  ): Promise<void> {
    let resolvedTaskId = taskId;
    if (!resolvedTaskId) {
      try {
        resolvedTaskId = this.runwayStore.getStageRun(stageRunId).task_id;
      } catch {
        resolvedTaskId = undefined;
      }
    }
    const execPromise = resolvedTaskId
      ? this.runStageExecutionTracked(resolvedTaskId, stageRunId, () =>
          this.runwayRuntime.executeStage(stageRunId, options),
        )
      : this.runwayRuntime.executeStage(stageRunId, options);
    const p = execPromise
      .then(() => undefined)
      .catch(() => {
        // Stage failures / shutdown detaches are recorded in SQLite & emitted via event.runway.changed
      })
      .finally(() => {
        this.#backgroundStagePromises.delete(p);
      });
    this.#backgroundStagePromises.add(p);
    return p;
  }

  #completeChannelTurn(turnId: string, terminalEvent: ChannelTurnTerminalEvent): void {
    this.#activeChannelTurns.delete(turnId);
    if (this.#channelTurnCompleted.size >= 1000) {
      const oldestKey = this.#channelTurnCompleted.keys().next().value;
      if (oldestKey !== undefined) {
        this.#channelTurnCompleted.delete(oldestKey);
      }
    }
    this.#channelTurnCompleted.set(turnId, terminalEvent);
    const observers = this.#channelTurnObservers.get(turnId);
    if (!observers) return;
    const snapshot = [...observers];
    observers.clear();
    this.#channelTurnObservers.delete(turnId);
    for (const obs of snapshot) {
      void Promise.resolve()
        .then(() => obs.onTerminal(terminalEvent))
        .catch(() => {});
    }
  }

  launchNextStageInBackground(taskId: string, options: ExecuteStageOptions = {}): Promise<void> {
    const existing = this.#activeTaskLoops.get(taskId);
    if (existing) {
      this.#pendingTaskLoops.add(taskId);
      return existing;
    }

    const p = (async () => {
      try {
        await Promise.resolve();
        while (!this.#closed) {
          this.#pendingTaskLoops.delete(taskId);
          const bundle = this.runwayRuntime.getTask(taskId);
          if (bundle.task.status === 'active') {
            const inFlight = this.#launchingTaskStages.get(taskId);
            if (inFlight) {
              await inFlight.promise;
              continue;
            }
            const roleMap = new Map<string, AttemptRole>();
            for (const st of this.resolveAgentStages(bundle.task.agent_id)) {
              if (st.role) roleMap.set(st.stage_id, st.role);
            }
            const next = this.runwayStore.claimNextQueuedStage(taskId);
            if (next) {
              const stageRole = options.role ?? roleMap.get(next.stage_id);
              const res = await this.runwayRuntime.executeStage(next.stage_run_id, {
                ...options,
                ...(stageRole ? { role: stageRole } : {}),
              });
              if (res.stage_run.status === 'completed') {
                continue;
              }
            }
          }
          if (!this.#pendingTaskLoops.delete(taskId)) {
            break;
          }
        }
      } finally {
        this.#activeTaskLoops.delete(taskId);
        this.#pendingTaskLoops.delete(taskId);
      }
    })()
      .catch(() => {
        // Stage failures / shutdown detaches are recorded in SQLite & emitted via event.runway.changed
      })
      .finally(() => {
        this.#backgroundStagePromises.delete(p);
      });
    this.#activeTaskLoops.set(taskId, p);
    this.#backgroundStagePromises.add(p);
    return p;
  }

  syncDeclaredProviders(): void {
    const enabledPackages = this.packService.list({ enabledOnly: true });
    for (const pkg of enabledPackages) {
      const providers = pkg.manifest.provides?.connection_providers ?? [];
      for (const decl of providers) {
        const pkgId = pkg.package_id;
        const providerType = decl.provider_type;
        const provider: ConnectionProvider = {
          provider_type: providerType,
          listCapabilities: () =>
            decl.capabilities.map((cap) => ({
              capability_id: cap.id,
              title: resolveCapabilityTitle(cap.title, cap.id),
              risk: cap.risk,
            })),
          healthCheck: () => {
            const current = this.packService.inspect(pkgId);
            return Boolean(current && current.enabled);
          },
          invoke: async (invokeInput) => {
            const current = this.packService.inspect(pkgId);
            if (!current || !current.enabled) {
              throw new DaemonRpcError(
                -32003,
                'PROVIDER_UNAVAILABLE',
                `Provider package '${pkgId}' is not installed or enabled.`,
              );
            }
            const currentDecl = current.manifest.provides?.connection_providers?.find(
              (p) => p.provider_type === providerType,
            );
            if (!currentDecl) {
              throw new DaemonRpcError(
                -32004,
                'PROVIDER_UNAVAILABLE',
                `Provider '${providerType}' is no longer declared by '${pkgId}'.`,
              );
            }
            return runModuleOrCommandEntrypoint(current.install_path, currentDecl.entrypoint, {
              schema_version: 'opl-connect-provider-invoke.v1',
              provider_type: providerType,
              connection: invokeInput.connection,
              secret: invokeInput.secret,
              consumer_package_id: invokeInput.consumer_package_id,
              capability_id: invokeInput.capability_id,
              invocation_id: invokeInput.invocation_id,
              input: invokeInput.input,
            });
          },
        };
        this.connectService.registerProvider(provider);
        this.#registeredProviderTypes.add(providerType);
      }
    }
  }

  getCapabilitiesForProviderType(providerType: string): Array<{
    readonly capability_id: string;
    readonly title: unknown;
    readonly risk: 'read' | 'local_write' | 'external_write';
  }> {
    const enabledPackages = this.packService.list({ enabledOnly: true });
    for (const pkg of enabledPackages) {
      const decl = pkg.manifest.provides?.connection_providers?.find((p) => p.provider_type === providerType);
      if (decl) {
        return decl.capabilities.map((cap) => ({
          capability_id: cap.id,
          title: cap.title,
          risk: cap.risk,
        }));
      }
    }
    return [];
  }

  assertNoPluginsMirrorDir(packageDir: string, manifest: OplPackageManifestV2): void {
    const pluginName = resolveCodexPluginName(manifest);
    const candidates = [...new Set([pluginName, manifest.identity.id])];
    for (const name of candidates) {
      const mirrorPath = path.join(packageDir, 'plugins', name);
      if (fs.existsSync(mirrorPath)) {
        throw new PackError(
          'INVALID_MANIFEST',
          `Package '${manifest.identity.id}' contains forbidden plugins/${name}/ source mirror directory; run 'opl pack migrate-v1 --apply --clean' first.`,
          { package_id: manifest.identity.id, forbidden_dir: `plugins/${name}` },
        );
      }
    }
  }

  async probeCliExtensions(packageRoot: string, manifest: OplPackageManifestV2): Promise<void> {
    const reservedNamespaces = new Set(['daemon', 'workspace', 'pack', 'connect', 'runway', 'ledger']);
    const extensions = manifest.provides?.cli_extensions ?? [];
    if (extensions.length === 0) return;

    const existingOwnerByNamespace = new Map<string, string>();
    for (const pkg of this.packService.list()) {
      if (pkg.package_id === manifest.identity.id) continue;
      for (const existingExt of pkg.manifest.provides?.cli_extensions ?? []) {
        existingOwnerByNamespace.set(existingExt.namespace, pkg.package_id);
      }
    }

    const declaredInManifest = new Set<string>();
    for (const ext of extensions) {
      if (reservedNamespaces.has(ext.namespace)) {
        throw new PackError(
          'INVALID_MANIFEST',
          `Extension '${manifest.identity.id}' cli_extensions namespace '${ext.namespace}' collides with reserved core namespace.`,
          { package_id: manifest.identity.id, namespace: ext.namespace },
        );
      }
      if (declaredInManifest.has(ext.namespace)) {
        throw new PackError(
          'INVALID_MANIFEST',
          `Extension '${manifest.identity.id}' declares duplicate cli_extensions namespace '${ext.namespace}'.`,
          { package_id: manifest.identity.id, namespace: ext.namespace },
        );
      }
      declaredInManifest.add(ext.namespace);

      const existingOwner = existingOwnerByNamespace.get(ext.namespace);
      if (existingOwner) {
        throw new PackError(
          'INVALID_MANIFEST',
          `Extension '${manifest.identity.id}' cli_extensions namespace '${ext.namespace}' collides with already-installed package '${existingOwner}'.`,
          { package_id: manifest.identity.id, namespace: ext.namespace, colliding_package_id: existingOwner },
        );
      }

      if (ext.entrypoint.kind === 'esm_module') {
        const res = await runEsmEntrypoint(packageRoot, ext.entrypoint, 'probe_cli_ext', {
          package_id: manifest.identity.id,
          namespace: ext.namespace,
        });
        if (!res || typeof res !== 'object') {
          throw new PackError(
            'INVALID_MANIFEST',
            `Extension '${manifest.identity.id}' cli_extensions '${ext.namespace}' failed probe.`,
          );
        }
      } else {
        await runCliEntrypoint(packageRoot, ext.entrypoint, {
          action: 'describe',
          package_id: manifest.identity.id,
          namespace: ext.namespace,
        });
      }
    }
  }

  async linkPackage(input: {
    readonly dir: string;
    readonly syncCodex?: boolean;
    readonly clientContext?: ClientContext;
  }): Promise<ReturnType<PackService['link']>> {
    const { realRoot, manifest } = readPackageManifestFromDir(input.dir);
    this.assertNoPluginsMirrorDir(realRoot, manifest);
    await this.probeCliExtensions(realRoot, manifest);
    const res = await this.packService.link(input);
    this.syncDeclaredProviders();
    await this.channelHost.reconcileWithInstalledPackages().catch(() => {});
    this.appStateCache.invalidate();
    return res;
  }

  async installPackage(input: Parameters<PackService['install']>[0]): Promise<ReturnType<PackService['install']>> {
    const res = await this.packService.install(input);
    try {
      await this.probeCliExtensions(res.package.install_path, res.package.manifest);
    } catch (error) {
      await this.packService.uninstall({ packageId: res.package.package_id }).catch(() => {});
      throw error;
    }
    this.syncDeclaredProviders();
    await this.channelHost.reconcileWithInstalledPackages().catch(() => {});
    this.appStateCache.invalidate();
    return res;
  }

  async codexSync(input: {
    readonly packageId?: string;
    readonly importExternal?: boolean;
  } = {}): Promise<{
    readonly ok: true;
    readonly synced: readonly CodexSyncProjectionResult[];
    readonly imported_external: readonly InstalledPackageRecord[];
  }> {
    const targets = input.packageId
      ? [this.packService.inspect(input.packageId)].filter(
          (p): p is InstalledPackageRecord => p !== null,
        )
      : this.packService.list().filter((p) => p.origin !== 'external');

    if (input.packageId && targets.length === 0) {
      throw new PackError('PACK_NOT_FOUND', `Package '${input.packageId}' is not installed.`);
    }

    const managedPluginIds = new Set<string>();
    const projectedMap = new Map<string, { pkg: InstalledPackageRecord; pluginName: string; synced: boolean; pluginDir: string | null }>();

    for (const pkg of targets) {
      const pluginName = resolveCodexPluginName(pkg.manifest);
      managedPluginIds.add(pluginName);
      managedPluginIds.add(`${pluginName}@${OPL_LOCAL_MARKETPLACE_NAME}`);

      if (!pkg.enabled || !shouldSyncToCodex(pkg.manifest)) {
        removeCodexMarketplaceProjection({
          packageId: pkg.package_id,
          pluginName,
          marketplaceRoot: this.marketplaceRoot,
        });
        projectedMap.set(pkg.package_id, { pkg, pluginName, synced: false, pluginDir: null });
      } else {
        const proj = projectPackageToCodexMarketplace({
          manifest: pkg.manifest,
          installPath: pkg.install_path,
          marketplaceRoot: this.marketplaceRoot,
        });
        projectedMap.set(pkg.package_id, {
          pkg,
          pluginName,
          synced: true,
          pluginDir: proj.plugin_dir,
        });
      }
    }

    const runner = createProcessCodexRunner({ timeoutMs: 3000 });
    const listResp = await runner.listPlugins({ forceRefetch: false }, process.env);
    if (listResp.marketplaceLoadErrors.length > 0) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        'OPL_CODEX_PLUGIN_READBACK: Codex plugin/list reported marketplaceLoadErrors.',
        { errors: listResp.marketplaceLoadErrors },
      );
    }

    const realMarketplaceRoot = fs.existsSync(this.marketplaceRoot)
      ? fs.realpathSync(this.marketplaceRoot)
      : path.resolve(this.marketplaceRoot);

    const scopedPlugins = listResp.marketplaces
      .filter((mp) => {
        if (mp.name === OPL_LOCAL_MARKETPLACE_NAME) return true;
        if (!mp.path) return false;
        const mpReal = fs.existsSync(mp.path) ? fs.realpathSync(mp.path) : path.resolve(mp.path);
        return mpReal === realMarketplaceRoot;
      })
      .flatMap((mp) => mp.plugins);

    const synced: CodexSyncProjectionResult[] = [];
    for (const entry of projectedMap.values()) {
      const pluginId = `${entry.pluginName}@${OPL_LOCAL_MARKETPLACE_NAME}`;
      if (entry.synced && entry.pluginDir) {
        const matched =
          scopedPlugins.find((p) => p.id === pluginId)
          ?? scopedPlugins.find((p) => p.name === entry.pluginName);
        if (!matched || !matched.installed || !matched.enabled) {
          throw new PackError(
            'PACK_CODEX_SYNC_FAILED',
            `OPL_CODEX_PLUGIN_READBACK: Codex plugin/list parity failed for '${pluginId}'.`,
            { matched: matched ?? null },
          );
        }
        const reportedVersion = matched.version ?? matched.localVersion;
        if (reportedVersion && reportedVersion !== entry.pkg.version) {
          throw new PackError(
            'PACK_CODEX_SYNC_FAILED',
            `OPL_CODEX_PLUGIN_READBACK: version mismatch for '${pluginId}': expected ${entry.pkg.version}, got ${reportedVersion}.`,
          );
        }
        if (matched.source.type === 'local') {
          const realProjected = fs.realpathSync(entry.pluginDir);
          const realReported = fs.existsSync(matched.source.path)
            ? fs.realpathSync(matched.source.path)
            : path.resolve(matched.source.path);
          if (realReported !== realProjected) {
            throw new PackError(
              'PACK_CODEX_SYNC_FAILED',
              `OPL_CODEX_PLUGIN_READBACK: path mismatch for '${pluginId}': expected ${realProjected}, got ${realReported}.`,
            );
          }
        }
      }

      this.packService.store.setPackageCarrierSynced(entry.pkg.package_id, entry.synced);
      synced.push({
        package_id: entry.pkg.package_id,
        plugin_name: entry.pluginName,
        synced: entry.synced,
        marketplace_root: this.marketplaceRoot,
        marketplace_manifest_path: path.join(this.marketplaceRoot, '.agents', 'plugins', 'marketplace.json'),
        plugin_dir: entry.pluginDir,
        verified_by_readback: entry.synced,
      });
    }

    const importedExternal: InstalledPackageRecord[] = [];
    if (input.importExternal !== false) {
      const discovered = await discoverExternalCodexPlugins({
        runner,
        managedPluginIds,
        marketplaceRoot: this.marketplaceRoot,
        stateDir: this.paths.state_dir,
      });
      const seenExternalIds = new Set<string>();
      for (const ext of discovered) {
        seenExternalIds.add(ext.summary.package_id);
        const rec = this.packService.store.upsertInstalledPackage({
          manifest: ext.manifest,
          origin: 'external',
          install_mode: 'release',
          install_path: ext.summary.install_path,
          content_digest: ext.content_digest,
          enabled: ext.summary.enabled,
          carrier_synced: true,
        });
        importedExternal.push(rec);
      }

      const existingExternals = this.packService.store.listInstalledPackages({ origin: 'external' });
      for (const existing of existingExternals) {
        if (!seenExternalIds.has(existing.package_id)) {
          this.packService.store.deleteInstalledPackageAndRevokeGrants(existing.package_id);
        }
      }
    }

    this.appStateCache.invalidate();
    return {
      ok: true,
      synced,
      imported_external: importedExternal,
    };
  }

  verifyLedgerTask(taskId: string, checkFileHashes = true): ReturnType<typeof verifyTaskLineage> {
    const task = this.runwayRuntime.getTask(taskId);
    const ws = this.workspaceService.getWorkspace(task.task.workspace_id);
    return verifyTaskLineage(this.db, taskId, {
      workspace_root: ws.root_path,
      check_file_hashes: checkFileHashes,
    });
  }

  doctor(includeFirstRun = false): Record<string, unknown> {
    const jmRow = this.db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
    const fkRow = this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined;
    const btRow = this.db.prepare('PRAGMA busy_timeout').get() as { timeout?: number; busy_timeout?: number } | undefined;
    const syncRow = this.db.prepare('PRAGMA synchronous').get() as { synchronous?: number } | undefined;
    const tempRow = this.db.prepare('PRAGMA temp_store').get() as { temp_store?: number } | undefined;
    const migRow = this.db.prepare('SELECT MAX(version) AS max_version FROM schema_migrations').get() as
      | { max_version?: number }
      | undefined;

    const pragmas = {
      journal_mode: String(jmRow?.journal_mode ?? '').toLowerCase(),
      foreign_keys: Number(fkRow?.foreign_keys ?? 0),
      busy_timeout: Number(btRow?.timeout ?? btRow?.busy_timeout ?? 0),
      synchronous: Number(syncRow?.synchronous ?? 0),
      temp_store: Number(tempRow?.temp_store ?? 0),
    };

    const permissionTargets = [
      this.paths.session_file,
      this.paths.lock_file,
      ...(process.platform !== 'win32' ? [this.paths.socket_path] : []),
    ];
    const permissions: Array<{
      readonly path: string;
      readonly exists: boolean;
      readonly previous_mode?: string;
      readonly current_mode?: string;
      readonly repaired: boolean;
      readonly error?: string;
    }> = [];
    for (const targetPath of permissionTargets) {
      if (!fs.existsSync(targetPath)) {
        permissions.push({ path: targetPath, exists: false, repaired: false });
        continue;
      }
      if (process.platform === 'win32') {
        permissions.push({ path: targetPath, exists: true, repaired: false });
        continue;
      }
      const prevMode = fs.statSync(targetPath).mode & 0o777;
      const prevStr = prevMode.toString(8).padStart(4, '0');
      if (prevMode !== 0o600) {
        try {
          fs.chmodSync(targetPath, 0o600);
          permissions.push({
            path: targetPath,
            exists: true,
            previous_mode: prevStr,
            current_mode: '0600',
            repaired: true,
          });
        } catch (error) {
          permissions.push({
            path: targetPath,
            exists: true,
            previous_mode: prevStr,
            current_mode: prevStr,
            repaired: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        permissions.push({
          path: targetPath,
          exists: true,
          previous_mode: prevStr,
          current_mode: prevStr,
          repaired: false,
        });
      }
    }

    const packages = this.packService.list();
    return {
      ok: true,
      version: this.version,
      api_version: '2.0',
      pid: process.pid,
      pragmas,
      permissions,
      sqlite: {
        pragmas,
        schema_version: Number(migRow?.max_version ?? 0),
        db_file: this.paths.db_file,
      },
      paths: {
        ...this.paths,
        marketplace_root: this.marketplaceRoot,
      },
      ...(includeFirstRun
        ? {
            first_run: {
              needs_onboarding: packages.length === 0,
              installed_package_count: packages.length,
            },
          }
        : {}),
    };
  }

  listCliExtensions(): DiscoveredCliExtension[] {
    const enabled = this.packService.list({ enabledOnly: true });
    const out: DiscoveredCliExtension[] = [];
    for (const pkg of enabled) {
      for (const ext of pkg.manifest.provides?.cli_extensions ?? []) {
        out.push({
          package_id: pkg.package_id,
          namespace: ext.namespace,
          install_path: pkg.install_path,
          entrypoint: ext.entrypoint,
        });
      }
    }
    return out;
  }

  async executeChannelAction(input: {
    readonly package_id: string;
    readonly ref: string;
    readonly input?: Record<string, unknown>;
    readonly confirmed?: boolean;
  }): Promise<Record<string, unknown>> {
    try {
      return (await this.channelHost.executeChannelAccessAction({
        package_id: input.package_id,
        ref: input.ref,
        input: input.input ?? {},
        confirmed: input.confirmed,
      })) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ChannelError) {
        throw new DaemonRpcError(-32004, error.code, error.message);
      }
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;

    try {
      this.scheduleRunner.stop();
    } catch {
      // ignore
    }

    try {
      await this.runwayRuntime.detachOnShutdown();
    } catch {
      // ignore detach errors during shutdown
    }

    try {
      await this.channelHost.dispose();
    } catch {
      // ignore dispose errors during shutdown
    }

    if (this.#backgroundStagePromises.size > 0) {
      await Promise.race([
        Promise.allSettled([...this.#backgroundStagePromises]),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }

    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // ignore checkpoint errors if already closed
    }

    try {
      this.db.close();
    } catch {
      // ignore
    }

    try {
      fs.rmSync(this.paths.socket_path, { force: true });
    } catch {
      // ignore
    }
    try {
      fs.rmSync(this.paths.session_file, { force: true });
    } catch {
      // ignore
    }
    this.lock.release();
  }
}
