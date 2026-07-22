import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

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
  options: { scoped?: boolean; absentPaths?: string[]; requestId?: string } = {},
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
    request_id: options.requestId ?? 'fixture-request',
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

test('domain artifact CAS journals nested parent-directory creation and replays exact bytes idempotently', () => {
  withCasFixture((workspaceRoot) => {
    const relative = 'studies/qualification-fixture/control/lifecycle.json';
    const target = path.join(workspaceRoot, relative);
    const after = Buffer.from('{"lifecycle_state":"active"}\n');
    const fixture = materializationInput(workspaceRoot, [operation({ relativePath: relative, after })], {
      requestId: 'nested-parent-success',
    });

    const first = applyDomainArtifactCasMaterialization(fixture.input);
    assert.ok(first);
    assert.equal(fs.readFileSync(target).equals(after), true);
    const transaction = first.receipt.transaction as Record<string, unknown>;
    const physicalWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
    assert.equal(transaction.exact_request_replay_is_idempotent, true);
    assert.deepEqual(transaction.created_parent_directory_refs, [
      pathToFileURL(path.join(physicalWorkspaceRoot, 'studies')).href,
      pathToFileURL(path.join(physicalWorkspaceRoot, 'studies', 'qualification-fixture')).href,
      pathToFileURL(path.join(physicalWorkspaceRoot, 'studies', 'qualification-fixture', 'control')).href,
    ]);

    const replay = applyDomainArtifactCasMaterialization(fixture.input);
    assert.equal(replay?.receipt_sha256, first.receipt_sha256);
    assert.equal(replay?.receipt_ref, first.receipt_ref);
  });
});

test('domain artifact CAS rolls back nested parent directories and persists one idempotent failure receipt', () => {
  withCasFixture((workspaceRoot, stateRoot) => {
    const relative = 'studies/qualification-failure/control/lifecycle.json';
    const target = path.join(workspaceRoot, relative);
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: relative,
      after: Buffer.from('{"lifecycle_state":"active"}\n'),
    })], { requestId: 'nested-parent-failure' });

    let failureReceiptRef = '';
    assert.throws(() => applyDomainArtifactCasMaterialization(fixture.input, {
      rename: () => { throw new Error('simulated nested switch failure'); },
    }), (error: any) => {
      failureReceiptRef = String(error.details?.failure_receipt_ref ?? '');
      return /simulated nested switch failure/u.test(String(error.message)) && failureReceiptRef.startsWith('file://');
    });
    assert.equal(fs.existsSync(target), false);
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'studies')), false);
    const failureReceiptFile = new URL(failureReceiptRef);
    const failureReceiptBytes = fs.readFileSync(failureReceiptFile);
    const failureReceipt = JSON.parse(failureReceiptBytes.toString('utf8')) as Record<string, any>;
    assert.equal(failureReceipt.status, 'failed_rolled_back');
    assert.equal(failureReceipt.failure.rolled_back, true);
    assert.equal(failureReceipt.transaction.recovery_action, 'rolled_back_after_failure');
    assert.deepEqual(failureReceipt.transaction.created_parent_directory_refs, []);
    assert.deepEqual(filesUnder(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'transactions')), []);

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /previously failed and was rolled back/i,
    );
    assert.equal(fs.readFileSync(failureReceiptFile).equals(failureReceiptBytes), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'studies')), false);
  });
});

test('domain artifact CAS preserves a parent directory won by a concurrent writer', () => {
  withCasFixture((workspaceRoot) => {
    const relative = 'studies/qualification-race/control/lifecycle.json';
    const target = path.join(workspaceRoot, relative);
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: relative,
      after: Buffer.from('{"lifecycle_state":"active"}\n'),
    })], { requestId: 'nested-parent-race' });
    const racedParent = path.join(workspaceRoot, 'studies');

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input, {
        beforeJournalSwitch: () => fs.mkdirSync(racedParent),
      }),
      /parent-directory creation collided/i,
    );
    assert.equal(fs.statSync(racedParent).isDirectory(), true);
    assert.equal(fs.existsSync(target), false);
  });
});

test('domain artifact CAS rejects a parent-directory symlink swap before journal or target writes', () => {
  withCasFixture((workspaceRoot, stateRoot) => {
    const parent = path.join(workspaceRoot, 'nested');
    const displacedParent = path.join(workspaceRoot, 'nested-before-swap');
    const outside = path.join(path.dirname(workspaceRoot), 'outside');
    const target = path.join(parent, 'target.json');
    const outsideTarget = path.join(outside, 'target.json');
    fs.mkdirSync(parent);
    fs.mkdirSync(outside);
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'nested/target.json',
      after: Buffer.from('authorized-after'),
    })], { requestId: 'parent-symlink-swap' });

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input, {
        beforeJournalSwitch: () => {
          fs.renameSync(parent, displacedParent);
          fs.symlinkSync(outside, parent, 'dir');
        },
      }),
      /ancestors must not contain symlinks|target ancestors must be physical directories/i,
    );
    assert.equal(fs.existsSync(target), false);
    assert.equal(fs.existsSync(outsideTarget), false);
    assert.deepEqual(filesUnder(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'transactions')), []);
  });
});

test('domain artifact CAS request ids are single-use across conflicting exact request bytes', () => {
  withCasFixture((workspaceRoot) => {
    const first = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/first.json',
      after: Buffer.from('first'),
    })], { requestId: 'single-use-request' });
    assert.ok(applyDomainArtifactCasMaterialization(first.input));

    const conflicting = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/second.json',
      after: Buffer.from('second'),
    })], { requestId: 'single-use-request' });
    assert.throws(
      () => applyDomainArtifactCasMaterialization(conflicting.input),
      /request_id is already bound to different exact request bytes/i,
    );
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'control', 'second.json')), false);
  });
});

test('domain artifact CAS replays a legacy successful receipt while migrating its request binding', () => {
  withCasFixture((workspaceRoot, stateRoot) => {
    const relative = 'control/legacy-replay.json';
    const target = path.join(workspaceRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: relative,
      after: Buffer.from('legacy-after'),
    })], { requestId: 'legacy-replay' });
    const first = applyDomainArtifactCasMaterialization(fixture.input);
    assert.ok(first);

    const legacyReceipt = structuredClone(first.receipt) as Record<string, any>;
    delete legacyReceipt.failure;
    delete legacyReceipt.transaction.single_use_request_binding_ref;
    delete legacyReceipt.transaction.exact_request_replay_is_idempotent;
    delete legacyReceipt.transaction.created_parent_directory_refs;
    const legacyBytes = Buffer.from(`${JSON.stringify(legacyReceipt, null, 2)}\n`);
    fs.rmSync(first.receipt_path);
    fs.writeFileSync(first.receipt_path, legacyBytes);

    const replay = applyDomainArtifactCasMaterialization(fixture.input);
    assert.equal(replay?.receipt_sha256, digest(legacyBytes));
    assert.deepEqual(replay?.receipt, legacyReceipt);
    assert.equal(fs.readFileSync(target, 'utf8'), 'legacy-after');
    assert.equal(filesUnder(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'request-bindings')).length, 1);
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

test('domain artifact CAS resumes after process death between target backup and replacement install', () => {
  withCasFixture((workspaceRoot) => {
    const before = Buffer.from('before-process-death');
    const after = Buffer.from('after-process-death');
    const target = path.join(workspaceRoot, 'control', 'mid-rename.json');
    fs.writeFileSync(target, before);
    const fixture = materializationInput(workspaceRoot, [operation({
      relativePath: 'control/mid-rename.json', before, after,
    })], { requestId: 'mid-rename-process-death' });
    const moduleRef = new URL(
      '../../src/modules/runway/domain-artifact-cas-materialization.ts',
      import.meta.url,
    ).href;
    const child = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      [
        "import fs from 'node:fs';",
        `import { applyDomainArtifactCasMaterialization } from ${JSON.stringify(moduleRef)};`,
        "const input = JSON.parse(fs.readFileSync(0, 'utf8'));",
        'applyDomainArtifactCasMaterialization(input, {',
        '  rename(from, to) {',
        '    fs.renameSync(from, to);',
        "    process.kill(process.pid, 'SIGKILL');",
        '  },',
        '});',
      ].join('\n'),
    ], {
      env: process.env,
      input: JSON.stringify(fixture.input),
      encoding: 'utf8',
    });

    assert.equal(child.status, null);
    assert.equal(child.signal, 'SIGKILL');
    assert.equal(fs.existsSync(target), false);
    assert.equal(domainArtifactCasMaterializationInProgress({
      workspaceRoot,
      requestSha256: fixture.requestSha256,
    }), true);

    const recovered = applyDomainArtifactCasMaterialization(fixture.input);
    assert.equal(
      (recovered?.receipt.transaction as Record<string, unknown>).recovery_action,
      'resumed_interrupted_transaction',
    );
    assert.equal(fs.readFileSync(target).equals(after), true);
    assert.equal(domainArtifactCasMaterializationInProgress({
      workspaceRoot,
      requestSha256: fixture.requestSha256,
    }), false);
  });
});

test('domain artifact CAS recovers journaled parent-directory creation after receipt persistence interruption', () => {
  withCasFixture((workspaceRoot) => {
    const relative = 'studies/qualification-recovery/control/lifecycle.json';
    const target = path.join(workspaceRoot, relative);
    const after = Buffer.from('{"lifecycle_state":"active"}\n');
    const fixture = materializationInput(workspaceRoot, [operation({ relativePath: relative, after })], {
      requestId: 'nested-parent-recovery',
    });

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input, {
        beforePersistReceipt: () => { throw new Error('simulated nested receipt persistence crash'); },
      }),
      /nested receipt persistence crash/i,
    );
    assert.equal(fs.readFileSync(target).equals(after), true);
    const recovered = applyDomainArtifactCasMaterialization(fixture.input);
    assert.equal((recovered?.receipt.transaction as Record<string, unknown>).recovery_action,
      'resumed_interrupted_transaction');
    assert.equal(fs.readFileSync(target).equals(after), true);
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

test('domain artifact CAS binds a declared domain-owner receipt to one exact replacement operation', () => {
  withCasFixture((workspaceRoot) => {
    const receipt = { receipt_ref: 'mas-receipt:qualification', status: 'qualification_only' };
    const receiptBytes = Buffer.from(
      '{"receipt_ref":"mas-receipt:\\u0071ualification","status":"qualification_only"}',
    );
    const relative = 'studies/qualification-fixture/artifacts/controller/qualification/provisioning-receipt.json';
    const fixture = materializationInput(workspaceRoot, [operation({ relativePath: relative, after: receiptBytes })], {
      requestId: 'owner-receipt-binding',
    });
    fixture.hostContract.receipt_output_field = 'owner_receipt';
    fixture.hostContract.receipt_content_binding_output_field = 'owner_receipt_content_binding';
    Object.assign(fixture.input.handlerOutput, {
      owner_receipt: receipt,
      owner_receipt_content_binding: {
        receipt_ref: receipt.receipt_ref,
        target_relative_path: relative,
        sha256: digest(receiptBytes),
        byte_size: receiptBytes.byteLength,
      },
    });

    assert.ok(applyDomainArtifactCasMaterialization(fixture.input));
    assert.equal(fs.readFileSync(path.join(workspaceRoot, relative)).equals(receiptBytes), true);
  });
});

test('domain artifact CAS rejects a mismatched domain-owner receipt binding before any write', () => {
  withCasFixture((workspaceRoot, stateRoot) => {
    const receipt = { receipt_ref: 'mas-receipt:fixture', status: 'qualification_only' };
    const receiptBytes = canonicalJsonBytes(receipt);
    const relative = 'studies/qualification-fixture/artifacts/controller/qualification/provisioning-receipt.json';
    const fixture = materializationInput(workspaceRoot, [operation({ relativePath: relative, after: receiptBytes })], {
      requestId: 'owner-receipt-binding-mismatch',
    });
    fixture.hostContract.receipt_output_field = 'owner_receipt';
    fixture.hostContract.receipt_content_binding_output_field = 'owner_receipt_content_binding';
    Object.assign(fixture.input.handlerOutput, {
      owner_receipt: receipt,
      owner_receipt_content_binding: {
        receipt_ref: receipt.receipt_ref,
        target_relative_path: relative,
        sha256: digest(Buffer.from('different')),
        byte_size: receiptBytes.byteLength,
      },
    });

    assert.throws(
      () => applyDomainArtifactCasMaterialization(fixture.input),
      /receipt content binding does not match/i,
    );
    assert.equal(fs.existsSync(path.join(workspaceRoot, relative)), false);
    assert.deepEqual(filesUnder(stateRoot), []);
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
    const receiptFiles = filesUnder(path.join(stateRoot, 'runway', 'domain-artifact-cas', 'receipts'));
    assert.equal(receiptFiles.length, 2);
    const failureReceipt = JSON.parse(fs.readFileSync(receiptFiles[0]!, 'utf8')) as Record<string, any>;
    assert.equal(failureReceipt.status, 'failed_rolled_back');
    assert.equal(failureReceipt.failure.rolled_back, true);
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
