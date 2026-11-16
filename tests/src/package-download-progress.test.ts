import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { downloadPackageArchive } from '../../src/adapters/integration/agent-package-registry-parts/package-download-worker.ts';
import { packageDownloadCache, packageOperationPath, readPackageOperation, writePackageOperation } from '../../src/adapters/integration/agent-package-registry-parts/package-operation-state.ts';
import { cancelPackageOperation } from '../../src/adapters/integration/agent-package-registry-parts/package-operations.ts';

async function fixture(mode: 'range' | 'no-range' | 'slow' | 'disconnect' | 'parallel' | 'parallel-slow' | 'bad-range' = 'range', size = 512 * 1024) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-download-test-')));
  const bytes = crypto.randomBytes(size);
  const ranges: (string | undefined)[] = [];
  const transfers = { active: 0, peak: 0 };
  const server = http.createServer((request, response) => {
    transfers.active += 1; transfers.peak = Math.max(transfers.peak, transfers.active);
    response.once('close', () => { transfers.active -= 1; });
    ranges.push(request.headers.range);
    const range = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
    const requested = Number(range?.[1] ?? 0);
    const requestedEnd = range?.[2] ? Number(range[2]) : bytes.length - 1;
    const offset = mode === 'no-range' ? 0 : requested;
    const end = mode !== 'no-range' && range ? Math.min(bytes.length - 1, requestedEnd) : bytes.length - 1;
    const payload = bytes.subarray(offset, end + 1);
    const ranged = mode !== 'no-range' && Boolean(range);
    response.writeHead(ranged ? 206 : 200, { 'Content-Length': payload.length,
      ...(ranged ? { 'Content-Range': `bytes ${mode === 'bad-range' ? offset + 1 : offset}-${end}/${bytes.length}` } : {}) });
    if (mode === 'disconnect' && ranges.length === 1) {
      response.write(bytes.subarray(0, 65536)); setTimeout(() => response.destroy(), 80); return;
    }
    if (mode !== 'slow' && mode !== 'parallel-slow') { response.end(payload); return; }
    if (mode === 'parallel-slow' && offset === 0) { response.end(payload); return; }
    let at = offset;
    const timer = setInterval(() => {
      const next = Math.min(end + 1, at + 16384);
      response.write(bytes.subarray(at, next)); at = next;
      if (at > end) { clearInterval(timer); response.end(); }
      }, mode === 'parallel-slow' ? 120 : 60);
    response.on('close', () => clearInterval(timer));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  // Exercise real curl/HTTP Range against loopback, without weakening production HTTPS admission.
  fs.writeFileSync(path.join(bin, 'curl'), `#!${process.execPath}\nconst cp=require('child_process');let a=process.argv.slice(2);for(const flag of ['--proto','--proto-redir']){const i=a.indexOf(flag);if(i>=0)a.splice(i,2);}a[a.length-1]='http://127.0.0.1:${port}/archive';const c=cp.spawn('/usr/bin/curl',a,{stdio:'inherit'});process.on('SIGTERM',()=>c.kill('SIGTERM'));c.on('exit',code=>process.exit(code??1));\n`, { mode: 0o755 });
  const operationId = crypto.randomUUID();
  const env: NodeJS.ProcessEnv = { ...process.env, OPL_STATE_DIR: root, PATH: `${bin}:${process.env.PATH ?? ''}`, OPL_PACKAGE_OPERATION_ID: operationId };
  writePackageOperation({ operation_id: operationId, package_id: 'fixture', action_id: 'agent_package_install', status: 'running', stage: 'preparing', can_cancel: true, pid: process.pid, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }, env);
  const input = { url: 'https://ghcr.io/v2/owner/package/blobs/fixture', token: 'fixture-token', digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, size: bytes.length, packageId: 'fixture' };
  const cache = packageDownloadCache(input.digest, env); fs.mkdirSync(cache, { recursive: true });
  return { root, bytes, ranges, transfers, env, input, cache, cleanup: async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('partial download resumes with real Range and a verified cache avoids a second transfer', async () => {
  const f = await fixture();
  try {
    fs.writeFileSync(path.join(f.cache, 'archive.tar.gz.part'), f.bytes.subarray(0, 131072));
    const archive = await downloadPackageArchive(f.input, f.env);
    assert.deepEqual(fs.readFileSync(archive), f.bytes);
    assert.deepEqual(f.ranges, ['bytes=131072-']);
    assert.equal(await downloadPackageArchive(f.input, f.env), archive);
    assert.equal(f.ranges.length, 1);
    assert.equal(readPackageOperation(f.env.OPL_PACKAGE_OPERATION_ID!, f.env).cached_bytes, f.bytes.length);
    fs.writeFileSync(archive, Buffer.alloc(f.bytes.length));
    await downloadPackageArchive(f.input, f.env);
    assert.equal(f.ranges.length, 2, 'a same-size corrupt cache must not be trusted');
  } finally { await f.cleanup(); }
});

test('large source archives use parallel Range requests and retain one verified digest', async () => {
  const f = await fixture('parallel', 8 * 1024 * 1024);
  try {
    f.env.OPL_PACKAGE_DOWNLOAD_MIN_PARALLEL_BYTES = '1048576';
    f.env.OPL_PACKAGE_DOWNLOAD_PARALLELISM = '4';
    fs.writeFileSync(path.join(f.cache, 'archive.tar.gz.part'), f.bytes.subarray(0, 131072));
    fs.writeFileSync(path.join(f.cache, 'archive.tar.gz.part.chunk-0-100'), 'interrupted worker');
    const archive = await downloadPackageArchive(f.input, f.env);
    assert.deepEqual(fs.readFileSync(archive), f.bytes);
    assert.equal(f.ranges.length, 4);
    assert.ok(f.ranges.every(range => /^bytes=\d+-\d+$/.test(range ?? '')));
    assert.ok(f.ranges.some(range => range?.startsWith('bytes=131072-')));
    assert.equal(fs.readdirSync(f.cache).some(name => name.includes('.chunk-')), false);
  } finally { await f.cleanup(); }
});

test('mismatched Content-Range falls back without reusing invalid chunks', async () => {
  const f = await fixture('bad-range', 1024 * 1024);
  try {
    f.env.OPL_PACKAGE_DOWNLOAD_MIN_PARALLEL_BYTES = '65536';
    f.env.OPL_PACKAGE_DOWNLOAD_PARALLELISM = '4';
    const archive = await downloadPackageArchive(f.input, f.env);
    assert.deepEqual(fs.readFileSync(archive), f.bytes);
    assert.equal(f.ranges.at(-1), undefined);
  } finally { await f.cleanup(); }
});

test('parallel transfer reports live progress and cancellation retains a resumable contiguous prefix', async () => {
  const f = await fixture('parallel-slow', 1024 * 1024);
  try {
    f.env.OPL_PACKAGE_DOWNLOAD_MIN_PARALLEL_BYTES = '65536';
    f.env.OPL_PACKAGE_DOWNLOAD_PARALLELISM = '4';
    const downloading = downloadPackageArchive(f.input, f.env);
    const rejection = assert.rejects(downloading, /cancelled/);
    const deadline = Date.now() + 5000;
    let progress = readPackageOperation(f.env.OPL_PACKAGE_OPERATION_ID!, f.env);
    while (!progress.downloaded_bytes && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
      progress = readPackageOperation(f.env.OPL_PACKAGE_OPERATION_ID!, f.env);
    }
    assert.ok(progress.downloaded_bytes! > 0 && progress.downloaded_bytes! < f.bytes.length);
    assert.ok(progress.bytes_per_second! > 0);
    assert.ok(f.transfers.peak >= 3, `expected overlapping range transfers, peak=${f.transfers.peak}`);
    cancelPackageOperation(progress.operation_id, f.env);
    await rejection;
    const partial = path.join(f.cache, 'archive.tar.gz.part');
    const retained = fs.readFileSync(partial);
    assert.ok(retained.length > 0 && retained.length < f.bytes.length);
    assert.deepEqual(retained, f.bytes.subarray(0, retained.length));
    assert.equal(fs.readdirSync(f.cache).some(name => name.includes('.chunk-')), false);
    assert.equal(fs.existsSync(path.join(f.cache, 'archive.tar.gz')), false);
    fs.unlinkSync(`${packageOperationPath(progress.operation_id, f.env)}.cancel`);
    f.env.OPL_PACKAGE_DOWNLOAD_PARALLELISM = '1';
    const archive = await downloadPackageArchive(f.input, f.env);
    assert.equal(f.ranges.at(-1), `bytes=${retained.length}-`);
    assert.deepEqual(fs.readFileSync(archive), f.bytes);
  } finally { await f.cleanup(); }
});

test('Range fallback never appends ignored full responses', async () => {
  const f = await fixture('no-range', 8 * 1024 * 1024);
  try {
    f.env.OPL_PACKAGE_DOWNLOAD_MIN_PARALLEL_BYTES = '1048576';
    f.env.OPL_PACKAGE_DOWNLOAD_PARALLELISM = '4';
    const archive = await downloadPackageArchive(f.input, f.env);
    assert.deepEqual(fs.readFileSync(archive), f.bytes);
    assert.equal(f.ranges.at(-1), undefined, 'sequential fallback retries without a Range header');
  } finally { await f.cleanup(); }
});

test('server without Range restarts safely instead of appending a full body to partial content', async () => {
  const f = await fixture('no-range');
  try {
    fs.writeFileSync(path.join(f.cache, 'archive.tar.gz.part'), f.bytes.subarray(0, 65536));
    const archive = await downloadPackageArchive(f.input, f.env);
    assert.deepEqual(fs.readFileSync(archive), f.bytes);
    assert.deepEqual(f.ranges, ['bytes=65536-', undefined]);
  } finally { await f.cleanup(); }
});

test('network interruption retries from retained bytes', async () => {
  const f = await fixture('disconnect');
  try {
    await downloadPackageArchive(f.input, f.env);
    assert.equal(f.ranges[1], 'bytes=65536-');
  } finally { await f.cleanup(); }
});

test('real byte progress and cancellation retain resumable bytes without reporting success', async () => {
  const f = await fixture('slow');
  try {
    const downloading = downloadPackageArchive(f.input, f.env);
    const rejection = assert.rejects(downloading, /cancelled/);
    await new Promise(resolve => setTimeout(resolve, 700));
    const progress = readPackageOperation(f.env.OPL_PACKAGE_OPERATION_ID!, f.env);
    assert.ok(progress.downloaded_bytes! > 0 && progress.downloaded_bytes! < f.bytes.length);
    assert.ok(progress.bytes_per_second! > 0);
    assert.equal(cancelPackageOperation(progress.operation_id, f.env).cancel_requested, true);
    await rejection;
    const retained = fs.statSync(path.join(f.cache, 'archive.tar.gz.part')).size;
    assert.ok(retained > 0 && retained < f.bytes.length);
    assert.equal(fs.existsSync(path.join(f.cache, 'archive.tar.gz')), false);
    fs.unlinkSync(`${packageOperationPath(progress.operation_id, f.env)}.cancel`);
    await downloadPackageArchive(f.input, f.env);
    assert.equal(f.ranges[1], `bytes=${retained}-`);
  } finally { await f.cleanup(); }
});

test('digest mismatch removes corrupt partial bytes rather than installing or reusing them', async () => {
  const f = await fixture();
  try {
    const input = { ...f.input, digest: `sha256:${'0'.repeat(64)}` };
    await assert.rejects(downloadPackageArchive(input, f.env), /integrity_failed/);
    assert.equal(fs.existsSync(path.join(packageDownloadCache(input.digest, f.env), 'archive.tar.gz.part')), false);
  } finally { await f.cleanup(); }
});
