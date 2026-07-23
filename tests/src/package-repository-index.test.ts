import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { validateJsonSchemaPayload } from '../../src/kernel/schema-registry.ts';
import {
  normalizeManagedPackageCatalog,
  resolveManagedCapabilityCatalogVersion,
  resolveManagedCatalogPackageVersion,
} from '../../src/modules/connect/agent-package-registry-parts/capability-reconciliation.ts';
import type { AgentPackageCapabilityDependency } from '../../src/modules/connect/agent-package-registry-parts/types.ts';

const repositoryIndexSchemaRef = new URL(
  '../../contracts/opl-framework/package-repository-index.schema.json',
  import.meta.url,
);
const repositoryIndexSchema = JSON.parse(fs.readFileSync(repositoryIndexSchemaRef, 'utf8'));

function digest(character: string) {
  return `sha256:${character.repeat(64)}`;
}

function repositoryVersion(input: {
  version: string;
  baseAbiRange: string;
  capabilityAbi?: string | null;
  stability?: 'stable' | 'prerelease' | 'retired';
  digestCharacter?: string;
}) {
  const digestCharacter = input.digestCharacter ?? '1';
  return {
    package_version: input.version,
    manifest_url: `https://packages.example.test/example/${input.version}/manifest.json`,
    manifest_sha256: digest(digestCharacter),
    compatibility: {
      declaration_status: 'declared',
      base_abi_range: input.baseAbiRange,
      capability_abi: input.capabilityAbi ?? null,
    },
    publication: {
      owner: 'package-owner',
      stability: input.stability ?? 'stable',
      immutable: true,
      source_adapter_id: 'owner-oci',
    },
  };
}

function repositoryIndex(packages: Record<string, unknown>) {
  return {
    surface_kind: 'opl_package_repository_index.v1',
    schema_version: 'package-repository-index.v1',
    index_id: 'opl-packages-test',
    generated_at: '2026-07-24T00:00:00.000Z',
    authority_boundary: {
      repository_index_owner: 'opl_framework',
      package_version_owner: 'package_owner',
      source_adapter_role: 'candidate_transport_only',
      currentness_owner: 'framework_compatibility_resolver',
      installed_truth_owner: 'exact_installed_lock',
      runtime_truth_owner: 'immutable_materialized_bytes',
      release_set_role: 'reproducible_snapshot_not_currentness_authority',
    },
    source_adapters: [{
      adapter_id: 'owner-oci',
      adapter_kind: 'oci',
      candidate_only: true,
    }],
    packages,
  };
}

test('Package repository index schema freezes source, currentness, lock, and runtime authority boundaries', () => {
  const payload = repositoryIndex({
    example: {
      package_id: 'example',
      package_role: 'standard_agent',
      versions: [repositoryVersion({
        version: '1.0.0',
        baseAbiRange: '>=1.0.0 <2.0.0',
      })],
    },
  });
  const result = validateJsonSchemaPayload({
    schemaId: repositoryIndexSchema.$id,
    schema: repositoryIndexSchema,
    sourceRef: 'contracts/opl-framework/package-repository-index.schema.json',
  }, payload);
  assert.equal(result.ok, true);
  assert.equal(payload.authority_boundary.source_adapter_role, 'candidate_transport_only');
  assert.equal(payload.authority_boundary.currentness_owner, 'framework_compatibility_resolver');
  assert.equal(payload.authority_boundary.installed_truth_owner, 'exact_installed_lock');
  assert.equal(payload.authority_boundary.runtime_truth_owner, 'immutable_materialized_bytes');
});

test('root resolver selects the highest stable version compatible with the current Base ABI', () => {
  const payload = repositoryIndex({
    example: {
      package_id: 'example',
      package_role: 'standard_agent',
      versions: [
        repositoryVersion({
          version: '3.0.0',
          baseAbiRange: '>=3.0.0 <4.0.0',
          digestCharacter: '3',
        }),
        repositoryVersion({
          version: '2.1.0',
          baseAbiRange: '>=1.0.0 <3.0.0',
          stability: 'prerelease',
          digestCharacter: '2',
        }),
        repositoryVersion({
          version: '2.0.0',
          baseAbiRange: '>=1.0.0 <3.0.0',
          digestCharacter: '4',
        }),
        repositoryVersion({
          version: '1.9.0',
          baseAbiRange: '>=1.0.0 <2.0.0',
          digestCharacter: '1',
        }),
      ],
    },
  });
  const catalog = normalizeManagedPackageCatalog(payload);
  const resolution = resolveManagedCatalogPackageVersion(catalog, 'example', {
    currentBaseAbi: '1.4.0',
  });

  assert.equal(resolution.selected.package_version, '2.0.0');
  assert.equal(resolution.receipt.selection_policy, 'highest_compatible_stable');
  assert.equal(resolution.receipt.compatibility.status, 'declared_compatible');
  assert.equal(resolution.receipt.compatibility.base_abi_range, '>=1.0.0 <3.0.0');
  assert.equal(resolution.receipt.currentness_owner, 'framework_compatibility_resolver');
  assert.equal(resolution.receipt.exact_lock_required, true);
  assert.equal(resolution.receipt.release_set_hint.selected_for_release_set, false);
});

test('Release Set catalog v1 retains its selected version only as an explicit legacy bridge hint', () => {
  const payload = {
    surface_kind: 'opl_package_catalog.v1',
    packages: {
      package_catalog: {
        example: {
          package_id: 'example',
          package_role: 'standard_agent',
          selected_version: '1.0.0',
          versions: [
            {
              package_version: '1.0.0',
              selection_status: 'selected_for_release_set',
              manifest_url: 'https://packages.example.test/example/1.0.0/manifest.json',
              manifest_sha256: digest('1'),
            },
            {
              package_version: '1.4.0',
              selection_status: 'retained_history',
              manifest_url: 'https://packages.example.test/example/1.4.0/manifest.json',
              manifest_sha256: digest('4'),
            },
          ],
        },
      },
    },
  };
  const resolution = resolveManagedCatalogPackageVersion(
    normalizeManagedPackageCatalog(payload),
    'example',
    { currentBaseAbi: '9.9.9' },
  );

  assert.equal(resolution.selected.package_version, '1.0.0');
  assert.equal(resolution.receipt.source_format, 'release_set_catalog_v1');
  assert.equal(resolution.receipt.compatibility.status, 'legacy_release_set_v1_bridge');
  assert.equal(resolution.receipt.compatibility.declaration_status, 'legacy_unspecified');
  assert.equal(resolution.receipt.compatibility.base_abi_range, null);
  assert.equal(resolution.receipt.release_set_hint.selected_for_release_set, true);
  assert.equal(resolution.receipt.release_set_hint.currentness_authority, false);
});

test('legacy Release Set publication policy, not a SemVer suffix, defines stable eligibility', () => {
  const payload = {
    surface_kind: 'opl_package_catalog.v1',
    packages: {
      package_catalog: {
        example: {
          package_id: 'example',
          package_role: 'standard_agent',
          selected_version: '0.1.0-alpha.4',
          versions: [{
            package_version: '0.1.0-alpha.4',
            selection_status: 'selected_for_release_set',
            manifest_url: 'https://packages.example.test/example/0.1.0-alpha.4/manifest.json',
            manifest_sha256: digest('4'),
          }],
        },
      },
    },
  };
  const resolution = resolveManagedCatalogPackageVersion(
    normalizeManagedPackageCatalog(payload),
    'example',
  );

  assert.equal(resolution.selected.package_version, '0.1.0-alpha.4');
  assert.equal(resolution.receipt.compatibility.status, 'legacy_release_set_v1_bridge');
});

test('Release Set catalog v1 honors explicit compatibility metadata without relabeling old entries', () => {
  const payload = {
    surface_kind: 'opl_package_catalog.v1',
    packages: {
      package_catalog: {
        example: {
          package_id: 'example',
          package_role: 'standard_agent',
          selected_version: '1.0.0',
          versions: [
            {
              package_version: '9.0.0',
              selection_status: 'retained_history',
              manifest_url: 'https://packages.example.test/example/9.0.0/manifest.json',
              manifest_sha256: digest('9'),
            },
            {
              package_version: '2.0.0',
              selection_status: 'retained_history',
              base_abi_range: '>=2.0.0 <3.0.0',
              manifest_url: 'https://packages.example.test/example/2.0.0/manifest.json',
              manifest_sha256: digest('2'),
            },
            {
              package_version: '1.5.0',
              selection_status: 'retained_history',
              compatibility: {
                declaration_status: 'declared',
                base_abi_range: '>=1.0.0 <2.0.0',
              },
              manifest_url: 'https://packages.example.test/example/1.5.0/manifest.json',
              manifest_sha256: digest('5'),
            },
          ],
        },
      },
    },
  };
  const resolution = resolveManagedCatalogPackageVersion(
    normalizeManagedPackageCatalog(payload),
    'example',
    { currentBaseAbi: '1.4.0' },
  );

  assert.equal(resolution.selected.package_version, '1.5.0');
  assert.equal(resolution.receipt.source_format, 'release_set_catalog_v1');
  assert.equal(resolution.receipt.compatibility.status, 'declared_compatible');
  assert.equal(resolution.receipt.compatibility.declaration_status, 'declared');
  assert.equal(resolution.receipt.compatibility.base_abi_range, '>=1.0.0 <2.0.0');
});

test('capability resolver selects the highest version satisfying Package, Base, and Capability ABI ranges', () => {
  const payload = repositoryIndex({
    provider: {
      package_id: 'provider',
      package_role: 'framework_capability_package',
      versions: [
        repositoryVersion({
          version: '1.9.0',
          baseAbiRange: '>=2.0.0 <3.0.0',
          capabilityAbi: 'provider.v1',
          digestCharacter: '9',
        }),
        repositoryVersion({
          version: '1.8.0',
          baseAbiRange: '>=1.0.0 <2.0.0',
          capabilityAbi: 'provider.v2',
          digestCharacter: '8',
        }),
        repositoryVersion({
          version: '1.7.0',
          baseAbiRange: '>=1.0.0 <2.0.0',
          capabilityAbi: 'provider.v1',
          digestCharacter: '7',
        }),
      ],
    },
  });
  const dependency: AgentPackageCapabilityDependency = {
    package_id: 'provider',
    required: true,
    dependency_kind: 'hard_runtime_dependency',
    version_requirement: '>=1.0.0 <2.0.0',
    capability_abi: 'provider.v1',
    required_export_ids: [],
    required_module_ids: [],
    bootstrap_manifest_url: null,
    dependency_source: null,
  };
  const resolution = resolveManagedCapabilityCatalogVersion(
    normalizeManagedPackageCatalog(payload),
    dependency,
    { currentBaseAbi: '1.5.0' },
  );

  assert.equal(resolution.selected.package_version, '1.7.0');
  assert.equal(resolution.receipt.resolution_kind, 'capability_provider');
  assert.equal(resolution.receipt.compatibility.status, 'declared_compatible');
  assert.equal(resolution.receipt.compatibility.capability_abi, 'provider.v1');
});
