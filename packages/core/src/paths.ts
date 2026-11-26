import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KernelError } from './errors.ts';

export interface StatePaths {
  readonly home_dir: string;
  readonly state_dir: string;
  readonly db_file: string;
  readonly run_dir: string;
  readonly lock_file: string;
  readonly session_file: string;
  readonly socket_path: string;
}

const TEST_CONTEXT_ENV_KEYS = [
  'NODE_TEST_CONTEXT',
  'JEST_WORKER_ID',
  'VITEST_WORKER_ID',
] as const;

function canonicalizeForContainment(target: string): string {
  const absolute = path.resolve(target);
  const missing: string[] = [];
  let existing = absolute;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return absolute;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  let canonicalExisting = existing;
  try {
    canonicalExisting = fs.realpathSync(existing);
  } catch {
    // Fall back to lexical path if realpath is unavailable.
  }
  return path.join(canonicalExisting, ...missing);
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(
    canonicalizeForContainment(parent),
    canonicalizeForContainment(child),
  );
  return rel === ''
    || (rel !== '..'
      && !rel.startsWith(`..${path.sep}`)
      && !path.isAbsolute(rel));
}

function isHermeticRepoTempState(stateDir: string): boolean {
  const tempRoot = process.env.OPL_REPO_TEMP_ROOT?.trim();
  return process.env.OPL_REPO_TEMP_ENV_ACTIVE?.trim() === '1'
    && Boolean(tempRoot)
    && isWithin(tempRoot as string, stateDir);
}

function defaultUserStateDir(homeDir: string): string {
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
  }
  if (process.platform === 'win32') {
    const appData = process.env.LOCALAPPDATA?.trim() || path.join(homeDir, 'AppData', 'Local');
    return path.join(appData, 'OPL', 'state');
  }
  const xdgState = process.env.XDG_STATE_HOME?.trim() || path.join(homeDir, '.local', 'state');
  return path.join(xdgState, 'opl');
}

export function resolveStatePaths(options: {
  stateDir?: string;
  dataDir?: string;
} = {}): StatePaths {
  const explicitArgStateDir = options.stateDir?.trim() || null;
  const envStateDir = process.env.OPL_STATE_DIR?.trim() || null;
  const explicitStateDir = explicitArgStateDir ?? envStateDir;

  const homeDir = process.env.HOME?.trim() || os.homedir();
  const dataDir = options.dataDir?.trim() || process.env.OPL_DATA_DIR?.trim() || null;

  const stateDir = explicitStateDir
    ? path.resolve(explicitStateDir)
    : dataDir
      ? path.join(path.resolve(dataDir), 'opl', 'state')
      : defaultUserStateDir(homeDir);

  const testContextKey = TEST_CONTEXT_ENV_KEYS.find((key) => Boolean(process.env[key]?.trim()));
  if (!explicitStateDir && testContextKey && !isHermeticRepoTempState(stateDir)) {
    throw new KernelError(
      'STATE_DIR_FORBIDDEN',
      `OPL_STATE_DIR or explicit stateDir is required when ${testContextKey} is active.`,
      { test_context_key: testContextKey, resolved_state_dir: stateDir },
    );
  }

  const runDir = path.join(stateDir, 'run');
  const socketHash = crypto.createHash('sha256').update(stateDir).digest('hex').slice(0, 12);
  const socketPath = process.platform === 'win32'
    ? `\\\\.\\pipe\\opld-${socketHash}`
    : path.join(runDir, 'opld.sock');

  return {
    home_dir: homeDir,
    state_dir: stateDir,
    db_file: path.join(stateDir, 'opl.db'),
    run_dir: runDir,
    lock_file: path.join(runDir, 'opld.lock'),
    session_file: path.join(runDir, 'opld.session.json'),
    socket_path: socketPath,
  };
}

export function ensureStateDir(paths: StatePaths = resolveStatePaths()): StatePaths {
  fs.mkdirSync(paths.state_dir, { recursive: true });
  fs.mkdirSync(paths.run_dir, { recursive: true });
  return paths;
}
