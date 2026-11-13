import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packageSourceArchiveDigest } from './package-source-archive.ts';
import { checkPackageOperationCancellation, packageDownloadCache, packageOperationCancelled, reportPackageOperation } from './package-operation-state.ts';

export type PackageDownload = { url: string; token: string; digest: string; size: number; packageId: string };
const transient = new Set([5, 6, 7, 16, 18, 28, 35, 52, 55, 56, 92]);
const failure = (code: string) => Object.assign(new Error(code), { code });
function physicalSize(file: string) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw failure('package_download_cache_invalid');
  return stat?.size ?? 0;
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
    const cached = physicalSize(partial);
    const disk = fs.statfsSync(root);
    if (disk.bavail * disk.bsize < input.size - cached) throw failure('package_download_insufficient_space');
    reportPackageOperation({ stage: 'downloading', cached_bytes: cached, downloaded_bytes: cached }, env);
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
  } finally { fs.rmSync(lock, { force: true }); }
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
