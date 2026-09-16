import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const launcher = path.join(repoRoot, 'bin/opl');

async function until(predicate: () => boolean, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  return predicate();
}

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function fixture(t: { after: (callback: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-preparation-test-'));
  const bin = path.join(root, 'bin');
  const mode = path.join(root, 'mode');
  const eventsFile = path.join(root, 'events.jsonl');
  const workerPid = path.join(root, 'worker.pid');
  const business = path.join(root, 'business.json');
  const profile = path.join(root, 'requirements.json');
  fs.mkdirSync(bin);
  fs.writeFileSync(mode, 'normal');
  const shebang = `#!${process.execPath}\n`;
  // Fake only the package manager/interpreter boundary; preparation and process
  // management still run through the real CLI with an isolated state directory.
  const pythonSource = shebang + `
const fs = require('node:fs'), path = require('node:path');
const code = process.argv[process.argv.indexOf('-c') + 1] || '';
fs.appendFileSync(${JSON.stringify(eventsFile)}, JSON.stringify({kind:'probe',pid:process.pid})+'\\n');
const marker = path.join(path.dirname(process.argv[1]), '..', 'packages.json');
const names = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker,'utf8')) : [];
if (code.includes('json.dumps')) process.stdout.write(JSON.stringify({python:'fixture-python',packages:names.map(n=>[n,'1.0'])}));
else process.stdout.write(names.join('\\n'));
`;
  fs.writeFileSync(path.join(bin, 'python3'), pythonSource, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'uv'), shebang + `
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'venv') {
  fs.mkdirSync(path.join(args[1], 'bin'), {recursive:true});
  fs.copyFileSync(${JSON.stringify(path.join(bin, 'python3'))}, path.join(args[1], 'bin', 'python'));
  fs.chmodSync(path.join(args[1], 'bin', 'python'), 0o755);
  process.exit(0);
}
if (args[0] !== 'pip' || args[1] !== 'install') process.exit(2);
const behavior = fs.readFileSync(${JSON.stringify(mode)}, 'utf8');
fs.appendFileSync(${JSON.stringify(eventsFile)}, JSON.stringify({kind:'install',pid:process.pid,behavior,args})+'\\n');
if (behavior === 'fail') { process.stderr.write('fixture installer failed'); process.exit(17); }
if (behavior === 'conflict') {
  const python = args[args.indexOf('--python') + 1];
  fs.writeFileSync(path.join(path.dirname(python), '..', 'packages.json'), JSON.stringify(['collision']));
  process.stderr.write('No solution found: collision==1.0 conflicts with collision==2.0');
  process.exit(1);
}
if (behavior === 'hang') {
  const worker = require('node:child_process').spawn(process.execPath, ['-e',
    'process.on("SIGTERM",()=>{});require("node:fs").writeFileSync('+JSON.stringify(${JSON.stringify(workerPid)})+',String(process.pid));setInterval(()=>{},1000)'], {stdio:'ignore'});
  setInterval(()=>{},1000);
} else {
  const finish = () => {
    const python = args[args.indexOf('--python')+1];
    const marker = path.join(path.dirname(python),'..','packages.json');
    const previous = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker,'utf8')) : [];
    const requested = args.slice(args.indexOf('--python')+2).map(n=>n.split(/[<>=~!;]/)[0]);
    fs.writeFileSync(marker,JSON.stringify([...new Set([...previous,...requested])]));
  };
  if (behavior === 'delay') setTimeout(finish, 900); else finish();
}
`, { mode: 0o755 });
  const requirements = {
    profiles: ['a', 'b'].map((name) => ({
      profile_id: name,
      runtime_binaries: [{ name: 'python3', required: true }],
      language_packages: { python: [{ name: `fixture-${name}`, required: true }], r: [] },
    })),
  };
  fs.writeFileSync(profile, JSON.stringify(requirements));
  const env = {
    ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    OPL_STATE_DIR: path.join(root, 'state'), NODE_NO_WARNINGS: '1',
  };
  const artifact = (name = 'task-a') => path.join(root, name);
  const businessCode = `require('node:fs').writeFileSync(${JSON.stringify(business)},JSON.stringify({id:process.env.OPL_ENV_EXECUTION_ID,manifest:process.env.OPL_ENV_MANIFEST_REF}))`;
  function args(name = 'task-a', ids = ['a'], options: string[] = []) {
    return ['env', 'run', '--domain', 'mas', '--profile', 'analysis', '--platform', 'test-local',
      '--artifact-root', artifact(name), '--requirement-profile', profile,
      ...ids.flatMap((id) => ['--requirement-profile-id', id]), ...options,
      '--', process.execPath, '-e', businessCode];
  }
  function start(name = 'task-a', ids = ['a'], options: string[] = []) {
    const child = spawn(launcher, args(name, ids, options), { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (data) => { stderr += data; });
    child.stdout.on('data', (data) => { stdout += data; });
    const closed = new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve) => {
      child.once('close', (code) => resolve({ code, stderr, stdout }));
    });
    t.after(() => child.kill('SIGKILL'));
    return { child, closed };
  }
  const run = (name = 'task-a', ids = ['a'], options: string[] = []) => spawnSync(launcher, args(name, ids, options), {
    cwd: root, env, encoding: 'utf8', timeout: 15000,
  });
  const read = (name: string, file: string) => JSON.parse(fs.readFileSync(path.join(artifact(name), 'build', file), 'utf8'));
  const events = () => fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).map((s) => JSON.parse(s)) : [];
  t.after(() => {
    if (fs.existsSync(workerPid)) {
      try { process.kill(Number(fs.readFileSync(workerPid, 'utf8')), 'SIGKILL'); } catch { /* Already stopped. */ }
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, mode, business, profile, requirements, workerPid, artifact, env, args, start, run, read, events, bin, eventsFile };
}

function executions(root: string) {
  return fs.readdirSync(path.join(root, 'build/executions')).filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(root, 'build/executions', name), 'utf8')));
}

test('multiple profiles use an exact normalized set and warm runs skip every interpreter probe and install', (t) => {
  const f = fixture(t);
  const first = f.run('task-a', ['b', 'a', 'a']);
  assert.equal(first.status, 0, first.stderr);
  const combined = f.read('task-a', 'dependency_run_context.json');
  assert.deepEqual(combined.selected_requirement_profile_ids, ['a', 'b']);
  const eventsBefore = f.events();
  const second = f.run('task-a', ['a', 'b']);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(f.events(), eventsBefore, 'warm execution must not spawn package probes or installers');
  const differentTask = f.run('task-b', ['b', 'a']);
  assert.equal(differentTask.status, 0, differentTask.stderr);
  assert.equal(f.read('task-b', 'dependency_run_context.json').environment_id, combined.environment_id);
  assert.deepEqual(f.events(), eventsBefore, 'a shared environment hit must also skip probes and installation');
  const subset = f.run('task-a', ['a']);
  assert.equal(subset.status, 0, subset.stderr);
  const selected = f.read('task-a', 'dependency_run_context.json');
  assert.deepEqual(selected.selected_requirement_profile_ids, ['a']);
  assert.notEqual(selected.environment_id, combined.environment_id);
  assert.equal(f.events().filter((event) => event.kind === 'install').length, 2);
  const linked = JSON.parse(fs.readFileSync(f.business, 'utf8'));
  const record = executions(f.artifact()).find((entry) => entry.execution_id === linked.id);
  assert.ok(record, 'child receives the exact ID used by its execution record');
  assert.equal(linked.manifest, record.environment_ref);
  assert.ok(fs.existsSync(linked.manifest));
  for (const key of ['context_check', 'lock_wait', 'prepare', 'command', 'total']) {
    assert.equal(typeof record.timings_ms[key], 'number', `missing timing ${key}`);
    assert.ok(record.timings_ms[key] >= 0);
  }
  assert.ok(record.timings_ms.total >= record.timings_ms.command);
  assert.equal(typeof record.cache_outcome, 'string');
});

test('conflicting package sources are rejected before preparation or business execution', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.profile, JSON.stringify({ profiles: [
    { profile_id: 'a', language_packages: { r: [{ name: 'collision', source: { type: 'github', repo: 'owner/one' } }] } },
    { profile_id: 'b', language_packages: { r: [{ name: 'collision', source: { type: 'github', repo: 'owner/two' } }] } },
  ] }));
  const result = f.run('task-a', ['a', 'b']);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /conflict/i);
  assert.equal(fs.existsSync(f.business), false);
  assert.deepEqual(f.events(), []);
});

test('concurrent first preparation installs once and waiting callers reuse the published environment', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.mode, 'delay');
  const first = f.start('task-a');
  assert.ok(await until(() => f.events().some((event) => event.kind === 'install')));
  const second = f.start('task-b');
  const results = await Promise.all([first.closed, second.closed]);
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(f.events().filter((event) => event.kind === 'install').length, 1);
  assert.equal(f.read('task-a', 'dependency_run_context.json').environment_id, f.read('task-b', 'dependency_run_context.json').environment_id);
  const receipt = executions(f.artifact('task-b'))[0];
  assert.ok(receipt.timings_ms.lock_wait > 0, 'waiting is measured instead of hidden in command time');
});

test('failed installation never starts the business command and a later attempt recovers', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.mode, 'fail');
  const failure = f.run();
  assert.equal(failure.status, 1, failure.stderr);
  assert.equal(fs.existsSync(f.business), false);
  assert.equal(fs.existsSync(path.join(f.artifact(), 'build/dependency_run_context.json')), false);
  const receipt = f.read('task-a', 'dependency_environment_receipt.json');
  assert.notEqual(receipt.status, 'prepared');
  assert.equal(receipt.failure_phase, 'dependency_installation');
  assert.match(JSON.stringify(receipt), /fixture installer failed/);
  fs.writeFileSync(f.mode, 'normal');
  const retry = f.run();
  assert.equal(retry.status, 0, retry.stderr);
  assert.ok(fs.existsSync(f.business));
  assert.equal(f.events().filter((event) => event.kind === 'install').length, 2);
});

for (const reason of ['timeout', 'SIGTERM'] as const) {
  test(`preparation ${reason} kills installer descendants, releases the lock and permits retry`, { skip: process.platform === 'win32' }, async (t) => {
    const f = fixture(t);
    fs.writeFileSync(f.mode, 'hang');
    const first = f.start('task-a', ['a'], reason === 'timeout' ? ['--prepare-timeout-ms', '1500'] : []);
    assert.ok(await until(() => fs.existsSync(f.workerPid)), 'installer descendant must start');
    const pid = Number(fs.readFileSync(f.workerPid, 'utf8'));
    if (reason === 'SIGTERM') first.child.kill('SIGTERM');
    const timer = setTimeout(() => first.child.kill('SIGKILL'), 8000);
    const stopped = await first.closed;
    clearTimeout(timer);
    assert.equal(stopped.code, reason === 'timeout' ? 124 : 143, stopped.stderr);
    assert.ok(await until(() => !alive(pid), 3500), `installer descendant ${pid} survived`);
    assert.equal(fs.existsSync(f.business), false);
    const receipt = f.read('task-a', 'dependency_environment_receipt.json');
    assert.notEqual(receipt.status, 'prepared');
    fs.writeFileSync(f.mode, 'normal');
    const retry = f.run('task-a', ['a'], ['--prepare-timeout-ms', '3000']);
    assert.equal(retry.status, 0, retry.stderr);
    assert.ok(fs.existsSync(f.business));
  });
}

test('preparation timeout includes lock wait without terminating the lock owner', { skip: process.platform === 'win32' }, async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.mode, 'hang');
  const owner = f.start();
  assert.ok(await until(() => fs.existsSync(f.workerPid)));
  const waiter = f.start('task-b', ['a'], ['--prepare-timeout-ms', '250']);
  const waitingResult = await waiter.closed;
  assert.equal(waitingResult.code, 124, waitingResult.stderr);
  assert.ok(alive(owner.child.pid!), 'a cancelled waiter must not kill the active installer');
  assert.equal(f.read('task-b', 'dependency_environment_receipt.json').failure_phase, 'lock_wait');
  assert.equal(f.events().filter((event) => event.kind === 'install').length, 1);
  assert.equal(fs.existsSync(f.business), false);
  owner.child.kill('SIGTERM');
  const ownerResult = await owner.closed;
  assert.equal(ownerResult.code, 143, ownerResult.stderr);
  fs.writeFileSync(f.mode, 'normal');
  const retry = f.run('task-b');
  assert.equal(retry.status, 0, retry.stderr);
});

test('invalid preparation deadlines fail before starting preparation', (t) => {
  const f = fixture(t);
  for (const deadline of ['0', '-1', 'NaN']) {
    const result = f.run('task-a', ['a'], [`--prepare-timeout-ms=${deadline}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /prepare-timeout-ms.*positive/i);
  }
  assert.deepEqual(f.events(), []);
  assert.equal(fs.existsSync(f.business), false);
});


test('explicit prepare accepts repeated profiles and leaves business execution to a later run', (t) => {
  const f = fixture(t);
  const args = f.args('task-a', ['b', 'a']);
  args[1] = 'prepare';
  const prepared = spawnSync(launcher, [...args.slice(0, args.indexOf('--')), '--apply', '--json'], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(fs.existsSync(f.business), false);
  assert.deepEqual(f.read('task-a', 'dependency_run_context.json').selected_requirement_profile_ids, ['a', 'b']);
  const eventsBefore = f.events();
  const run = f.run('task-a', ['a', 'b']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(f.events(), eventsBefore);
});

test('the execution deadline starts after successful slow preparation', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.mode, 'delay');
  const result = f.run('task-a', ['a'], ['--timeout-ms', '500', '--prepare-timeout-ms', '5000']);
  assert.equal(result.status, 0, result.stderr);
  const record = executions(f.artifact())[0];
  assert.ok(record.timings_ms.prepare >= 900, 'fixture installation exceeds the separate execution budget');
  assert.ok(fs.existsSync(f.business));
});


for (const constraint of ['minimum_version', 'required_exports'] as const) {
  test(`R ${constraint} is checked at preparation and an unsatisfied package cannot run the business command`, (t) => {
    const f = fixture(t);
    const requirement = constraint === 'minimum_version'
      ? { minimum_version: '1.2.0' } : { required_exports: ['fixture_export'] };
    fs.writeFileSync(f.profile, JSON.stringify({ profiles: [{
      profile_id: 'a', runtime_binaries: [{ name: 'Rscript', required: true }],
      language_packages: { r: [{ name: 'fixtureR', ...requirement }] },
    }] }));
    // Existing package names alone are insufficient: fake R can reject the
    // version/export predicate even after an installer reports success.
    fs.writeFileSync(path.join(f.bin, 'Rscript'), `#!${process.execPath}\n
const fs = require('node:fs');
const expression = process.argv[process.argv.indexOf('-e') + 1] || '';
fs.appendFileSync(${JSON.stringify(f.eventsFile)}, JSON.stringify({kind:'r',expression})+'\\n');
const mode = fs.readFileSync(${JSON.stringify(f.mode)}, 'utf8');
const lib = expression.match(/lib\\.loc\\s*=\\s*"([^"]+)"/) || expression.match(/dir\\.exists\\("([^"]+)"\\)/);
if (expression.includes('priority =')) { process.stdout.write('grid\\n'); process.exit(0); }
if (expression.includes('installed.packages')) {
  if (lib) fs.mkdirSync(lib[1],{recursive:true});
  process.stdout.write('fixtureR\\n'); process.exit(0);
}
if (expression.includes('requireNamespace') && mode === 'unsatisfied' && expression.includes(${JSON.stringify(constraint === 'minimum_version' ? 'packageVersion' : 'getNamespaceExports')})) {
  process.stdout.write('fixtureR\\n');
}
`, { mode: 0o755 });
    fs.writeFileSync(f.mode, 'unsatisfied');
    const invalid = f.run();
    assert.equal(invalid.status, 1, invalid.stderr);
    assert.equal(fs.existsSync(f.business), false);
    const receipt = f.read('task-a', 'dependency_environment_receipt.json');
    assert.equal(receipt.failure_phase, 'dependency_validation');
    assert.equal(fs.existsSync(path.join(f.artifact(), 'build/dependency_run_context.json')), false);
    fs.writeFileSync(f.mode, 'normal');
    const valid = f.run();
    assert.equal(valid.status, 0, valid.stderr);
    const events = f.events();
    const warm = f.run();
    assert.equal(warm.status, 0, warm.stderr);
    assert.deepEqual(f.events(), events, 'validated R environment must not recheck versions or exports on warm run');
  });
}

test('uv receives conflicting Python constraints and solver failure cannot publish an environment even if the package exists', (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.profile, JSON.stringify({ profiles: ['1.0', '2.0'].map((version, index) => ({
    profile_id: index === 0 ? 'a' : 'b',
    language_packages: { python: [{ name: 'collision', version }] },
  })) }));
  fs.writeFileSync(f.mode, 'conflict');
  const failure = f.run('task-a', ['a', 'b']);
  assert.equal(failure.status, 1, failure.stderr);
  const installation = f.events().find((event) => event.kind === 'install');
  assert.ok(installation.args.includes('collision==1.0'));
  assert.ok(installation.args.includes('collision==2.0'));
  assert.equal(fs.existsSync(f.business), false);
  assert.equal(fs.existsSync(path.join(f.artifact(), 'build/dependency_run_context.json')), false);
  assert.equal(f.read('task-a', 'dependency_environment_receipt.json').failure_phase, 'dependency_installation');
});

test('child --help is passed through and child result binds to its exact execution receipt', (t) => {
  const f = fixture(t);
  const args = f.args();
  const separator = args.indexOf('--');
  const result = spawnSync(launcher, [...args.slice(0, separator + 1), process.execPath, '-e',
    'process.stdout.write(JSON.stringify({args:process.argv.slice(1),id:process.env.OPL_ENV_EXECUTION_ID,manifest:process.env.OPL_ENV_MANIFEST_REF}))',
    '--', '--help'], { cwd: f.root, env: f.env, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  const child = JSON.parse(result.stdout);
  assert.deepEqual(child.args, ['--help']);
  const record = executions(f.artifact())[0];
  assert.equal(child.id, record.execution_id);
  assert.equal(child.manifest, record.environment_ref);
  assert.ok(fs.existsSync(child.manifest));
});
