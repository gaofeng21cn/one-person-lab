import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { readFamilySkillPacks } from '../../src/opl-skills.ts';
import { registerOplFamilyCodexPlugins } from '../../src/system-installation/codex-plugin-registry.ts';
import type { OplModuleId } from '../../src/system-installation/shared.ts';

test('OPL system skill sync catalog excludes MAS/MDS project-local stage skills', () => {
  const catalog = readFamilySkillPacks().skill_catalog;
  const domainIds = catalog.packs.map((pack) => pack.domain_id);
  const pluginNames = catalog.packs.map((pack) => pack.canonical_plugin_name);

  assert.deepEqual(domainIds, ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent']);
  assert.equal(domainIds.includes('meddeepscientist'), false);
  assert.equal(pluginNames.includes('deepscientist'), false);
  assert.equal(pluginNames.includes('opl-meta-agent'), true);
});

test('OPL Codex plugin registry removes standalone family MCP server blocks', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-plugin-registry-home-'));
  const reposRoot = path.join(homeRoot, 'repos');
  const repoPaths = new Map<OplModuleId, string>([
    ['medautoscience', path.join(reposRoot, 'med-autoscience')],
    ['medautogrant', path.join(reposRoot, 'med-autogrant')],
    ['redcube', path.join(reposRoot, 'redcube-ai')],
    ['oplmetaagent', path.join(reposRoot, 'opl-meta-agent-generated')],
  ]);

  try {
    for (const repoPath of repoPaths.values()) {
      fs.mkdirSync(path.join(repoPath, '.agents', 'plugins'), { recursive: true });
      fs.writeFileSync(
        path.join(repoPath, '.agents', 'plugins', 'marketplace.json'),
        '{"plugins":[]}\n',
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

    const selectedModules: OplModuleId[] = ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent'];
    const result = registerOplFamilyCodexPlugins(selectedModules, repoPaths, homeRoot);
    const config = fs.readFileSync(configPath, 'utf8');

    assert.equal(result.summary.registered, 4);
    assert.equal(result.summary.removed_standalone_mcp_servers, 2);
    assert.match(config, /\[mcp_servers\.sentrux\]/);
    assert.doesNotMatch(config, /\[mcp_servers\.redcube-ai\]/);
    assert.doesNotMatch(config, /\[mcp_servers\.med-autoscience\]/);
    assert.match(config, /\[plugins\."mas@mas-local"\]/);
    assert.match(config, /\[plugins\."mag@mag-local"\]/);
    assert.match(config, /\[plugins\."rca@rca-local"\]/);
    assert.match(config, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(config, new RegExp(`\\[marketplaces\\.mas-local\\]\\nsource_type = "local"\\nsource = "${repoPaths.get('medautoscience')!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(config, new RegExp(`\\[marketplaces\\.mag-local\\]\\nsource_type = "local"\\nsource = "${repoPaths.get('medautogrant')!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(config, new RegExp(`\\[marketplaces\\.rca-local\\]\\nsource_type = "local"\\nsource = "${repoPaths.get('redcube')!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(config, new RegExp(`\\[marketplaces\\.opl-meta-agent-local\\]\\nsource_type = "local"\\nsource = "${repoPaths.get('oplmetaagent')!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
