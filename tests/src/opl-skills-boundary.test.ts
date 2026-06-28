import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { readFamilySkillPacks } from '../../src/opl-skills.ts';
import { normalizeDomainSelection } from '../../src/opl-skills-parts/registry.ts';
import { resolveStandardAgent } from '../../src/standard-agent-registry.ts';
import { registerOplFamilyCodexPlugins } from '../../src/system-installation/codex-plugin-registry.ts';
import type { OplModuleId } from '../../src/system-installation/shared.ts';

const retiredFoundrySeriesFields = [
  'domain_native_foundry_command_surface',
  'codex_executable_foundry_command_surface',
  'compatibility_foundry_command_surface',
  'direct_domain_cli',
] as const;

const retiredCommandSpineFields = [
  'compatibility_foundry_operations',
] as const;

const retiredMcpProjectionFields = [
  'compatibility_delegate_tool_refs',
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

function assertNoRetiredFoundrySeriesFields(pack: FoundryProjectionPack) {
  for (const field of retiredFoundrySeriesFields) {
    assert.equal(field in pack.foundry_agent_series, false);
  }
  for (const field of retiredCommandSpineFields) {
    assert.equal(field in pack.command_surface_spine, false);
  }
  for (const field of retiredMcpProjectionFields) {
    assert.equal(field in pack.mcp_projection, false);
  }
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
  const catalog = readFamilySkillPacks().skill_catalog;
  const domainIds = catalog.packs.map((pack) => pack.domain_id);
  const pluginNames = catalog.packs.map((pack) => pack.canonical_plugin_name);

  assert.deepEqual(domainIds, ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge', 'scholarskills']);
  assert.equal(domainIds.includes('meddeepscientist'), false);
  assert.equal(pluginNames.includes('deepscientist'), false);
  assert.equal(pluginNames.includes('opl-meta-agent'), true);
  assert.equal(pluginNames.includes('opl-bookforge'), true);
  assert.equal(pluginNames.includes('opl-scholarskills'), true);
  for (const pack of catalog.packs) {
    const ordinaryOperations = pack.command_surface_spine.ordinary_operations as string[];
    const ordinaryPublicCommandSurfaceSpine = pack.command_surface_spine.ordinary_public_command_surface_spine as string[];
    const seriesDelegateToolRefs = pack.mcp_projection.series_delegate_tool_refs as string[];
    if (pack.canonical_plugin_name === 'opl-scholarskills') {
      assert.equal(pack.distribution_role, 'framework_capability_plugin_pack');
      assert.equal(
        pack.capability_plugin_distribution?.default_sync_scope,
        'none_without_explicit_workspace_or_quest_target',
      );
      assert.equal(pack.capability_plugin_distribution?.default_target_project, null);
      assert.equal(pack.capability_plugin_distribution?.domain_module, false);
      assert.deepEqual(pack.command_preview, [
        'opl',
        'connect',
        'sync-skills',
        '--domain',
        'scholarskills',
        '--scope',
        'workspace',
        '--target-workspace',
        '<workspace-root>',
      ]);
      continue;
    }
    assert.equal(pack.agent_series_membership, 'standard_domain_agent');
    if (pack.source_kind === 'repo_plugin_installer') {
      if (pack.repo_found) {
        assert.equal(pack.plugin_manifest_found, true);
        assert.equal(pack.plugin_manifest_valid, true);
        assert.deepEqual(pack.plugin_manifest_errors, []);
      } else {
        assert.equal(pack.plugin_manifest_found, false);
        assert.deepEqual(pack.plugin_manifest_errors, []);
      }
    } else {
      assert.equal(pack.source_kind, 'opl_generated_plugin_surface');
      if (pack.repo_found) {
        assert.equal(pack.generated_skill_surface_ready, true);
      } else {
        assert.equal(pack.generated_skill_surface_ready, false);
        assert.equal(pack.generated_skill_surface_status, 'blocked_invalid_generated_skill_contracts');
      }
    }
    const agentProjectionPolicy = pack.agent_projection_policy;
    if (agentProjectionPolicy === null) {
      assert.fail('domain agent plugin packs must declare an agent projection policy');
    }
    assert.equal(agentProjectionPolicy.standard_membership, 'standard_domain_agent');
    assert.equal(agentProjectionPolicy.plugin_transport_is_membership_axis, false);
    assert.equal(agentProjectionPolicy.plugin_transport_is_status_axis, false);
    assert.equal(pack.foundry_agent_series.canonical_command_surface, 'opl agents foundry');
    assert.equal(pack.foundry_agent_series.series_membership, 'standard_domain_agent');
    assert.equal(pack.foundry_agent_series.standard_agent_registry_ref, 'src/standard-agent-registry.ts');
    assert.equal('surface_mode' in pack.foundry_agent_series, false);
    assert.equal('generated_surface_only' in pack.foundry_agent_series, false);
    assert.equal(
      pack.foundry_agent_series.default_foundry_command_surface,
      `opl foundry agents inspect ${pack.foundry_agent_series.foundry_agent_id}`,
    );
    assertNoRetiredFoundrySeriesFields(pack);
    assert.equal(pack.plugin_transport.source_kind_role, 'transport_install_detail_not_agent_membership_or_status');
    assert.equal(pack.plugin_transport.public_agent_list_must_not_split_by_transport, true);
    if (pack.canonical_plugin_name === 'opl-meta-agent') {
      assert.equal(pack.foundry_agent_series.default_foundry_command_surface, 'opl foundry agents inspect oma');
    } else if (pack.canonical_plugin_name === 'opl-bookforge') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'opl-bookforge');
      assert.equal(pack.foundry_agent_series.default_foundry_command_surface, 'opl foundry agents inspect opl-bookforge');
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
    assert.equal(pack.legacy_implementation_bucket_policy.ordinary_public_command_surface_allowed, false);
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
        ? 'mas'
        : moduleId === 'medautogrant'
          ? 'mag'
          : moduleId === 'redcube'
            ? 'rca'
            : moduleId === 'oplmetaagent'
              ? 'opl-meta-agent'
              : 'opl-bookforge';
      const pluginRoot = path.join(repoPath, 'plugins', pluginId);
      fs.mkdirSync(path.join(pluginRoot, '.codex-plugin'), { recursive: true });
      fs.writeFileSync(
        path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
        JSON.stringify({ name: pluginId, skills: './skills/' }, null, 2),
        'utf8',
      );
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
    assert.match(config, /\[plugins\."mas@mas-local"\]/);
    assert.match(config, /\[plugins\."mag@mag-local"\]/);
    assert.match(config, /\[plugins\."rca@rca-local"\]/);
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
