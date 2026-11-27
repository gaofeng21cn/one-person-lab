import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifyCodexAppServer } from './runtime-probe.ts';

function stat(file: string) {
  return fs.lstatSync(file, { throwIfNoEntry: false });
}

function assertDirectory(dir: string) {
  if (!stat(dir)?.isDirectory()) throw new Error('Invalid pending Codex generation directory.');
}

// v1 stored a full previous bin directory for rollback. The swap lives on
// the same filesystem and can be undone after either an exception or a crash.
function undoActivation(transaction: string, live: string, previous: string) {
  const prepared = path.join(transaction, 'prepared.json');
  if (stat(prepared)) {
    const { hadLive } = JSON.parse(fs.readFileSync(prepared, 'utf8'));
    const next = path.join(transaction, 'next');
    const old = path.join(transaction, 'old');
    const retired = path.join(transaction, 'retired');
    if (!stat(next)) {
      if (hadLive && !stat(old)) fs.renameSync(previous, old);
      fs.renameSync(live, next);
    }
    if (stat(old)) fs.renameSync(old, live);
    if (stat(retired)) fs.renameSync(retired, previous);
  }
  fs.rmSync(transaction, { recursive: true, force: true });
}

/** Caller holds the per-runtime installation lock. */
export async function activateLegacyCodexGeneration(runtimeRoot: string, env: NodeJS.ProcessEnv): Promise<'activated' | 'deferred_same_app_instance' | 'none'> {
  const metadata = path.join(runtimeRoot, 'pending-codex-generation.json');
  const pendingFile = stat(metadata);
  if (!pendingFile) return 'none';
  if (!pendingFile.isFile()) throw new Error('Invalid pending Codex metadata file.');
  const pending = JSON.parse(fs.readFileSync(metadata, 'utf8'));
  if (pending?.surface_kind !== 'opl_runtime_pending_generation.v1' || pending.dependency_id !== 'codex-cli'
      || pending.activation !== 'next_app_start' || typeof pending.generation_root !== 'string'
      || !path.isAbsolute(pending.generation_root)
      || !/^[0-9a-f]{64}$/.test(pending.codex_sha256)
      || typeof pending.version !== 'string'
      || pending.protocol_verification?.protocol !== 'initialize_initialized_thread_list.v1'
      || pending.protocol_verification?.verified !== true) {
    throw new Error('Invalid pending Codex generation metadata.');
  }

  const root = fs.realpathSync(runtimeRoot);
  const generations = path.join(root, 'generations');
  const staged = pending.generation_root;
  assertDirectory(generations);
  assertDirectory(staged);
  if (path.dirname(fs.realpathSync(staged)) !== generations) {
    throw new Error('Pending Codex generation is outside the runtime generations directory.');
  }
  const current = path.join(root, 'current');
  const live = path.join(current, 'bin');
  const previous = path.join(root, 'previous-toolchain');
  if (stat(current)) assertDirectory(current);
  if (stat(live)) assertDirectory(live);
  if (stat(previous)) assertDirectory(previous);
  for (let dir = root; ; dir = path.dirname(dir)) {
    if (stat(path.join(dir, '.git'))) throw new Error('Refusing to activate Codex in a source checkout.');
    if (dir === path.dirname(dir)) break;
  }

  const transaction = path.join(staged, '.opl-v2-activation');
  if (stat(transaction)) {
    assertDirectory(transaction);
    undoActivation(transaction, live, previous);
  }
  if (env.OPL_APP_PROCESS_INSTANCE_ID && pending.staging_process_instance_id === env.OPL_APP_PROCESS_INSTANCE_ID
      && fs.existsSync(path.join(live, 'codex'))) {
    return 'deferred_same_app_instance';
  }

  const bin = path.join(staged, 'bin');
  const binary = path.join(bin, 'codex');
  assertDirectory(bin);
  if (!stat(binary)?.isFile()) throw new Error('Invalid pending Codex executable.');
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(binary)) hash.update(chunk);
  if (hash.digest('hex') !== pending.codex_sha256 || await verifyCodexAppServer(binary, env) !== pending.version) {
    throw new Error('Pending Codex executable does not match the verified version and digest.');
  }

  fs.mkdirSync(transaction, { mode: 0o700 });
  const next = path.join(transaction, 'next');
  const old = path.join(transaction, 'old');
  const hadLive = !!stat(live);
  try {
    // Preserve tools added or upgraded since the v1 updater staged Codex. The
    // only binaries v1 installed from its verified vendor payload were codex and rg.
    if (hadLive) fs.cpSync(live, next, { recursive: true, verbatimSymlinks: true });
    else fs.mkdirSync(next);
    for (const name of ['codex', 'rg']) {
      const source = path.join(bin, name);
      if (!stat(source)) continue;
      if (!stat(source)?.isFile()) throw new Error('Invalid staged Codex tool.');
      const target = path.join(next, name);
      fs.rmSync(target, { force: true });
      fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE);
    }
    fs.mkdirSync(current, { recursive: true });
    fs.writeFileSync(path.join(transaction, 'prepared.json'), JSON.stringify({ hadLive }));
    if (hadLive) fs.renameSync(live, old);
    fs.renameSync(next, live);
    if (hadLive) {
      if (stat(previous)) fs.renameSync(previous, path.join(transaction, 'retired'));
      fs.renameSync(old, previous);
    }
    // Removing the pending marker commits the swap. Before this point every
    // changed path still has a reversible rename within the runtime directory.
    fs.renameSync(metadata, path.join(transaction, 'applied.json'));
  } catch (error) {
    undoActivation(transaction, live, previous);
    throw error;
  }
  fs.rmSync(staged, { recursive: true, force: true });
  return 'activated';
}
