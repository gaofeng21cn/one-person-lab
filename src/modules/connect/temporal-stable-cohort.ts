import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FrameworkContractError,
  isRecord,
} from '../../kernel/contract-validation.ts';
import { readJsonPayloadFile } from '../../kernel/json-file.ts';

export const TEMPORAL_STABLE_COHORT_CONTRACT_REF =
  'contracts/opl-framework/temporal-stable-cohort.json';

export const TEMPORAL_SDK_PACKAGE_NAMES = [
  '@temporalio/activity',
  '@temporalio/client',
  '@temporalio/common',
  '@temporalio/testing',
  '@temporalio/worker',
  '@temporalio/workflow',
] as const;

export type TemporalSdkPackageName = typeof TEMPORAL_SDK_PACKAGE_NAMES[number];

export type TemporalStableCohort = {
  version: 'opl-temporal-stable-cohort.v1';
  contract_id: 'opl_temporal_stable_cohort';
  surface_kind: 'opl_temporal_stable_cohort';
  contract_ref: typeof TEMPORAL_STABLE_COHORT_CONTRACT_REF;
  audited_at: string;
  stability_policy: {
    release_channel: 'stable';
    draft_allowed: false;
    prerelease_allowed: false;
  };
  server: {
    version: string;
    release_tag: string;
    tag_commit: string;
    published_at: string;
    release_url: string;
    maintained_minor_lines: string[];
  };
  cli: {
    version: string;
    release_tag: string;
    tag_commit: string;
    published_at: string;
    release_url: string;
    embedded_server_version: string;
    darwin_arm64_artifact: { file_name: string; sha256: string };
  };
  sdk: {
    version: string;
    release_tag: string;
    tag_commit: string;
    published_at: string;
    release_url: string;
    npm_dist_tag: 'latest';
    node_engine: string;
    packages: Record<TemporalSdkPackageName, string>;
  };
  compatibility: {
    sdk_server_release_independent: true;
    all_sdk_versions_compatible_with_all_server_versions: true;
    server_persistence_backward_compatibility: 'successive_minor_versions_only';
    server_upgrade_order: 'highest_current_patch_then_one_minor_at_a_time';
    sdk_server_source_ref: string;
    server_upgrade_source_ref: string;
  };
  migration: {
    grpc_gzip_default_since: string;
    grpc_gzip_automatic_fallback_since: string;
    replay_honors_recorded_sdk_flags_since: string;
    protobufjs_required_range: string;
    workflow_bundler_regression_fix_version: string;
  };
  worker: {
    bundle_api: string;
    start_api: string;
    workflow_bundle_input: 'code_path';
    real_start_gate_required: true;
  };
  replay: {
    api: string;
    corrupt_or_incompatible_history_must_fail: true;
    fixtures: Array<{
      path: string;
      bytes: number;
      sha256: string;
      recorded_sdk_version: string;
    }>;
  };
  rollback: {
    preserve_previous_worker_bundle: true;
    replay_same_history_set_before_downgrade: true;
    lockfile_only_rollback_is_sufficient: false;
  };
};

const STABLE_VERSION = /^\d+\.\d+\.\d+$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function invalid(field: string, reason: string, source: string): never {
  throw new FrameworkContractError(
    'contract_shape_invalid',
    `Temporal stable cohort field ${field} ${reason}.`,
    { contract_ref: source, field },
  );
}

function record(value: unknown, field: string, source: string) {
  if (!isRecord(value)) invalid(field, 'must be an object', source);
  return value;
}

function string(value: unknown, field: string, source: string) {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(field, 'must be a non-empty string', source);
  }
  return value;
}

function literal<T extends string | boolean>(
  value: unknown,
  expected: T,
  field: string,
  source: string,
): T {
  if (value !== expected) invalid(field, `must equal ${JSON.stringify(expected)}`, source);
  return expected;
}

function stableVersion(value: unknown, field: string, source: string) {
  const parsed = string(value, field, source);
  if (!STABLE_VERSION.test(parsed)) invalid(field, 'must be an exact stable x.y.z version', source);
  return parsed;
}

function gitCommit(value: unknown, field: string, source: string) {
  const parsed = string(value, field, source);
  if (!GIT_COMMIT.test(parsed)) invalid(field, 'must be a 40-character lowercase Git commit', source);
  return parsed;
}

function sha256(value: unknown, field: string, source: string) {
  const parsed = string(value, field, source);
  if (!SHA256.test(parsed)) invalid(field, 'must be a lowercase SHA-256 digest', source);
  return parsed;
}

function release(
  value: Record<string, unknown>,
  field: string,
  expectedRepository: string,
  source: string,
) {
  const version = stableVersion(value.version, `${field}.version`, source);
  literal(value.release_tag, `v${version}`, `${field}.release_tag`, source);
  gitCommit(value.tag_commit, `${field}.tag_commit`, source);
  string(value.published_at, `${field}.published_at`, source);
  literal(
    value.release_url,
    `https://github.com/temporalio/${expectedRepository}/releases/tag/v${version}`,
    `${field}.release_url`,
    source,
  );
  return version;
}

export function validateTemporalStableCohort(
  value: unknown,
  source = TEMPORAL_STABLE_COHORT_CONTRACT_REF,
): TemporalStableCohort {
  const payload = record(value, '$', source);
  literal(payload.version, 'opl-temporal-stable-cohort.v1', 'version', source);
  literal(payload.contract_id, 'opl_temporal_stable_cohort', 'contract_id', source);
  literal(payload.surface_kind, 'opl_temporal_stable_cohort', 'surface_kind', source);
  literal(payload.contract_ref, TEMPORAL_STABLE_COHORT_CONTRACT_REF, 'contract_ref', source);
  string(payload.audited_at, 'audited_at', source);

  const policy = record(payload.stability_policy, 'stability_policy', source);
  literal(policy.release_channel, 'stable', 'stability_policy.release_channel', source);
  literal(policy.draft_allowed, false, 'stability_policy.draft_allowed', source);
  literal(policy.prerelease_allowed, false, 'stability_policy.prerelease_allowed', source);

  const server = record(payload.server, 'server', source);
  const serverVersion = release(server, 'server', 'temporal', source);
  if (!Array.isArray(server.maintained_minor_lines) || server.maintained_minor_lines.length !== 3) {
    invalid('server.maintained_minor_lines', 'must contain the three maintained minor lines', source);
  }
  server.maintained_minor_lines.forEach((entry, index) => {
    stableVersion(entry, `server.maintained_minor_lines[${index}]`, source);
  });
  if (!server.maintained_minor_lines.includes(serverVersion)) {
    invalid('server.maintained_minor_lines', 'must include server.version', source);
  }

  const cli = record(payload.cli, 'cli', source);
  const cliVersion = release(cli, 'cli', 'cli', source);
  literal(cli.embedded_server_version, serverVersion, 'cli.embedded_server_version', source);
  const artifact = record(cli.darwin_arm64_artifact, 'cli.darwin_arm64_artifact', source);
  literal(
    artifact.file_name,
    `temporal_cli_${cliVersion}_darwin_arm64.tar.gz`,
    'cli.darwin_arm64_artifact.file_name',
    source,
  );
  sha256(artifact.sha256, 'cli.darwin_arm64_artifact.sha256', source);

  const sdk = record(payload.sdk, 'sdk', source);
  const sdkVersion = release(sdk, 'sdk', 'sdk-typescript', source);
  literal(sdk.npm_dist_tag, 'latest', 'sdk.npm_dist_tag', source);
  string(sdk.node_engine, 'sdk.node_engine', source);
  const packages = record(sdk.packages, 'sdk.packages', source);
  const packageNames = Object.keys(packages).sort();
  if (JSON.stringify(packageNames) !== JSON.stringify([...TEMPORAL_SDK_PACKAGE_NAMES].sort())) {
    invalid('sdk.packages', 'must contain exactly the six managed Temporal SDK packages', source);
  }
  for (const packageName of TEMPORAL_SDK_PACKAGE_NAMES) {
    literal(packages[packageName], sdkVersion, `sdk.packages.${packageName}`, source);
  }

  const compatibility = record(payload.compatibility, 'compatibility', source);
  literal(compatibility.sdk_server_release_independent, true, 'compatibility.sdk_server_release_independent', source);
  literal(
    compatibility.all_sdk_versions_compatible_with_all_server_versions,
    true,
    'compatibility.all_sdk_versions_compatible_with_all_server_versions',
    source,
  );
  literal(
    compatibility.server_persistence_backward_compatibility,
    'successive_minor_versions_only',
    'compatibility.server_persistence_backward_compatibility',
    source,
  );
  literal(
    compatibility.server_upgrade_order,
    'highest_current_patch_then_one_minor_at_a_time',
    'compatibility.server_upgrade_order',
    source,
  );
  string(compatibility.sdk_server_source_ref, 'compatibility.sdk_server_source_ref', source);
  string(compatibility.server_upgrade_source_ref, 'compatibility.server_upgrade_source_ref', source);

  const migration = record(payload.migration, 'migration', source);
  stableVersion(migration.grpc_gzip_default_since, 'migration.grpc_gzip_default_since', source);
  stableVersion(migration.grpc_gzip_automatic_fallback_since, 'migration.grpc_gzip_automatic_fallback_since', source);
  stableVersion(
    migration.replay_honors_recorded_sdk_flags_since,
    'migration.replay_honors_recorded_sdk_flags_since',
    source,
  );
  string(migration.protobufjs_required_range, 'migration.protobufjs_required_range', source);
  literal(
    migration.workflow_bundler_regression_fix_version,
    sdkVersion,
    'migration.workflow_bundler_regression_fix_version',
    source,
  );

  const worker = record(payload.worker, 'worker', source);
  string(worker.bundle_api, 'worker.bundle_api', source);
  string(worker.start_api, 'worker.start_api', source);
  literal(worker.workflow_bundle_input, 'code_path', 'worker.workflow_bundle_input', source);
  literal(worker.real_start_gate_required, true, 'worker.real_start_gate_required', source);

  const replay = record(payload.replay, 'replay', source);
  string(replay.api, 'replay.api', source);
  literal(
    replay.corrupt_or_incompatible_history_must_fail,
    true,
    'replay.corrupt_or_incompatible_history_must_fail',
    source,
  );
  if (!Array.isArray(replay.fixtures) || replay.fixtures.length === 0) {
    invalid('replay.fixtures', 'must contain at least one immutable history fixture', source);
  }
  const fixturePaths = new Set<string>();
  replay.fixtures.forEach((entry, index) => {
    const fixture = record(entry, `replay.fixtures[${index}]`, source);
    const fixturePath = string(fixture.path, `replay.fixtures[${index}].path`, source);
    if (!fixturePath.startsWith('tests/fixtures/temporal-history/') || fixturePaths.has(fixturePath)) {
      invalid(`replay.fixtures[${index}].path`, 'must be a unique Temporal history fixture path', source);
    }
    fixturePaths.add(fixturePath);
    if (!Number.isInteger(fixture.bytes) || Number(fixture.bytes) <= 0) {
      invalid(`replay.fixtures[${index}].bytes`, 'must be a positive integer', source);
    }
    sha256(fixture.sha256, `replay.fixtures[${index}].sha256`, source);
    stableVersion(fixture.recorded_sdk_version, `replay.fixtures[${index}].recorded_sdk_version`, source);
  });

  const rollback = record(payload.rollback, 'rollback', source);
  literal(rollback.preserve_previous_worker_bundle, true, 'rollback.preserve_previous_worker_bundle', source);
  literal(
    rollback.replay_same_history_set_before_downgrade,
    true,
    'rollback.replay_same_history_set_before_downgrade',
    source,
  );
  literal(
    rollback.lockfile_only_rollback_is_sufficient,
    false,
    'rollback.lockfile_only_rollback_is_sufficient',
    source,
  );

  return payload as TemporalStableCohort;
}

export function readTemporalStableCohort(input: { repoRoot?: string } = {}) {
  const contractPath = input.repoRoot
    ? path.join(input.repoRoot, TEMPORAL_STABLE_COHORT_CONTRACT_REF)
    : fileURLToPath(new URL(`../../../${TEMPORAL_STABLE_COHORT_CONTRACT_REF}`, import.meta.url));
  return validateTemporalStableCohort(readJsonPayloadFile(contractPath), contractPath);
}
