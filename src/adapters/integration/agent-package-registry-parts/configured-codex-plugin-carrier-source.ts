import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { runtimeRootContainsDescriptor } from '../../../kernel/git-marketplace-runtime-root.ts';
import { extractPackageSourceArchive, packageSourceArchiveMembersStayWithinRoot, readPackageSourceArchiveEntries } from './package-source-archive.ts';
import { localReadbackFailure, runConfiguredDownloadWithTransientRetry, stringValue } from './configured-codex-plugin-carrier-native.ts';

const PREFIX = 'application/vnd.onepersonlab.package.';
const MAX_BYTES = 128 * 1024 * 1024;
const digest = (bytes: Buffer) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function invalid(message: string): never {
  return localReadbackFailure('configured_codex_plugin_carrier_source_invalid', message);
}

function download(url: string, env: NodeJS.ProcessEnv, token?: string) {
  const result = runConfiguredDownloadWithTransientRetry(() => {
    const response = spawnSync('curl', [
      '--fail', '--silent', '--show-error', '--location', '--proto', '=https',
      '--ipv4',
      '--connect-timeout', '10', '--max-time', '120', '--max-filesize', String(MAX_BYTES),
      ...(token ? ['-H', `Authorization: Bearer ${token}`] : []),
      '-H', 'Accept: application/vnd.oci.image.manifest.v1+json', url,
    ], { env, maxBuffer: MAX_BYTES });
    return { status: response.status, stdout: response.stdout ?? Buffer.alloc(0),
      stderr: response.stderr?.toString('utf8') ?? '', error: response.error ?? null };
  });
  if (result.status !== 0 || result.error) {
    // Never put an anonymous registry token or curl argv into diagnostics.
    return localReadbackFailure('configured_codex_plugin_carrier_source_download_failed',
      'The selected Package source artifact could not be downloaded.',
      { exit_status: result.status, attempt_count: result.attemptCount });
  }
  return result.stdout;
}

function developerCheckoutRoot(packageId: string, owner: Record<string, unknown>, env: NodeJS.ProcessEnv) {
  if (env.OPL_MODULE_SOURCE_MODE?.trim() !== 'git_checkout') return null;
  const repo = stringValue(owner.source_repo);
  if (!repo) return null;
  let repoName: string;
  try {
    repoName = path.basename(new URL(repo).pathname.replace(/\/$/, '').replace(/\.git$/, ''));
  } catch {
    return null;
  }
  const envKeys = new Set([
    `OPL_MODULE_PATH_${packageId.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`,
    `OPL_MODULE_PATH_${repoName.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`,
    ...(packageId === 'mas' ? ['OPL_MODULE_PATH_MEDAUTOSCIENCE'] : []),
    ...(packageId === 'mas-scholar-skills'
      ? ['OPL_MODULE_PATH_SCHOLARSKILLS', 'OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS', 'OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT']
      : []),
  ]);
  for (const key of envKeys) {
    const candidate = stringValue(env[key]);
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(path.join(resolved, 'opl-package.json'))
      && fs.existsSync(path.join(resolved, '.agents', 'plugins', 'marketplace.json'))) {
      return resolved;
    }
  }
  return null;
}

function acquireDeveloperCheckoutSource(input: {
  packageId: string;
  ownerManifest: Record<string, unknown>;
  payload: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
}) {
  const sourceRoot = developerCheckoutRoot(input.packageId, input.ownerManifest, input.env);
  if (!sourceRoot) return null;
  const surface = isRecord(input.ownerManifest.codex_surface) ? input.ownerManifest.codex_surface : null;
  const carrier = isRecord(surface?.configured_codex_plugin_carrier)
    ? surface.configured_codex_plugin_carrier : null;
  const pluginId = stringValue(carrier?.plugin_selector)?.split('@')[0]
    ?? stringValue(surface?.plugin_id);
  const ownerDescriptor = path.join(sourceRoot, 'opl-package.json');
  const ownerBytes = fs.readFileSync(ownerDescriptor);
  const sourceOwner = json(ownerBytes);
  if (sourceOwner.package_id !== input.packageId
    || sourceOwner.version !== input.ownerManifest.version
    || (pluginId && isRecord(sourceOwner.codex_surface)
      && sourceOwner.codex_surface.plugin_id !== pluginId)) {
    return invalid('Developer checkout does not match the selected Package owner.');
  }
  const sourceCommit = stringValue(input.payload.source_commit)
    ?? stringValue(surface?.carrier_source_commit);
  if (!sourceCommit || !/^[0-9a-f]{40}$/.test(sourceCommit)) {
    return invalid('Developer checkout source commit is missing or invalid.');
  }
  return {
    sourceRoot,
    provenance: {
      source: sourceRoot,
      source_type: 'developer_git_checkout',
      source_commit: sourceCommit,
    },
    cleanup: () => {},
    pathFor: (url: URL) => {
      if (url.protocol !== 'https:' || url.hostname !== 'raw.githubusercontent.com') {
        return invalid('Developer checkout carrier file source is invalid.');
      }
      const expectedPrefix = `${new URL(String(input.ownerManifest.source_repo)).pathname.replace(/\.git$/, '')}/${sourceCommit}/`;
      if (!url.pathname.startsWith(expectedPrefix)) {
        return invalid('Developer checkout carrier file does not belong to the selected commit.');
      }
      const relative = decodeURIComponent(url.pathname.slice(expectedPrefix.length));
      const candidate = path.resolve(sourceRoot, ...relative.split('/'));
      if (candidate !== sourceRoot && !candidate.startsWith(`${sourceRoot}${path.sep}`)) {
        return invalid('Developer checkout carrier file escapes its source root.');
      }
      const stat = fs.lstatSync(candidate, { throwIfNoEntry: false });
      if (!stat?.isFile() || stat.isSymbolicLink()) {
        return invalid('Developer checkout carrier file is missing.');
      }
      return fs.readFileSync(candidate);
    },
  };
}

function json(bytes: Buffer) {
  const value = parseJsonText(bytes.toString('utf8'));
  return isRecord(value) ? value : invalid('Package artifact must contain a JSON object.');
}

export function acquireHostedPackageSource(input: {
  packageId: string;
  ownerManifest: Record<string, unknown>;
  payload: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
}) {
  const owner = input.ownerManifest;
  const developerSource = acquireDeveloperCheckoutSource(input);
  if (developerSource) return developerSource;
  // Capability/Profile payloads keep their existing transport and lifetime.
  if (owner.surface_kind !== 'opl_agent_package_manifest.v1') return null;
  const surface = isRecord(owner.codex_surface) ? owner.codex_surface : null;
  const carrier = isRecord(surface?.configured_codex_plugin_carrier)
    ? surface.configured_codex_plugin_carrier : null;
  const publication = stringValue(carrier?.publication_ref);
  const source = stringValue(carrier?.marketplace_source);
  const version = stringValue(owner.version);
  const match = publication?.match(/^ghcr\.io\/([a-z0-9._-]+\/one-person-lab-packages\/[a-z0-9.-]+):latest-stable$/);
  if (!match || !source || !version || !/^[0-9A-Za-z.+-]+$/.test(version)
    || !match[1].endsWith(`/${input.packageId}`)) {
    return invalid('Standard Agent source requires its declared Package owner OCI channel.');
  }
  const image = `ghcr.io/${match[1]}`;
  // The selected owner projection supplies the version. Do not introduce a
  // second latest/currentness resolver beside the native carrier lifecycle.
  const artifactRef = `${image}:${version}`;
  const scope = encodeURIComponent(`repository:${match[1]}:pull`);
  const token = stringValue(json(download(`https://ghcr.io/token?service=ghcr.io&scope=${scope}`, input.env)).token);
  if (!token) return invalid('Package registry did not return a pull token.');
  const manifestBytes = download(`https://ghcr.io/v2/${match[1]}/manifests/${version}`, input.env, token);
  const manifest = json(manifestBytes);
  const layers = Array.isArray(manifest.layers) ? manifest.layers.filter(isRecord) : [];
  const layer = (kind: string) => {
    const matches = layers.filter((item) => item.mediaType === `${PREFIX}${kind}`);
    if (matches.length !== 1 || typeof matches[0].digest !== 'string'
      || !/^sha256:[0-9a-f]{64}$/.test(matches[0].digest)) {
      return invalid(`Package artifact requires exactly one ${kind} layer.`);
    }
    return matches[0];
  };
  const blob = (item: Record<string, unknown>) => {
    const bytes = download(`https://ghcr.io/v2/${match[1]}/blobs/${item.digest}`, input.env, token);
    if (digest(bytes) !== item.digest || bytes.length !== item.size) {
      return invalid('Package artifact layer digest or size mismatch.');
    }
    return bytes;
  };
  const publishedOwner = json(blob(layer('manifest.v1+json')));
  const payload = json(blob(layer('payload.v1+json')));
  const packageSource = isRecord(payload.package_source) ? payload.package_source : null;
  const publishedSurface = isRecord(publishedOwner.codex_surface) ? publishedOwner.codex_surface : null;
  const sourceLayer = layer('source.v1+gzip');
  const archiveRoot = stringValue(packageSource?.archive_root);
  if (publishedOwner.package_id !== input.packageId || publishedOwner.version !== version
    || publishedOwner.source_repo !== owner.source_repo
    || publishedSurface?.carrier_source_commit !== input.payload.source_commit
    || payload.package_id !== input.packageId || payload.package_version !== version
    || payload.plugin_id !== input.payload.plugin_id || payload.source_commit !== input.payload.source_commit
    || payload.source_repo !== input.payload.source_repo || payload.source_root !== input.payload.source_root
    || packageSource?.transport !== 'same_oci_artifact_source_archive'
    || packageSource.artifact_ref !== artifactRef || packageSource.archive_sha256 !== sourceLayer.digest
    || !archiveRoot || !/^[A-Za-z0-9._-]+$/.test(archiveRoot) || ['.', '..'].includes(archiveRoot)) {
    return invalid('Package source artifact does not match the selected owner and carrier.');
  }
  const temporaryRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-hosted-package-')));
  try {
    const archivePath = path.join(temporaryRoot, 'source.tar.gz');
    fs.writeFileSync(archivePath, blob(sourceLayer));
    // Enumerate members from the tar headers directly: the system tar CLI
    // octal-escapes non-ASCII names under a non-UTF-8 locale, which would make a
    // physical name look like an injected backslash. See package-source-archive.ts.
    const entries = (() => {
      try {
        return readPackageSourceArchiveEntries(archivePath, archiveRoot);
      } catch {
        invalid('Package source archive must contain only physical files within its declared root.');
      }
    })();
    if (!packageSourceArchiveMembersStayWithinRoot(entries, archiveRoot)) {
      return invalid('Package source archive must contain only physical files within its declared root.');
    }
    try {
      extractPackageSourceArchive(archivePath, temporaryRoot);
    } catch {
      return invalid('Package source archive extraction failed.');
    }
    const sourceRoot = path.join(temporaryRoot, archiveRoot);
    // Some owners keep their descriptor in the declared plugin source directory.
    // The payload is already bound to the selected owner, commit and OCI digest.
    const pluginSourceRoot = stringValue(payload.source_root);
    const ownerRef = fs.existsSync(path.join(sourceRoot, 'opl-package.json'))
      ? 'opl-package.json'
      : pluginSourceRoot && !path.posix.isAbsolute(pluginSourceRoot)
        && !pluginSourceRoot.includes('\\')
        && path.posix.normalize(pluginSourceRoot) === pluginSourceRoot
        && pluginSourceRoot !== '..' && !pluginSourceRoot.startsWith('../')
        ? path.posix.join(pluginSourceRoot, 'opl-package.json') : null;
    if (!ownerRef || !runtimeRootContainsDescriptor(sourceRoot, ownerRef)) {
      return invalid('Package source archive is missing its declared owner descriptor.');
    }
    const sourceOwner = json(fs.readFileSync(path.join(sourceRoot, ownerRef)));
    if (sourceOwner.package_id !== input.packageId || sourceOwner.version !== version
      || (sourceOwner.source_repo !== undefined && sourceOwner.source_repo !== owner.source_repo)
      || !runtimeRootContainsDescriptor(sourceRoot, 'contracts/domain_descriptor.json')) {
      return invalid('Package source root does not contain the selected Standard Agent owner descriptor.');
    }
    return {
      sourceRoot,
      provenance: { source, source_type: 'oci_source_archive', source_commit: payload.source_commit,
        artifact_ref: `${image}@${digest(manifestBytes)}`, archive_sha256: sourceLayer.digest },
      pathFor: (url: URL) => {
        const parsed = new URL(String(owner.source_repo));
        const expectedPrefix = `${parsed.pathname.replace(/\.git$/, '')}/${input.payload.source_commit}/`;
        if (url.hostname !== 'raw.githubusercontent.com' || !url.pathname.startsWith(expectedPrefix)) {
          return invalid('Carrier file must belong to the selected Package source commit.');
        }
        let relative: string;
        try {
          relative = decodeURIComponent(url.pathname.slice(expectedPrefix.length));
        } catch {
          return invalid('Carrier file path is not valid URL encoding.');
        }
        if (!runtimeRootContainsDescriptor(sourceRoot, relative)) {
          return invalid('Package source archive is missing a declared carrier file.');
        }
        return fs.readFileSync(path.join(sourceRoot, relative));
      },
      cleanup: () => fs.rmSync(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
