import { resolveDependencyReleaseSync } from '../../dependency-release-resolution-sync.ts';
import { allowDependencyVersionOverride } from '../../dependency-resolution-mode.ts';
import { compareDependencyVersions } from '../../dependency-release-resolution.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isRecord } from '../../../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../../../kernel/json-file.ts';
import { CODEX_APP_SERVER_SMOKE, verifyCodexAppServer } from '../codex-app-server-smoke.ts';
import {
  type InstalledCodexPayload,
  type RuntimeToolchainPaths,
  resolveCodexPlatformTarget,
  verifyCodexExecutable,
} from './version.ts';
import {
  activatePendingCodexRuntimeGenerationAtPaths,
  activatePendingCodexRuntimeGeneration,
  currentProcessInstanceId,
  resolveOplRuntimeToolchainPaths,
} from './runtime-generation.ts';
import {
  normalizeOutput,
  normalizeOptionalString,
  runCommand,
} from '../shared.ts';

function findExistingFile(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function findInstalledCodexPackageRoot(prefixRoot: string) {
  const packageRoot = path.join(prefixRoot, 'node_modules', '@openai', 'codex');
  return fs.existsSync(packageRoot) && fs.statSync(packageRoot).isDirectory()
    ? packageRoot
    : null;
}

function readPackageJson(packageRoot: string) {
  const packageJsonPath = path.join(packageRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }
  const packageJson = readJsonFileOrNull(packageJsonPath);
  return isRecord(packageJson) ? packageJson : null;
}

function normalizePackageBinEntry(packageJson: Record<string, unknown> | null, binName: string) {
  const bin = packageJson?.bin;
  if (typeof bin === 'string') {
    return binName === 'codex' ? bin : null;
  }
  if (!isRecord(bin)) {
    return null;
  }
  const entry = bin[binName];
  return typeof entry === 'string' && entry.trim().length > 0
    ? entry
    : null;
}

function resolveInstalledCodexPlatformSpec(packageRoot: string) {
  const target = resolveCodexPlatformTarget();
  const packageJson = readPackageJson(packageRoot);
  const optionalDependencies = packageJson?.optionalDependencies;
  if (!isRecord(optionalDependencies)) {
    return null;
  }
  const spec = optionalDependencies[target.packageName];
  return typeof spec === 'string' && spec.trim().length > 0
    ? `${target.packageName}@${spec}`
    : null;
}

function findInstalledCodexPayload(packageRoot: string): InstalledCodexPayload {
  const target = resolveCodexPlatformTarget();
  const packageBaseName = target.packageName.split('/').pop()!;
  const scopedPackageRoot = path.dirname(packageRoot);
  const siblingPlatformPackageRoot = path.join(scopedPackageRoot, packageBaseName);
  const nestedPlatformPackageRoot = path.join(packageRoot, 'node_modules', '@openai', packageBaseName);
  const siblingPlatformVendorRoot = path.join(
    siblingPlatformPackageRoot,
    'vendor',
    target.targetTriple,
  );
  const platformVendorRoot = path.join(
    nestedPlatformPackageRoot,
    'vendor',
    target.targetTriple,
  );
  const localVendorRoot = path.join(packageRoot, 'vendor', target.targetTriple);
  const vendorCodex = findExistingFile([
    path.join(siblingPlatformVendorRoot, 'bin', 'codex'),
    path.join(platformVendorRoot, 'bin', 'codex'),
    path.join(localVendorRoot, 'bin', 'codex'),
    path.join(siblingPlatformVendorRoot, 'codex', 'codex'),
    path.join(platformVendorRoot, 'codex', 'codex'),
    path.join(localVendorRoot, 'codex', 'codex'),
  ]);
  const vendorRg = findExistingFile([
    path.join(siblingPlatformVendorRoot, 'codex-path', 'rg'),
    path.join(platformVendorRoot, 'codex-path', 'rg'),
    path.join(localVendorRoot, 'codex-path', 'rg'),
  ]);
  if (vendorCodex) {
    return {
      codex: vendorCodex,
      rg: vendorRg,
      package_bin_entry: null,
      platform_package_root: vendorCodex.startsWith(siblingPlatformPackageRoot)
        ? siblingPlatformPackageRoot
        : vendorCodex.startsWith(nestedPlatformPackageRoot)
          ? nestedPlatformPackageRoot
          : null,
      missing_platform_package_spec: null,
    };
  }
  const packageBinEntry = normalizePackageBinEntry(readPackageJson(packageRoot), 'codex');
  return {
    codex: null,
    rg: null,
    package_bin_entry: packageBinEntry,
    platform_package_root: null,
    missing_platform_package_spec: resolveInstalledCodexPlatformSpec(packageRoot),
  };
}

function copyExecutable(source: string, destination: string) {
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, 0o755);
}

export function buildCodexRuntimeNpmInstallArgs(prefixRoot: string) {
  return [
    'install',
    '--prefix',
    prefixRoot,
    resolveCodexPackageInstallSpec(),
    '--force',
    '--include=optional',
    '--ignore-scripts=false',
    '--fetch-retries=3',
    '--fetch-retry-mintimeout=2000',
    '--fetch-retry-maxtimeout=20000',
    '--fetch-timeout=60000',
    ...codexRuntimeNpmCacheArgs(),
  ];
}

function buildCodexRuntimePlatformNpmInstallArgs(prefixRoot: string, platformSpec: string) {
  return [
    'install',
    '--prefix',
    prefixRoot,
    platformSpec,
    '--force',
    '--include=optional',
    '--ignore-scripts=false',
    '--fetch-retries=3',
    '--fetch-retry-mintimeout=2000',
    '--fetch-retry-maxtimeout=20000',
    '--fetch-timeout=60000',
    ...codexRuntimeNpmCacheArgs(),
  ];
}

export function resolvePreseedTarballPath(envKey: string) {
  const rawPath = normalizeOptionalString(process.env[envKey]);
  if (!rawPath) {
    return null;
  }
  const tarballPath = path.resolve(rawPath);
  return fs.existsSync(tarballPath) && fs.statSync(tarballPath).isFile()
    ? tarballPath
    : null;
}

function resolveCodexPackageInstallSpec() {
  const seed = resolvePreseedTarballPath('OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL');
  // A seed is used only for a first install; installed generations always resolve the current upstream target.
  const paths = resolveOplRuntimeToolchainPaths();
  if (seed && !fs.existsSync(paths.current_codex_path)) return seed;
  const configured = allowDependencyVersionOverride()
    ? normalizeOptionalString(process.env.OPL_CODEX_CLI_LATEST_VERSION)
    : null;
  const version = configured ?? resolveDependencyReleaseSync('codex-cli', { verifyArchive: false }).version;
  return `@openai/codex@${version}`;
}

export function resolveCodexPlatformPackageTarball() {
  return resolvePreseedTarballPath('OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL');
}

function codexRuntimeNpmCacheArgs() {
  const cacheDir = normalizeOptionalString(process.env.OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR)
    ?? normalizeOptionalString(process.env.NPM_CONFIG_CACHE)
    ?? normalizeOptionalString(process.env.npm_config_cache);
  return cacheDir ? ['--cache', path.resolve(cacheDir), '--prefer-offline'] : [];
}

function extractTarballToDirectory(tarballPath: string, outputRoot: string) {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  const result = spawnSync('tar', ['-xzf', tarballPath, '-C', outputRoot], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error([
      `Failed to extract ${tarballPath}`,
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
      result.error ? `error=${result.error.message}` : '',
    ].filter(Boolean).join('\n'));
  }
  const packageRoot = path.join(outputRoot, 'package');
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) {
    throw new Error(`Codex package tarball did not contain package/ root: ${tarballPath}`);
  }
  return packageRoot;
}

function copyDirectoryContents(sourceRoot: string, targetRoot: string) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
  fs.cpSync(sourceRoot, targetRoot, { recursive: true });
}

export function materializePreseededCodexPlatformPackage(stageAttemptRoot: string, platformTarballPath: string) {
  const target = resolveCodexPlatformTarget();
  const packageBaseName = target.packageName.split('/').pop()!;
  const extractedRoot = extractTarballToDirectory(
    platformTarballPath,
    path.join(stageAttemptRoot, '.preseed', packageBaseName),
  );
  const platformPackageRoot = path.join(stageAttemptRoot, 'node_modules', '@openai', packageBaseName);
  copyDirectoryContents(extractedRoot, platformPackageRoot);
  return {
    package_root: platformPackageRoot,
    tarball_path: platformTarballPath,
  };
}

async function applyCodexVendorToRuntime(
  vendor: InstalledCodexPayload,
  paths: RuntimeToolchainPaths,
  packageRoot: string,
) {
  const generationRoot = path.join(paths.generations_root, `codex-${Date.now()}-${process.pid}`);
  const generationBinDir = path.join(generationRoot, 'bin');
  const generationCodexPath = path.join(generationBinDir, 'codex');
  if (fs.existsSync(paths.current_bin_dir)) {
    copyDirectoryContents(paths.current_bin_dir, generationBinDir);
  } else {
    fs.mkdirSync(generationBinDir, { recursive: true });
  }
  fs.rmSync(generationCodexPath, { force: true });
  copyExecutable(vendor.codex!, generationCodexPath);
  const verification = verifyCodexExecutable(generationCodexPath);
  const protocolVerification = verification.verified ? await verifyCodexAppServer(generationCodexPath) : null;
  if (!verification.verified || !protocolVerification?.verified) {
    fs.rmSync(generationRoot, { recursive: true, force: true });
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      codex_package_root: packageRoot,
      reason: verification.verified ? 'staged_codex_binary_failed_protocol_verification' : 'staged_codex_binary_failed_version_verification',
      source_kind: 'platform_vendor_binary',
      platform_package_root: vendor.platform_package_root,
      verification,
      protocol_verification: protocolVerification,
    };
  }

  const currentVersion = fs.existsSync(paths.current_codex_path)
    ? verifyCodexExecutable(paths.current_codex_path).parsed_version : null;
  if (currentVersion && verification.parsed_version
    && compareDependencyVersions(currentVersion, verification.parsed_version) > 0) {
    fs.rmSync(generationRoot, { recursive: true, force: true });
    return { applied: false, reason: 'newer_installed_codex_preserved', runtime_binary_path: paths.current_codex_path, verification };
  }

  let rgPath: string | null = null;
  if (vendor.rg) {
    const targetRg = path.join(generationBinDir, 'rg');
    fs.rmSync(targetRg, { force: true });
    copyExecutable(vendor.rg, targetRg);
    rgPath = targetRg;
  }

  fs.mkdirSync(paths.runtime_root, { recursive: true });
  const pending = {
    surface_kind: 'opl_runtime_pending_generation.v1',
    dependency_id: 'codex-cli',
    generation_root: generationRoot,
    version: verification.parsed_version,
    codex_sha256: crypto.createHash('sha256').update(fs.readFileSync(generationCodexPath)).digest('hex'),
    protocol_verification: protocolVerification,
    staged_at: new Date().toISOString(),
    activation: 'next_app_start',
    rollback_root: paths.previous_root,
    staging_process_instance_id: currentProcessInstanceId(),
  };
  const pendingTmp = `${paths.pending_metadata_path}.${process.pid}.tmp`;
  fs.writeFileSync(pendingTmp, `${JSON.stringify(pending, null, 2)}\n`, 'utf8');
  fs.renameSync(pendingTmp, paths.pending_metadata_path);
  const activation = fs.existsSync(paths.current_codex_path)
    ? { status: 'pending_restart', current_root: paths.current_root, previous_root: paths.previous_root }
    : activatePendingCodexRuntimeGeneration();

  return {
    applied: true,
    staged: true,
    activated: activation.status === 'activated',
    restart_required: activation.status === 'pending_restart',
    runtime_binary_path: paths.current_codex_path,
    staged_runtime_binary_path: generationCodexPath,
    staged_runtime_rg_path: rgPath,
    pending_metadata_path: paths.pending_metadata_path,
    activation,
    codex_package_root: packageRoot,
    source_kind: 'platform_vendor_binary',
    platform_package_root: vendor.platform_package_root,
    copied_codex_source: vendor.codex,
    copied_rg_source: vendor.rg,
    verification,
    protocol_verification: protocolVerification,
  };
}

export async function applyStagedCodexRuntimePayload(stageAttemptRoot: string, paths: RuntimeToolchainPaths, cwd?: string) {
  const packageRoot = findInstalledCodexPackageRoot(stageAttemptRoot);
  if (!packageRoot) {
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      reason: 'codex_package_root_not_found_in_runtime_stage',
      stage_attempt_root: stageAttemptRoot,
    };
  }
  let explicitPlatformInstall = null;
  let vendor = findInstalledCodexPayload(packageRoot);
  if (!vendor.codex && vendor.missing_platform_package_spec) {
    explicitPlatformInstall = runCommand(
      'npm',
      buildCodexRuntimePlatformNpmInstallArgs(stageAttemptRoot, vendor.missing_platform_package_spec),
      cwd,
    );
    vendor = findInstalledCodexPayload(packageRoot);
  }
  if (!vendor.codex) {
    const failedExplicitPlatformInstall = explicitPlatformInstall && explicitPlatformInstall.exitCode !== 0;
    return {
      applied: false,
      runtime_binary_path: paths.current_codex_path,
      codex_package_root: packageRoot,
      reason: failedExplicitPlatformInstall
        ? 'codex_platform_package_install_failed'
        : 'codex_vendor_binary_not_found',
      package_bin_entry: vendor.package_bin_entry,
      explicit_platform_install: explicitPlatformInstall
        ? {
            exit_code: explicitPlatformInstall.exitCode,
            stdout: explicitPlatformInstall.stdout,
            stderr: explicitPlatformInstall.stderr,
            platform_spec: resolveInstalledCodexPlatformSpec(packageRoot),
          }
        : null,
      missing_platform_package_spec: vendor.missing_platform_package_spec,
    };
  }

  return {
    explicit_platform_install: explicitPlatformInstall
      ? {
          exit_code: explicitPlatformInstall.exitCode,
          stdout: explicitPlatformInstall.stdout,
          stderr: explicitPlatformInstall.stderr,
          platform_spec: resolveInstalledCodexPlatformSpec(packageRoot),
        }
      : null,
    ...await applyCodexVendorToRuntime(vendor, paths, packageRoot),
  };
}
