import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runEnvironmentProcess, type EnvironmentOperation } from '../runtime-environment-process.ts';

import { fileIdentity } from '../runtime-environment-execution.ts';
import type { JsonRecord } from './contract.ts';
import { sha256, shortDigest, runtimeEnvironmentStateRoot, writeJsonFile, readJsonObject } from './target-state.ts';

/** Serialize first preparation of a shared environment; execution never takes this lock. */
export async function acquirePreparationLock(root: string, operation?: EnvironmentOperation) {
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, 'prepare.lock');
  const deadline = Date.now() + 300_000;
  const started = performance.now();
  const previousPhase = operation?.phase;
  if (operation) operation.phase = 'lock_wait';
  try {
    while (true) {
      operation?.check();
      try {
        const descriptor = fs.openSync(lock, 'wx');
        fs.writeFileSync(descriptor, String(process.pid));
        fs.closeSync(descriptor);
        if (operation) { operation.lockWaitMs += performance.now() - started; operation.phase = previousPhase!; }
        return () => fs.rmSync(lock, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          const owner = Number(fs.readFileSync(lock, 'utf8'));
          if (owner > 0) {
            try { process.kill(owner, 0); } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ESRCH') { fs.rmSync(lock, { force: true }); continue; }
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        if (!operation && Date.now() >= deadline) throw new Error(`Timed out waiting for environment preparation: ${root}`);
        try { await delay(50, undefined, { signal: operation?.controller.signal }); } catch (error) { operation?.check(); throw error; }
      }
    }
  } catch (error) {
    if (operation) operation.lockWaitMs += performance.now() - started;
    throw error;
  }
}

export function requirementFileDigests(refs: string[], profilePath: string) {
  const result: Record<string, string> = {};
  for (const ref of refs) {
    const filename = path.isAbsolute(ref) ? ref : path.resolve(path.dirname(profilePath), ref);
    if (fs.existsSync(filename) && fs.statSync(filename).isFile()) {
      result[filename] = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    }
  }
  return result;
}

export function preparedDependencyCache(requirements: JsonRecord, binaryPaths: Record<string, string>, refresh = false) {
  const runtimeFiles = Object.fromEntries(Object.values(binaryPaths).map((filename) => [filename, fileIdentity(filename)]));
  // Package and lock lists are sets: declaration order must not trigger another installation.
  const orderedRequirements = Object.fromEntries(Object.entries(requirements).map(([key, value]) => [key,
    Array.isArray(value) ? [...value].sort((a, b) => sha256(a).localeCompare(sha256(b))) : value,
  ]));
  const environmentId = shortDigest({ requirements: orderedRequirements, runtimeFiles });
  const root = path.join(runtimeEnvironmentStateRoot(), 'dependency-libraries', environmentId);
  const manifestPath = path.join(root, 'environment.json');
  const manifest = refresh ? null : readJsonObject(manifestPath);
  return { root, environmentId, manifestPath, runtimeFiles, manifest };
}

/** Record resolved versions once when preparing, never on the execution hot path. */
export async function recordDependencyInventory(cache: ReturnType<typeof preparedDependencyCache>, input: {
  binaryPaths: Record<string, string>; rLibrary: string; python: string;
  rPackages: string[]; pythonPackages: string[]; baseRPackages: string[]; operation?: EnvironmentOperation;
}) {
  const inventory: JsonRecord = {};
  if (input.binaryPaths.Rscript) {
    const result = await runEnvironmentProcess(input.binaryPaths.Rscript, ['--vanilla', '-e',
      `cat(R.version.string, "\n"); x <- if (dir.exists(${JSON.stringify(input.rLibrary)})) installed.packages(lib.loc=${JSON.stringify(input.rLibrary)}) else matrix(nrow=0, ncol=0); if (nrow(x)) cat(paste(x[,"Package"], x[,"Version"], sep="=="), sep="\n")`,
    ], { operation: input.operation, encoding: 'utf8' });
    inventory.r = result.status === 0 ? result.stdout.trim().split('\n') : null;
  }
  if (fs.existsSync(input.python)) {
    const result = await runEnvironmentProcess(input.python, ['-c',
      'import json,sys,importlib.metadata as m; print(json.dumps({"python":sys.version,"packages":sorted((d.metadata["Name"],d.version) for d in m.distributions())}))',
    ], { operation: input.operation, encoding: 'utf8' });
    inventory.python = result.status === 0 ? JSON.parse(result.stdout) : null;
  }
  const manifest = {
    surface_kind: 'opl_prepared_language_environment', environment_id: cache.environmentId,
    prepared_at: new Date().toISOString(), runtime_file_identities: cache.runtimeFiles,
    managed_r_packages: input.rPackages, managed_python_packages: input.pythonPackages,
    base_r_packages: input.baseRPackages,
    inventory,
  };
  fs.mkdirSync(cache.root, { recursive: true });
  const snapshotRef = path.join(cache.root, 'manifests', `${shortDigest(manifest)}.json`);
  writeJsonFile(snapshotRef, manifest);
  const current = { ...manifest, environment_manifest_ref: snapshotRef };
  writeJsonFile(`${cache.manifestPath}.tmp`, current);
  fs.renameSync(`${cache.manifestPath}.tmp`, cache.manifestPath);
  return current;
}
