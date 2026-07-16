import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { foundryContentDigest } from '../foundry/index.ts';
import {
  materializeFoundryOperationResult,
  validateFoundryEvaluationOperationIdentity,
  validateFoundryOperationResult,
  type FoundryEvaluationOperationIdentity,
  type FoundryOperationResultJournal,
} from '../foundry/operation-result.ts';
import type {
  ActivationPointer,
  ActivationTransaction,
  AgentVersion,
  CandidateCompiler,
  FoundryEventStore,
  FoundryObjectStore,
  MaterializedCandidate,
  QualificationRecord,
  VersionRegistry,
} from '../foundry/index.ts';
import {
  FOUNDRY_TERMINAL_STATES,
  snapshotFromEvents,
  verifyFoundryEventChain,
  type FoundryRunEvent,
  type FoundryRunSnapshot,
} from '../foundry/index.ts';

const FILE_STORE_VERSION = 'opl-foundry-file-store.v1';
const CANDIDATE_INDEX_VERSION = 'opl-foundry-candidate-index.v2';
const CANDIDATE_RESOURCE_LOCK_VERSION = 'opl-foundry-candidate-resource-lock.v1';
const CANDIDATE_RESOURCE_LOCK_PATH = 'contracts/resource-lock.json';
const CANDIDATE_RESOURCE_FIELDS = [
  { kind: 'prompt', field: 'prompt_refs' },
  { kind: 'skill', field: 'skill_refs' },
  { kind: 'knowledge', field: 'knowledge_refs' },
  { kind: 'helper', field: 'helper_refs' },
  { kind: 'model', field: 'model_refs' },
  { kind: 'tool', field: 'tool_refs' },
] as const;

type CandidateResourceKind = typeof CANDIDATE_RESOURCE_FIELDS[number]['kind'];
type CandidateResourceBinding = {
  kind: CandidateResourceKind;
  declared_ref: string;
  immutable_ref: string;
  pack_path: string;
  sha256: string;
  byte_size: number;
};

type CandidateResourceLock = {
  surface_kind: 'opl_foundry_candidate_resource_lock';
  version: typeof CANDIDATE_RESOURCE_LOCK_VERSION;
  blueprint_digest: string;
  resources: CandidateResourceBinding[];
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalDigest(value: unknown) {
  return `sha256:${sha256(canonicalJsonText(value))}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function readJson<T>(file: string): T {
  return parseJsonText(fs.readFileSync(file, 'utf8')) as T;
}

function fsyncDirectory(directory: string) {
  let handle: number | null = null;
  try {
    handle = fs.openSync(directory, 'r');
    fs.fsyncSync(handle);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EINVAL' && code !== 'ENOTSUP' && code !== 'EBADF') throw error;
  } finally {
    if (handle !== null) fs.closeSync(handle);
  }
}

function ensureDurableDirectory(directory: string) {
  if (fs.existsSync(directory)) return;
  const parent = path.dirname(directory);
  if (parent !== directory) ensureDurableDirectory(parent);
  try {
    fs.mkdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  fsyncDirectory(parent);
}

function writeExclusive(file: string, bytes: Buffer) {
  ensureDurableDirectory(path.dirname(file));
  const handle = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(handle, bytes);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fsyncDirectory(path.dirname(file));
}

function writeAtomic(file: string, bytes: Buffer) {
  ensureDurableDirectory(path.dirname(file));
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const handle = fs.openSync(temporary, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(handle, bytes);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, file);
    fsyncDirectory(path.dirname(file));
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function processIsAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function reclaimAbandonedMutationLock(file: string) {
  try {
    const owner = readJson<{ pid?: unknown }>(file);
    if (typeof owner.pid !== 'number' || processIsAlive(owner.pid)) return false;
    fs.rmSync(file, { force: true });
    return true;
  } catch {
    return false;
  }
}

function acquireMutationLock(file: string) {
  const directory = path.dirname(file);
  ensureDurableDirectory(directory);
  const temporary = `${file}.prepare-${process.pid}-${crypto.randomUUID()}`;
  const handle = fs.openSync(temporary, 'wx', 0o600);
  let linked = false;
  try {
    fs.writeFileSync(handle, canonicalJsonBytes({ pid: process.pid, acquired_at: new Date().toISOString() }));
    fs.fsyncSync(handle);
    fs.linkSync(temporary, file);
    linked = true;
    fs.rmSync(temporary, { force: true });
    fsyncDirectory(directory);
    return handle;
  } catch (error) {
    fs.closeSync(handle);
    fs.rmSync(temporary, { force: true });
    if (linked) fs.rmSync(file, { force: true });
    throw error;
  }
}

function withMutationLock<T>(file: string, operation: () => T): T {
  let handle: number;
  let openError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = acquireMutationLock(file);
      openError = null;
      break;
    } catch (error) {
      openError = error;
      if (attempt === 0 && reclaimAbandonedMutationLock(file)) continue;
      break;
    }
  }
  if (openError) {
    fail('Foundry storage mutation is already in progress.', {
      lock_file: file,
      cause: openError instanceof Error ? openError.message : String(openError),
    });
  }
  try {
    return operation();
  } finally {
    fs.closeSync(handle!);
    fs.rmSync(file, { force: true });
    fsyncDirectory(path.dirname(file));
  }
}

function requireSafeSegment(value: string, field: string) {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    fail(`${field} is not a safe storage identity.`, { field });
  }
  return value;
}

function digestSegment(digest: string) {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail('Foundry digest is invalid.', { digest });
  return digest.slice('sha256:'.length);
}

function targetStorageKey(agentId: string, domainId: string) {
  return sha256(`${agentId}\0${domainId}`);
}

export type FoundryStoragePaths = ReturnType<typeof foundryStoragePaths>;

export function foundryStoragePaths(rootOverride?: string) {
  const root = rootOverride
    ? path.resolve(rootOverride)
    : path.join(resolveOplStatePaths().state_dir, 'foundry');
  return {
    root,
    objects: path.join(root, 'objects'),
    runs: path.join(root, 'ledger', 'runs'),
    target_locks: path.join(root, 'ledger', 'target-locks'),
    mutation_locks: path.join(root, 'locks'),
    content: path.join(root, 'content'),
    candidates: path.join(root, 'candidates'),
    operation_results: path.join(root, 'operation-results'),
    registry: path.join(root, 'versions'),
    state_index: path.join(root, 'state-index.sqlite'),
  };
}

function ensureStorage(paths: FoundryStoragePaths) {
  for (const directory of [
    paths.root,
    paths.objects,
    paths.runs,
    paths.target_locks,
    paths.mutation_locks,
    paths.content,
    paths.candidates,
    paths.operation_results,
    paths.registry,
  ]) {
    ensureDurableDirectory(directory);
  }
}

export class FileFoundryObjectStore implements FoundryObjectStore {
  readonly #paths: FoundryStoragePaths;

  constructor(rootOverride?: string) {
    this.#paths = foundryStoragePaths(rootOverride);
    ensureStorage(this.#paths);
  }

  async put<T>(value: T) {
    const digest = foundryContentDigest(value);
    const file = path.join(this.#paths.objects, `${digestSegment(digest)}.json`);
    const bytes = canonicalJsonBytes(value);
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file);
      if (!existing.equals(bytes)) fail('Content-addressed Foundry object collision.', { digest });
    } else {
      writeExclusive(file, bytes);
    }
    return { digest, ref: `opl://foundry/object/${digest}` };
  }

  async get<T>(digest: string) {
    const file = path.join(this.#paths.objects, `${digestSegment(digest)}.json`);
    if (!fs.existsSync(file)) return null;
    const value = readJson<T>(file);
    if (foundryContentDigest(value) !== digest) fail('Stored Foundry object digest does not match its address.', { digest });
    return clone(value);
  }
}

function contentDigestFromRef(ref: string) {
  const match = /^opl-content:\/\/sha256\/([a-f0-9]{64})$/.exec(ref);
  if (match) return match[1]!;
  if (ref.startsWith('opl-content:')) {
    fail('Foundry content ref is malformed.', { content_ref: ref });
  }
  return null;
}

export class FileFoundryContentStore {
  readonly #root: string;
  readonly #maxBytes: number;

  constructor(rootOverride?: string, maxBytes = 16 * 1024 * 1024) {
    const paths = foundryStoragePaths(rootOverride);
    ensureStorage(paths);
    const stat = fs.lstatSync(paths.content);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Foundry content store root must be a physical directory.');
    }
    this.#root = fs.realpathSync.native(paths.content);
    this.#maxBytes = maxBytes;
  }

  put(bytes: Buffer, expectedRef?: string) {
    if (bytes.byteLength <= 0 || bytes.byteLength > this.#maxBytes) {
      fail('Foundry content bytes are empty or exceed the content limit.', { byte_size: bytes.byteLength });
    }
    const digest = sha256(bytes);
    if (expectedRef && contentDigestFromRef(expectedRef) !== digest) {
      fail('Foundry content bytes do not match their content ref.', { content_ref: expectedRef });
    }
    const file = path.join(this.#root, `${digest}.blob`);
    if (fs.existsSync(file)) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(file).equals(bytes)) {
        fail('Foundry content address is occupied by invalid bytes.', { digest: `sha256:${digest}` });
      }
    } else {
      writeExclusive(file, bytes);
    }
    return {
      ref: `opl-content://sha256/${digest}`,
      digest: `sha256:${digest}`,
      byte_size: bytes.byteLength,
    };
  }

  readExact(ref: string) {
    const digest = contentDigestFromRef(ref);
    if (!digest) fail('Foundry content hydration requires an opl-content ref.', { content_ref: ref });
    const file = path.join(this.#root, `${digest}.blob`);
    if (!fs.existsSync(file)) fail('Foundry content ref is not available in the content store.', { content_ref: ref });
    const stat = fs.lstatSync(file);
    const real = fs.realpathSync.native(file);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || !real.startsWith(`${this.#root}${path.sep}`)
      || stat.size <= 0
      || stat.size > this.#maxBytes
    ) {
      fail('Foundry content ref resolves outside the immutable content store.', { content_ref: ref });
    }
    const bytes = fs.readFileSync(real);
    if (sha256(bytes) !== digest) fail('Foundry content store bytes fail digest verification.', { content_ref: ref });
    return bytes;
  }

  has(ref: string) {
    const digest = contentDigestFromRef(ref);
    if (!digest) return false;
    try {
      this.readExact(ref);
      return true;
    } catch {
      return false;
    }
  }
}

function eventFile(paths: FoundryStoragePaths, runId: string, revision: number) {
  return path.join(paths.runs, requireSafeSegment(runId, 'run_id'), 'events', `${String(revision).padStart(10, '0')}.json`);
}

function runMetadataFile(paths: FoundryStoragePaths, runId: string) {
  return path.join(paths.runs, requireSafeSegment(runId, 'run_id'), 'run.json');
}

function readRunEvents(paths: FoundryStoragePaths, runId: string): FoundryRunEvent[] {
  const directory = path.dirname(eventFile(paths, runId, 1));
  if (!fs.existsSync(directory)) return [];
  const events = fs.readdirSync(directory)
    .filter((name) => /^\d{10}\.json$/.test(name))
    .sort()
    .map((name) => readJson<FoundryRunEvent>(path.join(directory, name)));
  if (events.length > 0) verifyFoundryEventChain(events);
  return events;
}

function openStateIndex(paths: FoundryStoragePaths) {
  ensureStorage(paths);
  const db = new DatabaseSync(paths.state_index);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
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
  return db;
}

function projectSnapshot(paths: FoundryStoragePaths, targetKey: string, snapshot: FoundryRunSnapshot) {
  const [targetAgentId, targetDomainId] = targetKey.split('\0');
  if (!targetAgentId || !targetDomainId) fail('Foundry target key is invalid.');
  const db = openStateIndex(paths);
  try {
    db.prepare(`
      INSERT INTO foundry_runs(
        run_id, target_agent_id, target_domain_id, state, revision, generation,
        risk_tier, version_digest, updated_at, snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        state = excluded.state,
        revision = excluded.revision,
        generation = excluded.generation,
        risk_tier = excluded.risk_tier,
        version_digest = excluded.version_digest,
        updated_at = excluded.updated_at,
        snapshot_json = excluded.snapshot_json
    `).run(
      snapshot.run_id,
      targetAgentId,
      targetDomainId,
      snapshot.state,
      snapshot.revision,
      snapshot.generation,
      snapshot.risk_tier,
      snapshot.version_digest,
      snapshot.updated_at,
      canonicalJsonText(snapshot),
    );
  } finally {
    db.close();
  }
}

export class LedgerFoundryEventStore implements FoundryEventStore {
  readonly #paths: FoundryStoragePaths;

  constructor(rootOverride?: string) {
    this.#paths = foundryStoragePaths(rootOverride);
    ensureStorage(this.#paths);
  }

  async create(input: { target_key: string; event: FoundryRunEvent }) {
    const runId = requireSafeSegment(input.event.run_id, 'run_id');
    verifyFoundryEventChain([input.event]);
    const runDirectory = path.join(this.#paths.runs, runId);
    const targetLock = path.join(this.#paths.target_locks, `${sha256(input.target_key)}.json`);
    if (fs.existsSync(runDirectory)) fail('FoundryRun already exists.', { run_id: runId });
    if (fs.existsSync(targetLock)) {
      const locked = readJson<{ run_id: string }>(targetLock);
      const lockedEvents = readRunEvents(this.#paths, locked.run_id);
      const lockedSnapshot = lockedEvents.length > 0 ? snapshotFromEvents(lockedEvents) : null;
      if (!lockedSnapshot || !FOUNDRY_TERMINAL_STATES.has(lockedSnapshot.state)) {
        fail('Target Agent already has an active write FoundryRun.', {
          target_key: input.target_key,
          run_id: locked.run_id,
        });
      }
      fs.rmSync(targetLock, { force: true });
    }
    writeExclusive(targetLock, canonicalJsonBytes({ run_id: runId, target_key: input.target_key }));
    try {
      fs.mkdirSync(runDirectory, { recursive: false });
      fs.mkdirSync(path.join(runDirectory, 'events'), { recursive: false });
      writeExclusive(runMetadataFile(this.#paths, runId), canonicalJsonBytes({
        surface_kind: 'opl_foundry_run_ledger_metadata',
        version: FILE_STORE_VERSION,
        run_id: runId,
        target_key: input.target_key,
      }));
      writeExclusive(eventFile(this.#paths, runId, 1), canonicalJsonBytes(input.event));
      projectSnapshot(this.#paths, input.target_key, snapshotFromEvents([input.event]));
    } catch (error) {
      fs.rmSync(runDirectory, { recursive: true, force: true });
      fs.rmSync(targetLock, { force: true });
      throw error;
    }
  }

  async append(input: { target_key: string; expected_revision: number; event: FoundryRunEvent }) {
    const runId = requireSafeSegment(input.event.run_id, 'run_id');
    const lock = path.join(this.#paths.mutation_locks, `run-${sha256(runId)}.lock`);
    return withMutationLock(lock, () => {
      const events = readRunEvents(this.#paths, runId);
      if (events.length === 0) fail('FoundryRun does not exist.', { run_id: runId });
      const replay = events.find((entry) => entry.idempotency_key === input.event.idempotency_key);
      if (replay) return clone(replay);
      const current = events.at(-1)!;
      if (current.revision !== input.expected_revision) {
        fail('FoundryRun revision compare-and-swap failed.', {
          expected_revision: input.expected_revision,
          actual_revision: current.revision,
        });
      }
      const next = [...events, input.event];
      verifyFoundryEventChain(next);
      writeExclusive(eventFile(this.#paths, runId, input.event.revision), canonicalJsonBytes(input.event));
      const snapshot = snapshotFromEvents(next);
      projectSnapshot(this.#paths, input.target_key, snapshot);
      if (FOUNDRY_TERMINAL_STATES.has(snapshot.state)) {
        const targetLock = path.join(this.#paths.target_locks, `${sha256(input.target_key)}.json`);
        if (fs.existsSync(targetLock)) {
          const locked = readJson<{ run_id: string }>(targetLock);
          if (locked.run_id === runId) fs.rmSync(targetLock, { force: true });
        }
      }
      return clone(input.event);
    });
  }

  async read(runId: string) {
    return clone(readRunEvents(this.#paths, runId));
  }

  async list() {
    const db = openStateIndex(this.#paths);
    try {
      const rows = db.prepare('SELECT snapshot_json FROM foundry_runs ORDER BY updated_at, run_id').all() as Array<{ snapshot_json: string }>;
      return rows.map((row) => parseJsonText(row.snapshot_json) as FoundryRunSnapshot);
    } finally {
      db.close();
    }
  }

  rebuildStateIndex() {
    const db = openStateIndex(this.#paths);
    try {
      db.exec('DELETE FROM foundry_runs;');
    } finally {
      db.close();
    }
    for (const runId of fs.readdirSync(this.#paths.runs).sort()) {
      const metadata = readJson<{ target_key: string }>(runMetadataFile(this.#paths, runId));
      const events = readRunEvents(this.#paths, runId);
      if (events.length > 0) projectSnapshot(this.#paths, metadata.target_key, snapshotFromEvents(events));
    }
  }
}

function requireUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) fail(`${label} must not contain duplicate identities.`);
}

function candidateConformance(input: Parameters<CandidateCompiler['materialize']>[0]) {
  const blueprint = input.blueprint;
  const stageIds = blueprint.stage_graph.stages.map((stage) => stage.stage_id);
  const stageIdSet = new Set(stageIds);
  requireUnique(stageIds, 'AgentBlueprint stage graph');
  requireUnique(blueprint.actions.map((action) => action.action_id), 'AgentBlueprint actions');
  requireUnique(blueprint.artifact_contracts.map((artifact) => artifact.artifact_type), 'AgentBlueprint artifact contracts');
  for (const stage of blueprint.stage_graph.stages) {
    for (const next of stage.next_stage_ids) {
      if (!stageIdSet.has(next)) fail('AgentBlueprint Stage route targets an undeclared Stage.', {
        stage_id: stage.stage_id,
        next_stage_id: next,
      });
    }
  }
  for (const action of blueprint.actions) {
    if (!stageIdSet.has(action.entry_stage_id)) {
      fail('AgentBlueprint action targets an undeclared entry Stage.', { action_id: action.action_id });
    }
  }
  const declaredContent = new Set([
    ...blueprint.content_refs.prompt_refs,
    ...blueprint.content_refs.skill_refs,
    ...blueprint.content_refs.knowledge_refs,
    ...blueprint.content_refs.helper_refs,
  ]);
  for (const stage of blueprint.stage_graph.stages) {
    for (const ref of [stage.prompt_ref, ...stage.skill_refs, ...stage.knowledge_refs]) {
      if (!declaredContent.has(ref)) {
        fail('AgentBlueprint Stage content ref is absent from the top-level content inventory.', {
          stage_id: stage.stage_id,
          content_ref: ref,
        });
      }
    }
  }
  return {
    surface_kind: 'opl_foundry_agent_pack_conformance',
    version: 'opl-foundry-agent-pack-conformance.v1',
    status: 'valid',
    checks: {
      target_identity_bound: true,
      stage_graph_closed: true,
      action_entries_declared: true,
      content_inventory_closed: true,
      generated_agent_authority_restricted: true,
    },
  } as const;
}

function candidateManifest(
  input: Parameters<CandidateCompiler['materialize']>[0],
  contentBindings: CandidateResourceBinding[],
  resourceLockDigest: string,
  conformance: ReturnType<typeof candidateConformance>,
) {
  return {
    surface_kind: 'opl_foundry_agent_pack',
    version: 'opl-foundry-agent-pack.v1',
    target_agent_id: input.blueprint.target_agent_id,
    target_domain_id: input.blueprint.target_domain_id,
    blueprint_digest: input.blueprint_digest,
    entry_stage_id: input.blueprint.stage_graph.entry_stage_id,
    stages: input.blueprint.stage_graph.stages,
    actions: input.blueprint.actions,
    artifact_contracts: input.blueprint.artifact_contracts,
    content_bindings: contentBindings,
    resource_lock: {
      ref: CANDIDATE_RESOURCE_LOCK_PATH,
      digest: resourceLockDigest,
    },
    capability_requirements: input.blueprint.capability_requirements,
    authority_policy: input.blueprint.authority_policy,
    memory_policy: input.blueprint.memory_policy,
    eval_spec: input.blueprint.eval_spec,
    conformance,
  };
}

function listPhysicalFiles(root: string, relative = ''): string[] {
  const directory = path.join(root, relative);
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const files: string[] = [];
  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(root, next);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) fail('Foundry candidate contains a symlink.', { candidate_path: next });
    if (stat.isDirectory()) files.push(...listPhysicalFiles(root, next));
    else if (stat.isFile()) files.push(next);
    else fail('Foundry candidate contains a non-regular filesystem entry.', { candidate_path: next });
  }
  return files;
}

export class ContentAddressedCandidateCompiler implements CandidateCompiler {
  readonly #paths: FoundryStoragePaths;
  readonly #candidateRoot: string;
  readonly #content: FileFoundryContentStore;

  constructor(rootOverride?: string) {
    this.#paths = foundryStoragePaths(rootOverride);
    ensureStorage(this.#paths);
    const stat = fs.lstatSync(this.#paths.candidates);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('Foundry candidate root must be a physical directory.');
    }
    this.#candidateRoot = fs.realpathSync.native(this.#paths.candidates);
    this.#content = new FileFoundryContentStore(rootOverride);
  }

  async materialize(input: Parameters<CandidateCompiler['materialize']>[0]): Promise<MaterializedCandidate> {
    if (foundryContentDigest(input.blueprint) !== input.blueprint_digest) {
      fail('Candidate compiler received a stale AgentBlueprint digest.');
    }
    const conformance = candidateConformance(input);
    const contentBindings: CandidateResourceBinding[] = [];
    const hydratedFiles: Array<{ path: string; bytes: Buffer }> = [];
    for (const { kind, field } of CANDIDATE_RESOURCE_FIELDS) {
      const refs = input.blueprint.content_refs[field];
      for (const ref of refs) {
        const digest = contentDigestFromRef(ref);
        if (!digest) {
          fail('Foundry candidate resources require exact immutable opl-content refs.', {
            resource_kind: kind,
            declared_ref: ref,
          });
        }
        const bytes = this.#content.readExact(ref);
        const packPath = `content/${kind}/${digest}.blob`;
        hydratedFiles.push({ path: packPath, bytes });
        contentBindings.push({
          kind,
          declared_ref: ref,
          immutable_ref: ref,
          pack_path: packPath,
          sha256: `sha256:${digest}`,
          byte_size: bytes.byteLength,
        });
      }
    }
    const resourceLock: CandidateResourceLock = {
      surface_kind: 'opl_foundry_candidate_resource_lock',
      version: CANDIDATE_RESOURCE_LOCK_VERSION,
      blueprint_digest: input.blueprint_digest,
      resources: contentBindings,
    };
    const resourceLockDigest = canonicalDigest(resourceLock);
    const manifest = candidateManifest(input, contentBindings, resourceLockDigest, conformance);
    const descriptor = {
      surface_kind: 'opl_foundry_generated_agent_descriptor',
      version: 'opl-foundry-generated-agent-descriptor.v1',
      agent_id: input.blueprint.target_agent_id,
      domain_id: input.blueprint.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      action_ids: input.blueprint.actions.map((action) => action.action_id),
    };
    const files = [
      { path: 'agent-blueprint.json', bytes: canonicalJsonBytes(input.blueprint) },
      { path: 'agent/descriptor.json', bytes: canonicalJsonBytes(descriptor) },
      { path: 'agent/agent-pack.json', bytes: canonicalJsonBytes(manifest) },
      { path: 'agent/stages/manifest.json', bytes: canonicalJsonBytes({
        surface_kind: 'opl_foundry_generated_stage_manifest',
        version: 'opl-foundry-generated-stage-manifest.v1',
        entry_stage_id: input.blueprint.stage_graph.entry_stage_id,
        stages: input.blueprint.stage_graph.stages,
      }) },
      { path: 'contracts/action_catalog.json', bytes: canonicalJsonBytes({
        surface_kind: 'opl_foundry_generated_action_catalog',
        version: 'opl-foundry-generated-action-catalog.v1',
        target_agent_id: input.blueprint.target_agent_id,
        target_domain_id: input.blueprint.target_domain_id,
        actions: input.blueprint.actions,
      }) },
      { path: 'contracts/artifact_contracts.json', bytes: canonicalJsonBytes(input.blueprint.artifact_contracts) },
      { path: 'contracts/authority_policy.json', bytes: canonicalJsonBytes(input.blueprint.authority_policy) },
      { path: 'contracts/memory_policy.json', bytes: canonicalJsonBytes(input.blueprint.memory_policy) },
      { path: 'contracts/evaluation_spec.json', bytes: canonicalJsonBytes(input.blueprint.eval_spec) },
      { path: 'contracts/agent-pack-conformance.json', bytes: canonicalJsonBytes(conformance) },
      { path: CANDIDATE_RESOURCE_LOCK_PATH, bytes: canonicalJsonBytes(resourceLock) },
      ...hydratedFiles,
    ].sort((left, right) => left.path.localeCompare(right.path));
    requireUnique(files.map((entry) => entry.path), 'Foundry candidate file plan');
    const fileIndex = files.map((entry) => ({
      path: entry.path,
      sha256: sha256(entry.bytes),
      byte_size: entry.bytes.byteLength,
    }));
    const manifestDigest = canonicalDigest(manifest);
    const candidateDigest = canonicalDigest({
      surface_kind: 'opl_foundry_candidate_file_index',
      version: CANDIDATE_INDEX_VERSION,
      blueprint_digest: input.blueprint_digest,
      files: fileIndex,
    });
    const directory = path.join(this.#candidateRoot, digestSegment(candidateDigest));
    const temporary = `${directory}.tmp-${process.pid}-${crypto.randomUUID()}`;
    const candidateIndex = {
      surface_kind: 'opl_foundry_candidate_file_index',
      version: CANDIDATE_INDEX_VERSION,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: candidateDigest,
      files: fileIndex,
    };
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(temporary, { recursive: false });
      try {
        for (const entry of files) writeExclusive(path.join(temporary, entry.path), entry.bytes);
        writeExclusive(path.join(temporary, 'candidate-index.json'), canonicalJsonBytes(candidateIndex));
        fs.renameSync(temporary, directory);
        fsyncDirectory(this.#candidateRoot);
      } catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        throw error;
      }
    }
    const directoryStat = fs.lstatSync(directory);
    const realDirectory = fs.realpathSync.native(directory);
    if (
      !directoryStat.isDirectory()
      || directoryStat.isSymbolicLink()
      || !realDirectory.startsWith(`${this.#candidateRoot}${path.sep}`)
    ) {
      fail('Foundry candidate directory escapes the content-addressed candidate root.');
    }
    const expectedFiles = [...files.map((entry) => entry.path), 'candidate-index.json'].sort();
    const actualFiles = listPhysicalFiles(realDirectory).sort();
    if (canonicalJsonText(actualFiles) !== canonicalJsonText(expectedFiles)) {
      fail('Existing content-addressed candidate contains missing or forbidden writes.', {
        candidate_digest: candidateDigest,
        expected_files: expectedFiles,
        actual_files: actualFiles,
      });
    }
    for (const entry of [...files, { path: 'candidate-index.json', bytes: canonicalJsonBytes(candidateIndex) }]) {
      const file = path.join(directory, entry.path);
      const stat = fs.lstatSync(file);
      const real = fs.realpathSync.native(file);
      if (
        !stat.isFile()
        || stat.isSymbolicLink()
        || !real.startsWith(`${realDirectory}${path.sep}`)
        || sha256(fs.readFileSync(real)) !== sha256(entry.bytes)
      ) {
        fail('Existing content-addressed candidate bytes are invalid.', { candidate_digest: candidateDigest, file: entry.path });
      }
    }
    return {
      surface_kind: 'opl_foundry_materialized_candidate',
      target_agent_id: input.blueprint.target_agent_id,
      target_domain_id: input.blueprint.target_domain_id,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: candidateDigest,
      candidate_ref: `opl://foundry/candidate/${candidateDigest}`,
      manifest_digest: manifestDigest,
    };
  }

  candidateDirectory(candidateDigest: string) {
    return path.join(this.#candidateRoot, digestSegment(candidateDigest));
  }
}

type RegistryState = {
  versions: AgentVersion[];
  qualifications: QualificationRecord[];
  activation: ActivationPointer;
  transactions: ActivationTransaction[];
};

type CandidateVersionIdentity = Pick<
  AgentVersion,
  'target_agent_id' | 'target_domain_id' | 'blueprint_digest' | 'candidate_digest' | 'candidate_ref'
>;

function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJsonText(actual) !== canonicalJsonText(wanted)) {
    fail(`${label} fields do not match the persisted contract.`, { actual_fields: actual, expected_fields: wanted });
  }
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) fail(`${field} must be a non-empty string.`, { field });
  return value;
}

function requireDigest(value: unknown, field: string) {
  const digest = requireString(value, field);
  digestSegment(digest);
  return digest;
}

function requireStoredIdentity(
  value: { target_agent_id: string; target_domain_id: string },
  targetAgentId: string,
  targetDomainId: string,
  label: string,
) {
  if (value.target_agent_id !== targetAgentId || value.target_domain_id !== targetDomainId) {
    fail(`${label} target identity does not match its registry.`, {
      expected_target_agent_id: targetAgentId,
      expected_target_domain_id: targetDomainId,
      actual_target_agent_id: value.target_agent_id,
      actual_target_domain_id: value.target_domain_id,
    });
  }
}

function readCanonicalRegistryJson(file: string, label: string) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a physical JSON file.`, { file });
  const bytes = fs.readFileSync(file);
  const value = parseJsonText(bytes.toString('utf8'));
  if (!bytes.equals(canonicalJsonBytes(value))) fail(`${label} is not canonical JSON.`, { file });
  return value;
}

function readRegistryDirectory<T>(
  directory: string,
  label: string,
  validate: (value: unknown, name: string) => T,
) {
  if (!fs.existsSync(directory)) return [];
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${label} must be a physical directory.`, { directory });
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json')) {
        fail(`${label} contains a forbidden filesystem entry.`, { entry: entry.name });
      }
      return validate(readCanonicalRegistryJson(path.join(directory, entry.name), label), entry.name);
    });
}

function validateQualificationRecord(
  value: unknown,
  targetAgentId: string,
  targetDomainId: string,
  fileName: string,
) {
  const raw = requireRecord(value, 'QualificationRecord');
  requireExactKeys(raw, [
    'surface_kind', 'qualification_id', 'qualification_digest', 'target_agent_id', 'target_domain_id',
    'blueprint_digest', 'candidate_digest', 'evidence_digest', 'risk_tier', 'qualified_at',
  ], 'QualificationRecord');
  const record = raw as unknown as QualificationRecord;
  if (record.surface_kind !== 'opl_foundry_qualification_record') fail('QualificationRecord surface is invalid.');
  requireStoredIdentity(record, targetAgentId, targetDomainId, 'QualificationRecord');
  requireDigest(record.blueprint_digest, 'blueprint_digest');
  requireDigest(record.candidate_digest, 'candidate_digest');
  requireDigest(record.evidence_digest, 'evidence_digest');
  requireString(record.qualified_at, 'qualified_at');
  if (!['low', 'medium', 'high'].includes(record.risk_tier)) fail('QualificationRecord risk tier is invalid.');
  if (record.qualification_id !== `qualification:${targetAgentId}:${record.candidate_digest}`) {
    fail('QualificationRecord identity is not canonical.', { qualification_id: record.qualification_id });
  }
  const { qualification_digest: _storedDigest, ...base } = record;
  const expectedDigest = canonicalDigest(base);
  if (record.qualification_digest !== expectedDigest) {
    fail('QualificationRecord digest does not match its canonical content.', {
      qualification_digest: record.qualification_digest,
      expected_digest: expectedDigest,
    });
  }
  if (fileName !== `${digestSegment(record.qualification_digest)}.json`) {
    fail('QualificationRecord filename does not match its digest.', { file_name: fileName });
  }
  return record;
}

function validateAgentVersion(
  value: unknown,
  targetAgentId: string,
  targetDomainId: string,
  fileName: string,
) {
  const raw = requireRecord(value, 'AgentVersion');
  requireExactKeys(raw, [
    'surface_kind', 'version_id', 'version_digest', 'target_agent_id', 'target_domain_id',
    'blueprint_digest', 'candidate_digest', 'candidate_ref', 'qualification_digest', 'created_at',
  ], 'AgentVersion');
  const record = raw as unknown as AgentVersion;
  if (record.surface_kind !== 'opl_foundry_agent_version') fail('AgentVersion surface is invalid.');
  requireStoredIdentity(record, targetAgentId, targetDomainId, 'AgentVersion');
  requireDigest(record.blueprint_digest, 'blueprint_digest');
  requireDigest(record.candidate_digest, 'candidate_digest');
  requireDigest(record.qualification_digest, 'qualification_digest');
  requireString(record.created_at, 'created_at');
  if (record.candidate_ref !== `opl://foundry/candidate/${record.candidate_digest}`) {
    fail('AgentVersion candidate ref does not match its candidate digest.', { version_digest: record.version_digest });
  }
  if (record.version_id !== `version:${targetAgentId}:${record.candidate_digest}`) {
    fail('AgentVersion identity is not canonical.', { version_id: record.version_id });
  }
  const { version_digest: _storedDigest, ...base } = record;
  const expectedDigest = canonicalDigest(base);
  if (record.version_digest !== expectedDigest) {
    fail('AgentVersion digest does not match its canonical content.', {
      version_digest: record.version_digest,
      expected_digest: expectedDigest,
    });
  }
  if (fileName !== `${digestSegment(record.version_digest)}.json`) {
    fail('AgentVersion filename does not match its digest.', { file_name: fileName });
  }
  return record;
}

function validateActivationPointer(value: unknown, targetAgentId: string, targetDomainId: string) {
  const raw = requireRecord(value, 'ActivationPointer');
  requireExactKeys(raw, [
    'surface_kind', 'target_agent_id', 'target_domain_id', 'active_version_digest',
    'revision', 'updated_at',
  ], 'ActivationPointer');
  const pointer = raw as unknown as ActivationPointer;
  if (pointer.surface_kind !== 'opl_foundry_activation_pointer') fail('ActivationPointer surface is invalid.');
  requireStoredIdentity(pointer, targetAgentId, targetDomainId, 'ActivationPointer');
  if (!Number.isSafeInteger(pointer.revision) || pointer.revision < 0) fail('ActivationPointer revision is invalid.');
  if (pointer.active_version_digest !== null) requireDigest(pointer.active_version_digest, 'active_version_digest');
  if (pointer.updated_at !== null) requireString(pointer.updated_at, 'updated_at');
  if (pointer.revision === 0 && (pointer.active_version_digest !== null || pointer.updated_at !== null)) {
    fail('ActivationPointer revision zero must be empty.');
  }
  if (pointer.revision > 0 && (pointer.active_version_digest === null || pointer.updated_at === null)) {
    fail('Activated pointer must identify an exact version and update time.');
  }
  return pointer;
}

function validateActivationTransaction(
  value: unknown,
  targetAgentId: string,
  targetDomainId: string,
  fileName: string,
) {
  const raw = requireRecord(value, 'ActivationTransaction');
  requireExactKeys(raw, [
    'surface_kind', 'transaction_id', 'transaction_kind', 'target_agent_id', 'target_domain_id',
    'from_version_digest', 'to_version_digest', 'previous_revision', 'next_revision',
    'authority_receipt_ref', 'occurred_at',
  ], 'ActivationTransaction');
  const transaction = raw as unknown as ActivationTransaction;
  if (transaction.surface_kind !== 'opl_foundry_activation_transaction') fail('ActivationTransaction surface is invalid.');
  requireStoredIdentity(transaction, targetAgentId, targetDomainId, 'ActivationTransaction');
  if (transaction.transaction_kind !== 'activate' && transaction.transaction_kind !== 'rollback') {
    fail('ActivationTransaction kind is invalid.');
  }
  if (transaction.from_version_digest !== null) requireDigest(transaction.from_version_digest, 'from_version_digest');
  requireDigest(transaction.to_version_digest, 'to_version_digest');
  if (
    !Number.isSafeInteger(transaction.previous_revision)
    || transaction.previous_revision < 0
    || transaction.next_revision !== transaction.previous_revision + 1
  ) {
    fail('ActivationTransaction revision step is invalid.', { transaction_id: transaction.transaction_id });
  }
  if (transaction.authority_receipt_ref !== null) {
    requireString(transaction.authority_receipt_ref, 'authority_receipt_ref');
  }
  if (transaction.transaction_kind === 'rollback' && transaction.authority_receipt_ref === null) {
    fail('Rollback transaction requires an authority receipt.');
  }
  requireString(transaction.occurred_at, 'occurred_at');
  const { transaction_id: _storedId, ...base } = transaction;
  const expectedId = `activation:${canonicalDigest(base)}`;
  if (transaction.transaction_id !== expectedId) {
    fail('ActivationTransaction id does not match its canonical content.', {
      transaction_id: transaction.transaction_id,
      expected_transaction_id: expectedId,
    });
  }
  const expectedFile = `${String(transaction.next_revision).padStart(10, '0')}.json`;
  if (fileName !== expectedFile) {
    fail('ActivationTransaction filename does not match its revision.', { file_name: fileName, expected_file: expectedFile });
  }
  return transaction;
}

function storedBlueprintResourceRefs(value: unknown, version: CandidateVersionIdentity) {
  const blueprint = requireRecord(value, 'Foundry candidate AgentBlueprint');
  if (blueprint.surface_kind !== 'opl_foundry_agent_blueprint') {
    fail('Foundry candidate AgentBlueprint surface is invalid.', { candidate_digest: version.candidate_digest });
  }
  if (
    blueprint.target_agent_id !== version.target_agent_id
    || blueprint.target_domain_id !== version.target_domain_id
  ) {
    fail('Foundry candidate AgentBlueprint target identity does not match AgentVersion.', {
      candidate_digest: version.candidate_digest,
    });
  }
  if (foundryContentDigest(blueprint) !== version.blueprint_digest) {
    fail('Foundry candidate AgentBlueprint bytes do not match AgentVersion.', {
      candidate_digest: version.candidate_digest,
    });
  }
  const refs = requireRecord(blueprint.content_refs, 'Foundry candidate AgentBlueprint content_refs');
  requireExactKeys(
    refs,
    CANDIDATE_RESOURCE_FIELDS.map(({ field }) => field),
    'Foundry candidate AgentBlueprint content_refs',
  );
  return CANDIDATE_RESOURCE_FIELDS.flatMap(({ kind, field }) => {
    const values = refs[field];
    if (!Array.isArray(values)) {
      fail(`Foundry candidate AgentBlueprint ${field} must be an array.`, { field });
    }
    const normalized = values.map((ref, index) => requireString(ref, `${field}[${index}]`));
    requireUnique(normalized, `Foundry candidate AgentBlueprint ${field}`);
    return normalized.map((declaredRef) => ({ kind, declared_ref: declaredRef }));
  });
}

function validateCandidateResourceLock(
  realDirectory: string,
  version: CandidateVersionIdentity,
  files: Array<{ path: string; sha256: string; byte_size: number }>,
) {
  const filesByPath = new Map(files.map((entry) => [entry.path, entry]));
  const requiredFiles = ['agent-blueprint.json', 'agent/agent-pack.json', CANDIDATE_RESOURCE_LOCK_PATH];
  const missingRequiredFiles = requiredFiles.filter((candidatePath) => !filesByPath.has(candidatePath));
  if (missingRequiredFiles.length > 0) {
    fail('Foundry candidate immutable resource closure is incomplete.', {
      candidate_digest: version.candidate_digest,
      missing_candidate_paths: missingRequiredFiles,
    });
  }
  const blueprint = readCanonicalRegistryJson(
    path.join(realDirectory, 'agent-blueprint.json'),
    'Foundry candidate AgentBlueprint',
  );
  const expectedResources = storedBlueprintResourceRefs(blueprint, version);
  const resourceLockFile = path.join(realDirectory, CANDIDATE_RESOURCE_LOCK_PATH);
  if (!fs.existsSync(resourceLockFile)) {
    fail('Foundry candidate immutable resource lock is missing.', { candidate_digest: version.candidate_digest });
  }
  const resourceLock = requireRecord(
    readCanonicalRegistryJson(resourceLockFile, 'Foundry candidate resource lock'),
    'Foundry candidate resource lock',
  );
  requireExactKeys(
    resourceLock,
    ['surface_kind', 'version', 'blueprint_digest', 'resources'],
    'Foundry candidate resource lock',
  );
  if (
    resourceLock.surface_kind !== 'opl_foundry_candidate_resource_lock'
    || resourceLock.version !== CANDIDATE_RESOURCE_LOCK_VERSION
    || resourceLock.blueprint_digest !== version.blueprint_digest
  ) {
    fail('Foundry candidate immutable resource lock identity is invalid.', {
      candidate_digest: version.candidate_digest,
    });
  }
  if (!Array.isArray(resourceLock.resources) || resourceLock.resources.length !== expectedResources.length) {
    fail('Foundry candidate immutable resource lock does not cover the complete AgentBlueprint inventory.', {
      candidate_digest: version.candidate_digest,
      expected_resource_count: expectedResources.length,
      actual_resource_count: Array.isArray(resourceLock.resources) ? resourceLock.resources.length : null,
    });
  }
  const resources = resourceLock.resources.map((value, index): CandidateResourceBinding => {
    const entry = requireRecord(value, `Foundry candidate resource lock entry ${index}`);
    requireExactKeys(
      entry,
      ['kind', 'declared_ref', 'immutable_ref', 'pack_path', 'sha256', 'byte_size'],
      `Foundry candidate resource lock entry ${index}`,
    );
    const expected = expectedResources[index]!;
    if (entry.kind !== expected.kind || entry.declared_ref !== expected.declared_ref) {
      fail('Foundry candidate immutable resource lock order or declaration differs from AgentBlueprint.', {
        candidate_digest: version.candidate_digest,
        resource_index: index,
      });
    }
    const declaredRef = requireString(entry.declared_ref, 'resource_lock.declared_ref');
    const immutableRef = requireString(entry.immutable_ref, 'resource_lock.immutable_ref');
    if (immutableRef !== declaredRef) {
      fail('Foundry candidate resource aliases cannot replace the declared immutable ref.', {
        candidate_digest: version.candidate_digest,
        declared_ref: declaredRef,
        immutable_ref: immutableRef,
      });
    }
    const digest = contentDigestFromRef(immutableRef);
    if (!digest) {
      fail('Foundry candidate resource lock contains a mutable or path-only ref.', {
        candidate_digest: version.candidate_digest,
        resource_ref: immutableRef,
      });
    }
    const resourceDigest = requireDigest(entry.sha256, 'resource_lock.sha256');
    const expectedPackPath = `content/${expected.kind}/${digest}.blob`;
    if (resourceDigest !== `sha256:${digest}` || entry.pack_path !== expectedPackPath) {
      fail('Foundry candidate resource lock address does not match its immutable ref.', {
        candidate_digest: version.candidate_digest,
        resource_ref: immutableRef,
      });
    }
    if (!Number.isSafeInteger(entry.byte_size) || (entry.byte_size as number) <= 0) {
      fail('Foundry candidate resource lock byte size is invalid.', { resource_ref: immutableRef });
    }
    const indexed = filesByPath.get(expectedPackPath);
    if (
      !indexed
      || indexed.sha256 !== digest
      || indexed.byte_size !== entry.byte_size
    ) {
      fail('Foundry candidate resource lock does not match the immutable file index.', {
        candidate_digest: version.candidate_digest,
        resource_ref: immutableRef,
      });
    }
    return {
      kind: expected.kind,
      declared_ref: declaredRef,
      immutable_ref: immutableRef,
      pack_path: expectedPackPath,
      sha256: resourceDigest,
      byte_size: entry.byte_size as number,
    };
  });
  requireUnique(resources.map(({ kind, declared_ref: ref }) => `${kind}\0${ref}`), 'Foundry candidate resource lock');
  const indexedResourceFiles = files
    .map((entry) => entry.path)
    .filter((candidatePath) => candidatePath.startsWith('content/'))
    .sort();
  const lockedResourceFiles = resources.map((entry) => entry.pack_path).sort();
  if (canonicalJsonText(indexedResourceFiles) !== canonicalJsonText(lockedResourceFiles)) {
    fail('Foundry candidate contains resource bytes outside the immutable resource lock.', {
      candidate_digest: version.candidate_digest,
    });
  }

  const manifest = requireRecord(
    readCanonicalRegistryJson(path.join(realDirectory, 'agent/agent-pack.json'), 'Foundry candidate Agent Pack'),
    'Foundry candidate Agent Pack',
  );
  if (
    manifest.surface_kind !== 'opl_foundry_agent_pack'
    || manifest.blueprint_digest !== version.blueprint_digest
    || manifest.target_agent_id !== version.target_agent_id
    || manifest.target_domain_id !== version.target_domain_id
  ) {
    fail('Foundry candidate Agent Pack identity does not match AgentVersion.', {
      candidate_digest: version.candidate_digest,
    });
  }
  const manifestLock = requireRecord(manifest.resource_lock, 'Foundry candidate Agent Pack resource_lock');
  requireExactKeys(manifestLock, ['ref', 'digest'], 'Foundry candidate Agent Pack resource_lock');
  const resourceLockDigest = canonicalDigest(resourceLock);
  if (!Array.isArray(manifest.content_bindings)) {
    fail('Foundry candidate Agent Pack content bindings are missing.', {
      candidate_digest: version.candidate_digest,
    });
  }
  if (
    manifestLock.ref !== CANDIDATE_RESOURCE_LOCK_PATH
    || manifestLock.digest !== resourceLockDigest
    || canonicalJsonText(manifest.content_bindings) !== canonicalJsonText(resources)
  ) {
    fail('Foundry candidate Agent Pack is not bound to its exact immutable resource lock.', {
      candidate_digest: version.candidate_digest,
    });
  }
  return {
    manifest_digest: canonicalDigest(manifest),
    resource_lock_digest: resourceLockDigest,
  };
}

function validateCandidateDirectory(paths: FoundryStoragePaths, version: CandidateVersionIdentity) {
  if (version.candidate_ref !== `opl://foundry/candidate/${version.candidate_digest}`) {
    fail('Candidate ref does not match the version candidate digest.', { candidate_ref: version.candidate_ref });
  }
  const rootStat = fs.lstatSync(paths.candidates);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('Foundry candidate root is not a physical directory.');
  const candidateRoot = fs.realpathSync.native(paths.candidates);
  const directory = path.join(candidateRoot, digestSegment(version.candidate_digest));
  if (!fs.existsSync(directory)) fail('AgentVersion candidate bytes are missing.', { candidate_digest: version.candidate_digest });
  const directoryStat = fs.lstatSync(directory);
  const realDirectory = fs.realpathSync.native(directory);
  if (
    !directoryStat.isDirectory()
    || directoryStat.isSymbolicLink()
    || !realDirectory.startsWith(`${candidateRoot}${path.sep}`)
  ) {
    fail('AgentVersion candidate directory escapes immutable storage.', { candidate_digest: version.candidate_digest });
  }
  const indexFile = path.join(realDirectory, 'candidate-index.json');
  if (!fs.existsSync(indexFile)) fail('AgentVersion candidate index is missing.', { candidate_digest: version.candidate_digest });
  const rawIndex = requireRecord(readCanonicalRegistryJson(indexFile, 'Foundry candidate index'), 'Foundry candidate index');
  requireExactKeys(rawIndex, [
    'surface_kind', 'version', 'blueprint_digest', 'candidate_digest', 'files',
  ], 'Foundry candidate index');
  if (rawIndex.surface_kind !== 'opl_foundry_candidate_file_index' || rawIndex.version !== CANDIDATE_INDEX_VERSION) {
    fail('Foundry candidate index surface is invalid.', { candidate_digest: version.candidate_digest });
  }
  if (rawIndex.blueprint_digest !== version.blueprint_digest || rawIndex.candidate_digest !== version.candidate_digest) {
    fail('Foundry candidate index identity does not match AgentVersion.', { candidate_digest: version.candidate_digest });
  }
  if (!Array.isArray(rawIndex.files) || rawIndex.files.length === 0) {
    fail('Foundry candidate index has no immutable files.', { candidate_digest: version.candidate_digest });
  }
  const files = rawIndex.files.map((value, index) => {
    const entry = requireRecord(value, `Foundry candidate file ${index}`);
    requireExactKeys(entry, ['path', 'sha256', 'byte_size'], `Foundry candidate file ${index}`);
    const relativePath = requireString(entry.path, 'candidate_file.path');
    if (
      path.posix.isAbsolute(relativePath)
      || path.posix.normalize(relativePath) !== relativePath
      || relativePath.includes('\\')
      || relativePath.includes('\0')
      || relativePath === 'candidate-index.json'
      || relativePath.split('/').some((segment) => segment === '.' || segment === '..' || segment.length === 0)
    ) {
      fail('Foundry candidate index contains an unsafe file path.', { candidate_path: relativePath });
    }
    const fileDigest = requireString(entry.sha256, 'candidate_file.sha256');
    if (!/^[a-f0-9]{64}$/.test(fileDigest)) fail('Foundry candidate file digest is invalid.', { candidate_path: relativePath });
    if (!Number.isSafeInteger(entry.byte_size) || (entry.byte_size as number) <= 0) {
      fail('Foundry candidate file size is invalid.', { candidate_path: relativePath });
    }
    return { path: relativePath, sha256: fileDigest, byte_size: entry.byte_size as number };
  });
  requireUnique(files.map((entry) => entry.path), 'Foundry candidate index files');
  const expectedCandidateDigest = canonicalDigest({
    surface_kind: rawIndex.surface_kind,
    version: rawIndex.version,
    blueprint_digest: rawIndex.blueprint_digest,
    files,
  });
  if (expectedCandidateDigest !== version.candidate_digest) {
    fail('Foundry candidate index does not match its content address.', {
      candidate_digest: version.candidate_digest,
      expected_candidate_digest: expectedCandidateDigest,
    });
  }
  const expectedFiles = [...files.map((entry) => entry.path), 'candidate-index.json'].sort();
  const actualFiles = listPhysicalFiles(realDirectory).sort();
  if (canonicalJsonText(actualFiles) !== canonicalJsonText(expectedFiles)) {
    fail('AgentVersion candidate contains missing or unexpected bytes.', {
      candidate_digest: version.candidate_digest,
      expected_files: expectedFiles,
      actual_files: actualFiles,
    });
  }
  for (const entry of files) {
    const file = path.join(realDirectory, entry.path);
    const stat = fs.lstatSync(file);
    const real = fs.realpathSync.native(file);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || !real.startsWith(`${realDirectory}${path.sep}`)
      || stat.size !== entry.byte_size
      || sha256(fs.readFileSync(real)) !== entry.sha256
    ) {
      fail('AgentVersion candidate bytes do not match the immutable file index.', {
        candidate_digest: version.candidate_digest,
        candidate_path: entry.path,
      });
    }
  }
  return validateCandidateResourceLock(realDirectory, version, files);
}

function publishImmutableRegistryRecord(file: string, value: unknown, label: string) {
  const bytes = canonicalJsonBytes(value);
  if (fs.existsSync(file)) {
    const existing = readCanonicalRegistryJson(file, label);
    if (canonicalJsonText(existing) !== canonicalJsonText(value)) {
      fail(`${label} already exists with different immutable content.`, { file });
    }
    return;
  }
  writeAtomic(file, bytes);
}

function repairActivationProjection(directory: string, activation: ActivationPointer) {
  const file = path.join(directory, 'activation.json');
  const bytes = canonicalJsonBytes(activation);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) return;
  writeAtomic(file, bytes);
}

export class LedgerFoundryOperationResultJournal implements FoundryOperationResultJournal {
  readonly #paths: FoundryStoragePaths;

  constructor(rootOverride?: string) {
    this.#paths = foundryStoragePaths(rootOverride);
    ensureStorage(this.#paths);
  }

  #file(identity: FoundryEvaluationOperationIdentity) {
    return path.join(this.#paths.operation_results, `${sha256(identity.operation_key)}.json`);
  }

  #read(identity: FoundryEvaluationOperationIdentity) {
    const operation = validateFoundryEvaluationOperationIdentity(identity);
    const file = this.#file(operation);
    if (!fs.existsSync(file)) return null;
    return validateFoundryOperationResult(
      readCanonicalRegistryJson(file, 'Foundry operation result'),
      operation,
    );
  }

  async read(identity: FoundryEvaluationOperationIdentity) {
    return clone(this.#read(identity));
  }

  async commit(input: Parameters<FoundryOperationResultJournal['commit']>[0]) {
    const identity = validateFoundryEvaluationOperationIdentity(input.identity);
    const result = materializeFoundryOperationResult(input);
    const lock = path.join(this.#paths.mutation_locks, `operation-${sha256(result.operation_key)}.lock`);
    return withMutationLock(lock, () => {
      const existing = this.#read(identity);
      if (existing) {
        if (canonicalJsonText(existing) !== canonicalJsonText(result)) {
          fail('Foundry operation key is already committed with a different result.', {
            operation_key: result.operation_key,
          });
        }
        return clone(existing);
      }
      const file = this.#file(identity);
      try {
        writeAtomic(file, canonicalJsonBytes(result));
      } catch (error) {
        const recovered = this.#read(identity);
        if (recovered && canonicalJsonText(recovered) === canonicalJsonText(result)) {
          return clone(recovered);
        }
        throw error;
      }
      return clone(this.#read(identity)
        ?? fail('Foundry operation result did not become visible.', { operation_key: result.operation_key }));
    });
  }
}

export class LedgerVersionRegistry implements VersionRegistry {
  readonly #paths: FoundryStoragePaths;

  constructor(rootOverride?: string) {
    this.#paths = foundryStoragePaths(rootOverride);
    ensureStorage(this.#paths);
  }

  #directory(agentId: string, domainId: string) {
    return path.join(this.#paths.registry, targetStorageKey(agentId, domainId));
  }

  #mutationLock(agentId: string, domainId: string) {
    return path.join(this.#paths.mutation_locks, `registry-${targetStorageKey(agentId, domainId)}.lock`);
  }

  #empty(agentId: string, domainId: string): RegistryState {
    return {
      versions: [],
      qualifications: [],
      transactions: [],
      activation: {
        surface_kind: 'opl_foundry_activation_pointer',
        target_agent_id: agentId,
        target_domain_id: domainId,
        active_version_digest: null,
        revision: 0,
        updated_at: null,
      },
    };
  }

  #read(agentId: string, domainId: string): RegistryState {
    requireString(agentId, 'target_agent_id');
    requireString(domainId, 'target_domain_id');
    const directory = this.#directory(agentId, domainId);
    const activationFile = path.join(directory, 'activation.json');
    if (!fs.existsSync(directory)) return this.#empty(agentId, domainId);
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) fail('Foundry version registry must be a physical directory.');
    const versionsDirectory = path.join(directory, 'agent-versions');
    const qualificationsDirectory = path.join(directory, 'qualifications');
    const transactionsDirectory = path.join(directory, 'activation-transactions');
    const qualifications = readRegistryDirectory(
      qualificationsDirectory,
      'QualificationRecord directory',
      (value, name) => validateQualificationRecord(value, agentId, domainId, name),
    );
    const versions = readRegistryDirectory(
      versionsDirectory,
      'AgentVersion directory',
      (value, name) => validateAgentVersion(value, agentId, domainId, name),
    );
    requireUnique(qualifications.map((entry) => entry.qualification_digest), 'QualificationRecord digests');
    requireUnique(qualifications.map((entry) => entry.qualification_id), 'QualificationRecord identities');
    requireUnique(qualifications.map((entry) => entry.candidate_digest), 'QualificationRecord candidate identities');
    requireUnique(versions.map((entry) => entry.version_digest), 'AgentVersion digests');
    requireUnique(versions.map((entry) => entry.version_id), 'AgentVersion identities');
    requireUnique(versions.map((entry) => entry.candidate_digest), 'AgentVersion candidate identities');
    const qualificationsByDigest = new Map(qualifications.map((entry) => [entry.qualification_digest, entry]));
    const versionsByDigest = new Map(versions.map((entry) => [entry.version_digest, entry]));
    for (const version of versions) {
      const qualification = qualificationsByDigest.get(version.qualification_digest)
        ?? fail('AgentVersion qualification record is missing.', { version_digest: version.version_digest });
      if (
        qualification.blueprint_digest !== version.blueprint_digest
        || qualification.candidate_digest !== version.candidate_digest
        || qualification.qualified_at !== version.created_at
      ) {
        fail('AgentVersion and QualificationRecord cross-reference is inconsistent.', {
          version_digest: version.version_digest,
          qualification_digest: qualification.qualification_digest,
        });
      }
      validateCandidateDirectory(this.#paths, version);
    }
    const transactions = readRegistryDirectory(
      transactionsDirectory,
      'ActivationTransaction directory',
      (value, name) => validateActivationTransaction(value, agentId, domainId, name),
    );
    requireUnique(transactions.map((entry) => entry.transaction_id), 'ActivationTransaction identities');
    let activation = this.#empty(agentId, domainId).activation;
    const activationTimeline = new Map<number, ActivationPointer>([[0, activation]]);
    for (const transaction of transactions) {
      if (transaction.previous_revision !== activation.revision) {
        fail('Activation transaction history is not contiguous.', {
          target_agent_id: agentId,
          target_domain_id: domainId,
          activation_revision: activation.revision,
          transaction_id: transaction.transaction_id,
        });
      }
      if (transaction.from_version_digest !== activation.active_version_digest) {
        fail('Activation transaction source version does not match history.', { transaction_id: transaction.transaction_id });
      }
      if (!versionsByDigest.has(transaction.to_version_digest)) {
        fail('Activation transaction target version does not exist.', {
          transaction_id: transaction.transaction_id,
          version_digest: transaction.to_version_digest,
        });
      }
      activation = {
        surface_kind: 'opl_foundry_activation_pointer',
        target_agent_id: agentId,
        target_domain_id: domainId,
        active_version_digest: transaction.to_version_digest,
        revision: transaction.next_revision,
        updated_at: transaction.occurred_at,
      };
      activationTimeline.set(activation.revision, activation);
    }
    if (fs.existsSync(activationFile)) {
      const stored = validateActivationPointer(
        readCanonicalRegistryJson(activationFile, 'ActivationPointer'),
        agentId,
        domainId,
      );
      const expected = activationTimeline.get(stored.revision);
      if (!expected || canonicalJsonText(expected) !== canonicalJsonText(stored)) {
        fail('ActivationPointer does not match immutable transaction history.', {
          stored_revision: stored.revision,
          history_revision: activation.revision,
        });
      }
    }
    if (activation.active_version_digest !== null && !versionsByDigest.has(activation.active_version_digest)) {
      fail('ActivationPointer target version does not exist.', { version_digest: activation.active_version_digest });
    }
    return {
      versions,
      qualifications,
      transactions,
      activation,
    };
  }

  async register(input: Parameters<VersionRegistry['register']>[0]) {
    const directory = this.#directory(input.target_agent_id, input.target_domain_id);
    const lock = this.#mutationLock(input.target_agent_id, input.target_domain_id);
    return withMutationLock(lock, () => {
      requireString(input.target_agent_id, 'target_agent_id');
      requireString(input.target_domain_id, 'target_domain_id');
      requireDigest(input.blueprint_digest, 'blueprint_digest');
      requireDigest(input.evidence_digest, 'evidence_digest');
      requireString(input.qualified_at, 'qualified_at');
      if (!['low', 'medium', 'high'].includes(input.risk_tier)) fail('Version registration risk tier is invalid.');
      if (input.candidate.surface_kind !== 'opl_foundry_materialized_candidate') {
        fail('Version registration candidate surface is invalid.');
      }
      if (
        input.candidate.target_agent_id !== input.target_agent_id
        || input.candidate.target_domain_id !== input.target_domain_id
      ) {
        fail('Version registration candidate target identity is inconsistent.');
      }
      if (input.candidate.blueprint_digest !== input.blueprint_digest) {
        fail('Version registration candidate blueprint digest is inconsistent.');
      }
      requireDigest(input.candidate.candidate_digest, 'candidate_digest');
      requireDigest(input.candidate.manifest_digest, 'manifest_digest');
      if (input.candidate.candidate_ref !== `opl://foundry/candidate/${input.candidate.candidate_digest}`) {
        fail('Version registration candidate ref does not match its digest.');
      }
      const candidateIntegrity = validateCandidateDirectory(this.#paths, input.candidate);
      if (candidateIntegrity.manifest_digest !== input.candidate.manifest_digest) {
        fail('Version registration candidate manifest digest is inconsistent.', {
          candidate_digest: input.candidate.candidate_digest,
          expected_manifest_digest: candidateIntegrity.manifest_digest,
        });
      }
      const state = this.#read(input.target_agent_id, input.target_domain_id);
      const qualificationBase = {
        surface_kind: 'opl_foundry_qualification_record' as const,
        qualification_id: `qualification:${input.target_agent_id}:${input.candidate.candidate_digest}`,
        target_agent_id: input.target_agent_id,
        target_domain_id: input.target_domain_id,
        blueprint_digest: input.blueprint_digest,
        candidate_digest: input.candidate.candidate_digest,
        evidence_digest: input.evidence_digest,
        risk_tier: input.risk_tier,
        qualified_at: input.qualified_at,
      };
      const qualification: QualificationRecord = {
        ...qualificationBase,
        qualification_digest: canonicalDigest(qualificationBase),
      };
      const versionBase = {
        surface_kind: 'opl_foundry_agent_version' as const,
        version_id: `version:${input.target_agent_id}:${input.candidate.candidate_digest}`,
        target_agent_id: input.target_agent_id,
        target_domain_id: input.target_domain_id,
        blueprint_digest: input.blueprint_digest,
        candidate_digest: input.candidate.candidate_digest,
        candidate_ref: input.candidate.candidate_ref,
        qualification_digest: qualification.qualification_digest,
        created_at: input.qualified_at,
      };
      const version: AgentVersion = { ...versionBase, version_digest: canonicalDigest(versionBase) };
      const existing = state.versions.find((entry) => entry.candidate_digest === input.candidate.candidate_digest);
      if (existing) {
        const existingQualification = state.qualifications.find(
          (entry) => entry.qualification_digest === existing.qualification_digest,
        ) ?? fail('Version qualification record is missing.', { version_digest: existing.version_digest });
        if (
          canonicalJsonText(existing) !== canonicalJsonText(version)
          || canonicalJsonText(existingQualification) !== canonicalJsonText(qualification)
        ) {
          fail('Candidate digest is already registered with different immutable metadata.', {
            candidate_digest: input.candidate.candidate_digest,
            version_digest: existing.version_digest,
          });
        }
        return { version: clone(existing), qualification: clone(existingQualification) };
      }
      const prepared = state.qualifications.find((entry) => entry.candidate_digest === input.candidate.candidate_digest);
      if (prepared && canonicalJsonText(prepared) !== canonicalJsonText(qualification)) {
        fail('Prepared qualification conflicts with version registration retry.', {
          candidate_digest: input.candidate.candidate_digest,
        });
      }
      publishImmutableRegistryRecord(
        path.join(directory, 'qualifications', `${digestSegment(qualification.qualification_digest)}.json`),
        qualification,
        'QualificationRecord',
      );
      publishImmutableRegistryRecord(
        path.join(directory, 'agent-versions', `${digestSegment(version.version_digest)}.json`),
        version,
        'AgentVersion',
      );
      const committed = this.#read(input.target_agent_id, input.target_domain_id);
      const committedVersion = committed.versions.find((entry) => entry.version_digest === version.version_digest)
        ?? fail('AgentVersion registration did not become visible.', { version_digest: version.version_digest });
      const committedQualification = committed.qualifications.find(
        (entry) => entry.qualification_digest === qualification.qualification_digest,
      ) ?? fail('QualificationRecord registration did not become visible.', {
        qualification_digest: qualification.qualification_digest,
      });
      validateCandidateDirectory(this.#paths, committedVersion);
      return { version: clone(committedVersion), qualification: clone(committedQualification) };
    });
  }

  async list(targetAgentId: string, targetDomainId: string) {
    return clone(this.#read(targetAgentId, targetDomainId).versions);
  }

  async resolveVersion(ref: string | null, targetAgentId: string, targetDomainId: string) {
    const state = this.#read(targetAgentId, targetDomainId);
    const resolved = ref ?? state.activation.active_version_digest;
    return clone(state.versions.find((entry) => entry.version_digest === resolved) ?? null);
  }

  async activation(targetAgentId: string, targetDomainId: string) {
    return clone(this.#read(targetAgentId, targetDomainId).activation);
  }

  async compareAndSwapActivation(input: Parameters<VersionRegistry['compareAndSwapActivation']>[0]) {
    return this.#switchActivation({ ...input, transaction_kind: 'activate' });
  }

  async rollback(input: Parameters<VersionRegistry['rollback']>[0]) {
    return this.#switchActivation({ ...input, transaction_kind: 'rollback' });
  }

  #switchActivation(input: Parameters<VersionRegistry['compareAndSwapActivation']>[0] & {
    transaction_kind: ActivationTransaction['transaction_kind'];
  }) {
    const directory = this.#directory(input.target_agent_id, input.target_domain_id);
    const lock = this.#mutationLock(input.target_agent_id, input.target_domain_id);
    return withMutationLock(lock, () => {
      requireString(input.target_agent_id, 'target_agent_id');
      requireString(input.target_domain_id, 'target_domain_id');
      requireDigest(input.version_digest, 'version_digest');
      requireString(input.occurred_at, 'occurred_at');
      if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0) {
        fail('Activation expected revision is invalid.');
      }
      if (input.authority_receipt_ref !== null) requireString(input.authority_receipt_ref, 'authority_receipt_ref');
      if (input.transaction_kind === 'rollback' && input.authority_receipt_ref === null) {
        fail('Rollback requires an authority receipt.');
      }
      const state = this.#read(input.target_agent_id, input.target_domain_id);
      const replay = state.transactions.find((entry) => entry.previous_revision === input.expected_revision);
      if (replay) {
        if (
          replay.transaction_kind !== input.transaction_kind
          || replay.to_version_digest !== input.version_digest
          || replay.authority_receipt_ref !== input.authority_receipt_ref
          || replay.occurred_at !== input.occurred_at
        ) {
          fail('Activation transaction replay conflicts with immutable history.', {
            expected_revision: input.expected_revision,
            transaction_id: replay.transaction_id,
          });
        }
        const replayVersion = state.versions.find((entry) => entry.version_digest === replay.to_version_digest)
          ?? fail('Activation replay target version does not exist.', { version_digest: replay.to_version_digest });
        validateCandidateDirectory(this.#paths, replayVersion);
        repairActivationProjection(directory, state.activation);
        return clone(replay);
      }
      if (state.activation.revision !== input.expected_revision) {
        fail('Activation pointer revision compare-and-swap failed.', {
          expected_revision: input.expected_revision,
          actual_revision: state.activation.revision,
        });
      }
      const targetVersion = state.versions.find((entry) => entry.version_digest === input.version_digest)
        ?? fail('Activation target version does not exist.', { version_digest: input.version_digest });
      validateCandidateDirectory(this.#paths, targetVersion);
      const transactionBase = {
        surface_kind: 'opl_foundry_activation_transaction' as const,
        transaction_kind: input.transaction_kind,
        target_agent_id: input.target_agent_id,
        target_domain_id: input.target_domain_id,
        from_version_digest: state.activation.active_version_digest,
        to_version_digest: input.version_digest,
        previous_revision: state.activation.revision,
        next_revision: state.activation.revision + 1,
        authority_receipt_ref: input.authority_receipt_ref,
        occurred_at: input.occurred_at,
      };
      const transaction: ActivationTransaction = {
        ...transactionBase,
        transaction_id: `activation:${canonicalDigest(transactionBase)}`,
      };
      const activation: ActivationPointer = {
        ...state.activation,
        active_version_digest: input.version_digest,
        revision: transaction.next_revision,
        updated_at: input.occurred_at,
      };
      writeAtomic(
        path.join(directory, 'activation-transactions', `${String(transaction.next_revision).padStart(10, '0')}.json`),
        canonicalJsonBytes(transaction),
      );
      repairActivationProjection(directory, activation);
      const committed = this.#read(input.target_agent_id, input.target_domain_id);
      if (
        committed.activation.revision !== transaction.next_revision
        || committed.activation.active_version_digest !== transaction.to_version_digest
      ) {
        fail('Activation transaction did not become visible.', { transaction_id: transaction.transaction_id });
      }
      return clone(transaction);
    });
  }
}
