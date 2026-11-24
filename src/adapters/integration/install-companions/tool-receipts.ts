import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import type {
  LatestToolVersion,
  OplCompanionToolId,
  OplCompanionToolSyncItem,
} from './tool-version.ts';

export function managedToolHome() {
  return path.join(resolveOplStatePaths().state_dir, 'base-dependencies');
}

function managedToolReceiptPath(toolId: OplCompanionToolId) {
  return path.join(managedToolHome(), 'receipts', `${toolId}.json`);
}

function readManagedToolReceipt(toolId: OplCompanionToolId): Record<string, unknown> | null {
  const receiptPath = managedToolReceiptPath(toolId);
  if (!fs.existsSync(receiptPath)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as unknown;
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    return record.dependency_id === toolId ? record : null;
  } catch {
    return null;
  }
}

export function readLatestToolVersionReceipt(toolId: OplCompanionToolId): LatestToolVersion | null {
  const payload = readManagedToolReceipt(toolId);
  if (!payload) return null;
  try {
    const version = typeof payload.latest_version === 'string' ? payload.latest_version : null;
    const source = payload.latest_version_source;
    return {
      version,
      source: source === 'github_tags' || source === 'npm_registry' || source === 'configured' ? source : null,
    };
  } catch {
    return null;
  }
}

export function managedToolReceiptMatches(
  toolId: OplCompanionToolId,
  binaryPaths: Record<string, string>,
  contentSha256: string,
) {
  const receipt = readManagedToolReceipt(toolId);
  if (!receipt || receipt.content_sha256 !== contentSha256) return false;
  if (!receipt.binary_paths || typeof receipt.binary_paths !== 'object') return false;
  const receiptPaths = receipt.binary_paths as Record<string, unknown>;
  const entries = Object.entries(binaryPaths);
  return Object.keys(receiptPaths).length === entries.length
    && entries.every(([name, binaryPath]) => (
      typeof receiptPaths[name] === 'string'
      && path.resolve(receiptPaths[name]) === path.resolve(binaryPath)
    ));
}

export function binarySha256(binaryPath: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(binaryPath)).digest('hex');
}

export function binarySetSha256(binaryPaths: Record<string, string>) {
  const digest = crypto.createHash('sha256');
  for (const [name, binaryPath] of Object.entries(binaryPaths).sort(([left], [right]) => left.localeCompare(right))) {
    digest.update(`${name}\0`);
    digest.update(fs.readFileSync(binaryPath));
  }
  return digest.digest('hex');
}

export function pathOwnership(binaryPath: string | null): OplCompanionToolSyncItem['ownership'] {
  if (!binaryPath) return 'missing';
  const normalized = path.resolve(binaryPath);
  if (normalized.startsWith(`${path.resolve(managedToolHome())}${path.sep}`)) return 'opl_managed';
  const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim();
  if (runtimeHome && normalized.startsWith(`${path.resolve(runtimeHome)}${path.sep}`)) return 'app_bundled';
  if (normalized.startsWith(`${path.resolve(resolveOplStatePaths().home_dir, '.local')}${path.sep}`)) return 'user_managed';
  return 'global_path';
}

export function writeManagedToolReceipt(tool: OplCompanionToolSyncItem) {
  const receiptPath = managedToolReceiptPath(tool.tool_id);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify({
    surface_kind: 'opl_base_managed_dependency_receipt',
    dependency_id: tool.tool_id,
    binary_path: tool.binary_path,
    binary_paths: tool.binary_paths,
    entrypoint: tool.entrypoint,
    version: tool.version,
    content_sha256: tool.content_sha256,
    latest_version: tool.latest_version,
    currentness: tool.currentness,
    latest_version_source: tool.latest_version_source,
    ownership: tool.ownership,
    updated_at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
  return receiptPath;
}
