import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireAdvisoryLock, KernelError } from '@opl/core';
import { codexRuntimeRoot, managedCodexBinary, resolveCodexBinary, resolveCodexFromRuntime } from './binary.ts';
import { stageCodexPayload } from './runtime-payload.ts';
import { activateLegacyCodexGeneration } from './runtime-pending.ts';
import { checkCodexExecutable, verifyCodexAppServer } from './runtime-probe.ts';

async function withInstallLock<T>(root: string, run: () => Promise<T>): Promise<T> {
  for (;;) {
    let lock;
    try {
      // Healthy downloads can outlive the default stale-lock interval.
      lock = acquireAdvisoryLock(path.join(root, 'codex-install.lock'), { preserveLiveHolder: true });
    } catch (error) {
      if (!(error instanceof KernelError) || error.code !== 'LOCK_CONTENTION') throw error;
      await delay(250);
      continue;
    }
    try {
      return await run();
    } finally {
      lock.release();
    }
  }
}

// The Runtime Substrate shares current/bin with other tools. Only publish
// the Codex entry; keep the official platform tree so Codex can find helpers.
async function install(env: NodeJS.ProcessEnv) {
  const root = codexRuntimeRoot(env);
  const active = managedCodexBinary(env);
  const generations = path.join(root, 'generations');
  const binDir = path.dirname(active);
  const rootReal = await fs.realpath(root);
  // Check each ancestor before creating any child under it.
  for (const dir of [generations, path.dirname(binDir), binDir]) {
    await fs.mkdir(dir, { recursive: true });
    if (!(await fs.realpath(dir)).startsWith(rootReal + path.sep)) throw new Error('Codex runtime directory resolves outside the OPL runtime.');
  }
  const stage = await fs.mkdtemp(path.join(generations, '.prepare-codex-'));
  const generation = path.join(generations, 'codex-' + randomUUID());
  const next = path.join(binDir, '.codex-' + randomUUID());
  let published = false;
  try {
    const payload = await stageCodexPayload(stage, env);
    const relativeBinary = path.relative(payload.vendorRoot, payload.binary);
    const version = await verifyCodexAppServer(payload.binary, env);
    if (version !== payload.version) throw new Error('Codex executable version differs from its package.');
    await fs.rename(payload.vendorRoot, generation);
    const binary = path.join(generation, relativeBinary);
    await fs.symlink(path.relative(binDir, binary), next, 'file');
    await fs.rename(next, active);
    published = true;
    return { status: 'installed' as const, runtime_binary_path: active, version };
  } finally {
    await fs.rm(next, { force: true });
    if (!published) await fs.rm(generation, { recursive: true, force: true });
    await fs.rm(stage, { recursive: true, force: true });
  }
}

function configuredRuntime(env: NodeJS.ProcessEnv) {
  // The App can export the stable OPL executable before first install.
  const configured = env.OPL_CODEX_BIN?.trim();
  if (configured && path.resolve(configured) === managedCodexBinary(env)) {
    const entry = statSync(configured, { throwIfNoEntry: false });
    if (!entry || entry.isFile()) {
      // Reuse the executor's file and execute-permission checks for this
      // exact path. A missing or unusable private binary can be installed.
      return resolveCodexFromRuntime(env);
    }
  }
  return resolveCodexBinary(undefined, env);
}

export async function ensureCodexRuntime(env: NodeJS.ProcessEnv = process.env) {
  return withInstallLock(codexRuntimeRoot(env), async () => {
    await activateLegacyCodexGeneration(codexRuntimeRoot(env), env);
    // A configured external path is authoritative. Surface an unusable
    // external selection instead of installing a tool that it would shadow.
    const candidate = configuredRuntime(env);
    if (candidate) {
      try {
        const version = await verifyCodexAppServer(candidate.path, env);
        return { status: 'already_available' as const, runtime_binary_path: candidate.path, version };
      } catch (error) {
        if (path.resolve(candidate.path) !== managedCodexBinary(env)) throw error;
      }
    }
    return install(env);
  });
}

export async function readActiveCodexPath(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const selected = configuredRuntime(env);
  return selected && await checkCodexExecutable(selected.path, env) ? selected.path : null;
}

export async function activateCodexRuntime(env: NodeJS.ProcessEnv = process.env) {
  const root = codexRuntimeRoot(env);
  const pending = path.join(root, 'pending-codex-generation.json');
  let deferred = false;
  if (existsSync(pending)) {
    deferred = await withInstallLock(root, () => activateLegacyCodexGeneration(root, env)) === 'deferred_same_app_instance';
  }
  const binary = await readActiveCodexPath(env);
  return {
    status: deferred ? 'deferred_same_app_instance' as const : binary ? 'active' as const : 'unavailable' as const,
    runtime_binary_path: binary,
  };
}
