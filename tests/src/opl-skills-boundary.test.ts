import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { readFamilySkillPacks } from '../../src/opl-skills.ts';
import { registerOplFamilyCodexPlugins } from '../../src/system-installation/codex-plugin-registry.ts';
import type { OplModuleId } from '../../src/system-installation/shared.ts';

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
    const generatedOnly = ['opl-meta-agent', 'opl-bookforge'].includes(pack.canonical_plugin_name);
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
    assert.equal(pack.foundry_agent_series.canonical_command_surface, 'opl agents foundry');
    if (pack.canonical_plugin_name === 'opl-meta-agent') {
      assert.equal(pack.foundry_agent_series.generated_surface_only, true);
      assert.equal(pack.foundry_agent_series.direct_cli_foundry_command_surface, 'opl foundry agents inspect oma');
      assert.equal(pack.foundry_agent_series.compatibility_foundry_command_surface, 'opl agents interfaces --repo-dir <opl-meta-agent-repo>');
    } else if (pack.canonical_plugin_name === 'opl-bookforge') {
      assert.equal(pack.foundry_agent_series.generated_surface_only, true);
      assert.equal(pack.foundry_agent_series.brand_cli, 'opl-bookforge');
      assert.equal(pack.foundry_agent_series.direct_cli, 'opl agents interfaces --repo-dir <opl-bookforge-repo>');
      assert.equal(pack.foundry_agent_series.direct_cli_foundry_command_surface, 'opl foundry agents inspect opl-bookforge');
      assert.equal(pack.foundry_agent_series.compatibility_foundry_command_surface, 'opl agents interfaces --repo-dir <opl-bookforge-repo>');
      assert.equal(pack.command_surface_spine.work_alias, 'book');
    } else if (pack.canonical_plugin_name === 'mas') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'mas');
      assert.equal(pack.foundry_agent_series.direct_cli, 'medautosci');
      assert.equal(pack.foundry_agent_series.direct_cli_foundry_command_surface, 'medautosci foundry');
      assert.equal(pack.foundry_agent_series.codex_executable_foundry_command_surface, 'medautosci foundry');
      assert.equal(pack.foundry_agent_series.compatibility_foundry_command_surface, 'medautosci foundry');
    } else if (pack.canonical_plugin_name === 'mag') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'mag');
      assert.equal(pack.foundry_agent_series.direct_cli, 'medautogrant');
      assert.equal(pack.foundry_agent_series.direct_cli_foundry_command_surface, 'medautogrant foundry');
      assert.equal(
        pack.foundry_agent_series.codex_executable_foundry_command_surface,
        '<med-autogrant-repo>/scripts/run-python-clean.sh -m med_autogrant.cli foundry',
      );
    } else if (pack.canonical_plugin_name === 'rca') {
      assert.equal(pack.foundry_agent_series.brand_cli, 'rca');
      assert.equal(pack.foundry_agent_series.direct_cli, 'redcube');
      assert.equal(pack.foundry_agent_series.direct_cli_foundry_command_surface, 'redcube foundry');
      assert.equal(
        pack.foundry_agent_series.codex_executable_foundry_command_surface,
        'npm run --prefix <redcube-ai-repo> redcube -- foundry',
      );
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
    assert.equal(
      seriesDelegateToolRefs.includes(
        generatedOnly ? 'opl agents foundry interfaces' : `${pack.foundry_agent_series.direct_cli} foundry interfaces`,
      ),
      true,
    );
    assert.equal(
      seriesDelegateToolRefs.includes(
        generatedOnly ? 'opl agents foundry status' : `${pack.foundry_agent_series.direct_cli} foundry status`,
      ),
      true,
    );
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
