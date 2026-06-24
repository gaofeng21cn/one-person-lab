import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function createScholarSkillsRepoFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-source-'));
  const pluginDir = path.join(root, '.codex-plugin');
  const skillDir = path.join(root, 'skills', 'opl-scholarskills');
  const galleryDir = path.join(root, 'gallery', 'medical-display');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(galleryDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'outputs', 'display-pack-gallery'), { recursive: true });
  fs.mkdirSync(path.join(galleryDir, 'assets'), { recursive: true });

  fs.cpSync(
    path.join(repoRoot, 'plugins', 'opl-scholarskills', '.codex-plugin', 'plugin.json'),
    path.join(pluginDir, 'plugin.json'),
  );
  fs.cpSync(
    path.join(repoRoot, 'plugins', 'opl-scholarskills', 'skills', 'opl-scholarskills', 'SKILL.md'),
    path.join(skillDir, 'SKILL.md'),
  );
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

test('connect skills exposes OPL ScholarSkills as a framework-owned capability plugin pack', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  try {
    const output = runCli(['connect', 'skills', '--domain', 'scholarskills'], {
      OPL_SCHOLARSKILLS_REPO_ROOT: sourceRoot,
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
            default_sync_scope: string;
            default_target_project: string;
            codex_scope_requires_explicit_request: boolean;
            framework_owned_capability: boolean;
            domain_module: boolean;
            brand_module: boolean;
            authority_boundary: {
              can_write_domain_truth: boolean;
              can_sign_owner_receipt: boolean;
              can_create_typed_blocker: boolean;
              can_write_runtime_queue: boolean;
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
    assert.equal(pack.project, 'opl-scholarskills');
    assert.equal(pack.canonical_plugin_name, 'opl-scholarskills');
    assert.equal(pack.distribution_role, 'framework_capability_plugin_pack');
    assert.equal(pack.ready_to_sync, true);
    assert.equal(pack.repo_root, sourceRoot);
    assert.equal(pack.plugin_source_path, sourceRoot);
    assert.equal(pack.plugin_manifest_path, path.join(sourceRoot, '.codex-plugin', 'plugin.json'));
    assert.equal(pack.skill_entry_path, path.join(sourceRoot, 'skills', 'opl-scholarskills', 'SKILL.md'));
    assert.equal(pack.capability_plugin_distribution.surface_kind, 'opl_framework_capability_plugin_distribution');
    assert.equal(pack.capability_plugin_distribution.capability_plugin_id, 'opl-scholarskills');
    assert.equal(pack.capability_plugin_distribution.ownership_kind, 'framework_capability_plugin');
    assert.equal(pack.capability_plugin_distribution.github_repo, 'gaofeng21cn/opl-scholarskills');
    assert.equal(pack.capability_plugin_distribution.source_of_truth.includes('opl-scholarskills/.codex-plugin/plugin.json'), true);
    assert.equal(pack.capability_plugin_distribution.default_sync_scope, 'project');
    assert.equal(pack.capability_plugin_distribution.default_target_project, 'medautoscience');
    assert.equal(pack.capability_plugin_distribution.codex_scope_requires_explicit_request, true);
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

test('connect sync-skills installs OPL ScholarSkills to the MAS project-local plugin mirror by default', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-connect-home-'));
  const masRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-mas-root-'));

  try {
    const modules = runCli(['connect', 'modules']) as {
      modules: {
        items: Array<{ module_id: string }>;
      };
    };
    assert.equal(modules.modules.items.some((module) => module.module_id === 'scholarskills'), false);

    const output = runCli(['connect', 'sync-skills', '--domain', 'scholarskills', '--home', homeRoot], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_SCHOLARSKILLS_REPO_ROOT: sourceRoot,
      OPL_MEDAUTOSCIENCE_REPO_ROOT: masRoot,
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          domain_id: string;
          sync_status: string;
          sync_scope: string;
          target_project: string;
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
    assert.equal(pack.target_project, 'medautoscience');
    assert.equal(pack.registry_repo_root, null);
    assert.equal(pack.installer_result.source, 'project_local_capability_skill_mirror');
    assert.equal(pack.installer_result.plugin_source_path, sourceRoot);
    const mirror = pack.installer_result.project_local_skill_mirror;
    assert.equal(mirror.status, 'installed');
    assert.equal(mirror.target_scope, 'project');
    assert.equal(mirror.target_project, 'medautoscience');
    assert.equal(mirror.target_repo_root, masRoot);
    assert.equal(mirror.project_local_plugin_root, path.join(masRoot, 'plugins', 'opl-scholarskills'));
    assert.equal(
      fs.realpathSync(mirror.project_local_plugin_manifest_path),
      fs.realpathSync(path.join(masRoot, 'plugins', 'opl-scholarskills', '.codex-plugin', 'plugin.json')),
    );
    assert.equal(
      fs.realpathSync(mirror.project_local_skill_entry_path),
      fs.realpathSync(path.join(masRoot, 'plugins', 'opl-scholarskills', 'skills', 'opl-scholarskills', 'SKILL.md')),
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
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'opl-scholarskills', 'outputs')), false);
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'opl-scholarskills', '.git')), false);
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'opl-scholarskills', 'gallery', 'medical-display', 'assets')), false);
    assert.equal(fs.existsSync(path.join(masRoot, 'plugins', 'opl-scholarskills', 'gallery', 'medical-display', 'medical_display_gallery.pdf')), true);
    assert.deepEqual(mirror.authority_boundary, {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    });
    assert.equal(mirror.project_local_git_exclude.status, 'skipped_not_git_repo');
    assert.equal(mirror.project_local_git_exclude.pattern, '/plugins/opl-scholarskills/');
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'config.toml')), false);
    assert.equal(fs.existsSync(path.join(homeRoot, 'codex-home', 'skills', 'opl-scholarskills', 'SKILL.md')), false);
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(masRoot, { recursive: true, force: true });
  }
});

test('connect sync-skills registers OPL ScholarSkills in Codex only with explicit codex scope', () => {
  const sourceRoot = createScholarSkillsRepoFixture();
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-connect-codex-home-'));

  try {
    const output = runCli(['connect', 'sync-skills', '--domain', 'scholarskills', '--scope', 'codex', '--home', homeRoot], {
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, 'codex-home'),
      OPL_SCHOLARSKILLS_REPO_ROOT: sourceRoot,
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
    assert.equal(item.plugin_id, 'opl-scholarskills');
    assert.equal(item.marketplace_id, 'opl-scholarskills-local');
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
    assert.match(codexConfig, /\[marketplaces\.opl-scholarskills-local\]/);
    assert.match(codexConfig, /\[plugins\."opl-scholarskills@opl-scholarskills-local"\]/);
    assert.equal(
      fs.realpathSync(path.join(item.marketplace_root, 'plugins', 'opl-scholarskills')),
      fs.realpathSync(sourceRoot),
    );
  } finally {
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
