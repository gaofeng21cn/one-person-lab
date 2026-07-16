import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import {
  materializeLocalCodexPluginMarketplace,
  removeSupersededOplFamilyCodexConfigTables,
  removeSupersededOplFamilyCodexPluginPaths,
  registerLocalCodexPlugin,
  resolveCanonicalOplFamilyMarketplaceId,
  unregisterLocalCodexPlugin,
} from '../system-installation/codex-plugin-registry.ts';
import {
  materializeOplPackageSourceArchive,
  type ManagedModulePackageChannelSelection,
} from '../system-installation/module-package-channel.ts';
import {
  fetchJsonSource,
  refsOnlyAuthorityBoundary,
  resolveCodexConfigPath,
  resolveCodexHome,
  safePathSegment,
  validateUrlLike,
} from './shared.ts';
import {
  materializePackageProfile,
  noPackageProfileMigration,
  retainedPackageProfile,
  rollbackPackageProfileMigration,
} from './profile-surface.ts';
import {
  admitPackagePayloadManifest,
  payloadFileMode,
  type PackagePayloadAdmission,
  verifyCanonicalPayloadContentLock,
} from './payload-manifest.ts';
import type { BundledFullRuntimeCatalogEntry } from './bundled-full-runtime-catalog.ts';
import {
  materializeManagedPolicySurface,
  noManagedPolicyMigration,
  rollbackManagedPolicyMigration,
} from './managed-policy-surface.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from './payload-content-lock.ts';
import {
  developerCheckoutPayloadDigest,
  type DeveloperCheckoutPayloadFile,
} from './developer-checkout-package-source.ts';
import { verifyManifestContentLock } from './dependency-closure.ts';
import {
  assertSafePersistedPackagePath,
  removeSafePersistedPackagePath,
} from './persisted-path-safety.ts';
import { packageRoleFromInstalledLock } from './package-role.ts';
import type {
  AgentPackageLock,
  AgentPackageLockIndex,
  AgentPackageManifest,
  AgentPackagePayloadFile,
  AgentPackagePhysicalSurface,
} from './types.ts';
import type { OplCompanionNetworkAccess } from '../install-companions.ts';

type PhysicalMaterializationOptions = {
  keepMigrationIds?: string[];
  companionNetworkAccess?: OplCompanionNetworkAccess;
  skipManagedSurfaces?: boolean;
  reuseExistingPluginCache?: boolean;
  existingPluginCachePath?: string;
  developerCheckoutPayloadFiles?: DeveloperCheckoutPayloadFile[];
};

const PACKAGE_SOURCE_FETCH_TIMEOUT_MS = 60_000;

function resolveLocalPath(value: string) {
  return value.startsWith('file:') ? fileURLToPath(value) : path.resolve(value);
}

function safeRelativePayloadPath(value: string) {
  const normalized = path.normalize(value);
  if (
    !value.trim()
    || path.isAbsolute(value)
    || normalized === '.'
    || normalized.startsWith(`..${path.sep}`)
    || normalized === '..'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload file paths must be relative package paths.', {
      payload_path: value,
      failure_code: 'agent_package_payload_path_invalid',
    });
  }
  return normalized;
}

async function readPayloadFileContent(
  entry: Record<string, unknown>,
  payloadManifestUrl: string,
  index: number,
  dryRun: boolean,
  artifactSource: { sourceRoot: string; sourceArtifactRef: string } | null,
) {
  const contentUtf8 = typeof entry.content_utf8 === 'string' ? entry.content_utf8 : null;
  const contentBase64 = typeof entry.content_base64 === 'string' && entry.content_base64.trim()
    ? entry.content_base64.trim()
    : null;
  const sourceUrl = stringValue(entry.source_url);
  const sourcePath = stringValue(entry.source_path);
  const sourceArtifactRef = stringValue(entry.source_artifact_ref);
  const artifactSourceDeclared = sourcePath !== null || sourceArtifactRef !== null;
  if (artifactSourceDeclared && (!sourcePath || !sourceArtifactRef)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Artifact-backed package payload files require source_path and source_artifact_ref together.', {
      payload_manifest_url: payloadManifestUrl,
      file_index: index,
      source_path: sourcePath,
      source_artifact_ref: sourceArtifactRef,
      failure_code: 'agent_package_payload_artifact_source_incomplete',
    });
  }
  const sourceCount = [
    contentUtf8 !== null,
    contentBase64 !== null,
    sourceUrl !== null,
    artifactSourceDeclared,
  ]
    .filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload files require exactly one content source.', {
      payload_manifest_url: payloadManifestUrl,
      file_index: index,
      required: ['exactly one of content_utf8, content_base64, source_url, or source_path + source_artifact_ref'],
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  if (contentBase64 !== null) return { content: Buffer.from(contentBase64, 'base64'), digestVerified: true, artifactBacked: false };
  if (contentUtf8 !== null) return { content: Buffer.from(contentUtf8, 'utf8'), digestVerified: true, artifactBacked: false };

  if (artifactSourceDeclared) {
    if (!artifactSource || sourceArtifactRef !== artifactSource.sourceArtifactRef) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package payload file artifact source does not match the materialized source archive.', {
        payload_manifest_url: payloadManifestUrl,
        file_index: index,
        source_path: sourcePath,
        source_artifact_ref: sourceArtifactRef,
        materialized_source_artifact_ref: artifactSource?.sourceArtifactRef ?? null,
        failure_code: 'agent_package_payload_artifact_source_mismatch',
      });
    }
    const relativeSourcePath = safeRelativePayloadPath(sourcePath!);
    const sourceFilePath = path.join(artifactSource.sourceRoot, relativeSourcePath);
    if (!sourceFilePath.startsWith(`${artifactSource.sourceRoot}${path.sep}`)
      || !fs.existsSync(sourceFilePath)
      || !fs.lstatSync(sourceFilePath).isFile()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package payload source_path is missing from the selected source archive.', {
        payload_manifest_url: payloadManifestUrl,
        file_index: index,
        source_path: sourcePath,
        source_artifact_ref: sourceArtifactRef,
        failure_code: 'agent_package_payload_artifact_source_missing',
      });
    }
    const sourceRootReal = fs.realpathSync(artifactSource.sourceRoot);
    const sourceFileReal = fs.realpathSync(sourceFilePath);
    if (!sourceFileReal.startsWith(`${sourceRootReal}${path.sep}`)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package payload source_path escapes the selected source archive root.', {
        payload_manifest_url: payloadManifestUrl,
        file_index: index,
        source_path: sourcePath,
        failure_code: 'agent_package_payload_artifact_source_escape',
      });
    }
    return { content: fs.readFileSync(sourceFileReal), digestVerified: true, artifactBacked: true };
  }

  validateUrlLike(sourceUrl!, 'payload.files[].source_url');
  if (sourceUrl!.startsWith('http://') || sourceUrl!.startsWith('https://')) {
    if (dryRun) return { content: Buffer.alloc(0), digestVerified: false, artifactBacked: false };
    const response = await fetch(sourceUrl!, {
      signal: AbortSignal.timeout(PACKAGE_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new FrameworkContractError('codex_command_failed', 'Agent package payload file fetch failed.', {
        source_url: sourceUrl,
        status: response.status,
        status_text: response.statusText,
      });
    }
    return { content: Buffer.from(await response.arrayBuffer()), digestVerified: true, artifactBacked: false };
  }
  return { content: fs.readFileSync(resolveLocalPath(sourceUrl!)), digestVerified: true, artifactBacked: false };
}

async function normalizePayloadFiles(
  payload: unknown,
  payloadManifestUrl: string,
  dryRun: boolean,
  artifactSource: { sourceRoot: string; sourceArtifactRef: string } | null,
  admission: PackagePayloadAdmission,
): Promise<AgentPackagePayloadFile[]> {
  if (!isRecord(payload) || !Array.isArray(payload.files)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload manifest must contain a files array.', {
      payload_manifest_url: payloadManifestUrl,
      required: ['files'],
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  const fileRecords = recordList(payload.files);
  if (fileRecords.length !== payload.files.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload manifest files must be JSON objects.', {
      payload_manifest_url: payloadManifestUrl,
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  return Promise.all(fileRecords.map(async (entry, index) => {
    const relativePath = stringValue(entry.path);
    if (!relativePath) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload files require a path.', {
        payload_manifest_url: payloadManifestUrl,
        file_index: index,
        required: ['path'],
        failure_code: 'agent_package_payload_manifest_invalid',
      });
    }
    const { content, digestVerified, artifactBacked } = await readPayloadFileContent(
      entry,
      payloadManifestUrl,
      index,
      dryRun,
      artifactSource,
    );
    const sha256 = stringValue(entry.sha256);
    if (artifactBacked && !sha256) {
      throw new FrameworkContractError('contract_shape_invalid', 'Artifact-backed package payload files require a sha256 digest.', {
        payload_manifest_url: payloadManifestUrl,
        file_index: index,
        payload_path: relativePath,
        failure_code: 'agent_package_payload_artifact_file_digest_missing',
      });
    }
    if (sha256 && digestVerified) {
      const expected = sha256.startsWith('sha256:') ? sha256.slice('sha256:'.length) : sha256;
      const actual = crypto.createHash('sha256').update(content).digest('hex');
      if (actual !== expected) {
        throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload file sha256 mismatch.', {
          payload_manifest_url: payloadManifestUrl,
          payload_path: relativePath,
          expected_sha256: sha256,
          actual_sha256: `sha256:${actual}`,
          failure_code: 'agent_package_payload_file_sha256_mismatch',
        });
      }
    }
    return {
      relativePath: safeRelativePayloadPath(relativePath),
      content,
      sha256,
      mode: payloadFileMode(admission, entry),
      digestVerified,
    };
  }));
}

function normalizedSha256(value: string) {
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

function exactPayloadGenerationMatches(root: string, files: AgentPackagePayloadFile[]) {
  if (!fs.existsSync(root)) return false;
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return false;

  const actualPaths: string[] = [];
  const visit = (directory: string): boolean => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) return false;
      if (stat.isDirectory()) {
        if (!visit(absolutePath)) return false;
      } else if (stat.isFile()) {
        actualPaths.push(path.relative(root, absolutePath));
      } else {
        return false;
      }
    }
    return true;
  };
  if (!visit(root)) return false;

  const expectedPaths = files.map((file) => file.relativePath).sort();
  actualPaths.sort();
  if (actualPaths.length !== expectedPaths.length
    || actualPaths.some((entry, index) => entry !== expectedPaths[index])) return false;

  return files.every((file) => {
    const targetPath = path.join(root, file.relativePath);
    const stat = fs.lstatSync(targetPath);
    return stat.isFile()
      && !stat.isSymbolicLink()
      && fs.readFileSync(targetPath).equals(file.content)
      && (stat.mode & 0o777) === (file.mode === '100755' ? 0o755 : 0o644);
  });
}

function materializeArtifactPayloadSource(input: {
  payload: Record<string, unknown>;
  manifest: AgentPackageManifest;
  payloadManifestUrl: string;
  selection: ManagedModulePackageChannelSelection | null;
  targetPath: string;
}) {
  const files = recordList(input.payload.files);
  const artifactFileCount = files.filter((entry) => (
    stringValue(entry.source_path) !== null || stringValue(entry.source_artifact_ref) !== null
  )).length;
  if (!input.selection && artifactFileCount === 0) return null;
  if (!input.selection) {
    throw new FrameworkContractError('contract_shape_invalid', 'Artifact-backed package payload requires the immutable catalog selection that supplied it.', {
      package_id: input.manifest.package_id,
      package_version: input.manifest.version,
      payload_manifest_url: input.payloadManifestUrl,
      failure_code: 'agent_package_payload_artifact_selection_missing',
    });
  }
  if (files.length === 0 || artifactFileCount !== files.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed catalog payload files must all come from the selected source archive.', {
      package_id: input.manifest.package_id,
      package_version: input.manifest.version,
      payload_manifest_url: input.payloadManifestUrl,
      file_count: files.length,
      artifact_file_count: artifactFileCount,
      failure_code: 'agent_package_payload_catalog_source_bypass',
    });
  }
  const packageSource = isRecord(input.payload.package_source) ? input.payload.package_source : null;
  const transport = stringValue(packageSource?.transport);
  const artifactRef = stringValue(packageSource?.artifact_ref);
  const archiveSha256 = stringValue(packageSource?.archive_sha256);
  const archiveRoot = stringValue(packageSource?.archive_root);
  const payloadPackageId = stringValue(input.payload.package_id);
  const payloadPackageVersion = stringValue(input.payload.package_version);
  if (transport !== 'same_oci_artifact_source_archive'
    || !artifactRef
    || !archiveSha256
    || !archiveRoot
    || payloadPackageId !== input.manifest.package_id
    || payloadPackageVersion !== input.manifest.version
    || artifactRef !== input.selection.source_artifact_ref
    || normalizedSha256(archiveSha256) !== normalizedSha256(input.selection.package_content_digest)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Artifact-backed package payload does not match its immutable catalog selection.', {
      package_id: input.manifest.package_id,
      package_version: input.manifest.version,
      payload_manifest_url: input.payloadManifestUrl,
      payload_package_id: payloadPackageId,
      payload_package_version: payloadPackageVersion,
      transport,
      payload_artifact_ref: artifactRef,
      selected_artifact_ref: input.selection.source_artifact_ref,
      payload_archive_sha256: archiveSha256,
      selected_package_content_digest: input.selection.package_content_digest,
      archive_root: archiveRoot,
      failure_code: 'agent_package_payload_artifact_selection_mismatch',
    });
  }
  materializeOplPackageSourceArchive({
    selection: input.selection,
    expectedPackageId: input.manifest.package_id,
    archiveRoot,
    targetPath: input.targetPath,
    details: {
      payload_manifest_url: input.payloadManifestUrl,
      surface: 'agent_package_physical_source',
    },
  });
  return {
    sourceRoot: input.targetPath,
    sourceArtifactRef: artifactRef,
  };
}

async function materializePayloadManifestSource(input: {
  manifest: AgentPackageManifest;
  payloadManifestUrl: string;
  dryRun: boolean;
  catalogSelection: ManagedModulePackageChannelSelection | null;
}) {
  const fetched = await fetchJsonSource(input.payloadManifestUrl);
  if (!isRecord(fetched.payload)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload manifest must be a JSON object.', {
      payload_manifest_url: input.payloadManifestUrl,
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  const admission = admitPackagePayloadManifest({
    payload: fetched.payload,
    manifest: input.manifest,
    payloadManifestUrl: input.payloadManifestUrl,
    catalogSelection: input.catalogSelection,
  });
  const artifactStageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-source-'));
  let files: AgentPackagePayloadFile[];
  try {
    const artifactSource = materializeArtifactPayloadSource({
      payload: fetched.payload,
      manifest: input.manifest,
      payloadManifestUrl: input.payloadManifestUrl,
      selection: input.catalogSelection,
      targetPath: path.join(artifactStageRoot, 'source'),
    });
    files = await normalizePayloadFiles(
      fetched.payload,
      input.payloadManifestUrl,
      input.dryRun,
      artifactSource,
      admission,
    );
  } finally {
    fs.rmSync(artifactStageRoot, { recursive: true, force: true });
  }
  verifyCanonicalPayloadContentLock(admission, files, input.payloadManifestUrl);
  const persistentPayloadRoot = path.join(
    resolveOplStatePaths().state_dir,
    'agent-package-payloads',
    safePathSegment(input.manifest.package_id),
    `${safePathSegment(input.manifest.version)}-${fetched.source_sha256}`,
  );
  if (!input.dryRun) {
    assertSafePersistedPackagePath({
      candidatePath: persistentPayloadRoot,
      allowedRoots: [path.join(resolveOplStatePaths().state_dir, 'agent-package-payloads')],
      pathKind: 'agent_package_payload_generation',
    });
  }
  const payloadRoot = input.dryRun
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-package-payload-'))
    : `${persistentPayloadRoot}.stage-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  if (!input.dryRun && fs.existsSync(persistentPayloadRoot)) {
    if (!exactPayloadGenerationMatches(persistentPayloadRoot, files)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Existing package payload generation does not match its immutable digest.', {
        package_id: input.manifest.package_id,
        payload_root: persistentPayloadRoot,
        payload_manifest_sha256: fetched.source_sha256,
        failure_code: 'agent_package_payload_generation_digest_mismatch',
      });
    }
    return {
      payloadRoot: persistentPayloadRoot,
      payloadManifestSha256: fetched.source_sha256,
      persistentCachePath: persistentPayloadRoot,
      verifiedPayloadSourceCommit: admission.sourceCommit,
    };
  }
  fs.mkdirSync(payloadRoot, { recursive: true });
  try {
    for (const file of files) {
      const targetPath = path.join(payloadRoot, file.relativePath);
      if (!targetPath.startsWith(`${payloadRoot}${path.sep}`)) {
        throw new FrameworkContractError('contract_shape_invalid', 'Agent package payload file path escapes the payload root.', {
          payload_manifest_url: input.payloadManifestUrl,
          payload_path: file.relativePath,
          failure_code: 'agent_package_payload_path_invalid',
        });
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      let descriptor: number | undefined;
      try {
        descriptor = fs.openSync(
          targetPath,
          fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0),
          0o600,
        );
        fs.writeFileSync(descriptor, file.content);
        fs.fchmodSync(descriptor, file.mode === '100755' ? 0o755 : 0o644);
        fs.fsyncSync(descriptor);
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
      }
    }
    if (!input.dryRun) fs.renameSync(payloadRoot, persistentPayloadRoot);
  } catch (error) {
    fs.rmSync(payloadRoot, { recursive: true, force: true });
    throw error;
  }
  const finalPayloadRoot = input.dryRun ? payloadRoot : persistentPayloadRoot;
  if (!exactPayloadGenerationMatches(finalPayloadRoot, files)) {
    if (!input.dryRun) fs.rmSync(finalPayloadRoot, { recursive: true, force: true });
    throw new FrameworkContractError('contract_shape_invalid', 'Package payload generation failed exact-byte verification.', {
      package_id: input.manifest.package_id,
      payload_root: finalPayloadRoot,
      failure_code: 'agent_package_payload_generation_digest_mismatch',
    });
  }
  return {
    payloadRoot: finalPayloadRoot,
    payloadManifestSha256: fetched.source_sha256,
    persistentCachePath: input.dryRun ? null : finalPayloadRoot,
    verifiedPayloadSourceCommit: admission.sourceCommit,
  };
}

function safeBundledSourceRoot(value: string) {
  if (value === '.') return value;
  return safeRelativePayloadPath(value);
}

function assertBundledPathComponentsAreReal(input: {
  rootPath: string;
  relativePath: string;
  payloadManifestUrl: string;
  payloadPath: string;
}) {
  let currentPath = input.rootPath;
  for (const segment of input.relativePath === '.' ? [] : input.relativePath.split(path.sep)) {
    currentPath = path.join(currentPath, segment);
    if (fs.lstatSync(currentPath).isSymbolicLink()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package payload paths must not contain symbolic links.', {
        payload_manifest_url: input.payloadManifestUrl,
        payload_path: input.payloadPath,
        symbolic_link_path: currentPath,
        failure_code: 'agent_package_bundled_payload_symlink_forbidden',
      });
    }
  }
}

function bundledPayloadFile(input: {
  packageRoot: string;
  sourceRoot: string;
  entry: Record<string, unknown>;
  payloadManifestUrl: string;
  index: number;
  admission: PackagePayloadAdmission;
}): AgentPackagePayloadFile {
  const relativePathValue = stringValue(input.entry.path);
  if (!relativePathValue) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled package payload files require a path.', {
      payload_manifest_url: input.payloadManifestUrl,
      file_index: input.index,
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  const relativePath = safeRelativePayloadPath(relativePathValue);
  const sourceFilePath = path.resolve(input.packageRoot, input.sourceRoot, relativePath);
  const sourceRootPath = path.resolve(input.packageRoot, input.sourceRoot);
  if (!sourceFilePath.startsWith(`${sourceRootPath}${path.sep}`)
    || !fs.existsSync(sourceFilePath)
    || !fs.lstatSync(sourceFilePath).isFile()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package payload file is missing or is not a regular file.', {
      payload_manifest_url: input.payloadManifestUrl,
      payload_path: relativePath,
      source_file_path: sourceFilePath,
      failure_code: 'agent_package_bundled_payload_file_missing',
    });
  }
  const rootReal = fs.realpathSync(sourceRootPath);
  const fileReal = fs.realpathSync(sourceFilePath);
  if (!fileReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package payload file escapes its packaged source root.', {
      payload_manifest_url: input.payloadManifestUrl,
      payload_path: relativePath,
      source_file_path: sourceFilePath,
      failure_code: 'agent_package_bundled_payload_path_escape',
    });
  }
  assertBundledPathComponentsAreReal({
    rootPath: sourceRootPath,
    relativePath,
    payloadManifestUrl: input.payloadManifestUrl,
    payloadPath: relativePath,
  });
  const content = fs.readFileSync(fileReal);
  const expectedDigest = stringValue(input.entry.sha256);
  const actualDigest = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
  if (!expectedDigest || expectedDigest !== actualDigest) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package payload file digest does not match its catalog payload.', {
      payload_manifest_url: input.payloadManifestUrl,
      payload_path: relativePath,
      expected_sha256: expectedDigest,
      actual_sha256: actualDigest,
      failure_code: 'agent_package_bundled_payload_file_sha256_mismatch',
    });
  }
  const mode = payloadFileMode(input.admission, input.entry);
  const expectedMode = mode === '100755' ? 0o755 : 0o644;
  const actualMode = fs.statSync(fileReal).mode & 0o777;
  if (actualMode !== expectedMode) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package payload file mode does not match its catalog payload.', {
      payload_manifest_url: input.payloadManifestUrl,
      payload_path: relativePath,
      expected_mode: mode,
      actual_mode: actualMode.toString(8).padStart(3, '0'),
      failure_code: 'agent_package_bundled_payload_file_mode_mismatch',
    });
  }
  return {
    relativePath,
    content,
    sha256: expectedDigest,
    mode,
    digestVerified: true,
  };
}

export function resolveBundledFullRuntimeManifestPhysicalSource(input: {
  manifest: AgentPackageManifest;
  catalogEntry: BundledFullRuntimeCatalogEntry;
  packageRoot: string;
}) {
  const packageRoot = path.resolve(input.packageRoot);
  if (!fs.existsSync(packageRoot)
    || !fs.lstatSync(packageRoot).isDirectory()
    || fs.lstatSync(packageRoot).isSymbolicLink()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime package root is missing or is not a real directory.', {
      package_id: input.manifest.package_id,
      package_root: packageRoot,
      failure_code: 'agent_package_bundled_package_root_missing',
    });
  }
  const payload = parseJsonText(input.catalogEntry.payloadManifestJson);
  if (!isRecord(payload)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime payload manifest must be a JSON object.', {
      package_id: input.manifest.package_id,
      payload_manifest_url: input.catalogEntry.payloadManifestUrl,
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  const admission = admitPackagePayloadManifest({
    payload,
    manifest: input.manifest,
    payloadManifestUrl: input.catalogEntry.payloadManifestUrl,
    catalogSelection: {
      package_id: input.catalogEntry.packageId,
      package_version: input.catalogEntry.packageVersion,
      owner_source_commit: input.catalogEntry.ownerSourceCommit,
    },
  });
  const sourceRoot = safeBundledSourceRoot(stringValue(payload.source_root) ?? '');
  const sourceRootPath = path.resolve(packageRoot, sourceRoot);
  if ((sourceRootPath !== packageRoot && !sourceRootPath.startsWith(`${packageRoot}${path.sep}`))
    || !fs.existsSync(sourceRootPath)
    || !fs.lstatSync(sourceRootPath).isDirectory()
    || fs.lstatSync(sourceRootPath).isSymbolicLink()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime payload source root is missing or unsafe.', {
      package_id: input.manifest.package_id,
      package_root: packageRoot,
      source_root: sourceRoot,
      failure_code: 'agent_package_bundled_payload_source_root_invalid',
    });
  }
  assertBundledPathComponentsAreReal({
    rootPath: packageRoot,
    relativePath: sourceRoot,
    payloadManifestUrl: input.catalogEntry.payloadManifestUrl,
    payloadPath: sourceRoot,
  });
  const packageRootReal = fs.realpathSync(packageRoot);
  const sourceRootReal = fs.realpathSync(sourceRootPath);
  if (sourceRootReal !== packageRootReal && !sourceRootReal.startsWith(`${packageRootReal}${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime payload source root escapes its packaged module root.', {
      package_id: input.manifest.package_id,
      package_root: packageRoot,
      package_root_real: packageRootReal,
      source_root: sourceRoot,
      source_root_real: sourceRootReal,
      failure_code: 'agent_package_bundled_payload_path_escape',
    });
  }
  const files = recordList(payload.files).map((entry, index) => bundledPayloadFile({
    packageRoot,
    sourceRoot,
    entry,
    payloadManifestUrl: input.catalogEntry.payloadManifestUrl,
    index,
    admission,
  }));
  if (!Array.isArray(payload.files) || files.length !== payload.files.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Bundled Full runtime payload files must all be JSON objects.', {
      package_id: input.manifest.package_id,
      payload_manifest_url: input.catalogEntry.payloadManifestUrl,
      failure_code: 'agent_package_payload_manifest_invalid',
    });
  }
  verifyCanonicalPayloadContentLock(admission, files, input.catalogEntry.payloadManifestUrl);
  return {
    ...input.manifest,
    plugin_source_path: sourceRootPath,
    plugin_payload_manifest_url: input.catalogEntry.payloadManifestUrl,
    plugin_payload_manifest_sha256: input.catalogEntry.payloadManifestSha256.replace(/^sha256:/, ''),
    plugin_payload_cache_path: null,
    verified_payload_source_commit: admission.sourceCommit,
  };
}

export async function resolveManifestPhysicalSource(
  manifest: AgentPackageManifest,
  dryRun: boolean,
  catalogSelection: ManagedModulePackageChannelSelection | null = null,
): Promise<AgentPackageManifest> {
  if (manifest.plugin_source_path || !manifest.plugin_payload_manifest_url) {
    return manifest;
  }
  const payload = await materializePayloadManifestSource({
    manifest,
    payloadManifestUrl: manifest.plugin_payload_manifest_url,
    dryRun,
    catalogSelection,
  });
  return {
    ...manifest,
    plugin_source_path: payload.payloadRoot,
    plugin_payload_manifest_sha256: payload.payloadManifestSha256,
    plugin_payload_cache_path: payload.persistentCachePath,
    verified_payload_source_commit: payload.verifiedPayloadSourceCommit,
  };
}

function buildPhysicalSurfacePaths(manifest: AgentPackageManifest) {
  const codexHome = resolveCodexHome();
  const pluginId = manifest.plugin_id;
  if (pluginId && (pluginId === '.'
    || pluginId === '..'
    || pluginId.includes('/')
    || pluginId.includes('\\')
    || path.basename(pluginId) !== pluginId)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package plugin id must be one safe path segment.', {
      package_id: manifest.package_id,
      plugin_id: pluginId,
      failure_code: 'agent_package_plugin_id_invalid',
    });
  }
  if (manifest.version === '.'
    || manifest.version === '..'
    || manifest.version.includes('/')
    || manifest.version.includes('\\')
    || path.basename(manifest.version) !== manifest.version) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package version must be one safe path segment.', {
      package_id: manifest.package_id,
      package_version: manifest.version,
      failure_code: 'agent_package_version_path_invalid',
    });
  }
  if (manifest.developer_checkout_source
    && !/^sha256:[0-9a-f]{64}$/.test(manifest.developer_checkout_source.payload_digest)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout payload digest is invalid.', {
      package_id: manifest.package_id,
      payload_digest: manifest.developer_checkout_source.payload_digest,
      failure_code: 'agent_package_developer_checkout_source_invalid',
    });
  }
  const marketplaceId = pluginId
    ? resolveCanonicalOplFamilyMarketplaceId(manifest.package_id, pluginId)
      ?? `opl-agent-${safePathSegment(manifest.package_id)}-local`
    : `opl-agent-${safePathSegment(manifest.package_id)}-local`;
  const marketplaceRoot = path.join(resolveOplStatePaths().state_dir, 'codex-plugin-marketplaces', marketplaceId);
  const marketplacePath = path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  const marketplacePluginPath = pluginId ? path.join(marketplaceRoot, 'plugins', pluginId) : null;
  const cacheIdentity = manifest.developer_checkout_source?.payload_digest
    ?? manifest.content_digest
    ?? (manifest.plugin_payload_manifest_sha256
      ? `sha256:${manifest.plugin_payload_manifest_sha256.replace(/^sha256:/, '')}`
      : null);
  const cacheVersion = cacheIdentity
    ? `${manifest.version}-${manifest.developer_checkout_source ? 'dev-' : ''}${cacheIdentity.replace(/^sha256:/, '')}`
    : manifest.version;
  const codexPluginCachePath = pluginId
    ? path.join(codexHome, 'plugins', 'cache', marketplaceId, pluginId, cacheVersion)
    : null;
  if (codexPluginCachePath) {
    assertSafePersistedPackagePath({
      candidatePath: codexPluginCachePath,
      allowedRoots: [path.join(codexHome, 'plugins', 'cache')],
      pathKind: 'agent_package_plugin_cache_generation',
    });
  }
  return {
    codexHome,
    codexConfigPath: resolveCodexConfigPath(codexHome),
    marketplaceId,
    marketplaceRoot,
    marketplacePath,
    marketplacePluginPath,
    codexPluginCachePath,
  };
}

function removeCreatedEmptyCodexConfig(configPath: string, preexisting: boolean) {
  if (preexisting || !fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) return;
  if (fs.readFileSync(configPath, 'utf8').trim().length === 0) {
    fs.rmSync(configPath, { force: true });
  }
}

function copyDirectory(source: string, target: string) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function copyContentLockPaths(source: string, target: string, relativePaths: string[]) {
  fs.rmSync(target, { recursive: true, force: true });
  for (const relativePath of relativePaths) {
    const sourcePath = path.join(source, relativePath);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability package content lock path is missing from the provider source.', {
        plugin_source_path: source,
        content_lock_path: relativePath,
        failure_code: 'capability_package_content_lock_path_missing',
      });
    }
    const targetPath = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function makeGenerationTreeWritable(root: string) {
  if (!fs.existsSync(root)) return;
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    fs.chmodSync(root, stat.mode & 0o111 ? 0o755 : 0o644);
    return;
  }
  if (!stat.isDirectory()) return;
  fs.chmodSync(root, 0o755);
  for (const entry of fs.readdirSync(root)) makeGenerationTreeWritable(path.join(root, entry));
}

function freezeDeveloperPluginGeneration(root: string) {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer plugin cache only admits regular files and directories.', {
      cache_path: root,
      failure_code: 'agent_package_plugin_cache_generation_invalid',
    });
  }
  if (stat.isFile()) {
    fs.chmodSync(root, stat.mode & 0o111 ? 0o555 : 0o444);
    return;
  }
  for (const entry of fs.readdirSync(root)) freezeDeveloperPluginGeneration(path.join(root, entry));
  fs.chmodSync(root, 0o555);
}

function expectedDeveloperPluginDirectories(paths: string[]) {
  const directories = new Set<string>();
  for (const relativePath of paths) {
    let parent = path.posix.dirname(relativePath);
    while (parent !== '.') {
      directories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  return [...directories].sort();
}

function developerPluginGenerationInventory(root: string) {
  const files = new Map<string, fs.Stats>();
  const directories = new Map<string, fs.Stats>();
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new FrameworkContractError('contract_shape_invalid', 'Developer plugin cache does not admit symbolic links.', {
          cache_path: root,
          generation_path: relativePath,
          failure_code: 'agent_package_plugin_cache_generation_invalid',
        });
      }
      if (stat.isDirectory()) {
        directories.set(relativePath, stat);
        visit(absolutePath);
      } else if (stat.isFile()) {
        files.set(relativePath, stat);
      } else {
        throw new FrameworkContractError('contract_shape_invalid', 'Developer plugin cache contains an unsupported filesystem entry.', {
          cache_path: root,
          generation_path: relativePath,
          failure_code: 'agent_package_plugin_cache_generation_invalid',
        });
      }
    }
  };
  visit(root);
  return { files, directories };
}

function verifyImmutablePluginCache(manifest: AgentPackageManifest, cachePath: string) {
  if (!fs.existsSync(cachePath)
    || !fs.lstatSync(cachePath).isDirectory()
    || fs.lstatSync(cachePath).isSymbolicLink()) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package plugin cache generation is missing or unsafe.', {
      package_id: manifest.package_id,
      codex_plugin_cache_path: cachePath,
      failure_code: 'agent_package_plugin_cache_generation_invalid',
    });
  }
  const cachedManifest = { ...manifest, plugin_source_path: cachePath };
  if (manifest.developer_checkout_source) {
    const actualDigest = developerCheckoutCacheDigest(cachePath, manifest);
    if (actualDigest !== manifest.developer_checkout_source.payload_digest) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package developer plugin cache generation digest mismatch.', {
        package_id: manifest.package_id,
        expected_payload_digest: manifest.developer_checkout_source.payload_digest,
        actual_payload_digest: actualDigest,
        failure_code: 'agent_package_plugin_cache_generation_invalid',
      });
    }
  } else {
    verifyManifestContentLock(cachedManifest);
  }
  validateMaterializedRequiredSkills(cachedManifest, cachePath);
}

function materializeImmutablePluginCache(input: {
  manifest: AgentPackageManifest;
  sourcePath: string;
  targetPath: string;
  developerCheckoutPayloadFiles?: DeveloperCheckoutPayloadFile[];
}) {
  if (fs.existsSync(input.targetPath)) {
    try {
      verifyImmutablePluginCache(input.manifest, input.targetPath);
      return false;
    } catch (error) {
      if (!input.manifest.developer_checkout_source || !input.developerCheckoutPayloadFiles) throw error;
      copyDeveloperCheckoutSurface(
        input.targetPath,
        input.manifest,
        input.developerCheckoutPayloadFiles,
      );
      verifyImmutablePluginCache(input.manifest, input.targetPath);
      return true;
    }
  }
  const stagePath = `${input.targetPath}.stage-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  try {
    if (input.manifest.developer_checkout_source) {
      copyDeveloperCheckoutSurface(
        stagePath,
        input.manifest,
        input.developerCheckoutPayloadFiles,
      );
    } else if (input.manifest.content_lock_paths.length > 0) {
      copyContentLockPaths(input.sourcePath, stagePath, input.manifest.content_lock_paths);
    } else {
      copyDirectory(input.sourcePath, stagePath);
    }
    verifyImmutablePluginCache(input.manifest, stagePath);
    fs.mkdirSync(path.dirname(input.targetPath), { recursive: true });
    fs.renameSync(stagePath, input.targetPath);
    return true;
  } catch (error) {
    makeGenerationTreeWritable(stagePath);
    fs.rmSync(stagePath, { recursive: true, force: true });
    throw error;
  }
}

function verifiedDeveloperCheckoutPayloadFiles(
  manifest: AgentPackageManifest,
  payloadFiles: DeveloperCheckoutPayloadFile[] | undefined,
) {
  const snapshot = manifest.developer_checkout_source;
  if (!snapshot || !payloadFiles) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout package snapshot does not match its plugin source.', {
      package_id: manifest.package_id,
      failure_code: 'agent_package_developer_checkout_source_invalid',
    });
  }
  const byPath = new Map(payloadFiles.map((entry) => [entry.path, entry.content]));
  const modeByPath = new Map(payloadFiles.map((entry) => [entry.path, entry.mode]));
  const expectedPaths = [...snapshot.copy_paths].sort();
  const expectedModes = snapshot.copy_file_modes ?? {};
  if (byPath.size !== payloadFiles.length
    || byPath.size !== expectedPaths.length
    || Object.keys(expectedModes).length !== expectedPaths.length
    || expectedPaths.some((relativePath) =>
      !byPath.has(relativePath)
      || (expectedModes[relativePath] !== '100644' && expectedModes[relativePath] !== '100755')
      || modeByPath.get(relativePath) !== expectedModes[relativePath])) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout captured payload paths do not match its snapshot.', {
      package_id: manifest.package_id,
      failure_code: 'agent_package_developer_checkout_source_invalid',
    });
  }
  const ordered = expectedPaths.map((relativePath) => ({
    path: relativePath,
    content: Buffer.from(byPath.get(relativePath)!),
    mode: expectedModes[relativePath],
  }));
  const digest = developerCheckoutPayloadDigest(ordered);
  if (digest !== snapshot.payload_digest) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout captured payload bytes do not match its snapshot digest.', {
      package_id: manifest.package_id,
      expected_payload_digest: snapshot.payload_digest,
      actual_payload_digest: digest,
      failure_code: 'agent_package_developer_checkout_source_invalid',
    });
  }
  return ordered;
}

function developerCheckoutCacheDigest(
  target: string,
  manifest: AgentPackageManifest,
) {
  const snapshot = manifest.developer_checkout_source!;
  const expectedPaths = [...snapshot.copy_paths].sort();
  const expectedModes = snapshot.copy_file_modes ?? {};
  const expectedDirectories = expectedDeveloperPluginDirectories(expectedPaths);
  const inventory = developerPluginGenerationInventory(target);
  if ((fs.lstatSync(target).mode & 0o777) !== 0o555
    || inventory.files.size !== expectedPaths.length
    || inventory.directories.size !== expectedDirectories.length
    || expectedPaths.some((relativePath) => !inventory.files.has(relativePath))
    || expectedDirectories.some((relativePath) => !inventory.directories.has(relativePath))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout plugin cache is not an exact frozen generation.', {
      package_id: manifest.package_id,
      cache_path: target,
      expected_file_count: expectedPaths.length,
      actual_file_count: inventory.files.size,
      expected_directory_count: expectedDirectories.length,
      actual_directory_count: inventory.directories.size,
      failure_code: 'agent_package_plugin_cache_generation_invalid',
    });
  }
  for (const relativePath of expectedDirectories) {
    if ((inventory.directories.get(relativePath)!.mode & 0o777) !== 0o555) {
      throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout plugin cache directory mode drifted.', {
        package_id: manifest.package_id,
        cache_path: target,
        generation_path: relativePath,
        failure_code: 'agent_package_plugin_cache_generation_invalid',
      });
    }
  }
  return developerCheckoutPayloadDigest(
    expectedPaths.map((relativePath) => {
      const targetPath = path.resolve(target, relativePath);
      const targetRoot = path.resolve(target);
      const expectedSourceMode = expectedModes[relativePath];
      const expectedGenerationMode = expectedSourceMode === '100755' ? 0o555 : 0o444;
      if ((targetPath !== targetRoot && !targetPath.startsWith(`${targetRoot}${path.sep}`))
        || !fs.existsSync(targetPath)
        || !fs.lstatSync(targetPath).isFile()
        || fs.lstatSync(targetPath).isSymbolicLink()
        || (expectedSourceMode !== '100644' && expectedSourceMode !== '100755')
        || (fs.lstatSync(targetPath).mode & 0o777) !== expectedGenerationMode) {
        throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout LKG cache is incomplete or unsafe.', {
          package_id: manifest.package_id,
          cache_path: target,
          copy_path: relativePath,
          failure_code: 'agent_package_developer_checkout_lkg_unavailable',
        });
      }
      return {
        path: relativePath,
        content: fs.readFileSync(targetPath),
        mode: expectedSourceMode,
      };
    }),
  );
}

export function assertDeveloperCheckoutPluginCacheGeneration(input: {
  packageId: string;
  cachePath: string;
  source: NonNullable<AgentPackageManifest['developer_checkout_source']>;
}) {
  return developerCheckoutCacheDigest(input.cachePath, {
    package_id: input.packageId,
    developer_checkout_source: input.source,
  } as AgentPackageManifest);
}

function copyDeveloperCheckoutSurface(
  target: string,
  manifest: AgentPackageManifest,
  payloadFiles: DeveloperCheckoutPayloadFile[] | undefined,
) {
  const ordered = verifiedDeveloperCheckoutPayloadFiles(manifest, payloadFiles);
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, `.${path.basename(target)}.stage-`));
  const displaced = `${target}.displaced-${process.pid}-${Date.now()}`;
  let targetDisplaced = false;
  try {
    for (const entry of ordered) {
      const targetPath = path.join(stage, entry.path);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const generationMode = entry.mode === '100755' ? 0o555 : 0o444;
      fs.writeFileSync(targetPath, entry.content, { mode: generationMode });
      fs.chmodSync(targetPath, generationMode);
    }
    freezeDeveloperPluginGeneration(stage);
    const stagedDigest = developerCheckoutCacheDigest(stage, manifest);
    if (stagedDigest !== manifest.developer_checkout_source!.payload_digest) {
      throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout staged payload bytes failed digest verification.', {
        package_id: manifest.package_id,
        expected_payload_digest: manifest.developer_checkout_source!.payload_digest,
        actual_payload_digest: stagedDigest,
        failure_code: 'agent_package_developer_checkout_source_invalid',
      });
    }
    if (fs.existsSync(target)) {
      fs.renameSync(target, displaced);
      targetDisplaced = true;
    }
    fs.renameSync(stage, target);
    if (targetDisplaced) {
      makeGenerationTreeWritable(displaced);
      fs.rmSync(displaced, { recursive: true, force: true });
    }
  } catch (error) {
    makeGenerationTreeWritable(stage);
    fs.rmSync(stage, { recursive: true, force: true });
    if (!fs.existsSync(target) && targetDisplaced && fs.existsSync(displaced)) {
      fs.renameSync(displaced, target);
    }
    throw error;
  }
}

function requiredSkillPath(pluginSourcePath: string, skillId: string) {
  const normalized = skillId.trim();
  if (!normalized || normalized.includes('/') || normalized.includes('\\') || normalized === '.' || normalized === '..') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package required skill id must be a safe path segment.', {
      required_skill_id: skillId,
      failure_code: 'agent_package_required_skill_id_invalid',
    });
  }
  return path.join(pluginSourcePath, 'skills', normalized, 'SKILL.md');
}

function validateMaterializedRequiredSkills(manifest: AgentPackageManifest, pluginSourcePath: string) {
  const requiredSkillPaths = manifest.required_skill_ids.map((skillId) => ({
    skillId,
    skillPath: requiredSkillPath(pluginSourcePath, skillId),
  }));
  const missing = requiredSkillPaths.filter((entry) => !fs.existsSync(entry.skillPath));
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package plugin source must contain bundled required skill files before physical materialization.', {
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      plugin_source_path: pluginSourcePath,
      missing_required_skill_ids: missing.map((entry) => entry.skillId),
      missing_required_skill_paths: missing.map((entry) => entry.skillPath),
      failure_code: 'agent_package_required_skill_missing',
    });
  }
  return requiredSkillPaths;
}

export function materializePhysicalCodexSurface(
  manifest: AgentPackageManifest,
  dryRun: boolean,
  options: PhysicalMaterializationOptions = {},
): AgentPackagePhysicalSurface {
  const paths = buildPhysicalSurfacePaths(manifest);
  if (options.existingPluginCachePath) {
    if (!paths.codexPluginCachePath
      || path.dirname(path.resolve(options.existingPluginCachePath))
        !== path.dirname(path.resolve(paths.codexPluginCachePath))) {
      throw new FrameworkContractError('contract_shape_invalid', 'Recorded package plugin cache does not match its package and plugin identity.', {
        package_id: manifest.package_id,
        plugin_id: manifest.plugin_id,
        codex_plugin_cache_path: options.existingPluginCachePath,
        expected_cache_parent: paths.codexPluginCachePath
          ? path.dirname(paths.codexPluginCachePath)
          : null,
        failure_code: 'agent_package_persisted_path_unsafe',
      });
    }
    paths.codexPluginCachePath = assertSafePersistedPackagePath({
      candidatePath: path.resolve(options.existingPluginCachePath),
      allowedRoots: [path.join(paths.codexHome, 'plugins', 'cache')],
      pathKind: 'agent_package_plugin_cache_generation',
    });
  }
  const codexConfigPreexisting = fs.existsSync(paths.codexConfigPath);
  const pluginSourceInput = manifest.plugin_source_path;
  if (!pluginSourceInput && !manifest.plugin_id) {
    return {
      surface_kind: 'opl_agent_package_physical_codex_surface',
      status: 'not_requested',
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      marketplace_id: null,
      codex_home: paths.codexHome,
      codex_config_path: paths.codexConfigPath,
      codex_config_preexisting: codexConfigPreexisting,
      plugin_source_path: pluginSourceInput,
      plugin_manifest_path: null,
      codex_plugin_cache_path: null,
      marketplace_root: null,
      marketplace_path: null,
      marketplace_plugin_path: null,
      plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
      plugin_payload_manifest_sha256: manifest.plugin_payload_manifest_sha256,
      plugin_payload_cache_path: manifest.plugin_payload_cache_path,
      materialized_required_skill_ids: [],
      materialized_required_skill_paths: [],
      removed_paths: [],
      writes_performed: false,
      reload_required: false,
      failure_reason: null,
      note: 'Manifest did not request Codex plugin materialization with codex_surface.plugin_source_path and codex_surface.plugin_ids.',
      profile_config: null,
      profile_migration: noPackageProfileMigration('Package did not request a physical Codex surface.'),
      managed_policy_config: null,
      workflow_policy_migration: noManagedPolicyMigration('Package did not request a physical Codex surface.'),
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }
  if (!pluginSourceInput || !manifest.plugin_id) {
    throw new FrameworkContractError('contract_shape_invalid', 'A Codex package surface requires both plugin identity and a materializable source.', {
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      plugin_source_path: pluginSourceInput,
      plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
      failure_code: 'agent_package_plugin_source_missing',
    });
  }

  const pluginSourcePath = resolveLocalPath(pluginSourceInput);
  const materializationSourcePath = options.reuseExistingPluginCache
    ? paths.codexPluginCachePath!
    : pluginSourcePath;
  if (options.reuseExistingPluginCache) {
    verifyImmutablePluginCache(manifest, materializationSourcePath);
  } else if (manifest.developer_checkout_source) {
    verifiedDeveloperCheckoutPayloadFiles(manifest, options.developerCheckoutPayloadFiles);
  }
  const pluginManifestPath = path.join(materializationSourcePath, '.codex-plugin', 'plugin.json');
  if (!fs.existsSync(pluginManifestPath)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package plugin source must contain .codex-plugin/plugin.json before physical materialization.', {
      package_id: manifest.package_id,
      plugin_id: manifest.plugin_id,
      plugin_source_path: pluginSourcePath,
      plugin_manifest_path: pluginManifestPath,
      failure_code: 'agent_package_plugin_manifest_missing',
    });
  }
  const materializedRequiredSkills = validateMaterializedRequiredSkills(manifest, materializationSourcePath);

  let profileMigration = noPackageProfileMigration('Package profile materialization has not run.');
  let managedPolicyMigration = noManagedPolicyMigration('Managed policy materialization has not run.');
  let removedSupersededPaths: string[] = [];
  let pluginCacheCreated = false;
  try {
    if (!dryRun && !options.reuseExistingPluginCache) {
      pluginCacheCreated = materializeImmutablePluginCache({
        manifest,
        sourcePath: pluginSourcePath,
        targetPath: paths.codexPluginCachePath!,
        developerCheckoutPayloadFiles: options.developerCheckoutPayloadFiles,
      });
    }
    const materializedSourceRoot = dryRun ? materializationSourcePath : paths.codexPluginCachePath!;
    if (!options.skipManagedSurfaces) {
      managedPolicyMigration = materializeManagedPolicySurface({
        manifest,
        sourceRoot: materializedSourceRoot,
        dryRun,
        keepMigrationIds: options.keepMigrationIds,
        companionNetworkAccess: options.companionNetworkAccess,
      });
    }
    if (!dryRun) {
      materializeLocalCodexPluginMarketplace({
        marketplace_id: paths.marketplaceId,
        plugin_id: manifest.plugin_id,
        display_name: manifest.display_name,
        category: 'Productivity',
      }, paths.codexPluginCachePath!, paths.marketplaceRoot);
      registerLocalCodexPlugin(paths.codexConfigPath, {
        marketplace_id: paths.marketplaceId,
        plugin_id: manifest.plugin_id,
      }, paths.marketplaceRoot, (text) => removeSupersededOplFamilyCodexConfigTables(
        text,
        manifest.package_id,
        manifest.plugin_id!,
      ));
    }
    if (!options.skipManagedSurfaces) {
      profileMigration = materializePackageProfile({
        manifest,
        sourceRoot: materializedSourceRoot,
        codexHome: paths.codexHome,
        dryRun,
      });
    }
    removedSupersededPaths = removeSupersededOplFamilyCodexPluginPaths(
      manifest.package_id,
      manifest.plugin_id,
      path.dirname(paths.codexHome),
      dryRun,
    );
  } catch (error) {
    if (!dryRun) {
      rollbackPackageProfileMigration(profileMigration);
      unregisterLocalCodexPlugin(paths.codexConfigPath, paths.marketplaceId, manifest.plugin_id);
      removeCreatedEmptyCodexConfig(paths.codexConfigPath, codexConfigPreexisting);
      fs.rmSync(paths.marketplaceRoot, { recursive: true, force: true });
      if (pluginCacheCreated) {
        makeGenerationTreeWritable(paths.codexPluginCachePath!);
        fs.rmSync(paths.codexPluginCachePath!, { recursive: true, force: true });
      }
      rollbackManagedPolicyMigration(managedPolicyMigration);
    }
    throw error;
  }

  return {
    surface_kind: 'opl_agent_package_physical_codex_surface',
    status: dryRun ? 'validated_no_write' : 'materialized',
    package_id: manifest.package_id,
    plugin_id: manifest.plugin_id,
    marketplace_id: paths.marketplaceId,
    codex_home: paths.codexHome,
    codex_config_path: paths.codexConfigPath,
    codex_config_preexisting: codexConfigPreexisting,
    plugin_source_path: pluginSourcePath,
    plugin_manifest_path: dryRun ? pluginManifestPath : path.join(paths.codexPluginCachePath!, '.codex-plugin', 'plugin.json'),
    codex_plugin_cache_path: paths.codexPluginCachePath,
    marketplace_root: paths.marketplaceRoot,
    marketplace_path: paths.marketplacePath,
    marketplace_plugin_path: paths.marketplacePluginPath,
    plugin_payload_manifest_url: manifest.plugin_payload_manifest_url,
    plugin_payload_manifest_sha256: manifest.plugin_payload_manifest_sha256,
    plugin_payload_cache_path: manifest.plugin_payload_cache_path,
    materialized_required_skill_ids: materializedRequiredSkills.map((entry) => entry.skillId),
    materialized_required_skill_paths: materializedRequiredSkills.map((entry) =>
      dryRun ? entry.skillPath : path.join(paths.codexPluginCachePath!, 'skills', entry.skillId, 'SKILL.md')
    ),
    removed_paths: removedSupersededPaths,
    writes_performed: !dryRun,
    reload_required: !dryRun,
    failure_reason: null,
    note: null,
    profile_config: manifest.profile_surface,
    profile_migration: profileMigration,
    managed_policy_config: manifest.managed_policy_surface,
    workflow_policy_migration: managedPolicyMigration,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

export function removePhysicalCodexSurface(
  surface: AgentPackagePhysicalSurface | undefined,
  dryRun: boolean,
  packageId?: string,
  options: { retainPayloadSource?: boolean; retainPluginCache?: boolean } = {},
): AgentPackagePhysicalSurface {
  const codexHome = resolveCodexHome();
  const expectedCodexConfigPath = resolveCodexConfigPath(codexHome);
  const codexConfigPath = surface?.codex_config_path ?? expectedCodexConfigPath;
  if (path.resolve(codexConfigPath) !== path.resolve(expectedCodexConfigPath)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Persisted package Codex config path does not match the active Codex home.', {
      codex_config_path: codexConfigPath,
      expected_codex_config_path: expectedCodexConfigPath,
      failure_code: 'agent_package_persisted_path_unsafe',
    });
  }
  const stateDir = resolveOplStatePaths().state_dir;
  const removals = [
    surface?.marketplace_root ? {
      path: surface.marketplace_root,
      root: path.join(stateDir, 'codex-plugin-marketplaces'),
      kind: 'physical_surface.marketplace_root',
    } : null,
    !options.retainPluginCache && surface?.codex_plugin_cache_path ? {
      path: surface.codex_plugin_cache_path,
      root: path.join(codexHome, 'plugins', 'cache'),
      kind: 'physical_surface.codex_plugin_cache_path',
    } : null,
    !options.retainPayloadSource && surface?.plugin_payload_cache_path ? {
      path: surface.plugin_payload_cache_path,
      root: path.join(stateDir, 'agent-package-payloads'),
      kind: 'physical_surface.plugin_payload_cache_path',
    } : null,
  ].flatMap((value) => value ? [value] : []);
  const safeRemovals = removals.map((entry) => ({
    ...entry,
    path: assertSafePersistedPackagePath({
      candidatePath: entry.path,
      allowedRoots: [entry.root],
      pathKind: entry.kind,
    }),
  }));
  const removedPaths = safeRemovals.map((entry) => entry.path);

  if (!dryRun) {
    unregisterLocalCodexPlugin(codexConfigPath, surface?.marketplace_id ?? null, surface?.plugin_id ?? null);
    removeCreatedEmptyCodexConfig(codexConfigPath, surface?.codex_config_preexisting ?? true);
    for (const removal of safeRemovals) {
      makeGenerationTreeWritable(removal.path);
      removeSafePersistedPackagePath({
        candidatePath: removal.path,
        allowedRoots: [removal.root],
        pathKind: removal.kind,
        recursive: true,
      });
    }
  }

  return {
    surface_kind: 'opl_agent_package_physical_codex_surface',
    status: dryRun ? 'validated_no_write' : 'removed',
    package_id: surface?.package_id ?? packageId ?? '',
    plugin_id: surface?.plugin_id ?? null,
    marketplace_id: surface?.marketplace_id ?? null,
    codex_home: surface?.codex_home ?? codexHome,
    codex_config_path: codexConfigPath,
    codex_config_preexisting: surface?.codex_config_preexisting ?? true,
    plugin_source_path: surface?.plugin_source_path ?? null,
    plugin_manifest_path: surface?.plugin_manifest_path ?? null,
    codex_plugin_cache_path: surface?.codex_plugin_cache_path ?? null,
    marketplace_root: surface?.marketplace_root ?? null,
    marketplace_path: surface?.marketplace_path ?? null,
    marketplace_plugin_path: surface?.marketplace_plugin_path ?? null,
    plugin_payload_manifest_url: surface?.plugin_payload_manifest_url ?? null,
    plugin_payload_manifest_sha256: surface?.plugin_payload_manifest_sha256 ?? null,
    plugin_payload_cache_path: surface?.plugin_payload_cache_path ?? null,
    materialized_required_skill_ids: surface?.materialized_required_skill_ids ?? [],
    materialized_required_skill_paths: surface?.materialized_required_skill_paths ?? [],
    removed_paths: removedPaths,
    writes_performed: !dryRun,
    reload_required: !dryRun && removedPaths.length > 0,
    failure_reason: null,
    note: surface ? null : 'Installed package lock did not contain a physical Codex surface.',
    profile_config: surface?.profile_config ?? null,
    profile_migration: retainedPackageProfile(surface?.profile_migration),
    managed_policy_config: surface?.managed_policy_config ?? null,
    workflow_policy_migration: surface?.workflow_policy_migration
      ?? noManagedPolicyMigration('Installed package did not request a managed policy surface.'),
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}

function payloadSourceRefs(index: AgentPackageLockIndex) {
  return new Set([
    ...index.packages,
    ...(index.last_known_good_transactions ?? []).flatMap((entry) => entry.package_locks),
  ].flatMap((lock) => lock.physical_surface?.plugin_payload_cache_path
    ? [lock.physical_surface.plugin_payload_cache_path]
    : []));
}

function developerPluginCacheRefs(index: AgentPackageLockIndex) {
  return new Set([
    ...index.packages,
    ...(index.last_known_good_transactions ?? []).flatMap((entry) => entry.package_locks),
  ].flatMap((lock) => lock.source_kind === 'developer_checkout_override'
    && lock.physical_surface?.codex_plugin_cache_path
    ? [lock.physical_surface.codex_plugin_cache_path]
    : []));
}

export function cleanupUnreferencedPackagePayloadSources(
  previous: AgentPackageLockIndex,
  current: AgentPackageLockIndex,
) {
  const retained = payloadSourceRefs(current);
  const payloadRoot = path.resolve(resolveOplStatePaths().state_dir, 'agent-package-payloads');
  for (const payloadPath of payloadSourceRefs(previous)) {
    if (!retained.has(payloadPath)) {
      removeSafePersistedPackagePath({
        candidatePath: payloadPath,
        allowedRoots: [payloadRoot],
        pathKind: 'lock.physical_surface.plugin_payload_cache_path',
        recursive: true,
      });
    }
  }
  const retainedDeveloperCaches = developerPluginCacheRefs(current);
  const cacheRoot = path.resolve(resolveCodexHome(), 'plugins', 'cache');
  for (const cachePath of developerPluginCacheRefs(previous)) {
    if (!retainedDeveloperCaches.has(cachePath)) {
      makeGenerationTreeWritable(cachePath);
      removeSafePersistedPackagePath({
        candidatePath: cachePath,
        allowedRoots: [cacheRoot],
        pathKind: 'lock.physical_surface.codex_plugin_cache_path',
        recursive: true,
      });
    }
  }
}

export function rollbackManagedPolicySurface(surface: AgentPackagePhysicalSurface | undefined) {
  return rollbackManagedPolicyMigration(surface?.workflow_policy_migration);
}

export function rollbackNewPackageProfileSurface(surface: AgentPackagePhysicalSurface | undefined) {
  return rollbackPackageProfileMigration(surface?.profile_migration);
}

export function rematerializePhysicalCodexSurfaceFromLock(
  lock: AgentPackageLock,
  dryRun: boolean,
  options: Omit<PhysicalMaterializationOptions, 'keepMigrationIds'> = {},
): AgentPackagePhysicalSurface {
  if (!lock.physical_surface?.plugin_source_path || !lock.physical_surface.plugin_id) {
    return {
      surface_kind: 'opl_agent_package_physical_codex_surface',
      status: 'not_requested',
      package_id: lock.package_id,
      plugin_id: lock.physical_surface?.plugin_id ?? null,
      marketplace_id: lock.physical_surface?.marketplace_id ?? null,
      codex_home: lock.physical_surface?.codex_home ?? resolveCodexHome(),
      codex_config_path: lock.physical_surface?.codex_config_path ?? resolveCodexConfigPath(),
      codex_config_preexisting: lock.physical_surface?.codex_config_preexisting ?? true,
      plugin_source_path: lock.physical_surface?.plugin_source_path ?? null,
      plugin_manifest_path: lock.physical_surface?.plugin_manifest_path ?? null,
      codex_plugin_cache_path: lock.physical_surface?.codex_plugin_cache_path ?? null,
      marketplace_root: lock.physical_surface?.marketplace_root ?? null,
      marketplace_path: lock.physical_surface?.marketplace_path ?? null,
      marketplace_plugin_path: lock.physical_surface?.marketplace_plugin_path ?? null,
      plugin_payload_manifest_url: lock.physical_surface?.plugin_payload_manifest_url ?? null,
      plugin_payload_manifest_sha256: lock.physical_surface?.plugin_payload_manifest_sha256 ?? null,
      plugin_payload_cache_path: lock.physical_surface?.plugin_payload_cache_path ?? null,
      materialized_required_skill_ids: lock.physical_surface?.materialized_required_skill_ids ?? [],
      materialized_required_skill_paths: lock.physical_surface?.materialized_required_skill_paths ?? [],
      removed_paths: [],
      writes_performed: false,
      reload_required: false,
      failure_reason: null,
      note: 'Installed package lock did not request physical Codex surface repair.',
      profile_config: null,
      profile_migration: noPackageProfileMigration('Installed package did not request a profile surface.'),
      managed_policy_config: null,
      workflow_policy_migration: noManagedPolicyMigration('Installed package did not request a managed policy surface.'),
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }

  const recordedCachePath = lock.physical_surface.codex_plugin_cache_path;
  const developerCache = lock.source_kind === 'developer_checkout_override';
  const reuseExistingPluginCache = Boolean(recordedCachePath && fs.existsSync(recordedCachePath));
  if (developerCache && !reuseExistingPluginCache) {
    throw new FrameworkContractError('contract_shape_invalid', 'Developer checkout rollback requires its retained LKG cache.', {
      package_id: lock.package_id,
      codex_plugin_cache_path: recordedCachePath ?? null,
      failure_code: 'agent_package_developer_checkout_lkg_unavailable',
    });
  }
  const materialized = materializePhysicalCodexSurface({
    package_id: lock.package_id,
    agent_id: lock.agent_id,
    package_role: packageRoleFromInstalledLock(lock),
    display_name: lock.display_name,
    publisher: lock.publisher,
    version: lock.package_version,
    owner_language_version: lock.owner_language_version,
    source: '',
    source_repo: null,
    source_commit: lock.owner_source_commit ?? null,
    carrier_source_commit: lock.owner_source_commit ?? null,
    verified_payload_source_commit: lock.owner_source_commit ?? null,
    codex_surface: {},
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    distribution_payload: null,
    update_channel: '',
    rollback_ref: lock.rollback_ref,
    codex_visible_entry: lock.codex_visible_entry,
    required_skill_ids: lock.bundled_required_skill_ids,
    optional_skill_refs: lock.optional_skill_refs,
    plugin_id: lock.physical_surface.plugin_id,
    plugin_source_path: lock.physical_surface.plugin_source_path,
    plugin_payload_manifest_url: lock.physical_surface.plugin_payload_manifest_url,
    plugin_payload_manifest_sha256: lock.physical_surface.plugin_payload_manifest_sha256,
    plugin_payload_cache_path: lock.physical_surface.plugin_payload_cache_path,
    profile_surface: lock.physical_surface.profile_config,
      managed_policy_surface: lock.physical_surface.managed_policy_config,
      runtime_source_carrier: null,
      managed_update_source: lock.managed_update_source,
    capability_dependencies: lock.capability_dependencies ?? [],
    capability_provider: lock.capability_provider ?? null,
    content_digest: lock.content_digest ?? null,
    content_lock_canonicalization: null,
    content_lock_paths: lock.content_lock_paths ?? [],
    developer_checkout_source: lock.developer_checkout_source ?? null,
  }, dryRun, {
    ...options,
    reuseExistingPluginCache,
    existingPluginCachePath: recordedCachePath ?? undefined,
  });
  return options.skipManagedSurfaces && lock.physical_surface
    ? {
        ...materialized,
        profile_config: lock.physical_surface.profile_config,
        profile_migration: lock.physical_surface.profile_migration,
        managed_policy_config: lock.physical_surface.managed_policy_config,
        workflow_policy_migration: lock.physical_surface.workflow_policy_migration,
      }
    : materialized;
}
