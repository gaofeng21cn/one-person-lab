import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listPackageOperations, packageOperationDirectory, packageOperationPath, readPackageOperation, reportPackageOperation, writePackageOperation, type PackageOperation } from './package-operation-state.ts';

export const PACKAGE_BACKGROUND_ACTIONS = new Set(['agent_package_install', 'agent_package_update', 'agent_package_repair']);
export function validatePackageOperationRequest(action: unknown, packageId: unknown) {
  if (typeof action !== 'string' || !PACKAGE_BACKGROUND_ACTIONS.has(action)
    || typeof packageId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(packageId)) throw new Error('invalid_package_operation_request');
  return { actionId: action, packageId };
}

export async function startPackageOperation(actionId: string, packageId: string, env: NodeJS.ProcessEnv = process.env) {
  validatePackageOperationRequest(actionId, packageId);
  const dir = packageOperationDirectory(env);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, 'active');
  if (fs.existsSync(lock)) {
    const activeId = fs.readFileSync(lock, 'utf8');
    const active = readPackageOperation(activeId, env);
    if (active.status === 'running') {
      if (active.action_id === actionId && active.package_id === packageId) return active;
      throw new Error('package_operation_busy');
    }
    fs.unlinkSync(lock);
  }
  const id = crypto.randomUUID();
  const fd = fs.openSync(lock, 'wx', 0o600);
  fs.writeFileSync(fd, id); fs.closeSync(fd);
  const now = new Date().toISOString();
  const operation: PackageOperation = { operation_id: id, package_id: packageId, action_id: actionId,
    status: 'running', stage: 'preparing', can_cancel: true, started_at: now, updated_at: now };
  writePackageOperation(operation, env);
  const cli = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? '../../../entrypoints/cli.ts' : '../../../entrypoints/cli.js', import.meta.url));
  try {
    const child = spawn(process.execPath, [...(import.meta.url.endsWith('.ts') ? ['--conditions=opl-source', '--experimental-strip-types'] : []), cli,
      'app', 'action', 'execute', '--action', actionId, '--payload', JSON.stringify({ package_id: packageId }), '--json'], {
      cwd: path.dirname(cli), env: { ...env, OPL_PACKAGE_OPERATION_ID: id,
        OPL_PACKAGE_OPERATION_HOST: env.CODEX_HOME?.trim() || path.join(env.HOME?.trim() || os.homedir(), '.codex') },
      detached: true, stdio: 'ignore',
    });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    return operation;
  } catch (error) {
    writePackageOperation({ ...operation, status: 'failed', stage: 'failed', can_cancel: false, error_code: 'package_operation_start_failed' }, env);
    throw error;
  }
}

export function packageOperationStatus(id?: string, env: NodeJS.ProcessEnv = process.env) {
  return id ? [readPackageOperation(id, env)] : listPackageOperations(env);
}
export function cancelPackageOperation(id: string, env: NodeJS.ProcessEnv = process.env) {
  const operation = readPackageOperation(id, env);
  if (operation.status !== 'running' || !operation.can_cancel) return { operation, cancel_requested: false };
  fs.writeFileSync(`${packageOperationPath(id, env)}.cancel`, '', { mode: 0o600 });
  return { operation, cancel_requested: true };
}

/** Final success remains the existing native lifecycle's verified result. */
export async function observePackageOperation<T>(execute: () => Promise<T>): Promise<T> {
  if (!process.env.OPL_PACKAGE_OPERATION_ID) return execute();
  reportPackageOperation({ pid: process.pid, stage: 'preparing' });
  try {
    const result = await execute();
    reportPackageOperation({ status: 'completed', stage: 'completed', can_cancel: false, bytes_per_second: 0, eta_seconds: null });
    return result;
  } catch (error) {
    const object = error as { code?: string; details?: { failure_code?: string } };
    const rawCode = object.details?.failure_code ?? object.code;
    const code = rawCode && /^[a-z_]{1,120}$/.test(rawCode) ? rawCode : 'package_installation_failed';
    const status = code === 'package_operation_cancelled' ? 'cancelled' : 'failed';
    reportPackageOperation({ status, stage: status, can_cancel: false, error_code: code, bytes_per_second: 0, eta_seconds: null });
    throw error;
  }
}
