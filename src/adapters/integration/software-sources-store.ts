import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';
import { SOFTWARE_SOURCE_STATUSES, type SoftwareSource } from './software-sources-types.ts';

export function softwareSourcesFile(env: NodeJS.ProcessEnv = process.env) {
  const stateDir = env === process.env ? resolveOplStatePaths().state_dir
    : env.OPL_STATE_DIR?.trim() ? path.resolve(env.OPL_STATE_DIR.trim())
      : env.OPL_DATA_DIR?.trim() ? path.join(path.resolve(env.OPL_DATA_DIR.trim()), 'opl', 'state')
        : path.join(env.HOME?.trim() || os.homedir(), 'Library', 'Application Support', 'OPL', 'state');
  return path.join(stateDir, 'software-sources.json');
}
export function softwareSourceFailure(reasonCode: string, message: string): never {
  throw new FrameworkContractError('cli_usage_error', message, { reason_code: reasonCode });
}
export function sourceTemplate(sourceId: string): SoftwareSource {
  const common = { enabled: true, credential_handle: null, verified_at: null, verification_reason: null, revision: 'default' };
  if (sourceId === 'homebrew:gaofeng21cn-one-person-lab') return {
    ...common, source_id: sourceId, provider_id: 'homebrew', display_name: 'OPL Homebrew',
    source_kind: 'tap', source_ref: 'https://github.com/gaofeng21cn/homebrew-one-person-lab', visibility: 'public', status: 'public',
  };
  if (sourceId === 'public-registry:opl') return {
    ...common, source_id: sourceId, provider_id: 'public_registry', display_name: 'OPL Package Catalog',
    source_kind: 'registry', source_ref: 'https://github.com/gaofeng21cn/one-person-lab/tree/main/contracts/opl-framework/packages', visibility: 'public', status: 'public',
  };
  const match = /^github-packages:([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)$/.exec(sourceId);
  if (!match) softwareSourceFailure('software_source_id_invalid', 'Use a known public source or github-packages:<owner>.');
  return {
    ...common, source_id: sourceId, provider_id: 'github_packages', display_name: `${match[1]} / GitHub Packages`,
    source_kind: 'registry', source_ref: `https://github.com/${match[1]}?tab=packages`, visibility: 'authorized_only', status: 'signed_out',
  };
}
export function normalizeSoftwareSourceCredential(value: unknown) {
  if (value === null) return null;
  if (typeof value === 'string' && [
    'provider:github_packages:ghcr', 'provider:github_packages:gh-cli',
    'provider:github_packages:docker', 'env:OPL_GITHUB_PACKAGES_TOKEN',
  ].includes(value)) return value;
  softwareSourceFailure('software_source_credential_handle_invalid', 'Use a supported GitHub Packages credential handle; credential values are not accepted.');
}
export function readSoftwareSources(env: NodeJS.ProcessEnv = process.env): SoftwareSource[] {
  const defaults = [sourceTemplate('homebrew:gaofeng21cn-one-person-lab'), sourceTemplate('public-registry:opl'), sourceTemplate('github-packages:gaofeng21cn')];
  const file = softwareSourcesFile(env);
  if (!fs.existsSync(file)) return defaults;
  try {
    const payload: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isRecord(payload) || payload.surface_kind !== 'opl_software_sources_store.v1' || !Array.isArray(payload.sources)) throw new Error();
    const sources = new Map(defaults.map(source => [source.source_id, source]));
    const seen = new Set<string>();
    for (const entry of payload.sources) {
      if (!isRecord(entry) || typeof entry.source_id !== 'string' || seen.has(entry.source_id)) throw new Error();
      const template = sourceTemplate(entry.source_id);
      if (typeof entry.enabled !== 'boolean'
        || typeof entry.revision !== 'string' || !SOFTWARE_SOURCE_STATUSES.includes(entry.status as SoftwareSource['status'])
        || !(entry.verified_at === null || typeof entry.verified_at === 'string')
        || !(entry.verification_reason === null || typeof entry.verification_reason === 'string')) throw new Error();
      const credential = normalizeSoftwareSourceCredential(entry.credential_handle);
      if (template.visibility === 'public' && (credential !== null || entry.enabled !== true)) throw new Error();
      const source = {
        ...template, enabled: entry.enabled, credential_handle: credential,
        status: entry.status as SoftwareSource['status'], verified_at: entry.verified_at,
        verification_reason: entry.verification_reason, revision: entry.revision,
      };
      if (source.visibility === 'authorized_only' && (!source.enabled || !credential)) source.status = 'signed_out';
      sources.set(source.source_id, source);
      seen.add(source.source_id);
    }
    return [...sources.values()];
  } catch {
    throw new FrameworkContractError('contract_shape_invalid', 'Software source configuration is invalid.', { reason_code: 'software_source_store_invalid', file });
  }
}
export function readSoftwareSource(sourceId: string, env: NodeJS.ProcessEnv = process.env) {
  return readSoftwareSources(env).find(source => source.source_id === sourceId) ?? sourceTemplate(sourceId);
}
export function writeSoftwareSource(source: SoftwareSource, expectedRevision: string) {
  const file = softwareSourcesFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  try { fs.mkdirSync(lock); } catch { softwareSourceFailure('software_source_busy', 'Another software source change is in progress; retry after it completes.'); }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const sources = readSoftwareSources();
    const current = sources.find(candidate => candidate.source_id === source.source_id) ?? sourceTemplate(source.source_id);
    if (current.revision !== expectedRevision) softwareSourceFailure('software_source_changed', 'Software source configuration changed during verification; read it again before retrying.');
    const next = { ...source, revision: randomUUID() };
    const retained = sources.filter(candidate => candidate.source_id !== source.source_id);
    retained.push(next);
    fs.writeFileSync(temporary, `${JSON.stringify({ surface_kind: 'opl_software_sources_store.v1', sources: retained }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
    return next;
  } finally {
    fs.rmSync(temporary, { force: true });
    fs.rmdirSync(lock);
  }
}
