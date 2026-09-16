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

function defaultPlatform() {
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

function stableJson(value: unknown): string {
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

export function runtimeArtifactRoot(input: RuntimeEnvironmentTargetInput) {
  return input.artifactRoot ?? input.paperRoot;
}

export function requiredRuntimeArtifactRoot(input: RuntimeEnvironmentTargetInput) {
  const root = runtimeArtifactRoot(input);
  if (!root) {
    throw new Error('runtime env command requires --artifact-root.');
  }
  return root;
}

export function runtimeRootVocabulary(input: RuntimeEnvironmentTargetInput) {
  const root = runtimeArtifactRoot(input);
  const rootOption = input.rootOption ?? (input.paperRoot && !input.artifactRoot ? '--paper-root' : '--artifact-root');
  return {
    canonical_option: '--artifact-root',
    canonical_field: 'artifact_root',
    artifact_root: root ? path.resolve(root) : null,
    input_option: root ? rootOption : null,
    input_option_status: rootOption === '--paper-root' ? 'compatibility_alias' : 'canonical',
    compatibility_aliases: [
      {
        option: '--paper-root',
        field: 'paper_root',
        status: 'compatibility_alias',
        canonical_option: '--artifact-root',
        canonical_field: 'artifact_root',
      },
    ],
  };
}

export function relativeArtifactBuildRef(filename: string) {
  return `artifact-root/build/${filename}`;
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

function preparedEnvironmentIndexPath() {
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
    (existing.artifact_root ?? existing.paper_root) !== entry.artifact_root
      || existing.domain_id !== entry.domain_id
      || existing.profile_id !== entry.profile_id
  ));
  entries.push(entry);
  fs.writeFileSync(preparedEnvironmentIndexPath(), `${JSON.stringify(entries, null, 2)}\n`);
}
