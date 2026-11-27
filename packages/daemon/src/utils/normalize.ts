import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import type { InstallSourceSpec } from '@opl/pack';
import { DaemonRpcError } from '../errors.ts';

function toSnakeKey(key: string): string {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

export function normalizeParams(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'RPC params must be a JSON object.');
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const snake = toSnakeKey(k);
    if (!(snake in out)) {
      out[snake] = v;
    }
    if (!(k in out)) {
      out[k] = v;
    }
  }
  return out;
}

export function pickString(params: Record<string, unknown>, ...keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const val = params[key];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val;
    }
  }
  return undefined;
}

export function pickOptionalString(params: Record<string, unknown>, ...keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const val = params[key];
    if (typeof val === 'string') {
      return val;
    }
  }
  return undefined;
}

export function pickBoolean(params: Record<string, unknown>, ...keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const val = params[key];
    if (typeof val === 'boolean') return val;
  }
  return undefined;
}

export function pickNumber(params: Record<string, unknown>, ...keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const val = params[key];
    if (typeof val === 'number' && Number.isFinite(val)) return val;
  }
  return undefined;
}

export function pickStringArray(params: Record<string, unknown>, ...keys: readonly string[]): string[] | undefined {
  for (const key of keys) {
    const val = params[key];
    if (Array.isArray(val)) {
      return val.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
  }
  return undefined;
}

export function pickRecord(params: Record<string, unknown>, ...keys: readonly string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const val = params[key];
    if (isRecord(val)) return val;
  }
  return undefined;
}

export function coerceInstallSourceSpec(raw: unknown, packageIdHint?: string): InstallSourceSpec {
  if (isRecord(raw) && typeof raw.kind === 'string') {
    const kind = raw.kind;
    if (kind === 'local_dir' || kind === 'tarball' || kind === 'oci' || kind === 'npm') {
      return {
        kind,
        ...(typeof raw.path === 'string' ? { path: raw.path } : {}),
        ...(typeof raw.ref === 'string' ? { ref: raw.ref } : {}),
        ...(typeof raw.version === 'string' ? { version: raw.version } : {}),
        ...(typeof raw.expected_digest === 'string' ? { expected_digest: raw.expected_digest } : {}),
        ...(typeof raw.package_id === 'string'
          ? { package_id: raw.package_id }
          : packageIdHint
            ? { package_id: packageIdHint }
            : {}),
      };
    }
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', `Unsupported install source kind '${kind}'.`);
  }

  if (typeof raw === 'string' && raw.trim().length > 0) {
    const spec = raw.trim();
    const hint = packageIdHint ? { package_id: packageIdHint } : {};
    if (spec.startsWith('oci://')) {
      return { kind: 'oci', ref: spec.slice('oci://'.length), ...hint };
    }
    if (spec.startsWith('ghcr.io/') || spec.startsWith('docker.io/')) {
      return { kind: 'oci', ref: spec, ...hint };
    }
    if (spec.endsWith('.tgz') || spec.endsWith('.tar.gz') || spec.endsWith('.oplpack')) {
      return { kind: 'tarball', path: path.resolve(spec), ...hint };
    }
    if (
      spec.startsWith('/')
      || spec.startsWith('./')
      || spec.startsWith('../')
      || (fs.existsSync(spec) && fs.statSync(spec).isDirectory())
    ) {
      return { kind: 'local_dir', path: path.resolve(spec), ...hint };
    }
    return { kind: 'npm', ref: spec, ...hint };
  }

  throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Install source must be a non-empty path, ref, or InstallSourceSpec.');
}
