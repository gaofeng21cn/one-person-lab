import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import semver from 'semver';

export interface DependencyReleaseSource {
  kind: 'npm' | 'github-release' | 'json-manifest' | 'git-default' | 'node-index' | 'go-index';
  url?: string;
  repository?: string;
  package?: string;
  dist_tag?: string;
  asset?: string;
  asset_pattern?: string;
  version_prefix?: string;
  version_path?: string;
  platforms?: Record<string, string>;
  platform_optional_dependency?: string;
  source_commit_required?: boolean;
  install_metadata?: Record<string, unknown>;
}

export interface DependencyReleasePolicy {
  schema_version: string;
  sources: Record<string, DependencyReleaseSource>;
  first_party_source?: DependencyReleaseSource;
}

export interface ResolvedDependencyRelease {
  dependency_id: string;
  version: string;
  source_ref: string;
  resolved_commit?: string;
  archive_url?: string;
  archive_sha256?: string;
  archive_size_bytes?: number;
  npm_integrity?: string;
  platform: string;
  architecture: string;
  install_metadata: Record<string, unknown>;
}

export interface DependencyReleaseResolutionOptions {
  platform?: string;
  architecture?: string;
  fetch?: typeof globalThis.fetch;
  policy?: DependencyReleasePolicy;
  source?: DependencyReleaseSource;
  verifyArchive?: boolean;
  timeoutMs?: number;
  /** Disposable archive bytes only; release metadata is always resolved fresh. */
  archiveCacheDir?: string;
  /** Injectable authenticated GitHub metadata transport, never used for archive bytes. */
  githubApi?: (endpoint: string) => Promise<unknown>;
}

type Json = Record<string, any>;
const policyUrl = new URL('../../../contracts/opl-framework/dependency-release-sources.json', import.meta.url);

export function readDependencyReleasePolicy(): DependencyReleasePolicy {
  return JSON.parse(fs.readFileSync(policyUrl, 'utf8')) as DependencyReleasePolicy;
}

/** Compare stable versions without making a newer local installation an update target. */
export function compareDependencyVersions(installed: string, target: string): number {
  const left = semver.valid(installed.trim().replace(/^v/, ''));
  const right = semver.valid(target.trim().replace(/^v/, ''));
  if (!left || !right) throw new Error(`Cannot compare dependency versions: ${installed}, ${target}`);
  return semver.compare(left, right);
}

function stableVersion(value: unknown, prefix = 'v'): string {
  const version = String(value ?? '').replace(new RegExp(`^${prefix}`), '');
  if (!semver.valid(version) || semver.prerelease(version)) throw new Error(`Source did not publish a stable version: ${version}`);
  return version;
}

function substitutions(platform: string, architecture: string, version = ''): Record<string, string> {
  return {
    version, platform, architecture,
    go_arch: architecture === 'x64' ? 'amd64' : architecture,
    rust_arch: architecture === 'arm64' ? 'aarch64' : architecture === 'x64' ? 'x86_64' : architecture,
    rust_target: platform === 'darwin' ? 'apple-darwin' : platform === 'linux' ? 'unknown-linux-gnu' : 'pc-windows-msvc',
    office_platform: platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : platform,
    exe_suffix: platform === 'win32' ? '.exe' : '',
  };
}

function expand(value: string, fields: Record<string, string>): string {
  return value.replace(/\{([^}]+)\}/g, (_, key: string) => {
    if (!(key in fields)) throw new Error(`Unknown dependency source placeholder: ${key}`);
    return fields[key]!;
  });
}

function httpsUrl(value: unknown): string {
  const url = new URL(String(value ?? ''));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Dependency sources must use credential-free HTTPS URLs.');
  return url.href;
}

async function response(url: string, options: DependencyReleaseResolutionOptions): Promise<Response> {
  const result = await (options.fetch ?? globalThis.fetch)(httpsUrl(url), {
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
    headers: { 'User-Agent': 'OPL-Dependency-Resolver', Accept: 'application/json' },
  });
  if (!result.ok) throw new Error(`Dependency source request failed (${result.status}): ${new URL(url).origin}${new URL(url).pathname}`);
  return result;
}

async function json(url: string, options: DependencyReleaseResolutionOptions): Promise<Json> {
  return await (await response(url, options)).json() as Json;
}

async function github(endpoint: string, options: DependencyReleaseResolutionOptions): Promise<Json> {
  if (options.githubApi) return await options.githubApi(endpoint) as Json;
  // Reuse the native platform's authenticated read-only transport where available.
  // Tests with an injected fetch never use local credentials or child processes.
  if (!options.fetch) {
    try {
      return JSON.parse(execFileSync('gh', ['api', endpoint], {
        encoding: 'utf8', timeout: options.timeoutMs ?? 120_000,
        maxBuffer: 24 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      })) as Json;
    } catch { /* Public API remains available without a gh installation. */ }
  }
  return json(`https://api.github.com/${endpoint}`, options);
}

function sha256(value: unknown): string | undefined {
  const digest = String(value ?? '').replace(/^sha256:/, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? digest : undefined;
}

export function dependencyArchiveCachePath(url: string, cacheDir: string): string {
  return path.join(cacheDir, `${createHash('sha256').update(httpsUrl(url)).digest('hex')}.archive`);
}

async function fingerprint(
  url: string, expectedSha: string | undefined, expectedSize: number | undefined,
  integrity: string | undefined, options: DependencyReleaseResolutionOptions, outputFile?: string,
): Promise<{ archive_sha256: string; archive_size_bytes?: number }> {
  if (!outputFile && options.verifyArchive === false && expectedSha) {
    return { archive_sha256: expectedSha, ...(expectedSize === undefined ? {} : { archive_size_bytes: expectedSize }) };
  }
  const sriToken = integrity?.split(/\s+/).find((entry) => /^(sha512|sha384|sha256|sha1)-/.test(entry));
  const sriAlgorithm = sriToken?.split('-')[0];
  const cacheDir = options.archiveCacheDir ?? process.env.OPL_DEPENDENCY_ARCHIVE_CACHE_DIR;
  const cacheFile = cacheDir ? dependencyArchiveCachePath(url, cacheDir) : undefined;
  const outputTemp = outputFile ? `${outputFile}.${randomUUID()}.partial` : undefined;
  if (outputFile) fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  let cacheTemp: string | undefined;
  if (cacheFile) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      cacheTemp = `${cacheFile}.${randomUUID()}.partial`;
    } catch { /* An unavailable cache cannot prevent a verified download. */ }
  }
  const consume = async (chunks: AsyncIterable<Uint8Array>, sink?: string) => {
    const hash = createHash('sha256');
    const sriHash = sriAlgorithm ? createHash(sriAlgorithm) : undefined;
    let size = 0;
    let fd: number | undefined;
    try {
      if (sink) {
        try { fd = fs.openSync(sink, 'wx', outputFile ? 0o644 : 0o600); }
        catch (error) { if (outputFile) throw error; }
      }
      for await (const chunk of chunks) {
        hash.update(chunk); sriHash?.update(chunk); size += chunk.byteLength;
        if (fd !== undefined) {
          try { fs.writeFileSync(fd, chunk); }
          catch (error) {
            fs.closeSync(fd); fd = undefined;
            if (outputFile) throw error;
            if (sink) { try { fs.rmSync(sink, { force: true }); } catch { /* Disposable partial cache file. */ } }
          }
        }
      }
    } finally { if (fd !== undefined) fs.closeSync(fd); }
    const digest = hash.digest('hex');
    if (expectedSha && expectedSha !== digest) throw new Error('Dependency archive SHA-256 does not match its official source.');
    if (expectedSize !== undefined && expectedSize !== size) throw new Error('Dependency archive size does not match its official source.');
    if (sriToken && `${sriAlgorithm}-${sriHash!.digest('base64')}` !== sriToken) throw new Error('Dependency npm tarball integrity does not match its registry metadata.');
    return { archive_sha256: digest, archive_size_bytes: size };
  };
  try {
    // Fresh official SHA/SRI is required for a hit; a URL alone is no authority.
    if (cacheFile && (expectedSha || sriToken)) {
      try {
        if (fs.lstatSync(cacheFile).isFile()) {
          const result = await consume(fs.createReadStream(cacheFile), outputTemp);
          if (outputFile) fs.renameSync(outputTemp!, outputFile);
          return result;
        }
      } catch { if (outputTemp) fs.rmSync(outputTemp, { force: true }); }
    }
    const result = await response(url, options);
    if (!result.body) throw new Error('Dependency archive has no response body.');
    const verified = await consume(result.body as unknown as AsyncIterable<Uint8Array>, outputTemp ?? cacheTemp);
    if (outputFile) fs.renameSync(outputTemp!, outputFile);
    if (cacheTemp && cacheFile) {
      try {
        if (outputFile) fs.copyFileSync(outputFile, cacheTemp);
        if (fs.existsSync(cacheTemp)) fs.renameSync(cacheTemp, cacheFile);
      } catch { /* Cache persistence is optional after successful verification. */ }
    }
    return verified;
  } finally {
    for (const file of [outputTemp, cacheTemp]) {
      if (file) { try { fs.rmSync(file, { force: true }); } catch { /* Cleanup must not replace a verification result. */ } }
    }
  }
}

/** Consume frozen identity without resolving a new release or selecting a version. */
export async function fetchDependencyArchive(url: string, expectedSha256: string, outputFile: string,
  options: DependencyReleaseResolutionOptions = {}) {
  if (!sha256(expectedSha256)) throw new Error('A frozen archive SHA-256 is required.');
  return fingerprint(httpsUrl(url), sha256(expectedSha256), undefined, undefined, options, path.resolve(outputFile));
}

async function npmArtifact(packageName: string, selector: string, options: DependencyReleaseResolutionOptions): Promise<Json> {
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(selector)}`;
  const data = await json(metadataUrl, options);
  if (!data.version || !data.dist?.tarball || !data.dist?.integrity) throw new Error('npm source is missing version, tarball or integrity.');
  const archiveUrl = httpsUrl(data.dist.tarball);
  const bytes = await fingerprint(archiveUrl, sha256(data.dist.sha256), undefined, data.dist.integrity, options);
  return { package: packageName, version: data.version, tarball_url: archiveUrl, tarball_sha256: bytes.archive_sha256,
    tarball_size_bytes: bytes.archive_size_bytes, npm_integrity: data.dist.integrity, source_ref: metadataUrl, metadata: data };
}

async function resolveNpm(source: DependencyReleaseSource, options: DependencyReleaseResolutionOptions, platform: string, architecture: string): Promise<Partial<ResolvedDependencyRelease>> {
  if (!source.package) throw new Error('npm dependency source is missing package identity.');
  const artifact = await npmArtifact(source.package, source.dist_tag ?? 'latest', options);
  const version = stableVersion(artifact.version, '');
  let resolvedCommit: string | undefined;
  if (source.source_commit_required) {
    if (!source.repository || !/^[a-f0-9]{40}$/.test(artifact.metadata.gitHead ?? '')) throw new Error('npm release is missing its required source commit.');
    const commit = await github(`repos/${source.repository}/commits/${artifact.metadata.gitHead}`, options);
    if (commit.sha !== artifact.metadata.gitHead) throw new Error('npm source commit does not belong to the configured repository.');
    resolvedCommit = commit.sha;
  }
  const install: Json = { ...source.install_metadata, npm: Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== 'metadata')) };
  if (source.platform_optional_dependency) {
    const key = expand(source.platform_optional_dependency, substitutions(platform, architecture));
    const spec = artifact.metadata.optionalDependencies?.[key];
    if (!spec) throw new Error(`npm release has no platform dependency for ${platform}/${architecture}.`);
    const alias = /^npm:(.+)@([^@]+)$/.exec(spec);
    const packageName = alias ? alias[1]! : key;
    const selector = alias ? alias[2]! : spec;
    // Only an exact platform package tied to the selected base version may be frozen.
    if (!semver.valid(selector) || !selector.startsWith(`${version}-`)) throw new Error('npm platform dependency is not an exact release matching the base package.');
    const platformArtifact = await npmArtifact(packageName, selector, options);
    if (platformArtifact.version !== selector) throw new Error('npm platform dependency did not resolve the selected exact version.');
    install.npm_platform = Object.fromEntries(Object.entries(platformArtifact).filter(([entry]) => entry !== 'metadata'));
  }
  return { version, source_ref: artifact.source_ref, ...(resolvedCommit ? { resolved_commit: resolvedCommit } : {}), archive_url: artifact.tarball_url,
    archive_sha256: artifact.tarball_sha256, archive_size_bytes: artifact.tarball_size_bytes,
    npm_integrity: artifact.npm_integrity, install_metadata: install };
}

async function resolveGithub(source: DependencyReleaseSource, options: DependencyReleaseResolutionOptions, platform: string, architecture: string): Promise<Partial<ResolvedDependencyRelease>> {
  if (!source.repository) throw new Error('GitHub dependency source is missing repository identity.');
  const release = await github(`repos/${source.repository}/releases/latest`, options);
  if (release.prerelease || release.draft || !release.tag_name) throw new Error('GitHub latest source did not return a published stable release.');
  let version: string;
  let asset: Json | undefined;
  const assets: Json[] = release.assets ?? [];
  if (source.asset_pattern) {
    const pattern = new RegExp(expand(source.asset_pattern, substitutions(platform, architecture)));
    const matches = assets.flatMap((entry) => {
      const match = pattern.exec(entry.name);
      return match?.groups?.version && semver.valid(match.groups.version) && !semver.prerelease(match.groups.version)
        ? [{ asset: entry, version: match.groups.version }] : [];
    }).sort((left, right) => semver.rcompare(left.version, right.version));
    if (!matches[0]) throw new Error(`Release has no stable platform archive for ${platform}/${architecture}.`);
    ({ asset, version } = matches[0]);
  } else {
    version = stableVersion(release.tag_name, source.version_prefix ?? 'v');
    const name = expand(source.asset ?? '', substitutions(platform, architecture, version));
    asset = assets.find((entry) => entry.name === name);
  }
  if (!asset?.browser_download_url) throw new Error(`Release has no selected platform archive for ${platform}/${architecture}.`);
  const archiveUrl = httpsUrl(asset.browser_download_url);
  let resolvedCommit: string | undefined;
  if (source.source_commit_required) {
    const commit = await github(`repos/${source.repository}/commits/${encodeURIComponent(release.tag_name)}`, options);
    if (!/^[a-f0-9]{40}$/.test(commit.sha ?? '')) throw new Error('GitHub release tag is missing its required source commit.');
    resolvedCommit = commit.sha;
  }
  const bytes = await fingerprint(archiveUrl, sha256(asset.digest), typeof asset.size === 'number' ? asset.size : undefined, undefined, options);
  return { version, source_ref: release.html_url ?? `https://github.com/${source.repository}/releases/tag/${release.tag_name}`, ...(resolvedCommit ? { resolved_commit: resolvedCommit } : {}),
    archive_url: archiveUrl, ...bytes,
    install_metadata: { ...source.install_metadata, release_tag: release.tag_name, asset_name: asset.name } };
}

async function resolveManifest(source: DependencyReleaseSource, options: DependencyReleaseResolutionOptions, platform: string, architecture: string): Promise<Partial<ResolvedDependencyRelease>> {
  const manifestUrl = httpsUrl(source.url);
  const data = await json(manifestUrl, options);
  const version = stableVersion(data.version, '');
  const key = source.platforms?.[`${platform}-${architecture}`];
  if (!key || !data[key]?.url || !sha256(data[key]?.sha256)) throw new Error(`Manifest has no authenticated archive for ${platform}/${architecture}.`);
  const archive = data[key];
  const archiveUrl = httpsUrl(archive.url);
  if (new URL(archiveUrl).origin !== new URL(manifestUrl).origin) throw new Error('Manifest archive origin differs from its configured official origin.');
  const bytes = await fingerprint(archiveUrl, sha256(archive.sha256), archive.size_bytes, undefined, options);
  return { version, source_ref: manifestUrl, archive_url: archiveUrl, ...bytes,
    install_metadata: { ...source.install_metadata, ...(archive.team_id ? { team_id: archive.team_id } : {}) } };
}

async function resolveGit(source: DependencyReleaseSource, options: DependencyReleaseResolutionOptions): Promise<Partial<ResolvedDependencyRelease>> {
  if (!source.repository) throw new Error('Git source is missing repository identity.');
  const repository = await github(`repos/${source.repository}`, options);
  if (!repository.default_branch) throw new Error('Git source has no authoritative default branch.');
  const commit = await github(`repos/${source.repository}/commits/${encodeURIComponent(repository.default_branch)}`, options);
  if (!/^[a-f0-9]{40}$/.test(commit.sha ?? '')) throw new Error('Git source did not resolve an immutable commit.');
  const manifest = await github(`repos/${source.repository}/contents/${source.version_path ?? 'package.json'}?ref=${commit.sha}`, options);
  const data = JSON.parse(Buffer.from(manifest.content, 'base64').toString('utf8'));
  return { version: stableVersion(data.version, ''), source_ref: `https://github.com/${source.repository}/commit/${commit.sha}`,
    resolved_commit: commit.sha, archive_url: `https://github.com/${source.repository}/archive/${commit.sha}.tar.gz`,
    install_metadata: { ...source.install_metadata, repository: source.repository, branch: repository.default_branch } };
}

async function resolveIndex(source: DependencyReleaseSource, options: DependencyReleaseResolutionOptions, platform: string, architecture: string): Promise<Partial<ResolvedDependencyRelease>> {
  const sourceUrl = httpsUrl(source.url);
  const entries = await (await response(sourceUrl, options)).json() as Json[];
  if (!Array.isArray(entries)) throw new Error('Dependency index must be an array.');
  if (source.kind === 'node-index') {
    const eligible = entries.filter((entry) => semver.valid(String(entry.version).replace(/^v/, '')) && !semver.prerelease(String(entry.version).replace(/^v/, '')))
      .sort((a, b) => semver.rcompare(String(a.version).replace(/^v/, ''), String(b.version).replace(/^v/, '')));
    const release = eligible[0];
    if (!release) throw new Error('Node index has no stable release.');
    const version = stableVersion(release.version);
    const file = `node-v${version}-${platform === 'win32' ? 'win' : platform}-${architecture}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
    const base = `https://nodejs.org/dist/v${version}`;
    const sums = await (await response(`${base}/SHASUMS256.txt`, options)).text();
    const digest = sums.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((fields) => fields[1] === file)?.[0];
    if (!sha256(digest)) throw new Error('Node official checksums omit the selected archive.');
    return { version, source_ref: `${base}/SHASUMS256.txt`, archive_url: `${base}/${file}`,
      ...await fingerprint(`${base}/${file}`, digest, undefined, undefined, options), install_metadata: { ...source.install_metadata, archive_name: file } };
  }
  const releases = entries.filter((entry) => /^go\d+\.\d+(?:\.\d+)?$/.test(entry.version)).sort((a, b) =>
    semver.rcompare(semver.coerce(a.version)!, semver.coerce(b.version)!));
  const release = releases[0];
  const file = release?.files?.find((entry: Json) => entry.os === (platform === 'win32' ? 'windows' : platform)
    && entry.arch === (architecture === 'x64' ? 'amd64' : architecture) && entry.kind === 'archive');
  if (!file || !sha256(file.sha256)) throw new Error('Go index has no selected stable platform archive.');
  const archiveUrl = `https://go.dev/dl/${file.filename}`;
  return { version: semver.coerce(release.version)!.version, source_ref: sourceUrl, archive_url: archiveUrl,
    ...await fingerprint(archiveUrl, file.sha256, file.size, undefined, options), install_metadata: source.install_metadata ?? {} };
}

export async function resolveDependencyRelease(dependencyId: string, options: DependencyReleaseResolutionOptions = {}): Promise<ResolvedDependencyRelease> {
  const policy = options.policy ?? readDependencyReleasePolicy();
  const source = options.source ?? policy.sources[dependencyId];
  if (!source) throw new Error(`No authoritative release source configured for dependency ${dependencyId}.`);
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;
  let result: Partial<ResolvedDependencyRelease>;
  if (source.kind === 'npm') result = await resolveNpm(source, options, platform, architecture);
  else if (source.kind === 'github-release') result = await resolveGithub(source, options, platform, architecture);
  else if (source.kind === 'json-manifest') result = await resolveManifest(source, options, platform, architecture);
  else if (source.kind === 'git-default') {
    result = await resolveGit(source, options);
    if (result.archive_url) Object.assign(result, await fingerprint(result.archive_url, undefined, undefined, undefined, options));
  } else result = await resolveIndex(source, options, platform, architecture);
  if (!result.version || !result.source_ref) throw new Error('Dependency resolution produced an incomplete identity.');
  return Object.freeze({ dependency_id: dependencyId, platform, architecture, install_metadata: {}, ...result }) as ResolvedDependencyRelease;
}

export async function resolveDependencyReleases(dependencyIds: string[], options: DependencyReleaseResolutionOptions = {}): Promise<ResolvedDependencyRelease[]> {
  if (new Set(dependencyIds).size !== dependencyIds.length) throw new Error('An operation must resolve each dependency identity only once.');
  // Freeze one source-policy snapshot for the operation; failures never reuse older targets.
  const policy = options.policy ?? readDependencyReleasePolicy();
  return Promise.all(dependencyIds.map((id) => resolveDependencyRelease(id, { ...options, policy })));
}

/** Location helper for thin synchronous legacy consumers; discovery remains in this module. */
export function dependencyReleaseResolverCliPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/resolve-dependency-releases.mjs');
}
