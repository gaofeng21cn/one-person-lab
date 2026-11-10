import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  AgentPackageAccessDecision,
  AgentPackageAccessStatus,
} from './package-access.ts';

export type PackageRegistryCredential = {
  provider_id: 'github_packages';
  credential_handle: string;
  username: string;
  token: string;
};

type CommandResult = {
  status: number | null;
  stdout: Buffer;
  stderr: string;
  error: Error | null;
};

export type PackageRegistryAccessProviderInput = {
  packageId: string;
  publicationRef: string;
  accessPolicyRef: string;
  sourceRef?: string | null;
  env?: NodeJS.ProcessEnv;
  credentialHandle?: string | null;
  now?: () => Date;
  credentialReader?: (env: NodeJS.ProcessEnv, credentialHandle?: string | null) => PackageRegistryCredential | null;
  commandRunner?: (args: string[], input: string) => CommandResult;
};

export type PackageRegistryAccessReadback = Omit<AgentPackageAccessDecision, 'visibility'> & {
  package_id: string;
  publication_ref: string;
  registry_digest: string | null;
};

const GHCR_REF = /^ghcr\.io\/([a-z0-9._-]+\/one-person-lab-packages\/[a-z0-9._-]+)(?::([^@]+)|@(sha256:[0-9a-f]{64}))?$/i;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const REGISTRY_REQUEST_MAX_SECONDS = '15';
const CREDENTIAL_HANDLES = new Set([
  'provider:github_packages:ghcr', 'provider:github_packages:gh-cli',
  'provider:github_packages:docker', 'env:OPL_GITHUB_PACKAGES_TOKEN',
]);

function value(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function defaultRunner(args: string[], input: string, env: NodeJS.ProcessEnv): CommandResult {
  const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const result = spawnSync(curl, args, {
    input,
    encoding: null,
    env,
    timeout: 16_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const raw = (result.stdout ?? Buffer.alloc(0)).toString('utf8');
  const marker = /\nOPL_HTTP_STATUS:(\d{3})\s*$/m.exec(raw);
  const stdout = marker ? Buffer.from(raw.slice(0, marker.index), 'utf8') : Buffer.from(raw, 'utf8');
  return {
    status: marker ? Number(marker[1]) : result.status,
    stdout,
    stderr: result.stderr?.toString('utf8') ?? '',
    error: result.error ?? null,
  };
}

function normalizeCredential(username: string, token: string, credentialHandle: string): PackageRegistryCredential | null {
  if (!username || !token || /[\r\n\x00]/.test(username + token)) return null;
  return { provider_id: 'github_packages', credential_handle: credentialHandle, username, token };
}

function nativeCredentialCommand(binary: string, args: string[], env: NodeJS.ProcessEnv, input?: string) {
  const result = spawnSync(binary, args, { input, env, encoding: 'utf8', timeout: 5_000, maxBuffer: 64 * 1024 });
  // Provider stderr may contain account or token details. It is never surfaced.
  return result.status === 0 ? result.stdout : null;
}

function dockerCredential(env: NodeJS.ProcessEnv, credentialHandle: string): PackageRegistryCredential | null {
  const home = value(env.HOME) ?? os.homedir();
  const dockerConfig = path.join(value(env.DOCKER_CONFIG) ?? path.join(home, '.docker'), 'config.json');
  try {
    const config = JSON.parse(fs.readFileSync(dockerConfig, 'utf8')) as Record<string, unknown>;
    const helpers = config.credHelpers && typeof config.credHelpers === 'object' ? config.credHelpers as Record<string, unknown> : {};
    const helper = value(helpers['ghcr.io']) ?? value(config.credsStore);
    if (helper && /^[A-Za-z0-9_-]+$/.test(helper)) {
      const raw = nativeCredentialCommand(`docker-credential-${helper}`, ['get'], env, 'ghcr.io\n');
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, unknown>;
        const result = normalizeCredential(value(stored.Username) ?? '', value(stored.Secret) ?? '', credentialHandle);
        if (result) return result;
      }
    }
  } catch { /* Missing or unavailable helper has no credential for this provider. */ }
  return null;
}

function githubCliCredential(env: NodeJS.ProcessEnv, credentialHandle: string): PackageRegistryCredential | null {
  const token = value(nativeCredentialCommand('gh', ['auth', 'token', '--hostname', 'github.com'], env));
  return token ? normalizeCredential('x-access-token', token, credentialHandle) : null;
}

function defaultCredentialReader(env: NodeJS.ProcessEnv, credentialHandle?: string | null): PackageRegistryCredential | null {
  if (credentialHandle === null || credentialHandle === undefined) return null;
  if (credentialHandle === 'env:OPL_GITHUB_PACKAGES_TOKEN') {
    const token = value(env.OPL_GITHUB_PACKAGES_TOKEN);
    return token ? normalizeCredential(value(env.OPL_GITHUB_USERNAME) ?? 'x-access-token', token, credentialHandle) : null;
  }
  if (credentialHandle === 'provider:github_packages:gh-cli') return githubCliCredential(env, credentialHandle);
  if (credentialHandle === 'provider:github_packages:docker') return dockerCredential(env, credentialHandle);
  if (credentialHandle === 'provider:github_packages:ghcr') {
    return dockerCredential(env, credentialHandle) ?? githubCliCredential(env, credentialHandle);
  }
  return null;
}

function basicConfig(credential: PackageRegistryCredential) {
  const encoded = Buffer.from(`${credential.username}:${credential.token}`, 'utf8').toString('base64');
  return `header = "Authorization: Basic ${encoded}"\n`;
}

function bearerConfig(token: string) {
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(token)) throw new Error('Invalid registry token.');
  return `header = "Authorization: Bearer ${token}"\n`;
}

function parsePublicationRef(publicationRef: string) {
  const match = GHCR_REF.exec(publicationRef);
  if (!match) return null;
  const repository = match[1].toLowerCase();
  const tagOrDigest = match[3] ?? match[2] ?? 'latest-stable';
  if (!/^sha256:[0-9a-f]{64}$/.test(tagOrDigest) && !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tagOrDigest)) return null;
  return { repository, reference: tagOrDigest };
}

function responseStatus(result: CommandResult) {
  if (result.error || result.status === null) return null;
  return result.status;
}

function readJson(result: CommandResult) {
  try {
    const parsed = JSON.parse(result.stdout.toString('utf8')) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
}

function statusFromHttp(status: number | null): AgentPackageAccessStatus {
  if (status === 401) return 'expired';
  if (status === 403 || status === 404) return 'forbidden';
  return 'unknown';
}

function baseReadback(input: PackageRegistryAccessProviderInput, status: AgentPackageAccessStatus, reason: string, verifiedAt: string | null = null): PackageRegistryAccessReadback {
  return {
    package_id: input.packageId,
    publication_ref: input.publicationRef,
    provider_id: 'github_packages',
    credential_handle: null,
    access_policy_ref: input.accessPolicyRef,
    source_ref: input.sourceRef ?? null,
    verified_at: verifiedAt,
    expires_at: null,
    security_revision: null,
    reason,
    discover_allowed: false,
    download_allowed: false,
    status,
    registry_digest: null,
  };
}

/**
 * Verify an authorized-only Package against GHCR without mutating registry state.
 * Secrets are supplied through curl's stdin config, never argv or diagnostics.
 */
export function verifyGithubPackagesAccess(input: PackageRegistryAccessProviderInput): PackageRegistryAccessReadback {
  const parsed = parsePublicationRef(input.publicationRef);
  if (!parsed || !parsed.repository.endsWith(`/${input.packageId}`)) {
    return baseReadback(input, 'unknown', 'package_publication_ref_invalid');
  }
  const env = input.env ?? process.env;
  if (!input.credentialHandle || !CREDENTIAL_HANDLES.has(input.credentialHandle)) {
    return baseReadback(input, 'signed_out', 'package_access_credential_required');
  }
  const credentialReader = input.credentialReader ?? defaultCredentialReader;
  const selectedCredential = credentialReader(env, input.credentialHandle);
  const credential = selectedCredential
    && selectedCredential.provider_id === 'github_packages'
    && selectedCredential.credential_handle === input.credentialHandle
    ? normalizeCredential(selectedCredential.username, selectedCredential.token, selectedCredential.credential_handle)
    : null;
  if (!credential) return baseReadback(input, 'signed_out', 'package_access_credential_required');
  const runner = input.commandRunner ?? ((args: string[], content: string) => defaultRunner(args, content, env));
  const now = input.now ?? (() => new Date());
  const scope = encodeURIComponent(`repository:${parsed.repository}:pull`);
  const tokenResult = runner([
    '--disable', '--fail-with-body', '--silent', '--show-error', '--proto', '=https', '--ipv4',
    '--connect-timeout', '10', '--max-time', REGISTRY_REQUEST_MAX_SECONDS, '--config', '-',
    '--write-out', '\nOPL_HTTP_STATUS:%{http_code}\n',
    `https://ghcr.io/token?service=ghcr.io&scope=${scope}`,
  ], basicConfig(credential));
  const tokenStatus = responseStatus(tokenResult);
  const tokenPayload = readJson(tokenResult);
  const token = value(tokenPayload?.token);
  if (!token || !/^[A-Za-z0-9._~+/=-]+$/.test(token) || tokenStatus !== 200) {
    return baseReadback(input, statusFromHttp(tokenStatus), tokenStatus === 401 ? 'package_access_credential_expired' : tokenStatus === 403 ? 'package_access_forbidden' : 'package_access_verification_failed');
  }
  const manifestResult = runner([
    '--disable', '--fail-with-body', '--silent', '--show-error', '--proto', '=https', '--ipv4',
    '--connect-timeout', '10', '--max-time', REGISTRY_REQUEST_MAX_SECONDS, '--config', '-',
    '-H', 'Accept: application/vnd.oci.image.manifest.v1+json',
    '--write-out', '\nOPL_HTTP_STATUS:%{http_code}\n',
    `https://ghcr.io/v2/${parsed.repository}/manifests/${parsed.reference}`,
  ], bearerConfig(token));
  const manifestStatus = responseStatus(manifestResult);
  if (manifestStatus !== 200) {
    const status = statusFromHttp(manifestStatus);
    return baseReadback(input, status, status === 'expired' ? 'package_access_credential_expired' : status === 'forbidden' ? 'package_access_forbidden' : 'package_access_verification_failed');
  }
  const manifest = readJson(manifestResult);
  if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest?.layers)) {
    return baseReadback(input, 'unknown', 'package_registry_manifest_invalid');
  }
  const digest = `sha256:${crypto.createHash('sha256').update(manifestResult.stdout).digest('hex')}`;
  if (parsed.reference.startsWith('sha256:') && parsed.reference !== digest) {
    return baseReadback(input, 'unknown', 'package_registry_digest_mismatch');
  }
  const verifiedAt = now().toISOString();
  const expiresIn = typeof tokenPayload?.expires_in === 'number' && tokenPayload.expires_in > 0 ? Math.min(tokenPayload.expires_in, 300) : 60;
  return {
    ...baseReadback(input, 'authorized', '', verifiedAt),
    status: 'authorized',
    credential_handle: credential.credential_handle,
    expires_at: new Date(now().getTime() + expiresIn * 1000).toISOString(),
    discover_allowed: true,
    download_allowed: true,
    security_revision: digest && SHA256.test(digest) ? digest : null,
    registry_digest: digest && SHA256.test(digest) ? digest : null,
    reason: null,
  };
}

export function credentialForGithubPackages(env: NodeJS.ProcessEnv = process.env, credentialHandle?: string | null) {
  return defaultCredentialReader(env, credentialHandle);
}
