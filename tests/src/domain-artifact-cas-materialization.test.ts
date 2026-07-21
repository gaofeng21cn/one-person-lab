import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import {
  applyDomainArtifactCasMaterialization,
  domainArtifactCasMaterializationInProgress,
} from '../../src/modules/runway/domain-artifact-cas-materialization.ts';

function temporaryRoot(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function digest(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function operation(input: {
  relativePath: string;
  before?: Buffer;
  after: Buffer;
}) {
  return {
    target_relative_path: input.relativePath,
    precondition: input.before
      ? { kind: 'existing_exact', sha256: digest(input.before), byte_size: input.before.byteLength }
      : { kind: 'absent' },
    replacement_bytes_base64: input.after.toString('base64'),
    replacement_sha256: digest(input.after),
    replacement_byte_size: input.after.byteLength,
  };
}

function materializationInput(workspaceRoot: string, operations: Record<string, unknown>[]) {
  const operationsSha256 = digest(canonicalJsonBytes(operations));
  const request = {
    surface_kind: 'opl_domain_artifact_cas_materialization_request',
    version: 'opl-domain-artifact-cas-materialization.v1',
    capability_id: 'opl_domain_artifact_cas_materialization.v1',
    request_id: 'fixture-request',
    domain_id: 'mas',
    authorization_ref: 'opl://mas/cas-authorization/fixture',
    operations_sha256: operationsSha256,
    operations,
  };
  return {
    requestSha256: digest(canonicalJsonBytes(request)),
    input: {
      workspaceRoot,
      domainId: 'mas',
      actionId: 'reactivate',
      runId: 'reactivate-run',
      handlerRef: 'handler:fixture.reactivate',
      hostedRuntimeBindingRef: 'opl://hosted-runtime/fixture',
      actionAuthorityBoundary: {
        host_materialization_contract: {
          capability_id: 'opl_domain_artifact_cas_materialization.v1',
          request_output_field: 'materialization_request',
          authorization_output_field: 'authorization',
        },
      },
      handlerOutput: {
        materialization_request: request,
        authorization: {
          authorized: true,
          authorization_ref: request.authorization_ref,
          capability_id: request.capability_id,
          request_id: request.request_id,
          domain_id: request.domain_id,
          operations_sha256: operationsSha256,
          authority_receipt_ref: 'opl://mas/reactivation-receipt/fixture',
          satisfied_gate_ids: ['explicit_user_wakeup'],
        },
      },
      handlerOutputRef: 'file:///fixture/reactivation-output.json',
      handlerOutputSha256: digest('fixture handler output'),
    },
  };
}

function withCasFixture(run: (workspaceRoot: string) => void) {
  const fixtureRoot = temporaryRoot('opl-domain-cas-');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  fs.mkdirSync(path.join(workspaceRoot, 'control'), { recursive: true });
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    run(workspaceRoot);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test('domain artifact CAS rejects an absent precondition collision without changing bytes', () => {
  withCasFixture((workspaceRoot) => {
    const target = path.join(workspaceRoot, 'control', 'created.json');
    fs.writeFileSync(target, 'already-present');
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/created.json',
      after: Buffer.from('replacement'),
    })]);

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /preconditions|absent precondition collided/i,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'already-present');
    assert.equal(domainArtifactCasMaterializationInProgress({
      workspaceRoot,
      requestSha256: fixture.requestSha256,
    }), false);
  });
});

test('domain artifact CAS rolls back create and update targets after a mid-switch failure', () => {
  withCasFixture((workspaceRoot) => {
    const existing = Buffer.from('before-existing');
    const existingTarget = path.join(workspaceRoot, 'control', 'existing.json');
    const createdTarget = path.join(workspaceRoot, 'control', 'created.json');
    fs.writeFileSync(existingTarget, existing);
    const fixture = materializationInput(workspaceRoot, [
      operation({ relativePath: 'control/existing.json', before: existing, after: Buffer.from('after-existing') }),
      operation({ relativePath: 'control/created.json', after: Buffer.from('after-created') }),
    ]);
    let renameCalls = 0;

    assert.throws(() => applyDomainArtifactCasMaterialization(fixture.input, {
      rename: (from, to) => {
        renameCalls += 1;
        if (renameCalls === 3) throw new Error('simulated process failure');
        fs.renameSync(from, to);
      },
    }), /simulated process failure/);
    assert.equal(fs.readFileSync(existingTarget, 'utf8'), existing.toString('utf8'));
    assert.equal(fs.existsSync(createdTarget), false);
    assert.equal(domainArtifactCasMaterializationInProgress({
      workspaceRoot,
      requestSha256: fixture.requestSha256,
    }), false);
  });
});

test('domain artifact CAS resumes the same exact request after targets switch before receipt persistence', () => {
  withCasFixture((workspaceRoot) => {
    const before = Buffer.from('before');
    const after = Buffer.from('after');
    const target = path.join(workspaceRoot, 'control', 'lifecycle.json');
    fs.writeFileSync(target, before);
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/lifecycle.json', before, after,
    })]);

    assert.throws(() => applyDomainArtifactCasMaterialization(fixture.input, {
      beforePersistReceipt: () => { throw new Error('simulated receipt persistence crash'); },
    }), /simulated receipt persistence crash/);
    assert.equal(fs.readFileSync(target, 'utf8'), after.toString('utf8'));
    assert.equal(domainArtifactCasMaterializationInProgress({
      workspaceRoot,
      requestSha256: fixture.requestSha256,
    }), true);

    const recovered = applyDomainArtifactCasMaterialization(fixture.input);
    assert.equal(recovered?.receipt.transaction instanceof Object, true);
    assert.equal((recovered?.receipt.transaction as Record<string, unknown>).recovery_action,
      'resumed_interrupted_transaction');
    assert.equal(domainArtifactCasMaterializationInProgress({
      workspaceRoot,
      requestSha256: fixture.requestSha256,
    }), false);
    assert.equal(fs.readFileSync(target, 'utf8'), after.toString('utf8'));
  });
});
