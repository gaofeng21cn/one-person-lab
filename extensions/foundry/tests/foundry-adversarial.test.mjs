import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, it } from 'node:test';
import { registerFoundryCli } from '../src/cli.mjs';
import { evaluatePackage } from '../src/eval.mjs';
import { loadRunRecord, promotePackage, rollbackPackage, saveRunRecord } from '../src/registry.mjs';

const tempDirs = [];

function makeTempDir(prefix = 'opl-foundry-t5-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('T5-FOUNDRY (G2-14): adversarial promote/rollback authority, target mismatch, and corrupt state files', () => {
  it('enforces OWNER_GATE_REQUIRED, TARGET_MISMATCH, NOT_QUALIFIED, REVISION_CONFLICT, and version-digest rollback', () => {
    const root = makeTempDir();
    const stateDir = path.join(root, 'state');
    const pkgDir = path.join(root, 'alpha-agent');
    const ext = registerFoundryCli();

    ext.handlers.init([pkgDir], { id: 'alpha-agent', 'pkg-version': '1.0.0' });
    const eval1 = evaluatePackage({ dir: pkgDir, stateDir });
    assert.equal(eval1.ok, true);

    // TARGET_MISMATCH when promoting under wrong targetAgentId
    const mismatch = promotePackage({
      targetAgentId: 'wrong-agent',
      runId: eval1.run_id,
      expectedRevision: '0',
      authorityReceiptRef: 'receipt-1',
      stateDir,
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.error.code, 'TARGET_MISMATCH');

    // OWNER_GATE_REQUIRED without authorityReceiptRef
    const noGate = promotePackage({
      targetAgentId: 'alpha-agent',
      runId: eval1.run_id,
      expectedRevision: '0',
      stateDir,
    });
    assert.equal(noGate.ok, false);
    assert.equal(noGate.error.code, 'OWNER_GATE_REQUIRED');

    // NOT_QUALIFIED if run record is unqualified
    const badRun = { ...loadRunRecord(eval1.run_id, stateDir), run_id: 'run_unqual_1', qualified: false };
    saveRunRecord(badRun, stateDir);
    const notQual = promotePackage({
      targetAgentId: 'alpha-agent',
      runId: 'run_unqual_1',
      expectedRevision: '0',
      authorityReceiptRef: 'receipt-1',
      stateDir,
    });
    assert.equal(notQual.ok, false);
    assert.equal(notQual.error.code, 'NOT_QUALIFIED');

    // Promote v1.0.0 -> v1.1.0, then rollback by --version-digest with CAS check
    const p1 = promotePackage({
      targetAgentId: 'alpha-agent',
      runId: eval1.run_id,
      expectedRevision: '0',
      authorityReceiptRef: 'receipt-1',
      stateDir,
    });
    assert.equal(p1.ok, true);

    const pkgV2Dir = path.join(root, 'alpha-agent-v2');
    ext.handlers.init([pkgV2Dir], { id: 'alpha-agent', 'pkg-version': '1.1.0' });
    const eval2 = evaluatePackage({ dir: pkgV2Dir, stateDir });
    const p2 = promotePackage({
      targetAgentId: 'alpha-agent',
      runId: eval2.run_id,
      expectedRevision: '1',
      authorityReceiptRef: 'receipt-2',
      stateDir,
    });
    assert.equal(p2.ok, true);
    assert.equal(p2.revision, 2);

    const rbConflict = rollbackPackage({
      targetAgentId: 'alpha-agent',
      versionDigest: p1.version_digest,
      expectedRevision: '99',
      authorityReceiptRef: 'receipt-rb-bad',
      stateDir,
    });
    assert.equal(rbConflict.ok, false);
    assert.equal(rbConflict.error.code, 'REVISION_CONFLICT');

    const rbDigest = rollbackPackage({
      targetAgentId: 'alpha-agent',
      versionDigest: p1.version_digest,
      expectedRevision: '2',
      authorityReceiptRef: 'receipt-rb-ok',
      stateDir,
    });
    assert.equal(rbDigest.ok, true);
    assert.equal(rbDigest.restored_version, '1.0.0');
    assert.equal(rbDigest.revision, 3);

    // Corrupt JSON in runs/<id>.json throws cleanly without partial mutation
    const corruptRunPath = path.join(stateDir, 'foundry', 'runs', 'corrupt-run.json');
    fs.writeFileSync(corruptRunPath, '{bad-json', 'utf8');
    assert.throws(() => loadRunRecord('corrupt-run', stateDir));

    // Boolean flag --force before positional <dir> must not swallow <dir>
    const forceDir = path.join(root, 'force-agent');
    const firstInit = ext.handlers.init([forceDir], { id: 'force-agent' });
    assert.equal(firstInit.ok, true);
    const secondNoForce = ext.handlers.init([forceDir], { id: 'force-agent' });
    assert.equal(secondNoForce.ok, false);
    const forceBeforeDir = ext.handlers.init(['--force', forceDir], { id: 'force-agent' });
    assert.equal(forceBeforeDir.ok, true);
  });
});
