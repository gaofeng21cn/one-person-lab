import { spawnSync } from 'node:child_process';
import type { SoftwareSource, SoftwareSourceCheckResult } from './software-sources-types.ts';

type Credential = { provider_id: 'github_packages'; credential_handle: string; username: string; token: string };
type CredentialReader = (env: NodeJS.ProcessEnv, credentialHandle?: string | null) => Credential | null;

type VerificationOptions = {
  credentialReader?: CredentialReader;
  run?: (args: string[], input: string) => { status: number | null; stdout: string; error?: Error };
};

export async function verifySoftwareSourceCredential(source: SoftwareSource, env: NodeJS.ProcessEnv, options: VerificationOptions = {}): Promise<SoftwareSourceCheckResult> {
  if (source.visibility !== 'public' && (!source.enabled || !source.credential_handle)) return { status: 'signed_out', verification_reason: 'software_source_disconnected' };
  let config = '';
  if (source.visibility !== 'public') {
    const credential = options.credentialReader?.(env, source.credential_handle);
    if (!credential) return { status: 'signed_out', verification_reason: 'provider_credential_unavailable' };
    // Secret material is sent to curl through stdin, never arguments or diagnostics.
    const encoded = Buffer.from(`${credential.username}:${credential.token}`).toString('base64');
    config = `header = "Authorization: Basic ${encoded}"\nheader = "Accept: application/vnd.github+json"\n`;
  }
  const args = [
    '--disable', '--silent', '--show-error', '--proto', '=https', '--ipv4', '--connect-timeout', '5', '--max-time', '15',
    '--config', '-', '--output', process.platform === 'win32' ? 'NUL' : '/dev/null', '--write-out', '%{http_code}',
    source.visibility === 'public' ? source.source_ref : 'https://api.github.com/user',
  ];
  const result = options.run ? options.run(args, config) : spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
    env, input: config, encoding: 'utf8', timeout: 16_000, maxBuffer: 1024,
  });
  if (result.error || result.status !== 0) return { status: 'unknown', verification_reason: 'software_source_verification_unavailable' };
  const httpStatus = result.stdout.trim();
  if (httpStatus === '200') return source.visibility === 'public'
    ? { status: 'public', verification_reason: 'public_source_reachable' }
    : { status: 'authorized', verification_reason: 'provider_identity_verified_package_grants_checked_at_install' };
  if (source.visibility !== 'public' && httpStatus === '401') return { status: 'expired', verification_reason: 'provider_credential_expired' };
  if (source.visibility !== 'public' && httpStatus === '403') return { status: 'forbidden', verification_reason: 'provider_identity_forbidden' };
  return { status: 'unknown', verification_reason: 'software_source_verification_unavailable' };
}
