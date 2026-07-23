import repositoryIndexSchema from '../../../../contracts/opl-framework/package-repository-index.schema.json' with { type: 'json' };

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { stringValue } from '../../../kernel/json-record.ts';
import { assertJsonSchemaPayload } from '../../../kernel/schema-registry.ts';
import { versionSatisfiesRequirement } from './dependency-closure.ts';

const REPOSITORY_INDEX_SCHEMA_REF = 'contracts/opl-framework/package-repository-index.schema.json';

export type PackageRepositorySourceFormat =
  | 'package_repository_index_v1'
  | 'release_set_catalog_v1'
  | 'bundled_full_catalog_v1';

export type PackageCompatibilityDeclaration = 'declared' | 'legacy_unspecified';

export type PackageRepositoryVersionCandidate = {
  package_version: string;
  capability_abi: string | null;
  manifest_url: string;
  manifest_sha256: string;
  manifest_json: string | null;
  payload_manifest_json: string | null;
  payload_manifest_sha256: string | null;
  content_digest: string | null;
  payload_digest: string | null;
  source_artifact_ref: string | null;
  artifact_digest: string | null;
  artifact_status: string | null;
  package_content_digest: string | null;
  owner_source_commit: string | null;
  dependency_package_ids: string[];
  selection_status: 'selected_for_release_set' | 'retained_history';
  compatibility_declaration?: PackageCompatibilityDeclaration;
  base_abi_range?: string | null;
  publication_stability?: 'stable' | 'prerelease' | 'retired';
  publication_immutable?: boolean;
  package_owner?: string | null;
  source_adapter_id?: string | null;
  source_format?: PackageRepositorySourceFormat;
};

export type PackageRepositoryEntry = {
  package_id: string;
  package_role: 'standard_agent' | 'framework_capability_package' | 'workflow_profile';
  selected_version: string | null;
  versions: PackageRepositoryVersionCandidate[];
};

export type PackageRepositoryCatalog = Map<string, PackageRepositoryEntry>;

export type PackageRepositoryResolutionReceipt = {
  surface_kind: 'opl_package_repository_resolution.v1';
  resolver_version: 'package-compatibility-resolver.v1';
  package_id: string;
  resolution_kind: 'root_package' | 'capability_provider';
  source_format: PackageRepositorySourceFormat;
  selection_policy: 'highest_compatible_stable';
  currentness_owner: 'framework_compatibility_resolver';
  source_adapter_role: 'candidate_transport_only';
  installed_truth_owner: 'exact_installed_lock';
  runtime_truth_owner: 'immutable_materialized_bytes';
  exact_lock_required: true;
  selected_version: string;
  selected_manifest_sha256: string;
  selected_source_adapter_id: string | null;
  compatibility: {
    status: 'declared_compatible' | 'declared_not_checked' | 'legacy_release_set_v1_bridge';
    declaration_status: PackageCompatibilityDeclaration;
    current_base_abi: string | null;
    base_abi_range: string | null;
    capability_abi: string | null;
  };
  release_set_hint: {
    selected_for_release_set: boolean;
    currentness_authority: false;
  };
};

type ResolutionInput = {
  packageId: string;
  resolutionKind: 'root_package' | 'capability_provider';
  currentBaseAbi?: string | null;
  versionRequirement?: string | null;
  capabilityAbi?: string | null;
};

function numericIdentifiers(value: string) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])] as const,
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
  }
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    if (a === b) continue;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) return Number(a) - Number(b);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a.localeCompare(b, 'en');
  }
  return 0;
}

export function comparePackageRepositoryVersions(left: string, right: string) {
  const a = numericIdentifiers(left);
  const b = numericIdentifiers(right);
  if (!a || !b) return left.localeCompare(right, 'en', { numeric: true });
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function packageRepositorySourceFormat(payload: unknown): PackageRepositorySourceFormat {
  if (isRecord(payload) && payload.surface_kind === 'opl_package_repository_index.v1') {
    return 'package_repository_index_v1';
  }
  return 'release_set_catalog_v1';
}

export function repositoryPackageCatalog(payload: unknown) {
  if (!isRecord(payload)) return null;
  if (payload.surface_kind === 'opl_package_repository_index.v1') {
    assertJsonSchemaPayload({
      schemaId: repositoryIndexSchema.$id,
      schema: repositoryIndexSchema,
      sourceRef: REPOSITORY_INDEX_SCHEMA_REF,
    }, payload);
    return isRecord(payload.packages) ? payload.packages : null;
  }
  if (payload.surface_kind !== undefined && payload.surface_kind !== 'opl_package_catalog.v1') {
    return null;
  }
  if (!isRecord(payload.packages)) return null;
  return isRecord(payload.packages.package_catalog)
    ? payload.packages.package_catalog
    : payload.packages;
}

export function repositoryVersionMetadata(
  value: Record<string, unknown>,
  sourceFormat: PackageRepositorySourceFormat,
) {
  const compatibility = isRecord(value.compatibility) ? value.compatibility : {};
  const publication = isRecord(value.publication) ? value.publication : {};
  const baseAbiRange = stringValue(compatibility.base_abi_range ?? value.base_abi_range);
  const declaredCompatibility = compatibility.declaration_status === 'declared'
    || baseAbiRange !== null;
  return {
    compatibility_declaration: declaredCompatibility
      ? 'declared' as const
      : 'legacy_unspecified' as const,
    base_abi_range: declaredCompatibility ? baseAbiRange : null,
    publication_stability: publication.stability === 'prerelease'
      ? 'prerelease' as const
      : publication.stability === 'retired'
        ? 'retired' as const
        : 'stable' as const,
    publication_immutable: sourceFormat === 'package_repository_index_v1'
      ? publication.immutable === true
      : value.artifact_status === undefined
        || value.artifact_status === null
        || value.artifact_status === 'published_immutable',
    package_owner: stringValue(publication.owner ?? value.package_owner),
    source_adapter_id: stringValue(publication.source_adapter_id ?? value.source_adapter_id)
      ?? (sourceFormat === 'release_set_catalog_v1' ? 'release_set_v1_bridge' : null),
    source_format: sourceFormat,
  };
}

function candidateCompatibility(
  candidate: PackageRepositoryVersionCandidate,
  input: ResolutionInput,
) {
  const declaration = candidate.compatibility_declaration ?? 'legacy_unspecified';
  const baseAbiRange = candidate.base_abi_range ?? null;
  if (candidate.publication_stability && candidate.publication_stability !== 'stable') return false;
  if (candidate.publication_immutable === false) return false;
  if (input.versionRequirement
    && !versionSatisfiesRequirement(candidate.package_version, input.versionRequirement)) {
    return false;
  }
  if (input.capabilityAbi && candidate.capability_abi !== input.capabilityAbi) return false;
  if (declaration === 'declared' && input.currentBaseAbi
    && (!baseAbiRange || !versionSatisfiesRequirement(input.currentBaseAbi, baseAbiRange))) {
    return false;
  }
  return true;
}

function compatibilityReceipt(
  candidate: PackageRepositoryVersionCandidate,
  currentBaseAbi: string | null,
): PackageRepositoryResolutionReceipt['compatibility'] {
  const declaration = candidate.compatibility_declaration ?? 'legacy_unspecified';
  const baseAbiRange = candidate.base_abi_range ?? null;
  return {
    status: declaration === 'legacy_unspecified'
      ? 'legacy_release_set_v1_bridge'
      : currentBaseAbi
        ? 'declared_compatible'
        : 'declared_not_checked',
    declaration_status: declaration,
    current_base_abi: currentBaseAbi,
    base_abi_range: baseAbiRange,
    capability_abi: candidate.capability_abi,
  };
}

export function resolvePackageRepositoryVersion(
  catalog: PackageRepositoryCatalog,
  input: ResolutionInput,
) {
  const entry = catalog.get(input.packageId);
  const selected = entry?.versions
    .filter((candidate) => candidateCompatibility(candidate, input))
    .sort((left, right) => {
      const declarationOrder = Number(right.compatibility_declaration === 'declared')
        - Number(left.compatibility_declaration === 'declared');
      if (declarationOrder !== 0) return declarationOrder;
      const legacyReleaseSetOrder = Number(
        right.source_format === 'release_set_catalog_v1'
        && right.selection_status === 'selected_for_release_set'
        && right.package_version === entry?.selected_version,
      ) - Number(
        left.source_format === 'release_set_catalog_v1'
        && left.selection_status === 'selected_for_release_set'
        && left.package_version === entry?.selected_version,
      );
      return legacyReleaseSetOrder !== 0
        ? legacyReleaseSetOrder
        : comparePackageRepositoryVersions(right.package_version, left.package_version);
    })[0] ?? null;
  if (!entry || !selected) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      input.resolutionKind === 'capability_provider'
        ? 'Package repository index has no compatible capability provider.'
        : 'Package repository index has no compatible stable Package version.',
      {
        package_id: input.packageId,
        resolution_kind: input.resolutionKind,
        current_base_abi: input.currentBaseAbi ?? null,
        version_requirement: input.versionRequirement ?? null,
        capability_abi: input.capabilityAbi ?? null,
        available_versions: entry?.versions.map((candidate) => ({
          package_version: candidate.package_version,
          capability_abi: candidate.capability_abi,
          compatibility_declaration: candidate.compatibility_declaration ?? 'legacy_unspecified',
          base_abi_range: candidate.base_abi_range ?? null,
          publication_stability: candidate.publication_stability ?? 'stable',
        })) ?? [],
        failure_code: input.resolutionKind === 'capability_provider'
          ? 'agent_package_capability_no_compatible_version'
          : 'agent_package_repository_no_compatible_version',
      },
    );
  }
  const sourceFormat = selected.source_format ?? 'bundled_full_catalog_v1';
  const receipt: PackageRepositoryResolutionReceipt = {
    surface_kind: 'opl_package_repository_resolution.v1',
    resolver_version: 'package-compatibility-resolver.v1',
    package_id: input.packageId,
    resolution_kind: input.resolutionKind,
    source_format: sourceFormat,
    selection_policy: 'highest_compatible_stable',
    currentness_owner: 'framework_compatibility_resolver',
    source_adapter_role: 'candidate_transport_only',
    installed_truth_owner: 'exact_installed_lock',
    runtime_truth_owner: 'immutable_materialized_bytes',
    exact_lock_required: true,
    selected_version: selected.package_version,
    selected_manifest_sha256: selected.manifest_sha256,
    selected_source_adapter_id: selected.source_adapter_id ?? null,
    compatibility: compatibilityReceipt(selected, input.currentBaseAbi ?? null),
    release_set_hint: {
      selected_for_release_set: sourceFormat === 'release_set_catalog_v1'
        && selected.selection_status === 'selected_for_release_set',
      currentness_authority: false,
    },
  };
  return { selected, receipt };
}
