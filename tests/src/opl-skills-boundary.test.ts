import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { readFamilySkillPacks } from '../../src/modules/connect/opl-skills.ts';
import { normalizeDomainSelection } from '../../src/modules/connect/opl-skills-parts/registry.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../src/kernel/family-workspace-root.ts';
import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import { registerOplFamilyCodexPlugins } from '../../src/modules/connect/system-installation/codex-plugin-registry.ts';
import type { OplModuleId } from '../../src/modules/connect/system-installation/shared.ts';

const allowedFoundrySeriesFields = [
  'brand_cli',
  'canonical_command_surface',
  'default_foundry_command_surface',
  'domain_contract_ref',
  'domain_id',
  'foundry_agent_id',
  'ordinary_golden_path',
  'policy_release_ref',
  'product_model',
  'series_contract_ref',
  'series_id',
  'series_label',
  'series_membership',
  'standard_agent_registry_ref',
] as const;

const allowedCommandSpineFields = [
  'agent_cli_must_not_replicate_top_level_modules',
  'agent_cli_must_use_series_spine',
  'default_foundry_operations',
  'foundry_agent_inspect_command_surface',
  'ordinary_operations',
  'ordinary_public_command_surface_spine',
  'required_public_surface_derivatives',
  'skill_inspect_command_surface',
  'skill_sync_command_surface',
  'surface_kind',
  'work_alias',
  'work_alias_command_pattern',
] as const;

const allowedMcpProjectionFields = [
  'cli_mcp_relationship_policy',
  'descriptor_ref',
  'domain_repo_mcp_server_role',
  'future_unified_mcp_server_strategy',
  'legacy_standalone_mcp_servers_retired',
  'mcp_context_budget_policy',
  'mcp_descriptor_must_delegate_to_series_spine',
  'plugin_registry_is_canonical_transport',
  'series_delegate_tool_refs',
  'standard_agent_plugin_manifest_must_not_expose_mcp_servers',
  'standard_agent_standalone_mcp_default_enabled',
  'surface_kind',
  'unified_mcp_projection_owner',
] as const;

const forbiddenRuntimeMcpReadinessFields = [
  'unified_mcp_server_ready',
  'unified_mcp_server_readiness',
  'runtime_server_ready',
  'runtime_server_readiness',
  'runtime_server_url',
  'runtime_server_command',
] as const;

type FoundryProjectionPack = {
  foundry_agent_series: Record<string, unknown>;
  command_surface_spine: Record<string, unknown>;
  mcp_projection: Record<string, unknown>;
};

function assertOnlyAllowedFoundrySeriesFields(pack: FoundryProjectionPack) {
  assert.deepEqual(Object.keys(pack.foundry_agent_series).sort(), [...allowedFoundrySeriesFields].sort());
  assert.deepEqual(Object.keys(pack.command_surface_spine).sort(), [...allowedCommandSpineFields].sort());
  assert.deepEqual(Object.keys(pack.mcp_projection).sort(), [...allowedMcpProjectionFields].sort());
  for (const field of forbiddenRuntimeMcpReadinessFields) {
    assert.equal(field in pack.mcp_projection, false);
  }
}

test('OBF resolves to OPL Book Forge through the standard agent registry aliases', () => {
  for (const alias of ['OBF', 'obf']) {
    const agent = resolveStandardAgent(alias);
    assert.equal(agent?.domain_id, 'oplbookforge');
    assert.equal(agent?.label, 'OPL Book Forge');
    assert.deepEqual([...normalizeDomainSelection([alias])!], ['oplbookforge']);
  }
});

test('OPL system skill sync catalog excludes MDS stage skills while exposing ScholarSkills as a target-scoped capability pack', () => {
  const previousFamilyWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  const previousModuleSourceMode = process.env.OPL_MODULE_SOURCE_MODE;
  let catalog!: ReturnType<typeof readFamilySkillPacks>['skill_catalog'];
  try {
    const repoRoot = process.cwd();
    process.env.OPL_FAMILY_WORKSPACE_ROOT = resolveFamilyWorkspaceRootFromRepoRoot(repoRoot);
    process.env.OPL_MODULE_SOURCE_MODE = 'git_checkout';
    catalog = readFamilySkillPacks().skill_catalog;
  } finally {
    if (previousFamilyWorkspaceRoot === undefined) {
      delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    } else {
      process.env.OPL_FAMILY_WORKSPACE_ROOT = previousFamilyWorkspaceRoot;
    }
    if (previousModuleSourceMode === undefined) {
      delete process.env.OPL_MODULE_SOURCE_MODE;
    } else {
      process.env.OPL_MODULE_SOURCE_MODE = previousModuleSourceMode;
    }
  }
  const domainIds = catalog.packs.map((pack) => pack.domain_id);
  const pluginNames = catalog.packs.map((pack) => pack.canonical_plugin_name);

  assert.deepEqual(domainIds, ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge', 'scholarskills']);
  assert.equal(domainIds.includes('meddeepscientist'), false);
  assert.equal(pluginNames.includes('deepscientist'), false);
  assert.equal(pluginNames.includes('oma'), true);
  assert.equal(pluginNames.includes('obf'), true);
  assert.equal(pluginNames.includes('mas-scholar-skills'), true);
  for (const pack of catalog.packs) {
    const ordinaryOperations = pack.command_surface_spine.ordinary_operations as string[];
    const ordinaryPublicCommandSurfaceSpine = pack.command_surface_spine.ordinary_public_command_surface_spine as string[];
    const seriesDelegateToolRefs = pack.mcp_projection.series_delegate_tool_refs as string[];
    if (pack.canonical_plugin_name === 'mas-scholar-skills') {
      assert.equal(pack.distribution_role, 'framework_capability_plugin_pack');
      assert.equal(
        pack.capability_plugin_distribution?.default_sync_scope,
        'package_activation_transaction_only',
      );
      assert.equal('default_target_project' in pack.capability_plugin_distribution, false);
      assert.equal(pack.capability_plugin_distribution?.domain_module, false);
      assert.deepEqual(pack.command_preview, [
        'opl',
        'packages',
        'activate',
        'mas',
        '--scope',
        'workspace',
        '--target-workspace',
        '<workspace-root>',
      ]);
      continue;
    }
    assert.equal(pack.agent_series_membership, 'standard_domain_agent');
    assert.equal(pack.source_kind, 'opl_standard_codex_carrier');
    assert.equal(pack.plugin_transport.standard_codex_carrier, true);
    assert.equal('repo_plugin_installer' in pack.plugin_transport, false);
    assert.equal('opl_generated_plugin_surface' in pack.plugin_transport, false);
    assert.equal(pack.plugin_transport.materializer, 'opl_standard_codex_plugin_materializer');
    assert.match(pack.skill_entry_path, /agent\/primary_skill\/SKILL\.md$/);
    if (pack.repo_found) {
      assert.equal(pack.skill_entry_found, true);
      assert.equal(pack.skill_entry_valid, true);
      assert.deepEqual(pack.skill_entry_errors, []);
    } else {
      assert.equal(pack.skill_entry_found, false);
      assert.equal(pack.skill_entry_valid, false);
    }
    const agentProjectionPolicy = pack.agent_projection_policy;
    if (agentProjectionPolicy === null) {
      assert.fail('domain agent plugin packs must declare an agent projection policy');
    }
    assert.equal(agentProjectionPolicy.standard_membership, 'standard_domain_agent');
    assert.equal(agentProjectionPolicy.plugin_transport_is_membership_axis, false);
    assert.equal(agentProjectionPolicy.plugin_transport_is_status_axis, false);
    assert.equal(pack.agent_package_exposure_model?.unified_public_abstraction, 'opl_agent_package');
    assert.equal(
      pack.agent_package_exposure_model?.codex_plugin_role,
      'carrier_detail_for_codex_app_standalone_install',
    );
    assert.equal(pack.agent_package_exposure_model?.opl_app_role, 'package_cockpit_for_managed_agent_packages');
    assert.equal(pack.agent_package_exposure_model?.physical_carriers_must_remain_distinct, false);
    assert.equal(
      pack.agent_package_exposure_model?.standard_physical_carrier,
      'repo_local_materialized_codex_plugin_carrier_from_repo_owned_primary_skill',
    );
    assert.equal(pack.agent_package_exposure_model?.repo_owned_primary_skill_required, true);
    assert.equal(pack.agent_package_exposure_model?.user_story_must_not_split_by_carrier, true);
    assert.equal(pack.management_model, 'opl_managed_codex_plugin_surface');
    assert.equal(pack.management_model_role, 'unified_management_semantics_transport_may_differ');
    assert.equal(
      pack.professional_skill_exposure.on_demand_exposure_policy.default_sync_model,
      'source_search_inspect_explicit_sync',
    );
    assert.equal(pack.professional_skill_exposure.on_demand_exposure_policy.codex_metadata_is_exposure, true);
    assert.equal(pack.professional_skill_exposure.on_demand_exposure_policy.default_global_user_allowed, false);
    assert.equal(pack.professional_skill_exposure.codex_default_exposure_required, false);
    assert.equal(pack.professional_skill_exposure.default_codex_exposed_count, 0);
    assert.equal(pack.foundry_agent_series.canonical_command_surface, 'opl agents foundry');
    assert.equal(pack.foundry_agent_series.series_membership, 'standard_domain_agent');
    assert.equal(pack.foundry_agent_series.standard_agent_registry_ref, 'src/kernel/standard-agent-registry.ts');
    assert.equal(
      pack.foundry_agent_series.default_foundry_command_surface,
      `opl foundry agents inspect ${pack.foundry_agent_series.foundry_agent_id}`,
    );
    assertOnlyAllowedFoundrySeriesFields(pack);
    assert.equal(pack.plugin_transport.source_kind_role, 'standard_source_model_not_agent_membership_or_status');
    assert.equal(pack.plugin_transport.public_agent_list_must_not_split_by_transport, true);
    if (pack.canonical_plugin_name === 'oma') {
      assert.equal(pack.foundry_agent_series.default_foundry_command_surface, 'opl foundry agents inspect oma');
    } else if (pack.canonical_plugin_name === 'obf') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'obf');
      assert.equal(pack.foundry_agent_series.default_foundry_command_surface, 'opl foundry agents inspect obf');
      assert.equal(pack.command_surface_spine.work_alias, 'book');
    } else if (pack.canonical_plugin_name === 'mas') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'mas');
      assert.equal(pack.foundry_agent_series.default_foundry_command_surface, 'opl foundry agents inspect mas');
    } else if (pack.canonical_plugin_name === 'mag') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'mag');
      assert.equal(pack.foundry_agent_series.default_foundry_command_surface, 'opl foundry agents inspect mag');
    } else if (pack.canonical_plugin_name === 'rca') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'rca');
      assert.equal(pack.foundry_agent_series.default_foundry_command_surface, 'opl foundry agents inspect rca');
    } else {
      assert.fail(`unexpected plugin: ${pack.canonical_plugin_name}`);
    }
    assert.equal(pack.command_surface_spine.skill_sync_command_surface, 'opl connect sync-skills');
    assert.equal('frontdoor_spine' in pack, false);
    assert.equal('canonical_frontdoor' in pack.foundry_agent_series, false);
    assert.equal('skill_sync_frontdoor' in pack.command_surface_spine, false);
    assert.equal(ordinaryOperations.includes('status'), true);
    assert.equal(ordinaryPublicCommandSurfaceSpine.includes('work'), true);
    assert.equal(pack.mcp_projection.mcp_descriptor_must_delegate_to_series_spine, true);
    assert.equal(pack.mcp_projection.standard_agent_standalone_mcp_default_enabled, false);
    assert.equal(pack.mcp_projection.standard_agent_plugin_manifest_must_not_expose_mcp_servers, true);
    assert.equal(pack.mcp_projection.unified_mcp_projection_owner, 'one-person-lab');
    assert.equal(pack.mcp_projection.future_unified_mcp_server_strategy, 'opl_owned_unified_server_when_runtime_verified');
    assert.equal(pack.mcp_projection.domain_repo_mcp_server_role, 'direct_protocol_adapter_or_proof_lane_only');
    const cliMcpRelationshipPolicy = pack.mcp_projection.cli_mcp_relationship_policy as Record<string, unknown>;
    const mcpContextBudgetPolicy = pack.mcp_projection.mcp_context_budget_policy as Record<string, unknown>;
    assert.equal(cliMcpRelationshipPolicy.all_cli_commands_are_mcp_tools, false);
    assert.equal(cliMcpRelationshipPolicy.mcp_must_not_mirror_full_cli_by_default, true);
    assert.equal(cliMcpRelationshipPolicy.mcp_tool_existence_does_not_create_domain_authority, true);
    assert.equal(mcpContextBudgetPolicy.progressive_discovery_required_for_large_catalogs, true);
    assert.equal(mcpContextBudgetPolicy.toolset_filtering_required_for_broad_surfaces, true);
    assert.equal(mcpContextBudgetPolicy.search_describe_execute_pattern_allowed, true);
    assert.equal(mcpContextBudgetPolicy.full_cli_mirror_forbidden, true);
    assert.equal(seriesDelegateToolRefs.includes('opl agents foundry interfaces'), true);
    assert.equal(seriesDelegateToolRefs.includes('opl agents foundry status'), true);
    assert.equal('legacy_implementation_bucket_policy' in pack, false);
  }
});

test('OPL Codex plugin registry removes standalone family MCP server blocks', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-plugin-registry-home-'));
  const reposRoot = path.join(homeRoot, 'repos');
  const repoPaths = new Map<OplModuleId, string>([
    ['medautoscience', path.join(reposRoot, 'med-autoscience')],
    ['medautogrant', path.join(reposRoot, 'med-autogrant')],
    ['redcube', path.join(reposRoot, 'redcube-ai')],
    ['oplmetaagent', path.join(reposRoot, 'opl-meta-agent-generated')],
    ['oplbookforge', path.join(reposRoot, 'opl-bookforge-generated')],
  ]);

  try {
    for (const [moduleId, repoPath] of repoPaths) {
      const pluginId = moduleId === 'medautoscience'
        ? 'med-autoscience'
        : moduleId === 'medautogrant'
          ? 'med-autogrant'
          : moduleId === 'redcube'
            ? 'redcube-ai'
            : moduleId === 'oplmetaagent'
              ? 'opl-meta-agent'
              : 'opl-bookforge';
      const pluginRoot = path.join(repoPath, 'plugins', pluginId);
      const primarySkillPath = path.join(repoPath, 'agent', 'primary_skill', 'SKILL.md');
      const carrierSkillPath = path.join(pluginRoot, 'skills', pluginId, 'SKILL.md');
      fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
      fs.mkdirSync(path.dirname(primarySkillPath), { recursive: true });
      fs.mkdirSync(path.dirname(carrierSkillPath), { recursive: true });
      fs.writeFileSync(
        path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
        JSON.stringify({
          name: pluginId,
          version: '0.1.0',
          skills: './skills/',
        }, null, 2),
        'utf8',
      );
      fs.writeFileSync(
        primarySkillPath,
        [
          '---',
          `name: ${pluginId}`,
          `description: ${pluginId} standard agent primary skill fixture.`,
          '---',
          '',
          `# ${pluginId}`,
          '',
          'Fixture rich primary skill body for registry materialization.',
          '',
        ].join('\n'),
        'utf8',
      );
      fs.copyFileSync(primarySkillPath, carrierSkillPath);
    }

    const codexHome = path.join(homeRoot, '.codex');
    const configPath = path.join(codexHome, 'config.toml');
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        '[mcp_servers]',
        '',
        '[mcp_servers.sentrux]',
        'command = "/opt/homebrew/bin/sentrux"',
        'args = ["mcp"]',
        '',
        '[mcp_servers.redcube-ai]',
        'command = "node"',
        'args = ["/Users/test/redcube-ai/apps/redcube-mcp/dist/server.js"]',
        '',
        '[mcp_servers.med-autoscience]',
        'command = "python"',
        'args = ["-m", "med_autoscience.mcp_server"]',
        '',
      ].join('\n'),
      'utf8',
    );

    const selectedModules: OplModuleId[] = ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge'];
    const result = registerOplFamilyCodexPlugins(selectedModules, repoPaths, homeRoot);
    const config = fs.readFileSync(configPath, 'utf8');

    assert.equal(result.summary.registered, 5);
    assert.equal(result.summary.removed_standalone_mcp_servers, 2);
    assert.match(config, /\[mcp_servers\.sentrux\]/);
    assert.doesNotMatch(config, /\[mcp_servers\.redcube-ai\]/);
    assert.doesNotMatch(config, /\[mcp_servers\.med-autoscience\]/);
    assert.match(config, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
    assert.match(config, /\[plugins\."med-autogrant@med-autogrant-local"\]/);
    assert.match(config, /\[plugins\."redcube-ai@redcube-ai-local"\]/);
    assert.match(config, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(config, /\[plugins\."opl-bookforge@opl-bookforge-local"\]/);
    for (const item of result.items) {
      assert.equal(item.status, 'registered');
      assert.equal(fs.existsSync(item.marketplace_path), true);
      assert.equal(fs.existsSync(item.plugin_manifest_path), true);
      assert.equal(fs.existsSync(path.join(item.repo_path, '.agents', 'plugins', 'marketplace.json')), false);
      assert.match(config, new RegExp(`\\[marketplaces\\.${item.marketplace_id}\\]\\nsource_type = "local"\\nsource = "${item.marketplace_root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
