import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const rootBin = path.join(repoRoot, 'bin', 'opl');
const distBin = path.join(repoRoot, 'packages', 'daemon', 'dist', 'cli', 'bin-opl.js');
const distDaemonBin = path.join(repoRoot, 'packages', 'daemon', 'dist', 'cli', 'bin-opld.js');

function runBuiltCli(command, args, envOverrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-cli-state-'));
  try {
    return spawnSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tmpDir,
        OPL_STATE_DIR: path.join(tmpDir, 'state'),
        NODE_NO_WARNINGS: '1',
        OPL_USE_DIST: '1',
        ...envOverrides,
      },
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('built v2 daemon CLI entrypoints exist and load via OPL_USE_DIST=1', () => {
  assert.equal(fs.existsSync(rootBin), true);
  assert.equal(fs.existsSync(distBin), true);
  assert.equal(fs.existsSync(distDaemonBin), true);

  const versionDirect = runBuiltCli(process.execPath, [distBin, '--version']);
  assert.equal(versionDirect.status, 0, versionDirect.stderr);
  assert.match(versionDirect.stdout.trim(), /^\d+\.\d+\.\d+$/);

  const versionRoot = runBuiltCli(rootBin, ['--version']);
  assert.equal(versionRoot.status, 0, versionRoot.stderr);
  assert.equal(versionRoot.stdout.trim(), versionDirect.stdout.trim());

  const versionNodeRoot = runBuiltCli(process.execPath, [rootBin, '--version']);
  assert.equal(versionNodeRoot.status, 0, versionNodeRoot.stderr);
  assert.equal(versionNodeRoot.stdout.trim(), versionDirect.stdout.trim());
});

test('built v2 CLI --help exposes only the 6 core namespaces and rejects retired v1 commands with exit 2', () => {
  const helpRes = runBuiltCli(rootBin, ['--help']);
  assert.equal(helpRes.status, 0, helpRes.stderr);
  assert.match(helpRes.stdout, /OPL Framework CLI v/);
  for (const ns of ['daemon', 'workspace', 'pack', 'connect', 'runway', 'ledger']) {
    assert.match(helpRes.stdout, new RegExp(`\\b${ns}:`));
  }

  for (const retired of [['app', 'state'], ['agents', 'modules'], ['cordis', 'status'], ['contract', 'validate']]) {
    const res = runBuiltCli(rootBin, retired);
    assert.equal(res.status, 2, `Expected exit 2 for retired command: ${retired.join(' ')}`);
  }
});

test('built v2 CLI pack inspect validates contracts/opl-package.v2.schema.json and package manifests', () => {
  const schemaPath = path.join(repoRoot, 'contracts', 'opl-package.v2.schema.json');
  assert.equal(fs.existsSync(schemaPath), true);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(typeof schema, 'object');

  const foundryRes = runBuiltCli(rootBin, [
    'pack',
    'inspect',
    path.join(repoRoot, 'extensions', 'foundry'),
    '--json',
  ]);
  assert.equal(foundryRes.status, 0, foundryRes.stderr);
  const parsed = JSON.parse(foundryRes.stdout.trim());
  assert.equal(parsed.manifest?.identity?.id, 'opl-foundry');
});

test('built v2 CLI flushes >128KB piped --json stdout without truncation (OPL_USE_DIST=1)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-pipe-'));
  try {
    const pkgDir = path.join(tmpDir, 'large-pkg');
    fs.mkdirSync(path.join(pkgDir, 'files'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'opl-package.json'),
      JSON.stringify({
        schema_version: 'opl.package.v2',
        identity: {
          id: 'large-pipe-pkg',
          version: '1.0.0',
          intent: 'extension',
          name: { 'zh-CN': '大输出测试包', 'en-US': 'Large Pipe Package' },
          summary: { 'zh-CN': '管道缓冲测试', 'en-US': 'Pipe buffer test' },
          publisher: 'one-person-lab',
        },
      }),
    );
    for (let i = 0; i < 3500; i += 1) {
      fs.writeFileSync(
        path.join(pkgDir, 'files', `item-${String(i).padStart(4, '0')}-payload-padding-entry.txt`),
        `${i}\n`,
        'utf8',
      );
    }

    const res = await new Promise((resolve, reject) => {
      const child = spawn(rootBin, ['pack', 'build', pkgDir, '--no-write-lock', '--json'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOME: tmpDir,
          OPL_STATE_DIR: path.join(tmpDir, 'state'),
          NODE_NO_WARNINGS: '1',
          OPL_USE_DIST: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.pause();
      const chunks = [];
      let stderr = '';
      child.stdout.on('data', (c) => chunks.push(c));
      child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
      setTimeout(() => child.stdout.resume(), 50);
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, stdout: Buffer.concat(chunks).toString('utf8'), stderr });
      });
    });

    assert.equal(res.code, 0, res.stderr);
    assert.ok(Buffer.byteLength(res.stdout, 'utf8') > 128 * 1024, `Expected >128KB JSON, got ${res.stdout.length}`);
    const parsed = JSON.parse(res.stdout);
    assert.ok(parsed.lock.file_count >= 3500);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('built v2 CLI handles early stdout pipe closure (EPIPE) cleanly without unhandled error crash (OPL_USE_DIST=1)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-built-epipe-'));
  try {
    const pkgDir = path.join(tmpDir, 'epipe-pkg');
    fs.mkdirSync(path.join(pkgDir, 'files'), { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'opl-package.json'),
      JSON.stringify({
        schema_version: 'opl.package.v2',
        identity: {
          id: 'epipe-pipe-pkg',
          version: '1.0.0',
          intent: 'extension',
          name: { 'zh-CN': '断管测试包', 'en-US': 'EPIPE Pipe Package' },
          summary: { 'zh-CN': 'EPIPE 防护测试', 'en-US': 'EPIPE guard test' },
          publisher: 'one-person-lab',
        },
      }),
    );
    for (let i = 0; i < 3500; i += 1) {
      fs.writeFileSync(
        path.join(pkgDir, 'files', `epipe-${String(i).padStart(4, '0')}-payload-padding-entry.txt`),
        `${i}\n`,
        'utf8',
      );
    }

    const runEnv = {
      ...process.env,
      HOME: tmpDir,
      OPL_STATE_DIR: path.join(tmpDir, 'state'),
      NODE_NO_WARNINGS: '1',
      OPL_USE_DIST: '1',
    };

    const runDestroyCase = (immediate) =>
      new Promise((resolve, reject) => {
        const child = spawn(rootBin, ['pack', 'build', pkgDir, '--no-write-lock', '--json'], {
          cwd: repoRoot,
          env: runEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
        if (immediate) {
          child.stdout.destroy();
        } else {
          child.stdout.once('data', () => {
            child.stdout.destroy();
          });
        }
        child.on('error', reject);
        child.on('close', (code, signal) => resolve({ code, signal, stderr }));
      });

    const immediateRes = await runDestroyCase(true);
    assert.equal(immediateRes.signal, null);
    assert.equal(immediateRes.code, 0, immediateRes.stderr);
    assert.doesNotMatch(immediateRes.stderr, /Unhandled 'error' event|Error: write EPIPE|ERR_STREAM_DESTROYED/);

    for (let trial = 0; trial < 3; trial += 1) {
      const postChunkRes = await runDestroyCase(false);
      assert.equal(postChunkRes.signal, null);
      assert.equal(postChunkRes.code, 0, `trial ${trial}: ${postChunkRes.stderr}`);
      assert.doesNotMatch(postChunkRes.stderr, /Unhandled 'error' event|Error: write EPIPE|ERR_STREAM_DESTROYED/);
    }

    const headPipeRes = await new Promise((resolve, reject) => {
      const child = spawn(
        '/bin/bash',
        ['-c', '"$1" pack build "$2" --no-write-lock --json | head -c 100 >/dev/null; exit "${PIPESTATUS[0]}"', 'bash', rootBin, pkgDir],
        {
          cwd: repoRoot,
          env: runEnv,
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let stderr = '';
      child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stderr }));
    });
    assert.equal(headPipeRes.code, 0, headPipeRes.stderr);
    assert.doesNotMatch(headPipeRes.stderr, /Unhandled 'error' event|Error: write EPIPE|ERR_STREAM_DESTROYED/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
