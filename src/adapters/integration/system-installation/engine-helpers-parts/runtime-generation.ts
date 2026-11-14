import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../../../kernel/contract-validation.ts';
import { resolveCodexBinary } from '../../../execution/index.ts';
import { CODEX_APP_SERVER_SMOKE } from '../codex-app-server-smoke.ts';
import { isDeveloperRuntimePath } from '../pending-runtime-integrity.ts';
import {
  type RuntimeToolchainPaths,
  parseCliVersion,
  resolveHomeDir,
  resolveLatestCodexCliVersion,
  verifyCodexExecutable,
} from './version.ts';
import { normalizeOptionalString, runCommand } from '../shared.ts';

const DEFAULT_RUNTIME_STAGE_RETENTION_MAX_COUNT = 2;

const DEFAULT_RUNTIME_STAGE_RETENTION_MAX_AGE_HOURS = 24;

export const CODEX_RUNTIME_UPDATER_VERSION = 'opl-runtime-substrate-updater.v1';

const HEADLESS_PROCESS_INSTANCE_ID = `headless-cli:${process.pid}:${Date.now()}`;

export function currentProcessInstanceId() {
  return normalizeOptionalString(process.env.OPL_APP_PROCESS_INSTANCE_ID) ?? HEADLESS_PROCESS_INSTANCE_ID;
}

function runtimeRootFromCodexPath(binaryPath: string | null | undefined) {
  if (!binaryPath) {
    return null;
  }
  const normalized = path.resolve(binaryPath);
  const suffix = path.join('current', 'bin', 'codex');
  return normalized.endsWith(`${path.sep}${suffix}`)
    ? normalized.slice(0, -(suffix.length + 1))
    : null;
}

export function resolveOplRuntimeToolchainPaths(): RuntimeToolchainPaths {
  const explicitRuntimeRoot = normalizeOptionalString(process.env.OPL_RUNTIME_ROOT);
  const selectedRuntimeRoot = runtimeRootFromCodexPath(resolveCodexBinary()?.path);
  const runtimeRoot = path.resolve(
    explicitRuntimeRoot
      ?? selectedRuntimeRoot
      ?? path.join(resolveHomeDir(), 'Library', 'Application Support', 'OPL', 'runtime'),
  );
  const currentRoot = path.join(runtimeRoot, 'current');
  const currentBinDir = path.join(currentRoot, 'bin');
  const stagingRoot = path.resolve(
    normalizeOptionalString(process.env.OPL_RUNTIME_TOOLCHAIN_STAGE_ROOT)
      ?? path.join(runtimeRoot, 'staged', 'codex-cli'),
  );
  return {
    runtime_root: runtimeRoot,
    current_root: currentRoot,
    current_bin_dir: currentBinDir,
    current_codex_path: path.join(currentBinDir, 'codex'),
    staging_root: stagingRoot,
    generations_root: path.join(runtimeRoot, 'generations'),
    pending_metadata_path: path.join(runtimeRoot, 'pending-codex-generation.json'),
    previous_root: path.join(runtimeRoot, 'previous-toolchain'),
  };
}

function isOplRuntimeCodexBinary(binaryPath: string | null | undefined) {
  if (!binaryPath) {
    return false;
  }
  const normalized = path.resolve(binaryPath);
  return normalized.endsWith(path.join('Library', 'Application Support', 'OPL', 'runtime', 'current', 'bin', 'codex'))
    || normalized.includes(`${path.sep}runtime${path.sep}current${path.sep}bin${path.sep}codex`);
}

export function makeRuntimeStageAttemptRoot(paths: RuntimeToolchainPaths) {
  fs.mkdirSync(paths.staging_root, { recursive: true });
  const attemptRoot = path.join(paths.staging_root, `download-${Date.now()}-${process.pid}`);
  fs.rmSync(attemptRoot, { recursive: true, force: true });
  fs.mkdirSync(attemptRoot, { recursive: true });
  return attemptRoot;
}

function positiveIntegerEnvironmentValue(key: string, fallback: number) {
  const parsed = Number(process.env[key] ?? '');
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function pruneRuntimeStageAttempts(stagingRoot: string) {
  if (!fs.existsSync(stagingRoot)) {
    return {
      pruned_paths: [] as string[],
      retained_paths: [] as string[],
    };
  }
  const maxCount = positiveIntegerEnvironmentValue(
    'OPL_RUNTIME_STAGE_RETENTION_MAX_COUNT',
    DEFAULT_RUNTIME_STAGE_RETENTION_MAX_COUNT,
  );
  const maxAgeHours = positiveIntegerEnvironmentValue(
    'OPL_RUNTIME_STAGE_RETENTION_MAX_AGE_HOURS',
    DEFAULT_RUNTIME_STAGE_RETENTION_MAX_AGE_HOURS,
  );
  const candidates = fs.readdirSync(stagingRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^download-\d+-\d+$/.test(entry.name))
    .map((entry) => {
      const candidatePath = path.join(stagingRoot, entry.name);
      const pid = Number(entry.name.split('-').at(-1));
      return {
        path: candidatePath,
        modified_at_ms: fs.statSync(candidatePath).mtimeMs,
        process_alive: Number.isSafeInteger(pid) && processIsAlive(pid),
      };
    })
    .sort((left, right) => right.modified_at_ms - left.modified_at_ms);
  const retainedPaths: string[] = [];
  const prunedPaths: string[] = [];
  let inactiveRetained = 0;
  for (const candidate of candidates) {
    const expired = Date.now() - candidate.modified_at_ms > maxAgeHours * 60 * 60 * 1000;
    if (candidate.process_alive || (!expired && inactiveRetained < maxCount)) {
      retainedPaths.push(candidate.path);
      if (!candidate.process_alive) inactiveRetained += 1;
      continue;
    }
    fs.rmSync(candidate.path, { recursive: true, force: true });
    prunedPaths.push(candidate.path);
  }
  return {
    pruned_paths: prunedPaths,
    retained_paths: retainedPaths,
  };
}

export function activatePendingCodexRuntimeGeneration() {
  const paths = resolveOplRuntimeToolchainPaths();
  const result = activatePendingCodexRuntimeGenerationAtPaths(paths);
  return { ...result, runtime_binary_path: fs.existsSync(paths.current_codex_path) ? paths.current_codex_path : null };
}

export function activatePendingCodexRuntimeGenerationAtPaths(paths: RuntimeToolchainPaths) {
  if (!fs.existsSync(paths.pending_metadata_path)) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'no_pending_generation',
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  let pending: { generation_root?: unknown; version?: unknown; codex_sha256?: unknown; staging_process_instance_id?: unknown; protocol_verification?: unknown };
  try {
    pending = JSON.parse(fs.readFileSync(paths.pending_metadata_path, 'utf8')) as typeof pending;
  } catch (error) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'manual_required',
      reason: 'pending_generation_metadata_invalid',
      error: error instanceof Error ? error.message : String(error),
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  const generationRoot = typeof pending.generation_root === 'string' ? path.resolve(pending.generation_root) : null;
  const allowedRoot = path.resolve(paths.generations_root);
  if (!generationRoot || !generationRoot.startsWith(`${allowedRoot}${path.sep}`)
    || isDeveloperRuntimePath(paths.current_root)
    || (fs.existsSync(paths.current_bin_dir) && (fs.lstatSync(paths.current_bin_dir).isSymbolicLink()
      || isDeveloperRuntimePath(fs.realpathSync(paths.current_bin_dir))))
    || !fs.existsSync(generationRoot) || fs.lstatSync(generationRoot).isSymbolicLink()
    || !fs.realpathSync(generationRoot).startsWith(`${fs.realpathSync(allowedRoot)}${path.sep}`)) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'manual_required',
      reason: 'pending_generation_path_invalid',
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  if (fs.existsSync(paths.current_codex_path)
    && pending.staging_process_instance_id === currentProcessInstanceId()) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'deferred_same_app_instance',
      current_root: paths.current_root,
      previous_root: paths.previous_root,
      staging_process_instance_id: pending.staging_process_instance_id,
    };
  }
  const stagedCodex = path.join(generationRoot, 'bin', 'codex');
  if (!isRecord(pending.protocol_verification) || pending.protocol_verification.verified !== true
    || pending.protocol_verification.protocol !== CODEX_APP_SERVER_SMOKE) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1', status: 'manual_required',
      reason: 'pending_generation_protocol_unverified', current_root: paths.current_root, previous_root: paths.previous_root,
    };
  }
  const verification = fs.existsSync(stagedCodex) ? verifyCodexExecutable(stagedCodex) : null;
  const digest = verification?.verified
    ? crypto.createHash('sha256').update(fs.readFileSync(stagedCodex)).digest('hex')
    : null;
  if (!verification?.verified || digest !== pending.codex_sha256) {
    return {
      surface_kind: 'opl_runtime_generation_activation.v1',
      status: 'manual_required',
      reason: 'pending_generation_verification_failed',
      verification,
      current_root: paths.current_root,
      previous_root: paths.previous_root,
    };
  }
  const generationBinDir = path.join(generationRoot, 'bin');
  const activationBinDir = path.join(generationRoot, '.activation-bin');
  fs.rmSync(activationBinDir, { recursive: true, force: true });
  fs.mkdirSync(activationBinDir, { recursive: true });
  for (const sourceRoot of [paths.current_bin_dir, generationBinDir]) {
    if (!fs.existsSync(sourceRoot)) continue;
    for (const entry of fs.readdirSync(sourceRoot)) {
      const targetPath = path.join(activationBinDir, entry);
      fs.rmSync(targetPath, { recursive: true, force: true });
      fs.cpSync(path.join(sourceRoot, entry), targetPath, {
        recursive: true,
        force: true,
      });
    }
  }
  fs.mkdirSync(paths.current_root, { recursive: true });
  const retiredPreviousRoot = path.join(
    paths.runtime_root,
    `.previous-toolchain-retired-${process.pid}-${Date.now()}`,
  );
  if (fs.existsSync(paths.previous_root)) {
    fs.renameSync(paths.previous_root, retiredPreviousRoot);
  }
  let movedCurrentToolchain = false;
  try {
    if (fs.existsSync(paths.current_bin_dir)) {
      fs.renameSync(paths.current_bin_dir, paths.previous_root);
      movedCurrentToolchain = true;
    }
    fs.renameSync(activationBinDir, paths.current_bin_dir);
  } catch (error) {
    if (!fs.existsSync(paths.current_bin_dir) && movedCurrentToolchain && fs.existsSync(paths.previous_root)) {
      fs.renameSync(paths.previous_root, paths.current_bin_dir);
    }
    if (!fs.existsSync(paths.previous_root) && fs.existsSync(retiredPreviousRoot)) {
      fs.renameSync(retiredPreviousRoot, paths.previous_root);
    }
    throw error;
  }
  if (fs.existsSync(retiredPreviousRoot)) {
    if (movedCurrentToolchain) {
      fs.rmSync(retiredPreviousRoot, { recursive: true, force: true });
    } else {
      fs.renameSync(retiredPreviousRoot, paths.previous_root);
    }
  }
  fs.rmSync(generationRoot, { recursive: true, force: true });
  fs.rmSync(paths.pending_metadata_path, { force: true });
  return {
    surface_kind: 'opl_runtime_generation_activation.v1',
    status: 'activated',
    version: pending.version ?? verification.parsed_version,
    current_root: paths.current_root,
    previous_root: fs.existsSync(paths.previous_root) ? paths.previous_root : null,
    activated_at: new Date().toISOString(),
    rollback_available: fs.existsSync(paths.previous_root),
  };
}

export function rollbackCodexRuntimeGeneration(
  operations: { renameSync?: typeof fs.renameSync } = {},
) {
  const paths = resolveOplRuntimeToolchainPaths();
  if (!fs.existsSync(paths.previous_root)) {
    return {
      surface_kind: 'opl_runtime_generation_rollback.v1',
      status: 'manual_required',
      reason: 'previous_generation_missing',
    };
  }
  if (!fs.existsSync(paths.current_bin_dir)) {
    return {
      surface_kind: 'opl_runtime_generation_rollback.v1',
      status: 'manual_required',
      reason: 'current_toolchain_missing',
    };
  }
  const swapRoot = path.join(paths.runtime_root, `.rollback-toolchain-swap-${process.pid}-${Date.now()}`);
  const renameSync = operations.renameSync ?? fs.renameSync;
  let completedRenameCount = 0;
  try {
    renameSync(paths.current_bin_dir, swapRoot);
    completedRenameCount = 1;
    renameSync(paths.previous_root, paths.current_bin_dir);
    completedRenameCount = 2;
    renameSync(swapRoot, paths.previous_root);
    completedRenameCount = 3;
  } catch (error) {
    if (completedRenameCount === 2) {
      renameSync(paths.current_bin_dir, paths.previous_root);
      renameSync(swapRoot, paths.current_bin_dir);
    } else if (completedRenameCount === 1 && !fs.existsSync(paths.current_bin_dir) && fs.existsSync(swapRoot)) {
      renameSync(swapRoot, paths.current_bin_dir);
    }
    throw error;
  }
  fs.rmSync(paths.pending_metadata_path, { force: true });
  return {
    surface_kind: 'opl_runtime_generation_rollback.v1',
    status: 'completed',
    current_root: paths.current_root,
    previous_root: paths.previous_root,
    rolled_back_at: new Date().toISOString(),
  };
}

export function readLatestPendingCodexGeneration(paths: RuntimeToolchainPaths) {
  if (!fs.existsSync(paths.pending_metadata_path)) return null;
  const latestVersion = resolveLatestCodexCliVersion({ preferOffline: true });
  if (!latestVersion || !fs.existsSync(paths.pending_metadata_path)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(paths.pending_metadata_path, 'utf8')) as {
      surface_kind?: unknown;
      dependency_id?: unknown;
      generation_root?: unknown;
      version?: unknown;
      staging_process_instance_id?: unknown;
      protocol_verification?: unknown;
      codex_sha256?: unknown;
    };
    const pendingVersion = typeof payload.version === 'string'
      ? parseCliVersion(payload.version)?.version ?? null
      : null;
    const generationRoot = typeof payload.generation_root === 'string'
      ? path.resolve(payload.generation_root)
      : null;
    const allowedRoot = path.resolve(paths.generations_root);
    if (payload.surface_kind !== 'opl_runtime_pending_generation.v1'
      || payload.dependency_id !== 'codex-cli'
      || pendingVersion !== latestVersion
      || !generationRoot
      || !generationRoot.startsWith(`${allowedRoot}${path.sep}`)
      || !fs.existsSync(path.join(generationRoot, 'bin', 'codex'))) return null;
    if (!isRecord(payload.protocol_verification) || payload.protocol_verification.verified !== true
      || payload.protocol_verification.protocol !== CODEX_APP_SERVER_SMOKE
      || crypto.createHash('sha256').update(fs.readFileSync(path.join(generationRoot, 'bin', 'codex'))).digest('hex') !== payload.codex_sha256) return null;
    return {
      version: pendingVersion,
      generation_root: generationRoot,
      staging_process_instance_id: typeof payload.staging_process_instance_id === 'string'
        ? payload.staging_process_instance_id
        : null,
    };
  } catch {
    return null;
  }
}
