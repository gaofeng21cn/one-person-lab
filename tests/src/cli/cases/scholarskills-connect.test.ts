import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('connect skills exposes OPL ScholarSkills as a framework-owned capability plugin pack', () => {
  const output = runCli(['connect', 'skills', '--domain', 'scholarskills']) as {
    skill_catalog: {
      packs: Array<{
        domain_id: string;
        canonical_plugin_name: string;
        distribution_role: string;
        plugin_source_path: string;
        plugin_manifest_path: string;
        skill_entry_path: string;
        ready_to_sync: boolean;
        capability_plugin_distribution: {
          surface_kind: string;
          capability_plugin_id: string;
          ownership_kind: string;
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
  assert.equal(pack.canonical_plugin_name, 'opl-scholarskills');
  assert.equal(pack.distribution_role, 'framework_capability_plugin_pack');
  assert.equal(pack.ready_to_sync, true);
  assert.equal(pack.plugin_source_path, path.join(repoRoot, 'plugins', 'opl-scholarskills'));
  assert.equal(pack.plugin_manifest_path, path.join(repoRoot, 'plugins', 'opl-scholarskills', '.codex-plugin', 'plugin.json'));
  assert.equal(pack.skill_entry_path, path.join(repoRoot, 'plugins', 'opl-scholarskills', 'skills', 'opl-scholarskills', 'SKILL.md'));
  assert.equal(pack.capability_plugin_distribution.surface_kind, 'opl_framework_capability_plugin_distribution');
  assert.equal(pack.capability_plugin_distribution.capability_plugin_id, 'opl-scholarskills');
  assert.equal(pack.capability_plugin_distribution.ownership_kind, 'framework_capability_plugin');
  assert.equal(pack.capability_plugin_distribution.framework_owned_capability, true);
  assert.equal(pack.capability_plugin_distribution.domain_module, false);
  assert.equal(pack.capability_plugin_distribution.brand_module, false);
  assert.deepEqual(pack.capability_plugin_distribution.authority_boundary, {
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_write_runtime_queue: false,
  });
});

test('connect sync-skills registers OPL ScholarSkills in the managed Codex plugin registry without creating a domain module', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scholarskills-connect-home-'));

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
      OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }) as {
      skill_sync: {
        packs: Array<{
          domain_id: string;
          sync_status: string;
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
    assert.equal(output.skill_sync.packs[0].registry_repo_root, repoRoot);
    assert.equal(output.skill_sync.packs[0].installer_result.source, 'tracked_codex_plugin_source');
    assert.equal(output.skill_sync.packs[0].installer_result.plugin_source_path, path.join(repoRoot, 'plugins', 'opl-scholarskills'));

    const registry = output.skill_sync.codex_plugin_registry;
    assert.equal(registry.surface_id, 'opl_codex_plugin_registry');
    assert.equal(registry.summary.total, 1);
    assert.equal(registry.summary.registered, 1);
    const item = registry.items[0];
    assert.equal(item.module_id, null);
    assert.equal(item.pack_id, 'scholarskills');
    assert.equal(item.plugin_id, 'opl-scholarskills');
    assert.equal(item.marketplace_id, 'opl-scholarskills-local');
    assert.equal(item.plugin_source_path, path.join(repoRoot, 'plugins', 'opl-scholarskills'));
    assert.equal(item.plugin_manifest_path, path.join(repoRoot, 'plugins', 'opl-scholarskills', '.codex-plugin', 'plugin.json'));
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
      fs.realpathSync(path.join(repoRoot, 'plugins', 'opl-scholarskills')),
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
