import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';
import { registerFoundryCli } from '../src/cli.mjs';
import { computeReleaseLock } from '../src/canonical.mjs';
import { comparePackages, evaluatePackage, verifyFoundryEventChain } from '../src/eval.mjs';
import { loadActivationPointer, loadRunRecord, promotePackage, rollbackPackage } from '../src/registry.mjs';
import { validatePackage } from '../src/validate.mjs';
import { buildPackage } from '../../../packages/pack/dist/index.js';

const tempDirs = [];

function makeTempDir(prefix = 'opl-foundry-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('OPL Foundry extension (zero external deps, pure Node ESM)', () => {
  it('exposes exact dynamic cli_extensions descriptor and per-subcommand --help', () => {
    const ext = registerFoundryCli();
    assert.equal(ext.namespace, 'foundry');
    assert.deepEqual(ext.commands, ['init', 'validate', 'eval', 'compare', 'promote', 'rollback']);
    for (const cmd of ext.commands) {
      assert.equal(typeof ext.handlers[cmd], 'function');
      const help = ext.handlers[cmd]([], { help: true });
      assert.equal(help.ok, true);
      assert.match(help.help, new RegExp(`Usage: opl foundry ${cmd}`));
    }
  });

  it('runs init -> validate -> eval -> compare -> promote -> rollback lifecycle without mutating target package dir', () => {
    const root = makeTempDir();
    const stateDir = path.join(root, 'state');
    const baselineDir = path.join(root, 'agent-v1');
    const candidateDir = path.join(root, 'agent-v2');
    const ext = registerFoundryCli();

    // 1. init & validate
    const initRes = ext.handlers.init([baselineDir], { id: 'demo-agent', 'pkg-version': '1.0.0' });
    assert.equal(initRes.ok, true);
    assert.equal(initRes.package_id, 'demo-agent');

    const valRes = ext.handlers.validate([baselineDir], {});
    assert.equal(valRes.ok, true);
    assert.equal(valRes.exit_code, 0);

    // Deterministic content lock before eval/promote
    const lockBefore = computeReleaseLock(baselineDir);

    // 2. eval writes only to stateDir, leaving target dir untouched
    const evalRes = ext.handlers.eval([baselineDir], { 'state-dir': stateDir });
    assert.equal(evalRes.ok, true);
    assert.equal(evalRes.qualified, true);
    assert.equal(evalRes.risk_tier, 'high');
    assert.equal(evalRes.owner_gate_policy.active_owner_required, true);

    const lockAfter = computeReleaseLock(baselineDir);
    assert.equal(lockAfter.digest, lockBefore.digest);

    const runRec = loadRunRecord(evalRes.run_id, stateDir);
    assert.ok(runRec);
    assert.equal(verifyFoundryEventChain(runRec.events), true);

    // 3. promote enforces owner gate and CAS revision
    const deniedPromote = ext.handlers.promote(['demo-agent'], {
      'run-id': evalRes.run_id,
      'expected-revision': '0',
      'state-dir': stateDir,
    });
    assert.equal(deniedPromote.ok, false);
    assert.equal(deniedPromote.exit_code, 2);
    assert.equal(deniedPromote.error.code, 'OWNER_GATE_REQUIRED');

    const badCasPromote = ext.handlers.promote(['demo-agent'], {
      'run-id': evalRes.run_id,
      'expected-revision': '99',
      'authority-receipt-ref': 'receipt-owner-1',
      'state-dir': stateDir,
    });
    assert.equal(badCasPromote.ok, false);
    assert.equal(badCasPromote.error.code, 'REVISION_CONFLICT');

    const okPromote1 = ext.handlers.promote(['demo-agent'], {
      'run-id': evalRes.run_id,
      'expected-revision': '0',
      'authority-receipt-ref': 'receipt-owner-1',
      'state-dir': stateDir,
    });
    assert.equal(okPromote1.ok, true);
    assert.equal(okPromote1.revision, 1);

    // 4. compare & promote candidate v2 -> rollback to v1
    ext.handlers.init([candidateDir], { id: 'demo-agent', 'pkg-version': '1.1.0' });
    const cmpOk = ext.handlers.compare([], { baseline: baselineDir, candidate: candidateDir, 'state-dir': stateDir });
    assert.equal(cmpOk.ok, true);
    assert.equal(cmpOk.regressed, false);

    const evalV2 = ext.handlers.eval([candidateDir], { 'state-dir': stateDir });
    assert.equal(evalV2.ok, true);
    const okPromote2 = ext.handlers.promote(['demo-agent'], {
      'run-id': evalV2.run_id,
      'expected-revision': '1',
      'authority-receipt-ref': 'receipt-owner-2',
      'state-dir': stateDir,
    });
    assert.equal(okPromote2.ok, true);
    assert.equal(okPromote2.revision, 2);

    const rbMissingReceipt = ext.handlers.rollback(['demo-agent'], {
      'to-version': '1.0.0',
      'expected-revision': '2',
      'state-dir': stateDir,
    });
    assert.equal(rbMissingReceipt.ok, false);
    assert.equal(rbMissingReceipt.error.code, 'OWNER_GATE_REQUIRED');

    const rbOk = ext.handlers.rollback(['demo-agent'], {
      'to-version': '1.0.0',
      'expected-revision': '2',
      'authority-receipt-ref': 'receipt-owner-3',
      reason: 'canary rollback',
      'state-dir': stateDir,
    });
    assert.equal(rbOk.ok, true);
    assert.equal(rbOk.revision, 3);
    assert.equal(rbOk.restored_version, '1.0.0');

    const ptr = loadActivationPointer('demo-agent', stateDir);
    assert.equal(ptr.active_version, '1.0.0');
    assert.equal(ptr.revision, 3);
  });

  it('rejects non-weakening evaluation policy violations, forbidden plugins mirror, and lock mismatches', () => {
    const root = makeTempDir();
    const stateDir = path.join(root, 'state');
    const baseDir = path.join(root, 'base');
    const weakDir = path.join(root, 'weak');
    const ext = registerFoundryCli();

    ext.handlers.init([baseDir], { id: 'policy-agent' });
    ext.handlers.init([weakDir], { id: 'policy-agent' });

    const suitePath = path.join(weakDir, 'eval', 'suite.json');
    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
    suite.gates[0].threshold = 0.2; // relaxed gate threshold
    suite.public_cases.pop(); // removed public case
    fs.writeFileSync(suitePath, JSON.stringify(suite, null, 2), 'utf8');

    const cmpFail = ext.handlers.compare([], { baseline: baseDir, candidate: weakDir, 'state-dir': stateDir });
    assert.equal(cmpFail.ok, false);
    assert.equal(cmpFail.exit_code, 2);
    assert.ok(cmpFail.policy_violations.includes('gate_threshold_weakened:min-score'));
    assert.ok(cmpFail.policy_violations.includes('public_case_removed:stage-graph-declared'));

    // Forbidden plugins/<name>/ mirror dir fails validation
    fs.mkdirSync(path.join(baseDir, 'plugins', 'policy-agent'), { recursive: true });
    const valMirror = ext.handlers.validate([baseDir], {});
    assert.equal(valMirror.ok, false);
    assert.equal(valMirror.exit_code, 2);
    assert.ok(valMirror.errors.some((e) => e.code === 'FORBIDDEN_PLUGINS_MIRROR'));
  });

  it('executes standalone in an isolated temp copy without node_modules', () => {
    const root = makeTempDir();
    const foundryRoot = path.resolve(import.meta.dirname, '..');
    const copiedFoundry = path.join(root, 'isolated-foundry');
    fs.cpSync(foundryRoot, copiedFoundry, {
      recursive: true,
      filter: (src) => !src.includes('node_modules') && !src.endsWith('opl-release.lock.json'),
    });

    const targetDir = path.join(root, 'standalone-pkg');
    const cliUrl = pathToFileURL(path.join(copiedFoundry, 'src', 'cli.mjs')).href;
    const script = `
      import { registerFoundryCli } from ${JSON.stringify(cliUrl)};
      const ext = registerFoundryCli();
      const init = ext.handlers.init([${JSON.stringify(targetDir)}], { id: "standalone-pkg" });
      const val = ext.handlers.validate([${JSON.stringify(targetDir)}], {});
      process.stdout.write(JSON.stringify({ initOk: init.ok, valOk: val.ok }));
    `;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.initOk, true);
    assert.equal(out.valOk, true);
  });

  it('aligns computeReleaseLock and validatePackage with @opl/pack buildPackage and rejects tampered lock', () => {
    const root = makeTempDir();
    const pkgDir = path.join(root, 'built-agent');
    const ext = registerFoundryCli();
    assert.equal(ext.handlers.init([pkgDir], { id: 'built-agent', 'pkg-version': '1.0.0' }).ok, true);

    const buildRes = buildPackage(pkgDir, { writeLock: true });
    assert.match(buildRes.digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(buildRes.lock.paths.includes('opl-package.json'), true);

    const lockComputed = computeReleaseLock(pkgDir);
    assert.equal(lockComputed.digest, buildRes.digest);
    assert.deepEqual(lockComputed.paths, buildRes.lock.paths);

    const validRes = validatePackage(pkgDir);
    assert.equal(validRes.ok, true, JSON.stringify(validRes.errors));
    assert.equal(validRes.checks.includes('release_lock_verified'), true);

    // Tamper README.md -> RELEASE_LOCK_MISMATCH (exit_code 2)
    fs.appendFileSync(path.join(pkgDir, 'README.md'), '\ntampered\n', 'utf8');
    const tamperedRes = validatePackage(pkgDir);
    assert.equal(tamperedRes.ok, false);
    assert.equal(tamperedRes.exit_code, 2);
    assert.equal(tamperedRes.errors.some((e) => e.code === 'RELEASE_LOCK_MISMATCH'), true);
  });

  it('resolves relative paths against caller_cwd instead of install_path/process.cwd', () => {
    const root = makeTempDir();
    const installDir = path.join(root, 'fake-install');
    const callerDir = path.join(root, 'caller-ws');
    fs.mkdirSync(installDir, { recursive: true });
    fs.mkdirSync(callerDir, { recursive: true });

    const ext = registerFoundryCli({ caller_cwd: callerDir });
    const initRes = ext.handlers.init(['./rel-agent'], { id: 'rel-agent' });
    assert.equal(initRes.ok, true);
    assert.equal(fs.existsSync(path.join(callerDir, 'rel-agent', 'opl-package.json')), true);
    assert.equal(fs.existsSync(path.join(installDir, 'rel-agent')), false);

    const valExt = registerFoundryCli({ caller_cwd: path.join(callerDir, 'rel-agent') });
    const valRes = valExt.handlers.validate(['.'], {});
    assert.equal(valRes.ok, true);
    assert.equal(valRes.package_id, 'rel-agent');
  });

  it('rejects whole-tree symlinks (symlinked opl-package.json and unreferenced symlinks without lock)', () => {
    const root = makeTempDir();
    const outsideFile = path.join(root, 'outside.txt');
    fs.writeFileSync(outsideFile, 'secret\n', 'utf8');

    // 1. Unreferenced symlink inside skills/ without opl-release.lock.json
    const unrefPkg = path.join(root, 'unref-sym-pkg');
    const ext = registerFoundryCli();
    assert.equal(ext.handlers.init([unrefPkg], { id: 'unref-sym-pkg' }).ok, true);
    fs.symlinkSync(outsideFile, path.join(unrefPkg, 'skills', 'unref-sym-pkg', 'leak.txt'));
    const unrefVal = validatePackage(unrefPkg);
    assert.equal(unrefVal.ok, false);
    assert.equal(unrefVal.exit_code, 2);
    assert.equal(unrefVal.errors.some((e) => e.code === 'SYMLINK_FORBIDDEN'), true);

    // 2. Symlinked opl-package.json
    const manifestSymPkg = path.join(root, 'sym-manifest-pkg');
    assert.equal(ext.handlers.init([manifestSymPkg], { id: 'sym-manifest-pkg' }).ok, true);
    const realManifest = path.join(root, 'external-manifest.json');
    fs.renameSync(path.join(manifestSymPkg, 'opl-package.json'), realManifest);
    fs.symlinkSync(realManifest, path.join(manifestSymPkg, 'opl-package.json'));
    const manifestSymVal = validatePackage(manifestSymPkg);
    assert.equal(manifestSymVal.ok, false);
    assert.equal(manifestSymVal.exit_code, 2);
    assert.equal(manifestSymVal.errors.some((e) => e.code === 'SYMLINK_FORBIDDEN'), true);
  });

  it('enforces --regression-tolerance non-weakening, file_exists confinement, and safe ID containment', () => {
    const root = makeTempDir();
    const stateDir = path.join(root, 'state');
    const basePkg = path.join(root, 'base-pkg');
    const candPkg = path.join(root, 'cand-pkg');
    const ext = registerFoundryCli();

    assert.equal(ext.handlers.init([basePkg], { id: 'guard-agent', 'pkg-version': '1.0.0' }).ok, true);
    assert.equal(ext.handlers.init([candPkg], { id: 'guard-agent', 'pkg-version': '1.1.0' }).ok, true);

    // Weakening --regression-tolerance above baseline limit (0.05) fails closed
    const weakTolCmp = comparePackages({
      baseline: basePkg,
      candidate: candPkg,
      regressionTolerance: '0.99',
      stateDir,
    });
    assert.equal(weakTolCmp.ok, false);
    assert.equal(weakTolCmp.exit_code, 2);
    assert.equal(weakTolCmp.error.code, 'POLICY_WEAKENING');

    // file_exists with escaping path fails case safely instead of probing host files
    const secretProbe = path.join(root, 'host-secret.txt');
    fs.writeFileSync(secretProbe, 'top-secret\n', 'utf8');
    const escapePkg = path.join(root, 'escape-eval-pkg');
    assert.equal(ext.handlers.init([escapePkg], { id: 'escape-agent' }).ok, true);
    const suitePath = path.join(escapePkg, 'eval', 'suite.json');
    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
    suite.public_cases.push({
      case_id: 'probe-outside',
      kind: 'file_exists',
      path: '../host-secret.txt',
      weight: 1.0,
    });
    fs.writeFileSync(suitePath, JSON.stringify(suite, null, 2), 'utf8');
    const escapeEval = evaluatePackage({ dir: escapePkg, stateDir });
    assert.equal(escapeEval.ok, false);
    assert.equal(escapeEval.qualified, false);

    // Path traversal via run_id and target_agent_id fails closed with INVALID_ID
    const travEvalRun = evaluatePackage({ dir: basePkg, runId: '../../escaped-run', stateDir });
    assert.equal(travEvalRun.ok, false);
    assert.equal(travEvalRun.exit_code, 2);
    assert.equal(travEvalRun.error.code, 'INVALID_ID');
    assert.equal(fs.existsSync(path.join(root, 'escaped-run.json')), false);

    const travEvalTarget = evaluatePackage({ dir: basePkg, targetAgentId: '../../escaped-agent', stateDir });
    assert.equal(travEvalTarget.ok, false);
    assert.equal(travEvalTarget.exit_code, 2);
    assert.equal(travEvalTarget.error.code, 'INVALID_ID');

    const travPromote = promotePackage({
      targetAgentId: '../../escaped',
      runId: 'valid-run-1',
      authorityReceiptRef: 'rcpt-1',
      stateDir,
    });
    assert.equal(travPromote.ok, false);
    assert.equal(travPromote.exit_code, 2);
    assert.equal(travPromote.error.code, 'INVALID_ID');

    const travRollback = rollbackPackage({
      targetAgentId: '../../escaped',
      authorityReceiptRef: 'rcpt-1',
      stateDir,
    });
    assert.equal(travRollback.ok, false);
    assert.equal(travRollback.exit_code, 2);
    assert.equal(travRollback.error.code, 'INVALID_ID');
  });

  it('excludes Python cache dirs and *.pyc files in computeReleaseLock and validatePackage while still rejecting cache-named symlinks', () => {
    const root = makeTempDir();
    const cleanPkg = path.join(root, 'clean-py-agent');
    const noisyPkg = path.join(root, 'noisy-py-agent');
    const outsideFile = path.join(root, 'outside.txt');
    fs.writeFileSync(outsideFile, 'secret\n', 'utf8');

    const ext = registerFoundryCli();
    assert.equal(ext.handlers.init([cleanPkg], { id: 'py-cache-agent', 'pkg-version': '1.0.0' }).ok, true);
    fs.mkdirSync(path.join(cleanPkg, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(cleanPkg, 'runtime', 'mod.py'), 'def ok(): return True\n', 'utf8');

    fs.cpSync(cleanPkg, noisyPkg, { recursive: true });
    fs.mkdirSync(path.join(noisyPkg, 'runtime', '__pycache__'), { recursive: true });
    fs.writeFileSync(path.join(noisyPkg, 'runtime', '__pycache__', 'mod.cpython-312.pyc'), 'pyc', 'utf8');
    fs.mkdirSync(path.join(noisyPkg, '.pytest_cache', 'v'), { recursive: true });
    fs.writeFileSync(path.join(noisyPkg, '.pytest_cache', 'v', 'lastfailed'), '{}', 'utf8');
    fs.mkdirSync(path.join(noisyPkg, '.ruff_cache', '0.1'), { recursive: true });
    fs.writeFileSync(path.join(noisyPkg, '.ruff_cache', '0.1', 'state'), '1', 'utf8');
    fs.mkdirSync(path.join(noisyPkg, '.venv', 'bin'), { recursive: true });
    fs.symlinkSync(outsideFile, path.join(noisyPkg, '.venv', 'bin', 'python'));
    fs.writeFileSync(path.join(noisyPkg, 'runtime', 'stray.pyc'), 'pyc', 'utf8');

    const cleanBuild = buildPackage(cleanPkg, { writeLock: true });
    const noisyBuild = buildPackage(noisyPkg, { writeLock: true });
    assert.equal(noisyBuild.digest, cleanBuild.digest);

    const foundryLock = computeReleaseLock(noisyPkg);
    assert.equal(foundryLock.digest, cleanBuild.digest);
    assert.deepEqual(foundryLock.paths, cleanBuild.lock.paths);

    const valRes = validatePackage(noisyPkg);
    assert.equal(valRes.ok, true, JSON.stringify(valRes.errors));

    // Cache-named symlink inside package must fail closed with SYMLINK_FORBIDDEN
    fs.symlinkSync(outsideFile, path.join(noisyPkg, 'runtime', 'evil.pyc'));
    const symVal = validatePackage(noisyPkg);
    assert.equal(symVal.ok, false);
    assert.equal(symVal.exit_code, 2);
    assert.equal(symVal.errors.some((e) => e.code === 'SYMLINK_FORBIDDEN'), true);
  });

  it('excludes nested node_modules, .codegraph, and .tsbuildinfo with @opl/pack parity and rejects excluded-named symlinks', () => {
    const root = makeTempDir();
    const cleanPkg = path.join(root, 'clean-m8-agent');
    const noisyPkg = path.join(root, 'noisy-m8-agent');
    const outsideFile = path.join(root, 'outside.txt');
    fs.writeFileSync(outsideFile, 'secret\n', 'utf8');

    const ext = registerFoundryCli();
    assert.equal(ext.handlers.init([cleanPkg], { id: 'm8-excl-agent', 'pkg-version': '1.0.0' }).ok, true);
    fs.mkdirSync(path.join(cleanPkg, 'workbench', 'src'), { recursive: true });
    fs.writeFileSync(path.join(cleanPkg, 'workbench', 'src', 'app.ts'), 'export const x = 1;\n', 'utf8');

    fs.cpSync(cleanPkg, noisyPkg, { recursive: true });
    fs.mkdirSync(path.join(noisyPkg, 'workbench', 'node_modules', '.bin'), { recursive: true });
    fs.mkdirSync(path.join(noisyPkg, 'workbench', 'node_modules', 'esbuild'), { recursive: true });
    fs.writeFileSync(path.join(noisyPkg, 'workbench', 'node_modules', 'esbuild', 'cli.js'), '1', 'utf8');
    fs.symlinkSync('../esbuild/cli.js', path.join(noisyPkg, 'workbench', 'node_modules', '.bin', 'esbuild'));
    fs.mkdirSync(path.join(noisyPkg, '.codegraph'), { recursive: true });
    fs.writeFileSync(path.join(noisyPkg, '.codegraph', 'codegraph.db'), 'db', 'utf8');
    fs.mkdirSync(path.join(noisyPkg, '.tsbuildinfo'), { recursive: true });
    fs.writeFileSync(path.join(noisyPkg, '.tsbuildinfo', 'tests.tsbuildinfo'), '{}', 'utf8');
    fs.writeFileSync(path.join(noisyPkg, 'workbench', 'types.tsbuildinfo'), '{}', 'utf8');

    const cleanBuild = buildPackage(cleanPkg, { writeLock: true });
    const noisyBuild = buildPackage(noisyPkg, { writeLock: true });
    assert.equal(noisyBuild.digest, cleanBuild.digest);

    const foundryLock = computeReleaseLock(noisyPkg);
    assert.equal(foundryLock.digest, cleanBuild.digest);
    assert.deepEqual(foundryLock.paths, cleanBuild.lock.paths);

    const valRes = validatePackage(noisyPkg);
    assert.equal(valRes.ok, true, JSON.stringify(valRes.errors));

    // Symlinks literally named node_modules, .codegraph, .tsbuildinfo, or *.tsbuildinfo MUST fail closed
    for (const badRel of [
      'workbench/node_modules',
      '.codegraph',
      '.tsbuildinfo',
      'workbench/evil.tsbuildinfo',
    ]) {
      const linkPath = path.join(cleanPkg, badRel);
      fs.symlinkSync(outsideFile, linkPath);
      const symVal = validatePackage(cleanPkg);
      assert.equal(symVal.ok, false, `Expected validatePackage failure for symlink ${badRel}`);
      assert.equal(symVal.exit_code, 2);
      assert.equal(symVal.errors.some((e) => e.code === 'SYMLINK_FORBIDDEN'), true);
      assert.throws(() => computeReleaseLock(cleanPkg), /Symlink forbidden/);
      fs.rmSync(linkPath);
    }
  });
});
