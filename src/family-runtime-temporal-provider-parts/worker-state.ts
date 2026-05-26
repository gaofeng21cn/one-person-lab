import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TemporalWorkerPaths } from '../family-runtime-temporal-client.ts';

export type TemporalWorkerState = {
  provider_kind: 'temporal';
  pid: number;
  address: string;
  namespace: string;
  task_queue: string;
  started_at: string;
  status: 'starting' | 'ready';
  source_version?: string;
};

export function temporalWorkerStatePath(paths: TemporalWorkerPaths) {
  return path.join(paths.root, 'temporal-worker.json');
}

function repoRootFromModulePath(moduleUrl: string) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '..');
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
  const sourceRoot = path.dirname(modulePath);
  try {
    const files: string[] = [];
    const collect = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (
          entry.isDirectory()
          && (entry.name.startsWith('family-runtime-') || dir !== sourceRoot)
        ) {
          collect(filePath);
          continue;
        }
        if (
          entry.isFile()
          && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))
          && (dir !== sourceRoot || entry.name.startsWith('family-runtime-'))
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

export function readTemporalWorkerState(paths: TemporalWorkerPaths) {
  try {
    const parsed = JSON.parse(fs.readFileSync(temporalWorkerStatePath(paths), 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const state = parsed as Partial<TemporalWorkerState>;
    if (
      state.provider_kind !== 'temporal'
      || !Number.isInteger(state.pid)
      || typeof state.address !== 'string'
      || typeof state.namespace !== 'string'
      || typeof state.task_queue !== 'string'
      || (state.status !== 'starting' && state.status !== 'ready')
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

export function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
