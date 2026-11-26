import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSqliteStore, type SqliteDb } from '@opl/core';
import { LedgerStore, type LedgerEntry } from '@opl/ledger';
import { PackStore } from '@opl/pack';
import { ensureWorkspaceSchema, WorkspaceService, createWorkspaceService } from '@opl/workspace';
import {
  ExecutorRegistry,
  RunwayRuntime,
  SqliteRunwayStore,
  ensureRunwaySchema,
  type RunwayChangedEvent,
} from '../../src/index.ts';

export interface RunwayTestEnv {
  readonly tmpDir: string;
  readonly dbPath: string;
  readonly workspaceDir: string;
  readonly db: SqliteDb;
  readonly workspaceService: WorkspaceService;
  readonly ledgerStore: LedgerStore;
  readonly packStore: PackStore;
  readonly store: SqliteRunwayStore;
  readonly registry: ExecutorRegistry;
  readonly runtime: RunwayRuntime;
  readonly workspaceId: string;
  readonly events: RunwayChangedEvent[];
  readonly ledgerEvents: LedgerEntry[];
  readonly mutateCount: { value: number };
  cleanup(): void;
}

export function createRunwayTestEnv(options: {
  readonly heartbeatIntervalMs?: number;
  readonly leaseTtlMs?: number;
  readonly expirySweepIntervalMs?: number;
  readonly gracefulInterruptMs?: number;
} = {}): RunwayTestEnv {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runway-test-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const workspaceDir = path.join(tmpDir, 'workspace');
  fs.mkdirSync(workspaceDir, { recursive: true });

  const db = openSqliteStore(dbPath);
  ensureWorkspaceSchema(db);
  ensureRunwaySchema(db);

  const events: RunwayChangedEvent[] = [];
  const ledgerEvents: LedgerEntry[] = [];
  const mutateCount = { value: 0 };

  const workspaceService = createWorkspaceService({ db });
  const ws = workspaceService.initWorkspace({
    name: 'Test Workspace',
    root_path: workspaceDir,
    domain_id: 'mas',
  });

  const ledgerStore = new LedgerStore(db, {
    onAppended: (entries) => ledgerEvents.push(...entries),
  });
  const packStore = new PackStore({ db });
  const store = new SqliteRunwayStore({
    db,
    onMutate: () => {
      mutateCount.value += 1;
    },
    onRunwayChanged: (ev) => {
      events.push(ev);
    },
    onLedgerAppended: (entries) => {
      ledgerEvents.push(...entries);
    },
  });
  const registry = new ExecutorRegistry();
  const runtime = new RunwayRuntime({
    db,
    store,
    registry,
    workspaceService,
    packStore,
    heartbeatIntervalMs: options.heartbeatIntervalMs ?? 50,
    leaseTtlMs: options.leaseTtlMs ?? 200,
    expirySweepIntervalMs: options.expirySweepIntervalMs ?? 50,
    gracefulInterruptMs: options.gracefulInterruptMs ?? 150,
    onRunwayChanged: (ev) => {
      events.push(ev);
    },
  });

  return {
    tmpDir,
    dbPath,
    workspaceDir,
    db,
    workspaceService,
    ledgerStore,
    packStore,
    store,
    registry,
    runtime,
    workspaceId: ws.workspace_id,
    events,
    ledgerEvents,
    mutateCount,
    cleanup() {
      runtime.leaseManager.detachAll();
      try {
        db.close();
      } catch {
        // ignore
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}
