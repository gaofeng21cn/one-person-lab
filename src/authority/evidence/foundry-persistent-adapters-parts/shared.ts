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

export const FILE_STORE_VERSION = 'opl-foundry-file-store.v1';
export const VERSION_REGISTRY_EPOCH_VERSION = 'opl-foundry-version-registry.v1';
export const VERSION_REGISTRY_EPOCH_DIRECTORY = 'epoch-v1';
export const VERSION_REGISTRY_EPOCH_MARKER = 'registry-epoch.json';
export const CANDIDATE_INDEX_VERSION = 'opl-foundry-candidate-index.v2';
export const CANDIDATE_RESOURCE_LOCK_VERSION = 'opl-foundry-candidate-resource-lock.v1';
export const CANDIDATE_RESOURCE_LOCK_PATH = 'contracts/resource-lock.json';
export const CANDIDATE_STAGE_MANIFEST_PATH = 'agent/stages/manifest.json';
export const CANDIDATE_ACTION_CATALOG_PATH = 'contracts/action_catalog.json';
export const CANDIDATE_QUALITY_POLICY_PATH = 'contracts/stage_quality_cycle_policy.json';
export const CANDIDATE_QUALITY_ROLE_PROMPT_PATH = 'agent/prompts/foundry-quality-roles.md';
export const CANDIDATE_QUALITY_RUBRIC_PATH = 'agent/quality_gates/foundry-quality-rubric.md';
export const CANDIDATE_RESOURCE_FIELDS = [
  { kind: 'prompt', field: 'prompt_refs' },
  { kind: 'skill', field: 'skill_refs' },
  { kind: 'knowledge', field: 'knowledge_refs' },
  { kind: 'helper', field: 'helper_refs' },
  { kind: 'model', field: 'model_refs' },
  { kind: 'tool', field: 'tool_refs' },
  { kind: 'schema', field: 'schema_refs' },
] as const;

export type CandidateResourceKind = typeof CANDIDATE_RESOURCE_FIELDS[number]['kind'];
export type CandidateResourceBinding = {
  kind: CandidateResourceKind;
  declared_ref: string;
  immutable_ref: string;
  pack_path: string;
  sha256: string;
  byte_size: number;
};

export type CandidateResourceLock = {
  surface_kind: 'opl_foundry_candidate_resource_lock';
  version: typeof CANDIDATE_RESOURCE_LOCK_VERSION;
  blueprint_digest: string;
  resources: CandidateResourceBinding[];
};

export type FoundryPersistentAdapterOptions = {
  readOnly?: boolean;
};

export function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJsonText(actual) !== canonicalJsonText(wanted)) {
    fail(`${label} fields do not match the persisted contract.`, {
      actual_fields: actual,
      expected_fields: wanted,
    });
  }
}

export function requireWritable(readOnly: boolean, operation: string) {
  if (readOnly) {
    fail('Read-only Foundry persistence adapter cannot mutate storage.', { operation });
  }
}

export function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function canonicalDigest(value: unknown) {
  return `sha256:${sha256(canonicalJsonText(value))}`;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function errorCode(error: unknown) {
  return (error as NodeJS.ErrnoException).code;
}

export function readJson<T>(file: string): T {
  return parseJsonText(fs.readFileSync(file, 'utf8')) as T;
}

export function fsyncDirectory(directory: string) {
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

export function fsyncFile(file: string) {
  const handle = fs.openSync(file, 'r');
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

export function ensureDurableDirectory(directory: string) {
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

export function stagedEntry(stagingRoot: string, label: string) {
  ensureDurableDirectory(stagingRoot);
  const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 48) || 'bytes';
  return path.join(stagingRoot, `stage-${process.pid}-${crypto.randomUUID()}-${safeLabel}`);
}

export function writeStagedFile(stagingRoot: string, label: string, bytes: Buffer) {
  const temporary = stagedEntry(stagingRoot, label);
  const handle = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(handle, bytes);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fsyncDirectory(stagingRoot);
  return temporary;
}

export function writeExclusive(file: string, bytes: Buffer, stagingRoot: string) {
  ensureDurableDirectory(path.dirname(file));
  const temporary = writeStagedFile(stagingRoot, path.basename(file), bytes);
  try {
    fs.linkSync(temporary, file);
    fsyncDirectory(path.dirname(file));
  } finally {
    fs.rmSync(temporary, { force: true });
    fsyncDirectory(stagingRoot);
  }
}

export function writeAtomic(file: string, bytes: Buffer, stagingRoot: string) {
  ensureDurableDirectory(path.dirname(file));
  const temporary = writeStagedFile(stagingRoot, path.basename(file), bytes);
  try {
    fs.renameSync(temporary, file);
    fsyncDirectory(path.dirname(file));
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  } finally {
    fsyncDirectory(stagingRoot);
  }
}

export function processIsAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

export type MutationLockRecord = {
  surface_kind: 'opl_foundry_mutation_lock';
  version: typeof FILE_STORE_VERSION;
  pid: number;
  owner_token: string;
  acquired_at: string;
};

export function readMutationLock(file: string) {
  const owner = readPhysicalCanonicalJson<MutationLockRecord>(file, 'Foundry mutation lock');
  requireExactKeys(
    owner as unknown as Record<string, unknown>,
    ['surface_kind', 'version', 'pid', 'owner_token', 'acquired_at'],
    'Foundry mutation lock',
  );
  if (
    owner.surface_kind !== 'opl_foundry_mutation_lock'
    || owner.version !== FILE_STORE_VERSION
    || !Number.isSafeInteger(owner.pid)
    || owner.pid <= 0
    || typeof owner.owner_token !== 'string'
    || owner.owner_token.length === 0
    || typeof owner.acquired_at !== 'string'
    || !Number.isFinite(Date.parse(owner.acquired_at))
  ) {
    fail('Foundry mutation lock record is invalid.', { lock_file: file });
  }
  return owner;
}

export function reclaimAbandonedMutationLock(file: string) {
  try {
    const owner = readMutationLock(file);
    if (processIsAlive(owner.pid)) return false;
    fs.rmSync(file, { force: true });
    fsyncDirectory(path.dirname(file));
    return true;
  } catch {
    return false;
  }
}

export function acquireMutationLock(file: string, stagingRoot: string) {
  const ownerToken = crypto.randomUUID();
  const record: MutationLockRecord = {
    surface_kind: 'opl_foundry_mutation_lock',
    version: FILE_STORE_VERSION,
    pid: process.pid,
    owner_token: ownerToken,
    acquired_at: new Date().toISOString(),
  };
  writeExclusive(file, canonicalJsonBytes(record), stagingRoot);
  return ownerToken;
}

export function withMutationLock<T>(file: string, stagingRoot: string, operation: () => T): T {
  let ownerToken: string;
  let openError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      ownerToken = acquireMutationLock(file, stagingRoot);
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
      ...((openError as NodeJS.ErrnoException).code === 'EEXIST' ? { failure_code: 'foundry_storage_mutation_in_progress' } : {}),
      lock_file: file,
      cause: openError instanceof Error ? openError.message : String(openError),
    });
  }
  try {
    return operation();
  } finally {
    if (fs.existsSync(file)) {
      const current = readMutationLock(file);
      if (current.owner_token !== ownerToken!) {
        fail('Foundry mutation lock ownership changed before release.', { lock_file: file });
      }
      fs.rmSync(file, { force: true });
    }
    fsyncDirectory(path.dirname(file));
  }
}

export function requireSafeSegment(value: string, field: string) {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    fail(`${field} is not a safe storage identity.`, { field });
  }
  return value;
}

export function digestSegment(digest: string) {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) fail('Foundry digest is invalid.', { digest });
  return digest.slice('sha256:'.length);
}

export function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${field} must be a non-empty string.`, { field });
  }
  return value;
}

export function requireDigest(value: unknown, field: string) {
  const digest = requireString(value, field);
  digestSegment(digest);
  return digest;
}

export function requireUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    fail(`${label} must not contain duplicate identities.`);
  }
}

export function contentDigestFromRef(ref: string) {
  const match = /^opl-content:\/\/sha256\/([a-f0-9]{64})$/.exec(ref);
  if (match) return match[1]!;
  if (ref.startsWith('opl-content:')) {
    fail('Foundry content ref is malformed.', { content_ref: ref });
  }
  return null;
}

export function candidateResourcePackPath(kind: CandidateResourceKind, digest: string) {
  if (kind === 'tool') return `agent/tools/${digest}.blob`;
  if (kind === 'schema') return `content/schema/${digest}.json`;
  return `content/${kind}/${digest}.blob`;
}

export function listPhysicalFiles(root: string, relative = ''): string[] {
  const directory = path.join(root, relative);
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(root, next);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      fail('Foundry candidate contains a symlink.', { candidate_path: next });
    }
    if (stat.isDirectory()) files.push(...listPhysicalFiles(root, next));
    else if (stat.isFile()) files.push(next);
    else {
      fail('Foundry candidate contains a non-regular filesystem entry.', {
        candidate_path: next,
      });
    }
  }
  return files;
}

export function targetStorageKey(agentId: string, domainId: string) {
  return sha256(`${agentId}\0${domainId}`);
}

export type FoundryStoragePaths = ReturnType<typeof foundryStoragePaths>;

export function foundryStoragePaths(rootOverride?: string) {
  const root = rootOverride
    ? path.resolve(rootOverride)
    : path.join(resolveOplStatePaths().state_dir, 'foundry');
  return {
    root,
    staging: path.join(root, '.staging'),
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

export function cleanupDeadStaging(stagingRoot: string) {
  if (!fs.existsSync(stagingRoot)) return;
  let removed = false;
  for (const entry of fs.readdirSync(stagingRoot, { withFileTypes: true })) {
    const match = /^stage-(\d+)-[0-9a-f-]+-/.exec(entry.name);
    if (!match || processIsAlive(Number(match[1]))) continue;
    fs.rmSync(path.join(stagingRoot, entry.name), { recursive: entry.isDirectory(), force: true });
    removed = true;
  }
  if (removed) fsyncDirectory(stagingRoot);
}

export function cleanupLegacyMutationLockTemps(lockRoot: string) {
  let removed = false;
  for (const entry of fs.readdirSync(lockRoot, { withFileTypes: true })) {
    const match = /\.prepare-(\d+)-[0-9a-f-]+$/.exec(entry.name);
    if (!match || !entry.isFile() || processIsAlive(Number(match[1]))) continue;
    fs.rmSync(path.join(lockRoot, entry.name), { force: true });
    removed = true;
  }
  if (removed) fsyncDirectory(lockRoot);
}

export function cleanupDeadMutationLocks(lockRoot: string) {
  for (const entry of fs.readdirSync(lockRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.lock')) continue;
    reclaimAbandonedMutationLock(path.join(lockRoot, entry.name));
  }
}

export function ensureStorage(paths: FoundryStoragePaths) {
  for (const directory of [
    paths.root,
    paths.staging,
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
  cleanupDeadStaging(paths.staging);
  cleanupLegacyMutationLockTemps(paths.mutation_locks);
  cleanupDeadMutationLocks(paths.mutation_locks);
}


export function readPhysicalCanonicalJson<T>(file: string, label: string): T {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a physical JSON file.`, { file });
  const bytes = fs.readFileSync(file);
  const value = parseJsonText(bytes.toString('utf8'));
  if (!bytes.equals(canonicalJsonBytes(value))) fail(`${label} is not canonical JSON.`, { file });
  return value as T;
}
