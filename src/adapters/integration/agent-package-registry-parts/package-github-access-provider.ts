import crypto from 'node:crypto';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { AgentPackageAccessDecision, AgentPackageAccessStatus } from './package-access.ts';
import { githubRepositoryIdentity } from './package-github-preview-contract.ts';
import {
  credentialForGithubPackages, isGithubPackagesCredentialHandle, runGithubPackageProviderRequest,
  type PackageRegistryAccessProviderInput,
} from './package-registry-access-provider.ts';

export type GithubRepositoryAccessProviderInput = Omit<PackageRegistryAccessProviderInput, 'publicationRef'> & {
  sourceRef: string;
  sourceCommit: string;
};

/** Verify repository contents at the selected commit through the existing credential owner. */
export function verifyGithubRepositoryAccess(input: GithubRepositoryAccessProviderInput): Omit<AgentPackageAccessDecision, 'visibility'> {
  const base = (status: AgentPackageAccessStatus, reason: string) => ({
    status, provider_id: 'github_packages', credential_handle: null,
    access_policy_ref: input.accessPolicyRef, source_ref: input.sourceRef,
    verified_at: null, expires_at: null, security_revision: null, registry_digest: null,
    reason, discover_allowed: false, download_allowed: false,
  });
  const identity = githubRepositoryIdentity(input.sourceRef);
  if (!identity || !/^[0-9a-f]{40}$/.test(input.sourceCommit)
    || input.accessPolicyRef !== `github-repository:${identity.repository}`) {
    return base('unknown', 'package_access_policy_binding_mismatch');
  }
  if (!isGithubPackagesCredentialHandle(input.credentialHandle)) return base('signed_out', 'package_access_credential_required');
  const env = input.env ?? process.env;
  const credential = (input.credentialReader ?? credentialForGithubPackages)(env, input.credentialHandle);
  if (!credential || credential.provider_id !== 'github_packages'
    || credential.credential_handle !== input.credentialHandle || !credential.username || !credential.token
    || /[\r\n\x00]/.test(credential.username + credential.token)) return base('signed_out', 'package_access_credential_required');
  const config = `header = "Authorization: Basic ${Buffer.from(`${credential.username}:${credential.token}`).toString('base64')}"\n`;
  const run = input.commandRunner ?? ((args: string[], content: string) => runGithubPackageProviderRequest(args, content, env));
  const request = (suffix: string) => run([
    '--disable', '--fail-with-body', '--silent', '--show-error', '--proto', '=https', '--ipv4',
    '--connect-timeout', '10', '--max-time', '15', '--config', '-',
    '-H', 'Accept: application/vnd.github+json',
    '--write-out', '\nOPL_HTTP_STATUS:%{http_code}\n',
    `https://api.github.com/repos/${identity.repository}${suffix}`,
  ], config);
  const records: Record<string, unknown>[] = [];
  for (const suffix of ['', `/commits/${input.sourceCommit}`]) {
    const result = request(suffix);
    if (result.error || result.status !== 200) {
      return base(result.status === 401 ? 'expired' : [403, 404].includes(result.status ?? 0) ? 'forbidden' : 'unknown',
        result.status === 401 ? 'package_access_credential_expired' : [403, 404].includes(result.status ?? 0) ? 'package_access_forbidden' : 'package_access_verification_failed');
    }
    try {
      const parsed: unknown = JSON.parse(result.stdout.toString('utf8'));
      if (!isRecord(parsed)) return base('unknown', 'package_repository_response_invalid');
      records.push(parsed);
    } catch { return base('unknown', 'package_repository_response_invalid'); }
  }
  const [repository, commit] = records;
  if (typeof repository.id !== 'number' || !Number.isSafeInteger(repository.id)
    || String(repository.full_name).toLowerCase() !== identity.repository
    || (isRecord(repository.permissions) && repository.permissions.pull === false)
    || commit.sha !== input.sourceCommit) return base('forbidden', 'package_repository_identity_mismatch');
  const now = (input.now ?? (() => new Date()))();
  const revision = `sha256:${crypto.createHash('sha256').update(JSON.stringify([
    repository.id, identity.repository, input.sourceCommit,
  ])).digest('hex')}`;
  return {
    ...base('authorized', ''), credential_handle: input.credentialHandle,
    verified_at: now.toISOString(), expires_at: new Date(now.getTime() + 60_000).toISOString(),
    security_revision: revision, reason: null, discover_allowed: true, download_allowed: true,
  };
}
