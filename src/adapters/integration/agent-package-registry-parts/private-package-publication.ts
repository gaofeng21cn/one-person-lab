import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { PACKAGE_PROJECTION_ROOT } from '../../../kernel/standard-agent-registry.ts';
import type { PackageRegistryCredential } from './package-registry-access-provider.ts';

/** Verify a private artifact against a Host-pinned key before admitting its bytes. */
export function verifyPrivatePackagePublication(input: {
  subject: string;
  packageId: string;
  version: string;
  sourceRepo: string;
  sourceCommit: string;
  accessPolicyRef: string;
  credential: PackageRegistryCredential;
  env: NodeJS.ProcessEnv;
  run?: typeof spawnSync;
}) {
  const fail = (reason: string): never => {
    throw new FrameworkContractError('codex_command_failed', 'Private Package publication verification failed.', {
      package_id: input.packageId, failure_code: 'private_package_publication_unverified', reason,
    });
  };
  const subject = /^ghcr\.io\/([a-z0-9._-]+\/one-person-lab-private-packages\/([a-z0-9.-]+))@sha256:[0-9a-f]{64}$/.exec(input.subject);
  if (!subject || subject[2] !== input.packageId
    || input.accessPolicyRef !== `github-package:${subject[1]}`) return fail('private_package_namespace_or_policy_invalid');
  const publicKey = input.env.OPL_PACKAGE_SIGNING_PUBLIC_KEY?.trim();
  if (!publicKey || !path.isAbsolute(publicKey)) return fail('trusted_signing_key_required');
  try { if (!fs.statSync(publicKey).isFile()) return fail('trusted_signing_key_unavailable'); }
  catch { return fail('trusted_signing_key_unavailable'); }
  const verifier = path.resolve(PACKAGE_PROJECTION_ROOT, '../../../scripts/oci-publication-receipt-readback.mjs');
  if (!fs.existsSync(verifier) && !input.run) return fail('publication_verifier_unavailable');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-private-publication-'));
  fs.chmodSync(temporary, 0o700);
  try {
    // ORAS and cosign consume the same short-lived Docker credential file.
    // The source-selected secret never appears in argv, receipts, or diagnostics.
    fs.writeFileSync(path.join(temporary, 'config.json'), JSON.stringify({ auths: {
      'ghcr.io': { auth: Buffer.from(`${input.credential.username}:${input.credential.token}`, 'utf8').toString('base64') },
    } }), { mode: 0o600, flag: 'wx' });
    const result = (input.run ?? spawnSync)(process.execPath, [verifier,
      '--subject', input.subject, '--package-id', input.packageId, '--version', input.version,
      '--source-repo', input.sourceRepo, '--source-commit', input.sourceCommit,
      '--access-policy-ref', input.accessPolicyRef, '--credential-provider', 'github_packages',
      '--public-key', publicKey,
    ], { env: { ...input.env, DOCKER_CONFIG: temporary }, encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) return fail('publication_receipt_or_signature_invalid');
    let receipt: unknown;
    try { receipt = JSON.parse(String(result.stdout)); } catch { return fail('publication_verifier_result_invalid'); }
    if (!isRecord(receipt) || receipt.status !== 'verified' || receipt.subject !== input.subject) {
      return fail('publication_verifier_result_invalid');
    }
    return receipt;
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
