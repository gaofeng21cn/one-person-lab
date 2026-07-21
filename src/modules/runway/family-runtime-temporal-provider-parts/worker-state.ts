import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import { record } from '../../../kernel/json-record.ts';
import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';

export type TemporalWorkerState = {
  provider_kind: 'temporal';
  pid: number;
  address: string;
  namespace: string;
  task_queue: string;
  started_at: string;
  status: 'starting' | 'ready' | 'exited';
  source_version?: string;
  workflow_bundle_path?: string;
  workflow_bundle_version?: string;
  workflow_bundle_source_version?: string;
  resident_restart_count?: number;
  log_refs?: {
    stdout_path: string;
    stderr_path: string;
  };
  last_exit?: {
    exit_status: 'process_not_alive' | 'worker_run_returned' | 'worker_run_failed' | 'worker_shutdown_requested';
    exited_at: string;
    message?: string;
  };
};

type WorkerRuntimeSourceVersion = {
  sourceRoot: string;
  contentHash: string;
};

export function temporalWorkerStatePath(paths: TemporalWorkerPaths) {
  return path.join(paths.root, 'temporal-worker.json');
}

export function temporalWorkerLogRefs(paths: TemporalWorkerPaths) {
  const logRoot = path.join(paths.root, 'logs');
  return {
    stdout_path: path.join(logRoot, 'temporal-worker.stdout.log'),
    stderr_path: path.join(logRoot, 'temporal-worker.stderr.log'),
  };
}

export function openTemporalWorkerAppendLogFds(paths: TemporalWorkerPaths) {
  const logRefs = temporalWorkerLogRefs(paths);
  fs.mkdirSync(path.dirname(logRefs.stdout_path), { recursive: true });
  return {
    logRefs,
    fds: {
      stdout: fs.openSync(logRefs.stdout_path, 'a'),
      stderr: fs.openSync(logRefs.stderr_path, 'a'),
    },
  };
}

export function closeTemporalWorkerLogFds(fds: { stdout: number; stderr: number }) {
  fs.closeSync(fds.stdout);
  fs.closeSync(fds.stderr);
}

function repoRootFromModulePath(moduleUrl: string) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '..');
}

function runtimeSourceRootFromModulePath(modulePath: string) {
  const moduleDir = path.dirname(modulePath);
  let currentDir = moduleDir;
  while (true) {
    if (
      path.basename(currentDir) === 'runway'
      && path.basename(path.dirname(currentDir)) === 'modules'
    ) {
      const executionRoot = path.dirname(path.dirname(currentDir));
      if (path.basename(executionRoot) === 'src' || path.basename(executionRoot) === 'dist') {
        return executionRoot;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return moduleDir;
}

function gitDirForRepo(repoRoot: string) {
  const gitPath = path.join(repoRoot, '.git');
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isDirectory()) {
      return gitPath;
    }
    const content = fs.readFileSync(gitPath, 'utf8').trim();
    const match = /^gitdir:\s*(.+)$/i.exec(content);
    if (!match) {
      return null;
    }
    return path.resolve(repoRoot, match[1]);
  } catch {
    return null;
  }
}

function gitHeadVersion(repoRoot: string) {
  const gitDir = gitDirForRepo(repoRoot);
  if (!gitDir) {
    return null;
  }
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref:')) {
      const ref = head.slice('ref:'.length).trim();
      const refValue = fs.readFileSync(path.join(gitDir, ref), 'utf8').trim();
      return `git:${repoRoot}:${ref}:${refValue}`;
    }
    return `git:${repoRoot}:detached:${head}`;
  } catch {
    return null;
  }
}

function runtimeSourceVersion(modulePath: string) {
  const sourceRoot = runtimeSourceRootFromModulePath(modulePath);
  try {
    const files: string[] = [];
    const collect = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(filePath);
          continue;
        }
        if (
          entry.isFile()
          && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))
        ) {
          files.push(filePath);
        }
      }
    };
    collect(sourceRoot);
    files.sort();
    if (files.length === 0) {
      return null;
    }
    const hash = crypto.createHash('sha256');
    for (const file of files) {
      const relativePath = path.relative(sourceRoot, file);
      hash.update(relativePath);
      hash.update('\0');
      hash.update(fs.readFileSync(file));
      hash.update('\0');
    }
    return `worker-runtime:${sourceRoot}:${hash.digest('hex')}`;
  } catch {
    return null;
  }
}

export function currentWorkerSourceVersion(moduleUrl: string) {
  if (process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION?.trim()) {
    return process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION.trim();
  }
  const modulePath = fileURLToPath(moduleUrl);
  const runtimeVersion = runtimeSourceVersion(modulePath);
  if (runtimeVersion) {
    return runtimeVersion;
  }
  const repoVersion = gitHeadVersion(repoRootFromModulePath(moduleUrl));
  if (repoVersion) {
    return repoVersion;
  }
  try {
    const stat = fs.statSync(modulePath);
    return `worker-module:${modulePath}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return `worker-module:${fileURLToPath(moduleUrl)}`;
  }
}

function parseWorkerRuntimeSourceVersion(sourceVersion: string | null | undefined): WorkerRuntimeSourceVersion | null {
  const normalized = sourceVersion?.trim();
  if (!normalized?.startsWith('worker-runtime:')) {
    return null;
  }
  const rest = normalized.slice('worker-runtime:'.length);
  const separatorIndex = rest.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex === rest.length - 1) {
    return null;
  }
  const sourceRoot = rest.slice(0, separatorIndex);
  const contentHash = rest.slice(separatorIndex + 1);
  if (!sourceRoot || !/^[a-f0-9]{64}$/i.test(contentHash)) {
    return null;
  }
  return { sourceRoot, contentHash: contentHash.toLowerCase() };
}

export function workerSourceVersionsEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalizedLeft = left?.trim() || null;
  const normalizedRight = right?.trim() || null;
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  const leftRuntime = parseWorkerRuntimeSourceVersion(normalizedLeft);
  const rightRuntime = parseWorkerRuntimeSourceVersion(normalizedRight);
  return Boolean(
    leftRuntime
      && rightRuntime
      && leftRuntime.contentHash === rightRuntime.contentHash,
  );
}

export function workerSourceVersionDiagnostic(
  managedSourceVersion: string | null | undefined,
  expectedSourceVersion: string | null | undefined,
) {
  const managed = parseWorkerRuntimeSourceVersion(managedSourceVersion);
  const expected = parseWorkerRuntimeSourceVersion(expectedSourceVersion);
  if (!managed || !expected) {
    return {
      diagnostic_id: 'worker_source_version_unparsed',
      same_content_hash: null,
      different_source_root: null,
      provider_ready_effect: 'none',
    };
  }
  const sameContentHash = managed.contentHash === expected.contentHash;
  const differentSourceRoot = managed.sourceRoot !== expected.sourceRoot;
  return {
    diagnostic_id: sameContentHash && differentSourceRoot
      ? 'same_content_hash_different_source_root'
      : sameContentHash
        ? 'same_content_hash_same_source_root'
        : 'different_content_hash',
    managed_source_root: managed.sourceRoot,
    expected_source_root: expected.sourceRoot,
    same_content_hash: sameContentHash,
    different_source_root: differentSourceRoot,
    provider_ready_effect: sameContentHash ? 'none' : 'worker_source_stale',
  };
}

export function readTemporalWorkerState(paths: TemporalWorkerPaths) {
  try {
    const parsed = readJsonPayloadFile(temporalWorkerStatePath(paths));
    const payload = record(parsed);
    if (payload !== parsed) {
      return null;
    }
    const state = payload as Partial<TemporalWorkerState>;
    if (
      state.provider_kind !== 'temporal'
      || !Number.isInteger(state.pid)
      || typeof state.address !== 'string'
      || typeof state.namespace !== 'string'
      || typeof state.task_queue !== 'string'
      || (state.status !== 'starting' && state.status !== 'ready' && state.status !== 'exited')
    ) {
      return null;
    }
    return state as TemporalWorkerState;
  } catch {
    return null;
  }
}

export function writeTemporalWorkerState(paths: TemporalWorkerPaths, state: TemporalWorkerState) {
  fs.mkdirSync(paths.root, { recursive: true });
  fs.writeFileSync(temporalWorkerStatePath(paths), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function removeTemporalWorkerState(paths: TemporalWorkerPaths) {
  fs.rmSync(temporalWorkerStatePath(paths), { force: true });
}

export function writeTemporalWorkerExitState(
  paths: TemporalWorkerPaths,
  state: TemporalWorkerState,
  exit: TemporalWorkerState['last_exit'],
) {
  writeTemporalWorkerState(paths, {
    ...state,
    status: 'exited',
    last_exit: exit,
  });
}

export function buildTemporalWorkerCrashDiagnostic(
  paths: TemporalWorkerPaths,
  state: TemporalWorkerState | null,
  pidAlive: boolean,
) {
  if (!state || pidAlive) {
    return null;
  }
  return {
    surface_kind: 'temporal_worker_crash_diagnostic',
    provider_kind: 'temporal',
    pid: state.pid,
    exit_status: state.last_exit?.exit_status ?? 'process_not_alive',
    exited_at: state.last_exit?.exited_at ?? null,
    message: state.last_exit?.message ?? null,
    started_at: state.started_at,
    log_refs: state.log_refs ?? temporalWorkerLogRefs(paths),
    authority_boundary: {
      opl: 'temporal_worker_lifecycle_diagnostic_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
