import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import { resolvePackageSourceCredentialProvider } from '../software-sources.ts';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import type { AgentPackageAccessStatus, AgentPackageManifest, AgentPackageVisibility } from './types.ts';
import { verifyGithubPackagesAccess, type PackageRegistryAccessProviderInput } from './package-registry-access-provider.ts';

export type { AgentPackageAccessStatus, AgentPackageVisibility } from './types.ts';
export type PackageAccessSubject = Pick<AgentPackageManifest,
  'package_id' | 'visibility' | 'access_policy_ref' | 'credential_provider' | 'source_repo' | 'codex_surface'>
  & Partial<Pick<AgentPackageManifest, 'publication_channel_admission' | 'source_commit'>>;
export type AgentPackageAccessDecision = {
  visibility: AgentPackageVisibility;
  status: AgentPackageAccessStatus;
  provider_id: string | null;
  credential_handle: string | null;
  source_id?: string | null;
  access_policy_ref: string | null;
  source_ref: string | null;
  verified_at: string | null;
  expires_at: string | null;
  security_revision: string | null;
  reason: string | null;
  discover_allowed: boolean;
  download_allowed: boolean;
  registry_digest?: string | null;
};

function value(input: unknown) {
  return typeof input === 'string' && input.trim() ? input.trim() : null;
}

export function normalizePackageAccessFields(payload: Record<string, unknown>, packageId: string) {
  const visibility = payload.visibility ?? 'public';
  const accessPolicyRef = value(payload.access_policy_ref);
  const provider = value(payload.credential_provider);
  const invalid = (message: string): never => {
    throw new FrameworkContractError('contract_shape_invalid', message, {
      package_id: packageId,
      failure_code: 'package_access_contract_invalid',
    });
  };
  if (visibility !== 'public' && visibility !== 'authorized_only') invalid('Package visibility must be public or authorized_only.');
  if (provider && !/^[a-z0-9][a-z0-9._-]*$/.test(provider)) invalid('Package credential provider is invalid.');
  if (accessPolicyRef && !/^[A-Za-z0-9][A-Za-z0-9._:/#?=&%+~-]*$/.test(accessPolicyRef)) invalid('Package access policy reference is invalid.');
  if (visibility === 'authorized_only' && (!accessPolicyRef || !provider)) {
    invalid('Authorized Package must declare access_policy_ref and credential_provider.');
  }
  return {
    visibility: visibility as AgentPackageVisibility,
    access_policy_ref: accessPolicyRef,
    credential_provider: provider,
  };
}

export function packagePublicationRef(manifest: Pick<AgentPackageManifest, 'codex_surface'>) {
  const carrier = manifest.codex_surface?.configured_codex_plugin_carrier;
  return isRecord(carrier) ? value(carrier.publication_ref) : null;
}

export function packageAccessSubject(owner: Record<string, unknown>): PackageAccessSubject {
  return {
    package_id: value(owner.package_id) ?? '',
    ...normalizePackageAccessFields(owner, value(owner.package_id) ?? ''),
    source_repo: value(owner.source_repo),
    source_commit: value(owner.source_commit),
    publication_channel_admission: owner.publication_channel_admission === 'development_only' ? 'development_only' : 'admitted',
    codex_surface: isRecord(owner.codex_surface) ? owner.codex_surface : {},
  };
}

export type PackageAccessOptions = {
  env?: NodeJS.ProcessEnv;
  credentialHandle?: string | null;
  disabled?: boolean;
  verification?: 'cached' | 'live';
  now?: () => Date;
  verify?: (input: PackageRegistryAccessProviderInput) => ReturnType<typeof verifyGithubPackagesAccess>;
};

function accessSnapshotFile(subject: PackageAccessSubject, env: NodeJS.ProcessEnv) {
  const stateDir = env.OPL_STATE_DIR?.trim() || resolveOplStatePaths().state_dir;
  const key = crypto.createHash('sha256').update(subject.package_id).digest('hex');
  return path.join(stateDir, 'package-access', `${key}.json`);
}

function accessBinding(subject: PackageAccessSubject, credentialHandle: string | null, sourceRevision: string | null) {
  return crypto.createHash('sha256').update(JSON.stringify([
    subject.package_id, subject.visibility, subject.access_policy_ref,
    subject.credential_provider, subject.source_repo, packagePublicationRef(subject),
    subject.publication_channel_admission,
    credentialHandle, sourceRevision,
  ])).digest('hex');
}

function readAccessSnapshot(subject: PackageAccessSubject, env: NodeJS.ProcessEnv, binding: string, now: Date): AgentPackageAccessDecision | null {
  try {
    const payload: unknown = JSON.parse(fs.readFileSync(accessSnapshotFile(subject, env), 'utf8'));
    if (!isRecord(payload) || payload.binding !== binding || !isRecord(payload.decision)) return null;
    const decision = payload.decision;
    if (!['authorized', 'forbidden', 'expired', 'unknown'].includes(String(decision.status))
      || typeof decision.expires_at !== 'string' || Date.parse(decision.expires_at) <= now.getTime()
      || typeof decision.verified_at !== 'string' || !Number.isFinite(Date.parse(decision.verified_at))
      || typeof decision.download_allowed !== 'boolean' || typeof decision.discover_allowed !== 'boolean') return null;
    if (decision.status === 'authorized' && (!decision.download_allowed || !decision.discover_allowed
      || !/^sha256:[0-9a-f]{64}$/.test(String(decision.security_revision))
      || (packagePublicationRef(subject) && !/^sha256:[0-9a-f]{64}$/.test(String(decision.registry_digest))))) return null;
    return decision as AgentPackageAccessDecision;
  } catch { return null; }
}

function writeAccessSnapshot(subject: PackageAccessSubject, env: NodeJS.ProcessEnv, binding: string, decision: AgentPackageAccessDecision, now: Date) {
  const destination = accessSnapshotFile(subject, env);
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, JSON.stringify({
      surface_kind: 'opl_package_access_snapshot.v1', binding,
      decision: { ...decision, verified_at: decision.verified_at ?? now.toISOString(),
        expires_at: decision.expires_at ?? new Date(now.getTime() + 60_000).toISOString() },
    }), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, destination);
  } catch {
    // A cache write cannot authorize a download or turn successful verification into failure.
  } finally { try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ } }
}

export function resolvePackageAccessDecision(
  manifest: PackageAccessSubject,
  env: NodeJS.ProcessEnv = process.env,
  options: PackageAccessOptions = {},
): AgentPackageAccessDecision {
  const visibility = manifest.visibility ?? 'public';
  const publicationRef = packagePublicationRef(manifest);
  const owner = publicationRef?.match(/^ghcr\.io\/([a-z0-9._-]+)\//)?.[1]
    ?? null;
  const base: AgentPackageAccessDecision = {
    visibility,
    status: visibility === 'public' ? 'public' : 'unknown',
    provider_id: manifest.credential_provider ?? null,
    credential_handle: null,
    source_id: owner ? `github-packages:${owner}` : null,
    source_ref: manifest.source_repo ?? null,
    access_policy_ref: manifest.access_policy_ref ?? null,
    verified_at: null,
    expires_at: null,
    security_revision: null,
    reason: null,
    discover_allowed: visibility === 'public',
    download_allowed: visibility === 'public',
    registry_digest: null,
  };
  if (visibility === 'public') return base;
  const source = resolvePackageSourceCredentialProvider(manifest.source_repo, publicationRef, options.env ?? env);
  const credentialHandle = options.credentialHandle !== undefined ? options.credentialHandle : source?.credential_handle ?? null;
  const sourceRevision = source && 'revision' in source ? String(source.revision) : null;
  if (options.disabled || source?.enabled === false) return { ...base, status: 'revoked', reason: 'package_source_disconnected' };
  if ((!publicationRef) || !manifest.access_policy_ref || manifest.credential_provider !== 'github_packages') {
    return { ...base, reason: 'package_access_contract_incomplete_or_provider_unsupported' };
  }
  const repository = publicationRef?.replace(/^ghcr\.io\//, '').split(/[:@]/)[0];
  if (manifest.access_policy_ref !== `github-package:${repository}`) {
    return { ...base, reason: 'package_access_policy_binding_mismatch' };
  }
  if (!credentialHandle) return { ...base, status: 'signed_out', reason: 'package_access_credential_required' };
  const now = (options.now ?? (() => new Date()))();
  const binding = accessBinding(manifest, credentialHandle, sourceRevision);
  if (options.verification === 'cached') {
    return readAccessSnapshot(manifest, options.env ?? env, binding, now)
      ?? { ...base, credential_handle: credentialHandle, reason: 'package_access_check_required' };
  }
  const readback = (options.verify ?? verifyGithubPackagesAccess)({
    packageId: manifest.package_id,
    publicationRef: publicationRef!,
    accessPolicyRef: manifest.access_policy_ref,
    sourceRef: manifest.source_repo,
    env: options.env ?? env,
    credentialHandle,
    now: options.now,
  });
  const decision = { ...base, ...readback, visibility };
  writeAccessSnapshot(manifest, options.env ?? env, binding, decision, now);
  return decision;
}

export function assertPackageDownloadAllowed(manifest: PackageAccessSubject, env: NodeJS.ProcessEnv = process.env, options: PackageAccessOptions = {}) {
  const decision = resolvePackageAccessDecision(manifest, env, { ...options, verification: 'live' });
  if (!decision.download_allowed) {
    throw new FrameworkContractError('codex_command_failed', 'Package download access is unavailable.', {
      package_id: manifest.package_id,
      failure_code: 'package_access_denied',
      access_status: decision.status,
      reason: decision.reason,
    });
  }
  return decision;
}

/** Refresh only the owner-declared private Packages for an explicitly checked source. */
export async function refreshGithubPackageSourceAccess(sourceId: string, env: NodeJS.ProcessEnv = process.env) {
  const { discoverCurrentOwnerPackageDescriptors } = await import('./installed-codex-plugin-directory.ts');
  const results: Array<{ package_id: string; status: AgentPackageAccessStatus }> = [];
  for (const descriptor of discoverCurrentOwnerPackageDescriptors().values()) {
    const manifest = descriptor.manifest;
    if (manifest.visibility !== 'authorized_only') continue;
    const source = resolvePackageSourceCredentialProvider(manifest.source_repo, packagePublicationRef(manifest), env);
    if (source?.source_id !== sourceId) continue;
    const decision = resolvePackageAccessDecision(manifest, env, { verification: 'live' });
    results.push({ package_id: manifest.package_id, status: decision.status });
  }
  return results;
}
