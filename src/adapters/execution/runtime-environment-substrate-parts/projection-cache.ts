import fs from 'node:fs';
import path from 'node:path';
import { authorityBoundary, CONTRACT_REF, fastLocalEnvCurrentPath, standardToolHandoff, RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT } from './contract.ts';
import type { JsonRecord, RuntimeEnvironmentCommand, RuntimeEnvironmentTargetInput } from './contract.ts';
import { normalizeTarget, runtimeRootVocabulary, stringList, runtimeEnvironmentStateRoot, readJsonObject } from './target-state.ts';

export function cacheInventoryProjection() {
  const root = path.join(runtimeEnvironmentStateRoot(), 'dependency-libraries');
  const environments = fs.existsSync(root) ? fs.readdirSync(root).flatMap((name) => {
    const manifestPath = path.join(root, name, 'environment.json');
    const manifest = readJsonObject(manifestPath);
    return manifest ? [{ ...manifest, environment_manifest_ref: manifest.environment_manifest_ref ?? manifestPath }] : [];
  }) : [];
  return { surface_kind: 'opl_runtime_environment_cache_inventory', status: 'scanned',
    cache_root: root, environment_count: environments.length, environments,
    package_cache_owners: ['uv', 'renv'], cache_hit_counts_as_ready: false };
}

export function baseReadback(
  command: RuntimeEnvironmentCommand,
  input: RuntimeEnvironmentTargetInput = {},
  overrides: JsonRecord = {},
) {
  const target = normalizeTarget(input);
  return {
    surface_kind: 'opl_runtime_environment_readback' as const,
    version: 'opl-runtime-environment-readback.v1' as const,
    command,
    contract_ref: CONTRACT_REF,
    contract_id: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.contract_id,
    domain_id: target.domain_id,
    profile_id: target.profile_id,
    platform_id: target.platform_id,
    implementation_status: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.implementation_status,
    target_planned: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.target_planned,
    sandbox_provider: target.sandbox_provider,
    root_vocabulary: runtimeRootVocabulary(input),
    default_current_path: fastLocalEnvCurrentPath(),
    standard_tool_handoff: standardToolHandoff(),
    dry_run: true,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    authority_boundary: authorityBoundary(),
    forbidden_claims: stringList(RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.forbidden_claims),
    ...overrides,
  };
}
