import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { formatJsonPayload, parseJsonText } from '../../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { buildGatewayInstallation } from './identity.ts';
import type {
  GatewayAccountState,
  GatewayCredentialState,
  GatewayInstallationState,
} from './types.ts';

function storeError(code: string, message: string, details: Record<string, unknown> = {}) {
  return new FrameworkContractError('contract_shape_invalid', message, { reason_code: code, ...details });
}

function assertCurrentUserOwned(stats: fs.Stats, filePath: string) {
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw storeError('gateway_store_owner_invalid', 'OPL Gateway private state is not owned by the current user.', {
      path: filePath,
    });
  }
}

function assertPrivatePath(filePath: string, kind: 'directory' | 'file') {
  const stats = fs.lstatSync(filePath);
  if (stats.isSymbolicLink()) {
    throw storeError('gateway_store_symlink_forbidden', 'OPL Gateway private state must not use symbolic links.', {
      path: filePath,
    });
  }
  if (kind === 'directory' ? !stats.isDirectory() : !stats.isFile()) {
    throw storeError('gateway_store_type_invalid', 'OPL Gateway private state has an invalid file type.', {
      path: filePath,
    });
  }
  assertCurrentUserOwned(stats, filePath);
  const forbidden = kind === 'directory' ? 0o077 : 0o177;
  if ((stats.mode & forbidden) !== 0) {
    throw storeError('gateway_store_permissions_invalid', 'OPL Gateway private state permissions are too broad.', {
      path: filePath,
    });
  }
}

function lstatOrNull(filePath: string) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function ensureGatewayPrivateDir() {
  const paths = resolveOplStatePaths();
  const parent = path.dirname(paths.gateway_account_dir);
  fs.mkdirSync(parent, { recursive: true });
  if (!lstatOrNull(paths.gateway_account_dir)) {
    fs.mkdirSync(paths.gateway_account_dir, { mode: 0o700 });
  }
  assertPrivatePath(paths.gateway_account_dir, 'directory');
  return paths;
}

function readPrivateJson(filePath: string): unknown | null {
  if (!lstatOrNull(filePath)) return null;
  assertPrivatePath(filePath, 'file');
  try {
    return parseJsonText(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw storeError('gateway_store_json_invalid', 'OPL Gateway private state is invalid.', { path: filePath });
  }
}

function writePrivateJson(filePath: string, value: unknown) {
  ensureGatewayPrivateDir();
  if (lstatOrNull(filePath)) assertPrivatePath(filePath, 'file');
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  let handle: number | null = null;
  try {
    handle = fs.openSync(tempPath, 'wx', 0o600);
    fs.writeFileSync(handle, formatJsonPayload(value), 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    if (handle !== null) fs.closeSync(handle);
    fs.rmSync(tempPath, { force: true });
  }
}

export function readOrCreateGatewayInstallation(deviceLabel?: string) {
  const paths = ensureGatewayPrivateDir();
  const value = readPrivateJson(paths.gateway_installation_file);
  if (isRecord(value)
    && value.surface_kind === 'opl_gateway_installation.v1'
    && typeof value.installation_id === 'string'
    && typeof value.device_slug === 'string'
    && typeof value.short_id === 'string'
    && typeof value.canonical_key_name === 'string') {
    return value as GatewayInstallationState;
  }
  const installation = buildGatewayInstallation(deviceLabel);
  writePrivateJson(paths.gateway_installation_file, installation);
  return installation;
}

export function readGatewayInstallation() {
  const value = readPrivateJson(ensureGatewayPrivateDir().gateway_installation_file);
  return isRecord(value) && value.surface_kind === 'opl_gateway_installation.v1'
    ? value as GatewayInstallationState
    : null;
}

export function readGatewayAccountState() {
  const value = readPrivateJson(ensureGatewayPrivateDir().gateway_account_file);
  return isRecord(value) && value.surface_kind === 'opl_gateway_account_state.v1'
    ? value as GatewayAccountState
    : null;
}

export function writeGatewayAccountState(value: GatewayAccountState) {
  writePrivateJson(ensureGatewayPrivateDir().gateway_account_file, value);
  return value;
}

export function readGatewayCredentials() {
  const value = readPrivateJson(ensureGatewayPrivateDir().gateway_credentials_file);
  return isRecord(value) && value.surface_kind === 'opl_gateway_credentials.v1'
    ? value as GatewayCredentialState
    : null;
}

export function writeGatewayCredentials(value: GatewayCredentialState) {
  writePrivateJson(ensureGatewayPrivateDir().gateway_credentials_file, value);
}

export function removeGatewayAccountPrivateState() {
  const paths = ensureGatewayPrivateDir();
  fs.rmSync(paths.gateway_account_file, { force: true });
  fs.rmSync(paths.gateway_credentials_file, { force: true });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withGatewayAccountLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockPath = ensureGatewayPrivateDir().gateway_account_lock_file;
  const deadline = Date.now() + 10_000;
  let handle: number | null = null;
  while (handle === null) {
    try {
      handle = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(handle, `${process.pid}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      assertPrivatePath(lockPath, 'file');
      const stats = fs.lstatSync(lockPath);
      const age = Date.now() - stats.mtimeMs;
      const pid = Number.parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
      let ownerAlive = Number.isInteger(pid) && pid > 0;
      if (ownerAlive) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          ownerAlive = (error as NodeJS.ErrnoException).code === 'EPERM';
        }
      }
      if (age > 5 * 60_000 && !ownerAlive) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw storeError('gateway_account_busy', 'Another OPL Gateway account operation is still running.');
      }
      await delay(50);
    }
  }
  try {
    return await operation();
  } finally {
    fs.closeSync(handle);
    fs.rmSync(lockPath, { force: true });
  }
}
