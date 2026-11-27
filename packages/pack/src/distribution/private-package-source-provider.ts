import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const supportedHandles = new Set([
  'env:OPL_GITHUB_PACKAGES_TOKEN',
  'provider:github_packages:docker',
  'provider:github_packages:gh-cli',
  'provider:github_packages:ghcr',
]);

export function isPrivatePackageSourceHandle(handle: unknown): handle is string {
  return typeof handle === 'string' && supportedHandles.has(handle);
}

function helperOutput(binary: string, args: string[], input?: string): string {
  const result = spawnSync(binary, args, { input, encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024 });
  return result.status === 0 ? result.stdout.trim() : '';
}

function credential(user: unknown, secret: unknown) {
  if (typeof user !== 'string' || typeof secret !== 'string' ||
      !user.trim() || !secret.trim() || /[:\r\n\0]/.test(user) || /[\r\n\0]/.test(secret)) return null;
  return { username: user.trim(), token: secret.trim() };
}

function dockerCredential() {
  try {
    const home = process.env.HOME?.trim() || os.homedir();
    const configPath = path.join(process.env.DOCKER_CONFIG?.trim() || path.join(home, '.docker'), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const helper = config.credHelpers?.['ghcr.io'] ?? config.credsStore;
    if (typeof helper !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(helper)) return null;
    const result = JSON.parse(helperOutput(`docker-credential-${helper}`, ['get'], 'ghcr.io\n'));
    return credential(result.Username, result.Secret);
  } catch {
    return null;
  }
}

function ghCredential() {
  return credential('x-access-token', helperOutput('gh', ['auth', 'token', '--hostname', 'github.com']));
}

function selectedCredential(handle: string) {
  switch (handle) {
    case 'env:OPL_GITHUB_PACKAGES_TOKEN':
      return credential(process.env.OPL_GITHUB_USERNAME?.trim() || 'x-access-token', process.env.OPL_GITHUB_PACKAGES_TOKEN);
    case 'provider:github_packages:docker':
      return dockerCredential();
    case 'provider:github_packages:gh-cli':
      return ghCredential();
    case 'provider:github_packages:ghcr':
      return dockerCredential() ?? ghCredential();
    default:
      return null;
  }
}

export function resolvePrivatePackageAuthHeader(handle: string | null): string | null {
  if (!isPrivatePackageSourceHandle(handle)) return null;
  const selected = selectedCredential(handle);
  if (!selected) return null;
  const auth = Buffer.from(`${selected.username}:${selected.token}`, 'utf8').toString('base64');
  return `Basic ${auth}`;
}

export function preparePrivatePackageSourceCredential(handle: string | null, registryConfigRoot?: string) {
  if (!isPrivatePackageSourceHandle(handle)) return 'source_not_configured';
  const selected = selectedCredential(handle);
  if (!selected) return 'credential_unavailable';
  if (registryConfigRoot !== undefined) {
    const dir = fs.lstatSync(registryConfigRoot);
    if (!dir.isDirectory() || (process.platform !== 'win32' && (dir.mode & 0o077) !== 0)) {
      throw new Error('Private registry configuration requires an owner-only directory.');
    }
    const auth = Buffer.from(`${selected.username}:${selected.token}`, 'utf8').toString('base64');
    fs.writeFileSync(path.join(registryConfigRoot, 'config.json'), JSON.stringify({ auths: { 'ghcr.io': { auth } } }), {
      mode: 0o600, flag: 'wx',
    });
  }
  return 'ready';
}

export async function probePrivatePackageSourceIdentity(handle: string): Promise<{
  status: 'signed_out' | 'authorized' | 'expired' | 'forbidden' | 'unknown';
  verification_reason: string;
}> {
  const selected = selectedCredential(handle);
  if (!selected) return { status: 'signed_out', verification_reason: 'provider_credential_unavailable' };
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${selected.token}`, Accept: 'application/vnd.github+json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 200) {
      const user = await response.json();
      if (Number.isSafeInteger(user?.id) && user.id > 0 && typeof user.login === 'string' && user.login.trim()) {
        return { status: 'authorized', verification_reason: 'provider_identity_verified_package_grants_checked_at_install' };
      }
    } else {
      await response.body?.cancel();
      if (response.status === 401) return { status: 'expired', verification_reason: 'provider_credential_expired' };
      if (response.status === 403) return { status: 'forbidden', verification_reason: 'provider_identity_forbidden' };
    }
  } catch {
    // Provider errors can contain account details. Return only the stable verification result.
  }
  return { status: 'unknown', verification_reason: 'software_source_verification_unavailable' };
}
