import { fileURLToPath } from 'node:url';

import { readJsonPayloadFile } from '../../../kernel/json-file.ts';

export type JsonRecord = Record<string, unknown>;

export type RPackageRequirement = {
  name: string;
  install_source: 'cran' | 'github';
  github_repo?: string;
};

export type RuntimeEnvironmentCommand =
  | 'inspect'
  | 'lock'
  | 'build'
  | 'materialize'
  | 'prepare'
  | 'verify'
  | 'cache status'
  | 'cache inventory'
  | 'cache prune'
  | 'doctor'
  | 'run-context';

export interface RuntimeEnvironmentTargetInput {
  domainId?: string;
  profileId?: string;
  platformId?: string;
  sandboxProvider?: 'local_managed_root' | 'external_sandbox';
  paperRoot?: string;
}

export const RUNTIME_ENVIRONMENT_FALLBACK_POINTER = 'rollback'; // reuse-first: allow runtime-environment fallback pointer, not updater/package manager.

export interface RuntimeEnvironmentMaterializeInput extends RuntimeEnvironmentTargetInput {
  apply?: boolean;
  targetPointer?: 'current' | typeof RUNTIME_ENVIRONMENT_FALLBACK_POINTER | 'staged';
}

export interface RuntimeEnvironmentCachePruneInput {
  apply?: boolean;
}

export interface RuntimeEnvironmentPrepareInput extends RuntimeEnvironmentTargetInput {
  requirementProfilePath: string;
  requirementProfileId?: string;
  paperRoot: string;
  apply?: boolean;
}

export interface RuntimeEnvironmentVerifyInput {
  runtimeRoot: string;
}

export const CONTRACT_REF = 'contracts/opl-framework/runtime-environment-substrate-contract.json';
export const CONTRACT_PATH = fileURLToPath(new URL(`../../../../${CONTRACT_REF}`, import.meta.url));

export function readContract(): JsonRecord {
  return readJsonPayloadFile(CONTRACT_PATH) as JsonRecord;
}

export const RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT = readContract();

export function authorityBoundary() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.authority_boundary as JsonRecord;
}

export function cachePolicy() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.cache_policy as JsonRecord;
}

export function materializationPolicy() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.materialization_policy as JsonRecord;
}

export function externalSandboxProviderPolicy() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.external_sandbox_provider_policy as JsonRecord;
}
