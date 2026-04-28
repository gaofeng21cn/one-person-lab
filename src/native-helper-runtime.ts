import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './runtime-state-paths.ts';
import {
  type NativeStateIndexPersistence,
  persistNativeStateIndex,
  readNativeStateIndexPersistence,
} from './native-index-lifecycle.ts';

const PROTOCOL_VERSION = 'opl_native_helper.v1';
const SOURCE_OF_TRUTH_RULE =
  'OPL persists native helper indexes for fast lookup, then dereferences domain-owned durable truth before acting.';

type NativeHelperDefinition = {
  helper_id: string;
  binary: string;
};

type HelperResolution = {
  helper_id: string;
  binary: string;
  status: 'resolved' | 'missing';
  source: 'explicit_binary' | 'explicit_bin_dir' | 'state_cache' | 'workspace_target_debug' | 'path' | 'not_found';
  path?: string;
  repair_hint?: string;
};

type NativeHelperInvocation = {
  helper_id: string;
  request_id: string;
  status: 'ok' | 'unavailable' | 'execution_error' | 'protocol_error' | 'helper_error';
  resolution: HelperResolution;
  helper_version?: string;
  binary_version?: string;
  crate_name?: string;
  crate_version?: string;
  result?: unknown;
  errors: Array<{ code: string; message: string }>;
};

type NativeHelperProjection = {
  lifecycle: NativeHelperLifecycle;
  runtime: {
    status: 'available' | 'degraded' | 'unavailable';
    protocol_version: typeof PROTOCOL_VERSION;
    discovery: {
      repair_command: 'npm run native:repair';
      helper_bin_dir_env: 'OPL_NATIVE_HELPER_BIN_DIR';
      helpers: HelperResolution[];
    };
    invocations: NativeHelperInvocation[];
  };
  persistence: NativeStateIndexPersistence;
};

type NativeHelperLifecycle = {
  status: 'ready_to_build' | 'package_source_incomplete';
  commands: {
    build: 'npm run native:build';
    cache: 'npm run native:cache';
    doctor: 'npm run native:doctor';
    prebuild: 'npm run native:prebuild';
    prebuild_pack: 'npm run native:prebuild-pack';
    prebuild_check: 'npm run native:prebuild-check';
    repair: 'npm run native:repair';
    test: 'npm run native:test';
  };
  package: {
    status: 'included' | 'missing_files';
    required_files: string[];
    missing_files: string[];
    npm_files: string[];
  };
  prebuild: {
    install_command: 'npm run native:prebuild';
    pack_command: 'npm run native:prebuild-pack';
    check_command: 'npm run native:prebuild-check';
    default_prebuild_root: string;
    restore_order: string[];
  };
  discovery: {
    binary_discovery_order: string[];
    helper_bin_dir_env: 'OPL_NATIVE_HELPER_BIN_DIR';
    helper_binary_env_template: 'OPL_NATIVE_HELPER_<HELPER_ID>_BIN';
  };
  cache: {
    command: 'npm run native:cache';
    cache_dir: string;
    target_triple: string;
    crate_version: string;
  };
};

export type NativeHelperDoctor = {
  surface_kind: 'opl_native_helper_lifecycle_doctor';
  lifecycle: NativeHelperLifecycle;
  runtime: NativeHelperProjection['runtime'];
  source_of_truth_rule: typeof SOURCE_OF_TRUTH_RULE;
};

export type NativeHelperHealthStatus = {
  surface_kind: 'opl_native_helper_environment_status';
  health_status: 'ready' | 'attention_needed' | 'missing';
  lifecycle: NativeHelperLifecycle;
  runtime: NativeHelperProjection['runtime'];
  issues: string[];
};

export type NativeHelperRepairAction = {
  action: 'repair_native_helpers';
  status: 'completed' | 'failed' | 'skipped_ready' | 'skipped_requested';
  command_preview: string[];
  before: NativeHelperDoctor;
  after: NativeHelperDoctor;
  stdout: string;
  stderr: string;
  note: string | null;
};

const NATIVE_HELPER_COMMANDS = {
  build: 'npm run native:build',
  cache: 'npm run native:cache',
  doctor: 'npm run native:doctor',
  prebuild: 'npm run native:prebuild',
  prebuild_pack: 'npm run native:prebuild-pack',
  prebuild_check: 'npm run native:prebuild-check',
  repair: 'npm run native:repair',
  test: 'npm run native:test',
} as const;

export const DEFAULT_NATIVE_HELPERS = [
  { helper_id: 'opl-sysprobe', binary: 'opl-sysprobe' },
  { helper_id: 'opl-doctor-native', binary: 'opl-doctor-native' },
  { helper_id: 'opl-runtime-watch', binary: 'opl-runtime-watch' },
  { helper_id: 'opl-artifact-indexer', binary: 'opl-artifact-indexer' },
  { helper_id: 'opl-state-indexer', binary: 'opl-state-indexer' },
] as const;

const NATIVE_HELPER_PACKAGE_FILES = [
  'Cargo.toml',
  'Cargo.lock',
  'native/opl-native-helper/Cargo.toml',
  'native/opl-native-helper/src/lib.rs',
  'native/opl-native-helper/src/bin',
  'scripts/native-helper-cache.mjs',
  'scripts/native-helper-doctor.mjs',
  'scripts/native-helper-family-smoke.mjs',
  'scripts/native-helper-pack-check.mjs',
  'scripts/native-helper-prebuild.mjs',
  'scripts/native-helper-repair.mjs',
] as const;

const NATIVE_HELPER_NPM_FILES = [
  'Cargo.toml',
  'Cargo.lock',
  'native/opl-native-helper/Cargo.toml',
  'native/opl-native-helper/src',
  'scripts/native-helper-cache.mjs',
  'scripts/native-helper-doctor.mjs',
  'scripts/native-helper-family-smoke.mjs',
  'scripts/native-helper-pack-check.mjs',
  'scripts/native-helper-prebuild.mjs',
  'scripts/native-helper-repair.mjs',
] as const;

const RUNTIME_MANAGER_HELPER_SEQUENCE = [
  {
    helper_id: 'opl-doctor-native',
    request_id: 'runtime-manager-doctor',
    input: {},
    index_key: 'doctor',
  },
  {
    helper_id: 'opl-state-indexer',
    request_id: 'runtime-manager-state-index',
    input: () => ({
      workspace_roots: [repoRoot(), resolveFrontDeskStatePaths().state_dir],
      max_depth: 4,
    }),
    index_key: 'state_index',
  },
  {
    helper_id: 'opl-artifact-indexer',
    request_id: 'runtime-manager-artifact-index',
    input: () => ({
      workspace_root: repoRoot(),
      artifact_roots: [
        path.join(repoRoot(), 'contracts'),
        path.join(resolveFrontDeskStatePaths().state_dir, 'artifacts'),
      ],
      artifact_extensions: ['json', 'md'],
      max_depth: 5,
    }),
    index_key: 'artifact_manifest',
  },
  {
    helper_id: 'opl-runtime-watch',
    request_id: 'runtime-manager-runtime-watch',
    input: () => ({
      watch_roots: [path.join(repoRoot(), 'contracts'), resolveFrontDeskStatePaths().state_dir],
      max_depth: 4,
    }),
    index_key: 'runtime_health',
  },
] as const;

export function buildNativeHelperProjection(
  helpers: readonly NativeHelperDefinition[],
  input: { persistIndexes?: boolean } = {},
): NativeHelperProjection {
  const statePaths = ensureFrontDeskStateDir();
  const lifecycle = buildNativeHelperLifecycle();
  const runtime = inspectNativeHelperRuntime(helpers);
  const persistence = input.persistIndexes === false
    ? readNativeStateIndexPersistence({
      stateDir: statePaths.state_dir,
      sourceOfTruthRule: SOURCE_OF_TRUTH_RULE,
    })
    : persistNativeStateIndex({
      stateDir: statePaths.state_dir,
      invocations: runtime.invocations,
      indexSpecs: RUNTIME_MANAGER_HELPER_SEQUENCE
        .filter((spec) => spec.helper_id !== 'opl-doctor-native')
        .map((spec) => ({ helper_id: spec.helper_id, index_key: spec.index_key })),
      protocolVersion: PROTOCOL_VERSION,
      sourceOfTruthRule: SOURCE_OF_TRUTH_RULE,
    });

  return {
    lifecycle,
    runtime,
    persistence,
  };
}

export function buildNativeHelperDoctor(
  helpers: readonly NativeHelperDefinition[],
): NativeHelperDoctor {
  return {
    surface_kind: 'opl_native_helper_lifecycle_doctor',
    lifecycle: buildNativeHelperLifecycle(),
    runtime: inspectNativeHelperRuntime(helpers),
    source_of_truth_rule: SOURCE_OF_TRUTH_RULE,
  };
}

export function buildNativeHelperHealthStatus(
  helpers: readonly NativeHelperDefinition[] = DEFAULT_NATIVE_HELPERS,
): NativeHelperHealthStatus {
  const doctor = buildNativeHelperDoctor(helpers);
  const runtimeIssues = doctor.runtime.invocations.flatMap((invocation) => invocation.errors.map((error) => error.code));
  const packageIssues = doctor.lifecycle.package.missing_files.map((file) => `missing_package_file:${file}`);
  const healthStatus =
    doctor.lifecycle.package.status === 'missing_files'
      ? 'missing'
      : doctor.runtime.status === 'available'
        ? 'ready'
        : 'attention_needed';

  return {
    surface_kind: 'opl_native_helper_environment_status',
    health_status: healthStatus,
    lifecycle: doctor.lifecycle,
    runtime: doctor.runtime,
    issues: [...new Set([...packageIssues, ...runtimeIssues])],
  };
}

export function runNativeHelperRepairAction(input: { skip?: boolean } = {}): NativeHelperRepairAction {
  const before = buildNativeHelperDoctor(DEFAULT_NATIVE_HELPERS);
  if (input.skip) {
    return {
      action: 'repair_native_helpers',
      status: 'skipped_requested',
      command_preview: [],
      before,
      after: before,
      stdout: '',
      stderr: '',
      note: 'Native helper repair was skipped by the install command input.',
    };
  }
  if (before.runtime.status === 'available') {
    return {
      action: 'repair_native_helpers',
      status: 'skipped_ready',
      command_preview: [],
      before,
      after: before,
      stdout: '',
      stderr: '',
      note: 'Native helpers are already available.',
    };
  }

  const overrideCommand = process.env.OPL_NATIVE_HELPER_REPAIR_COMMAND?.trim();
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandPreview = overrideCommand ? [overrideCommand] : [npmCommand, 'run', 'native:repair'];
  const result = overrideCommand
    ? spawnSync(overrideCommand, {
      cwd: repoRoot(),
      env: process.env,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 8 * 1024 * 1024,
    })
    : spawnSync(npmCommand, ['run', 'native:repair'], {
      cwd: repoRoot(),
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
  const after = buildNativeHelperDoctor(DEFAULT_NATIVE_HELPERS);
  const status = result.status === 0 && after.runtime.status === 'available' ? 'completed' : 'failed';

  return {
    action: 'repair_native_helpers',
    status,
    command_preview: commandPreview,
    before,
    after,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    note: status === 'completed'
      ? null
      : 'Native helper repair command finished without making every runtime helper available.',
  };
}

export function buildNativeHelperLifecycle(): NativeHelperLifecycle {
  const packageRoot = repoRoot();
  const missingFiles = NATIVE_HELPER_PACKAGE_FILES.filter((requiredFile) => {
    return !pathExists(path.join(packageRoot, requiredFile));
  });
  const npmFiles = packageJsonFiles(packageRoot);
  const missingNpmFiles = NATIVE_HELPER_NPM_FILES.filter((requiredFile) => !npmFiles.includes(requiredFile));
  const allMissing = [...missingFiles, ...missingNpmFiles];

  return {
    status: allMissing.length === 0 ? 'ready_to_build' : 'package_source_incomplete',
    commands: NATIVE_HELPER_COMMANDS,
    package: {
      status: allMissing.length === 0 ? 'included' : 'missing_files',
      required_files: [...NATIVE_HELPER_PACKAGE_FILES],
      missing_files: allMissing,
      npm_files: npmFiles,
    },
    prebuild: {
      install_command: 'npm run native:prebuild',
      pack_command: 'npm run native:prebuild-pack',
      check_command: 'npm run native:prebuild-check',
      default_prebuild_root: path.join(repoRoot(), 'native-helper-prebuilds'),
      restore_order: [
        'OPL_NATIVE_HELPER_PREBUILD_ROOT',
        'package native-helper-prebuilds',
        'local Cargo build fallback',
      ],
    },
    discovery: {
      binary_discovery_order: [
        'OPL_NATIVE_HELPER_<HELPER_ID>_BIN',
        'OPL_NATIVE_HELPER_BIN_DIR',
        'OPL_STATE_DIR native-helper cache',
        'workspace target/debug',
        'PATH',
      ],
      helper_bin_dir_env: 'OPL_NATIVE_HELPER_BIN_DIR',
      helper_binary_env_template: 'OPL_NATIVE_HELPER_<HELPER_ID>_BIN',
    },
    cache: {
      command: 'npm run native:cache',
      cache_dir: nativeHelperCacheDir(resolveFrontDeskStatePaths().state_dir),
      target_triple: nativeHelperTargetTriple(),
      crate_version: nativeHelperCrateVersion(),
    },
  };
}

function inspectNativeHelperRuntime(
  helpers: readonly NativeHelperDefinition[],
): NativeHelperProjection['runtime'] {
  const resolutions = helpers.map(resolveNativeHelper);
  const helperById = new Map(helpers.map((helper) => [helper.helper_id, helper]));
  const resolutionById = new Map(resolutions.map((resolution) => [resolution.helper_id, resolution]));

  const invocations = RUNTIME_MANAGER_HELPER_SEQUENCE.map((spec) => {
    const helper = helperById.get(spec.helper_id);
    const resolution = resolutionById.get(spec.helper_id);
    if (!helper || !resolution) {
      return missingInvocation(spec.helper_id, spec.request_id);
    }
    const requestInput = typeof spec.input === 'function' ? spec.input() : spec.input;
    return invokeNativeHelper(helper, resolution, {
      ...requestInput,
      request_id: spec.request_id,
    });
  });

  return {
    status: resolveRuntimeStatus(invocations),
    protocol_version: PROTOCOL_VERSION,
    discovery: {
      repair_command: 'npm run native:repair',
      helper_bin_dir_env: 'OPL_NATIVE_HELPER_BIN_DIR',
      helpers: resolutions,
    },
    invocations,
  };
}

function invokeNativeHelper(
  helper: NativeHelperDefinition,
  resolution: HelperResolution,
  input: Record<string, unknown>,
): NativeHelperInvocation {
  const requestId = String(input.request_id);
  if (resolution.status !== 'resolved' || !resolution.path) {
    return {
      helper_id: helper.helper_id,
      request_id: requestId,
      status: 'unavailable',
      resolution,
      errors: [
        {
          code: 'helper_binary_missing',
          message: `${helper.binary} is not available; run npm run native:repair or set OPL_NATIVE_HELPER_BIN_DIR.`,
        },
      ],
    };
  }

  const result = spawnSync(resolution.path, [], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.error) {
    return invocationError(helper, requestId, resolution, 'execution_error', result.error.message);
  }
  if (result.status !== 0) {
    return invocationError(
      helper,
      requestId,
      resolution,
      'execution_error',
      result.stderr.trim() || `${helper.binary} exited with status ${result.status}`,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
  } catch (error) {
    return invocationError(
      helper,
      requestId,
      resolution,
      'protocol_error',
      error instanceof Error ? error.message : String(error),
    );
  }

  const protocolVersion = payload.protocol_version;
  const payloadHelperId = payload.helper_id;
  const ok = payload.ok;
  if (protocolVersion !== PROTOCOL_VERSION || payloadHelperId !== helper.helper_id || typeof ok !== 'boolean') {
    return invocationError(
      helper,
      requestId,
      resolution,
      'protocol_error',
      'native helper response did not match the opl_native_helper.v1 envelope',
    );
  }

  const errors = normalizeErrors(payload.errors);
  if (!ok) {
    return {
      helper_id: helper.helper_id,
      request_id: requestId,
      status: 'helper_error',
      resolution,
      helper_version: stringValue(payload.helper_version),
      binary_version: stringValue(payload.binary_version),
      crate_name: stringValue(payload.crate_name),
      crate_version: stringValue(payload.crate_version),
      errors,
    };
  }

  return {
    helper_id: helper.helper_id,
    request_id: requestId,
    status: 'ok',
    resolution,
    helper_version: stringValue(payload.helper_version),
    binary_version: stringValue(payload.binary_version),
    crate_name: stringValue(payload.crate_name),
    crate_version: stringValue(payload.crate_version),
    result: payload.result,
    errors,
  };
}

function resolveNativeHelper(helper: NativeHelperDefinition): HelperResolution {
  const explicitBinaryEnv = `OPL_NATIVE_HELPER_${helper.helper_id.toUpperCase().replaceAll('-', '_')}_BIN`;
  const explicitBinary = process.env[explicitBinaryEnv]?.trim();
  if (explicitBinary) {
    return pathExists(explicitBinary)
      ? resolved(helper, explicitBinary, 'explicit_binary')
      : missing(helper, 'explicit_binary');
  }

  const explicitBinDir = process.env.OPL_NATIVE_HELPER_BIN_DIR?.trim();
  if (explicitBinDir) {
    const candidate = path.join(explicitBinDir, nativeHelperExecutableName(helper.binary));
    return pathExists(candidate) ? resolved(helper, candidate, 'explicit_bin_dir') : missing(helper, 'explicit_bin_dir');
  }

  const stateCacheCandidate = path.join(
    nativeHelperCacheDir(resolveFrontDeskStatePaths().state_dir),
    nativeHelperExecutableName(helper.binary),
  );
  if (pathExists(stateCacheCandidate)) {
    return resolved(helper, stateCacheCandidate, 'state_cache');
  }

  const targetDebugCandidate = path.join(repoRoot(), 'target', 'debug', nativeHelperExecutableName(helper.binary));
  if (pathExists(targetDebugCandidate)) {
    return resolved(helper, targetDebugCandidate, 'workspace_target_debug');
  }

  for (const entry of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(entry, nativeHelperExecutableName(helper.binary));
    if (pathExists(candidate)) {
      return resolved(helper, candidate, 'path');
    }
  }

  return missing(helper, 'not_found');
}

function resolveRuntimeStatus(invocations: readonly NativeHelperInvocation[]) {
  if (invocations.every((invocation) => invocation.status === 'ok')) {
    return 'available';
  }
  if (invocations.some((invocation) => invocation.status === 'ok')) {
    return 'degraded';
  }
  return 'unavailable';
}

function missingInvocation(helperId: string, requestId: string): NativeHelperInvocation {
  return {
    helper_id: helperId,
    request_id: requestId,
    status: 'unavailable',
    resolution: {
      helper_id: helperId,
      binary: helperId,
      status: 'missing',
      source: 'not_found',
      repair_hint: 'Run npm run native:repair or set OPL_NATIVE_HELPER_BIN_DIR.',
    },
    errors: [{ code: 'helper_definition_missing', message: `${helperId} is not present in the helper catalog` }],
  };
}

function invocationError(
  helper: NativeHelperDefinition,
  requestId: string,
  resolution: HelperResolution,
  status: 'execution_error' | 'protocol_error',
  message: string,
): NativeHelperInvocation {
  return {
    helper_id: helper.helper_id,
    request_id: requestId,
    status,
    resolution,
    errors: [{ code: status, message }],
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function normalizeErrors(value: unknown): Array<{ code: string; message: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      code: typeof entry.code === 'string' ? entry.code : 'native_helper_error',
      message: typeof entry.message === 'string' ? entry.message : JSON.stringify(entry),
    }));
}

function resolved(
  helper: NativeHelperDefinition,
  helperPath: string,
  source: HelperResolution['source'],
): HelperResolution {
  return {
    helper_id: helper.helper_id,
    binary: helper.binary,
    status: 'resolved',
    source,
    path: helperPath,
  };
}

function missing(
  helper: NativeHelperDefinition,
  source: HelperResolution['source'],
): HelperResolution {
  return {
    helper_id: helper.helper_id,
    binary: helper.binary,
    status: 'missing',
    source,
    repair_hint: 'Run npm run native:repair or set OPL_NATIVE_HELPER_BIN_DIR.',
  };
}

function pathExists(candidate: string) {
  return fs.existsSync(candidate);
}

function packageJsonFiles(packageRoot: string): string[] {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      files?: unknown;
    };
    if (!Array.isArray(packageJson.files)) {
      return [];
    }
    return packageJson.files.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function nativeHelperCacheDir(stateDir: string) {
  return path.join(stateDir, 'native-helper', 'bin', nativeHelperTargetTriple(), nativeHelperCrateVersion());
}

function nativeHelperTargetTriple() {
  return `${process.platform}-${process.arch}`;
}

function nativeHelperExecutableName(binary: string) {
  return process.platform === 'win32' ? `${binary}.exe` : binary;
}

function nativeHelperCrateVersion() {
  try {
    const cargoToml = fs.readFileSync(path.join(repoRoot(), 'native/opl-native-helper/Cargo.toml'), 'utf8');
    const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
