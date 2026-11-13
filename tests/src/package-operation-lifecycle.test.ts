import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { cancelPackageOperation, startPackageOperation } from '../../src/adapters/integration/agent-package-registry-parts/package-operations.ts';
import { packageOperationDirectory, readPackageOperation, reportPackageOperation, writePackageOperation } from '../../src/adapters/integration/agent-package-registry-parts/package-operation-state.ts';

test('background action survives its dispatch process and persists its real failure for a fresh reader', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-operation-test-')));
  const env = { ...process.env, OPL_STATE_DIR: root, CODEX_HOME: path.join(root, 'codex'), OPL_PACKAGE_OPERATION_ID: '' };
  try {
    const args = ['--conditions=opl-source', '--experimental-strip-types', 'src/entrypoints/cli.ts', 'app', 'action', 'execute', '--action', 'package_operation_start', '--payload', JSON.stringify({ action_id: 'agent_package_install', package_id: 'missing-download-fixture' }), '--json'];
    const receipt = JSON.parse(execFileSync(process.execPath, args, { env, encoding: 'utf8' }));
    const operation = receipt.app_action_execution.result.operation;
    assert.equal(operation.status, 'running');
    let current = readPackageOperation(operation.operation_id, env);
    for (let attempt = 0; attempt < 100 && current.status === 'running'; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      current = readPackageOperation(operation.operation_id, env);
    }
    assert.equal(current.status, 'failed');
    const status = JSON.parse(execFileSync(process.execPath, [...args.slice(0, 7), 'package_operation_status', '--json'], { env, encoding: 'utf8' }));
    assert.equal(status.app_action_execution.result.operations[0].status, 'failed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host operation lock deduplicates clicks and cancellation follows a safe-stage boundary', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operation-lock-test-')));
  const id = crypto.randomUUID();
  const env = { ...process.env, OPL_STATE_DIR: root, CODEX_HOME: path.join(root, 'codex'), OPL_PACKAGE_OPERATION_ID: id };
  try {
    writePackageOperation({ operation_id: id, package_id: 'fixture', action_id: 'agent_package_install', status: 'running', stage: 'installing', can_cancel: false, pid: process.pid, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }, env);
    fs.writeFileSync(path.join(packageOperationDirectory(env), 'active'), id);
    assert.equal((await startPackageOperation('agent_package_install', 'fixture', env)).operation_id, id);
    await assert.rejects(startPackageOperation('agent_package_install', 'other', env), /busy/);
    assert.equal(cancelPackageOperation(id, env).cancel_requested, false);
    reportPackageOperation({ stage: 'downloading', can_cancel: true }, env);
    assert.equal(cancelPackageOperation(id, env).cancel_requested, true);
    const internalEnv = { ...env, OPL_PACKAGE_OPERATION_HOST: env.CODEX_HOME, CODEX_HOME: path.join(root, 'headless-codex') };
    assert.equal(readPackageOperation(id, internalEnv).operation_id, id, 'headless dependencies report to the initiating host');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
