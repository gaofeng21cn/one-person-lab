import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FrameworkContractError, isRecord } from './contract-validation.ts';
import { parseJsonText } from './json-file.ts';

const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PLUGIN_SELECTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/;

function blocked(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'standard_agent_managed_checkout_not_launchable',
  });
}

function record(value: unknown, field: string) {
  if (!isRecord(value)) blocked(`Standard Agent native runtime requires ${field}.`, { field });
  return value;
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    blocked(`Standard Agent native runtime requires ${field}.`, { field });
  }
  return value.trim();
}

function pathsMatch(left: string, right: string) {
  try {
    return fs.realpathSync.native(left) === fs.realpathSync.native(right);
  } catch {
    return false;
  }
}

export function readStandardAgentRuntimeOwner(sourceRoot: string, packageId: string) {
  const manifestPath = path.join(sourceRoot, 'opl-package.json');
  let bytes: Buffer;
  let manifest: Record<string, unknown>;
  try {
    const stat = fs.lstatSync(manifestPath);
    const realPath = fs.realpathSync.native(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink() || !realPath.startsWith(`${sourceRoot}${path.sep}`)) {
      throw new Error('descriptor is not one physical file inside the native carrier source root');
    }
    bytes = fs.readFileSync(realPath);
    const parsed = parseJsonText(bytes.toString('utf8'));
    if (!isRecord(parsed)) throw new Error('descriptor root is not an object');
    manifest = parsed;
  } catch (error) {
    blocked('Standard Agent native carrier owner descriptor is missing, unsafe, or invalid.', {
      package_id: packageId,
      owner_manifest_path: manifestPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const version = text(manifest!.version, 'opl-package.json#/version');
  const agentId = text(manifest!.agent_id, 'opl-package.json#/agent_id');
  if (
    manifest!.surface_kind !== 'opl_agent_package_manifest.v1'
    || text(manifest!.package_id, 'opl-package.json#/package_id') !== packageId
    || agentId !== packageId
    || !SEMVER_PATTERN.test(version)
  ) {
    blocked('Standard Agent native carrier owner descriptor identity is invalid.', {
      package_id: packageId,
      owner_manifest_path: manifestPath,
      descriptor_package_id: manifest!.package_id ?? null,
      descriptor_agent_id: manifest!.agent_id ?? null,
      descriptor_version: manifest!.version ?? null,
    });
  }
  const codexSurface = record(manifest!.codex_surface, 'opl-package.json#/codex_surface');
  const carrier = record(
    codexSurface.configured_codex_plugin_carrier,
    'opl-package.json#/codex_surface/configured_codex_plugin_carrier',
  );
  const pluginSelector = text(carrier.plugin_selector, 'configured_codex_plugin_carrier.plugin_selector');
  const marketplaceSource = text(
    carrier.marketplace_source,
    'configured_codex_plugin_carrier.marketplace_source',
  );
  const pluginName = pluginSelector.split('@', 1)[0];
  const declaredPluginName = text(codexSurface.plugin_id, 'codex_surface.plugin_id');
  const declaredSourcePath = codexSurface.plugin_source_path === undefined
    ? sourceRoot
    : path.resolve(sourceRoot, text(codexSurface.plugin_source_path, 'codex_surface.plugin_source_path'));
  if (
    carrier.kind !== 'codex_plugin_manager'
    || carrier.executor_route !== 'codex_cli'
    || !PLUGIN_SELECTOR_PATTERN.test(pluginSelector)
    || pluginName !== declaredPluginName
    || !pathsMatch(declaredSourcePath, sourceRoot)
  ) {
    blocked('Standard Agent owner descriptor does not declare one repo-root configured native carrier.', {
      package_id: packageId,
      plugin_selector: pluginSelector,
      plugin_id: declaredPluginName,
      declared_source_path: declaredSourcePath,
      native_source_path: sourceRoot,
    });
  }
  return {
    manifest_path: fs.realpathSync.native(manifestPath),
    manifest_sha256: `sha256:${crypto.createHash('sha256').update(bytes!).digest('hex')}`,
    package_version: version,
    plugin_selector: pluginSelector,
    marketplace_source: marketplaceSource,
    publication_ref: carrier.publication_ref === null || carrier.publication_ref === undefined
      ? null
      : text(carrier.publication_ref, 'configured_codex_plugin_carrier.publication_ref'),
    domain_descriptor_ref: text(
      manifest!.domain_descriptor_ref,
      'opl-package.json#/domain_descriptor_ref',
    ),
  };
}

export function sameStandardAgentRuntimeOwner(
  left: ReturnType<typeof readStandardAgentRuntimeOwner>,
  right: ReturnType<typeof readStandardAgentRuntimeOwner>,
) {
  return left.package_version === right.package_version
    && left.plugin_selector === right.plugin_selector
    && left.marketplace_source === right.marketplace_source
    && left.publication_ref === right.publication_ref
    && left.domain_descriptor_ref === right.domain_descriptor_ref;
}
