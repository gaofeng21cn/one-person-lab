import { fileURLToPath } from 'node:url';

import { readJsonPayloadFile } from '../../../kernel/json-file.ts';

export type JsonRecord = Record<string, unknown>;

export type RPackageRequirement = {
  name: string;
  install_source: 'cran' | 'github' | 'bioconductor';
  github_repo?: string;
  version?: string;
  minimum_version?: string;
  required_exports?: string[];
};

export type PythonPackageRequirement = {
  name: string;
};

export type RuntimeEnvironmentCommand = 'inspect' | 'prepare' | 'cache status' | 'cache inventory' | 'doctor' | 'run-context' | 'contract';

export interface RuntimeEnvironmentTargetInput {
  domainId?: string;
  profileId?: string;
  platformId?: string;
  sandboxProvider?: 'fast_local_env';
  artifactRoot?: string;
  paperRoot?: string;
  rootOption?: '--artifact-root' | '--paper-root';
}

export interface RuntimeEnvironmentPrepareInput extends RuntimeEnvironmentTargetInput {
  refresh?: boolean;
  requirementProfilePath: string;
  requirementProfileId?: string;
  requirementProfileIds?: string[];
  prepareTimeoutMs?: number;
  artifactRoot?: string;
  paperRoot?: string;
  apply?: boolean;
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

export function fastLocalEnvCurrentPath() {
  return {
    strategy_id: 'fast_local_env',
    path_id: 'default_current_path',
    role: 'current_default_for_r_python_dependency_execution',
    host_binary_allowed: true,
    host_environment_fallback_allowed: false,
    docker_required: false,
    remote_sandbox_required: false,
  };
}

export function standardToolHandoff() {
  return {
    renv: {
      tool: 'renv',
      role: 'managed_r_library_and_shared_package_cache',
      consumed_as: 'source_ref_or_project_profile',
      opl_managed_library_env: 'R_LIBS_USER',
    },
    uv: {
      tool: 'uv',
      role: 'managed_python_environment_and_shared_package_cache',
      consumed_as: 'source_ref_or_project_profile',
      opl_managed_env: 'UV_PROJECT_ENVIRONMENT',
    },
  };
}
