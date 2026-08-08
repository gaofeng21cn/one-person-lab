import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadStandardAgentRegistry,
  matchesStandardDomainAgentCatalogEntry,
  normalizeStandardDomainAgentId,
  standardDomainAgentFamilyProjection,
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../src/kernel/standard-agent-registry.ts';
import { OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE } from '../../src/modules/pack/standard-agent-stage-manifest.ts';
import {
  CANONICAL_OPL_PACKAGE_IDS,
  canonicalAgentPackageId,
} from '../../src/modules/connect/agent-package-identity.ts';
import { listFirstPartyAgentPackageManifests } from '../../src/modules/connect/agent-package-manifests.ts';
import { getOplPackageSpecs } from '../../src/modules/connect/package-distribution.ts';
import { resolveOplDomainModuleSpec } from '../../src/modules/connect/system-installation/modules.ts';
import { buildDomainModuleSpecs } from '../../src/modules/connect/system-installation/module-specs.ts';
import {
  buildCodexFamilyPluginSpecs,
  listCodexFamilyPluginPackIds,
} from '../../src/modules/connect/system-installation/codex-plugin-registry.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function nativeHelperContract() {
  return JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/native-helper-contract.json'),
    'utf8',
  )) as {
    owner_split: {
      domain_truth_owners: string[];
      domain_truth_owner_registry: {
        source_ref: string;
        series_membership: string;
        projection_field: string;
      };
    };
  };
}

function unknownAgentProjection() {
  const fixture = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/packages/mas.json'),
    'utf8',
  )) as Record<string, any>;
  fixture.package_id = 'future-agent';
  fixture.agent_id = 'future-agent';
  fixture.display_name = 'Future Agent';
  fixture.source_repo = 'https://example.test/future-agent.git';
  fixture.publication_projection_order = 90;
  fixture.publication_source = {
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_plugin_manifest_ref: 'plugins/future-agent/.codex-plugin/plugin.json',
  };
  fixture.runtime_source_carrier = {
    carrier_kind: 'opl_managed_module_source',
    module_id: 'futureagent',
  };
  fixture.standard_agent_descriptor_projection = {
    surface_kind: 'opl_standard_agent_descriptor_projection.v1',
    source_ref: 'contracts/domain_descriptor.json',
    interface_source_ref: 'contracts/domain_descriptor.json#/standard_agent_interface',
    domain_id: 'future',
    runtime_domain_id: 'future_runtime',
    short_label: 'FUTURE',
    explicit_aliases: ['future-agent', 'future_agent'],
    compatibility: {
      registry_domain_id: 'future',
      aliases: ['future-runtime'],
      owner_aliases: ['future-agent', 'future'],
    },
  };
  fixture.codex_surface = {
    ...fixture.codex_surface,
    plugin_id: 'future-agent',
    configured_codex_plugin_carrier: {
      ...fixture.codex_surface.configured_codex_plugin_carrier,
      plugin_selector: 'future-agent@future-agent',
      marketplace_source: 'example/future-agent',
    },
    required_skill_ids: ['future-agent'],
    bundled_capability_package_ids: [],
  };
  fixture.capability_dependencies = [];
  return fixture;
}

function writeUnknownAgentProjection(packageDirectory: string, fixture = unknownAgentProjection()) {
  fs.writeFileSync(
    path.join(packageDirectory, 'future-agent.json'),
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
}

test('native helper owner split derives all standard domain agents from the registry', () => {
  const contract = nativeHelperContract();
  const standardAgents = STANDARD_AGENT_REGISTRY.filter((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );

  assert.deepEqual(contract.owner_split.domain_truth_owners, standardAgents.map((entry) => entry.project));
  assert.deepEqual(contract.owner_split.domain_truth_owner_registry, {
    source_ref: 'contracts/opl-framework/packages/*.json#/standard_agent_descriptor_projection',
    series_membership: 'standard_domain_agent',
    projection_field: 'project',
  });
});

test('standard Agent family labels never mix compact and full product names', () => {
  assert.deepEqual(standardDomainAgentFamilyProjection('compact').labels, [
    'MAS', 'MAG', 'RCA', 'OMA', 'OBF',
  ]);
  assert.deepEqual(standardDomainAgentFamilyProjection('full').labels, [
    'Med Auto Science',
    'Med Auto Grant',
    'RedCube AI',
    'OPL Meta Agent',
    'OPL Book Forge',
  ]);
  assert.equal(
    new Set<string>(standardDomainAgentFamilyProjection('full').labels).has('BookForge'),
    false,
  );
});

test('package and module aliases derive registry entries without promoting ScholarSkills', () => {
  const standardAgents = STANDARD_AGENT_REGISTRY.filter((entry) =>
    entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP
  );

  for (const agent of standardAgents) {
    for (const alias of [agent.agent_id, agent.domain_id, agent.project, agent.plugin_name, ...agent.aliases]) {
      assert.equal(canonicalAgentPackageId(alias), agent.agent_id, alias);
      assert.equal(normalizeStandardDomainAgentId(alias), agent.target_domain_id, alias);
    }
  }

  for (const agent of STANDARD_AGENT_REGISTRY) {
    for (const alias of [
      agent.agent_id,
      agent.domain_id,
      agent.target_domain_id,
      agent.project,
      agent.plugin_name,
      agent.canonical_plugin_name,
      ...agent.aliases,
    ]) {
      assert.equal(resolveOplDomainModuleSpec(alias).module_id, agent.module_id.toLowerCase(), alias);
    }
  }

  assert.equal(canonicalAgentPackageId('mas-scholar-skills'), 'mas-scholar-skills');
  assert.equal(canonicalAgentPackageId('OPL Relay'), 'opl-relay');
  assert.equal(canonicalAgentPackageId('OPL Persona'), 'opl-persona');
  assert.equal(normalizeStandardDomainAgentId('mas-scholar-skills'), 'mas-scholar-skills');
  assert.equal(matchesStandardDomainAgentCatalogEntry('rca', {
    project_id: 'redcube',
    project: 'redcube-ai',
  }), true);
  assert.equal(matchesStandardDomainAgentCatalogEntry('oma', {
    project_id: 'oplmetaagent',
    project: 'opl-meta-agent',
  }), true);
  assert.equal(matchesStandardDomainAgentCatalogEntry('mas-scholar-skills', {
    project_id: 'scholarskills',
    project: 'mas-scholar-skills',
  }), false);
});

test('canonical App-state package identities match the release package specs', () => {
  assert.deepEqual(
    getOplPackageSpecs().map((spec) => spec.package_id),
    [...CANONICAL_OPL_PACKAGE_IDS],
  );
});

test('one unknown Agent projection drives all runtime registries', () => {
  const packageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-unknown-agent-projection-'));

  try {
    writeUnknownAgentProjection(packageDirectory);

    const registry = loadStandardAgentRegistry(packageDirectory);
    assert.deepEqual(registry.map((entry) => entry.agent_id), ['future-agent']);
    assert.deepEqual(registry[0], {
      agent_id: 'future-agent',
      domain_id: 'future',
      target_domain_id: 'future_runtime',
      label: 'Future Agent',
      short_label: 'FUTURE',
      display_name: 'Future Agent',
      series_membership: 'standard_domain_agent',
      project: 'future-agent',
      module_id: 'FUTUREAGENT',
      plugin_name: 'future-agent',
      canonical_plugin_name: 'future-agent',
      aliases: [
        'future-agent',
        'future',
        'future_runtime',
        'futureagent',
        'future_agent',
        'future-runtime',
      ],
      owner_id: 'future-agent',
      owner_aliases: ['future-agent', 'future'],
    });

    const manifests = listFirstPartyAgentPackageManifests(packageDirectory);
    assert.deepEqual(manifests.map((manifest) => ({
      package_id: manifest.package_id,
      module_id: manifest.module_id,
      plugin_id: manifest.codex_surface.plugin_id,
    })), [{
      package_id: 'future-agent',
      module_id: 'futureagent',
      plugin_id: 'future-agent',
    }]);

    const packageSpecs = getOplPackageSpecs(packageDirectory);
    assert.deepEqual(packageSpecs.map((spec) => ({
      package_id: spec.package_id,
      module_id: spec.module_id,
      package_role: spec.package_role,
    })), [{
      package_id: 'future-agent',
      module_id: 'futureagent',
      package_role: 'standard_agent',
    }]);

    const moduleSpec = buildDomainModuleSpecs(packageDirectory)
      .find((spec) => spec.module_id === 'futureagent');
    assert.equal(moduleSpec?.repo_name, 'future-agent');
    assert.equal(moduleSpec?.scope, 'domain_module');
    assert.equal(moduleSpec?.default_install, true);

    assert.deepEqual(buildCodexFamilyPluginSpecs(packageDirectory).map((spec) => ({
      module_id: spec.module_id,
      pack_id: spec.pack_id,
      plugin_id: spec.plugin_id,
      repo_name: spec.repo_name,
      ownership_kind: spec.ownership_kind,
    })), [{
      module_id: 'futureagent',
      pack_id: 'futureagent',
      plugin_id: 'future-agent',
      repo_name: 'future-agent',
      ownership_kind: 'standard_agent_codex_carrier',
    }]);
    assert.deepEqual(listCodexFamilyPluginPackIds(packageDirectory), ['futureagent']);
  } finally {
    fs.rmSync(packageDirectory, { recursive: true, force: true });
  }
});

test('malformed standard Agent descriptor projections fail closed before registry admission', () => {
  const packageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-invalid-agent-projection-'));
  const cases: Array<[string, (fixture: Record<string, any>) => void]> = [
    ['standard_agent_descriptor_projection', (fixture) => delete fixture.standard_agent_descriptor_projection],
    ['surface_kind', (fixture) => fixture.standard_agent_descriptor_projection.surface_kind = 'unknown'],
    ['source_ref', (fixture) => fixture.standard_agent_descriptor_projection.source_ref = ''],
    ['interface_source_ref', (fixture) => fixture.standard_agent_descriptor_projection.interface_source_ref = ''],
    ['domain_id', (fixture) => fixture.standard_agent_descriptor_projection.domain_id = ''],
    ['runtime_domain_id', (fixture) => fixture.standard_agent_descriptor_projection.runtime_domain_id = ''],
    ['explicit_aliases', (fixture) => fixture.standard_agent_descriptor_projection.explicit_aliases = ['']],
    ['compatibility', (fixture) => fixture.standard_agent_descriptor_projection.compatibility = null],
    ['registry_domain_id', (fixture) => fixture.standard_agent_descriptor_projection.compatibility.registry_domain_id = ''],
    ['owner_aliases', (fixture) => fixture.standard_agent_descriptor_projection.compatibility.owner_aliases = ['']],
  ];

  try {
    for (const [field, mutate] of cases) {
      const fixture = unknownAgentProjection();
      mutate(fixture);
      writeUnknownAgentProjection(packageDirectory, fixture);
      assert.throws(
        () => loadStandardAgentRegistry(packageDirectory),
        (error: unknown) => error instanceof Error && error.message.includes(field),
        field,
      );
    }
  } finally {
    fs.rmSync(packageDirectory, { recursive: true, force: true });
  }
});

test('standard Agent descriptor namespace collisions fail before alias maps diverge', () => {
  const packageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-alias-collision-'));
  const futureAgent = unknownAgentProjection();
  futureAgent.standard_agent_descriptor_projection.compatibility.aliases = ['med-autoscience'];

  try {
    fs.copyFileSync(
      path.join(repoRoot, 'contracts/opl-framework/packages/mas.json'),
      path.join(packageDirectory, 'mas.json'),
    );
    writeUnknownAgentProjection(packageDirectory, futureAgent);
    assert.throws(
      () => loadStandardAgentRegistry(packageDirectory),
      /registry namespace collision.*medautoscience/i,
    );
  } finally {
    fs.rmSync(packageDirectory, { recursive: true, force: true });
  }
});

test('official quality governance stays outside the identity registry', () => {
  const qualityGoverned = STANDARD_AGENT_REGISTRY
    .filter((entry) => 'quality_governance_profile' in entry)
    .map((entry) => entry.agent_id);
  assert.deepEqual(qualityGoverned, []);
  assert.equal(OFFICIAL_KNOWLEDGE_DELIVERABLE_QUALITY_PROFILE.profile_id,
    'official_high_value_knowledge_deliverable.v1');
  const scholarSkills = STANDARD_AGENT_REGISTRY.find((entry) => entry.agent_id === 'mas-scholar-skills');
  assert.equal(scholarSkills && 'quality_governance_profile' in scholarSkills, false);
});
