import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export type RuntimeEnvironmentCommand =
  | 'inspect'
  | 'lock'
  | 'cache status'
  | 'doctor'
  | 'run-context';

export interface RuntimeEnvironmentTargetInput {
  domainId?: string;
  profileId?: string;
  platformId?: string;
}

const CONTRACT_REF = 'contracts/opl-framework/runtime-environment-substrate-contract.json';
const CONTRACT_PATH = fileURLToPath(new URL(`../${CONTRACT_REF}`, import.meta.url));

function readContract(): JsonRecord {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')) as JsonRecord;
}

export const RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT = readContract();

function authorityBoundary() {
  return RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.authority_boundary as JsonRecord;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function defaultPlatform() {
  return process.platform === 'darwin' && process.arch === 'arm64'
    ? 'macos-arm64'
    : `${process.platform}-${process.arch}`;
}

function normalizeTarget(input: RuntimeEnvironmentTargetInput) {
  return {
    domain_id: input.domainId ?? 'family-defaults',
    profile_id: input.profileId ?? 'core',
    platform_id: input.platformId ?? defaultPlatform(),
  };
}

function baseReadback(command: RuntimeEnvironmentCommand, input: RuntimeEnvironmentTargetInput = {}) {
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
    dry_run: true,
    can_claim_runtime_ready: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    authority_boundary: authorityBoundary(),
    forbidden_claims: stringList(RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.forbidden_claims),
  };
}

export function buildRuntimeEnvironmentInspectReadback(input: RuntimeEnvironmentTargetInput) {
  return {
    ...baseReadback('inspect', input),
    descriptor: {
      surface_kind: 'opl_runtime_environment_descriptor',
      status: 'planned_not_materialized',
      source: 'domain_environment_intent',
      required_fields: (
        RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.descriptor_contract as JsonRecord
      ).required_fields,
      body_policy: (
        RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.descriptor_contract as JsonRecord
      ).body_policy,
      writes_domain_truth: false,
      writes_runtime_root: false,
    },
    materialization_status: {
      status: 'not_materialized',
      reason: 'skeleton_readback_only',
      writes_runtime_root: false,
      runtime_root: null,
      receipt_ref: null,
    },
    module_mapping: RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.module_mapping,
  };
}

export function buildRuntimeEnvironmentLockReadback(input: RuntimeEnvironmentTargetInput) {
  return {
    ...baseReadback('lock', input),
    lock: {
      surface_kind: 'opl_runtime_environment_lock_projection',
      status: 'planned_not_generated',
      writes_runtime_root: false,
      writes_domain_repo: false,
      descriptor_digest: null,
      runtime_lock_ref: null,
      layer_types: stringList(RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.layer_types),
      cache_key_inputs: (
        (RUNTIME_ENVIRONMENT_SUBSTRATE_CONTRACT.cache_policy as JsonRecord)
          .cache_key_inputs
      ),
    },
  };
}

export function buildRuntimeEnvironmentCacheStatusReadback() {
  return {
    ...baseReadback('cache status'),
    cache: {
      surface_kind: 'opl_runtime_environment_cache_status',
      status: 'planned_not_inspected',
      cache_hit_counts_as_ready: false,
      cache_miss_counts_as_readiness_failure: false,
      materialization_failure_counts_as_runtime_environment_failure: true,
      cache_root: null,
      layer_count: 0,
      active_runtime_roots: [],
    },
  };
}

export function buildRuntimeEnvironmentDoctorReadback() {
  return {
    ...baseReadback('doctor'),
    doctor: {
      surface_kind: 'opl_runtime_environment_doctor',
      status: 'planned_not_executed',
      can_block_domain_progress: false,
      findings: [
        {
          severity: 'info',
          code: 'runtime_environment_materializer_not_landed',
          message:
            'Runtime environment substrate currently exposes contract and readback skeletons only.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: false,
        },
      ],
    },
  };
}

export function buildRuntimeEnvironmentRunContextReadback(input: RuntimeEnvironmentTargetInput) {
  return {
    ...baseReadback('run-context', input),
    run_context: {
      surface_kind: 'opl_runtime_environment_run_context',
      status: 'planned_not_bound',
      environment_bindings: {},
      runtime_root: null,
      materialization_receipt_ref: null,
      writes_domain_truth: false,
      writes_domain_memory_body: false,
      writes_artifact_body: false,
      writes_runtime_root: false,
      can_schedule_domain_stage: false,
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
