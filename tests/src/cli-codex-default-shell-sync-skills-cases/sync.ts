import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../../src/kernel/json-file.ts';
import { listFamilySkillPackSpecs } from '../../../src/adapters/integration/opl-skills-parts/registry.ts';

const STANDARD_AGENT_PACK_COUNT = listFamilySkillPackSpecs()
  .filter((spec) => spec.distribution_role === 'domain_agent_plugin_pack').length;
import {
  createFakeFamilySkillWorkspace,
  runCli,
  runCliFailure,
} from '../cli-codex-default-shell-helpers.ts';

test('opl connect sync-skills refuses to mirror legacy test skill stubs', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-invalid-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  fs.mkdirSync(homeDir, { recursive: true });
  const stubPath = path.join(
    workspaceRoot,
    'med-autoscience',
    'agent',
    'primary_skill',
    'SKILL.md',
  );
  fs.writeFileSync(stubPath, '---\nname: mas\ndescription: mas test skill\n---\n\n# mas\n');

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'medautoscience'], {
      HOME: homeDir,
      OPL_STATE_DIR: path.join(homeDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    const pack = output.skill_sync.packs[0];
    assert.equal(output.skill_sync.summary.synced, 0);
    assert.equal(output.skill_sync.summary.skipped, 1);
    assert.equal(pack.ready_to_sync, false);
    assert.equal(pack.skill_entry_valid, false);
    assert.deepEqual(pack.skill_entry_errors, [
      'legacy_test_skill_description',
      'legacy_test_skill_body',
      'plugin_carrier_skill_not_materialized_full_copy',
    ]);
    assert.equal(fs.existsSync(path.join(homeDir, '.codex', 'skills', 'mas')), false);
    assert.equal(fs.existsSync(syncLogPath), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
test('opl connect sync-skills never mirrors ScholarSkills into the user Codex scope', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-global-scope-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });

  try {
    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'codex',
    ], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });
    const pack = output.skill_sync.packs[0];

    assert.equal(output.skill_sync.summary.synced, 0);
    assert.equal(output.skill_sync.summary.skipped, 1);
    assert.equal(pack.sync_status, 'skipped');
    assert.equal(pack.installer_result.source, 'project_local_only');
    assert.deepEqual(pack.installer_result.allowed_scopes, ['workspace', 'quest']);
    assert.equal(pack.installer_result.global_codex_write, false);
    assert.equal(output.skill_sync.codex_plugin_registry, null);
    assert.equal(fs.existsSync(path.join(codexHome, 'skills', 'mas-scholar-skills')), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
test('opl connect sync-skills materializes only the ScholarSkills aggregate by default', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-core-only-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const targetWorkspace = path.join(captureDir, 'target-workspace');
  fs.mkdirSync(targetWorkspace, { recursive: true });

  try {
    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'workspace',
      '--target-workspace',
      targetWorkspace,
    ], {
      OPL_STATE_DIR: path.join(captureDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });
    const pack = output.skill_sync.packs[0];
    const localInstall = pack.installer_result.workspace_or_quest_local_skill;

    assert.equal(pack.sync_status, 'synced');
    assert.deepEqual(localInstall.materialized_skill_ids, ['mas-scholar-skills']);
    assert.equal(fs.existsSync(path.join(targetWorkspace, '.agents', 'skills', 'mas-scholar-skills', 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(targetWorkspace, '.agents', 'skills', 'medical-single-cell-modeling')), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills materializes one explicitly selected ScholarSkills specialist', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-selected-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const targetWorkspace = path.join(captureDir, 'target-workspace');
  fs.mkdirSync(targetWorkspace, { recursive: true });

  try {
    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--skill',
      'medical-single-cell-modeling',
      '--scope',
      'workspace',
      '--target-workspace',
      targetWorkspace,
    ], {
      OPL_STATE_DIR: path.join(captureDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });
    const localInstall = output.skill_sync.packs[0].installer_result.workspace_or_quest_local_skill;

    assert.deepEqual(localInstall.materialized_skill_ids, [
      'mas-scholar-skills',
      'medical-single-cell-modeling',
    ]);
    assert.equal(
      fs.existsSync(path.join(targetWorkspace, '.agents', 'skills', 'medical-single-cell-modeling', 'SKILL.md')),
      true,
    );
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills rejects an unknown ScholarSkills specialist', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholar-unknown-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const targetWorkspace = path.join(captureDir, 'target-workspace');
  fs.mkdirSync(targetWorkspace, { recursive: true });

  try {
    const failure = runCliFailure([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--skill',
      'medical-not-a-real-skill',
      '--scope',
      'workspace',
      '--target-workspace',
      targetWorkspace,
    ], {
      OPL_STATE_DIR: path.join(captureDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.deepEqual(failure.payload.error.details.selected_skill_ids, ['medical-not-a-real-skill']);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills materializes MAS without an overlay or repo installer', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-carrier-only-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  const masRoot = path.join(workspaceRoot, 'med-autoscience');

  fs.rmSync(path.join(masRoot, 'scripts', 'install-codex-plugin.sh'), { force: true });
  fs.rmSync(path.join(masRoot, 'overlay'), { recursive: true, force: true });
  fs.mkdirSync(codexHome, { recursive: true });

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'mas'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });
    const pack = output.skill_sync.packs[0];

    assert.deepEqual(output.skill_sync.compatibility_boundary, {
      mode: 'explicit_legacy_migration',
      automatic_invocation_allowed: false,
      steady_state_authority: 'opl_package_lifecycle',
    });
    assert.equal(pack.domain_id, 'medautoscience');
    assert.equal(pack.installer_found, false);
    assert.equal(pack.installer_path, '');
    assert.equal(pack.sync_status, 'synced');
    assert.equal(pack.installer_result.materialized_surface, 'repo_local_codex_plugin_carrier');
    assert.equal(
      fs.realpathSync(pack.installer_result.materialized_codex_plugin_carrier.primary_skill_source_path),
      fs.realpathSync(path.join(masRoot, 'agent', 'primary_skill', 'SKILL.md')),
    );
    assert.equal(fs.existsSync(path.join(masRoot, 'overlay')), false);
    assert.equal(fs.existsSync(path.join(masRoot, 'scripts', 'install-codex-plugin.sh')), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills registers tracked family plugin sources without writing domain repo marketplaces', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  const stateDir = path.join(homeDir, 'state');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
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
      '[mcp_servers.opl-connect]',
      'command = "/legacy/opl"',
      'args = ["retired-mcp"]',
      '',
      '[mcp_servers.opl-connect.env]',
      'LEGACY_OPL_CONNECT = "must-be-removed"',
      '',
      '[marketplaces.med-autoscience]',
      'source_type = "local"',
      `source = "${path.join(workspaceRoot, 'med-autoscience')}"`,
      '',
      '[plugins."med-autoscience@med-autoscience"]',
      'enabled = true',
      '',
      '[marketplaces.med-autogrant]',
      'source_type = "local"',
      `source = "${path.join(workspaceRoot, 'med-autogrant')}"`,
      '',
      '[plugins."med-autogrant@med-autogrant"]',
      'enabled = true',
      '',
      '[marketplaces.redcube-ai]',
      'source_type = "local"',
      `source = "${path.join(workspaceRoot, 'redcube-ai')}"`,
      '',
      '[plugins."redcube-ai@redcube-ai"]',
      'enabled = true',
      '',
      '[marketplaces.opl-meta-agent]',
      'source_type = "local"',
      `source = "${path.join(workspaceRoot, 'opl-meta-agent')}"`,
      '',
      '[plugins."opl-meta-agent@opl-meta-agent"]',
      'enabled = true',
      '',
      '[marketplaces.opl-bookforge]',
      'source_type = "local"',
      `source = "${path.join(workspaceRoot, 'opl-bookforge')}"`,
      '',
      '[plugins."opl-bookforge@opl-bookforge"]',
      'enabled = true',
      '',
    ].join('\n'),
    'utf8',
  );
  try {
    const output = runCli(['connect', 'sync-skills'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(
      output.skill_sync.summary.synced,
      STANDARD_AGENT_PACK_COUNT,
    );
    assert.equal(
      output.skill_sync.summary.skipped,
      listFamilySkillPackSpecs().filter((spec) => spec.distribution_role === 'framework_capability_plugin_pack').length,
    );
    assert.equal(fs.existsSync(syncLogPath), false);
    for (const [project, plugin] of [
      ['med-autoscience', 'med-autoscience'],
      ['med-autogrant', 'med-autogrant'],
      ['redcube-ai', 'redcube-ai'],
    ] as const) {
      assert.equal(fs.existsSync(path.join(workspaceRoot, project, '.agents', 'plugins', 'marketplace.json')), false);
      const pack = output.skill_sync.packs.find((entry: { project: string }) => entry.project === project);
      assert.equal(pack.installer_result.materialized_surface, 'repo_local_codex_plugin_carrier');
      assert.equal(
        fs.realpathSync(pack.installer_result.materialized_codex_plugin_carrier.primary_skill_source_path),
        fs.realpathSync(path.join(workspaceRoot, project, 'agent', 'primary_skill', 'SKILL.md')),
      );
      assert.match(
        pack.installer_result.materialized_codex_plugin_carrier.plugin_root,
        new RegExp(`codex-plugin-carriers/${plugin}-local/plugins/${plugin}$`),
      );
    }
    const metaGeneratedPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplmetaagent');
    const bookforgeGeneratedPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplbookforge');
    const scholarSkillsPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'scholarskills');
    assert.ok(metaGeneratedPack);
    assert.ok(bookforgeGeneratedPack);
    assert.ok(scholarSkillsPack);
    assert.equal(scholarSkillsPack.sync_status, 'skipped');
    assert.equal(scholarSkillsPack.sync_scope, 'workspace');
    assert.equal(scholarSkillsPack.installer_result.source, 'workspace_or_quest_local_codex_skill');
    assert.equal(scholarSkillsPack.installer_result.workspace_or_quest_local_skill.status, 'skipped');
    assert.equal(
      scholarSkillsPack.installer_result.workspace_or_quest_local_skill.skip_reason,
      'workspace_or_quest_target_required',
    );
    assert.equal(scholarSkillsPack.installer_result.workspace_or_quest_local_skill.target_scope, 'workspace');
    assert.equal(scholarSkillsPack.installer_result.workspace_or_quest_local_skill.target_root, null);
    assert.equal(
      fs.existsSync(path.join(workspaceRoot, 'med-autoscience', 'plugins', 'mas-scholar-skills', 'skills', 'mas-scholar-skills', 'SKILL.md')),
      false,
    );
    assert.equal(metaGeneratedPack.installer_result.materialized_surface, 'repo_local_codex_plugin_carrier');
    assert.match(
      metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.plugin_root,
      /codex-plugin-carriers\/opl-meta-agent-local\/plugins\/opl-meta-agent$/,
    );
    assert.equal(
      fs.existsSync(metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.plugin_manifest_path),
      true,
    );
    assert.equal(
      fs.existsSync(metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.marketplace_path),
      true,
    );
    assert.equal(
      fs.existsSync(metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.codex_plugin_cache_path),
      true,
    );
    const generatedPluginProvenance = parseJsonText(fs.readFileSync(
      metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.carrier_provenance_path,
      'utf8',
    )) as Record<string, any>;
    assert.equal(generatedPluginProvenance.surface_kind, 'opl_standard_primary_skill_carrier_projection');
    assert.equal(generatedPluginProvenance.carrier_materialization, 'materialized_full_skill_copy');
    assert.equal(generatedPluginProvenance.codex_install_requires_real_skill_md, true);
    assert.equal(generatedPluginProvenance.plugin_skill_may_be_stub_or_pointer, false);
    assert.equal(generatedPluginProvenance.authority_boundary.plugin_transport_is_membership_axis, false);
    assert.equal(generatedPluginProvenance.authority_boundary.carrier_surface_can_claim_domain_ready, false);
    assert.equal(
      fs.existsSync(path.join(
        metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.codex_plugin_cache_path,
        'opl-carrier.json',
      )),
      true,
    );
    const generatedPluginManifest = parseJsonText(fs.readFileSync(
      metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.plugin_manifest_path,
      'utf8',
    )) as Record<string, any>;
    assert.equal(generatedPluginManifest.name, 'opl-meta-agent');
    const generatedOmaSkill = fs.readFileSync(metaGeneratedPack.installer_result.materialized_codex_plugin_carrier.skill_entry_path, 'utf8');
    assert.equal(generatedOmaSkill, fs.readFileSync(path.join(workspaceRoot, 'opl-meta-agent', 'agent', 'primary_skill', 'SKILL.md'), 'utf8'));
    assert.equal(bookforgeGeneratedPack.installer_result.materialized_surface, 'repo_local_codex_plugin_carrier');
    assert.match(
      bookforgeGeneratedPack.installer_result.materialized_codex_plugin_carrier.plugin_root,
      /codex-plugin-carriers\/opl-bookforge-local\/plugins\/opl-bookforge$/,
    );
    const generatedBookForgeManifest = parseJsonText(fs.readFileSync(
      bookforgeGeneratedPack.installer_result.materialized_codex_plugin_carrier.plugin_manifest_path,
      'utf8',
    )) as Record<string, any>;
    assert.equal(generatedBookForgeManifest.name, 'opl-bookforge');
    const generatedBookForgeSkill = fs.readFileSync(bookforgeGeneratedPack.installer_result.materialized_codex_plugin_carrier.skill_entry_path, 'utf8');
    assert.equal(generatedBookForgeSkill, fs.readFileSync(path.join(workspaceRoot, 'opl-bookforge', 'agent', 'primary_skill', 'SKILL.md'), 'utf8'));
    assert.equal(output.skill_sync.codex_plugin_registry.surface_id, 'opl_codex_plugin_registry');
    assert.equal(output.skill_sync.codex_plugin_registry.summary.registered, STANDARD_AGENT_PACK_COUNT);
    assert.equal('removed_standalone_mcp_servers' in output.skill_sync.codex_plugin_registry.summary, false);
    assert.equal(output.skill_sync.codex_plugin_registry.summary.removed_superseded_plugin_tables, 10);
    assert.equal(output.skill_sync.codex_plugin_registry.summary.registered_unified_mcp_servers, 1);
    assert.equal(output.skill_sync.codex_plugin_registry.unified_mcp_server.server_id, 'opl-connect');
    assert.deepEqual(output.skill_sync.codex_plugin_registry.unified_mcp_server.args, ['connect', 'mcp-stdio']);
    const masPlugin = output.skill_sync.codex_plugin_registry.items.find(
      (entry: { plugin_id: string }) => entry.plugin_id === 'med-autoscience',
    );
    assert.ok(masPlugin);
    const masWrapperPluginPath = path.join(masPlugin.marketplace_root, 'plugins', 'med-autoscience');
    assert.equal(fs.lstatSync(masWrapperPluginPath).isSymbolicLink(), false);
    const masWrapperManifest = parseJsonText(fs.readFileSync(masPlugin.plugin_manifest_path, 'utf8')) as Record<string, any>;
    const masWrapperInterface = masWrapperManifest.extensions['com.openai'].interface;
    assert.equal(masWrapperManifest.name, 'med-autoscience');
    assert.equal(Array.isArray(masWrapperInterface.defaultPrompt), true);
    assert.equal(masWrapperInterface.defaultPrompt.length > 0, true);
    assert.equal(masWrapperInterface.composerIcon, './assets/icon.svg');
    assert.equal(
      fs.readFileSync(path.join(masWrapperPluginPath, 'skills', 'med-autoscience', 'SKILL.md'), 'utf8')
        .includes('name: med-autoscience'),
      true,
    );
    assert.equal(fs.existsSync(path.join(masWrapperPluginPath, 'assets', 'icon.svg')), true);
    for (const item of output.skill_sync.codex_plugin_registry.items) {
      assert.equal(
        item.marketplace_root,
        path.join(stateDir, 'codex-plugin-marketplaces', item.marketplace_id),
      );
      assert.equal(fs.existsSync(item.marketplace_path), true);
      assert.equal(fs.existsSync(item.plugin_manifest_path), true);
    }
    assert.equal(output.skill_sync.companion_skills.surface_id, 'opl_companion_skill_sync');
    assert.equal(output.skill_sync.companion_skills.mode, 'observe');
    assert.equal(output.skill_sync.companion_skills.summary.total, 0);
    for (const skillName of ['mas', 'mag', 'rca', 'oma', 'obf', 'med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-meta-agent', 'opl-bookforge']) {
      assert.equal(fs.existsSync(path.join(homeDir, '.codex', 'skills', skillName, 'SKILL.md')), false);
    }
    for (const skillName of ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-meta-agent', 'opl-bookforge']) {
      assert.equal(
        fs.existsSync(path.join(
          homeDir,
          '.codex',
          'plugins',
          'cache',
          `${skillName}-local`,
          skillName,
          '0.1.0',
          'skills',
          skillName,
          'SKILL.md',
        )),
        true,
      );
    }
    const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    assert.match(config, /\[mcp_servers\.sentrux\]/);
    assert.match(config, /\[mcp_servers\.redcube-ai\]/);
    assert.match(config, /\[mcp_servers\.opl-connect\]\ncommand = "opl"\nargs = \["connect", "mcp-stdio"\]/);
    assert.doesNotMatch(config, /retired-mcp|\/legacy\/opl|LEGACY_OPL_CONNECT/);
    assert.match(config, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
    assert.match(config, /\[plugins\."med-autogrant@med-autogrant-local"\]/);
    assert.match(config, /\[plugins\."redcube-ai@redcube-ai-local"\]/);
    assert.match(config, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(config, /\[plugins\."opl-bookforge@opl-bookforge-local"\]/);
    assert.doesNotMatch(config, /\[plugins\."med-autoscience@med-autoscience"\]/);
    assert.doesNotMatch(config, /\[plugins\."med-autogrant@med-autogrant"\]/);
    assert.doesNotMatch(config, /\[plugins\."redcube-ai@redcube-ai"\]/);
    assert.doesNotMatch(config, /\[plugins\."opl-meta-agent@opl-meta-agent"\]/);
    assert.doesNotMatch(config, /\[plugins\."opl-bookforge@opl-bookforge"\]/);
    assert.doesNotMatch(config, /\[plugins\."mas-scholar-skills@mas-scholar-skills-local"\]/);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills refuses standard agent plugin MCP drift', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-mcp-drift-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  const masManifestPath = path.join(workspaceRoot, 'med-autoscience', 'plugins', 'med-autoscience', 'plugin.json');
  const masManifest = parseJsonText(fs.readFileSync(masManifestPath, 'utf8')) as Record<string, any>;
  masManifest.mcpServers = './.mcp.json';
  fs.writeFileSync(masManifestPath, `${JSON.stringify(masManifest, null, 2)}\n`, 'utf8');
  fs.mkdirSync(codexHome, { recursive: true });

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'mas'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    const masPack = output.skill_sync.packs.find((entry: { canonical_plugin_name: string }) => entry.canonical_plugin_name === 'mas');
    assert.equal(masPack.sync_status, 'skipped');
    assert.equal(masPack.ready_to_sync, false);
    assert.equal(masPack.plugin_manifest_valid, false);
    assert.deepEqual(masPack.plugin_manifest_errors, [
      'standard_domain_agent_manifest_must_not_expose_standalone_mcp_servers',
      'plugin_manifest_nonconformant_nonfatal:unknown_top_level_field:mcpServers',
    ]);
    assert.equal(output.skill_sync.codex_plugin_registry, null);
    assert.equal(fs.existsSync(path.join(codexHome, 'config.toml')), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect sync-skills follows Developer Mode sibling checkouts over managed module copies', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-sync-devmode-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const modulesRoot = path.join(captureDir, 'managed-modules');
  const { workspaceRoot: managedWorkspaceRoot } = createFakeFamilySkillWorkspace(path.join(captureDir, 'managed-capture'));
  const homeDir = path.join(captureDir, 'home');
  const codexHome = path.join(homeDir, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(modulesRoot, { recursive: true });
  fs.renameSync(path.join(managedWorkspaceRoot, 'med-autoscience'), path.join(modulesRoot, 'med-autoscience'));
  fs.renameSync(path.join(managedWorkspaceRoot, 'med-autogrant'), path.join(modulesRoot, 'med-autogrant'));
  fs.renameSync(path.join(managedWorkspaceRoot, 'redcube-ai'), path.join(modulesRoot, 'redcube-ai'));
  fs.renameSync(path.join(managedWorkspaceRoot, 'opl-meta-agent'), path.join(modulesRoot, 'opl-meta-agent'));
  fs.rmSync(managedWorkspaceRoot, { recursive: true, force: true });

  try {
    const output = runCli(['connect', 'sync-skills'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(homeDir, 'state'),
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_MODULES_ROOT: modulesRoot,
      OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ login: 'gaofeng21cn' }),
    });

    for (const [project, plugin] of [
      ['med-autoscience', 'med-autoscience'],
      ['med-autogrant', 'med-autogrant'],
      ['redcube-ai', 'redcube-ai'],
    ] as const) {
      const pack = output.skill_sync.packs.find((entry: { project: string }) => entry.project === project);
      assert.equal(
        fs.realpathSync(pack.installer_result.materialized_codex_plugin_carrier.primary_skill_source_path),
        fs.realpathSync(path.join(workspaceRoot, project, 'agent', 'primary_skill', 'SKILL.md')),
      );
      const registryItem = output.skill_sync.codex_plugin_registry.items.find(
        (entry: { plugin_id: string }) => entry.plugin_id === plugin,
      );
      const wrapperPluginRoot = path.join(registryItem.marketplace_root, 'plugins', plugin);
      const wrapperManifest = parseJsonText(fs.readFileSync(path.join(wrapperPluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')) as Record<string, any>;
      const wrapperSkill = fs.readFileSync(path.join(wrapperPluginRoot, 'skills', plugin, 'SKILL.md'), 'utf8');
      assert.equal(wrapperManifest.name, plugin);
      assert.match(wrapperSkill, new RegExp(`^name:\\s*${plugin}$`, 'm'));
    }
    const scholarSkillsPack = output.skill_sync.packs.find((entry: { domain_id: string }) => entry.domain_id === 'scholarskills');
    assert.equal(scholarSkillsPack.sync_status, 'skipped');
    assert.equal(scholarSkillsPack.sync_scope, 'workspace');
    assert.equal(
      fs.existsSync(path.join(workspaceRoot, 'med-autoscience', 'plugins', 'mas-scholar-skills', 'skills', 'mas-scholar-skills', 'SKILL.md')),
      false,
    );
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
