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
  observeDomainArtifactCasMaterialization,
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

function materializationInput(
  workspaceRoot: string,
  operations: Record<string, unknown>[],
  options: { scoped?: boolean; absentPaths?: string[] } = {},
) {
  const operationsSha256 = digest(canonicalJsonBytes(operations));
  const absentPaths = options.absentPaths ?? [];
  const materializationScopeSha256 = digest(canonicalJsonBytes({
    operations,
    absent_relative_path_preconditions: absentPaths,
  }));
  const request: Record<string, unknown> = {
    surface_kind: 'opl_domain_artifact_cas_materialization_request',
    version: 'opl-domain-artifact-cas-materialization.v1',
    capability_id: 'opl_domain_artifact_cas_materialization.v1',
    request_id: 'fixture-request',
    domain_id: 'mas',
    authorization_ref: 'opl://mas/cas-authorization/fixture',
    operations_sha256: operationsSha256,
    operations,
  };
  const hostContract: Record<string, unknown> = {
    capability_id: 'opl_domain_artifact_cas_materialization.v1',
    request_output_field: 'materialization_request',
    authorization_output_field: 'authorization',
  };
  const authorization: Record<string, unknown> = {
    authorized: true,
    authorization_ref: request.authorization_ref,
    capability_id: request.capability_id,
    request_id: request.request_id,
    domain_id: request.domain_id,
    operations_sha256: operationsSha256,
    authority_receipt_ref: 'opl://mas/reactivation-receipt/fixture',
    satisfied_gate_ids: ['explicit_user_wakeup'],
  };
  if (options.scoped) {
    request.materialization_scope_sha256 = materializationScopeSha256;
    request.absent_relative_path_preconditions = absentPaths;
    authorization.materialization_scope_sha256 = materializationScopeSha256;
    authorization.absent_relative_path_preconditions = absentPaths;
    hostContract.materialization_scope_sha256_field = 'materialization_scope_sha256';
    hostContract.absent_relative_path_preconditions_field = 'absent_relative_path_preconditions';
  }
  return {
    requestSha256: digest(canonicalJsonBytes(request)),
    request,
    authorization,
    hostContract,
    input: {
      workspaceRoot,
      domainId: 'mas',
      actionId: 'reactivate',
      runId: 'reactivate-run',
      handlerRef: 'handler:fixture.reactivate',
      hostedRuntimeBindingRef: 'opl://hosted-runtime/fixture',
      actionAuthorityBoundary: { host_materialization_contract: hostContract },
      handlerOutput: { materialization_request: request, authorization },
      handlerOutputRef: 'file:///fixture/reactivation-output.json',
      handlerOutputSha256: digest('fixture handler output'),
    },
  };
}

function withCasFixture(run: (workspaceRoot: string, stateRoot: string) => void) {
  const fixtureRoot = temporaryRoot('opl-domain-cas-');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const stateRoot = path.join(fixtureRoot, 'state');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  fs.mkdirSync(path.join(workspaceRoot, 'control'), { recursive: true });
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    run(workspaceRoot, stateRoot);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function filesUnder(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
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
    assert.equal(observeDomainArtifactCasMaterialization({ workspaceRoot }).state, 'clear');
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
    assert.equal(observeDomainArtifactCasMaterialization({ workspaceRoot }).state, 'clear');
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
    const pending = observeDomainArtifactCasMaterialization({ workspaceRoot });
    assert.equal(pending.state, 'sync_pending');
    assert.equal(pending.reason, 'workspace_cas_epoch_in_progress');
    const pendingGeneration = pending.observed_generation;

    const recovered = applyDomainArtifactCasMaterialization(fixture.input);
    assert.equal(recovered?.receipt.transaction instanceof Object, true);
    assert.equal((recovered?.receipt.transaction as Record<string, unknown>).recovery_action,
      'resumed_interrupted_transaction');
    assert.equal(domainArtifactCasMaterializationInProgress({
      workspaceRoot,
      requestSha256: fixture.requestSha256,
    }), false);
    assert.equal(fs.readFileSync(target, 'utf8'), after.toString('utf8'));
    const settled = observeDomainArtifactCasMaterialization({ workspaceRoot });
    assert.equal(settled.state, 'clear');
    assert.notEqual(settled.observed_generation, pendingGeneration);
  });
});

test('domain artifact CAS v1 keeps legacy requests compatible and materializes scoped requests', () => {
  withCasFixture((workspaceRoot) => {
    const legacyTarget = path.join(workspaceRoot, 'control', 'legacy.json');
    fs.writeFileSync(legacyTarget, 'legacy-before');
    const legacy = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/legacy.json',
      before: Buffer.from('legacy-before'),
      after: Buffer.from('legacy-after'),
    })]);
    assert.equal(applyDomainArtifactCasMaterialization(legacy.input)?.receipt.status, 'materialized');
    assert.equal(fs.readFileSync(legacyTarget, 'utf8'), 'legacy-after');
  });

  withCasFixture((workspaceRoot) => {
    const scopedTarget = path.join(workspaceRoot, 'control', 'scoped.json');
    const optionalTarget = path.join(workspaceRoot, 'control', 'optional.json');
    fs.writeFileSync(scopedTarget, 'scoped-before');
    const scoped = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/scoped.json',
      before: Buffer.from('scoped-before'),
      after: Buffer.from('scoped-after'),
    })], { scoped: true, absentPaths: ['control/optional.json'] });
    assert.equal(applyDomainArtifactCasMaterialization(scoped.input)?.receipt.status, 'materialized');
    assert.equal(fs.readFileSync(scopedTarget, 'utf8'), 'scoped-after');
    assert.equal(fs.existsSync(optionalTarget), false);
  });
});

test('domain artifact CAS rejects partial scope declarations and legacy/scoped mixing without writes', () => {
  withCasFixture((workspaceRoot, stateRoot) => {
    const target = path.join(workspaceRoot, 'control', 'target.json');
    fs.writeFileSync(target, 'before');
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
    })], { scoped: true, absentPaths: ['control/optional.json'] });
    delete fixture.hostContract.absent_relative_path_preconditions_field;

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /scope fields must be declared together/i,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'before');
    assert.deepEqual(filesUnder(stateRoot), []);
  });

  withCasFixture((workspaceRoot, stateRoot) => {
    const target = path.join(workspaceRoot, 'control', 'target.json');
    fs.writeFileSync(target, 'before');
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
    })], { scoped: true, absentPaths: ['control/optional.json'] });
    delete fixture.hostContract.materialization_scope_sha256_field;
    delete fixture.hostContract.absent_relative_path_preconditions_field;

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /cannot consume undeclared authorization scope fields/i,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'before');
    assert.deepEqual(filesUnder(stateRoot), []);
  });
});

test('domain artifact CAS rejects missing or tampered scoped authorization without writes', () => {
  for (const missingField of [
    'materialization_scope_sha256',
    'absent_relative_path_preconditions',
  ]) {
    withCasFixture((workspaceRoot, stateRoot) => {
      const target = path.join(workspaceRoot, 'control', 'target.json');
      fs.writeFileSync(target, 'before');
      const fixture = materializationInput(workspaceRoot, [operation({
        relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
      })], { scoped: true, absentPaths: ['control/optional.json'] });
      delete fixture.request[missingField];
      assert.throws(
        () => applyDomainArtifactCasMaterialization(fixture.input),
        /failed JSON Schema validation/i,
      );
      assert.equal(fs.readFileSync(target, 'utf8'), 'before');
      assert.deepEqual(filesUnder(stateRoot), []);
    });
  }

  withCasFixture((workspaceRoot, stateRoot) => {
    const target = path.join(workspaceRoot, 'control', 'target.json');
    fs.writeFileSync(target, 'before');
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
    })], { scoped: true, absentPaths: ['control/optional.json'] });
    fixture.request.materialization_scope_sha256 = 'f'.repeat(64);
    fixture.authorization.materialization_scope_sha256 = 'f'.repeat(64);
    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /does not bind operations and absent paths/i,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'before');
    assert.deepEqual(filesUnder(stateRoot), []);
  });

  withCasFixture((workspaceRoot, stateRoot) => {
    const target = path.join(workspaceRoot, 'control', 'target.json');
    fs.writeFileSync(target, 'before');
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
    })], { scoped: true, absentPaths: ['control/optional.json'] });
    fixture.authorization.absent_relative_path_preconditions = [];
    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /absent-path scope does not bind/i,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'before');
    assert.deepEqual(filesUnder(stateRoot), []);
  });
});

test('domain artifact CAS rejects escaped duplicate noncanonical and overlapping absence paths', () => {
  const cases = [
    { absentPaths: ['../outside.json'], expected: /schema|relative path/i },
    { absentPaths: ['control/optional.json', 'control/optional.json'], expected: /schema|duplicates/i },
    { absentPaths: ['control\\optional.json'], expected: /canonical normalized relative path/i },
    { absentPaths: ['control/target.json'], expected: /overlaps a materialization operation/i },
  ];
  for (const entry of cases) {
    withCasFixture((workspaceRoot, stateRoot) => {
      const target = path.join(workspaceRoot, 'control', 'target.json');
      fs.writeFileSync(target, 'before');
      const fixture = materializationInput(workspaceRoot, [operation({
        relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
      })], { scoped: true, absentPaths: entry.absentPaths });
      assert.throws(() => applyDomainArtifactCasMaterialization(fixture.input), entry.expected);
      assert.equal(fs.readFileSync(target, 'utf8'), 'before');
      assert.deepEqual(filesUnder(stateRoot), []);
    });
  }
});

test('domain artifact CAS rechecks absence immediately before journal switch with zero target journal or receipt writes', () => {
  withCasFixture((workspaceRoot, stateRoot) => {
    const target = path.join(workspaceRoot, 'control', 'target.json');
    const optionalTarget = path.join(workspaceRoot, 'control', 'optional.json');
    fs.writeFileSync(target, 'before');
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
    })], { scoped: true, absentPaths: ['control/optional.json'] });

    assert.throws(() => applyDomainArtifactCasMaterialization(fixture.input, {
      beforeJournalSwitch: () => fs.writeFileSync(optionalTarget, 'racing-writer'),
    }), /absent path collided/i);
    assert.equal(fs.readFileSync(target, 'utf8'), 'before');
    assert.equal(fs.readFileSync(optionalTarget, 'utf8'), 'racing-writer');
    assert.deepEqual(filesUnder(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'transactions')), []);
    assert.deepEqual(filesUnder(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'receipts')), []);
  });
});

test('domain artifact CAS refuses completed receipt replay after an authorized absence collides', () => {
  withCasFixture((workspaceRoot, stateRoot) => {
    const target = path.join(workspaceRoot, 'control', 'target.json');
    const optionalTarget = path.join(workspaceRoot, 'control', 'optional.json');
    fs.writeFileSync(target, 'before');
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/target.json', before: Buffer.from('before'), after: Buffer.from('after'),
    })], { scoped: true, absentPaths: ['control/optional.json'] });
    const first = applyDomainArtifactCasMaterialization(fixture.input);
    assert.ok(first);
    const receiptBytes = fs.readFileSync(first.receipt_path);
    fs.writeFileSync(optionalTarget, 'late-projection');

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /absent path collided before materialization/i,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), 'after');
    assert.equal(fs.readFileSync(first.receipt_path).equals(receiptBytes), true);
    assert.deepEqual(filesUnder(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'transactions')), []);
  });
});
