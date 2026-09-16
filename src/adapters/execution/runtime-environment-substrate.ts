import fs from 'node:fs';
import path from 'node:path';
import { parseJsonText } from '../../kernel/json-file.ts';
import { RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT, authorityBoundary, baseReadback,
  buildRunContextConsumerPreflight, cacheInventoryProjection, normalizeTarget, runtimeArtifactRoot,
  relativeArtifactBuildRef, runtimeEnvironmentConsumerBoundary, runContextTargetMismatchFields, CONTRACT_PATH,
} from './runtime-environment-substrate-parts/shared.ts';
import type { JsonRecord, RuntimeEnvironmentTargetInput } from './runtime-environment-substrate-parts/shared.ts';
export { buildRuntimeEnvironmentPrepareReadback } from './runtime-environment-prepare.ts';
export { buildRuntimeEnvironmentDoctorReadback } from './runtime-environment-substrate-parts/doctor-readback.ts';
export { RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
  type RuntimeEnvironmentCommand, type RuntimeEnvironmentPrepareInput, type RuntimeEnvironmentTargetInput,
} from './runtime-environment-substrate-parts/shared.ts';

export function buildRuntimeEnvironmentInspectReadback(input: RuntimeEnvironmentTargetInput) {
  return { ...baseReadback('inspect', input), ...buildRuntimeEnvironmentRunContextReadback(input), command: 'inspect' };
}

export function buildRuntimeEnvironmentCacheInventoryReadback() {
  return { ...baseReadback('cache inventory'), cache_inventory: cacheInventoryProjection() };
}

export function buildRuntimeEnvironmentCacheStatusReadback() {
  return { ...baseReadback('cache status'), cache: cacheInventoryProjection() };
}

export function buildRuntimeEnvironmentRunContextReadback(input: RuntimeEnvironmentTargetInput) {
  const target = normalizeTarget(input);
  const artifactRoot = runtimeArtifactRoot(input);
  if (artifactRoot) {
    const runContextPath = path.join(path.resolve(artifactRoot), 'build', 'dependency_run_context.json');
    if (fs.existsSync(runContextPath)) {
      const runContext = parseJsonText(fs.readFileSync(runContextPath, 'utf8')) as JsonRecord;
      const targetMismatchFields = runContextTargetMismatchFields(target, runContext);
      const consumerPreflight = targetMismatchFields.length === 0
        ? buildRunContextConsumerPreflight('bound')
        : buildRunContextConsumerPreflight('target_mismatch', targetMismatchFields);
      return {
        ...baseReadback('run-context', input),
        run_context: {
          ...runContext,
          writes_domain_truth: false,
          writes_runtime_root: false,
          can_schedule_domain_stage: false,
          can_claim_provider_ready: false,
          can_claim_runtime_ready: false,
          can_claim_domain_ready: false,
          can_claim_app_release_ready: false,
          consumer_boundary: runtimeEnvironmentConsumerBoundary(),
          consumer_preflight: consumerPreflight,
        },
      };
    }
    return {
      ...baseReadback('run-context', input),
      run_context: {
        surface_kind: 'opl_runtime_environment_run_context',
        status: 'missing_run_context',
        environment_tier: 'fast_local_env',
        host_binary_allowed: true,
        host_package_fallback_allowed: false,
        artifact_root: path.resolve(artifactRoot),
        run_context_ref: relativeArtifactBuildRef('dependency_run_context.json'),
        environment_bindings: {},
        runtime_root: null,
        materialization_receipt_ref: null,
        writes_domain_truth: false,
        writes_domain_memory_body: false,
        writes_artifact_body: false,
        writes_runtime_root: false,
        can_schedule_domain_stage: false,
        can_claim_provider_ready: false,
        can_claim_runtime_ready: false,
        can_claim_domain_ready: false,
        can_claim_app_release_ready: false,
        consumer_boundary: runtimeEnvironmentConsumerBoundary(),
        consumer_preflight: buildRunContextConsumerPreflight('missing_run_context'),
      },
    };
  }
  return {
    ...baseReadback('run-context', input),
    run_context: {
      surface_kind: 'opl_runtime_environment_run_context',
      status: 'planned_not_bound',
      environment_tier: 'fast_local_env',
      host_binary_allowed: true,
      host_package_fallback_allowed: false,
      environment_bindings: {},
      runtime_root: null,
      materialization_receipt_ref: null,
      writes_domain_truth: false,
      writes_domain_memory_body: false,
      writes_artifact_body: false,
      writes_runtime_root: false,
      can_schedule_domain_stage: false,
      can_claim_provider_ready: false,
      can_claim_runtime_ready: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      consumer_boundary: runtimeEnvironmentConsumerBoundary(),
      consumer_preflight: buildRunContextConsumerPreflight('artifact_root_not_supplied'),
    },
  };
}

export function buildRuntimeEnvironmentContractReadback() {
  return {
    surface_kind: 'opl_runtime_environment_contract_readback' as const,
    version: 'opl-runtime-environment-contract-readback.v1' as const,
    contract_path: path.relative(process.cwd(), CONTRACT_PATH),
    contract: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
    authority_boundary: authorityBoundary(),
  };
}
