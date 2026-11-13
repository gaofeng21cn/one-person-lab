import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type PackageOperation = {
  operation_id: string; package_id: string; action_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  stage: string; started_at: string; updated_at: string; pid?: number;
  active_package_id?: string; downloaded_bytes?: number; total_bytes?: number;
  bytes_per_second?: number; eta_seconds?: number | null; cached_bytes?: number;
  install_location?: string; error_code?: string; can_cancel: boolean; cancel_requested?: boolean;
};

export function packageTransferStateRoot(env: NodeJS.ProcessEnv = process.env) {
  return path.resolve(env.OPL_STATE_DIR?.trim() || path.join(env.HOME?.trim() || os.homedir(), 'Library', 'Application Support', 'OPL', 'state'));
}
export function packageOperationDirectory(env: NodeJS.ProcessEnv = process.env) {
  // Operations belong to a host; this is transport observation, never installed truth.
  const host = path.resolve(env.OPL_PACKAGE_OPERATION_HOST?.trim() || env.CODEX_HOME?.trim() || path.join(env.HOME?.trim() || os.homedir(), '.codex'));
  return path.join(packageTransferStateRoot(env), 'package-operations', crypto.createHash('sha256').update(host).digest('hex').slice(0, 16));
}
export function packageOperationPath(id: string, env: NodeJS.ProcessEnv = process.env) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('invalid_package_operation_id');
  return path.join(packageOperationDirectory(env), `${id}.json`);
}
export function writePackageOperation(value: PackageOperation, env: NodeJS.ProcessEnv = process.env) {
  const target = packageOperationPath(value.operation_id, env);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temporary, target);
}
export function readPackageOperation(id: string, env: NodeJS.ProcessEnv = process.env): PackageOperation {
  const value = JSON.parse(fs.readFileSync(packageOperationPath(id, env), 'utf8')) as PackageOperation;
  if (value.operation_id !== id) throw new Error('invalid_package_operation');
  if (value.status === 'running') {
    let alive = !value.pid && Date.now() - Date.parse(value.started_at) < 30_000;
    if (value.pid) { try { process.kill(value.pid, 0); alive = true; } catch { /* exited */ } }
    if (!alive) return { ...value, status: 'interrupted', stage: 'interrupted', can_cancel: false, error_code: 'package_operation_interrupted' };
  }
  return { ...value, cancel_requested: value.status === 'running' && fs.existsSync(`${packageOperationPath(id, env)}.cancel`) };
}
export function listPackageOperations(env: NodeJS.ProcessEnv = process.env) {
  const dir = packageOperationDirectory(env);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).flatMap(name => {
    try { return [readPackageOperation(name.slice(0, -5), env)]; } catch { return []; }
  }).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 20);
}
export function packageOperationCancelled(env: NodeJS.ProcessEnv = process.env) {
  const id = env.OPL_PACKAGE_OPERATION_ID;
  return !!id && fs.existsSync(`${packageOperationPath(id, env)}.cancel`);
}
export function checkPackageOperationCancellation(env: NodeJS.ProcessEnv = process.env) {
  if (packageOperationCancelled(env)) throw Object.assign(new Error('Package installation cancelled; downloaded bytes are retained.'), { code: 'package_operation_cancelled' });
}
export function reportPackageOperation(fields: Partial<PackageOperation>, env: NodeJS.ProcessEnv = process.env) {
  const id = env.OPL_PACKAGE_OPERATION_ID;
  if (!id) return;
  const current = readPackageOperation(id, env);
  writePackageOperation({ ...current, ...fields, updated_at: new Date().toISOString() }, env);
}
export function packageDownloadCache(digest: string, env: NodeJS.ProcessEnv = process.env) {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('invalid_package_download_digest');
  return path.join(packageTransferStateRoot(env), 'package-downloads', digest.slice(7));
}
