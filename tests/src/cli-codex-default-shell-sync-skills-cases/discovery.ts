import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonText } from '../../../src/kernel/json-file.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../../../src/kernel/family-workspace-root.ts';
import {
  discoverFamilyRepoInputs,
  hasStandardDomainAgentSurface,
} from '../../../src/kernel/standard-domain-agent-family-repos.ts';
import { resolveFamilyWorkspaceRootFromRepoRoot } from '../../../src/adapters/integration/opl-skills.ts';
import { listFamilySkillPackSpecs } from '../../../src/adapters/integration/opl-skills/registry.ts';

const STANDARD_AGENT_PACK_COUNT = listFamilySkillPackSpecs()
  .filter((spec) => spec.distribution_role === 'domain_agent_plugin_pack').length;
import {
  createFakeFamilySkillWorkspace,
  runCli,
  runCliFailure,
} from '../cli-codex-default-shell-helpers.ts';

test('opl connect skills discovers the family plugin packs through the configured sibling workspace root', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-list-'));
  const { workspaceRoot, syncLogPath } = createFakeFamilySkillWorkspace(captureDir);
  const stateDir = path.join(captureDir, 'opl-state');

  try {
    const output = runCli(['connect', 'skills'], {
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: stateDir,
    });

    assert.equal(
      output.skill_catalog.summary.total,
      listFamilySkillPackSpecs().length,
    );
    assert.equal(
      output.skill_catalog.summary.ready_to_sync,
      output.skill_catalog.packs.filter((entry: { ready_to_sync: boolean }) => entry.ready_to_sync).length,
    );
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { domain_id: string }) => entry.domain_id),
      listFamilySkillPackSpecs().map((spec) => spec.domain_id),
    );
    assert.deepEqual(
      output.skill_catalog.packs.map((entry: { canonical_plugin_name: string }) => entry.canonical_plugin_name),
      listFamilySkillPackSpecs().map((spec) => spec.canonical_plugin_name),
    );
    assert.match(output.skill_catalog.packs[0].plugin_manifest_path, /med-autoscience\/plugins\/med-autoscience\/plugin\.json$/);
    assert.match(output.skill_catalog.packs[0].skill_entry_path, /med-autoscience\/agent\/primary_skill\/SKILL\.md$/);
    assert.deepEqual(
      output.skill_catalog.packs
        .slice(0, STANDARD_AGENT_PACK_COUNT)
        .map((entry: { skill_entry_valid: boolean }) => entry.skill_entry_valid),
      listFamilySkillPackSpecs()
        .filter((spec) => spec.distribution_role === 'domain_agent_plugin_pack')
        .map(() => true),
    );
    for (const pack of output.skill_catalog.packs.slice(
      0,
      STANDARD_AGENT_PACK_COUNT,
    )) {
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
    assert.equal(metaPack?.foundry_agent_series?.canonical_command_surface, 'opl agents run');
    assert.equal(metaPack?.foundry_agent_series?.default_foundry_command_surface, 'opl agents run --domain oma --action <action_id>');
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
    assert.equal(bookforgePack?.foundry_agent_series?.canonical_command_surface, 'opl agents run');
    assert.equal(bookforgePack?.foundry_agent_series?.default_foundry_command_surface, 'opl agents run --domain obf --action <action_id>');
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
    assert.equal(bookforgePack?.command_surface_spine?.work_alias, 'work');
    const scholarSkillsPack = output.skill_catalog.packs.find((entry: { domain_id: string }) => entry.domain_id === 'scholarskills');
    assert.equal(scholarSkillsPack?.distribution_role, 'framework_capability_plugin_pack');
    assert.equal(
      scholarSkillsPack?.capability_plugin_distribution?.default_sync_scope,
      'package_activation_transaction_only',
    );
    assert.equal(
      scholarSkillsPack?.ready_to_sync,
      scholarSkillsPack?.plugin_manifest_found && scholarSkillsPack?.skill_entry_valid,
    );
    assert.deepEqual(scholarSkillsPack?.command_preview, [
      'opl',
      'packages',
      'activate',
      'mas',
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
    const generatedSkillDescriptor = previewOutput.generated_agent_interfaces.skill.descriptors[0];
    assert.match(
      generatedSkillDescriptor.command,
      /^opl agents run --domain oma --action engineer-agent --workspace /,
    );
    assert.deepEqual(generatedSkillDescriptor.execution_binding, {
      kind: 'foundry_binding',
      provider_manifest_ref: 'contracts/foundry_provider.json',
    });
    assert.doesNotMatch(JSON.stringify(previewOutput.generated_agent_interfaces), /npm run/);
    assert.doesNotMatch(JSON.stringify(previewOutput.generated_agent_interfaces), /bootstrap:sample/);
    assert.equal(fs.existsSync(syncLogPath), false);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
test('capability skill sync reads default and allowed scopes from the owner package manifest', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-owner-policy-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const manifestPath = path.join(workspaceRoot, 'mas-scholar-skills', 'opl-package.json');
  const stateDir = path.join(captureDir, 'opl-state');
  try {
    const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.connect_skill_sync_policy = {
      default_scope: 'quest',
      allowed_scopes: ['quest'],
      implicit_without_target: 'skip',
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    const env = { OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot, OPL_STATE_DIR: stateDir };
    const catalog = runCli(['connect', 'skills', '--domain', 'mas-scholar-skills'], env);
    assert.deepEqual(catalog.skill_catalog.packs[0].skill_sync_policy.allowed_scopes, ['quest']);
    const sync = runCli(['connect', 'sync-skills', '--domain', 'mas-scholar-skills'], env);
    assert.equal(sync.skill_sync.packs[0].sync_scope, 'quest');
    assert.equal(sync.skill_sync.packs[0].sync_status, 'skipped');
    const codex = runCli(['connect', 'sync-skills', '--domain', 'mas-scholar-skills', '--scope', 'codex'], env);
    assert.deepEqual(codex.skill_sync.packs[0].installer_result.allowed_scopes, ['quest']);
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
test('capability skill sync rejects an installed manifest without its owner policy', () => {
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-skill-missing-policy-'));
  const { workspaceRoot } = createFakeFamilySkillWorkspace(captureDir);
  const manifestPath = path.join(workspaceRoot, 'mas-scholar-skills', 'opl-package.json');
  try {
    const manifest = parseJsonText(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    delete manifest.connect_skill_sync_policy;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
    const failure = runCliFailure(['connect', 'skills', '--domain', 'mas-scholar-skills'], {
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_STATE_DIR: path.join(captureDir, 'state'),
    });
    assert.match(JSON.stringify(failure.payload), /missing a Connect skill sync policy/);
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
  const previousWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT;
  try {
    delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    fs.mkdirSync(candidate, { recursive: true });
    fs.writeFileSync(path.join(candidate, '.git'), 'gitdir: ../../.git/worktrees/candidate\n');
    assert.equal(resolveDefaultFamilyWorkspaceRoot({ repoRootHint: candidate }), workspaceRoot);
  } finally {
    if (previousWorkspaceRoot === undefined) delete process.env.OPL_FAMILY_WORKSPACE_ROOT;
    else process.env.OPL_FAMILY_WORKSPACE_ROOT = previousWorkspaceRoot;
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
      OPL_MEDAUTOCAST_REPO_ROOT: path.join(missingRepoRoot, 'med-autocast'),
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
      'package_activation_transaction_only',
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
    assert.equal(output.skill_catalog.packs[0].foundry_agent_series.canonical_command_surface, 'opl agents run');
  } finally {
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
