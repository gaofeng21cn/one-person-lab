import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PackError } from '../errors.ts';
import type { PackageOperationProgress } from '../types.ts';
import { packageSourceArchiveDigest } from './archive.ts';
import { freeDiskBytes, packageDownloadCacheDir } from './download-plan.ts';
import { MAX_PACKAGE_SOURCE_ARCHIVE_BYTES } from './archive.ts';
import { prunePackageDownloadCache } from '../carriers/codex-sync/temp-hygiene.ts';

export interface PackageDownloadRequest {
  readonly url: string;
  readonly token?: string;
  readonly digest: string;
  readonly size: number;
  readonly packageId: string;
  readonly cacheRoot: string;
  readonly parallelism?: number;
  readonly minParallelBytes?: number;
  readonly allowInsecureHttp?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: PackageOperationProgress) => void;
  readonly transport?: DownloadTransport;
}

export interface RangeChunkResult {
  readonly status: number;
  readonly contentRange: string | null;
  readonly bytes: Uint8Array;
}

export interface DownloadTransport {
  fetchRange(input: {
    readonly url: string;
    readonly token?: string;
    readonly start: number;
    readonly end: number;
    readonly signal?: AbortSignal;
  }): Promise<RangeChunkResult>;
  fetchFull?(input: {
    readonly url: string;
    readonly token?: string;
    readonly offset: number;
    readonly maxBytes: number;
    readonly signal?: AbortSignal;
  }): Promise<{ status: number; bytes: Uint8Array }>;
}

const TRANSIENT_CURL_CODES = new Set([5, 6, 7, 16, 18, 28, 35, 52, 55, 56, 92]);
const DEFAULT_PARALLELISM = 4;
const DEFAULT_MIN_PARALLEL_BYTES = 16 * 1024 * 1024;

function physicalFileSize(filePath: string): number {
  const stat = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (stat && !stat.isFile()) {
    throw new PackError('PACK_ARCHIVE_INVALID', `Download cache file '${filePath}' is not a regular file.`);
  }
  return stat?.size ?? 0;
}

function appendFileToDescriptor(sourcePath: string, outputFd: number): void {
  const inputFd = fs.openSync(sourcePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let read: number;
    while ((read = fs.readSync(inputFd, buffer, 0, buffer.length, null)) > 0) {
      let written = 0;
      while (written < read) {
        written += fs.writeSync(outputFd, buffer, written, read - written);
      }
    }
  } finally {
    fs.closeSync(inputFd);
  }
}

export function isValidContentRange(
  headerValue: string | null,
  expectedStart: number,
  expectedEnd: number,
  expectedTotal: number,
): boolean {
  if (!headerValue) return false;
  const match = headerValue.trim().match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!match) return false;
  return (
    Number(match[1]) === expectedStart
    && Number(match[2]) === expectedEnd
    && Number(match[3]) === expectedTotal
  );
}

function acceptsCurlChunkRange(headersPath: string, start: number, end: number, total: number): boolean {
  if (!fs.existsSync(headersPath)) return false;
  const response = fs.readFileSync(headersPath, 'utf8').trim().split(/\r?\n\r?\n/).at(-1) ?? '';
  if (!/^HTTP\/\S+ 206\b/.test(response)) return false;
  const match = response.match(/^content-range:\s*(.+)$/im);
  return isValidContentRange(match?.[1] ?? null, start, end, total);
}

function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PackError('PACK_DOWNLOAD_CANCELLED', 'Package download was cancelled.');
  }
}

function buildCurlTransport(): DownloadTransport {
  return {
    async fetchRange({ url, token, start, end, signal }) {
      const tmpChunk = `${url}.${start}.${end}`;
      void tmpChunk;
      return new Promise<RangeChunkResult>((resolve, reject) => {
        const expectedLen = end - start + 1;
        const headerChunks: Buffer[] = [];
        const bodyChunks: Buffer[] = [];
        const headerFile = path.join(
          fs.mkdtempSync(path.join(osTmpDir(), 'opl-curl-hdr-')),
          'headers.txt',
        );
        const cleanup = () => {
          fs.rmSync(path.dirname(headerFile), { recursive: true, force: true });
        };
        const args = [
          '--disable',
          '--fail',
          '--silent',
          '--show-error',
          '--location',
          '--proto',
          '=https',
          '--proto-redir',
          '=https',
          '--connect-timeout',
          '10',
          '--speed-limit',
          '1',
          '--speed-time',
          '120',
          '--max-filesize',
          String(expectedLen),
          '--range',
          `${start}-${end}`,
          '--dump-header',
          headerFile,
          '--config',
          '-',
          url,
        ];
        const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
        const onAbort = () => child.kill('SIGTERM');
        signal?.addEventListener('abort', onAbort, { once: true });
        child.stdin.on('error', () => {});
        child.stdin.end(token ? `header = "Authorization: Bearer ${token}"\n` : '');
        child.stdout.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => headerChunks.push(chunk));
        child.once('error', (err) => {
          signal?.removeEventListener('abort', onAbort);
          cleanup();
          reject(err);
        });
        child.once('close', (code) => {
          signal?.removeEventListener('abort', onAbort);
          try {
            if (signal?.aborted) {
              cleanup();
              reject(new PackError('PACK_DOWNLOAD_CANCELLED', 'Package download was cancelled.'));
              return;
            }
            const rawHeaders = fs.existsSync(headerFile) ? fs.readFileSync(headerFile, 'utf8') : '';
            const lastResp = rawHeaders.trim().split(/\r?\n\r?\n/).at(-1) ?? '';
            const statusMatch = lastResp.match(/^HTTP\/\S+\s+(\d+)/);
            const status = statusMatch ? Number(statusMatch[1]) : code === 0 ? 200 : 500;
            const rangeMatch = lastResp.match(/^content-range:\s*(.+)$/im);
            cleanup();
            if (code !== 0) {
              reject(
                new PackError('PACK_DOWNLOAD_FAILED', `curl exited with code ${code}.`, {
                  curl_code: code,
                  transient: TRANSIENT_CURL_CODES.has(code ?? -1),
                }),
              );
              return;
            }
            resolve({
              status,
              contentRange: rangeMatch?.[1]?.trim() ?? null,
              bytes: Buffer.concat(bodyChunks),
            });
          } catch (error) {
            cleanup();
            reject(error);
          }
        });
      });
    },
  };
}

function osTmpDir(): string {
  return process.env.TMPDIR?.trim() || '/tmp';
}

function buildFetchTransport(): DownloadTransport {
  return {
    async fetchRange({ url, token, start, end, signal }) {
      const response = await fetch(url, {
        headers: {
          Range: `bytes=${start}-${end}`,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new PackError(
          'PACK_DOWNLOAD_FAILED',
          `Range request failed with HTTP ${response.status} (expected 206).`,
          { status: response.status },
        );
      }
      const contentRange = response.headers.get('content-range');
      const expectedBytes = Math.max(0, end - start + 1);
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader);
        if (Number.isFinite(contentLength) && contentLength > expectedBytes) {
          await response.body?.cancel();
          throw new PackError(
            'PACK_LOCK_MISMATCH',
            `Range response Content-Length (${contentLength}) exceeds expected range size (${expectedBytes}).`,
            { content_length: contentLength, expected_bytes: expectedBytes },
          );
        }
      }
      const reader = response.body?.getReader();
      if (!reader) {
        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > expectedBytes) {
          throw new PackError(
            'PACK_LOCK_MISMATCH',
            `Range response size (${arrayBuf.byteLength}) exceeds expected range size (${expectedBytes}).`,
            { actual_bytes: arrayBuf.byteLength, expected_bytes: expectedBytes },
          );
        }
        return {
          status: response.status,
          contentRange,
          bytes: new Uint8Array(arrayBuf),
        };
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > expectedBytes) {
            await reader.cancel();
            throw new PackError(
              'PACK_LOCK_MISMATCH',
              `Range stream exceeded expected range size (${expectedBytes}).`,
              { expected_bytes: expectedBytes },
            );
          }
          chunks.push(value);
        }
      }
      const combined = new Uint8Array(total);
      let pos = 0;
      for (const chunk of chunks) {
        combined.set(chunk, pos);
        pos += chunk.byteLength;
      }
      return {
        status: response.status,
        contentRange,
        bytes: combined,
      };
    },
    async fetchFull({ url, token, offset, maxBytes, signal }) {
      const response = await fetch(url, {
        headers: {
          ...(offset > 0 ? { Range: `bytes=${offset}-` } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
      const allowedLimit =
        response.status === 206 && offset > 0 ? Math.max(0, maxBytes - offset) : maxBytes;
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader);
        if (Number.isFinite(contentLength) && contentLength > allowedLimit) {
          await response.body?.cancel();
          throw new PackError(
            'PACK_LOCK_MISMATCH',
            `Download response Content-Length (${contentLength}) exceeds maxBytes (${allowedLimit}).`,
            { content_length: contentLength, max_bytes: allowedLimit },
          );
        }
      }
      const reader = response.body?.getReader();
      if (!reader) {
        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > allowedLimit) {
          throw new PackError(
            'PACK_LOCK_MISMATCH',
            `Download response size (${arrayBuf.byteLength}) exceeds maxBytes (${allowedLimit}).`,
            { actual_bytes: arrayBuf.byteLength, max_bytes: allowedLimit },
          );
        }
        return {
          status: response.status,
          bytes: new Uint8Array(arrayBuf),
        };
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > allowedLimit) {
            await reader.cancel();
            throw new PackError(
              'PACK_LOCK_MISMATCH',
              `Download stream exceeded maxBytes (${allowedLimit}).`,
              { max_bytes: allowedLimit },
            );
          }
          chunks.push(value);
        }
      }
      const combined = new Uint8Array(total);
      let pos = 0;
      for (const chunk of chunks) {
        combined.set(chunk, pos);
        pos += chunk.byteLength;
      }
      return {
        status: response.status,
        bytes: combined,
      };
    },
  };
}

export async function downloadPackageArchive(request: PackageDownloadRequest): Promise<string> {
  const allowInsecure = request.allowInsecureHttp ?? false;
  const isHttps = request.url.startsWith('https://');
  const isLocalHttp = allowInsecure && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(request.url);
  if (!isHttps && !isLocalHttp) {
    throw new PackError(
      'INVALID_INPUT',
      `Download URL must use HTTPS (got '${request.url}').`,
      { url: request.url },
    );
  }
  if (request.token !== undefined && !/^[A-Za-z0-9._~+/=-]*$/.test(request.token)) {
    throw new PackError('INVALID_INPUT', 'Download bearer token contains invalid characters.');
  }
  if (
    !Number.isSafeInteger(request.size)
    || request.size <= 0
    || request.size > MAX_PACKAGE_SOURCE_ARCHIVE_BYTES
  ) {
    throw new PackError('INVALID_INPUT', 'Download size must be a bounded positive integer.', {
      size: request.size,
    });
  }

  const rawRoot = packageDownloadCacheDir(request.cacheRoot, request.digest);
  fs.mkdirSync(rawRoot, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(rawRoot).isSymbolicLink()) {
    throw new PackError('PACK_SYMLINK_ESCAPE', 'Download cache root cannot be a symlink.');
  }
  const root = fs.realpathSync(rawRoot);

  const completePath = path.join(root, 'archive.tar.gz');
  const partialPath = `${completePath}.part`;
  const lockPath = path.join(root, 'download.lock');

  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, 'utf8'));
    let alive = false;
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      throw new PackError('PACK_OPERATION_BUSY', 'Another download is already active for this digest.');
    }
    fs.unlinkSync(lockPath);
  }

  const lockFd = fs.openSync(lockPath, 'wx', 0o600);
  fs.writeFileSync(lockFd, String(process.pid));
  fs.closeSync(lockFd);

  const emitProgress = (progress: PackageOperationProgress): void => {
    request.onProgress?.(progress);
  };

  try {
    assertNotCancelled(request.signal);
    emitProgress({
      stage: 'verifying',
      bytes_done: 0,
      bytes_total: request.size,
      speed_bps: 0,
      eta_sec: null,
    });

    if (physicalFileSize(completePath) > 0) {
      if (
        physicalFileSize(completePath) === request.size
        && packageSourceArchiveDigest(completePath) === request.digest
      ) {
        emitProgress({
          stage: 'verifying',
          cached_bytes: request.size,
          bytes_done: request.size,
          bytes_total: request.size,
          speed_bps: 0,
          eta_sec: 0,
        });
        return completePath;
      }
      fs.unlinkSync(completePath);
    }

    if (physicalFileSize(partialPath) > request.size) {
      fs.unlinkSync(partialPath);
    }
    for (const entry of fs.readdirSync(root)) {
      if (/^archive\.tar\.gz\.part\.chunk-\d+-\d+(?:\.headers)?$/.test(entry)) {
        fs.rmSync(path.join(root, entry), { force: true });
      }
    }

    const cached = physicalFileSize(partialPath);
    const remaining = request.size - cached;
    if (freeDiskBytes(root) < remaining) {
      throw new PackError('PACK_INSUFFICIENT_SPACE', 'Insufficient disk space for package download.', {
        required_bytes: remaining,
      });
    }

    emitProgress({
      stage: 'downloading',
      cached_bytes: cached,
      bytes_done: cached,
      bytes_total: request.size,
    });

    const transport =
      request.transport ?? (isLocalHttp ? buildFetchTransport() : buildCurlTransport());
    const parallelism = Math.max(1, Math.min(8, request.parallelism ?? DEFAULT_PARALLELISM));
    const minParallel = Math.max(1, request.minParallelBytes ?? DEFAULT_MIN_PARALLEL_BYTES);

    if (remaining > 0 && parallelism > 1 && remaining >= minParallel) {
      const chunkCount = Math.min(parallelism, Math.max(2, Math.ceil(remaining / minParallel)));
      const chunkSize = Math.ceil(remaining / chunkCount);
      if (freeDiskBytes(root) >= remaining + chunkSize) {
        const chunks = Array.from({ length: chunkCount }, (_, index) => {
          const start = cached + index * chunkSize;
          const end = Math.min(request.size - 1, start + chunkSize - 1);
          return {
            start,
            end,
            file: `${partialPath}.chunk-${start}-${end}`,
          };
        }).filter((c) => c.start <= c.end);

        const startedAt = Date.now();
        try {
          const settled = await Promise.allSettled(
            chunks.map(async (chunk) => {
              const res = await transport.fetchRange({
                url: request.url,
                token: request.token,
                start: chunk.start,
                end: chunk.end,
                signal: request.signal,
              });
              if (
                res.status !== 206
                || !isValidContentRange(res.contentRange, chunk.start, chunk.end, request.size)
                || res.bytes.byteLength !== chunk.end - chunk.start + 1
              ) {
                return false;
              }
              fs.writeFileSync(chunk.file, res.bytes, { mode: 0o600 });
              return true;
            }),
          );

          assertNotCancelled(request.signal);

          // Merge verified contiguous prefix starting at `cached`.
          const outFd = fs.openSync(partialPath, 'a', 0o600);
          let cursor = cached;
          try {
            for (let i = 0; i < chunks.length; i += 1) {
              const chunk = chunks[i];
              const outcome = settled[i];
              if (
                outcome.status !== 'fulfilled'
                || !outcome.value
                || chunk.start !== cursor
                || !fs.existsSync(chunk.file)
              ) {
                break;
              }
              const bytes = physicalFileSize(chunk.file);
              if (bytes !== chunk.end - chunk.start + 1) break;
              appendFileToDescriptor(chunk.file, outFd);
              fs.rmSync(chunk.file, { force: true });
              cursor += bytes;
            }
          } finally {
            fs.closeSync(outFd);
          }

          const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
          const speedBps = Math.round((cursor - cached) / elapsedSec);
          emitProgress({
            stage: 'downloading',
            bytes_done: cursor,
            bytes_total: request.size,
            speed_bps: speedBps,
            eta_sec: speedBps > 0 ? Math.max(0, Math.ceil((request.size - cursor) / speedBps)) : null,
          });
        } finally {
          for (const chunk of chunks) {
            fs.rmSync(chunk.file, { force: true });
          }
        }
      }
    }

    // Sequential resume fallback if parallel did not complete all bytes.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assertNotCancelled(request.signal);
      const offset = physicalFileSize(partialPath);
      if (offset >= request.size) break;

      if (transport.fetchFull) {
        const res = await transport.fetchFull({
          url: request.url,
          token: request.token,
          offset,
          maxBytes: request.size,
          signal: request.signal,
        });
        assertNotCancelled(request.signal);
        if (offset > 0 && res.status === 200) {
          // Server ignored Range and returned full 200 body: replace rather than appending!
          fs.writeFileSync(partialPath, res.bytes, { mode: 0o600 });
        } else if (res.status === 206 || (offset === 0 && res.status === 200)) {
          const outFd = fs.openSync(partialPath, offset === 0 ? 'w' : 'a', 0o600);
          try {
            fs.writeSync(outFd, res.bytes);
          } finally {
            fs.closeSync(outFd);
          }
        } else if (attempt < 2 && (res.status === 408 || res.status === 429 || res.status >= 500)) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        } else {
          throw new PackError('PACK_DOWNLOAD_FAILED', `Package download failed with HTTP ${res.status}.`, {
            status: res.status,
          });
        }
      } else if (request.transport) {
        throw new PackError(
          'PACK_DOWNLOAD_FAILED',
          'Custom download transport does not implement fetchFull for sequential fallback.',
        );
      } else {
        // Fallback to curl --config - for HTTPS sequential resume
        const result = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
          const child = spawn(
            'curl',
            [
              '--disable',
              '--fail',
              '--silent',
              '--show-error',
              '--location',
              '--proto',
              '=https',
              '--proto-redir',
              '=https',
              '--connect-timeout',
              '10',
              '--speed-limit',
              '1',
              '--speed-time',
              '120',
              '--max-filesize',
              String(request.size),
              '--config',
              '-',
              ...(offset > 0 ? ['--continue-at', String(offset)] : []),
              '--output',
              partialPath,
              request.url,
            ],
            { stdio: ['pipe', 'ignore', 'pipe'] },
          );
          const onAbort = () => child.kill('SIGTERM');
          request.signal?.addEventListener('abort', onAbort, { once: true });
          child.stdin.on('error', () => {});
          child.stdin.end(request.token ? `header = "Authorization: Bearer ${request.token}"\n` : '');
          let stderr = '';
          child.stderr.on('data', (chunk: Buffer) => {
            stderr = (stderr + chunk.toString('utf8')).slice(-2000);
          });
          child.once('error', (err) => {
            request.signal?.removeEventListener('abort', onAbort);
            reject(err);
          });
          child.once('close', (code) => {
            request.signal?.removeEventListener('abort', onAbort);
            resolve({ code: code ?? -1, stderr });
          });
        });
        assertNotCancelled(request.signal);
        if (result.code === 33 && offset > 0 && attempt < 2) {
          fs.rmSync(partialPath, { force: true });
          continue;
        }
        if (result.code !== 0) {
          if (
            attempt < 2
            && (TRANSIENT_CURL_CODES.has(result.code)
              || (result.code === 22 && /\b(?:408|425|429|50[0-4])\b/.test(result.stderr)))
          ) {
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
            continue;
          }
          throw new PackError('PACK_DOWNLOAD_FAILED', 'Package sequential download failed.', {
            curl_code: result.code,
          });
        }
      }

      emitProgress({
        stage: 'downloading',
        bytes_done: physicalFileSize(partialPath),
        bytes_total: request.size,
      });
    }

    emitProgress({
      stage: 'verifying',
      bytes_done: physicalFileSize(partialPath),
      bytes_total: request.size,
      speed_bps: 0,
      eta_sec: null,
    });

    if (
      physicalFileSize(partialPath) !== request.size
      || packageSourceArchiveDigest(partialPath) !== request.digest
    ) {
      fs.rmSync(partialPath, { force: true });
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        'Downloaded package archive failed size or SHA-256 integrity verification.',
        { expected_digest: request.digest, expected_size: request.size },
      );
    }

    assertNotCancelled(request.signal);
    fs.chmodSync(partialPath, 0o600);
    fs.renameSync(partialPath, completePath);
    return completePath;
  } finally {
    fs.rmSync(lockPath, { force: true });
    try {
      prunePackageDownloadCache(request.cacheRoot, { preserveDigests: [request.digest] });
    } catch {
      // Best-effort cache quota pruning must not fail a verified download.
    }
  }
}

export { acceptsCurlChunkRange };
