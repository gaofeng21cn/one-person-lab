export const SOFTWARE_SOURCE_STATUSES = ['public', 'authorized', 'signed_out', 'forbidden', 'expired', 'revoked', 'unknown'] as const;
export type SoftwareSourceStatus = typeof SOFTWARE_SOURCE_STATUSES[number];
export type SoftwareSourceProviderId = 'github_packages' | 'homebrew' | 'public_registry';
export type SoftwareSource = {
  source_id: string;
  display_name: string;
  source_kind: 'registry' | 'tap';
  source_ref: string;
  visibility: 'public' | 'authorized_only';
  provider_id: SoftwareSourceProviderId;
  enabled: boolean;
  credential_handle: string | null;
  status: SoftwareSourceStatus;
  verified_at: string | null;
  verification_reason: string | null;
  revision: string;
};
export type SoftwareSourceCheckResult = {
  status: SoftwareSourceStatus;
  verification_reason: string;
};
export type SoftwareSourceDependencies = {
  homebrewRun?: import('./homebrew-source.ts').HomebrewRunner;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  verify?: (source: SoftwareSource) => Promise<SoftwareSourceCheckResult>;
  refreshPackageAccess?: (sourceId: string) => Promise<unknown>;
  credentialReader?: (env: NodeJS.ProcessEnv, credentialHandle?: string | null) => {
    provider_id: 'github_packages'; credential_handle: string; username: string; token: string;
  } | null;
};
export type SoftwareSourceConfigureInput = {
  source_id: string;
  provider_id?: SoftwareSourceProviderId;
  credential_handle?: string | null;
  enabled?: boolean;
};
