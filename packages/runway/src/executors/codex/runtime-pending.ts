import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifyCodexAppServer } from './runtime-probe.ts';

function stat(file: string) {
  return fs.lstatSync(file, { throwIfNoEntry: false });
}

function assertDirectory(dir: string) {
  if (!stat(dir)?.isDirectory()) throw new Error('Invalid pending Codex generation directory.');
}

const appliedKind = 'opl_runtime_applied_codex_generation.v2';

function finishActivation(metadata: string, generations: string, generation: string) {
  if (typeof generation !== 'string' || path.basename(generation) !== generation
      || !generation || generation === '.' || generation === '..') {
    throw new Error('Invalid applied Codex generation name.');
  }
  const staged = path.join(generations, generation);
  if (stat(staged)) {
    assertDirectory(staged);
    fs.rmSync(staged, { recursive: true });
  }
  fs.unlinkSync(metadata);
  return 'activated' as const;
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
    // A later interruption during recursive cleanup must never replay a swap.
    fs.unlinkSync(prepared);
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
  const root = fs.realpathSync(runtimeRoot);
  for (let dir = root; ; dir = path.dirname(dir)) {
    if (stat(path.join(dir, '.git'))) throw new Error('Refusing to activate Codex in a source checkout.');
    if (dir === path.dirname(dir)) break;
  }
  const generations = path.join(root, 'generations');
  if (pending?.surface_kind === appliedKind) {
    assertDirectory(generations);
    return finishActivation(metadata, generations, pending.generation);
  }
  if (pending?.surface_kind !== 'opl_runtime_pending_generation.v1' || pending.dependency_id !== 'codex-cli'
      || pending.activation !== 'next_app_start' || typeof pending.generation_root !== 'string'
      || !path.isAbsolute(pending.generation_root)
      || !/^[0-9a-f]{64}$/.test(pending.codex_sha256)
      || typeof pending.version !== 'string'
      || pending.protocol_verification?.protocol !== 'initialize_initialized_thread_list.v1'
      || pending.protocol_verification?.verified !== true) {
    throw new Error('Invalid pending Codex generation metadata.');
  }

  const current = path.join(root, 'current');
  const live = path.join(current, 'bin');
  const previous = path.join(root, 'previous-toolchain');
  if (stat(current)) assertDirectory(current);
  if (stat(live)) assertDirectory(live);
  if (stat(previous)) assertDirectory(previous);

  // Keep the original receipt and candidate for inspection. Retiring the
  // marker lets a first install proceed and keeps later launches idempotent.
  function unavailable(error: unknown) {
    if (fs.existsSync(path.join(live, 'codex'))) throw error;
    fs.renameSync(metadata, path.join(root, `pending-codex-generation.unavailable-${randomUUID()}.json`));
    return 'none' as const;
  }

  // Validate the parent separately so an absent child does not require realpath.
  const requested = path.resolve(pending.generation_root);
  const parent = path.dirname(requested);
  const ownerRoot = path.dirname(parent);
  if (path.basename(parent) !== 'generations' || !stat(ownerRoot) || fs.realpathSync(ownerRoot) !== root) {
    throw new Error('Pending Codex generation is outside the runtime generations directory.');
  }
  if (stat(generations)) assertDirectory(generations);
  const staged = path.join(generations, path.basename(requested));
  if (!stat(staged)) return unavailable(new Error('Pending Codex generation directory is missing.'));
  assertDirectory(staged);
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
  if (!stat(bin)) return unavailable(new Error('Pending Codex bin directory is missing.'));
  assertDirectory(bin);
  const executable = stat(binary);
  if (!executable) return unavailable(new Error('Pending Codex executable is missing.'));
  if (!executable.isFile()) throw new Error('Invalid pending Codex executable.');
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(binary)) hash.update(chunk);
  if (hash.digest('hex') !== pending.codex_sha256) return unavailable(new Error('Pending Codex executable digest mismatch.'));
  let version: string;
  try {
    version = await verifyCodexAppServer(binary, env);
  } catch (error) {
    return unavailable(error);
  }
  if (version !== pending.version) return unavailable(new Error('Pending Codex executable version mismatch.'));

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
    const preparing = path.join(transaction, 'preparing.json');
    fs.writeFileSync(preparing, JSON.stringify({ hadLive }));
    fs.renameSync(preparing, path.join(transaction, 'prepared.json'));
    if (hadLive) fs.renameSync(live, old);
    fs.renameSync(next, live);
    if (hadLive) {
      if (stat(previous)) fs.renameSync(previous, path.join(transaction, 'retired'));
      fs.renameSync(old, previous);
    }
    // Keep the startup entry point until cleanup finishes. Replacing its
    // receipt commits the swap and makes interrupted cleanup replayable.
    const applied = path.join(transaction, 'applied.json');
    fs.writeFileSync(applied, JSON.stringify({ surface_kind: appliedKind, generation: path.basename(staged) }));
    fs.renameSync(applied, metadata);
  } catch (error) {
    undoActivation(transaction, live, previous);
    throw error;
  }
  return finishActivation(metadata, generations, path.basename(staged));
}
