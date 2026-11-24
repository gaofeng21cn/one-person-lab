import fs from 'node:fs';
import path from 'node:path';
import {
  authorityBoundary,
  CONTRACT_REF,
  fastLocalEnvCurrentPath,
  standardToolHandoff,
  RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT,
  type JsonRecord,
  type RuntimeEnvironmentCommand,
  type RuntimeEnvironmentTargetInput,
} from './contract.ts';
import {
  normalizeTarget,
  objects,
  readJsonObject,
  runtimeEnvironmentStateRoot,
  runtimeRootVocabulary,
  stringList,
} from './target-state.ts';

export function cacheInventoryProjection() {
  const root = path.join(runtimeEnvironmentStateRoot(), 'dependency-libraries');
  const environments = fs.existsSync(root) ? fs.readdirSync(root).flatMap((name) => {
    const manifestPath = path.join(root, name, 'environment.json');
    const manifest = readJsonObject(manifestPath);
    return manifest ? [{ ...manifest, environment_manifest_ref: manifest.environment_manifest_ref ?? manifestPath }] : [];
  }) : [];
  return {
    surface_kind: 'opl_runtime_environment_cache_inventory',
    status: 'scanned',
    cache_root: root,
    environment_count: environments.length,
    environments,
    package_cache_owners: ['uv', 'renv'],
    cache_hit_counts_as_ready: false,
  };
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

export function buildRuntimeEnvironmentDoctorReadback() {
  return {
    ...baseReadback('doctor'),
    doctor: {
      surface_kind: 'opl_runtime_environment_doctor',
      status: 'cached_language_environments_and_lightweight_execution',
      can_block_domain_progress: false,
      findings: [{
        severity: 'info',
        code: 'fast_local_environment',
        message: 'Use opl env run to reuse or prepare uv/Python and renv/R dependencies. Environment versions are recorded once; executions reference that environment.',
        can_claim_runtime_ready: false,
        can_claim_domain_ready: false,
      }],
    },
  };
}

function stringRefs(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringRefs);
  }
  return [];
}

function refsFromRecord(record: JsonRecord, names: string[]) {
  return names.flatMap((name) => stringRefs(record[name]));
}

function nestedLockRecord(entry: JsonRecord, language: 'r' | 'python') {
  return [
    entry.dependency_locks,
    entry.language_locks,
    entry.language_lock_refs,
    entry.lock_refs,
  ].map((value) => (value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)[language]
    : null))
    .find((value) => value && typeof value === 'object' && !Array.isArray(value)) as JsonRecord | undefined;
}

export function uniqueRefs(values: string[]) {
  return Array.from(new Set(values));
}

export function profileLockHandoff(profile: JsonRecord, selectedRequirementProfileIds: string[]) {
  const selected = objects(profile.profiles).filter((entry) => (
    selectedRequirementProfileIds.includes(String(entry.profile_id ?? '').trim())
  ));
  const refsFor = (language: 'r' | 'python', prefixes: string[]) => {
    const nested = selected.map((entry) => nestedLockRecord(entry, language)).filter(Boolean) as JsonRecord[];
    return {
      lock_refs: uniqueRefs([
        ...selected.flatMap((entry) => refsFromRecord(entry, prefixes.flatMap((prefix) => [
          `${prefix}_lock_ref`,
          `${prefix}_lock_refs`,
        ]))),
        ...nested.flatMap((entry) => refsFromRecord(entry, ['lock_ref', 'lock_refs'])),
      ]),
      source_refs: uniqueRefs([
        ...selected.flatMap((entry) => refsFromRecord(entry, prefixes.flatMap((prefix) => [
          `${prefix}_source_ref`,
          `${prefix}_source_refs`,
        ]))),
        ...nested.flatMap((entry) => refsFromRecord(entry, ['source_ref', 'source_refs'])),
      ]),
      project_refs: uniqueRefs([
        ...selected.flatMap((entry) => refsFromRecord(entry, prefixes.flatMap((prefix) => [
          `${prefix}_project_ref`,
          `${prefix}_project_refs`,
        ]))),
        ...nested.flatMap((entry) => refsFromRecord(entry, ['project_ref', 'project_refs'])),
      ]),
    };
  };
  const r = refsFor('r', ['r', 'renv']);
  const python = refsFor('python', ['python', 'uv']);
  return {
    r: {
      tool: 'renv',
      ...r,
      renv_backed_handoff: r.lock_refs.length + r.source_refs.length + r.project_refs.length > 0,
    },
    python: {
      tool: 'uv',
      ...python,
      uv_backed_handoff: python.lock_refs.length + python.source_refs.length + python.project_refs.length > 0,
    },
  };
}
