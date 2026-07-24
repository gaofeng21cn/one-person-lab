import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import bundledCatalogSchema from '../../../../contracts/opl-framework/bundled-full-runtime-package-catalog.schema.json' with { type: 'json' };
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import type {
  ManagedCatalogVersion,
  ManagedPackageCatalog,
} from './capability-reconciliation.ts';

const CATALOG_SCHEMA_REF = 'contracts/opl-framework/bundled-full-runtime-package-catalog.schema.json';
const defaultCatalogPath = fileURLToPath(
  new URL('../../../../contracts/opl-framework/bundled-full-runtime-package-catalog.json', import.meta.url),
);
const PACKAGE_ROOT_ENV = new Map<string, string>([
  ['mas', 'OPL_MODULE_PATH_MEDAUTOSCIENCE'],
  ['mag', 'OPL_MODULE_PATH_MEDAUTOGRANT'],
  ['rca', 'OPL_MODULE_PATH_REDCUBE'],
  ['oma', 'OPL_MODULE_PATH_OPLMETAAGENT'],
  ['obf', 'OPL_MODULE_PATH_OPLBOOKFORGE'],
  ['mas-scholar-skills', 'OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS'],
  ['opl-flow', 'OPL_FLOW_REPO_ROOT'],
]);

export type BundledFullRuntimeCatalogEntry = {
  packageId: string;
  packageRole: 'standard_agent' | 'framework_capability_package' | 'workflow_profile';
  packageVersion: string;
  ownerSourceCommit: string;
  manifestUrl: string;
  manifestJson: string;
  manifestSha256: string;
  payloadManifestUrl: string;
  payloadManifestJson: string;
  payloadManifestSha256: string;
  runtimeModuleRelativePath: string;
  dependencyPackageIds: string[];
};

export type BundledFullRuntimePackageCatalog = {
  catalog: ManagedPackageCatalog;
  entries: Map<string, BundledFullRuntimeCatalogEntry>;
  catalogRef: string;
  catalogSha256: string;
};

function sha256(value: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'agent_package_bundled_full_runtime_catalog_invalid',
  });
}

function selectedCatalogPath() {
  const testOverride = process.env.OPL_TEST_BUNDLED_FULL_RUNTIME_PACKAGE_CATALOG?.trim();
  if (!testOverride) return defaultCatalogPath;
  if (process.env.OPL_TEST_RUNTIME_SOURCE_FAULTS_ENABLED !== '1') {
    fail('Bundled Full runtime package catalog overrides are restricted to explicit test faults.', {
      catalog_ref: testOverride,
      failure_code: 'agent_package_bundled_full_runtime_catalog_test_override_forbidden',
    });
  }
  return path.resolve(testOverride);
}

function resolveCatalogRef(catalogPath: string, ref: string, field: string) {
  const catalogRoot = path.dirname(catalogPath);
  const resolved = path.resolve(catalogRoot, ref);
  if (!resolved.startsWith(`${catalogRoot}${path.sep}`)) {
    fail('Bundled Full runtime package catalog path escapes the Framework contracts root.', {
      catalog_ref: pathToFileURL(catalogPath).href,
      field,
      value: ref,
    });
  }
  return resolved;
}

function manifestCapabilityAbi(manifest: Record<string, unknown>) {
  const capabilityAbi = isRecord(manifest.capability_abi) ? manifest.capability_abi : null;
  return stringValue(capabilityAbi?.id);
}

function manifestDependencyPackageIds(manifest: Record<string, unknown>) {
  return Array.isArray(manifest.capability_dependencies)
    ? manifest.capability_dependencies.flatMap((candidate) => (
        isRecord(candidate)
          && candidate.required === true
          && candidate.dependency_kind !== 'optional_enhancement'
          && stringValue(candidate.package_id)
          ? [stringValue(candidate.package_id)!]
          : []
      ))
    : [];
}

function catalogVersion(entry: BundledFullRuntimeCatalogEntry): ManagedCatalogVersion {
  const manifest = parseJsonText(entry.manifestJson) as Record<string, unknown>;
  return {
    package_version: entry.packageVersion,
    capability_abi: manifestCapabilityAbi(manifest),
    manifest_url: entry.manifestUrl,
    manifest_sha256: entry.manifestSha256,
    manifest_json: entry.manifestJson,
    payload_manifest_json: entry.payloadManifestJson,
    payload_manifest_sha256: entry.payloadManifestSha256,
    content_digest: stringValue(manifest.content_digest),
    payload_digest: entry.payloadManifestSha256,
    source_artifact_ref: null,
    artifact_digest: null,
    artifact_status: null,
    package_content_digest: null,
    owner_source_commit: entry.ownerSourceCommit,
    dependency_package_ids: entry.dependencyPackageIds,
    selection_status: 'selected_for_release_set',
  };
}

export function readBundledFullRuntimePackageCatalog(): BundledFullRuntimePackageCatalog {
  const catalogPath = selectedCatalogPath();
  const catalogJson = fs.readFileSync(catalogPath, 'utf8');
  const payload = parseJsonText(catalogJson);
  assertJsonSchemaPayload({
    schemaId: bundledCatalogSchema.$id,
    schema: bundledCatalogSchema,
    sourceRef: CATALOG_SCHEMA_REF,
  }, payload);
  if (!isRecord(payload) || !isRecord(payload.packages)) {
    fail('Bundled Full runtime package catalog has no package map.', {
      catalog_ref: pathToFileURL(catalogPath).href,
    });
  }

  const entries = new Map<string, BundledFullRuntimeCatalogEntry>();
  const catalog = new Map() as ManagedPackageCatalog;
  for (const [packageId, candidate] of Object.entries(payload.packages)) {
    if (!isRecord(candidate)) {
      fail('Bundled Full runtime package catalog entries must be objects.', { package_id: packageId });
    }
    const manifestPath = resolveCatalogRef(
      catalogPath,
      stringValue(candidate.manifest_ref)!,
      `${packageId}.manifest_ref`,
    );
    const payloadManifestPath = resolveCatalogRef(
      catalogPath,
      stringValue(candidate.payload_manifest_ref)!,
      `${packageId}.payload_manifest_ref`,
    );
    const manifestJson = fs.readFileSync(manifestPath, 'utf8');
    const payloadManifestJson = fs.readFileSync(payloadManifestPath, 'utf8');
    const manifest = parseJsonText(manifestJson);
    const payloadManifest = parseJsonText(payloadManifestJson);
    if (!isRecord(manifest) || !isRecord(payloadManifest)) {
      fail('Bundled Full runtime package manifest or payload is not an object.', { package_id: packageId });
    }

    const packageVersion = stringValue(candidate.package_version)!;
    const ownerSourceCommit = stringValue(candidate.owner_source_commit)!;
    const manifestDigest = sha256(manifestJson);
    const payloadDigest = sha256(payloadManifestJson);
    const codexSurface = isRecord(manifest.codex_surface) ? manifest.codex_surface : null;
    const manifestPayloadRef = stringValue(codexSurface?.plugin_payload_manifest_url);
    const selectedPayloadPath = manifestPayloadRef
      ? path.resolve(path.dirname(manifestPath), manifestPayloadRef)
      : null;
    const mismatches = [
      packageId === stringValue(candidate.package_id) ? null : 'catalog_package_id',
      packageId === stringValue(manifest.package_id) ? null : 'manifest_package_id',
      packageId === stringValue(payloadManifest.package_id) ? null : 'payload_package_id',
      packageVersion === stringValue(manifest.version) ? null : 'manifest_package_version',
      packageVersion === stringValue(payloadManifest.package_version) ? null : 'payload_package_version',
      ownerSourceCommit === stringValue(codexSurface?.carrier_source_commit) ? null : 'manifest_carrier_source_commit',
      ownerSourceCommit === stringValue(payloadManifest.source_commit) ? null : 'payload_source_commit',
      manifestDigest === stringValue(candidate.manifest_sha256) ? null : 'manifest_sha256',
      payloadDigest === stringValue(candidate.payload_manifest_sha256) ? null : 'payload_manifest_sha256',
      selectedPayloadPath === payloadManifestPath ? null : 'manifest_payload_ref',
    ].filter((entry): entry is string => entry !== null);
    if (mismatches.length > 0) {
      fail('Bundled Full runtime package catalog does not match its manifest and payload authority.', {
        package_id: packageId,
        catalog_owner_source_commit: ownerSourceCommit,
        manifest_carrier_source_commit: stringValue(codexSurface?.carrier_source_commit),
        payload_source_commit: stringValue(payloadManifest.source_commit),
        mismatches,
      });
    }

    const entry: BundledFullRuntimeCatalogEntry = {
      packageId,
      packageRole: candidate.package_role as BundledFullRuntimeCatalogEntry['packageRole'],
      packageVersion,
      ownerSourceCommit,
      manifestUrl: pathToFileURL(manifestPath).href,
      manifestJson,
      manifestSha256: manifestDigest,
      payloadManifestUrl: pathToFileURL(payloadManifestPath).href,
      payloadManifestJson,
      payloadManifestSha256: payloadDigest,
      runtimeModuleRelativePath: stringValue(candidate.runtime_module_relative_path)!,
      dependencyPackageIds: manifestDependencyPackageIds(manifest),
    };
    entries.set(packageId, entry);
    catalog.set(packageId, {
      package_id: packageId,
      package_role: entry.packageRole,
      selected_version: packageVersion,
      versions: [catalogVersion(entry)],
    });
  }

  return {
    catalog,
    entries,
    catalogRef: pathToFileURL(catalogPath).href,
    catalogSha256: sha256(catalogJson),
  };
}

export function assertBundledFullRuntimePackageRoots(input: {
  catalog: BundledFullRuntimePackageCatalog;
  rootPackageId: string;
  packageRoots: Record<string, string>;
}) {
  const closure = bundledFullRuntimePackageClosure(input.catalog, input.rootPackageId);
  for (const packageId of closure) {
    const entry = input.catalog.entries.get(packageId)!;
    const packageRoot = stringValue(input.packageRoots[packageId]);
    if (!packageRoot) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Bundled Full runtime package dependency is absent from the packaged source roots.',
        {
          root_package_id: input.rootPackageId,
          package_id: packageId,
          expected_runtime_module_relative_path: entry.runtimeModuleRelativePath,
          failure_code: 'agent_package_bundled_dependency_root_missing',
        },
      );
    }
  }
  return closure;
}

function bundledFullRuntimePackageClosure(
  catalog: BundledFullRuntimePackageCatalog,
  rootPackageId: string,
) {
  const closure: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (packageId: string) => {
    if (visited.has(packageId)) return;
    if (visiting.has(packageId)) {
      fail('Bundled Full runtime package catalog contains a dependency cycle.', {
        root_package_id: rootPackageId,
        package_id: packageId,
      });
    }
    const entry = catalog.entries.get(packageId);
    if (!entry) {
      fail('Bundled Full runtime package catalog dependency is missing.', {
        root_package_id: rootPackageId,
        package_id: packageId,
      });
    }
    visiting.add(packageId);
    for (const dependencyPackageId of entry.dependencyPackageIds) visit(dependencyPackageId);
    visiting.delete(packageId);
    visited.add(packageId);
    closure.push(packageId);
  };
  visit(rootPackageId);
  return closure;
}

export function resolveBundledFullRuntimePackageClosureRoots(input: {
  catalog: BundledFullRuntimePackageCatalog;
  rootPackageId: string;
  env?: NodeJS.ProcessEnv;
}) {
  const env = input.env ?? process.env;
  const closure = bundledFullRuntimePackageClosure(input.catalog, input.rootPackageId);
  const packageRoots: Record<string, string> = {};
  for (const packageId of closure) {
    const entry = input.catalog.entries.get(packageId)!;
    const packageRoot = resolveBundledFullRuntimePackageRoot(entry, env)
      ?? resolveInstalledRuntimePackageRoot(entry, env);
    if (!packageRoot) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Bundled Full runtime Package update requires the selected Package and its required dependencies only.',
        {
          root_package_id: input.rootPackageId,
          package_id: packageId,
          expected_runtime_module_relative_path: entry.runtimeModuleRelativePath,
          failure_code: 'agent_package_bundled_dependency_root_missing',
        },
      );
    }
    packageRoots[packageId] = packageRoot;
  }
  return { closure, packageRoots };
}

function resolveInstalledRuntimePackageRoot(
  entry: BundledFullRuntimeCatalogEntry,
  env: NodeJS.ProcessEnv,
) {
  const homeDir = stringValue(env.HOME) ?? os.homedir();
  const stateDir = stringValue(env.OPL_STATE_DIR);
  const dataDir = stringValue(env.OPL_DATA_DIR) ?? stringValue(env.AIONUI_DATA_DIR);
  const runtimeRoots = [
    stringValue(env.OPL_RUNTIME_ROOT),
    stateDir ? path.join(path.dirname(path.resolve(stateDir)), 'runtime') : null,
    dataDir ? path.join(path.resolve(dataDir), 'opl', 'runtime') : null,
    path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime'),
  ];
  return runtimeRoots
    .map((runtimeRoot) => {
      if (!runtimeRoot) return null;
      const currentRoot = path.resolve(runtimeRoot, 'current');
      const candidate = path.resolve(currentRoot, entry.runtimeModuleRelativePath);
      const relative = path.relative(currentRoot, candidate);
      if (relative === ''
        || relative === '..'
        || relative.startsWith(`..${path.sep}`)
        || path.isAbsolute(relative)) return null;
      try {
        if (!fs.lstatSync(candidate).isDirectory()) return null;
        const realCurrentRoot = fs.realpathSync.native(currentRoot);
        const realCandidate = fs.realpathSync.native(candidate);
        const realRelative = path.relative(realCurrentRoot, realCandidate);
        return realRelative !== ''
          && realRelative !== '..'
          && !realRelative.startsWith(`..${path.sep}`)
          && !path.isAbsolute(realRelative)
          ? candidate
          : null;
      } catch {
        return null;
      }
    })
    .find((candidate): candidate is string => candidate !== null) ?? null;
}

export function resolveBundledFullRuntimePackageRoot(
  entry: BundledFullRuntimeCatalogEntry,
  env: NodeJS.ProcessEnv = process.env,
) {
  const explicitRoot = stringValue(env[PACKAGE_ROOT_ENV.get(entry.packageId) ?? '']);
  const fullRuntimeHome = stringValue(env.OPL_FULL_RUNTIME_HOME);
  const candidates = [
    explicitRoot ? path.resolve(explicitRoot) : null,
    fullRuntimeHome
      ? path.resolve(fullRuntimeHome, entry.runtimeModuleRelativePath)
      : null,
  ];
  return candidates.find((candidate) =>
    candidate
    && fs.existsSync(candidate)
    && fs.statSync(candidate).isDirectory()) ?? null;
}
