import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonBytes, canonicalJsonText } from '../../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { compileStandardAgentStageManifest } from '../../packages/public/standard-agent-action-runtime.ts';
import {
  foundryContentDigest,
  materializeFoundryOperationResult,
  validateFoundryEvaluationOperationIdentity,
  validateFoundryOperationResult,
  type FoundryEvaluationOperationIdentity,
  type FoundryOperationResultJournal,
} from '../../evolution/index.ts';
import type {
  ActivationPointer,
  ActivationRuntimeBindingVerification,
  ActivationTransaction,
  AgentVersion,
  CandidateCompiler,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  QualificationRecord,
  VersionRegistry,
} from '../../evolution/index.ts';
import {
  assertFoundryEventReplay,
  FOUNDRY_TERMINAL_STATES,
  snapshotFromEvents,
  verifyFoundryEventChain,
  type FoundryRunEvent,
  type FoundryRunSnapshot,
} from '../../evolution/index.ts';

import {
  CANDIDATE_ACTION_CATALOG_PATH,
  CANDIDATE_INDEX_VERSION,
  CANDIDATE_QUALITY_POLICY_PATH,
  CANDIDATE_QUALITY_ROLE_PROMPT_PATH,
  CANDIDATE_QUALITY_RUBRIC_PATH,
  CANDIDATE_RESOURCE_FIELDS,
  CANDIDATE_RESOURCE_LOCK_PATH,
  CANDIDATE_RESOURCE_LOCK_VERSION,
  CANDIDATE_STAGE_MANIFEST_PATH,
  FILE_STORE_VERSION,
  VERSION_REGISTRY_EPOCH_DIRECTORY,
  VERSION_REGISTRY_EPOCH_MARKER,
  VERSION_REGISTRY_EPOCH_VERSION,
  candidateResourcePackPath,
  canonicalDigest,
  cleanupDeadMutationLocks,
  cleanupDeadStaging,
  cleanupLegacyMutationLockTemps,
  clone,
  contentDigestFromRef,
  digestSegment,
  ensureDurableDirectory,
  ensureStorage,
  errorCode,
  fail,
  foundryStoragePaths,
  fsyncDirectory,
  fsyncFile,
  processIsAlive,
  readJson,
  readMutationLock,
  readPhysicalCanonicalJson,
  reclaimAbandonedMutationLock,
  requireSafeSegment,
  requireDigest,
  requireExactKeys,
  requireRecord,
  requireString,
  requireUnique,
  requireWritable,
  sha256,
  stagedEntry,
  targetStorageKey,
  withMutationLock,
  writeAtomic,
  writeExclusive,
  writeStagedFile,
  type CandidateResourceBinding,
  type CandidateResourceKind,
  type CandidateResourceLock,
  type FoundryPersistentAdapterOptions,
  type FoundryStoragePaths,
  type MutationLockRecord,
} from './shared.ts';

function eventFile(paths: FoundryStoragePaths, runId: string, revision: number) {
  return path.join(paths.runs, requireSafeSegment(runId, 'run_id'), 'events', `${String(revision).padStart(10, '0')}.json`);
}

function runMetadataFile(paths: FoundryStoragePaths, runId: string) {
  return path.join(paths.runs, requireSafeSegment(runId, 'run_id'), 'run.json');
}

type RunLedgerMetadata = {
  surface_kind: 'opl_foundry_run_ledger_metadata';
  version: typeof FILE_STORE_VERSION;
  run_id: string;
  target_key: string;
};

type TargetReservation = {
  surface_kind: 'opl_foundry_target_reservation';
  version: typeof FILE_STORE_VERSION;
  run_id: string;
  target_key: string;
};


function targetKeyParts(targetKey: string) {
  const parts = targetKey.split('\0');
  if (parts.length !== 2 || !parts[0] || !parts[1]) fail('Foundry target key is invalid.');
  return { target_agent_id: parts[0], target_domain_id: parts[1] };
}

function snapshotTargetKey(snapshot: FoundryRunSnapshot) {
  if (!snapshot.target_agent_id || !snapshot.target_domain_id) {
    fail('FoundryRun acceptance event does not bind a target identity.', { run_id: snapshot.run_id });
  }
  return `${snapshot.target_agent_id}\0${snapshot.target_domain_id}`;
}

function assertTargetBinding(targetKey: string, snapshot: FoundryRunSnapshot) {
  targetKeyParts(targetKey);
  const expected = snapshotTargetKey(snapshot);
  if (targetKey !== expected) {
    fail('Foundry target key does not match the authoritative run target.', {
      run_id: snapshot.run_id,
      expected_target_key: expected,
      actual_target_key: targetKey,
    });
  }
}

function readRunMetadata(paths: FoundryStoragePaths, runId: string) {
  const raw = readPhysicalCanonicalJson<Record<string, unknown>>(runMetadataFile(paths, runId), 'FoundryRun metadata');
  requireExactKeys(raw, ['surface_kind', 'version', 'run_id', 'target_key'], 'FoundryRun metadata');
  if (
    raw.surface_kind !== 'opl_foundry_run_ledger_metadata'
    || raw.version !== FILE_STORE_VERSION
    || raw.run_id !== runId
    || typeof raw.target_key !== 'string'
  ) {
    fail('FoundryRun metadata identity is invalid.', { run_id: runId });
  }
  targetKeyParts(raw.target_key);
  return raw as RunLedgerMetadata;
}

function readRunEvents(paths: FoundryStoragePaths, runId: string): FoundryRunEvent[] {
  requireSafeSegment(runId, 'run_id');
  const directory = path.dirname(eventFile(paths, runId, 1));
  if (!fs.existsSync(directory)) return [];
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    fail('FoundryRun events must be a physical directory.', { run_id: runId });
  }
  const events = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const match = /^(\d{10})\.json$/.exec(entry.name);
      if (!match || !entry.isFile() || entry.isSymbolicLink()) {
        fail('FoundryRun event directory contains a forbidden entry.', { run_id: runId, entry: entry.name });
      }
      const event = readPhysicalCanonicalJson<FoundryRunEvent>(
        path.join(directory, entry.name),
        'FoundryRun event',
      );
      const fileRevision = Number(match[1]);
      if (event.run_id !== runId || event.revision !== fileRevision) {
        fail('FoundryRun event physical address does not match its identity.', {
          run_id: runId,
          event_id: event.event_id,
          file_revision: fileRevision,
        });
      }
      return event;
    });
  if (events.length > 0) verifyFoundryEventChain(events);
  return events;
}

function readRunLedger(paths: FoundryStoragePaths, runId: string) {
  requireSafeSegment(runId, 'run_id');
  const directory = path.join(paths.runs, runId);
  if (!fs.existsSync(directory)) return null;
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('FoundryRun ledger must be a physical directory.', { run_id: runId });
  }
  const actualEntries = fs.readdirSync(directory).sort();
  if (canonicalJsonText(actualEntries) !== canonicalJsonText(['events', 'run.json'])) {
    fail('FoundryRun ledger contains missing or forbidden entries.', { run_id: runId, actual_entries: actualEntries });
  }
  const metadata = readRunMetadata(paths, runId);
  const events = readRunEvents(paths, runId);
  if (events.length === 0) fail('FoundryRun ledger has no acceptance event.', { run_id: runId });
  const snapshot = snapshotFromEvents(events);
  assertTargetBinding(metadata.target_key, snapshot);
  return { metadata, events, snapshot };
}

function readAllRunLedgers(paths: FoundryStoragePaths) {
  if (!fs.existsSync(paths.runs)) return [];
  const ledgers = fs.readdirSync(paths.runs, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        fail('FoundryRun root contains a forbidden entry.', { entry: entry.name });
      }
      requireSafeSegment(entry.name, 'run_id');
      return readRunLedger(paths, entry.name)!;
    });
  const activeTargets = new Map<string, string>();
  for (const ledger of ledgers) {
    if (FOUNDRY_TERMINAL_STATES.has(ledger.snapshot.state)) continue;
    const prior = activeTargets.get(ledger.metadata.target_key);
    if (prior) {
      fail('Foundry target has multiple non-terminal authoritative runs.', {
        target_key: ledger.metadata.target_key,
        run_ids: [prior, ledger.snapshot.run_id],
      });
    }
    activeTargets.set(ledger.metadata.target_key, ledger.snapshot.run_id);
  }
  return ledgers;
}

function targetReservationFile(paths: FoundryStoragePaths, targetKey: string) {
  targetKeyParts(targetKey);
  return path.join(paths.target_locks, `${sha256(targetKey)}.json`);
}

function readTargetReservation(file: string, targetKey: string) {
  const raw = readPhysicalCanonicalJson<Record<string, unknown>>(file, 'Foundry target reservation');
  requireExactKeys(raw, ['surface_kind', 'version', 'run_id', 'target_key'], 'Foundry target reservation');
  if (
    raw.surface_kind !== 'opl_foundry_target_reservation'
    || raw.version !== FILE_STORE_VERSION
    || typeof raw.run_id !== 'string'
    || raw.target_key !== targetKey
  ) {
    fail('Foundry target reservation identity is invalid.', { target_key: targetKey });
  }
  requireSafeSegment(raw.run_id, 'run_id');
  return raw as TargetReservation;
}

function removeDurable(file: string) {
  if (!fs.existsSync(file)) return;
  fs.rmSync(file, { force: true });
  fsyncDirectory(path.dirname(file));
}

function repairTargetReservation(
  paths: FoundryStoragePaths,
  targetKey: string,
  snapshot: FoundryRunSnapshot,
) {
  assertTargetBinding(targetKey, snapshot);
  const file = targetReservationFile(paths, targetKey);
  if (FOUNDRY_TERMINAL_STATES.has(snapshot.state)) {
    if (fs.existsSync(file) && readTargetReservation(file, targetKey).run_id === snapshot.run_id) removeDurable(file);
    return;
  }
  const expected: TargetReservation = {
    surface_kind: 'opl_foundry_target_reservation',
    version: FILE_STORE_VERSION,
    run_id: snapshot.run_id,
    target_key: targetKey,
  };
  if (fs.existsSync(file)) {
    const existing = readTargetReservation(file, targetKey);
    if (canonicalJsonText(existing) !== canonicalJsonText(expected)) {
      fail('Target Agent already has an active write FoundryRun.', {
        target_key: targetKey,
        run_id: existing.run_id,
      });
    }
    return;
  }
  writeExclusive(file, canonicalJsonBytes(expected), paths.staging);
}

function activeRunForTarget(paths: FoundryStoragePaths, targetKey: string) {
  const active = readAllRunLedgers(paths).filter((entry) =>
    entry.metadata.target_key === targetKey && !FOUNDRY_TERMINAL_STATES.has(entry.snapshot.state));
  if (active.length > 1) {
    fail('Foundry target has multiple non-terminal authoritative runs.', {
      target_key: targetKey,
      run_ids: active.map((entry) => entry.snapshot.run_id),
    });
  }
  return active[0] ?? null;
}

function reconcileTargetReservation(paths: FoundryStoragePaths, targetKey: string) {
  const file = targetReservationFile(paths, targetKey);
  if (fs.existsSync(file)) {
    const reservation = readTargetReservation(file, targetKey);
    const ledger = readRunLedger(paths, reservation.run_id);
    if (!ledger) {
      removeDurable(file);
    } else {
      assertTargetBinding(targetKey, ledger.snapshot);
      if (FOUNDRY_TERMINAL_STATES.has(ledger.snapshot.state)) removeDurable(file);
      else return ledger;
    }
  }
  const active = activeRunForTarget(paths, targetKey);
  if (active) repairTargetReservation(paths, targetKey, active.snapshot);
  return active;
}

function configureStateIndex(db: DatabaseSync) {
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS foundry_runs (
      run_id TEXT PRIMARY KEY,
      target_agent_id TEXT NOT NULL,
      target_domain_id TEXT NOT NULL,
      state TEXT NOT NULL,
      revision INTEGER NOT NULL,
      generation INTEGER NOT NULL,
      risk_tier TEXT,
      version_digest TEXT,
      updated_at TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS foundry_runs_target
      ON foundry_runs(target_agent_id, target_domain_id, updated_at);
    CREATE TABLE IF NOT EXISTS foundry_state_index_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO foundry_state_index_meta(key, value) VALUES ('schema_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(FILE_STORE_VERSION);
}

function insertProjectedSnapshot(db: DatabaseSync, targetKey: string, snapshot: FoundryRunSnapshot) {
  assertTargetBinding(targetKey, snapshot);
  const target = targetKeyParts(targetKey);
  db.prepare(`
      INSERT INTO foundry_runs(
        run_id, target_agent_id, target_domain_id, state, revision, generation,
        risk_tier, version_digest, updated_at, snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        target_agent_id = excluded.target_agent_id,
        target_domain_id = excluded.target_domain_id,
        state = excluded.state,
        revision = excluded.revision,
        generation = excluded.generation,
        risk_tier = excluded.risk_tier,
        version_digest = excluded.version_digest,
        updated_at = excluded.updated_at,
        snapshot_json = excluded.snapshot_json
      WHERE excluded.revision >= foundry_runs.revision
    `).run(
      snapshot.run_id,
      target.target_agent_id,
      target.target_domain_id,
      snapshot.state,
      snapshot.revision,
      snapshot.generation,
      snapshot.risk_tier,
      snapshot.version_digest,
      snapshot.updated_at,
      canonicalJsonText(snapshot),
    );
}

function stateIndexLock(paths: FoundryStoragePaths) {
  return path.join(paths.mutation_locks, 'state-index.lock');
}

function projectSnapshot(paths: FoundryStoragePaths, targetKey: string, snapshot: FoundryRunSnapshot) {
  return withMutationLock(stateIndexLock(paths), paths.staging, () => {
    try {
      const stat = fs.lstatSync(paths.state_index);
      if (!stat.isFile() || stat.isSymbolicLink()) removeDurable(paths.state_index);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    const db = new DatabaseSync(paths.state_index);
    try {
      configureStateIndex(db);
      db.exec('BEGIN IMMEDIATE;');
      try {
        insertProjectedSnapshot(db, targetKey, snapshot);
        db.exec('COMMIT;');
      } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
      }
    } finally {
      db.close();
    }
  });
}

function projectedSnapshots(paths: FoundryStoragePaths) {
  if (!fs.existsSync(paths.state_index)) return null;
  const stat = fs.lstatSync(paths.state_index);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(paths.state_index, { readOnly: true });
    const version = db.prepare(
      "SELECT value FROM foundry_state_index_meta WHERE key = 'schema_version'",
    ).get() as { value?: unknown } | undefined;
    if (version?.value !== FILE_STORE_VERSION) return null;
    const rows = db.prepare(`
      SELECT target_agent_id, target_domain_id, revision, snapshot_json
      FROM foundry_runs
      ORDER BY run_id
    `).all() as Array<{
      target_agent_id: string;
      target_domain_id: string;
      revision: number;
      snapshot_json: string;
    }>;
    return rows.map((row) => {
      const snapshot = parseJsonText(row.snapshot_json) as FoundryRunSnapshot;
      if (
        row.snapshot_json !== canonicalJsonText(snapshot)
        || row.target_agent_id !== snapshot.target_agent_id
        || row.target_domain_id !== snapshot.target_domain_id
        || row.revision !== snapshot.revision
      ) {
        fail('Foundry state index row does not match its canonical snapshot.', { run_id: snapshot.run_id });
      }
      return snapshot;
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function buildStateIndex(paths: FoundryStoragePaths, ledgers: ReturnType<typeof readAllRunLedgers>) {
  const temporary = stagedEntry(paths.staging, 'state-index.sqlite');
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(temporary);
    configureStateIndex(db);
    db.exec('BEGIN IMMEDIATE;');
    try {
      for (const ledger of ledgers) {
        insertProjectedSnapshot(db, ledger.metadata.target_key, ledger.snapshot);
      }
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }
    const check = db.prepare('PRAGMA quick_check;').get() as { quick_check?: unknown } | undefined;
    if (check?.quick_check !== 'ok') fail('Foundry state index rebuild failed SQLite integrity check.');
    db.close();
    db = null;
    fs.chmodSync(temporary, 0o600);
    fsyncFile(temporary);
    for (const suffix of ['-wal', '-shm', '-journal']) {
      fs.rmSync(`${paths.state_index}${suffix}`, { force: true });
    }
    fs.renameSync(temporary, paths.state_index);
    fsyncDirectory(path.dirname(paths.state_index));
  } finally {
    db?.close();
    fs.rmSync(temporary, { force: true });
    fsyncDirectory(paths.staging);
  }
}

function rebuildStateIndexFromLedger(paths: FoundryStoragePaths) {
  return withMutationLock(stateIndexLock(paths), paths.staging, () => {
    const ledgers = readAllRunLedgers(paths);
    buildStateIndex(paths, ledgers);
    return ledgers;
  });
}

function stateIndexMatches(paths: FoundryStoragePaths, ledgers: ReturnType<typeof readAllRunLedgers>) {
  const projected = projectedSnapshots(paths);
  if (!projected) return false;
  const authoritative = ledgers.map((entry) => entry.snapshot).sort((left, right) => left.run_id.localeCompare(right.run_id));
  return canonicalJsonText(projected) === canonicalJsonText(authoritative);
}

function reconcileRunDerivedState(
  paths: FoundryStoragePaths,
  targetKey: string,
  events: FoundryRunEvent[],
) {
  const snapshot = snapshotFromEvents(events);
  projectSnapshot(paths, targetKey, snapshot);
  repairTargetReservation(paths, targetKey, snapshot);
  return snapshot;
}

export class LedgerFoundryEventStore implements FoundryEventStore {
  readonly #paths: FoundryStoragePaths;
  readonly #readOnly: boolean;

  constructor(rootOverride?: string, options: FoundryPersistentAdapterOptions = {}) {
    this.#paths = foundryStoragePaths(rootOverride);
    this.#readOnly = options.readOnly === true;
    if (!this.#readOnly) ensureStorage(this.#paths);
  }

  async create(input: { target_key: string; event: FoundryRunEvent }) {
    requireWritable(this.#readOnly, 'event_store_create');
    const runId = requireSafeSegment(input.event.run_id, 'run_id');
    verifyFoundryEventChain([input.event]);
    const inputSnapshot = snapshotFromEvents([input.event]);
    assertTargetBinding(input.target_key, inputSnapshot);
    const runDirectory = path.join(this.#paths.runs, runId);
    const targetMutationLock = path.join(this.#paths.mutation_locks, `target-${sha256(input.target_key)}.lock`);
    return withMutationLock(targetMutationLock, this.#paths.staging, () => {
      const existing = readRunLedger(this.#paths, runId);
      if (existing) {
        if (existing.metadata.target_key !== input.target_key) {
          fail('FoundryRun already exists for a different target.', { run_id: runId });
        }
        assertFoundryEventReplay(existing.events[0]!, input.event, 0);
        const active = reconcileTargetReservation(this.#paths, input.target_key);
        if (active && active.snapshot.run_id !== runId) {
          fail('Target Agent already has an active write FoundryRun.', {
            target_key: input.target_key,
            run_id: active.snapshot.run_id,
          });
        }
        projectSnapshot(this.#paths, input.target_key, existing.snapshot);
        return;
      }
      const active = reconcileTargetReservation(this.#paths, input.target_key);
      if (active) {
        fail('Target Agent already has an active write FoundryRun.', {
          target_key: input.target_key,
          run_id: active.snapshot.run_id,
        });
      }
      const temporary = stagedEntry(this.#paths.staging, 'run-ledger');
      fs.mkdirSync(temporary);
      fs.mkdirSync(path.join(temporary, 'events'));
      fsyncDirectory(temporary);
      const metadata: RunLedgerMetadata = {
        surface_kind: 'opl_foundry_run_ledger_metadata',
        version: FILE_STORE_VERSION,
        run_id: runId,
        target_key: input.target_key,
      };
      try {
        writeExclusive(path.join(temporary, 'run.json'), canonicalJsonBytes(metadata), this.#paths.staging);
        writeExclusive(
          path.join(temporary, 'events', '0000000001.json'),
          canonicalJsonBytes(input.event),
          this.#paths.staging,
        );
        fs.renameSync(temporary, runDirectory);
        fsyncDirectory(this.#paths.runs);
      } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        throw error;
      } finally {
        fsyncDirectory(this.#paths.staging);
      }
      reconcileRunDerivedState(this.#paths, input.target_key, [input.event]);
    });
  }

  async append(input: { target_key: string; expected_revision: number; event: FoundryRunEvent }) {
    requireWritable(this.#readOnly, 'event_store_append');
    const runId = requireSafeSegment(input.event.run_id, 'run_id');
    const targetMutationLock = path.join(this.#paths.mutation_locks, `target-${sha256(input.target_key)}.lock`);
    const runMutationLock = path.join(this.#paths.mutation_locks, `run-${sha256(runId)}.lock`);
    return withMutationLock(targetMutationLock, this.#paths.staging, () =>
      withMutationLock(runMutationLock, this.#paths.staging, () => {
      const ledger = readRunLedger(this.#paths, runId);
      if (!ledger) fail('FoundryRun does not exist.', { run_id: runId });
      if (ledger.metadata.target_key !== input.target_key) {
        fail('Foundry append target does not match run metadata.', { run_id: runId });
      }
      const active = reconcileTargetReservation(this.#paths, input.target_key);
      if (!active || active.snapshot.run_id !== runId) {
        fail('FoundryRun is not the authoritative active writer for its target.', { run_id: runId });
      }
      const events = ledger.events;
      const replay = events.find((entry) => entry.idempotency_key === input.event.idempotency_key);
      if (replay) {
        assertFoundryEventReplay(replay, input.event, input.expected_revision);
        reconcileRunDerivedState(this.#paths, input.target_key, events);
        return clone(replay);
      }
      const current = events.at(-1)!;
      if (current.revision !== input.expected_revision) {
        fail('FoundryRun revision compare-and-swap failed.', {
          expected_revision: input.expected_revision,
          actual_revision: current.revision,
        });
      }
      const next = [...events, input.event];
      verifyFoundryEventChain(next);
      writeExclusive(
        eventFile(this.#paths, runId, input.event.revision),
        canonicalJsonBytes(input.event),
        this.#paths.staging,
      );
      reconcileRunDerivedState(this.#paths, input.target_key, next);
      return clone(input.event);
    }));
  }

  async read(runId: string) {
    const ledger = readRunLedger(this.#paths, runId);
    if (!ledger) return [];
    if (!this.#readOnly) {
      try {
        const targetMutationLock = path.join(
          this.#paths.mutation_locks,
          `target-${sha256(ledger.metadata.target_key)}.lock`,
        );
        withMutationLock(targetMutationLock, this.#paths.staging, () => {
          repairTargetReservation(this.#paths, ledger.metadata.target_key, ledger.snapshot);
        });
        projectSnapshot(this.#paths, ledger.metadata.target_key, ledger.snapshot);
      } catch {
        // Event bytes are authoritative; a derived-state repair failure must not hide them.
      }
    }
    return clone(ledger.events);
  }

  async list() {
    let ledgers = readAllRunLedgers(this.#paths);
    if (!this.#readOnly && !stateIndexMatches(this.#paths, ledgers)) {
      try {
        ledgers = rebuildStateIndexFromLedger(this.#paths);
      } catch {
        // The append-only ledgers remain readable when their derived SQLite projection cannot be repaired yet.
      }
    }
    return ledgers
      .map((entry) => clone(entry.snapshot))
      .sort((left, right) => left.updated_at.localeCompare(right.updated_at) || left.run_id.localeCompare(right.run_id));
  }

  rebuildStateIndex() {
    requireWritable(this.#readOnly, 'event_store_rebuild_state_index');
    rebuildStateIndexFromLedger(this.#paths);
  }
}
