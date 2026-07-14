import canonicalPayloadSchema from '../../../../contracts/opl-framework/package-payload-manifest-v2.schema.json' with { type: 'json' };
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringValue } from '../../../kernel/json-record.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import type { ManagedModulePackageChannelSelection } from '../system-installation/module-package-channel.ts';
import {
  CANONICAL_PACKAGE_CONTENT_LOCK,
  packageContentLockDigest,
} from './payload-content-lock.ts';
import type { AgentPackageManifest, AgentPackagePayloadFile } from './types.ts';

const CANONICAL_SURFACE = 'opl_package_payload_manifest.v2';
const CANONICAL_SCHEMA_REF = 'contracts/opl-framework/package-payload-manifest-v2.schema.json';
const LEGACY_V1_SURFACE = 'opl_package_payload_manifest.v1';
const LEGACY_V1_SCHEMA_REF = 'contracts/opl-framework/package-payload-manifest.schema.json';
const LEGACY_V0_SURFACE = 'opl_agent_package_payload_manifest';
const FIRST_PARTY_SOURCES = new Set(['first_party', 'first_party_owner_projection']);

export type PackagePayloadAdmission = {
  kind: 'canonical_v2' | 'legacy_v1' | 'legacy_v0';
  contentLockDigest: string | null;
  sourceCommit: string | null;
};

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function encodeUrlSegment(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function githubCoordinates(sourceRepo: string) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\.git$/.exec(sourceRepo);
  if (!match) return null;
  return { owner: match[1], repository: match[2] };
}

function sourceTreePath(sourceRoot: string, relativePath: string) {
  return sourceRoot === '.' ? relativePath : `${sourceRoot}/${relativePath}`;
}

function rawSourceUrl(sourceRepo: string, sourceCommit: string, treePath: string) {
  const coordinates = githubCoordinates(sourceRepo);
  if (!coordinates) return null;
  const encodedPath = treePath.split('/').map(encodeUrlSegment).join('/');
  return `https://raw.githubusercontent.com/${coordinates.owner}/${coordinates.repository}/${sourceCommit}/${encodedPath}`;
}

function assertPortablePaths(files: Record<string, unknown>[], payloadManifestUrl: string) {
  const seen = new Map<string, string>();
  const paths = files.map((file) => stringValue(file.path)!);
  for (const candidate of paths) {
    const collisionKey = candidate.normalize('NFKC').toLowerCase();
    const previous = seen.get(collisionKey);
    if (previous !== undefined) {
      fail('Canonical package payload paths must be portable and collision-free.', {
        payload_manifest_url: payloadManifestUrl,
        first_path: previous,
        second_path: candidate,
        failure_code: 'first_party_package_payload_path_collision',
      });
    }
    seen.set(collisionKey, candidate);
  }
  for (const candidate of paths) {
    if (paths.some((other) => other !== candidate && other.startsWith(`${candidate}/`))) {
      fail('Canonical package payload cannot use one file path as another file path prefix.', {
        payload_manifest_url: payloadManifestUrl,
        payload_path: candidate,
        failure_code: 'first_party_package_payload_path_prefix_collision',
      });
    }
  }
}

function assertCarrierSourceAuthority(input: {
  payload: Record<string, unknown>;
  manifest: AgentPackageManifest;
  payloadManifestUrl: string;
  catalogSelection: ManagedModulePackageChannelSelection | null;
}) {
  const payloadCommit = stringValue(input.payload.source_commit);
  const manifestCommit = input.manifest.carrier_source_commit;
  const catalogCommit = input.catalogSelection?.owner_source_commit ?? null;
  const mismatches = [
    payloadCommit !== null && /^[0-9a-f]{40}$/.test(payloadCommit) ? null : 'payload_source_commit',
    manifestCommit !== null && /^[0-9a-f]{40}$/.test(manifestCommit) ? null : 'manifest_carrier_source_commit',
    input.manifest.source_commit === null || input.manifest.source_commit === manifestCommit
      ? null
      : 'manifest_source_commit',
    input.catalogSelection === null || catalogCommit === manifestCommit ? null : 'catalog_owner_source_commit',
    payloadCommit === manifestCommit ? null : 'source_commit',
  ].filter((entry): entry is string => entry !== null);
  if (mismatches.length > 0) {
    fail('Package payload carrier source commit does not match its manifest and catalog authority.', {
      payload_manifest_url: input.payloadManifestUrl,
      package_id: input.manifest.package_id,
      payload_source_commit: payloadCommit,
      manifest_carrier_source_commit: manifestCommit,
      catalog_owner_source_commit: catalogCommit,
      mismatches,
      failure_code: 'first_party_package_payload_identity_mismatch',
    });
  }
  return payloadCommit!;
}

function assertCanonicalIdentity(input: {
  payload: Record<string, unknown>;
  manifest: AgentPackageManifest;
  payloadManifestUrl: string;
  catalogSelection: ManagedModulePackageChannelSelection | null;
}) {
  const payload = input.payload;
  if (!FIRST_PARTY_SOURCES.has(input.manifest.source)) {
    fail('Canonical package payload manifests are reserved for first-party package sources.', {
      payload_manifest_url: input.payloadManifestUrl,
      package_source: input.manifest.source,
      failure_code: 'canonical_package_payload_requires_first_party_source',
    });
  }
  try {
    assertJsonSchemaPayload({
      schemaId: canonicalPayloadSchema.$id,
      schema: canonicalPayloadSchema,
      sourceRef: CANONICAL_SCHEMA_REF,
    }, payload);
  } catch (error) {
    if (!(error instanceof FrameworkContractError)) throw error;
    fail('Canonical first-party package payload failed its repository JSON Schema.', {
      payload_manifest_url: input.payloadManifestUrl,
      schema_ref: CANONICAL_SCHEMA_REF,
      schema_errors: error.details?.errors ?? [],
      failure_code: 'first_party_package_payload_schema_invalid',
    });
  }
  const sourceCommit = assertCarrierSourceAuthority(input);
  const mismatches = [
    payload.package_id === input.manifest.package_id ? null : 'package_id',
    payload.plugin_id === input.manifest.plugin_id ? null : 'plugin_id',
    payload.package_version === input.manifest.version ? null : 'package_version',
    input.manifest.source_repo === null || payload.source_repo === input.manifest.source_repo ? null : 'source_repo',
    input.catalogSelection === null || input.catalogSelection.package_id === input.manifest.package_id ? null : 'catalog_package_id',
    input.catalogSelection === null || input.catalogSelection.package_version === input.manifest.version ? null : 'catalog_package_version',
  ].filter((entry): entry is string => entry !== null);
  if (mismatches.length > 0) {
    fail('Canonical first-party package payload identity does not match its package authority.', {
      payload_manifest_url: input.payloadManifestUrl,
      package_id: input.manifest.package_id,
      plugin_id: input.manifest.plugin_id,
      package_version: input.manifest.version,
      expected_source_commit: sourceCommit,
      mismatches,
      failure_code: 'first_party_package_payload_identity_mismatch',
    });
  }

  const files = recordList(payload.files);
  assertPortablePaths(files, input.payloadManifestUrl);
  const packageSource = isRecord(payload.package_source) ? payload.package_source : null;
  const artifactBacked = files.every((file) => stringValue(file.source_path) !== null);
  const remoteBacked = files.every((file) => stringValue(file.source_url) !== null);
  if (artifactBacked === remoteBacked || artifactBacked !== (packageSource !== null)) {
    fail('Canonical package payload files must use one declared transport consistently.', {
      payload_manifest_url: input.payloadManifestUrl,
      artifact_backed: artifactBacked,
      remote_backed: remoteBacked,
      package_source_declared: packageSource !== null,
      failure_code: 'first_party_package_payload_transport_mismatch',
    });
  }
  const sourceRepo = stringValue(payload.source_repo)!;
  const payloadSourceCommit = stringValue(payload.source_commit)!;
  const sourceRoot = stringValue(payload.source_root)!;
  for (const file of files) {
    const relativePath = stringValue(file.path)!;
    const treePath = sourceTreePath(sourceRoot, relativePath);
    if (remoteBacked && file.source_url !== rawSourceUrl(sourceRepo, payloadSourceCommit, treePath)) {
      fail('Canonical package payload source_url does not match its source identity.', {
        payload_manifest_url: input.payloadManifestUrl,
        payload_path: relativePath,
        failure_code: 'first_party_package_payload_source_identity_mismatch',
      });
    }
    if (artifactBacked && (
      file.source_path !== treePath
      || file.source_artifact_ref !== packageSource?.artifact_ref
      || file.source_artifact_ref !== input.catalogSelection?.source_artifact_ref
    )) {
      fail('Canonical artifact-backed payload file does not match its source identity.', {
        payload_manifest_url: input.payloadManifestUrl,
        payload_path: relativePath,
        failure_code: 'first_party_package_payload_source_identity_mismatch',
      });
    }
  }
  return sourceCommit;
}

function assertLegacyBoundary(payload: Record<string, unknown>, payloadManifestUrl: string) {
  const files = recordList(payload.files);
  if (payload.plugin_id !== undefined
    || payload.content_lock !== undefined
    || files.some((file) => file.mode !== undefined)) {
    fail('Historical payload envelopes cannot carry canonical v2 identity or mode fields.', {
      payload_manifest_url: payloadManifestUrl,
      failure_code: 'legacy_package_payload_boundary_invalid',
    });
  }
}

export function admitPackagePayloadManifest(input: {
  payload: Record<string, unknown>;
  manifest: AgentPackageManifest;
  payloadManifestUrl: string;
  catalogSelection: ManagedModulePackageChannelSelection | null;
}): PackagePayloadAdmission {
  const surfaceKind = stringValue(input.payload.surface_kind);
  if (surfaceKind === CANONICAL_SURFACE) {
    const sourceCommit = assertCanonicalIdentity(input);
    return {
      kind: 'canonical_v2',
      contentLockDigest: stringValue((input.payload.content_lock as Record<string, unknown>).digest),
      sourceCommit,
    };
  }
  if (surfaceKind === LEGACY_V1_SURFACE) {
    if (input.payload.schema_ref !== LEGACY_V1_SCHEMA_REF) {
      fail('Legacy v1 package payload must retain its exact historical schema_ref.', {
        payload_manifest_url: input.payloadManifestUrl,
        failure_code: 'legacy_package_payload_boundary_invalid',
      });
    }
    assertLegacyBoundary(input.payload, input.payloadManifestUrl);
    return {
      kind: 'legacy_v1',
      contentLockDigest: null,
      sourceCommit: input.catalogSelection ? assertCarrierSourceAuthority(input) : null,
    };
  }
  if (surfaceKind === LEGACY_V0_SURFACE) {
    if (input.payload.schema_ref !== undefined) {
      fail('Legacy unversioned package payload must not claim a canonical schema_ref.', {
        payload_manifest_url: input.payloadManifestUrl,
        failure_code: 'legacy_package_payload_boundary_invalid',
      });
    }
    assertLegacyBoundary(input.payload, input.payloadManifestUrl);
    return {
      kind: 'legacy_v0',
      contentLockDigest: null,
      sourceCommit: input.catalogSelection ? assertCarrierSourceAuthority(input) : null,
    };
  }
  fail('Agent package payload manifest uses an unsupported envelope boundary.', {
    payload_manifest_url: input.payloadManifestUrl,
    surface_kind: surfaceKind,
    supported_surface_kinds: [LEGACY_V0_SURFACE, LEGACY_V1_SURFACE, CANONICAL_SURFACE],
    failure_code: 'agent_package_payload_envelope_unsupported',
  });
}

export function payloadFileMode(admission: PackagePayloadAdmission, entry: Record<string, unknown>) {
  if (admission.kind !== 'canonical_v2') return '100644' as const;
  return entry.mode as '100644' | '100755';
}

export function verifyCanonicalPayloadContentLock(
  admission: PackagePayloadAdmission,
  files: AgentPackagePayloadFile[],
  payloadManifestUrl: string,
) {
  if (admission.kind !== 'canonical_v2' || files.some((file) => !file.digestVerified)) return;
  const actual = packageContentLockDigest(
    CANONICAL_PACKAGE_CONTENT_LOCK,
    files.map((file) => ({ path: file.relativePath, content: file.content })),
  );
  if (actual !== admission.contentLockDigest) {
    fail('Canonical package payload content_lock does not match materialized file bytes.', {
      payload_manifest_url: payloadManifestUrl,
      expected_content_lock: admission.contentLockDigest,
      actual_content_lock: actual,
      failure_code: 'first_party_package_payload_content_lock_mismatch',
    });
  }
}
