import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packageRegistryNamespace } from './registry-client.ts';

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

export async function probePrivatePackageSourceIdentity(
  handle: string,
  owner: string,
  selectPackages: (signal: AbortSignal) => Promise<readonly string[]>,
): Promise<{
  status: 'signed_out' | 'authorized' | 'expired' | 'forbidden' | 'unknown';
  verification_reason: string;
  account_login?: string;
}> {
  const selected = selectedCredential(handle);
  if (!selected) return { status: 'signed_out', verification_reason: 'provider_credential_unavailable' };
  try {
    const signal = AbortSignal.timeout(15_000);
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${selected.token}`, Accept: 'application/vnd.github+json' },
      redirect: 'error',
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) return { status: 'expired', verification_reason: 'provider_credential_expired' };
      if (response.status === 403) return { status: 'forbidden', verification_reason: 'provider_identity_forbidden' };
      return { status: 'unknown', verification_reason: 'software_source_verification_unavailable' };
    }
    const user = await response.json();
    if (!Number.isSafeInteger(user?.id) || user.id <= 0 || typeof user.login !== 'string' || !user.login.trim()) {
      return { status: 'unknown', verification_reason: 'software_source_verification_unavailable' };
    }

    const packages = await selectPackages(signal);
    if (!packages.length) return { status: 'unknown', verification_reason: 'registry_package_probe_unavailable' };
    const auth = Buffer.from(`${selected.username}:${selected.token}`).toString('base64');
    let unavailable = false;
    for (const packageId of packages) {
      const repository = `${owner}/${packageRegistryNamespace('authorized_only')}/${packageId}`;
      const tokenUrl = new URL('https://ghcr.io/token');
      tokenUrl.searchParams.set('service', 'ghcr.io');
      tokenUrl.searchParams.set('scope', `repository:${repository}:pull`);
      const exchange = await fetch(tokenUrl, {
        headers: { Authorization: `Basic ${auth}` },
        redirect: 'error',
        signal,
      });
      if (!exchange.ok) {
        await exchange.body?.cancel();
        if (exchange.status === 401) return { status: 'expired', verification_reason: 'registry_credential_expired' };
        if (exchange.status === 403 || exchange.status === 404) continue;
        unavailable = true;
        continue;
      }
      const body = await exchange.json();
      const token = body?.token ?? body?.access_token;
      if (typeof token !== 'string' || !token) continue;
      const manifest = await fetch(`https://ghcr.io/v2/${repository}/manifests/latest-stable`, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        },
        redirect: 'error',
        signal,
      });
      if (manifest.ok) {
        return {
          status: 'authorized',
          verification_reason: 'provider_identity_and_registry_package_read_verified',
          account_login: user.login.trim(),
        };
      }
      if (manifest.status !== 401 && manifest.status !== 403 && manifest.status !== 404) unavailable = true;
    }
    return unavailable
      ? { status: 'unknown', verification_reason: 'registry_access_verification_unavailable' }
      : { status: 'forbidden', verification_reason: 'registry_package_read_scope_missing' };
  } catch {
    // Provider errors can contain account details. Return only the stable verification result.
    return { status: 'unknown', verification_reason: 'software_source_verification_unavailable' };
  }
}
