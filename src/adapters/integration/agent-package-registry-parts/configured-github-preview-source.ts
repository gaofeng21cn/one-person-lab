import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { runtimeRootContainsDescriptor } from '../../../kernel/git-marketplace-runtime-root.ts';
import { localReadbackFailure, stringValue } from './configured-codex-plugin-carrier-native.ts';
import { githubPreviewSourceIdentity } from './package-github-preview-contract.ts';
import { assertPackageDownloadAllowed, packageAccessSubject } from './package-access.ts';
import { credentialForGithubPackages } from './package-registry-access-provider.ts';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
type CommandResult = { status: number | null; stdout: Buffer; stderr: string; error: Error | null };
type Dependencies = {
  authorize?: typeof assertPackageDownloadAllowed;
  credentialReader?: typeof credentialForGithubPackages;
  commandRunner?: (args: string[], input: string) => CommandResult;
};

function invalid(message: string): never {
  return localReadbackFailure('configured_github_preview_source_invalid', message);
}

function relativePath(value: unknown) {
  const candidate = stringValue(value);
  if (!candidate || candidate.includes('\\') || candidate.includes('\0')
    || candidate.split('/').some(part => !part || part === '.' || part === '..')
    || path.posix.isAbsolute(candidate)) return invalid('Preview source path must stay within its selected repository.');
  return candidate;
}

function sourcePathFor(url: URL, repository: string, commit: string) {
  const prefix = `/${repository}/${commit}/`;
  if (url.protocol !== 'https:' || url.host !== 'raw.githubusercontent.com'
    || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) {
    return invalid('Preview carrier file must belong to its selected repository and commit.');
  }
  let parts: string[];
  try { parts = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent); }
  catch { return invalid('Preview source path has invalid URL encoding.'); }
  if (parts.some(part => part.includes('/'))) return invalid('Preview source path contains an encoded separator.');
  return relativePath(parts.join('/'));
}

/** Download only the selected private capability payload through authenticated GitHub APIs. */
export function acquireGithubPreviewSource(input: {
  packageId: string;
  ownerManifest: Record<string, unknown>;
  payload: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
}, dependencies: Dependencies = {}) {
  const owner = input.ownerManifest;
  if (owner.visibility !== 'authorized_only' || owner.publication_channel_admission !== 'development_only') return null;
  const surface = isRecord(owner.codex_surface) ? owner.codex_surface : null;
  const carrier = isRecord(surface?.configured_codex_plugin_carrier) ? surface.configured_codex_plugin_carrier : null;
  if (carrier?.publication_ref != null) return null;
  const subject = packageAccessSubject(owner);
  const identity = githubPreviewSourceIdentity(subject);
  const payload = input.payload;
  const pluginId = stringValue(surface?.plugin_id);
  const version = stringValue(owner.version);
  if (!identity || !pluginId || !version || owner.package_id !== input.packageId
    || payload.package_id !== input.packageId || payload.package_version !== version
    || payload.plugin_id !== pluginId || payload.source_repo !== identity.sourceRepo
    || payload.source_commit !== identity.sourceCommit || !Array.isArray(payload.files)) {
    return invalid('Preview payload does not match its selected Package owner and source.');
  }
  const sourceRootRef = payload.source_root === '.' ? '' : relativePath(payload.source_root);
  const ownerRef = sourceRootRef ? `${sourceRootRef}/opl-package.json` : 'opl-package.json';
  const sourcePaths = new Set<string>([ownerRef]);
  for (const file of payload.files) {
    if (!isRecord(file) || typeof file.source_url !== 'string') return invalid('Preview payload file has no source URL.');
    let url: URL;
    try { url = new URL(file.source_url); }
    catch { return invalid('Preview payload file source URL is invalid.'); }
    sourcePaths.add(sourcePathFor(url, identity.repository, identity.sourceCommit));
  }
  const access = (dependencies.authorize ?? assertPackageDownloadAllowed)(subject, input.env);
  const credential = (dependencies.credentialReader ?? credentialForGithubPackages)(input.env, access.credential_handle);
  if (!access.download_allowed || !credential || credential.provider_id !== 'github_packages'
    || credential.credential_handle !== access.credential_handle || !/^[A-Za-z0-9._~+/=-]+$/.test(credential.token)) {
    return invalid('Preview source has no authorized GitHub credential.');
  }
  const runner = dependencies.commandRunner ?? ((args: string[], content: string): CommandResult => {
    const result = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
      env: input.env, input: content, maxBuffer: 64 * 1024, timeout: 130_000,
    });
    return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0),
      stderr: result.stderr?.toString('utf8') ?? '', error: result.error ?? null };
  });
  const sourceRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-github-preview-')));
  const cleanup = () => fs.rmSync(sourceRoot, { recursive: true, force: true });
  try {
    for (const relative of sourcePaths) {
      const destination = path.join(sourceRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const apiPath = relative.split('/').map(encodeURIComponent).join('/');
      const url = `https://api.github.com/repos/${identity.repository}/contents/${apiPath}?ref=${identity.sourceCommit}`;
      // No redirect following: credentials are sent only to the fixed GitHub API
      // hostname. Raw/codeload URLs are identifiers, never credential recipients.
      const result = runner([
        '--disable', '--fail', '--silent', '--show-error', '--proto', '=https', '--max-redirs', '0',
        '--connect-timeout', '10', '--max-time', '120', '--max-filesize', String(MAX_FILE_BYTES),
        '--config', '-', '-H', 'Accept: application/vnd.github.raw+json',
        '-H', 'X-GitHub-Api-Version: 2022-11-28', '--output', destination,
        '--write-out', '%{http_code}', url,
      ], `header = "Authorization: Bearer ${credential.token}"\n`);
      if (result.error || result.status !== 0 || result.stdout.toString('utf8').trim() !== '200') {
        return localReadbackFailure('configured_github_preview_source_download_failed',
          'The selected private preview file could not be downloaded.', { package_id: input.packageId });
      }
      if (!runtimeRootContainsDescriptor(sourceRoot, relative) || fs.statSync(destination).size > MAX_FILE_BYTES) {
        return invalid('Preview source file is missing or exceeds its size limit.');
      }
      if (relative === ownerRef) {
        let sourceOwner: unknown;
        try { sourceOwner = JSON.parse(fs.readFileSync(destination, 'utf8')); }
        catch { return invalid('Preview source owner descriptor is not valid JSON.'); }
        const sourceSurface = isRecord(sourceOwner) && isRecord(sourceOwner.codex_surface) ? sourceOwner.codex_surface : null;
        if (!isRecord(sourceOwner) || sourceOwner.package_id !== input.packageId || sourceOwner.version !== version
          || sourceOwner.source_repo !== identity.sourceRepo || sourceSurface?.plugin_id !== pluginId) {
          return invalid('Preview source descriptor does not match its selected Package owner.');
        }
      }
    }
    return {
      sourceRoot,
      provenance: { source: identity.sourceRepo, source_type: 'github_authenticated_preview', source_commit: identity.sourceCommit },
      cleanup,
      pathFor: (url: URL) => {
        const relative = sourcePathFor(url, identity.repository, identity.sourceCommit);
        if (!sourcePaths.has(relative) || !runtimeRootContainsDescriptor(sourceRoot, relative)) {
          return invalid('Preview source does not contain the selected carrier file.');
        }
        return fs.readFileSync(path.join(sourceRoot, relative));
      },
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
