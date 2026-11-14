import fs from 'node:fs';
import path from 'node:path';

import { readJsonFileOrNull } from '../../../kernel/json-file.ts';
import { resolveCodexBinary } from '../../execution/index.ts';

import {
  enumerateCodexCandidates,
  inspectCodexCandidate,
  normalizeCodexCandidates,
  resolveCodexPlatformTarget,
  resolveLatestCodexCliVersion,
  resolveLatestVersionStatus,
  resolveMinimumCodexCliVersion,
  resolveVersionStatus,
} from './engine-helpers-parts/version.ts';
import {
  CODEX_RUNTIME_UPDATER_VERSION,
  makeRuntimeStageAttemptRoot,
  pruneRuntimeStageAttempts,
  readLatestPendingCodexGeneration,
  resolveOplRuntimeToolchainPaths,
} from './engine-helpers-parts/runtime-generation.ts';
import {
  applyStagedCodexRuntimePayload,
  buildCodexRuntimeNpmInstallArgs,
  materializePreseededCodexPlatformPackage,
  materializePreseededCodexPackage,
  resolveCodexPlatformPackageTarball,
  resolvePreseedTarballPath,
} from './engine-helpers-parts/runtime-payload.ts';
import {
  type OplEngineAction,
  type OplEngineId,
  type OplShellActionSpec,
  getShellBinary,
  normalizeOutput,
  normalizeOptionalString,
  runCommand,
  runShellCommand,
} from './shared.ts';

export { activatePendingCodexRuntimeGeneration, rollbackCodexRuntimeGeneration } from './engine-helpers-parts/runtime-generation.ts';

function inspectRuntimeCodexToolchain(
  minimumVersion: string,
  latestVersion: string | null,
) {
  const paths = resolveOplRuntimeToolchainPaths();
  const binaryExists = fs.existsSync(paths.current_codex_path)
    && fs.statSync(paths.current_codex_path).isFile();
  const versionResult = binaryExists
    ? runCommand(paths.current_codex_path, ['--version'])
    : null;
  const version = versionResult && versionResult.exitCode === 0
    ? normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr))
    : null;
  const currentPolicy = resolveVersionStatus(version, minimumVersion);
  const latestPolicy = resolveLatestVersionStatus(currentPolicy.parsed_version, latestVersion);

  return {
    surface_kind: 'opl_runtime_substrate_updater',
    updater_version: CODEX_RUNTIME_UPDATER_VERSION,
    owner: 'opl_app_runtime',
    target_toolchain: 'codex_cli',
    update_strategy: 'app_owned_stage_verify_restart_activate',
    apply_trigger: 'opl engine install/update/reinstall --engine codex or opl system startup-maintenance',
    global_toolchain_mutation_allowed: false,
    system_tool_priority: 'prefer_compatible_system_codex_from_env_or_path',
    managed_payloads: ['codex_cli', 'codex_path_rg'],
    platform_package_materialization_policy: {
      package_name: resolveCodexPlatformTarget().packageName,
      target_triple: resolveCodexPlatformTarget().targetTriple,
      source_of_truth: 'npm_optional_dependency_or_preseeded_platform_tarball',
      explicit_install_when_optional_payload_missing: true,
      install_scope: 'app_owned_stage_prefix_only',
      global_toolchain_mutation_allowed: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_production_ready: false,
    },
    runtime_root: paths.runtime_root,
    current_root: paths.current_root,
    current_binary_path: paths.current_codex_path,
    staging_root: paths.staging_root,
    pending_metadata_path: paths.pending_metadata_path,
    pending_generation: fs.existsSync(paths.pending_metadata_path)
      ? readJsonFileOrNull(paths.pending_metadata_path)
      : null,
    activation_policy: 'next_app_start_generation_switch',
    previous_root: paths.previous_root,
    rollback_available: fs.existsSync(paths.previous_root),
    current_binary_installed: binaryExists,
    current_version: version,
    current_parsed_version: currentPolicy.parsed_version,
    current_version_status: binaryExists ? currentPolicy.version_status : 'missing',
    latest_version: latestPolicy.latest_version,
    latest_version_status: binaryExists ? latestPolicy.latest_version_status : 'missing',
    update_available: binaryExists
      ? latestPolicy.latest_version_status === 'outdated'
      : Boolean(latestVersion),
  };
}

export function resolveCodexVersion(options: {
  skipLatestLookup?: boolean;
  preferOfflineLatestLookup?: boolean;
} = {}) {
  const minimumVersion = resolveMinimumCodexCliVersion();
  const binary = resolveCodexBinary();
  if (!binary) {
    return {
      installed: false,
      version: null,
      parsed_version: null,
      minimum_version: minimumVersion,
      version_status: 'missing',
      latest_version: null,
      latest_version_status: 'missing',
      update_available: false,
      binary_path: null,
      binary_source: null,
      candidates: [],
      issues: ['codex_cli_missing'],
      diagnostics: [],
      runtime_substrate_updater: inspectRuntimeCodexToolchain(minimumVersion, null),
    };
  }

  const versionResult = runCommand(binary.path, ['--version']);
  const version = normalizeOptionalString(normalizeOutput(versionResult.stdout, versionResult.stderr));
  const policy = resolveVersionStatus(version, minimumVersion);
  const latestVersion = options.skipLatestLookup
    ? null
    : resolveLatestCodexCliVersion({ preferOffline: options.preferOfflineLatestLookup });
  const latestPolicy = resolveLatestVersionStatus(policy.parsed_version, latestVersion);
  const rawCandidates = enumerateCodexCandidates(binary.path)
    .map((candidate) => inspectCodexCandidate(candidate, binary.path, minimumVersion));
  const candidates = normalizeCodexCandidates(rawCandidates);
  const candidateVersions = new Set(
    candidates
      .map((candidate) => candidate.parsed_version)
      .filter(Boolean),
  );
  const blockingIssues = [
    ...(policy.version_status === 'outdated' ? ['codex_cli_version_outdated'] : []),
    ...(policy.version_status === 'unknown' ? ['codex_cli_version_unknown'] : []),
  ];
  const diagnostics = [
    ...(candidateVersions.size > 1 ? ['codex_cli_path_version_conflict_nonblocking'] : []),
    ...(latestPolicy.latest_version_status === 'outdated' ? ['codex_cli_latest_update_available'] : []),
    ...(options.skipLatestLookup ? ['codex_cli_latest_lookup_skipped_fast_profile'] : []),
    ...(options.preferOfflineLatestLookup ? ['codex_cli_latest_lookup_prefers_cache_status_projection'] : []),
  ];

  return {
    installed: true,
    version,
    parsed_version: policy.parsed_version,
    minimum_version: minimumVersion,
    version_status: policy.version_status,
    latest_version: latestPolicy.latest_version,
    latest_version_status: latestPolicy.latest_version_status,
    update_available: latestPolicy.latest_version_status === 'outdated',
    binary_path: binary.path,
    binary_source: binary.source,
    candidates,
    issues: blockingIssues,
    diagnostics,
    runtime_substrate_updater: inspectRuntimeCodexToolchain(minimumVersion, latestVersion),
  };
}

export function findEngineOrThrow(engineId: string): OplEngineId {
  const normalized = engineId.trim().toLowerCase();
  if (normalized === 'codex') {
    return normalized;
  }

  throw new Error(`Unknown engine id: ${engineId}`);
}

function buildEngineActionEnvKey(engineId: OplEngineId, action: OplEngineAction) {
  return `OPL_${engineId.toUpperCase()}_${action.toUpperCase()}_COMMAND`;
}

function resolveBuiltinEngineActionCommand(
  engineId: OplEngineId,
  action: OplEngineAction,
) {
  if (engineId !== 'codex') {
    return null;
  }
  switch (action) {
    case 'install':
    case 'update':
    case 'reinstall':
      return null;
    case 'remove':
      return 'npm uninstall -g @openai/codex';
  }
}

async function runBuiltinCodexRuntimeInstallOrUpdate(cwd?: string) {
  const paths = resolveOplRuntimeToolchainPaths();
  const preflightStageCleanup = pruneRuntimeStageAttempts(paths.staging_root);
  const pending = readLatestPendingCodexGeneration(paths);
  if (pending) {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        opl_runtime_codex_update: {
          surface_kind: 'opl_runtime_substrate_update_receipt',
          updater_version: CODEX_RUNTIME_UPDATER_VERSION,
          owner: 'opl_app_runtime',
          target_toolchain: 'codex_cli',
          update_strategy: 'app_owned_stage_verify_restart_activate',
          applied: false,
          staged: true,
          restart_required: true,
          reason: 'codex_runtime_latest_already_pending_restart',
          version: pending.version,
          generation_root: pending.generation_root,
          pending_metadata_path: paths.pending_metadata_path,
          staging_process_instance_id: pending.staging_process_instance_id,
          staging_cleanup: {
            ...preflightStageCleanup,
            current_attempt_removed: null,
          },
        },
      }),
      stderr: '',
    };
  }
  const stageAttemptRoot = makeRuntimeStageAttemptRoot(paths);
  try {
    const installArgs = buildCodexRuntimeNpmInstallArgs(stageAttemptRoot);
    const rootTarball = resolvePreseedTarballPath('OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL');
    const platformTarballPath = resolveCodexPlatformPackageTarball();
    let installResult;
    if (rootTarball && platformTarballPath && !fs.existsSync(paths.current_codex_path)) {
      materializePreseededCodexPackage(stageAttemptRoot, rootTarball);
      installResult = { exitCode: 0, stdout: 'Materialized the packaged Codex launcher without registry access.', stderr: '' };
    } else {
      installResult = runCommand('npm', installArgs, cwd);
    }
    if (installResult.exitCode !== 0) {
      return installResult;
    }
    let preseededPlatformPackage = null;
    try {
      if (platformTarballPath) {
        preseededPlatformPackage = materializePreseededCodexPlatformPackage(
          stageAttemptRoot,
          platformTarballPath,
        );
      }
    } catch (error) {
      return {
        exitCode: 1,
        stdout: installResult.stdout,
        stderr: normalizeOutput(
          installResult.stderr,
          JSON.stringify({
            opl_runtime_codex_update: {
              surface_kind: 'opl_runtime_substrate_update_receipt',
              updater_version: CODEX_RUNTIME_UPDATER_VERSION,
              owner: 'opl_app_runtime',
              target_toolchain: 'codex_cli',
              stage_attempt_root: stageAttemptRoot,
              preseeded_platform_package: {
                status: 'failed',
                tarball_path: platformTarballPath,
                error: error instanceof Error ? error.message : String(error),
              },
            },
          }),
        ),
      };
    }

    const runtimeApply = await applyStagedCodexRuntimePayload(stageAttemptRoot, paths, cwd);
    if (!runtimeApply.applied) {
      return {
        exitCode: 1,
        stdout: installResult.stdout,
        stderr: normalizeOutput(
          installResult.stderr,
          JSON.stringify({ opl_runtime_codex_update: runtimeApply }),
        ),
      };
    }

    return {
      ...installResult,
      stdout: normalizeOutput(
        installResult.stdout,
        [
          installResult.stderr,
          JSON.stringify({
            opl_runtime_codex_update: {
              surface_kind: 'opl_runtime_substrate_update_receipt',
              updater_version: CODEX_RUNTIME_UPDATER_VERSION,
              owner: 'opl_app_runtime',
              target_toolchain: 'codex_cli',
              update_strategy: 'app_owned_stage_verify_restart_activate',
              global_toolchain_mutation_allowed: false,
              system_tool_priority: 'prefer_compatible_system_codex_from_env_or_path',
              stage_attempt_root: stageAttemptRoot,
              staging_cleanup: {
                ...preflightStageCleanup,
                current_attempt_removed: true,
              },
              preseeded_package_tarball: resolvePreseedTarballPath('OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL'),
              preseeded_platform_package: preseededPlatformPackage,
              ...runtimeApply,
            },
          }),
        ].filter(Boolean).join('\n'),
      ),
    };
  } finally {
    fs.rmSync(stageAttemptRoot, { recursive: true, force: true });
  }
}

function buildBuiltinCodexRuntimeActionSpec(): OplShellActionSpec {
  const paths = resolveOplRuntimeToolchainPaths();
  return {
    strategy: 'builtin',
    command_preview: ['npm', ...buildCodexRuntimeNpmInstallArgs(path.join(paths.staging_root, '<attempt>'))],
    note: 'Stages and verifies Codex in the OPL App-owned Runtime Substrate, then activates it on the next App start; it does not modify global Homebrew, npm, or system Codex installations.',
    executable: (cwd?: string) => runBuiltinCodexRuntimeInstallOrUpdate(cwd),
  };
}

function resolveShellActionSpec(
  envOverride: string | undefined,
  builtinCommand: string | null,
  manualNote: string,
): OplShellActionSpec {
  const normalizedOverride = normalizeOptionalString(envOverride);
  if (normalizedOverride) {
    const executablePath = path.resolve(normalizedOverride);
    if (!/\s/.test(normalizedOverride) && fs.existsSync(executablePath) && fs.statSync(executablePath).isFile()) {
      return {
        strategy: 'env_override',
        command_preview: [executablePath],
        note: null,
        executable: (cwd?: string) => runCommand(executablePath, [], cwd),
      };
    }

    return {
      strategy: 'env_override',
      command_preview: [getShellBinary(), '-lc', normalizedOverride],
      note: null,
      executable: (cwd?: string) => runShellCommand(normalizedOverride, cwd),
    };
  }

  if (builtinCommand) {
    return {
      strategy: 'builtin',
      command_preview: [getShellBinary(), '-lc', builtinCommand],
      note: null,
      executable: (cwd?: string) => runShellCommand(builtinCommand, cwd),
    };
  }

  return {
    strategy: 'manual_required',
    command_preview: [],
    note: manualNote,
    executable: null,
  };
}

export function resolveEngineActionSpec(
  engineId: OplEngineId,
  action: OplEngineAction,
): OplShellActionSpec {
  const envOverride = process.env[buildEngineActionEnvKey(engineId, action)];
  if (
    engineId === 'codex'
    && !normalizeOptionalString(envOverride)
    && (action === 'install' || action === 'update' || action === 'reinstall')
  ) {
    return buildBuiltinCodexRuntimeActionSpec();
  }
  const builtinCommand = resolveBuiltinEngineActionCommand(engineId, action);
  const manualNote =
    `No built-in ${engineId} ${action} command is configured. Set ${buildEngineActionEnvKey(engineId, action)} to enable it.`;

  return resolveShellActionSpec(envOverride, builtinCommand, manualNote);
}
