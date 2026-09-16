import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { fileIdentity, readPreparedContext } from '../../src/adapters/execution/runtime-environment-execution.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const launcher = path.join(repoRoot, 'bin/opl');
const target = { domainId: 'mas', profileId: 'display', platformId: 'test-local' };

function fixture(t: { after: (callback: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-environment-execution-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contextPath = path.join(root, 'build/dependency_run_context.json');
  const context = {
    status: 'prepared', domain_id: target.domainId, profile_id: target.profileId,
    platform_id: target.platformId, environment_id: 'test-environment-v1',
    environment_manifest_ref: path.join(root, 'environment.json'),
    env_vars: {}, binary_paths: {}, runtime_file_identities: {}, requirement_file_digests: {},
  } as Record<string, any>;
  function save() {
    fs.mkdirSync(path.dirname(contextPath), { recursive: true });
    fs.writeFileSync(contextPath, JSON.stringify(context));
  }
  save();
  const args = (command: string[], options: string[] = []) => [
    'env', 'run', '--domain', target.domainId, '--profile', target.profileId,
    '--platform', target.platformId, '--artifact-root', root, '--cwd', root,
    ...options, '--', ...command,
  ];
  const env = {
    PATH: process.env.PATH, NODE_NO_WARNINGS: '1', OPL_STATE_DIR: path.join(root, 'state'),
    OPL_STAGE_ATTEMPT_REF: 'test-attempt-42',
  };
  const run = (command: string[], options: string[] = []) => spawnSync(launcher, args(command, options), {
    cwd: root, env, encoding: 'utf8', timeout: 10000,
  });
  const receipts = () => fs.readdirSync(path.join(root, 'build/executions'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(root, 'build/executions', name), 'utf8')));
  return { root, context, contextPath, save, run, args, env, receipts };
}

test('bin/opl env run selects managed Python and exposes its bin directory to subprocesses', (t) => {
  const f = fixture(t);
  const managedRoot = path.join(f.root, 'managed-python');
  const bin = path.join(managedRoot, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  // A Node-backed interpreter proves executable selection without a host Python dependency.
  fs.symlinkSync(process.execPath, path.join(bin, 'python'));
  fs.symlinkSync(process.execPath, path.join(bin, 'python3'));
  f.context.managed_python_environment_path = managedRoot;
  f.context.managed_required_python_packages = ['fixture-package'];
  f.context.binary_paths.python3 = '/does-not-exist/host-python';
  f.context.env_vars = { VIRTUAL_ENV: managedRoot, PYTHONHOME: '/invalid-host-python-home' };
  f.save();
  const script = `
    const { spawnSync } = require('node:child_process');
    const nested = spawnSync('python3', ['-e', 'process.stdout.write("managed-child")'], { encoding: 'utf8' });
    process.stdout.write(JSON.stringify({ firstPath: process.env.PATH.split(require('node:path').delimiter)[0],
      venv: process.env.VIRTUAL_ENV, pythonHome: process.env.PYTHONHOME ?? null,
      nestedStatus: nested.status, nestedOutput: nested.stdout }));
  `;
  const result = f.run(['python3', '-e', script]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    firstPath: bin, venv: managedRoot, pythonHome: null,
    nestedStatus: 0, nestedOutput: 'managed-child',
  });
  assert.equal(f.receipts()[0].executable, path.join(bin, 'python'));
  assert.equal(fs.existsSync(path.join(f.root, 'state')), false, 'cache hit must not touch global discovery or preparation state');
});

test('bin/opl env run rejects a prepared context for another target before starting the command', (t) => {
  const f = fixture(t);
  f.context.domain_id = 'another-domain';
  f.save();
  const marker = path.join(f.root, 'should-not-run');
  const result = f.run([process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad')`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /target mismatch: domain_id/);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(path.join(f.root, 'build/executions')), false);
});

test('prepared cache invalidates on dependency content, runtime identity, or selected requirement changes', (t) => {
  const f = fixture(t);
  const requirement = path.join(f.root, 'requirements.json');
  const runtime = path.join(f.root, 'runtime');
  fs.writeFileSync(requirement, '{"dependencies":["v1"]}');
  fs.writeFileSync(runtime, 'runtime-v1');
  f.context.requirement_profile_identity = { requirement_profile_ref: requirement };
  f.context.selected_requirement_profile_ids = ['python-report'];
  f.context.requirement_file_digests[requirement] = crypto.createHash('sha256').update(fs.readFileSync(requirement)).digest('hex');
  f.context.runtime_file_identities[runtime] = fileIdentity(runtime);
  f.save();
  const selected = { ...target, requirementProfilePath: requirement, requirementProfileId: 'python-report' };
  assert.ok(readPreparedContext(f.contextPath, selected));
  assert.equal(readPreparedContext(f.contextPath, { ...selected, requirementProfileId: 'different-profile' }), null);
  assert.equal(readPreparedContext(f.contextPath, { ...selected, requirementProfilePath: path.join(f.root, 'other.json') }), null);
  f.context.selected_requirement_profile_ids = ['python-report', 'another-profile'];
  f.save();
  assert.equal(readPreparedContext(f.contextPath, selected), null, 'an explicitly selected profile must not reuse a combined profile context');
  f.context.selected_requirement_profile_ids = ['python-report'];
  f.save();
  // Equal-size edits ensure that dependency validation reads content, not only file size.
  fs.writeFileSync(requirement, '{"dependencies":["v2"]}');
  assert.equal(readPreparedContext(f.contextPath, selected), null);
  fs.writeFileSync(requirement, '{"dependencies":["v1"]}');
  assert.ok(readPreparedContext(f.contextPath, selected));
  fs.writeFileSync(runtime, 'runtime-replaced-v2');
  assert.equal(readPreparedContext(f.contextPath, selected), null);
  fs.rmSync(runtime);
  assert.equal(readPreparedContext(f.contextPath, selected), null);
});

test('bin/opl env run returns actual exit codes and appends records without exposing credential arguments', (t) => {
  const f = fixture(t);
  const success = f.run([process.execPath, '-e', 'process.stdout.write("ok")']);
  assert.equal(success.status, 0, success.stderr);
  const failure = f.run([process.execPath, '-e', 'process.exit(23)', '--', '--token', 'private-value', '--password=another-private-value']);
  assert.equal(failure.status, 23, failure.stderr);
  const records = f.receipts();
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((r) => r.execution_id)).size, 2);
  const failed = records.find((r) => r.exit_code === 23);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.environment_id, 'test-environment-v1');
  assert.equal(failed.environment_ref, f.context.environment_manifest_ref);
  assert.equal(failed.stage_attempt_ref, 'test-attempt-42');
  assert.equal(failed.cwd, f.root);
  assert.equal(failed.executable, process.execPath);
  assert.ok(Date.parse(failed.finished_at) >= Date.parse(failed.started_at));
  assert.ok(failed.elapsed_ms >= 0);
  assert.equal(JSON.stringify(records).includes('private-value'), false);
  assert.deepEqual(failed.command.slice(-3), ['--token', '[redacted]', '--password=[redacted]']);
  assert.equal(records.find((r) => r.exit_code === 0).status, 'completed');
});

test('automatic reprepare preserves the selected profile and missing dependencies prevent execution', (t) => {
  const f = fixture(t);
  fs.rmSync(f.contextPath);
  const profile = path.join(f.root, 'requirements.json');
  const profiles = [
    { profile_id: 'selected', runtime_binaries: [] as Array<{ name: string; required: boolean }>, language_packages: { python: [], r: [] } },
    { profile_id: 'unused', runtime_binaries: [{ name: 'opl-test-unavailable-binary', required: true }] },
  ];
  fs.writeFileSync(profile, JSON.stringify({ profiles }));
  const first = f.run([process.execPath, '-e', 'process.stdout.write("first")'], [
    '--requirement-profile', profile, '--requirement-profile-id', 'selected',
  ]);
  assert.equal(first.status, 0, first.stderr);
  fs.appendFileSync(profile, '\n');
  const refreshed = f.run([process.execPath, '-e', 'process.stdout.write("refreshed")']);
  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.equal(JSON.parse(fs.readFileSync(f.contextPath, 'utf8')).requested_requirement_profile_id, 'selected');
  const marker = path.join(f.root, 'should-not-run');
  profiles[0].runtime_binaries.push({ name: 'opl-test-unavailable-binary', required: true });
  fs.writeFileSync(profile, JSON.stringify({ profiles }));
  const missing = f.run([process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad')`]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Environment preparation failed/);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(f.contextPath), false);
  assert.equal(f.receipts().length, 2);
});

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function until(predicate: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  return predicate();
}

for (const signal of ['timeout', 'SIGTERM'] as const) {
  test(`bin/opl env run ${signal} cancels the whole subprocess group and records its cause`, { skip: process.platform === 'win32' }, async (t) => {
    const f = fixture(t);
    const pidFile = path.join(f.root, 'grandchild.pid');
    const worker = path.join(f.root, 'worker.cjs');
    const script = path.join(f.root, 'parent.cjs');
    fs.writeFileSync(worker, `
      process.on('SIGTERM', () => {});
      require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      setInterval(() => {}, 1000);
    `);
    fs.writeFileSync(script, `
      require('node:child_process').spawn(process.execPath, [${JSON.stringify(worker)}], { stdio: 'ignore' });
      setInterval(() => {}, 1000);
    `);
    const child = spawn(launcher, f.args([process.execPath, script], signal === 'timeout' ? ['--timeout-ms', '1000'] : []), {
      cwd: f.root, env: f.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let grandchildPid: number | undefined;
    child.stderr.on('data', (data) => { stderr += data; });
    const closed = new Promise<number | null>((resolve) => child.once('close', (code) => resolve(code)));
    t.after(() => {
      child.kill('SIGKILL');
      if (grandchildPid) {
        try { process.kill(grandchildPid, 'SIGKILL'); } catch { /* Already stopped. */ }
      }
    });
    assert.ok(await until(() => fs.existsSync(pidFile)), `worker did not start: ${stderr}`);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    grandchildPid = pid;
    if (signal === 'SIGTERM') child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
    const code = await closed;
    clearTimeout(timer);
    assert.equal(code, signal === 'timeout' ? 124 : 143, stderr);
    assert.ok(await until(() => !alive(pid), 3500), `grandchild ${pid} survived cancellation`);
    const receipt = f.receipts()[0];
    assert.equal(receipt.exit_code, code);
    assert.equal(receipt.stop_reason, signal);
    assert.equal(receipt.status, 'failed');
  });
}
