import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packageSourceArchiveDigest } from './package-source-archive.ts';
import { checkPackageOperationCancellation, packageDownloadCache, packageOperationCancelled, reportPackageOperation } from './package-operation-state.ts';
import { prunePackageDownloadCache } from './carrier-temp-hygiene.ts';

export type PackageDownload = { url: string; token: string; digest: string; size: number; packageId: string };
const transient = new Set([5, 6, 7, 16, 18, 28, 35, 52, 55, 56, 92]);
const DEFAULT_PARALLELISM = 4;
const DEFAULT_MIN_PARALLEL_BYTES = 16 * 1024 * 1024;
const failure = (code: string) => Object.assign(new Error(code), { code });
function physicalSize(file: string) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw failure('package_download_cache_invalid');
  return stat?.size ?? 0;
}

function positiveIntegerEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, maximum: number) {
  const value = Number(env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

type ParallelChunk = { start: number; end: number; path: string; headers: string };

function appendFileToDescriptor(source: string, output: number) {
  const input = fs.openSync(source, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let read: number;
    while ((read = fs.readSync(input, buffer, 0, buffer.length, null)) > 0) {
      let written = 0;
      while (written < read) written += fs.writeSync(output, buffer, written, read - written);
    }
  } finally { fs.closeSync(input); }
}

function mergeParallelPrefix(partial: string, chunks: ParallelChunk[], offset: number) {
  const output = fs.openSync(partial, 'a', 0o600);
  try {
    for (const chunk of chunks) {
      if (chunk.start !== offset) break;
      const bytes = physicalSize(chunk.path);
      if (!bytes || bytes > chunk.end - chunk.start + 1) break;
      appendFileToDescriptor(chunk.path, output);
      fs.rmSync(chunk.path, { force: true });
      offset += bytes;
    }
  } finally { fs.closeSync(output); }
}

function acceptsChunkRange(chunk: ParallelChunk, total: number) {
  if (!fs.existsSync(chunk.headers)) return false;
  // curl records redirects and proxy CONNECT responses too; use the final response.
  const response = fs.readFileSync(chunk.headers, 'utf8').trim().split(/\r?\n\r?\n/).at(-1) ?? '';
  const range = response.match(/^content-range:\s*bytes (\d+)-(\d+)\/(\d+)\s*$/im);
  return /^HTTP\/\S+ 206\b/.test(response) && !!range
    && Number(range[1]) === chunk.start && Number(range[2]) === chunk.end && Number(range[3]) === total;
}

async function tryParallelDownload(input: PackageDownload, partial: string, offset: number, env: NodeJS.ProcessEnv) {
  const parallelism = positiveIntegerEnv(env, 'OPL_PACKAGE_DOWNLOAD_PARALLELISM', DEFAULT_PARALLELISM, 8);
  const minimum = positiveIntegerEnv(env, 'OPL_PACKAGE_DOWNLOAD_MIN_PARALLEL_BYTES', DEFAULT_MIN_PARALLEL_BYTES, input.size);
  const remaining = input.size - offset;
  if (parallelism <= 1 || remaining < minimum) return;
  const chunkCount = Math.min(parallelism, Math.max(2, Math.ceil(remaining / minimum)));
  const chunkSize = Math.ceil(remaining / chunkCount);
  // Appending a chunk needs temporary headroom until its source file is removed.
  const disk = fs.statfsSync(path.dirname(partial));
  if (disk.bavail * disk.bsize < remaining + chunkSize) return;
  const chunks: ParallelChunk[] = Array.from({ length: chunkCount }, (_, index) => {
    const start = offset + index * chunkSize;
    const end = Math.min(input.size - 1, start + chunkSize - 1);
    const file = `${partial}.chunk-${start}-${end}`;
    return { start, end, path: file, headers: `${file}.headers` };
  }).filter(chunk => chunk.start <= chunk.end);
  const cleanup = () => {
    for (const chunk of chunks) {
      fs.rmSync(chunk.path, { force: true }); fs.rmSync(chunk.headers, { force: true });
    }
  };
  cleanup();
  const children = new Set<ReturnType<typeof spawn>>();
  let stopping = false, parentAlive = true;
  let observationError: unknown;
  let force: ReturnType<typeof setTimeout> | undefined;
  const stopAll = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    force = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); }, 2000);
  };
  const parentPid = process.ppid;
  let previousBytes = offset, previousAt = Date.now(), speed = 0;
  const progress = () => {
    const bytes = offset + chunks.reduce((sum, chunk) => sum + physicalSize(chunk.path), 0), now = Date.now();
    const currentSpeed = Math.max(0, bytes - previousBytes) / Math.max(0.001, (now - previousAt) / 1000);
    speed = speed ? speed * 0.65 + currentSpeed * 0.35 : currentSpeed;
    reportPackageOperation({ downloaded_bytes: bytes, bytes_per_second: Math.round(speed), eta_seconds: speed > 0 ? Math.max(0, Math.ceil((input.size - bytes) / speed)) : null }, env);
    previousBytes = bytes; previousAt = now;
  };
  const timer = setInterval(() => {
    try {
      try { process.kill(parentPid, 0); } catch { parentAlive = false; }
      if (packageOperationCancelled(env) || !parentAlive) stopAll();
      progress();
    } catch (error) { observationError = error; stopAll(); }
  }, 300);
  try {
    const results = await Promise.allSettled(chunks.map(chunk => new Promise<boolean>((resolve, reject) => {
      const child = spawn('curl', [
        '--disable', '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https',
        '--connect-timeout', '10', '--speed-limit', '1', '--speed-time', '120',
        '--max-filesize', String(chunk.end - chunk.start + 1), '--range', `${chunk.start}-${chunk.end}`, '--config', '-',
        '--dump-header', chunk.headers, '--output', chunk.path, input.url,
      ], { env, stdio: ['pipe', 'ignore', 'ignore'] });
      children.add(child);
      child.stdin.on('error', () => {});
      child.stdin.end(`header = "Authorization: Bearer ${input.token}"\n`);
      child.once('error', error => { children.delete(child); stopAll(); reject(error); });
      child.once('close', code => {
        children.delete(child);
        try {
          const accepted = code === 0 && acceptsChunkRange(chunk, input.size) && physicalSize(chunk.path) === chunk.end - chunk.start + 1;
          if (!accepted) stopAll();
          resolve(accepted);
        } catch (error) { stopAll(); reject(error); }
      });
    })));
    progress();
    // Interrupted 206 responses may retain only a prefix. Never append a 200 body
    // or bytes from a mismatched Content-Range, even when its length looks right.
    mergeParallelPrefix(partial, chunks.filter(chunk => acceptsChunkRange(chunk, input.size)), offset);
    checkPackageOperationCancellation(env);
    if (observationError) throw observationError;
    if (!parentAlive) throw failure('package_download_network_failed');
    if (results.some(result => result.status === 'rejected' || !result.value)) {
      // The existing bounded sequential retry path resumes the verified range prefix.
      reportPackageOperation({ downloaded_bytes: physicalSize(partial), bytes_per_second: 0, eta_seconds: null }, env);
    }
  } finally { clearInterval(timer); clearTimeout(force); cleanup(); }
}

/** Curl owns HTTP, redirects and Range. This adapter only binds bytes to an owner digest. */
export async function downloadPackageArchive(input: PackageDownload, env: NodeJS.ProcessEnv = process.env) {
  if (!input.url.startsWith('https://ghcr.io/v2/') || !/^[A-Za-z0-9._~+/=-]+$/.test(input.token)
    || !Number.isSafeInteger(input.size) || input.size <= 0 || input.size > 2 * 1024 ** 3) throw failure('package_download_request_invalid');
  const root = packageDownloadCache(input.digest, env);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(root) !== root) throw failure('package_download_cache_invalid');
  const complete = path.join(root, 'archive.tar.gz'), partial = `${complete}.part`, lock = path.join(root, 'download.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); alive = true; } catch { /* stale owner */ } }
    if (alive) throw failure('package_download_busy');
    fs.unlinkSync(lock);
  }
  const fd = fs.openSync(lock, 'wx', 0o600);
  fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  const parentPid = process.ppid;
  try {
    checkPackageOperationCancellation(env);
    reportPackageOperation({ active_package_id: input.packageId, stage: 'verifying', total_bytes: input.size, downloaded_bytes: 0, bytes_per_second: 0, eta_seconds: null, can_cancel: true }, env);
    if (physicalSize(complete)) {
      if (physicalSize(complete) === input.size && packageSourceArchiveDigest(complete) === input.digest) {
        reportPackageOperation({ cached_bytes: input.size, downloaded_bytes: input.size }, env);
        return complete;
      }
      fs.unlinkSync(complete);
    }
    if (physicalSize(partial) > input.size) fs.unlinkSync(partial);
    // A terminated worker may leave chunks from a different resume offset.
    for (const name of fs.readdirSync(root)) {
      if (/^archive\.tar\.gz\.part\.chunk-\d+-\d+(?:\.headers)?$/.test(name)) fs.rmSync(path.join(root, name), { force: true });
    }
    const cached = physicalSize(partial);
    const disk = fs.statfsSync(root);
    if (disk.bavail * disk.bsize < input.size - cached) throw failure('package_download_insufficient_space');
    reportPackageOperation({ stage: 'downloading', cached_bytes: cached, downloaded_bytes: cached }, env);
    await tryParallelDownload(input, partial, cached, env);
    if (physicalSize(partial) === input.size) {
      reportPackageOperation({ stage: 'verifying', downloaded_bytes: input.size, bytes_per_second: 0, eta_seconds: null }, env);
      if (packageSourceArchiveDigest(partial) !== input.digest) {
        fs.rmSync(partial, { force: true });
        throw failure('package_download_integrity_failed');
      }
      checkPackageOperationCancellation(env);
      fs.chmodSync(partial, 0o600); fs.renameSync(partial, complete);
      return complete;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      checkPackageOperationCancellation(env);
      const offset = physicalSize(partial);
      if (offset === input.size) break;
      const result = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
        const child = spawn('curl', [
          '--disable', '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https',
          '--connect-timeout', '10', '--speed-limit', '1', '--speed-time', '120',
          '--max-filesize', String(input.size), '--config', '-',
          ...(offset ? ['--continue-at', String(offset)] : []), '--output', partial, input.url,
        ], { env, stdio: ['pipe', 'ignore', 'pipe'] });
        child.stdin.on('error', () => {});
        child.stdin.end(`header = "Authorization: Bearer ${input.token}"\n`);
        let stderr = '', previousBytes = offset, previousAt = Date.now(), speed = 0, stopping = false;
        let force: ReturnType<typeof setTimeout> | undefined;
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
        const timer = setInterval(() => {
          let parentAlive = true;
          try { process.kill(parentPid, 0); } catch { parentAlive = false; }
          if (!stopping && (packageOperationCancelled(env) || !parentAlive)) {
            stopping = true; child.kill('SIGTERM'); force = setTimeout(() => child.kill('SIGKILL'), 2000);
          }
          try {
            const bytes = physicalSize(partial), now = Date.now();
            const currentSpeed = Math.max(0, bytes - previousBytes) / Math.max(0.001, (now - previousAt) / 1000);
            speed = speed ? speed * 0.65 + currentSpeed * 0.35 : currentSpeed;
            reportPackageOperation({ downloaded_bytes: bytes, bytes_per_second: Math.round(speed), eta_seconds: speed > 0 ? Math.ceil((input.size - bytes) / speed) : null }, env);
            previousBytes = bytes; previousAt = now;
          } catch { stopping = true; child.kill('SIGTERM'); }
        }, 300);
        child.once('error', error => { clearInterval(timer); clearTimeout(force); reject(error); });
        child.once('close', code => { clearInterval(timer); clearTimeout(force); resolve({ code: code ?? -1, stderr }); });
      });
      checkPackageOperationCancellation(env);
      if (result.code === 0) break;
      // A server without Range must restart explicitly; never append a 200 body to a partial file.
      if (result.code === 33 && offset && attempt < 2) { fs.rmSync(partial, { force: true }); continue; }
      if (attempt < 2 && (transient.has(result.code) || result.code === 22 && /\b(?:408|425|429|50[0-4])\b/.test(result.stderr))) {
        reportPackageOperation({ stage: 'downloading', bytes_per_second: 0, eta_seconds: null }, env);
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); continue;
      }
      throw failure('package_download_network_failed');
    }
    reportPackageOperation({ stage: 'verifying', downloaded_bytes: physicalSize(partial), bytes_per_second: 0, eta_seconds: null }, env);
    if (physicalSize(partial) !== input.size || packageSourceArchiveDigest(partial) !== input.digest) {
      fs.rmSync(partial, { force: true }); throw failure('package_download_integrity_failed');
    }
    checkPackageOperationCancellation(env);
    fs.chmodSync(partial, 0o600); fs.renameSync(partial, complete);
    return complete;
  } finally {
    fs.rmSync(lock, { force: true });
    try {
      prunePackageDownloadCache(env, { preserveDigests: [input.digest] });
    } catch {
      // Cache quota pruning is best-effort and must not fail a verified download.
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await downloadPackageArchive(JSON.parse(fs.readFileSync(0, 'utf8')));
    process.stdout.write(JSON.stringify({ archive_path: result }));
  } catch (error) {
    // Registry tokens, headers and raw curl errors must not enter receipts.
    process.stdout.write(JSON.stringify({ error_code: typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'package_download_failed' }));
    process.exitCode = 1;
  }
}
