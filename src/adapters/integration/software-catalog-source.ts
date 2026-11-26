import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import {
  PACKAGE_CATEGORY_SUBDIRS,
  isPackageCategorySubdir,
  resolveOfficialPackageCatalogSeedDir,
} from '../../kernel/standard-agent-registry.ts';
import {
  DEFAULT_OPL_CATALOG_INDEX_URL,
  OFFICIAL_OPL_CATALOG_ID,
  softwareCatalogSourceDir,
  softwareCatalogSourceRoot,
} from '../../kernel/software-catalog-cache-paths.ts';
import type { SoftwareSource } from './software-sources-types.ts';

export { DEFAULT_OPL_CATALOG_INDEX_URL, OFFICIAL_OPL_CATALOG_ID };

const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;

export type CatalogFetchRequest = {
  url: string;
  etag: string | null;
  env: NodeJS.ProcessEnv;
  followRedirects?: boolean;
};

export type CatalogFetchResponse = {
  status: number;
  etag: string | null;
  body: string;
};

export type CatalogFetchRunner = (request: CatalogFetchRequest) => Promise<CatalogFetchResponse> | CatalogFetchResponse;

export type CatalogSourceCacheMeta = {
  schema_version: 'opl_software_catalog_cache_meta.v1';
  source_id: string;
  source_ref: string;
  etag: string | null;
  fetched_at: string;
  index_sha256: string;
  package_count: number;
  counts_by_category: Record<string, number>;
};

export type CatalogSourceCacheStatus = {
  cached: boolean;
  stale: boolean;
  fetched_at: string | null;
  etag: string | null;
  package_count: number | null;
  index_sha256: string | null;
  counts_by_category: Record<string, number> | null;
};

export type CatalogPublicSummary = {
  owner_source_repo: string;
  display_name: string;
  display_name_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
};

function localizedSummary(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter(([locale, label]) =>
    ['zh', 'en', 'zh-CN', 'en-US'].includes(locale) && typeof label === 'string' && label.trim());
  return Object.fromEntries(entries) as Record<string, string>;
}

function publicSummary(value: unknown): CatalogPublicSummary | null {
  if (!isRecord(value) || typeof value.owner_source_repo !== 'string'
    || typeof value.display_name !== 'string' || !value.display_name.trim()) return null;
  return {
    owner_source_repo: value.owner_source_repo,
    display_name: value.display_name,
    display_name_i18n: localizedSummary(value.display_name_i18n),
    description_i18n: localizedSummary(value.description_i18n),
  };
}

export function readOfficialCatalogPublicSummaries(env: NodeJS.ProcessEnv = process.env) {
  const dir = softwareCatalogSourceDir(OFFICIAL_OPL_CATALOG_ID, env);
  const synced = dir && parseMeta(path.join(dir, 'meta.json'))?.source_ref === DEFAULT_OPL_CATALOG_INDEX_URL;
  const summaries = new Map<string, CatalogPublicSummary>();
  try {
    if (!synced) {
      const seed = resolveOfficialPackageCatalogSeedDir(env);
      if (!seed) return summaries;
      const index: unknown = JSON.parse(fs.readFileSync(path.join(seed, 'catalog-index.json'), 'utf8'));
      if (!isRecord(index) || index.catalog_id !== OFFICIAL_OPL_CATALOG_ID || !Array.isArray(index.packages)) return summaries;
      for (const entry of index.packages) {
        if (!isRecord(entry) || typeof entry.package_id !== 'string' || entry.visibility !== 'authorized_only') continue;
        const summary = publicSummary(entry.public_summary);
        if (summary) summaries.set(entry.package_id, summary);
      }
      return summaries;
    }
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'public-summaries.json'), 'utf8'));
    if (!isRecord(raw)) return summaries;
    for (const [id, value] of Object.entries(raw)) {
      const summary = publicSummary(value);
      if (summary) summaries.set(id, summary);
    }
    return summaries;
  } catch {
    return summaries;
  }
}

function catalogFailure(reasonCode: string, message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    reason_code: reasonCode,
    ...details,
  });
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Text(text: string): string {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function parseMeta(metaPath: string): CatalogSourceCacheMeta | null {
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as unknown;
    if (!isRecord(raw)
      || raw.schema_version !== 'opl_software_catalog_cache_meta.v1'
      || typeof raw.source_id !== 'string'
      || typeof raw.source_ref !== 'string'
      || typeof raw.fetched_at !== 'string'
      || !Number.isFinite(Date.parse(raw.fetched_at))
      || typeof raw.index_sha256 !== 'string'
      || !/^sha256:[0-9a-f]{64}$/.test(raw.index_sha256)
      || typeof raw.package_count !== 'number') {
      return null;
    }
    return raw as unknown as CatalogSourceCacheMeta;
  } catch {
    return null;
  }
}

export function readCatalogSourceCacheStatus(
  sourceId: string,
  env: NodeJS.ProcessEnv = process.env,
  now: () => Date = () => new Date(),
): CatalogSourceCacheStatus {
  const dir = softwareCatalogSourceDir(sourceId, env);
  if (!dir) {
    return {
      cached: false,
      stale: true,
      fetched_at: null,
      etag: null,
      package_count: null,
      index_sha256: null,
      counts_by_category: null,
    };
  }
  const meta = parseMeta(path.join(dir, 'meta.json'));
  const packagesDir = path.join(dir, 'packages');
  if (!meta || !fs.existsSync(packagesDir)) {
    return {
      cached: false,
      stale: true,
      fetched_at: null,
      etag: null,
      package_count: null,
      index_sha256: null,
      counts_by_category: null,
    };
  }
  const ageMs = now().getTime() - Date.parse(meta.fetched_at);
  return {
    cached: true,
    stale: !Number.isFinite(ageMs) || ageMs < 0 || ageMs >= CATALOG_CACHE_TTL_MS,
    fetched_at: meta.fetched_at,
    etag: meta.etag ?? null,
    package_count: meta.package_count,
    index_sha256: meta.index_sha256,
    counts_by_category: isRecord(meta.counts_by_category)
      ? meta.counts_by_category as Record<string, number>
      : null,
  };
}

function defaultCatalogFetch(request: CatalogFetchRequest): CatalogFetchResponse {
  let parsed: URL;
  try {
    parsed = new URL(request.url);
  } catch {
    catalogFailure('catalog_url_invalid', `Invalid catalog index URL: ${request.url}`);
  }
  if (parsed.protocol === 'file:') {
    const filePath = fileURLToPath(parsed);
    const body = fs.readFileSync(filePath, 'utf8');
    return { status: 200, etag: sha256Text(body), body };
  }
  if (parsed.protocol !== 'https:') {
    catalogFailure('catalog_url_invalid', 'Catalog index URL must use https:// or file://.');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-catalog-fetch-'));
  const headersPath = path.join(tmpDir, 'headers.txt');
  const bodyPath = path.join(tmpDir, 'body.json');
  try {
    const args = [
      '--disable',
      '--silent',
      '--show-error',
      ...(request.followRedirects === false ? [] : ['--location']),
      '--proto',
      '=https',
      '--connect-timeout',
      '5',
      '--max-time',
      '30',
      '--dump-header',
      headersPath,
      '--output',
      bodyPath,
      '--write-out',
      '%{http_code}',
      ...(request.etag ? ['--header', `If-None-Match: ${request.etag}`] : []),
      request.url,
    ];
    const result = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
      env: request.env,
      encoding: 'utf8',
      timeout: 32_000,
      maxBuffer: 1024 * 64,
    });
    if (result.error || result.status !== 0) {
      throw new FrameworkContractError('codex_command_failed', 'Failed to fetch software catalog index.', {
        reason_code: 'catalog_fetch_failed',
        source_ref: request.url,
        detail: result.error?.message || result.stderr || `exit_${result.status}`,
      });
    }
    const status = Number(result.stdout.trim());
    let responseEtag: string | null = null;
    if (fs.existsSync(headersPath)) {
      const headerText = fs.readFileSync(headersPath, 'utf8');
      for (const line of headerText.split(/\r?\n/)) {
        const match = /^etag:\s*(.+)$/i.exec(line.trim());
        if (match) responseEtag = match[1]!.trim();
      }
    }
    const body = status === 304 || !fs.existsSync(bodyPath) ? '' : fs.readFileSync(bodyPath, 'utf8');
    return { status, etag: responseEtag ?? request.etag, body };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function assertSafeRelativeRepoPath(value: unknown, expectedPrefix: string, label: string): string {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value) || value.includes('\0')) {
    catalogFailure('catalog_index_invalid', `Invalid ${label}.`);
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized !== value || !normalized.startsWith(expectedPrefix)) {
    catalogFailure('catalog_index_invalid', `Unsafe or misplaced ${label}: ${value}`);
  }
  return normalized;
}

function validateAndStageCatalog(
  source: SoftwareSource,
  indexText: string,
  etag: string | null,
  fetchedAt: string,
  stagingDir: string,
) {
  let index: unknown;
  try {
    index = JSON.parse(indexText);
  } catch {
    catalogFailure('catalog_index_invalid', 'Catalog index is not valid JSON.');
  }
  if (!isRecord(index)
    || index.schema_version !== 'opl_software_catalog_index.v1'
    || typeof index.catalog_id !== 'string'
    || !Array.isArray(index.packages)) {
    catalogFailure('catalog_index_invalid', 'Catalog index must declare opl_software_catalog_index.v1 schema and packages.');
  }
  const official = source.provider_id === 'public_registry' && source.source_id === OFFICIAL_OPL_CATALOG_ID;
  if (official && (index.catalog_id !== OFFICIAL_OPL_CATALOG_ID || index.catalog_repo !== 'https://github.com/gaofeng21cn/opl-catalog.git')) {
    catalogFailure('catalog_source_identity_mismatch', 'The official OPL catalog index declares a different source.');
  }

  const packagesRoot = path.join(stagingDir, 'packages');
  const allowlistsRoot = path.join(stagingDir, 'allowlists');
  for (const subdir of [...PACKAGE_CATEGORY_SUBDIRS, 'payloads']) {
    fs.mkdirSync(path.join(packagesRoot, subdir), { recursive: true });
  }
  fs.mkdirSync(allowlistsRoot, { recursive: true });

  const seenIds = new Set<string>();
  const summaries = new Map<string, CatalogPublicSummary>();
  const countsByCategory: Record<string, number> = Object.fromEntries(
    PACKAGE_CATEGORY_SUBDIRS.map((category) => [category, 0]),
  );

  for (const entry of index.packages) {
    if (!isRecord(entry)
      || typeof entry.package_id !== 'string'
      || !/^[a-z0-9][a-z0-9.-]*$/.test(entry.package_id)
      || typeof entry.category !== 'string'
      || !isPackageCategorySubdir(entry.category)
      || typeof entry.manifest_sha256 !== 'string'
      || !isRecord(entry.manifest)) {
      catalogFailure('catalog_index_invalid', 'Catalog package entry is malformed.');
    }
    if (seenIds.has(entry.package_id)) {
      catalogFailure('catalog_index_invalid', `Duplicate package_id in catalog index: ${entry.package_id}`);
    }
    seenIds.add(entry.package_id);
    if (entry.manifest.package_id !== entry.package_id) {
      catalogFailure('catalog_index_invalid', `Manifest package_id mismatch for ${entry.package_id}.`);
    }
    const softwareType = entry.category === 'dependencies' ? 'dependency' : entry.category.slice(0, -1);
    if (entry.software_type !== softwareType || !isRecord(entry.manifest.presentation)
      || entry.manifest.presentation.software_type !== softwareType
      || entry.version !== entry.manifest.version || entry.visibility !== (entry.manifest.visibility ?? 'public')) {
      catalogFailure('catalog_index_invalid', `Manifest and catalog entry disagree for ${entry.package_id}.`);
    }
    if (official && entry.visibility === 'authorized_only' && entry.public_summary !== undefined) {
      const summary = publicSummary(entry.public_summary);
      if (!summary || summary.owner_source_repo !== entry.manifest.source_repo) {
        catalogFailure('catalog_index_invalid', `Invalid public summary owner for ${entry.package_id}.`);
      }
      summaries.set(entry.package_id, summary);
    }

    const expectedManifestPath = `packages/${entry.category}/${entry.package_id}.json`;
    const manifestPathRel = assertSafeRelativeRepoPath(entry.manifest_path, `packages/${entry.category}/`, 'manifest_path');
    if (manifestPathRel !== expectedManifestPath) {
      catalogFailure('catalog_index_invalid', `Unexpected manifest_path ${manifestPathRel} for ${entry.package_id}.`);
    }
    const manifestText = canonicalJson(entry.manifest);
    if (sha256Text(manifestText) !== entry.manifest_sha256) {
      catalogFailure('catalog_digest_mismatch', `Manifest SHA-256 mismatch for ${entry.package_id}.`, {
        package_id: entry.package_id,
      });
    }
    fs.writeFileSync(path.join(stagingDir, manifestPathRel), manifestText, 'utf8');
    countsByCategory[entry.category] = (countsByCategory[entry.category] ?? 0) + 1;

    if (entry.payload !== undefined && entry.payload !== null) {
      if (!isRecord(entry.payload) || typeof entry.payload_sha256 !== 'string') {
        catalogFailure('catalog_index_invalid', `Payload metadata invalid for ${entry.package_id}.`);
      }
      const payloadRel = assertSafeRelativeRepoPath(entry.payload_path, 'packages/payloads/', 'payload_path');
      const payloadRef = isRecord(entry.manifest.codex_surface) ? entry.manifest.codex_surface.plugin_payload_manifest_url : null;
      if (typeof payloadRef !== 'string' || payloadRel !== `packages/${payloadRef}` || fs.existsSync(path.join(stagingDir, payloadRel))) {
        catalogFailure('catalog_index_invalid', `Unexpected payload path for ${entry.package_id}.`);
      }
      const payloadText = canonicalJson(entry.payload);
      if (sha256Text(payloadText) !== entry.payload_sha256) {
        catalogFailure('catalog_digest_mismatch', `Payload SHA-256 mismatch for ${entry.package_id}.`, {
          package_id: entry.package_id,
        });
      }
      fs.writeFileSync(path.join(stagingDir, payloadRel), payloadText, 'utf8');
    }

    if (entry.allowlist !== undefined && entry.allowlist !== null) {
      if (!isRecord(entry.allowlist) || typeof entry.allowlist_sha256 !== 'string') {
        catalogFailure('catalog_index_invalid', `Allowlist metadata invalid for ${entry.package_id}.`);
      }
      const allowlistRel = assertSafeRelativeRepoPath(entry.allowlist_path, 'allowlists/', 'allowlist_path');
      if (allowlistRel !== `allowlists/${entry.package_id}.json` || entry.allowlist.package_id !== entry.package_id) {
        catalogFailure('catalog_index_invalid', `Unexpected allowlist owner or path for ${entry.package_id}.`);
      }
      const allowlistText = canonicalJson(entry.allowlist);
      if (sha256Text(allowlistText) !== entry.allowlist_sha256) {
        catalogFailure('catalog_digest_mismatch', `Allowlist SHA-256 mismatch for ${entry.package_id}.`, {
          package_id: entry.package_id,
        });
      }
      fs.writeFileSync(path.join(stagingDir, allowlistRel), allowlistText, 'utf8');
    }
  }
  if (index.package_count !== seenIds.size) catalogFailure('catalog_index_invalid', 'Package count differs from catalog entries.');
  fs.writeFileSync(path.join(stagingDir, 'public-summaries.json'), canonicalJson(Object.fromEntries(summaries)), 'utf8');

  const meta: CatalogSourceCacheMeta = {
    schema_version: 'opl_software_catalog_cache_meta.v1',
    source_id: source.source_id,
    source_ref: source.source_ref,
    etag: etag ?? sha256Text(indexText),
    fetched_at: fetchedAt,
    index_sha256: sha256Text(indexText),
    package_count: seenIds.size,
    counts_by_category: countsByCategory,
  };
  fs.writeFileSync(path.join(stagingDir, 'meta.json'), canonicalJson(meta), 'utf8');
  return meta;
}

export async function refreshCatalogSource(
  source: SoftwareSource,
  env: NodeJS.ProcessEnv = process.env,
  options: { now?: () => Date; catalogFetch?: CatalogFetchRunner } = {},
) {
  const now = options.now ?? (() => new Date());
  const sourceRoot = softwareCatalogSourceRoot(source.source_id, env);
  const requestedGeneration = softwareCatalogSourceDir(source.source_id, env);
  if (!requestedGeneration || !sourceRoot) {
    catalogFailure('catalog_state_dir_unavailable', 'State directory is required to cache catalog sources.');
  }
  const existingMeta = parseMeta(path.join(requestedGeneration, 'meta.json'));
  const official = source.provider_id === 'public_registry' && source.source_id === OFFICIAL_OPL_CATALOG_ID;
  if (official && source.source_ref !== DEFAULT_OPL_CATALOG_INDEX_URL) {
    catalogFailure('catalog_source_identity_mismatch', 'The official OPL catalog requires the built-in source URL.');
  }
  const matchingMeta = existingMeta?.source_ref === source.source_ref ? existingMeta : null;
  const fetcher = options.catalogFetch ?? defaultCatalogFetch;
  const response = await fetcher({
    url: source.source_ref,
    etag: matchingMeta?.etag ?? null,
    env,
    followRedirects: !official,
  });
  if (softwareCatalogSourceDir(source.source_id, env) !== requestedGeneration) {
    throw new FrameworkContractError('codex_command_failed', 'Catalog source changed during refresh. Retry against the current generation.', {
      reason_code: 'catalog_refresh_changed', source_id: source.source_id,
    });
  }

  if (response.status === 304 && matchingMeta && fs.existsSync(path.join(requestedGeneration, 'packages'))) {
    const updatedMeta: CatalogSourceCacheMeta = {
      ...matchingMeta,
      fetched_at: now().toISOString(),
    };
    const tmpMeta = path.join(requestedGeneration, `.meta.${process.pid}.${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(tmpMeta, canonicalJson(updatedMeta), 'utf8');
    fs.renameSync(tmpMeta, path.join(requestedGeneration, 'meta.json'));
    return {
      source_id: source.source_id,
      not_modified: true,
      cache_dir: requestedGeneration,
      meta: updatedMeta,
    };
  }

  if (response.status !== 200 || !response.body.trim()) {
    throw new FrameworkContractError('codex_command_failed', `Catalog source returned HTTP ${response.status}.`, {
      reason_code: 'catalog_fetch_failed',
      source_id: source.source_id,
      source_ref: source.source_ref,
      http_status: response.status,
    });
  }

  fs.mkdirSync(sourceRoot, { recursive: true });
  const generation = `generation-${crypto.randomUUID()}`;
  const nextDir = path.join(sourceRoot, generation);
  const pointer = path.join(sourceRoot, 'current');
  const lock = path.join(sourceRoot, '.refresh-lock');
  const nextPointer = path.join(sourceRoot, `.current-${crypto.randomUUID()}`);
  fs.mkdirSync(lock);
  let published = false;
  try {
    if (softwareCatalogSourceDir(source.source_id, env) !== requestedGeneration) {
      catalogFailure('catalog_refresh_changed', 'Catalog source changed during refresh. Retry against the current generation.');
    }
    fs.mkdirSync(nextDir);
    const meta = validateAndStageCatalog(
      source,
      response.body,
      response.etag,
      now().toISOString(),
      nextDir,
    );
    fs.writeFileSync(nextPointer, `${generation}\n`, { flag: 'wx' });
    fs.renameSync(nextPointer, pointer);
    published = true;
    for (const name of fs.readdirSync(sourceRoot)) {
      if (name === generation || !/^generation-[0-9a-f-]{36}$/.test(name)) continue;
      const previous = path.join(sourceRoot, name);
      const modified = fs.statSync(previous, { throwIfNoEntry: false })?.mtimeMs;
      if (modified !== undefined && Date.now() - modified > 24 * CATALOG_CACHE_TTL_MS) {
        try { fs.rmSync(previous, { recursive: true, force: true }); } catch { /* Current generation is already durable. */ }
      }
    }
    return {
      source_id: source.source_id,
      not_modified: false,
      cache_dir: nextDir,
      meta,
    };
  } finally {
    if (!published) fs.rmSync(nextDir, { recursive: true, force: true });
    fs.rmSync(nextPointer, { force: true });
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

export function removeCatalogSourceCache(
  sourceId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const targetDir = softwareCatalogSourceRoot(sourceId, env);
  if (targetDir && fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}
