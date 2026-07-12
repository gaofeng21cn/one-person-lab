import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readOplWorkspaceRoot } from '../../kernel/system-preferences.ts';
import type {
  DeveloperModeContext,
  OplDeveloperModeFrameworkCheckoutProjection,
} from './developer-mode-types.ts';
import { buildOplFrameworkLocator } from './opl-framework-locator.ts';

function pathExistsFile(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function normalizeOptionalPath(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : null;
}

function safeRealpath(candidatePath: string | null) {
  if (!candidatePath) {
    return null;
  }
  try {
    return fs.realpathSync.native(candidatePath);
  } catch {
    return null;
  }
}

function isFrameworkCheckoutRoot(rootPath: string) {
  return (
    fs.existsSync(path.join(rootPath, '.git'))
    && pathExistsFile(path.join(rootPath, 'contracts', 'opl-framework', 'public-surface-index.json'))
    && pathExistsFile(path.join(rootPath, 'bin', 'opl'))
    && (
      pathExistsFile(path.join(rootPath, 'src', 'entrypoints', 'cli.ts'))
      || pathExistsFile(path.join(rootPath, 'dist', 'entrypoints', 'cli.js'))
    )
  );
}

function currentFrameworkCheckoutRoot() {
  const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  return isFrameworkCheckoutRoot(rootPath) ? fs.realpathSync.native(rootPath) : null;
}

function resolveFrameworkRootFromBin(binPath: string) {
  const realBinPath = fs.realpathSync.native(path.resolve(binPath));
  return path.resolve(path.dirname(realBinPath), '..');
}

function safeResolveFrameworkRootFromBin(binPath: string | null) {
  if (!binPath) {
    return null;
  }
  try {
    return resolveFrameworkRootFromBin(binPath);
  } catch {
    return null;
  }
}

function resolveFrameworkCliEntryPath(rootPath: string) {
  const sourceCli = path.join(rootPath, 'src', 'entrypoints', 'cli.ts');
  if (pathExistsFile(sourceCli)) {
    return sourceCli;
  }
  const distCli = path.join(rootPath, 'dist', 'entrypoints', 'cli.js');
  return pathExistsFile(distCli) ? distCli : null;
}

function buildResolvedFrameworkCheckoutProjection(
  selectedSourceKind: OplDeveloperModeFrameworkCheckoutProjection['selected_source_kind'],
  shouldUseLocalCheckout: boolean,
  resolutionSource: OplDeveloperModeFrameworkCheckoutProjection['resolution_source'],
  checkoutRoot: string,
): OplDeveloperModeFrameworkCheckoutProjection {
  const cliEntry = resolveFrameworkCliEntryPath(checkoutRoot);
  return {
    surface_kind: 'opl_developer_mode_framework_checkout_locator',
    policy_id: 'developer_mode_framework_checkout_locator.v1',
    status: cliEntry ? 'resolved' : 'unresolved',
    selected_source_kind: selectedSourceKind,
    should_use_local_checkout: shouldUseLocalCheckout,
    resolution_source: cliEntry ? resolutionSource : 'unresolved',
    checkout_root: checkoutRoot,
    checkout_bin: path.join(checkoutRoot, 'bin', 'opl'),
    checkout_cli_entry: cliEntry,
    reason: cliEntry ? null : 'framework_cli_entry_missing',
  };
}

function resolveDeveloperWorkspaceFrameworkCheckoutRoot() {
  const workspaceRoot = readOplWorkspaceRoot().selected_path;
  if (!workspaceRoot) {
    return null;
  }
  const candidate = path.join(workspaceRoot, 'one-person-lab');
  return isFrameworkCheckoutRoot(candidate) ? fs.realpathSync.native(candidate) : null;
}

function resolveExplicitFrameworkCheckoutCandidate(preferWorkspaceCheckout: boolean): {
  source: Exclude<OplDeveloperModeFrameworkCheckoutProjection['resolution_source'], 'PATH:opl' | 'unresolved'>;
  root: string;
} | null {
  const workspaceCheckoutRoot = resolveDeveloperWorkspaceFrameworkCheckoutRoot();
  if (preferWorkspaceCheckout && workspaceCheckoutRoot) {
    return {
      source: 'developer_workspace_sibling_checkout',
      root: workspaceCheckoutRoot,
    };
  }

  const configuredFrameworkRoot = safeRealpath(normalizeOptionalPath(process.env.OPL_FRAMEWORK_ROOT));
  if (configuredFrameworkRoot && isFrameworkCheckoutRoot(configuredFrameworkRoot)) {
    return {
      source: 'OPL_FRAMEWORK_ROOT',
      root: configuredFrameworkRoot,
    };
  }

  const configuredCliBinRoot = safeResolveFrameworkRootFromBin(normalizeOptionalPath(process.env.OPL_CLI_BIN));
  if (configuredCliBinRoot && isFrameworkCheckoutRoot(configuredCliBinRoot)) {
    return {
      source: 'OPL_CLI_BIN',
      root: configuredCliBinRoot,
    };
  }

  const configuredBinRoot = safeResolveFrameworkRootFromBin(normalizeOptionalPath(process.env.OPL_BIN));
  if (configuredBinRoot && isFrameworkCheckoutRoot(configuredBinRoot)) {
    return {
      source: 'OPL_BIN',
      root: configuredBinRoot,
    };
  }

  const currentCheckoutRoot = currentFrameworkCheckoutRoot();
  if (currentCheckoutRoot) {
    return {
      source: 'current_cli_entry',
      root: currentCheckoutRoot,
    };
  }

  if (workspaceCheckoutRoot) {
    return {
      source: 'developer_workspace_sibling_checkout',
      root: workspaceCheckoutRoot,
    };
  }

  return null;
}

export function buildFrameworkCheckoutProjection(
  context: Pick<DeveloperModeContext, 'enabled' | 'status' | 'mode'>,
): OplDeveloperModeFrameworkCheckoutProjection {
  const shouldUseLocalCheckout =
    context.enabled === 'on'
    || (
      context.enabled === 'auto'
      && context.status !== 'disabled'
      && context.status !== 'inactive'
      && context.status !== 'blocked'
    );
  const selectedSourceKind = shouldUseLocalCheckout ? 'local_checkout' : 'managed_runtime';

  const explicitCheckout = resolveExplicitFrameworkCheckoutCandidate(shouldUseLocalCheckout);
  if (explicitCheckout) {
    return buildResolvedFrameworkCheckoutProjection(
      selectedSourceKind,
      shouldUseLocalCheckout,
      explicitCheckout.source,
      explicitCheckout.root,
    );
  }

  try {
    const locator = buildOplFrameworkLocator().framework_locator;
    if (locator.resolved.source === 'PATH:opl') {
      throw new Error('framework_locator_resolved_only_via_path_without_explicit_checkout_candidate');
    }
    if (shouldUseLocalCheckout && !isFrameworkCheckoutRoot(locator.resolved.root)) {
      throw new Error('developer_mode_requires_local_framework_checkout_but_current_locator_is_not_a_git_checkout');
    }
    return buildResolvedFrameworkCheckoutProjection(
      selectedSourceKind,
      shouldUseLocalCheckout,
      locator.resolved.source,
      locator.resolved.root,
    );
  } catch (error) {
    return {
      surface_kind: 'opl_developer_mode_framework_checkout_locator',
      policy_id: 'developer_mode_framework_checkout_locator.v1',
      status: 'unresolved',
      selected_source_kind: selectedSourceKind,
      should_use_local_checkout: shouldUseLocalCheckout,
      resolution_source: 'unresolved',
      checkout_root: null,
      checkout_bin: null,
      checkout_cli_entry: null,
      reason: error instanceof Error ? error.message : 'framework_locator_unavailable',
    };
  }
}
