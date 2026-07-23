import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { getOplPackageSpecs } from '../package-distribution.ts';
import { readDeveloperCheckoutSourceIdentity } from './developer-checkout-runtime-source.ts';
import { normalizePackageManifest } from './manifest-normalizers.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from './payload-content-lock.ts';
import type {
  AgentPackageDeveloperCheckoutSource,
  AgentPackageLock,
  AgentPackageManagedVersionCatalogSource,
  AgentPackageManifest,
} from './types.ts';

const IGNORED_SOURCE_NAMES = new Set([
  '.DS_Store',
  '.codegraph',
  '.git',
  '.pytest_cache',
  '.venv',
  '__pycache__',
  'node_modules',
]);

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export type DeveloperCheckoutPayloadFile = {
  path: string;
  content: Buffer;
  mode: '100644' | '100755';
};

export function developerCheckoutPayloadDigest(files: DeveloperCheckoutPayloadFile[]) {
  return packageContentLockDigest(
    CANONICAL_PACKAGE_CONTENT_LOCK,
    [...files]
      .sort((left, right) => left.path.localeCompare(right.path, 'en'))
      .map((file) => ({
        path: file.path,
        content: Buffer.concat([Buffer.from(`${file.mode}\0`, 'utf8'), file.content]),
      })),
  );
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function sourceFailure(message: string, details: Record<string, unknown>) {
  return new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'agent_package_developer_checkout_source_invalid',
  });
}

function isSafePathSegment(value: string) {
  return value !== '.'
    && value !== '..'
    && !value.includes('/')
    && !value.includes('\\')
    && path.basename(value) === value;
}

function frameworkPackageManifest(spec: ReturnType<typeof getOplPackageSpecs>[number]) {
  const manifestPath = path.resolve(frameworkRoot, spec.package_manifest_ref);
  if (!isInside(frameworkRoot, manifestPath)
    || !fs.existsSync(manifestPath)
    || !fs.statSync(manifestPath).isFile()) {
    throw sourceFailure('Framework package manifest for developer checkout reconciliation is unavailable.', {
      package_id: spec.package_id,
      framework_manifest_path: manifestPath,
    });
  }
  const payload = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
  if (!isRecord(payload)) {
    throw sourceFailure('Framework package manifest for developer checkout reconciliation is invalid.', {
      package_id: spec.package_id,
      framework_manifest_path: manifestPath,
    });
  }
  return payload;
}

function normalizeDeveloperOwnerManifest(input: {
  spec: ReturnType<typeof getOplPackageSpecs>[number];
  payload: unknown;
  manifestPath: string;
}) {
  const base = frameworkPackageManifest(input.spec);
  if (input.spec.owner_manifest_kind === 'workflow_profile') {
    const policy = isRecord(input.payload) ? input.payload : null;
    const policyPackage = policy && isRecord(policy.package) ? policy.package : null;
    if (!['opl_flow_workflow_policy.v1', 'opl_flow_workflow_policy.v2'].includes(String(policy?.schema))
      || policyPackage?.id !== input.spec.package_id
      || policyPackage.kind !== 'workflow_profile'
      || !stringValue(policyPackage.version)) {
      throw sourceFailure('Developer workflow profile checkout has an invalid owner policy identity.', {
        package_id: input.spec.package_id,
        owner_manifest_path: input.manifestPath,
      });
    }
    return normalizePackageManifest({
      ...base,
      version: stringValue(policyPackage.version),
    }, input.manifestPath);
  }

  if (input.spec.owner_manifest_kind === 'standard_agent') {
    if (!isRecord(input.payload)
      || input.payload.surface_kind !== 'opl_agent_package_manifest.v1'
      || input.payload.package_id !== input.spec.package_id
      || input.payload.agent_id !== input.spec.package_id) {
      throw sourceFailure('Developer standard Agent checkout has an invalid owner manifest identity.', {
        package_id: input.spec.package_id,
        owner_manifest_path: input.manifestPath,
      });
    }
    const baseCodexSurface = isRecord(base.codex_surface) ? base.codex_surface : {};
    const ownerCodexSurface = isRecord(input.payload.codex_surface) ? input.payload.codex_surface : {};
    return normalizePackageManifest({
      ...base,
      ...input.payload,
      codex_surface: {
        ...baseCodexSurface,
        ...ownerCodexSurface,
      },
    }, input.manifestPath);
  }

  if (isRecord(input.payload)
    && input.payload.surface_kind === 'opl_capability_package_manifest.v2'
    && !isRecord(input.payload.content_lock)) {
    const exports = isRecord(input.payload.exports) ? input.payload.exports : {};
    const contentLockPaths = [
      ...(Array.isArray(exports.core_skill_ids) ? exports.core_skill_ids : []),
      ...(Array.isArray(exports.specialty_skill_ids) ? exports.specialty_skill_ids : []),
    ]
      .filter((skillId): skillId is string => typeof skillId === 'string' && skillId.length > 0)
      .map((skillId) => `skills/${skillId}/SKILL.md`);
    const normalized = normalizePackageManifest({
      ...input.payload,
      content_lock: {
        algorithm: 'sha256',
        canonicalization: CANONICAL_PACKAGE_CONTENT_LOCK,
        digest: `sha256:${'0'.repeat(64)}`,
        paths: contentLockPaths,
      },
    }, input.manifestPath);
    return {
      ...normalized,
      content_digest: null,
      content_lock_canonicalization: null,
      content_lock_paths: [],
    };
  }

  return normalizePackageManifest(input.payload, input.manifestPath);
}

function declaredPackageSurfacePaths(manifest: AgentPackageManifest) {
  return [...new Set([
    ...manifest.content_lock_paths,
    ...(manifest.profile_surface
      ? [
          manifest.profile_surface.runtime_profile.source_path,
          ...manifest.profile_surface.authoring_sources.map((entry) => entry.source_path),
          ...manifest.profile_surface.merge_context_paths,
        ]
      : []),
    ...(manifest.managed_policy_surface
      ? [
          manifest.managed_policy_surface.source_path,
          manifest.managed_policy_surface.schema_path,
        ]
      : []),
  ])];
}

function collectFiles(root: string, candidate: string, files: Map<string, DeveloperCheckoutPayloadFile>) {
  if (!isInside(root, candidate) || !fs.existsSync(candidate)) {
    throw sourceFailure('Developer checkout package source path is missing or escapes its plugin root.', {
      plugin_source_path: root,
      source_path: candidate,
    });
  }
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink()) {
    throw sourceFailure('Developer checkout package source does not admit symbolic links.', {
      plugin_source_path: root,
      source_path: candidate,
    });
  }
  if (stat.isFile()) {
    if (candidate.endsWith('.pyc')) return;
    const relativePath = path.relative(root, candidate).split(path.sep).join('/');
    files.set(relativePath, {
      path: relativePath,
      content: fs.readFileSync(candidate),
      mode: stat.mode & 0o111 ? '100755' : '100644',
    });
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(candidate, { withFileTypes: true })) {
    if (IGNORED_SOURCE_NAMES.has(entry.name)) continue;
    collectFiles(root, path.join(candidate, entry.name), files);
  }
}

function fallbackDeveloperIdentity(checkoutPath: string) {
  const hash = crypto.createHash('sha256');
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      if (IGNORED_SOURCE_NAMES.has(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(checkoutPath, absolutePath).split(path.sep).join('/');
      const stat = fs.lstatSync(absolutePath);
      const mode = (stat.mode & 0o777).toString(8);
      if (stat.isDirectory()) {
        hash.update(`dir\0${relativePath}\0${mode}\0`);
        visit(absolutePath);
      } else if (stat.isSymbolicLink()) {
        hash.update(`symlink\0${relativePath}\0${mode}\0${fs.readlinkSync(absolutePath)}\0`);
      } else if (stat.isFile()) {
        hash.update(`file\0${relativePath}\0${mode}\0`);
        hash.update(fs.readFileSync(absolutePath));
        hash.update('\0');
      } else {
        hash.update(`special\0${relativePath}\0${mode}\0`);
      }
    }
  };
  visit(checkoutPath);
  return { source_git_head_sha: null, tree_sha256: hash.digest('hex') };
}

function captureIdentity(checkoutPath: string) {
  try {
    return readDeveloperCheckoutSourceIdentity(checkoutPath);
  } catch {
    return fallbackDeveloperIdentity(checkoutPath);
  }
}

function sameIdentity(
  left: ReturnType<typeof captureIdentity>,
  right: ReturnType<typeof captureIdentity>,
) {
  return left.source_git_head_sha === right.source_git_head_sha
    && left.tree_sha256 === right.tree_sha256;
}

export function loadDeveloperCheckoutPackageSource(packageId: string, checkoutPath: string) {
  const spec = getOplPackageSpecs().find((entry) => entry.package_id === packageId);
  const resolvedCheckout = path.resolve(checkoutPath);
  if (!spec || !fs.existsSync(resolvedCheckout) || !fs.statSync(resolvedCheckout).isDirectory()) {
    throw sourceFailure('Developer checkout package source is unavailable.', {
      package_id: packageId,
      checkout_path: resolvedCheckout,
    });
  }
  const checkoutReal = fs.realpathSync(resolvedCheckout);
  const identityBefore = captureIdentity(checkoutReal);
  const ownerManifestCandidate = path.resolve(checkoutReal, spec.owner_package_manifest_ref);
  const pluginManifestCandidate = path.resolve(checkoutReal, spec.owner_plugin_manifest_ref);
  if (!isInside(checkoutReal, ownerManifestCandidate)
    || !isInside(checkoutReal, pluginManifestCandidate)
    || !fs.existsSync(ownerManifestCandidate)
    || !fs.lstatSync(ownerManifestCandidate).isFile()
    || fs.lstatSync(ownerManifestCandidate).isSymbolicLink()
    || !fs.existsSync(pluginManifestCandidate)
    || !fs.lstatSync(pluginManifestCandidate).isFile()
    || fs.lstatSync(pluginManifestCandidate).isSymbolicLink()) {
    throw sourceFailure('Developer checkout is missing its owner or plugin manifest.', {
      package_id: packageId,
      checkout_path: checkoutReal,
      owner_manifest_path: ownerManifestCandidate,
      plugin_manifest_path: pluginManifestCandidate,
    });
  }
  const ownerManifestPath = fs.realpathSync(ownerManifestCandidate);
  const pluginManifestPath = fs.realpathSync(pluginManifestCandidate);
  if (!isInside(checkoutReal, ownerManifestPath) || !isInside(checkoutReal, pluginManifestPath)) {
    throw sourceFailure('Developer checkout manifests escape the checkout through an intermediate path.', {
      package_id: packageId,
      checkout_path: checkoutReal,
      owner_manifest_path: ownerManifestPath,
      plugin_manifest_path: pluginManifestPath,
    });
  }

  const ownerManifestBytes = fs.readFileSync(ownerManifestPath);
  const ownerManifestSha256 = sha256(ownerManifestBytes);
  const ownerManifest = normalizeDeveloperOwnerManifest({
    spec,
    payload: parseJsonText(ownerManifestBytes.toString('utf8')),
    manifestPath: ownerManifestPath,
  });
  if (ownerManifest.package_id !== packageId) {
    throw sourceFailure('Developer checkout owner manifest does not match the requested package.', {
      package_id: packageId,
      owner_manifest_package_id: ownerManifest.package_id,
      owner_manifest_path: ownerManifestPath,
    });
  }
  const pluginManifest = parseJsonText(fs.readFileSync(pluginManifestPath, 'utf8'));
  const pluginId = isRecord(pluginManifest) ? stringValue(pluginManifest.name) : null;
  if (!pluginId
    || !isSafePathSegment(pluginId)
    || (ownerManifest.plugin_id !== null && !isSafePathSegment(ownerManifest.plugin_id))
    || (ownerManifest.plugin_id && ownerManifest.plugin_id !== pluginId)) {
    throw sourceFailure('Developer checkout plugin manifest identity does not match its owner manifest.', {
      package_id: packageId,
      owner_plugin_id: ownerManifest.plugin_id,
      plugin_manifest_id: pluginId,
      plugin_manifest_path: pluginManifestPath,
    });
  }

  const pluginRoot = fs.realpathSync(path.dirname(path.dirname(pluginManifestPath)));
  if (!isInside(checkoutReal, pluginRoot)) {
    throw sourceFailure('Developer checkout plugin source escapes its checkout.', {
      package_id: packageId,
      checkout_path: checkoutReal,
      plugin_source_path: pluginRoot,
    });
  }
  const files = new Map<string, DeveloperCheckoutPayloadFile>();
  collectFiles(pluginRoot, pluginManifestPath, files);
  for (const skillId of ownerManifest.required_skill_ids) {
    collectFiles(pluginRoot, path.join(pluginRoot, 'skills', skillId), files);
  }
  for (const relativePath of declaredPackageSurfacePaths(ownerManifest)) {
    const sourcePath = path.resolve(checkoutReal, relativePath);
    if (!isInside(pluginRoot, sourcePath)) {
      throw sourceFailure('Developer checkout declared package surface escapes its plugin root.', {
        package_id: packageId,
        plugin_source_path: pluginRoot,
        declared_source_path: sourcePath,
      });
    }
    collectFiles(pluginRoot, sourcePath, files);
  }
  if (isInside(pluginRoot, ownerManifestPath)) collectFiles(pluginRoot, ownerManifestPath, files);
  const copyPaths = [...files.keys()].sort();
  const payloadFiles = copyPaths.map((relativePath) => {
    const file = files.get(relativePath)!;
    return { ...file, content: Buffer.from(file.content) };
  });
  const payloadDigest = developerCheckoutPayloadDigest(payloadFiles);
  const identityAfter = captureIdentity(checkoutReal);
  if (!sameIdentity(identityBefore, identityAfter)) {
    throw sourceFailure('Developer checkout changed while its package snapshot was being captured.', {
      package_id: packageId,
      checkout_path: checkoutReal,
      before_source_git_head_sha: identityBefore.source_git_head_sha,
      after_source_git_head_sha: identityAfter.source_git_head_sha,
      before_tree_sha256: identityBefore.tree_sha256,
      after_tree_sha256: identityAfter.tree_sha256,
    });
  }
  const source: AgentPackageDeveloperCheckoutSource = {
    surface_kind: 'opl_agent_package_developer_checkout_source.v1',
    checkout_path: checkoutReal,
    owner_manifest_path: ownerManifestPath,
    owner_manifest_sha256: ownerManifestSha256,
    plugin_source_path: pluginRoot,
    source_git_head_sha: identityAfter.source_git_head_sha,
    tree_sha256: identityAfter.tree_sha256,
    payload_digest: payloadDigest,
    declared_content_digest: ownerManifest.content_digest,
    copy_paths: copyPaths,
    copy_file_modes: Object.fromEntries(payloadFiles.map((file) => [file.path, file.mode])),
  };
  return {
    ownerManifest,
    source,
    pluginId,
    payloadFiles,
  };
}

export function mergeDeveloperCheckoutPackageManifest(input: {
  base: AgentPackageManifest;
  owner: AgentPackageManifest;
  source: AgentPackageDeveloperCheckoutSource;
  pluginId: string;
  managedUpdateSource: AgentPackageManagedVersionCatalogSource | null;
}) {
  return {
    ...input.base,
    ...input.owner,
    distribution_payload: null,
    source: 'trusted_developer_checkout',
    source_commit: input.source.source_git_head_sha,
    carrier_source_commit: input.source.source_git_head_sha,
    verified_payload_source_commit: null,
    plugin_id: input.owner.plugin_id ?? input.base.plugin_id ?? input.pluginId,
    plugin_source_path: input.source.plugin_source_path,
    plugin_payload_manifest_url: null,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: input.owner.profile_surface ?? input.base.profile_surface,
    managed_policy_surface: input.owner.managed_policy_surface ?? input.base.managed_policy_surface,
    runtime_source_carrier: input.owner.runtime_source_carrier ?? input.base.runtime_source_carrier,
    managed_update_source: input.managedUpdateSource,
    content_digest: input.source.payload_digest,
    content_lock_canonicalization: null,
    content_lock_paths: [],
    developer_checkout_source: input.source,
  } satisfies AgentPackageManifest;
}

export function developerCheckoutPackageCurrentness(input: {
  lock: AgentPackageLock;
  ownerManifest: AgentPackageManifest;
  source: AgentPackageDeveloperCheckoutSource;
}) {
  const reasons: string[] = [];
  if (input.lock.source_kind !== 'developer_checkout_override') reasons.push('source_policy_mismatch');
  if (input.lock.package_version !== input.ownerManifest.version) reasons.push('package_version_changed');
  if (input.lock.manifest_sha256 !== input.source.owner_manifest_sha256) reasons.push('manifest_digest_changed');
  if (input.lock.content_digest !== input.source.payload_digest) reasons.push('developer_payload_changed');
  if ((input.lock.owner_source_commit ?? null) !== input.source.source_git_head_sha) {
    reasons.push('developer_checkout_head_changed');
  }
  if ((input.lock.developer_checkout_source?.tree_sha256 ?? null) !== input.source.tree_sha256) {
    reasons.push('developer_checkout_tree_changed');
  }
  if (path.resolve(input.lock.developer_checkout_source?.checkout_path ?? input.source.checkout_path)
    !== path.resolve(input.source.checkout_path)) {
    reasons.push('developer_checkout_path_changed');
  }
  return {
    status: reasons.length === 0 ? 'current' as const : 'update_available' as const,
    reasons,
    installed_version: input.lock.package_version,
    target_version: input.ownerManifest.version,
    installed_content_digest: input.lock.content_digest,
    target_content_digest: input.source.payload_digest,
    installed_artifact_digest: input.lock.artifact_digest ?? null,
    target_artifact_digest: null,
    installed_manifest_sha256: input.lock.manifest_sha256,
    target_manifest_sha256: input.source.owner_manifest_sha256,
    installed_owner_source_commit: input.lock.owner_source_commit ?? null,
    target_owner_source_commit: input.source.source_git_head_sha,
    installed_tree_sha256: input.lock.developer_checkout_source?.tree_sha256 ?? null,
    target_tree_sha256: input.source.tree_sha256,
  };
}
