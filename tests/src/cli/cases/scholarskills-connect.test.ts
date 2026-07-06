import { assert, fs, os, path, repoRoot, runCli, test, parseJsonText } from '../helpers.ts';
import {
  MAS_SCHOLAR_SKILLS_DEFAULT_PACK_IDS,
  MAS_SCHOLAR_SKILLS_REQUIRED_PACK_IDS,
  MAS_SCHOLAR_SKILLS_SPECIALIST_PACK_IDS,
} from '../../../../src/modules/connect/opl-skills-parts/scholarskills-profile.ts';

function createScholarSkillsRepoFixture(options: { specialistSkills?: readonly string[] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-source-'));
  const pluginDir = path.join(root, '.codex-plugin');
  const skillDir = path.join(root, 'skills', 'mas-scholar-skills');
  const galleryDir = path.join(root, 'gallery', 'medical-display');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(galleryDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'outputs', 'display-pack-gallery'), { recursive: true });
  fs.mkdirSync(path.join(galleryDir, 'assets'), { recursive: true });

  fs.cpSync(
    path.join(repoRoot, 'plugins', 'mas-scholar-skills', '.codex-plugin', 'plugin.json'),
    path.join(pluginDir, 'plugin.json'),
  );
  fs.cpSync(
    path.join(repoRoot, 'plugins', 'mas-scholar-skills', 'skills', 'mas-scholar-skills', 'SKILL.md'),
    path.join(skillDir, 'SKILL.md'),
  );
  for (const specialistSkill of options.specialistSkills ?? []) {
    const specialistDir = path.join(root, 'skills', specialistSkill);
    fs.mkdirSync(specialistDir, { recursive: true });
    fs.writeFileSync(
      path.join(specialistDir, 'SKILL.md'),
      `---\nname: ${specialistSkill}\ndescription: Fixture ${specialistSkill} skill.\n---\n\n# ${specialistSkill}\n`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(specialistDir, 'kernel.py'),
      `print("fixture kernel for ${specialistSkill}")\n`,
      'utf8',
    );
  }
  fs.writeFileSync(
    path.join(root, 'contracts', 'scholar-skills-capability-modules.json'),
    JSON.stringify({ fixture: 'external-repo-contract' }, null, 2),
    'utf8',
  );
  fs.writeFileSync(path.join(galleryDir, 'medical_display_gallery.pdf'), 'fixture pdf\n', 'utf8');
  fs.writeFileSync(path.join(galleryDir, 'gallery_snapshot.json'), '{"fixture":true}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'outputs', 'display-pack-gallery', 'tmp.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(galleryDir, 'assets', 'tmp.png'), 'png\n', 'utf8');
  fs.writeFileSync(path.join(root, '.git'), 'not a copied directory\n', 'utf8');

  return root;
}

test('connect skills exposes MAS Scholar Skills as a framework-owned capability plugin pack', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  try {
    const output = runCli(['connect', 'skills', '--domain', 'scholarskills'], {
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
    }) as {
      skill_catalog: {
        packs: Array<{
          domain_id: string;
          canonical_plugin_name: string;
          distribution_role: string;
          project: string;
          plugin_source_path: string;
          plugin_manifest_path: string;
          skill_entry_path: string;
          repo_root: string;
          ready_to_sync: boolean;
          capability_plugin_distribution: {
            surface_kind: string;
            capability_plugin_id: string;
            ownership_kind: string;
            github_repo: string;
            source_of_truth: string[];
            connect_readback_commands: string[];
            default_sync_scope: string;
            default_target_project: string | null;
            recommended_paper_execution_scopes: string[];
            project_mirror_deprecated_for_paper_execution: boolean;
            project_mirror_non_default_paper_execution_path: boolean;
            project_scope_requires_explicit_request: boolean;
            codex_scope_requires_explicit_request: boolean;
            profile_driven_sync_model: {
              profile_owner: string;
              connect_role: string;
              manifest_projection_ref: string;
              source_status_values: string[];
            };
            framework_owned_capability: boolean;
            domain_module: boolean;
            brand_module: boolean;
            authority_boundary: {
              can_write_domain_truth: boolean;
              can_sign_owner_receipt: boolean;
              can_create_typed_blocker: boolean;
              can_write_runtime_queue: boolean;
              can_write_owner_receipt: boolean;
              can_write_paper_body: boolean;
              can_write_artifact_authority: boolean;
              can_authorize_publication_readiness: boolean;
            };
          };
          mas_scholar_skills_profile: {
            surface_kind: string;
            profile_id: string;
            profile_driver: {
              owner: string;
              connect_role: string;
              connect_does_not_own_quality_or_domain_truth: boolean;
            };
            required_skill_pack: string[];
            default_skill_pack: string[];
            install_target: {
              target_scope: string;
              target_root: string | null;
              install_root: string | null;
              system_codex_skill_install_default: boolean;
            };
            source: {
              source_repo_path: string;
              plugin_source_path: string;
              source_role: string;
              canonical_source_repo_path: string;
              plugin_mirror_path: string | null;
              mirror_or_cache_is_not_skill_completeness_authority: boolean;
            };
            packs: Array<{
              pack_id: string;
              source_role: string;
              source_status: string;
              resolved_source_path: string;
              installed: boolean;
              install_target_skill_root: string | null;
            }>;
            authority_boundary: {
              can_write_domain_truth: boolean;
              can_sign_owner_receipt: boolean;
              can_create_typed_blocker: boolean;
              can_write_runtime_queue: boolean;
              can_write_owner_receipt: boolean;
              can_write_paper_body: boolean;
              can_write_artifact_authority: boolean;
              can_authorize_publication_readiness: boolean;
            };
          };
        }>;
        summary: {
          total: number;
          ready_to_sync: number;
        };
      };
    };

    assert.equal(output.skill_catalog.summary.total, 1);
    assert.equal(output.skill_catalog.summary.ready_to_sync, 1);
    const pack = output.skill_catalog.packs[0];
    assert.equal(pack.domain_id, 'scholarskills');
    assert.equal(pack.project, 'mas-scholar-skills');
    assert.equal(pack.canonical_plugin_name, 'mas-scholar-skills');
    assert.equal(pack.distribution_role, 'framework_capability_plugin_pack');
    assert.equal(pack.ready_to_sync, true);
    assert.equal(pack.repo_root, sourceRoot);
    assert.equal(pack.plugin_source_path, sourceRoot);
    assert.equal(pack.plugin_manifest_path, path.join(sourceRoot, '.codex-plugin', 'plugin.json'));
    assert.equal(pack.skill_entry_path, path.join(sourceRoot, 'skills', 'mas-scholar-skills', 'SKILL.md'));
    assert.equal(pack.capability_plugin_distribution.surface_kind, 'opl_framework_capability_plugin_distribution');
    assert.equal(pack.capability_plugin_distribution.capability_plugin_id, 'mas-scholar-skills');
    assert.equal(pack.capability_plugin_distribution.ownership_kind, 'framework_capability_plugin');
    assert.equal(pack.capability_plugin_distribution.github_repo, 'gaofeng21cn/mas-scholar-skills');
    assert.equal(pack.capability_plugin_distribution.source_of_truth.includes('mas-scholar-skills/.codex-plugin/plugin.json'), true);
    assert.equal(pack.capability_plugin_distribution.default_sync_scope, 'none_without_explicit_workspace_or_quest_target');
    assert.equal(pack.capability_plugin_distribution.default_target_project, null);
    assert.deepEqual(pack.capability_plugin_distribution.recommended_paper_execution_scopes, [
      'workspace',
      'quest',
    ]);
    assert.equal(pack.capability_plugin_distribution.project_mirror_deprecated_for_paper_execution, true);
    assert.equal(pack.capability_plugin_distribution.project_mirror_non_default_paper_execution_path, true);
    assert.equal(pack.capability_plugin_distribution.project_scope_requires_explicit_request, true);
    assert.equal(
      pack.capability_plugin_distribution.connect_readback_commands.includes(
        'opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace-root> --json',
      ),
      true,
    );
    assert.equal(
      pack.capability_plugin_distribution.connect_readback_commands.includes(
        'opl connect sync-skills --domain mas-scholar-skills --scope quest --target-quest <quest-root> --json',
      ),
      true,
    );
    assert.equal(pack.capability_plugin_distribution.codex_scope_requires_explicit_request, true);
    assert.equal(pack.capability_plugin_distribution.profile_driven_sync_model.profile_owner, 'MAS profile/overlay');
    assert.equal(pack.capability_plugin_distribution.profile_driven_sync_model.connect_role, 'install_sync_discovery_only');
    assert.equal(
      pack.capability_plugin_distribution.profile_driven_sync_model.manifest_projection_ref,
      'skill_catalog.packs[].mas_scholar_skills_profile',
    );
    assert.deepEqual(pack.capability_plugin_distribution.profile_driven_sync_model.source_status_values, [
      'materialized',
      'available-but-not-materialized',
      'source-missing',
    ]);
    assert.equal(pack.mas_scholar_skills_profile.surface_kind, 'opl_mas_scholar_skills_profile_sync_manifest');
    assert.equal(pack.mas_scholar_skills_profile.profile_id, 'mas_scholar_skills_sync_profile.v1');
    assert.equal(pack.mas_scholar_skills_profile.profile_driver.owner, 'MAS profile/overlay');
    assert.equal(pack.mas_scholar_skills_profile.profile_driver.connect_role, 'install_sync_discovery_only');
    assert.equal(pack.mas_scholar_skills_profile.profile_driver.connect_does_not_own_quality_or_domain_truth, true);
    assert.deepEqual(pack.mas_scholar_skills_profile.required_skill_pack, MAS_SCHOLAR_SKILLS_REQUIRED_PACK_IDS);
    assert.deepEqual(
      pack.mas_scholar_skills_profile.default_skill_pack,
      MAS_SCHOLAR_SKILLS_DEFAULT_PACK_IDS,
    );
    assert.equal(pack.mas_scholar_skills_profile.install_target.target_scope, 'inspect');
    assert.equal(pack.mas_scholar_skills_profile.install_target.target_root, null);
    assert.equal(pack.mas_scholar_skills_profile.install_target.install_root, null);
    assert.equal(pack.mas_scholar_skills_profile.install_target.system_codex_skill_install_default, false);
    assert.equal(pack.mas_scholar_skills_profile.source.source_repo_path, sourceRoot);
    assert.equal(pack.mas_scholar_skills_profile.source.plugin_source_path, sourceRoot);
    assert.equal(pack.mas_scholar_skills_profile.source.source_role, 'canonical_source_repo');
    assert.equal(pack.mas_scholar_skills_profile.source.canonical_source_repo_path, sourceRoot);
    assert.equal(pack.mas_scholar_skills_profile.source.plugin_mirror_path, null);
    assert.equal(pack.mas_scholar_skills_profile.source.mirror_or_cache_is_not_skill_completeness_authority, true);
    const profilePacks = new Map(pack.mas_scholar_skills_profile.packs.map((entry) => [entry.pack_id, entry]));
    assert.equal(profilePacks.get('mas-scholar-skills')?.source_status, 'materialized');
    assert.equal(profilePacks.get('mas-scholar-skills')?.source_role, 'canonical_source_repo');
    assert.equal(
      profilePacks.get('mas-scholar-skills')?.resolved_source_path,
      path.join(sourceRoot, 'skills', 'mas-scholar-skills', 'SKILL.md'),
    );
    assert.equal(profilePacks.get('mas-scholar-skills')?.installed, false);
    for (const packId of MAS_SCHOLAR_SKILLS_SPECIALIST_PACK_IDS) {
      assert.equal(profilePacks.get(packId)?.source_status, 'source-missing');
      assert.equal(profilePacks.get(packId)?.installed, false);
    }
    assert.deepEqual(pack.mas_scholar_skills_profile.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_owner_receipt: false,
      can_write_paper_body: false,
      can_write_artifact_authority: false,
      can_authorize_publication_readiness: false,
    });
    assert.equal(pack.capability_plugin_distribution.framework_owned_capability, true);
    assert.equal(pack.capability_plugin_distribution.domain_module, false);
    assert.equal(pack.capability_plugin_distribution.brand_module, false);
    assert.deepEqual(pack.capability_plugin_distribution.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills finds canonical sibling MAS Scholar Skills checkout without env override', () => {
  const familyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-family-root-'));
  const sourceRoot = createScholarSkillsRepoFixture();
  const siblingRoot = path.join(familyRoot, 'mas-scholar-skills');
  const homeRoot = path.join(familyRoot, 'home');
  const workspaceRoot = path.join(familyRoot, 'paper-workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.renameSync(sourceRoot, siblingRoot);

  try {
    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'mas-scholar-skills',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
      '--home',
      homeRoot,
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_FAMILY_WORKSPACE_ROOT: familyRoot,
      OPL_MODULES_ROOT: path.join(homeRoot, 'missing-managed-modules'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: '',
      OPL_SCHOLARSKILLS_REPO_ROOT: '',
      OPL_MODULE_PATH_SCHOLARSKILLS: '',
      OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS: '',
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          repo_root: string;
          sync_status: string;
          installer_result: {
            workspace_or_quest_local_skill: {
              install_receipt: {
                source_repo_path: string;
              };
            };
          };
        }>;
      };
    };

    const pack = output.skill_sync.packs[0];
    assert.equal(fs.realpathSync(pack.repo_root), fs.realpathSync(siblingRoot));
    assert.equal(pack.sync_status, 'synced');
    assert.equal(
      fs.realpathSync(pack.installer_result.workspace_or_quest_local_skill.install_receipt.source_repo_path),
      fs.realpathSync(siblingRoot),
    );
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', 'mas-scholar-skills', 'SKILL.md')), true);
  } finally {
    fs.rmSync(familyRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills without a target does not install ScholarSkills to MAS or system Codex', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-connect-home-'));
  const masRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-mas-root-'));

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'scholarskills', '--home', homeRoot], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
      OPL_MEDAUTOSCIENCE_REPO_ROOT: masRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          domain_id: string;
          sync_status: string;
          sync_scope: string;
          target_scope: string;
          target_project: null;
          target_root: null;
          workspace_or_quest_local_skill_root: null;
          codex_discovery_kind: string;
          installer_result: {
            source: string;
            workspace_or_quest_local_skill: {
              status: string;
              skip_reason: string;
              target_scope: string;
              target_root: null;
              required: string[];
            };
          };
        }>;
        codex_plugin_registry: null;
      };
    };

    assert.equal(output.skill_sync.codex_plugin_registry, null);
    assert.equal(output.skill_sync.packs.length, 1);
    const pack = output.skill_sync.packs[0];
    assert.equal(pack.domain_id, 'scholarskills');
    assert.equal(pack.sync_status, 'skipped');
    assert.equal(pack.sync_scope, 'workspace');
    assert.equal(pack.target_scope, 'workspace');
    assert.equal(pack.target_project, null);
    assert.equal(pack.target_root, null);
    assert.equal(pack.workspace_or_quest_local_skill_root, null);
    assert.equal(pack.codex_discovery_kind, 'workspace_or_quest_local_skill');
    assert.equal(pack.installer_result.source, 'workspace_or_quest_local_codex_skill');
    assert.equal(pack.installer_result.workspace_or_quest_local_skill.status, 'skipped');
    assert.equal(
      pack.installer_result.workspace_or_quest_local_skill.skip_reason,
      'workspace_or_quest_target_required',
    );
    assert.deepEqual(pack.installer_result.workspace_or_quest_local_skill.required, [
      '--target-workspace <path> or --target-root <path>',
    ]);
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'mas-scholar-skills')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'mas-scholar-skills', 'SKILL.md')), false);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills installs MAS Scholar Skills to the MAS project-local plugin mirror only with explicit project scope', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-connect-home-'));
  const masRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-mas-root-'));

  try {
    const modules = runCli(['connect', 'modules']) as {
      modules: {
        items: Array<{ module_id: string }>;
      };
    };
    assert.equal(modules.modules.items.some((module) => module.module_id === 'scholarskills'), false);

    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'project',
      '--target-project',
      'medautoscience',
      '--home',
      homeRoot,
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
      OPL_MEDAUTOSCIENCE_REPO_ROOT: masRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          domain_id: string;
          sync_status: string;
          sync_scope: string;
          target_scope: string;
          target_project: string;
          target_root: string;
          workspace_or_quest_local_skill_root: null;
          codex_discovery_kind: string;
          project_mirror_deprecated_for_paper_execution: boolean;
          project_mirror_non_default_paper_execution_path: boolean;
          registry_repo_root: string | null;
          installer_result: {
            source: string;
            plugin_source_path: string;
            project_local_skill_mirror: {
              status: string;
              target_scope: string;
              target_project: string;
              target_repo_root: string;
              project_local_plugin_root: string;
              project_local_plugin_manifest_path: string;
              project_local_skill_entry_path: string;
              project_mirror_deprecated_for_paper_execution: boolean;
              project_mirror_non_default_paper_execution_path: boolean;
              project_local_git_exclude: {
                status: string;
                exclude_path: string | null;
                pattern: string;
              };
              project_local_copy: {
                copy_policy: string;
                copied_roots: string[];
                excluded_roots: string[];
              };
              authority_boundary: {
                can_write_domain_truth: boolean;
                can_sign_owner_receipt: boolean;
                can_create_typed_blocker: boolean;
                can_write_runtime_queue: boolean;
                can_write_owner_receipt: boolean;
                can_write_paper_body: boolean;
                can_write_artifact_authority: boolean;
                can_authorize_publication_readiness: boolean;
              };
            };
          };
        }>;
        codex_plugin_registry: null;
      };
    };

    assert.equal(output.skill_sync.packs.length, 1);
    const pack = output.skill_sync.packs[0];
    assert.equal(pack.domain_id, 'scholarskills');
    assert.equal(pack.sync_status, 'synced');
    assert.equal(pack.sync_scope, 'project');
    assert.equal(pack.target_scope, 'project');
    assert.equal(pack.target_project, 'medautoscience');
    assert.equal(pack.target_root, masRoot);
    assert.equal(pack.workspace_or_quest_local_skill_root, null);
    assert.equal(pack.codex_discovery_kind, 'project_local_plugin_mirror');
    assert.equal(pack.project_mirror_deprecated_for_paper_execution, true);
    assert.equal(pack.project_mirror_non_default_paper_execution_path, true);
    assert.equal(pack.registry_repo_root, null);
    assert.equal(pack.installer_result.source, 'project_local_capability_skill_mirror');
    assert.equal(pack.installer_result.plugin_source_path, sourceRoot);
    const mirror = pack.installer_result.project_local_skill_mirror;
    assert.equal(mirror.status, 'installed');
    assert.equal(mirror.target_scope, 'project');
    assert.equal(mirror.target_project, 'medautoscience');
    assert.equal(mirror.target_repo_root, masRoot);
    assert.equal(mirror.project_mirror_deprecated_for_paper_execution, true);
    assert.equal(mirror.project_mirror_non_default_paper_execution_path, true);
    assert.equal(mirror.project_local_plugin_root, path.join(masRoot, 'plugins', 'mas-scholar-skills'));
    assert.equal(
      fs.realpathSync(mirror.project_local_plugin_manifest_path),
      fs.realpathSync(path.join(masRoot, 'plugins', 'mas-scholar-skills', '.codex-plugin', 'plugin.json')),
    );
    assert.equal(
      fs.realpathSync(mirror.project_local_skill_entry_path),
      fs.realpathSync(path.join(masRoot, 'plugins', 'mas-scholar-skills', 'skills', 'mas-scholar-skills', 'SKILL.md')),
    );
    assert.deepEqual(mirror.project_local_copy.copied_roots, [
      '.codex-plugin',
      'skills',
      'contracts',
      'gallery',
    ]);
    assert.equal(mirror.project_local_copy.copy_policy, 'scholarskills_project_local_filtered_copy');
    assert.equal(
      mirror.project_local_copy.excluded_roots.includes('outputs'),
      true,
    );
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'mas-scholar-skills', 'outputs')), false);
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'mas-scholar-skills', '.git')), false);
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'mas-scholar-skills', 'gallery', 'medical-display', 'assets')), false);
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'mas-scholar-skills', 'gallery', 'medical-display', 'medical_display_gallery.pdf')), true);
    assert.deepEqual(mirror.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_owner_receipt: false,
      can_write_paper_body: false,
      can_write_artifact_authority: false,
      can_authorize_publication_readiness: false,
    });
    assert.equal(mirror.project_local_git_exclude.status, 'skipped_not_git_repo');
    assert.equal(mirror.project_local_git_exclude.pattern, '/plugins/mas-scholar-skills/');
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'config.toml')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'mas-scholar-skills', 'SKILL.md')), false);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills installs MAS Scholar Skills to a workspace-local Codex discovery skill', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-workspace-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-paper-workspace-'));

  try {
    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
      '--home',
      homeRoot,
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          domain_id: string;
          sync_status: string;
          sync_scope: string;
          target_scope: string;
          target_project: string | null;
          target_root: string;
          workspace_or_quest_local_skill_root: string;
          codex_discovery_kind: string;
          project_mirror_deprecated_for_paper_execution: boolean;
          project_mirror_non_default_paper_execution_path: boolean;
          registry_repo_root: string | null;
          installer_result: {
            source: string;
            workspace_or_quest_local_skill: {
              status: string;
              target_scope: string;
              target_root: string;
              workspace_or_quest_local_skill_root: string;
              workspace_or_quest_local_skill_entry_path: string;
              install_receipt_path: string;
              copy: {
                copy_policy: string;
                copied_roots: string[];
                excluded_roots: string[];
              };
            };
          };
        }>;
        codex_plugin_registry: null;
      };
    };

    assert.equal(output.skill_sync.codex_plugin_registry, null);
    const pack = output.skill_sync.packs[0];
    assert.equal(pack.domain_id, 'scholarskills');
    assert.equal(pack.sync_status, 'synced');
    assert.equal(pack.sync_scope, 'workspace');
    assert.equal(pack.target_scope, 'workspace');
    assert.equal(pack.target_project, null);
    assert.equal(pack.target_root, workspaceRoot);
    assert.equal(pack.codex_discovery_kind, 'workspace_or_quest_local_skill');
    assert.equal(pack.project_mirror_deprecated_for_paper_execution, false);
    assert.equal(pack.project_mirror_non_default_paper_execution_path, false);
    assert.equal(pack.registry_repo_root, null);
    assert.equal(pack.installer_result.source, 'workspace_or_quest_local_codex_skill');

    const localSkill = pack.installer_result.workspace_or_quest_local_skill;
    const skillRoot = path.join(workspaceRoot, '.codex', 'skills', 'mas-scholar-skills');
    assert.equal(pack.workspace_or_quest_local_skill_root, skillRoot);
    assert.equal(localSkill.status, 'installed');
    assert.equal(localSkill.target_scope, 'workspace');
    assert.equal(localSkill.target_root, workspaceRoot);
    assert.equal(localSkill.workspace_or_quest_local_skill_root, skillRoot);
    assert.equal(localSkill.workspace_or_quest_local_skill_entry_path, path.join(skillRoot, 'SKILL.md'));
    assert.equal(localSkill.install_receipt_path, path.join(skillRoot, '.opl-install-receipt.json'));
    assert.deepEqual(localSkill.copy.copied_roots, [
      'SKILL.md',
      'contracts',
      'gallery',
    ]);
    assert.equal(localSkill.copy.copy_policy, 'scholarskills_workspace_or_quest_local_filtered_skill_copy');
    assert.equal(fs.existsSync(path.join(skillRoot, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'contracts', 'scholar-skills-capability-modules.json')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'gallery', 'medical-display', 'medical_display_gallery.pdf')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, 'gallery', 'medical-display', 'assets')), false);
    assert.equal(fs.existsSync(path.join(skillRoot, 'outputs')), false);
    assert.equal(fs.existsSync(path.join(skillRoot, '.git')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'mas-scholar-skills', 'SKILL.md')), false);

    const receipt = parseJsonText(fs.readFileSync(path.join(skillRoot, '.opl-install-receipt.json'), 'utf8')) as {
      receipt_kind: string;
      target_scope: string;
      target_root: string;
      skill_root: string;
      source_repo_path: string;
      authority_flags: {
        can_write_domain_truth: boolean;
        can_sign_owner_receipt: boolean;
        can_create_typed_blocker: boolean;
        can_write_runtime_queue: boolean;
        can_write_paper_body: boolean;
      };
    };
    assert.equal(receipt.receipt_kind, 'opl_scholarskills_workspace_or_quest_local_install_receipt');
    assert.equal(receipt.target_scope, 'workspace');
    assert.equal(receipt.target_root, workspaceRoot);
    assert.equal(receipt.skill_root, skillRoot);
    assert.equal(receipt.source_repo_path, sourceRoot);
    assert.deepEqual(receipt.authority_flags, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_owner_receipt: false,
      can_write_paper_body: false,
      can_write_artifact_authority: false,
      can_authorize_publication_readiness: false,
    });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills installs materialized MAS ScholarSkills specialist dirs from the profile registry', () => {
  const sourceRoot = createScholarSkillsRepoFixture({
    specialistSkills: MAS_SCHOLAR_SKILLS_SPECIALIST_PACK_IDS,
  });
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-profile-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-profile-workspace-'));

  try {
    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'workspace',
      '--target-workspace',
      workspaceRoot,
      '--home',
      homeRoot,
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          installer_result: {
            workspace_or_quest_local_skill: {
              mas_scholar_skills_profile_manifest_path: string;
              mas_scholar_skills_profile: {
                required_skill_pack: string[];
                default_skill_pack: string[];
                install_target: {
                  target_scope: string;
                  target_root: string;
                  install_root: string;
                  system_codex_skill_install_default: boolean;
                };
                packs: Array<{
                  pack_id: string;
                  default_by_profile: boolean;
                  source_status: string;
                  installed: boolean;
                  install_target_skill_root: string;
                }>;
                authority_boundary: {
                  can_write_domain_truth: boolean;
                  can_sign_owner_receipt: boolean;
                  can_create_typed_blocker: boolean;
                  can_write_runtime_queue: boolean;
                  can_write_owner_receipt: boolean;
                  can_write_paper_body: boolean;
                  can_write_artifact_authority: boolean;
                  can_authorize_publication_readiness: boolean;
                };
              };
            };
          };
        }>;
      };
    };

    const localSkill = output.skill_sync.packs[0].installer_result.workspace_or_quest_local_skill;
    const profile = localSkill.mas_scholar_skills_profile;
    const skillRoot = path.join(workspaceRoot, '.codex', 'skills', 'mas-scholar-skills');
    const profilePacks = new Map(profile.packs.map((entry) => [entry.pack_id, entry]));

    assert.equal(localSkill.mas_scholar_skills_profile_manifest_path, path.join(skillRoot, '.opl-mas-scholarskills-sync-manifest.json'));
    assert.equal(fs.existsSync(localSkill.mas_scholar_skills_profile_manifest_path), true);
    assert.deepEqual(profile.required_skill_pack, MAS_SCHOLAR_SKILLS_REQUIRED_PACK_IDS);
    assert.deepEqual(profile.default_skill_pack, MAS_SCHOLAR_SKILLS_DEFAULT_PACK_IDS);
    assert.equal(profile.install_target.target_scope, 'workspace');
    assert.equal(profile.install_target.target_root, workspaceRoot);
    assert.equal(profile.install_target.install_root, path.join(workspaceRoot, '.codex', 'skills'));
    assert.equal(profile.install_target.system_codex_skill_install_default, false);
    for (const packId of MAS_SCHOLAR_SKILLS_DEFAULT_PACK_IDS) {
      assert.equal(profilePacks.get(packId)?.source_status, 'materialized');
      assert.equal(profilePacks.get(packId)?.installed, true);
      assert.equal(profilePacks.get(packId)?.default_by_profile, true);
    }
    for (const packId of MAS_SCHOLAR_SKILLS_SPECIALIST_PACK_IDS) {
      const packProfile = profilePacks.get(packId);
      if (!MAS_SCHOLAR_SKILLS_DEFAULT_PACK_IDS.includes(packId)) {
        assert.equal(packProfile?.default_by_profile, false);
      }
      assert.equal(packProfile?.source_status, 'materialized');
      assert.equal(packProfile?.installed, true);
    }
    for (const packId of MAS_SCHOLAR_SKILLS_SPECIALIST_PACK_IDS) {
      assert.equal(
        fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', packId, 'SKILL.md')),
        true,
      );
      assert.equal(
        fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', packId, 'kernel.py')),
        true,
      );
      assert.equal(
        fs.existsSync(path.join(workspaceRoot, '.codex', 'skills', packId, '.opl-connect-skill-sync.json')),
        true,
      );
    }
    assert.deepEqual(profile.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
      can_write_owner_receipt: false,
      can_write_paper_body: false,
      can_write_artifact_authority: false,
      can_authorize_publication_readiness: false,
    });
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills installs MAS Scholar Skills to a quest-local Codex discovery skill', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-quest-home-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-paper-workspace-'));
  const questRoot = path.join(workspaceRoot, 'runtime', 'quests', '002-dm-example');
  fs.mkdirSync(questRoot, { recursive: true });

  try {
    const output = runCli([
      'connect',
      'sync-skills',
      '--domain',
      'scholarskills',
      '--scope',
      'quest',
      '--target-quest',
      questRoot,
      '--home',
      homeRoot,
    ], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          sync_status: string;
          sync_scope: string;
          target_scope: string;
          target_root: string;
          workspace_or_quest_local_skill_root: string;
          installer_result: {
            workspace_or_quest_local_skill: {
              install_receipt_path: string;
              target_scope: string;
            };
          };
        }>;
      };
    };

    const pack = output.skill_sync.packs[0];
    const skillRoot = path.join(questRoot, '.codex', 'skills', 'mas-scholar-skills');
    assert.equal(pack.sync_status, 'synced');
    assert.equal(pack.sync_scope, 'quest');
    assert.equal(pack.target_scope, 'quest');
    assert.equal(pack.target_root, questRoot);
    assert.equal(pack.workspace_or_quest_local_skill_root, skillRoot);
    assert.equal(pack.installer_result.workspace_or_quest_local_skill.target_scope, 'quest');
    assert.equal(pack.installer_result.workspace_or_quest_local_skill.install_receipt_path, path.join(skillRoot, '.opl-install-receipt.json'));
    assert.equal(fs.existsSync(path.join(skillRoot, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(skillRoot, '.opl-install-receipt.json')), true);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills registers MAS Scholar Skills in Codex only with explicit codex scope', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mas-scholar-skills-connect-codex-home-'));

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'scholarskills', '--scope', 'codex', '--home', homeRoot], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT: sourceRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          domain_id: string;
          sync_status: string;
          sync_scope: string;
          target_project: string | null;
          registry_repo_root: string;
          installer_result: {
            source: string;
            plugin_source_path: string;
          };
        }>;
        codex_plugin_registry: {
          surface_id: string;
          items: Array<{
            module_id: string | null;
            pack_id: string;
            plugin_id: string;
            marketplace_id: string;
            plugin_source_path: string;
            plugin_manifest_path: string;
            marketplace_root: string;
            status: string;
            ownership_kind: string;
            distribution_role: string;
            framework_owned_capability: boolean;
            domain_module: boolean;
            brand_module: boolean;
            authority_boundary: {
              can_write_domain_truth: boolean;
              can_sign_owner_receipt: boolean;
              can_create_typed_blocker: boolean;
              can_write_runtime_queue: boolean;
            };
          }>;
          summary: {
            total: number;
            registered: number;
          };
        };
      };
    };

    assert.equal(output.skill_sync.packs.length, 1);
    assert.equal(output.skill_sync.packs[0].domain_id, 'scholarskills');
    assert.equal(output.skill_sync.packs[0].sync_status, 'synced');
    assert.equal(output.skill_sync.packs[0].sync_scope, 'codex');
    assert.equal(output.skill_sync.packs[0].target_project, null);
    assert.equal(output.skill_sync.packs[0].registry_repo_root, sourceRoot);
    assert.equal(output.skill_sync.packs[0].installer_result.source, 'tracked_codex_plugin_source');
    assert.equal(output.skill_sync.packs[0].installer_result.plugin_source_path, sourceRoot);

    const registry = output.skill_sync.codex_plugin_registry;
    assert.equal(registry.surface_id, 'opl_codex_plugin_registry');
    assert.equal(registry.summary.total, 1);
    assert.equal(registry.summary.registered, 1);
    const item = registry.items[0];
    assert.equal(item.module_id, null);
    assert.equal(item.pack_id, 'scholarskills');
    assert.equal(item.plugin_id, 'mas-scholar-skills');
    assert.equal(item.marketplace_id, 'mas-scholar-skills-local');
    assert.equal(item.plugin_source_path, sourceRoot);
    assert.equal(item.plugin_manifest_path, path.join(sourceRoot, '.codex-plugin', 'plugin.json'));
    assert.equal(item.status, 'registered');
    assert.equal(item.ownership_kind, 'framework_capability_plugin');
    assert.equal(item.distribution_role, 'framework_capability_plugin_pack');
    assert.equal(item.framework_owned_capability, true);
    assert.equal(item.domain_module, false);
    assert.equal(item.brand_module, false);
    assert.deepEqual(item.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    });

    const codexConfig = fs.readFileSync(path.join(homeRoot, 'codex-home', 'config.toml'), 'utf8');
    assert.match(codexConfig, /\[marketplaces\.mas-scholar-skills-local\]/);
    assert.match(codexConfig, /\[plugins\."mas-scholar-skills@mas-scholar-skills-local"\]/);
    assert.equal(
      fs.realpathSync(path.join(item.marketplace_root, 'plugins', 'mas-scholar-skills')),
      fs.realpathSync(sourceRoot),
    );
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
