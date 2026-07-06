import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import {
  record,
  recordList,
} from '../../../kernel/json-record.ts';
import { ensureOplStateDir } from '../runtime-state-paths.ts';
import type { JsonRecord, RuntimeEnvironmentTargetInput } from './contract.ts';

export function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function defaultPlatform() {
  return process.platform === 'darwin' && process.arch === 'arm64'
    ? 'macos-arm64'
    : `${process.platform}-${process.arch}`;
}

export function normalizeTarget(input: RuntimeEnvironmentTargetInput) {
  return {
    domain_id: input.domainId ?? 'family-defaults',
    profile_id: input.profileId ?? 'core',
    platform_id: input.platformId ?? defaultPlatform(),
    sandbox_provider: input.sandboxProvider ?? 'fast_local_env',
  };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function shortDigest(value: unknown): string {
  return sha256(value).slice(0, 24);
}

export function targetRef(target: ReturnType<typeof normalizeTarget>) {
  return `${target.domain_id}/${target.profile_id}/${target.platform_id}`;
}

export function relativePaperBuildRef(filename: string) {
  return `paper/build/${filename}`;
}

export function contentFingerprint(value: unknown) {
  return `sha256:${sha256(value)}`;
}

export function runtimeEnvironmentStateRoot() {
  return path.join(ensureOplStateDir().state_dir, 'runtime-environment');
}

export function safeSegment(value: string) {
  return encodeURIComponent(value).replace(/%/g, '_');
}

export function targetStateRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(
    runtimeEnvironmentStateRoot(),
    'targets',
    safeSegment(target.domain_id),
    safeSegment(target.profile_id),
    safeSegment(target.platform_id),
  );
}

export function locksRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'locks');
}

export function bundleRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'bundles');
}

export function runtimeRootsRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'runtime-roots');
}

export function pointerRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'pointers');
}

export function dependencyLibrariesRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'dependency-libraries');
}

export function receiptsRoot(target: ReturnType<typeof normalizeTarget>) {
  return path.join(targetStateRoot(target), 'receipts');
}

export function cleanupReceiptsRoot() {
  return path.join(runtimeEnvironmentStateRoot(), 'cleanup-receipts');
}

export function stateRef(absolutePath: string) {
  return `opl-runtime-env-state:${path.relative(runtimeEnvironmentStateRoot(), absolutePath)}`;
}

export function statePathFromRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith('opl-runtime-env-state:')) {
    return null;
  }
  const relative = ref.slice('opl-runtime-env-state:'.length);
  const resolved = path.resolve(runtimeEnvironmentStateRoot(), relative);
  const root = path.resolve(runtimeEnvironmentStateRoot());
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

export function writeJsonFile(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function readJsonObject(filePath: string): JsonRecord | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const parsed = readJsonPayloadFile(filePath);
  const payload = record(parsed);
  return payload === parsed ? payload : null;
}

export function objects(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

export function materializationId(bundleManifest: JsonRecord) {
  const stableLayerRefs = objects(bundleManifest.layer_refs).map((layer) => ({
    layer_type: layer.layer_type,
    layer_id: layer.layer_id,
    cache_key: layer.cache_key,
    digest: layer.digest,
  }));
  return shortDigest({
    bundle_ref: bundleManifest.bundle_ref,
    bundle_digest: bundleManifest.bundle_digest,
    layer_refs: stableLayerRefs,
  });
}

export function runtimeRootForBundle(
  target: ReturnType<typeof normalizeTarget>,
  bundleManifest: JsonRecord,
) {
  return path.join(runtimeRootsRoot(target), materializationId(bundleManifest));
}

export function pointerPath(target: ReturnType<typeof normalizeTarget>, pointer: string) {
  return path.join(pointerRoot(target), `${pointer}.json`);
}

export function readPointer(target: ReturnType<typeof normalizeTarget>, pointer = 'current') {
  return readJsonObject(pointerPath(target, pointer));
}

export function writePointer(target: ReturnType<typeof normalizeTarget>, pointer: string, payload: JsonRecord) {
  writeJsonFile(pointerPath(target, pointer), payload);
}

export function preparedEnvironmentIndexPath() {
  return path.join(runtimeEnvironmentStateRoot(), 'prepared-environments.json');
}

export function readPreparedEnvironmentIndex(): JsonRecord[] {
  const indexPath = preparedEnvironmentIndexPath();
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  return recordList(readJsonPayloadFile(indexPath));
}

export function writePreparedEnvironmentIndex(entry: JsonRecord) {
  const root = runtimeEnvironmentStateRoot();
  fs.mkdirSync(root, { recursive: true });
  const entries = readPreparedEnvironmentIndex().filter((existing) => (
    existing.paper_root !== entry.paper_root
      || existing.domain_id !== entry.domain_id
      || existing.profile_id !== entry.profile_id
  ));
  entries.push(entry);
  fs.writeFileSync(preparedEnvironmentIndexPath(), `${JSON.stringify(entries, null, 2)}\n`);
}
