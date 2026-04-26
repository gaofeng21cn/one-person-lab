import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureFrontDeskStateDir, resolveFrontDeskStatePaths } from './frontdesk-state.ts';

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
  source: 'explicit_binary' | 'explicit_bin_dir' | 'workspace_target_debug' | 'path' | 'not_found';
  path?: string;
  repair_hint?: string;
};

type NativeHelperInvocation = {
  helper_id: string;
  request_id: string;
  status: 'ok' | 'unavailable' | 'execution_error' | 'protocol_error' | 'helper_error';
  resolution: HelperResolution;
  result?: unknown;
  errors: Array<{ code: string; message: string }>;
};

type NativeHelperProjection = {
  runtime: {
    status: 'available' | 'degraded' | 'unavailable';
    protocol_version: typeof PROTOCOL_VERSION;
    discovery: {
      repair_command: 'npm run native:build';
      helper_bin_dir_env: 'OPL_NATIVE_HELPER_BIN_DIR';
      helpers: HelperResolution[];
    };
    invocations: NativeHelperInvocation[];
  };
  persistence: {
    status: 'written' | 'skipped_helper_unavailable' | 'skipped_helper_error' | 'write_failed';
    state_dir: string;
    index_file: string;
    source_of_truth_rule: typeof SOURCE_OF_TRUTH_RULE;
    errors: Array<{ code: string; message: string }>;
  };
};

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
): NativeHelperProjection {
  const statePaths = ensureFrontDeskStateDir();
  const indexFile = path.join(statePaths.state_dir, 'runtime-manager', 'native-state-index.json');
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

  const runtimeStatus = resolveRuntimeStatus(invocations);
  const persistence = persistNativeStateIndex(indexFile, statePaths.state_dir, invocations);

  return {
    runtime: {
      status: runtimeStatus,
      protocol_version: PROTOCOL_VERSION,
      discovery: {
        repair_command: 'npm run native:build',
        helper_bin_dir_env: 'OPL_NATIVE_HELPER_BIN_DIR',
        helpers: resolutions,
      },
      invocations,
    },
    persistence,
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
          message: `${helper.binary} is not available; run npm run native:build or set OPL_NATIVE_HELPER_BIN_DIR.`,
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
      errors,
    };
  }

  return {
    helper_id: helper.helper_id,
    request_id: requestId,
    status: 'ok',
    resolution,
    result: payload.result,
    errors,
  };
}

function persistNativeStateIndex(
  indexFile: string,
  stateDir: string,
  invocations: readonly NativeHelperInvocation[],
): NativeHelperProjection['persistence'] {
  const indexInvocations = invocations.filter((invocation) => invocation.helper_id !== 'opl-doctor-native');
  if (indexInvocations.some((invocation) => invocation.status === 'unavailable')) {
    return persistenceStatus('skipped_helper_unavailable', stateDir, indexFile, [
      {
        code: 'native_index_helper_unavailable',
        message: 'one or more native index helpers are unavailable',
      },
    ]);
  }
  if (indexInvocations.some((invocation) => invocation.status !== 'ok')) {
    return persistenceStatus('skipped_helper_error', stateDir, indexFile, [
      {
        code: 'native_index_helper_failed',
        message: 'one or more native index helpers failed',
      },
    ]);
  }

  const nativeIndexes = Object.fromEntries(
    RUNTIME_MANAGER_HELPER_SEQUENCE.filter((spec) => spec.helper_id !== 'opl-doctor-native').map((spec) => {
      const invocation = invocations.find((candidate) => candidate.helper_id === spec.helper_id);
      return [spec.index_key, invocation];
    }),
  );

  try {
    fs.mkdirSync(path.dirname(indexFile), { recursive: true });
    fs.writeFileSync(
      indexFile,
      `${JSON.stringify(
        {
          surface_kind: 'opl_runtime_manager_native_state_projection',
          version: 'v1',
          protocol_version: PROTOCOL_VERSION,
          source_of_truth_rule: SOURCE_OF_TRUTH_RULE,
          generated_at: new Date().toISOString(),
          native_indexes: nativeIndexes,
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    return persistenceStatus('write_failed', stateDir, indexFile, [
      {
        code: 'native_state_index_write_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }

  return persistenceStatus('written', stateDir, indexFile, []);
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
    const candidate = path.join(explicitBinDir, helper.binary);
    return pathExists(candidate) ? resolved(helper, candidate, 'explicit_bin_dir') : missing(helper, 'explicit_bin_dir');
  }

  const targetDebugCandidate = path.join(repoRoot(), 'target', 'debug', helper.binary);
  if (pathExists(targetDebugCandidate)) {
    return resolved(helper, targetDebugCandidate, 'workspace_target_debug');
  }

  for (const entry of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(entry, helper.binary);
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
      repair_hint: 'Run npm run native:build or set OPL_NATIVE_HELPER_BIN_DIR.',
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

function persistenceStatus(
  status: NativeHelperProjection['persistence']['status'],
  stateDir: string,
  indexFile: string,
  errors: NativeHelperProjection['persistence']['errors'],
): NativeHelperProjection['persistence'] {
  return {
    status,
    state_dir: stateDir,
    index_file: indexFile,
    source_of_truth_rule: SOURCE_OF_TRUTH_RULE,
    errors,
  };
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
    repair_hint: 'Run npm run native:build or set OPL_NATIVE_HELPER_BIN_DIR.',
  };
}

function pathExists(candidate: string) {
  return fs.existsSync(candidate);
}

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
