import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../src/kernel/json-file.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../../src/kernel/family-workspace-root.ts';
import {
  discoverFamilyRepoInputs,
  hasStandardDomainAgentSurface,
} from '../../src/kernel/standard-domain-agent-family-repos.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../src/modules/connect/opl-skills.ts';
import {
  binPath,
  createFakeCodexFixture,
  createFakeFamilySkillWorkspace,
  runCli,
  runEntryPathRaw,
} from './cli-codex-default-shell-helpers.ts';

test('opl connect skills discovers the family plugin packs through the configured sibling workspace root', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const stateDir = path.join(captureDir, 'opl-state');

  try {
    const output = runCli(['connect', 'skills'], {
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: stateDir,
    });

    assert.equal(output.skill_catalog.summary.total, 6);
    assert.equal(
      output.skill_catalog.summary.ready_to_sync,
      output.skill_catalog.packs.filter((entry: { ready_to_sync: boolean }) => entry.ready_to_sync).length,
    );
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { domain_id: string }) => entry.domain_id),
      ['medautoscience', 'medautogrant', 'redcube', 'oplmetaagent', 'oplbookforge', 'scholarskills'],
    );
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { canonical_plugin_name: string }) => entry.canonical_plugin_name),
      ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills'],
    );
    assert.match(output.skill_catalog.packs[0].plugin_manifest_path, /med-autoscience\/plugins\/med-autoscience\/\.codex-plugin\/plugin\.json$/);
    assert.match(output.skill_catalog.packs[0].skill_entry_path, /med-autoscience\/agent\/primary_skill\/SKILL\.md$/);
    assert.deepEqual(
      output.skill_catalog.packs.slice(0, 5).map((entry: { skill_entry_valid: boolean }) => entry.skill_entry_valid),
      [true, true, true, true, true],
    );
    for (const pack of output.skill_catalog.packs.slice(0, 5)) {
      assert.equal(pack.plugin_transport.primary_skill_projection.canonical_source_path, 'agent/primary_skill/SKILL.md');
      assert.equal(pack.plugin_transport.primary_skill_projection.carrier_materialization, 'materialized_full_skill_copy');
      assert.equal(pack.plugin_transport.primary_skill_projection.codex_install_requires_real_skill_md, true);
      assert.equal(pack.plugin_transport.primary_skill_projection.plugin_skill_may_be_stub_or_pointer, false);
      assert.equal(pack.plugin_transport.primary_skill_projection.carrier_is_membership_axis, false);
      assert.equal(pack.plugin_transport.primary_skill_projection.carrier_can_claim_domain_ready, false);
    }
    const metaPack = output.skill_catalog.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplmetaagent');
    assert.equal(metaPack?.plugin_manifest_found, true);
    assert.equal(metaPack?.installer_found, false);
    assert.equal(metaPack?.agent_series_membership, 'standard_domain_agent');
    assert.equal(metaPack?.agent_projection_policy.plugin_transport_is_membership_axis, false);
    assert.equal(metaPack?.generated_skill_surface_ready, true);
    assert.equal(metaPack?.source_kind, 'opl_standard_codex_carrier');
    assert.equal(metaPack?.source_kind_role, 'standard_source_model_not_agent_membership_or_status');
    assert.equal(metaPack?.management_model, 'opl_managed_codex_plugin_surface');
    assert.equal(metaPack?.management_model_role, 'unified_management_semantics_transport_may_differ');
    assert.equal(metaPack?.plugin_transport.source_kind, 'opl_standard_codex_carrier');
    assert.equal(metaPack?.plugin_transport.source_kind_role, 'standard_source_model_not_agent_membership_or_status');
    assert.equal(metaPack?.plugin_transport.standard_codex_carrier, true);
    assert.equal(metaPack?.plugin_transport.materializer, 'opl_standard_codex_plugin_materializer');
    assert.equal(metaPack?.ready_to_sync, true);
    assert.deepEqual(metaPack?.command_preview, ['opl', 'connect', 'sync-skills', '--domain', 'oplmetaagent']);
    assert.deepEqual(metaPack?.plugin_transport.generation_preview_command?.slice(0, 3), ['opl', 'agents', 'interfaces']);
    assert.equal(metaPack?.foundry_agent_series?.canonical_command_surface, 'opl agents foundry');
    assert.equal(metaPack?.foundry_agent_series?.default_foundry_command_surface, 'opl foundry agents inspect oma');
    assert.equal(metaPack?.command_surface_spine?.skill_sync_command_surface, 'opl connect sync-skills');
    assert.equal(metaPack?.mcp_projection?.mcp_descriptor_must_delegate_to_series_spine, true);
    assert.equal('legacy_implementation_bucket_policy' in metaPack, false);
    const bookforgePack = output.skill_catalog.packs.find((entry: { domain_id: string }) => entry.domain_id === 'oplbookforge');
    assert.equal(bookforgePack?.plugin_manifest_found, true);
    assert.equal(bookforgePack?.installer_found, false);
    assert.equal(bookforgePack?.agent_series_membership, 'standard_domain_agent');
    assert.equal(bookforgePack?.agent_projection_policy.plugin_transport_is_membership_axis, false);
    assert.equal(bookforgePack?.generated_skill_surface_ready, true);
    assert.equal(bookforgePack?.source_kind, 'opl_standard_codex_carrier');
    assert.equal(bookforgePack?.source_kind_role, 'standard_source_model_not_agent_membership_or_status');
    assert.equal(bookforgePack?.management_model, 'opl_managed_codex_plugin_surface');
    assert.equal(bookforgePack?.management_model_role, 'unified_management_semantics_transport_may_differ');
    assert.equal(bookforgePack?.plugin_transport.source_kind, 'opl_standard_codex_carrier');
    assert.equal(bookforgePack?.plugin_transport.source_kind_role, 'standard_source_model_not_agent_membership_or_status');
    assert.equal(bookforgePack?.plugin_transport.standard_codex_carrier, true);
    assert.equal(bookforgePack?.plugin_transport.materializer, 'opl_standard_codex_plugin_materializer');
    assert.equal(bookforgePack?.ready_to_sync, true);
    assert.deepEqual(bookforgePack?.command_preview, ['opl', 'connect', 'sync-skills', '--domain', 'oplbookforge']);
    assert.deepEqual(bookforgePack?.plugin_transport.generation_preview_command?.slice(0, 3), ['opl', 'agents', 'interfaces']);
    assert.equal(bookforgePack?.foundry_agent_series?.canonical_command_surface, 'opl agents foundry');
    assert.equal(bookforgePack?.foundry_agent_series?.default_foundry_command_surface, 'opl foundry agents inspect obf');
    assert.deepEqual(Object.keys(bookforgePack.foundry_agent_series).sort(), [
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
    ]);
    assert.equal(bookforgePack?.command_surface_spine?.work_alias, 'book');
    const scholarSkillsPack = output.skill_catalog.packs.find((entry: { domain_id: string }) => entry.domain_id === 'scholarskills');
    assert.equal(scholarSkillsPack?.distribution_role, 'framework_capability_plugin_pack');
    assert.equal(
      scholarSkillsPack?.capability_plugin_distribution?.default_sync_scope,
      'none_without_explicit_workspace_or_quest_target',
    );
    assert.equal(
      scholarSkillsPack?.ready_to_sync,
      scholarSkillsPack?.plugin_manifest_found && scholarSkillsPack?.skill_entry_valid,
    );
    assert.deepEqual(scholarSkillsPack?.command_preview, [
      'opl',
      'connect',
      'sync-skills',
      '--domain',
      'mas-scholar-skills',
      '--scope',
      'workspace',
      '--target-workspace',
      '<workspace-root>',
    ]);
    const previewOutput = runCli(metaPack.plugin_transport.generation_preview_command.slice(1), {
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: stateDir,
    });
    assert.equal(previewOutput.generated_agent_interfaces.status, 'ready');
    assert.match(
      JSON.stringify(previewOutput.generated_agent_interfaces),
      /npm run build-agent-baseline -- --output-dir <output_dir> --opl-bin <opl_bin> --ai-reviewer-evaluation <ai_reviewer_evaluation> --domain-id <domain_id> --domain-label <domain_label> --delivery-domain <delivery_domain> --target-brief <target_brief>/,
    );
    assert.doesNotMatch(JSON.stringify(previewOutput.generated_agent_interfaces), /bootstrap:sample/);
    assert.equal(fs.existsSync(syncLogPath), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('nested worktree repo roots resolve the family workspace root without OPL_FAMILY_WORKSPACE_ROOT', () => {
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/one-person-lab/.worktrees/codex-opl-turnkey'),
    '/tmp/workspace',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/med-autoscience/.worktrees/codex-mas-turnkey'),
    '/tmp/workspace',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/.worktrees/codex-family-agent-os-target'),
    '/tmp/workspace',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/_worktrees/codex-opl-turnkey'),
    '/tmp/workspace',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/unrelated/.worktrees/candidate'),
    '/tmp/workspace/unrelated',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/unrelated/_worktrees/candidate'),
    '/tmp/workspace/unrelated',
  );
  assert.equal(
    resolveFamilyWorkspaceRootFromRepoRoot('/tmp/workspace/one-person-lab'),
    '/tmp/workspace',
  );
});

test('relative git worktree metadata resolves the framework workspace root', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-relative-worktree-'));
  const candidate = path.join(workspaceRoot, 'one-person-lab', '.worktrees', 'candidate');
  try {
    fs.mkdirSync(candidate, { recursive: true });
    fs.writeFileSync(path.join(candidate, '.git'), 'gitdir: ../../.git/worktrees/candidate\n');
    assert.equal(resolveDefaultFamilyWorkspaceRoot({ repoRootHint: candidate }), workspaceRoot);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('family repo discovery includes sibling agents from a framework worktree', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-repo-worktree-'));
  const candidate = path.join(workspaceRoot, 'one-person-lab', '.worktrees', 'candidate');
  const domainRepo = path.join(workspaceRoot, 'med-autoscience');
  const previousCwd = process.cwd();
  const previousWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    fs.mkdirSync(candidate, { recursive: true });
    fs.writeFileSync(path.join(candidate, '.git'), 'gitdir: ../../.git/worktrees/candidate\n');
    fs.mkdirSync(path.join(domainRepo, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(domainRepo, 'contracts', 'domain_descriptor.json'), '{}\n');
    delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    process.chdir(candidate);

    assert.equal(discoverFamilyRepoInputs(
      [{ requested_agent_id: 'mas', directory: 'med-autoscience' }],
      hasStandardDomainAgentSurface,
    ).some((entry) => entry.requested_agent_id === 'mas'
      && entry.repo_dir === fs.realpathSync(domainRepo)), true);
  } finally {
    process.chdir(previousCwd);
    if (previousWorkspaceRoot === undefined) delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    else process.env.OPL_FAMILY_WORKSPACE_ROOT = previousWorkspaceRoot;
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('family repo discovery includes sibling agents from a standalone clone under framework worktrees', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-repo-standalone-'));
  const frameworkRepo = path.join(workspaceRoot, 'one-person-lab');
  const candidate = path.join(frameworkRepo, '.worktrees', 'candidate');
  const domainRepo = path.join(workspaceRoot, 'med-autoscience');
  const previousCwd = process.cwd();
  const previousWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    fs.mkdirSync(path.join(frameworkRepo, '.git'), { recursive: true });
    fs.mkdirSync(path.join(candidate, '.git'), { recursive: true });
    fs.mkdirSync(path.join(domainRepo, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(domainRepo, 'contracts', 'domain_descriptor.json'), '{}\n');
    delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    process.chdir(candidate);

    assert.equal(discoverFamilyRepoInputs(
      [{ requested_agent_id: 'mas', directory: 'med-autoscience' }],
      hasStandardDomainAgentSurface,
    ).some((entry) => entry.requested_agent_id === 'mas'
      && entry.repo_dir === fs.realpathSync(domainRepo)), true);
  } finally {
    process.chdir(previousCwd);
    if (previousWorkspaceRoot === undefined) delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    else process.env.OPL_FAMILY_WORKSPACE_ROOT = previousWorkspaceRoot;
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('opl connect skills discovers OPL-managed module installs without OPL_FAMILY_WORKSPACE_ROOT', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-managed-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const managedModulesRoot = path.join(stateDir, 'modules');
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const missingRepoRoot = path.join(homeRoot, 'missing-repo-root');

  try {
    fs.mkdirSync(managedModulesRoot, { recursive: true });
    fs.renameSync(
      path.join(workspaceRoot, 'med-autoscience'),
      path.join(managedModulesRoot, 'med-autoscience'),
    );

    const output = runCli(['connect', 'skills'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MEDAUTOGRANT_REPO_ROOT: path.join(missingRepoRoot, 'med-autogrant'),
      OPL_REDCUBE_REPO_ROOT: path.join(missingRepoRoot, 'redcube-ai'),
      OPL_OPLMETAAGENT_REPO_ROOT: path.join(missingRepoRoot, 'opl-meta-agent'),
      OPL_OPLBOOKFORGE_REPO_ROOT: path.join(missingRepoRoot, 'opl-bookforge'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: path.join(workspaceRoot, 'mas-scholar-skills'),
    });

    const medAutoScience = output.skill_catalog.packs.find(
      (entry: { domain_id: string }) => entry.domain_id === 'medautoscience',
    );
    assert.ok(medAutoScience);
    assert.equal(output.skill_catalog.summary.repo_found, 2);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 2);
    assert.equal(medAutoScience.repo_found, true);
    assert.equal(medAutoScience.ready_to_sync, true);
    assert.equal(
      medAutoScience.repo_root,
      path.join(managedModulesRoot, 'med-autoscience'),
    );
    const scholarSkills = output.skill_catalog.packs.find(
      (entry: { domain_id: string }) => entry.domain_id === 'scholarskills',
    );
    assert.ok(scholarSkills);
    assert.equal(scholarSkills.repo_found, true);
    assert.equal(scholarSkills.ready_to_sync, true);
    assert.equal(
      scholarSkills.repo_root,
      path.join(workspaceRoot, 'mas-scholar-skills'),
    );
    assert.equal(
      scholarSkills.capability_plugin_distribution.default_sync_scope,
      'none_without_explicit_workspace_or_quest_target',
    );
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('opl connect skills prefers managed roots over Full runtime module path overrides', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-full-runtime-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-full-home-'));
  const stateDir = path.join(homeRoot, 'opl-state');
  const managedModulesRoot = path.join(stateDir, 'modules');
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);

  try {
    fs.mkdirSync(managedModulesRoot, { recursive: true });
    fs.renameSync(
      path.join(workspaceRoot, 'redcube-ai'),
      path.join(managedModulesRoot, 'redcube-ai'),
    );
    const packagedRcaRoot = path.join(homeRoot, 'runtime', 'current', 'modules', 'rca');
    fs.mkdirSync(packagedRcaRoot, { recursive: true });

    const output = runCli(['connect', 'skills', '--domain', 'rca'], {
      HOME: homeRoot,
      OPL_STATE_DIR: stateDir,
      OPL_MODULE_PATH_REDCUBE: packagedRcaRoot,
    });

    assert.equal(output.skill_catalog.summary.repo_found, 1);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 1);
    assert.equal(output.skill_catalog.packs[0].domain_id, 'redcube');
    assert.equal(output.skill_catalog.packs[0].repo_root, path.join(managedModulesRoot, 'redcube-ai'));
    assert.deepEqual(output.skill_catalog.packs[0].command_preview, ['opl', 'connect', 'sync-skills', '--domain', 'redcube']);
    assert.equal(output.skill_catalog.packs[0].foundry_agent_series.canonical_command_surface, 'opl agents foundry');
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

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
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });
    const pack = output.skill_sync.packs[0];

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
    ].join('\n'),
    'utf8',
  );
  try {
    const output = runCli(['connect', 'sync-skills'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(output.skill_sync.summary.synced, 5);
    assert.equal(output.skill_sync.summary.skipped, 1);
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
    assert.equal(output.skill_sync.codex_plugin_registry.summary.registered, 5);
    assert.equal(output.skill_sync.codex_plugin_registry.summary.removed_standalone_mcp_servers, 1);
    const masPlugin = output.skill_sync.codex_plugin_registry.items.find(
      (entry: { plugin_id: string }) => entry.plugin_id === 'med-autoscience',
    );
    assert.ok(masPlugin);
    const masWrapperPluginPath = path.join(masPlugin.marketplace_root, 'plugins', 'med-autoscience');
    assert.equal(fs.lstatSync(masWrapperPluginPath).isSymbolicLink(), false);
    const masWrapperManifest = parseJsonText(fs.readFileSync(masPlugin.plugin_manifest_path, 'utf8')) as Record<string, any>;
    assert.equal(masWrapperManifest.name, 'med-autoscience');
    assert.equal(Array.isArray(masWrapperManifest.interface.defaultPrompt), true);
    assert.equal(masWrapperManifest.interface.defaultPrompt.length > 0, true);
    assert.equal(masWrapperManifest.interface.composerIcon, './assets/icon.svg');
    assert.equal(
      fs.readFileSync(path.join(masWrapperPluginPath, 'skills', 'med-autoscience', 'SKILL.md'), 'utf8')
        .includes('name: med-autoscience'),
      true,
    );
    assert.equal(fs.existsSync(path.join(masWrapperPluginPath, 'assets', 'icon.svg')), true);
    const stateDir = process.env.OPL_STATE_DIR
      ? path.resolve(process.env.OPL_STATE_DIR)
      : path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
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
    assert.equal(output.skill_sync.companion_skills.summary.total >= 6, true);
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
    assert.doesNotMatch(config, /\[mcp_servers\.redcube-ai\]/);
    assert.match(config, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
    assert.match(config, /\[plugins\."med-autogrant@med-autogrant-local"\]/);
    assert.match(config, /\[plugins\."redcube-ai@redcube-ai-local"\]/);
    assert.match(config, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    assert.match(config, /\[plugins\."opl-bookforge@opl-bookforge-local"\]/);
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
  const masManifestPath = path.join(workspaceRoot, 'med-autoscience', 'plugins', 'med-autoscience', '.codex-plugin', 'plugin.json');
  const masManifest = parseJsonText(fs.readFileSync(masManifestPath, 'utf8')) as Record<string, any>;
  masManifest.mcpServers = './.mcp.json';
  fs.writeFileSync(masManifestPath, `${JSON.stringify(masManifest, null, 2)}\n`, 'utf8');
  fs.mkdirSync(codexHome, { recursive: true });

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'mas'], {
      HOME: homeDir,
      CODEX_HOME: codexHome,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    const masPack = output.skill_sync.packs.find((entry: { canonical_plugin_name: string }) => entry.canonical_plugin_name === 'mas');
    assert.equal(masPack.sync_status, 'skipped');
    assert.equal(masPack.ready_to_sync, false);
    assert.equal(masPack.plugin_manifest_valid, false);
    assert.deepEqual(masPack.plugin_manifest_errors, ['standard_domain_agent_manifest_must_not_expose_standalone_mcp_servers']);
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

test('installed opl launcher syncs family skill packs before opening the raw Codex product entry', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launcher-skill-sync-'));
  const homeDir = path.join(captureDir, 'home');
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const { fixtureRoot, codexPath } = createFakeCodexFixture(`
echo "CODEX ENTRY"
exit 0
`);
  fs.mkdirSync(homeDir, { recursive: true });

  try {
    const result = runEntryPathRaw(binPath, [], {
      HOME: homeDir,
      OPL_CODEX_BIN: codexPath,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    });

    assert.equal(result.stdout, 'CODEX ENTRY\n');
    assert.equal(fs.existsSync(syncLogPath), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
