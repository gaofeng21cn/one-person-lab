import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { openSqliteStore, txImmediate } from '@opl/core';
import {
  V2_OPL_BIN,
  WORKTREE_ROOT,
  connectTestRpc,
  createDaemonSandbox,
  writeMinimalV2Package,
  type DaemonSandbox,
} from './helpers/sandbox.ts';

const sandboxes: DaemonSandbox[] = [];

function trackSandbox(): DaemonSandbox {
  const sb = createDaemonSandbox();
  sandboxes.push(sb);
  return sb;
}

afterEach(async () => {
  while (sandboxes.length > 0) {
    await sandboxes.pop()!.cleanup();
  }
});

describe('pure v2 CLI, root bin/opl coexistence, exit codes 0..4, and dynamic cli_extensions', () => {
  it('renders 47 orthogonal base subcommands, rejects legacy/unknown commands with exit 2 and zero codex fallback, and supports coexistence routing', async () => {
    const sb = trackSandbox();

    const ver = await sb.spawnCli(['--version']);
    assert.equal(ver.code, 0);
    assert.match(ver.stdout, /\d+\.\d+\.\d+/);

    const help = await sb.spawnCli(['--help']);
    assert.equal(help.code, 0);
    for (const ns of ['daemon', 'workspace', 'pack', 'connect', 'runway', 'ledger']) {
      assert.match(help.stdout, new RegExp(`\\b${ns}:`));
    }
    assert.doesNotMatch(help.stdout, /^\s*foundry:/m);

    // Count subcommands across core namespaces
    const counts = [...help.stdout.matchAll(/^\s{2}(?:daemon|workspace|pack|connect|runway|ledger):\s+(.+)$/gm)].map(
      (m) => m[1]!.split('·').length,
    );
    const total = counts.reduce((a, b) => a + b, 0);
    assert.equal(total, 47);

    // Retired / unknown commands fail with exit 2 and never call codex stub
    for (const retired of [['app', 'state', '--json'], ['agents', 'modules'], ['cordis', 'status'], ['foundry', '--help']]) {
      const res = await sb.spawnCli(retired);
      assert.equal(res.code, 2, `Expected exit 2 for ${retired.join(' ')}`);
    }
    assert.equal(fs.existsSync(path.join(sb.stubLogDir, 'codex.jsonl')), false);

    // Root bin/opl routes unconditionally to v2 CLI (both direct exec and `node bin/opl`)
    const rootHelp = await sb.spawnRootCli(['--help']);
    assert.equal(rootHelp.code, 0);
    assert.match(rootHelp.stdout, /OPL Framework CLI v/);
    const rootVer = await sb.spawnRootCli(['--version']);
    assert.equal(rootVer.code, 0);
    assert.match(rootVer.stdout, /\d+\.\d+\.\d+/);
    for (const retired of [['app', 'state', '--json'], ['agents', 'modules']]) {
      const rootRetired = await sb.spawnRootCli(retired);
      assert.equal(rootRetired.code, 2, `Expected root bin/opl exit 2 for ${retired.join(' ')}`);
    }
    const nodeRootHelp = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(WORKTREE_ROOT, 'bin', 'opl'), '--help'], {
        cwd: sb.workspaceDir,
        env: sb.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
      child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
    assert.equal(nodeRootHelp.code, 0, nodeRootHelp.stderr);
    assert.match(nodeRootHelp.stdout, /OPL Framework CLI v/);
  });

  it('returns exit 2 with JSON error, exit 3 on auth failure, exit 4 on paused_by_human, and handles --quiet', async () => {
    const sb = trackSandbox();
    await sb.startInProcess();

    const badBuild = await sb.spawnCli(['pack', 'build', path.join(sb.root, 'missing'), '--json']);
    assert.equal(badBuild.code, 2);
    assert.equal((badBuild.json as { ok: boolean }).ok, false);

    // Tamper session token -> CLI fails with exit 3 without restarting daemon
    const origSess = fs.readFileSync(sb.sessionPath, 'utf8');
    const parsedSess = JSON.parse(origSess) as { token: string };
    fs.writeFileSync(
      sb.sessionPath,
      JSON.stringify({ ...parsedSess, token: parsedSess.token === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64) }),
      { mode: 0o600 },
    );
    try {
      const authFail = await sb.spawnCli(['pack', 'list', '--json']);
      assert.equal(authFail.code, 3);
      assert.equal((authFail.json as { ok: boolean }).ok, false);
    } finally {
      fs.writeFileSync(sb.sessionPath, origSess, { mode: 0o600 });
    }

    // Seed paused_by_human task -> runway status exits 4
    const ws = await sb.spawnCli(['workspace', 'init', sb.workspaceDir, '--name', 'PauseWS', '--json']);
    assert.equal(ws.code, 0);
    const wsId = (ws.json as { workspace_id: string }).workspace_id;

    const db = openSqliteStore(sb.dbPath);
    const taskId = 'task-paused-cli-test';
    txImmediate(db, () => {
      const ts = new Date().toISOString();
      db.prepare(
        "INSERT INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES (?, ?, 'mas', 'Paused', 'Wait', 'paused_by_human', 1, ?, ?)",
      ).run(taskId, wsId, ts, ts);
    });
    db.close();

    const statusRes = await sb.spawnCli(['runway', 'status', taskId, '--json']);
    assert.equal(statusRes.code, 4);
    assert.equal((statusRes.json as { status: string }).status, 'paused_by_human');

    // --quiet strips ANSI/box drawing
    const quietList = await sb.spawnCli(['pack', 'list', '--quiet']);
    assert.equal(quietList.code, 0);
    assert.doesNotMatch(quietList.stdout, /\x1b\[|[┌─└│]/);
  });

  it('discovers valid cli_extensions dynamically, rejects throwing extensions fail-closed, and cleans up on unlink', async () => {
    const sb = trackSandbox();
    await sb.startInProcess();
    const rpc = await connectTestRpc(sb.sessionPath, 'opl_app', '2.0');

    // Throwing extension fails closed with zero installed_packages row
    const brokenDir = writeMinimalV2Package(path.join(sb.root, 'broken-ext'), {
      id: 'broken-ext',
      intent: 'extension',
      extraManifest: {
        provides: {
          cli_extensions: [
            {
              namespace: 'broken',
              entrypoint: { kind: 'esm_module', module: './scripts/cli.mjs', export: 'registerBrokenCli' },
            },
          ],
        },
      },
    });
    fs.mkdirSync(path.join(brokenDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(brokenDir, 'scripts', 'cli.mjs'),
      'throw new Error("boom ext init");\nexport function registerBrokenCli() { return {}; }\n',
      'utf8',
    );
    await assert.rejects(() => rpc.call('pack.link', { dir: brokenDir }));
    const listAfterBroken = (await rpc.call('pack.list', {})) as { packages: Array<{ package_id: string }> };
    assert.equal(listAfterBroken.packages.some((p) => p.package_id === 'broken-ext'), false);

    // Valid extension registers dynamically and disappears on unlink
    const dynDir = writeMinimalV2Package(path.join(sb.root, 'dyn-probe-ext'), {
      id: 'dyn-probe-ext',
      intent: 'extension',
      extraManifest: {
        provides: {
          cli_extensions: [
            {
              namespace: 'dynprobe',
              entrypoint: { kind: 'esm_module', module: './scripts/cli.mjs', export: 'registerDynProbeCli' },
            },
          ],
        },
      },
    });
    fs.mkdirSync(path.join(dynDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(dynDir, 'scripts', 'cli.mjs'),
      [
        'export function registerDynProbeCli() {',
        '  return {',
        '    namespace: "dynprobe",',
        '    commands: ["ping", "init"],',
        '    handlers: {',
        '      ping: () => ({ ok: true, pong: true }),',
        '      init: (args, opts) => ({ ok: true, args, opts }),',
        '    },',
        '  };',
        '}',
      ].join('\n'),
      'utf8',
    );

    const beforeExt = await sb.spawnCli(['dynprobe', 'ping', '--json']);
    assert.equal(beforeExt.code, 2);

    await rpc.call('pack.link', { dir: dynDir });
    const pingRes = await sb.spawnRootCli(['dynprobe', 'ping', '--json']);
    assert.equal(pingRes.code, 0);
    assert.equal((pingRes.json as { pong: boolean }).pong, true);

    // Regression (E2E-M4/M6 2f): --id is a VALUE_FLAGS entry, not a boolean flag
    const initRes = await sb.spawnCli(['dynprobe', 'init', '--id', 'my-ext-id', '--json']);
    assert.equal(initRes.code, 0);
    assert.equal((initRes.json as { opts: { id: string } }).opts.id, 'my-ext-id');
    assert.deepEqual((initRes.json as { args: string[] }).args, []);

    await rpc.call('pack.unlink', { package_id: 'dyn-probe-ext' });
    const afterUnlink = await sb.spawnCli(['dynprobe', 'ping', '--json']);
    assert.equal(afterUnlink.code, 2);

    // Extension exit_code propagation, subcommand --help forwarding, and generic VALUE_FLAGS
    const extBehavDir = writeMinimalV2Package(path.join(sb.root, 'ext-behav'), {
      id: 'ext-behav',
      intent: 'extension',
      extraManifest: {
        provides: {
          cli_extensions: [
            {
              namespace: 'extbehav',
              entrypoint: { kind: 'esm_module', module: './scripts/cli.mjs', export: 'registerBehavCli' },
            },
          ],
        },
      },
    });
    fs.mkdirSync(path.join(extBehavDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(extBehavDir, 'scripts', 'cli.mjs'),
      [
        'export function registerBehavCli() {',
        '  return {',
        '    namespace: "extbehav",',
        '    commands: ["check", "faildefault"],',
        '    handlers: {',
        '      check: (args, opts) => {',
        '        if (opts.help) return { ok: true, help: "Usage: opl extbehav check [--state-dir <dir>]" };',
        '        if (args[0] === "bad") return { ok: false, exit_code: 2, error: { code: "INVALID", message: "bad input" } };',
        '        return { ok: true, args, opts };',
        '      },',
        '      faildefault: () => ({ ok: false, error: { code: "FAIL", message: "default exit 1" } }),',
        '    },',
        '  };',
        '}',
      ].join('\n'),
      'utf8',
    );
    await rpc.call('pack.link', { dir: extBehavDir });

    const subHelpText = await sb.spawnCli(['extbehav', 'check', '--help']);
    assert.equal(subHelpText.code, 0);
    assert.match(subHelpText.stdout, /Usage: opl extbehav check/);

    const subHelpJson = await sb.spawnCli(['extbehav', 'check', '--help', '--json']);
    assert.equal(subHelpJson.code, 0);
    assert.equal((subHelpJson.json as { ok: boolean; help: string }).ok, true);

    const exit2Res = await sb.spawnCli(['extbehav', 'check', 'bad', '--json']);
    assert.equal(exit2Res.code, 2);
    assert.equal((exit2Res.json as { ok: boolean }).ok, false);

    const exit1Res = await sb.spawnCli(['extbehav', 'faildefault', '--json']);
    assert.equal(exit1Res.code, 1);

    const valFlagsRes = await sb.spawnCli([
      'extbehav',
      'check',
      'ok',
      '--state-dir',
      '/tmp/ext-state',
      '--pkg-version',
      '1.2.3',
      '--json',
    ]);
    assert.equal(valFlagsRes.code, 0);
    assert.equal((valFlagsRes.json as { opts: { 'state-dir': string; 'pkg-version': string } }).opts['state-dir'], '/tmp/ext-state');
    assert.equal((valFlagsRes.json as { opts: { 'state-dir': string; 'pkg-version': string } }).opts['pkg-version'], '1.2.3');
    await rpc.call('pack.unlink', { package_id: 'ext-behav' });

    // Reserved core namespace collision fails closed on pack.link
    const reservedExtDir = writeMinimalV2Package(path.join(sb.root, 'reserved-ns-ext'), {
      id: 'reserved-ns-ext',
      intent: 'extension',
      extraManifest: {
        provides: {
          cli_extensions: [
            {
              namespace: 'pack',
              entrypoint: { kind: 'esm_module', module: './scripts/cli.mjs', export: 'registerReservedCli' },
            },
          ],
        },
      },
    });
    fs.mkdirSync(path.join(reservedExtDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(reservedExtDir, 'scripts', 'cli.mjs'),
      'export function registerReservedCli() { return { namespace: "pack", commands: ["noop"], handlers: { noop: () => ({ ok: true }) } }; }\n',
      'utf8',
    );
    await assert.rejects(
      () => rpc.call('pack.link', { dir: reservedExtDir }),
      (err: Error & { message: string }) => /INVALID_MANIFEST|reserved core namespace/i.test(err.message),
    );
    const listAfterReserved = (await rpc.call('pack.list', {})) as { packages: Array<{ package_id: string }> };
    assert.equal(listAfterReserved.packages.some((p) => p.package_id === 'reserved-ns-ext'), false);

    // Regression (E2E-M4/M6 2a): pack.inspect({ dir }) & opl pack inspect <dir> verify opl-release.lock.json cleanly
    const inspectableDir = writeMinimalV2Package(path.join(sb.root, 'inspectable-agent'), {
      id: 'inspectable-agent',
      intent: 'agent',
    });
    const builtCli = await sb.spawnCli(['pack', 'build', inspectableDir, '--json']);
    assert.equal(builtCli.code, 0);

    const inspectCli = await sb.spawnCli(['pack', 'inspect', inspectableDir, '--json']);
    assert.equal(inspectCli.code, 0);
    assert.match((inspectCli.json as { lock: { digest: string } }).lock.digest, /^sha256:/);

    const inspectRpc = (await rpc.call('pack.inspect', { dir: inspectableDir })) as {
      lock: { digest: string };
    };
    assert.match(inspectRpc.lock.digest, /^sha256:/);

    // Tamper README.md -> both RPC & CLI fail closed on lock verification
    fs.appendFileSync(path.join(inspectableDir, 'README.md'), 'tampered\n', 'utf8');
    await assert.rejects(
      () => rpc.call('pack.inspect', { dir: inspectableDir }),
      (err: Error & { message: string }) => /PACK_LOCK_MISMATCH|digest/i.test(err.message),
    );
    const tamperedCli = await sb.spawnCli(['pack', 'inspect', inspectableDir, '--json']);
    assert.notEqual(tamperedCli.code, 0);

    // Regression (E2E-M4/M6 2b): opl pack migrate-v1 fails atomically with exit 2 on corrupt JSON
    const corruptRepo = path.join(sb.root, 'corrupt-mig');
    fs.mkdirSync(path.join(corruptRepo, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(corruptRepo, 'opl-package.json'),
      JSON.stringify({ surface_kind: 'opl_agent_package_manifest.v1', package_id: 'corrupt-mig', version: '0.1.0' }),
    );
    fs.writeFileSync(path.join(corruptRepo, '.codex-plugin', 'plugin.json'), '{bad-json', 'utf8');
    const migFail = await sb.spawnCli(['pack', 'migrate-v1', corruptRepo, '--json']);
    assert.equal(migFail.code, 2);
    assert.equal((migFail.json as { error: { code: string } }).error.code, 'PACK_MIGRATION_FAILED');

    // Regression (M4.1 r2): extension-to-extension CLI namespace collision fails closed on pack.link & pack.install
    const firstExtDir = writeMinimalV2Package(path.join(sb.root, 'first-ns-ext'), {
      id: 'first-ns-ext',
      intent: 'extension',
      extraManifest: {
        provides: {
          cli_extensions: [
            {
              namespace: 'sharedns',
              entrypoint: { kind: 'esm_module', module: './scripts/cli.mjs', export: 'registerFirst' },
            },
          ],
        },
      },
    });
    fs.mkdirSync(path.join(firstExtDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(firstExtDir, 'scripts', 'cli.mjs'),
      'export function registerFirst() { return { namespace: "sharedns", commands: ["ping"], handlers: { ping: () => ({ ok: true }) } }; }\n',
      'utf8',
    );
    await rpc.call('pack.link', { dir: firstExtDir });

    const collidingExtDir = writeMinimalV2Package(path.join(sb.root, 'colliding-ns-ext'), {
      id: 'colliding-ns-ext',
      intent: 'extension',
      extraManifest: {
        provides: {
          cli_extensions: [
            {
              namespace: 'sharedns',
              entrypoint: { kind: 'esm_module', module: './scripts/cli.mjs', export: 'registerColliding' },
            },
          ],
        },
      },
    });
    fs.mkdirSync(path.join(collidingExtDir, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(collidingExtDir, 'scripts', 'cli.mjs'),
      'export function registerColliding() { return { namespace: "sharedns", commands: ["ping"], handlers: { ping: () => ({ ok: true }) } }; }\n',
      'utf8',
    );
    await assert.rejects(
      () => rpc.call('pack.link', { dir: collidingExtDir }),
      (err: Error & { message: string }) => /INVALID_MANIFEST|collides with already-installed package/i.test(err.message),
    );
    const listAfterCollision = (await rpc.call('pack.list', {})) as { packages: Array<{ package_id: string }> };
    assert.equal(listAfterCollision.packages.some((p) => p.package_id === 'colliding-ns-ext'), false);
    await rpc.call('pack.unlink', { package_id: 'first-ns-ext' });

    // Regression (M4.1 r2): dynamic cli_extensions resolve relative paths against caller cwd, leaving install_path unmodified
    const stagedFoundry = path.join(sb.root, 'staged-foundry');
    fs.cpSync(path.join(WORKTREE_ROOT, 'extensions', 'foundry'), stagedFoundry, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.endsWith('opl-release.lock.json'),
    });
    await rpc.call('pack.link', { dir: stagedFoundry });

    const userCwd = path.join(sb.root, 'user-cwd');
    fs.mkdirSync(userCwd, { recursive: true });
    const runAtCwd = (args: readonly string[], cwd: string) =>
      new Promise<{ code: number; stdout: string; stderr: string; json: unknown }>((resolve, reject) => {
        const child = spawn(V2_OPL_BIN, [...args], {
          cwd,
          env: sb.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
        child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
        child.on('error', reject);
        child.on('close', (code) => {
          let json: unknown = null;
          try { json = JSON.parse(stdout.trim()); } catch { json = null; }
          resolve({ code: code ?? 1, stdout, stderr, json });
        });
      });

    const relInit = await runAtCwd(['foundry', 'init', './rel-agent', '--id', 'rel-agent', '--json'], userCwd);
    assert.equal(relInit.code, 0, relInit.stderr);
    assert.equal(fs.existsSync(path.join(userCwd, 'rel-agent', 'opl-package.json')), true);
    assert.equal(fs.existsSync(path.join(stagedFoundry, 'rel-agent')), false);

    const relVal = await runAtCwd(['foundry', 'validate', '.', '--json'], path.join(userCwd, 'rel-agent'));
    assert.equal(relVal.code, 0, relVal.stderr);
    assert.equal((relVal.json as { package_id: string }).package_id, 'rel-agent');

    await rpc.call('pack.unlink', { package_id: 'opl-foundry' });
    await rpc.close();
  });

  it('flushes >128KB piped --json stdout without mid-JSON truncation under reader backpressure', async () => {
    const sb = trackSandbox();
    const bigPkgDir = writeMinimalV2Package(path.join(sb.root, 'big-json-pkg'), {
      id: 'big-json-pkg',
      intent: 'agent',
    });
    const filesDir = path.join(bigPkgDir, 'files');
    fs.mkdirSync(filesDir, { recursive: true });
    for (let i = 0; i < 3500; i += 1) {
      fs.writeFileSync(
        path.join(filesDir, `item-${String(i).padStart(4, '0')}-payload-padding-entry.txt`),
        `${i}\n`,
        'utf8',
      );
    }

    const res = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(path.join(WORKTREE_ROOT, 'bin', 'opl'), ['pack', 'build', bigPkgDir, '--no-write-lock', '--json'], {
        cwd: WORKTREE_ROOT,
        env: { ...sb.env, OPL_USE_DIST: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.pause();
      const chunks: Buffer[] = [];
      let stderr = '';
      child.stdout.on('data', (c: Buffer) => chunks.push(c));
      child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });
      setTimeout(() => child.stdout.resume(), 50);
      child.on('error', reject);
      child.on('close', (code) => {
        resolve({ code, stdout: Buffer.concat(chunks).toString('utf8'), stderr });
      });
    });

    assert.equal(res.code, 0, res.stderr);
    assert.ok(Buffer.byteLength(res.stdout, 'utf8') > 128 * 1024, `Expected >128KB JSON, got ${res.stdout.length}`);
    const parsed = JSON.parse(res.stdout) as { lock: { file_count: number; paths: string[] } };
    assert.ok(parsed.lock.file_count >= 3500);
    assert.ok(parsed.lock.paths.length >= 3500);
  });
});
