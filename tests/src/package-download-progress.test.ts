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

async function fixture(mode: 'range' | 'no-range' | 'slow' | 'disconnect' = 'range') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-download-test-')));
  const bytes = crypto.randomBytes(512 * 1024);
  const ranges: (string | undefined)[] = [];
  const server = http.createServer((request, response) => {
    ranges.push(request.headers.range);
    const requested = Number(request.headers.range?.match(/bytes=(\d+)-/)?.[1] ?? 0);
    const offset = mode === 'no-range' ? 0 : requested;
    response.writeHead(offset ? 206 : 200, { 'Content-Length': bytes.length - offset,
      ...(offset ? { 'Content-Range': `bytes ${offset}-${bytes.length - 1}/${bytes.length}` } : {}) });
    if (mode === 'disconnect' && ranges.length === 1) {
      response.write(bytes.subarray(0, 65536)); setTimeout(() => response.destroy(), 80); return;
    }
    if (mode !== 'slow') { response.end(bytes.subarray(offset)); return; }
    let at = offset;
    const timer = setInterval(() => { response.write(bytes.subarray(at, at += 16384)); if (at >= bytes.length) { clearInterval(timer); response.end(); } }, 60);
    response.on('close', () => clearInterval(timer));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  // Exercise real curl/HTTP Range against loopback, without weakening production HTTPS admission.
  fs.writeFileSync(path.join(bin, 'curl'), `#!${process.execPath}\nconst cp=require('child_process');let a=process.argv.slice(2);for(const flag of ['--proto','--proto-redir']){const i=a.indexOf(flag);if(i>=0)a.splice(i,2);}a[a.length-1]='http://127.0.0.1:${port}/archive';const c=cp.spawn('/usr/bin/curl',a,{stdio:'inherit'});process.on('SIGTERM',()=>c.kill('SIGTERM'));c.on('exit',code=>process.exit(code??1));\n`, { mode: 0o755 });
  const env = { ...process.env, OPL_STATE_DIR: root, PATH: `${bin}:${process.env.PATH}`, OPL_PACKAGE_OPERATION_ID: crypto.randomUUID() };
  writePackageOperation({ operation_id: env.OPL_PACKAGE_OPERATION_ID, package_id: 'fixture', action_id: 'agent_package_install', status: 'running', stage: 'preparing', can_cancel: true, pid: process.pid, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }, env);
  const input = { url: 'https://ghcr.io/v2/owner/package/blobs/fixture', token: 'fixture-token', digest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, size: bytes.length, packageId: 'fixture' };
  const cache = packageDownloadCache(input.digest, env); fs.mkdirSync(cache, { recursive: true });
  return { root, bytes, ranges, env, input, cache, cleanup: async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); } };
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
    assert.equal(readPackageOperation(f.env.OPL_PACKAGE_OPERATION_ID, f.env).cached_bytes, f.bytes.length);
    fs.writeFileSync(archive, Buffer.alloc(f.bytes.length));
    await downloadPackageArchive(f.input, f.env);
    assert.equal(f.ranges.length, 2, 'a same-size corrupt cache must not be trusted');
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
    const progress = readPackageOperation(f.env.OPL_PACKAGE_OPERATION_ID, f.env);
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
