import { assert, fs, os, parseJsonText, path, test } from '../helpers.ts';
import { createFakeFamilySkillWorkspace } from '../../cli-codex-default-shell-helpers.ts';
import { readBundledCodexDefaultProfile } from '../../../../src/kernel/local-codex-defaults.ts';
import {
  runCliWithStdin,
} from './system-install-fixtures.ts';

const codexDefaultProfile = readBundledCodexDefaultProfile();

function assertBundledCodexModel(
  bootstrap: { model: string; reasoning_effort: string },
  config: string,
) {
  assert.equal(bootstrap.model, codexDefaultProfile.model);
  assert.equal(bootstrap.reasoning_effort, codexDefaultProfile.model_reasoning_effort);
  assert.equal(config.includes(`model = ${JSON.stringify(codexDefaultProfile.model)}`), true);
  assert.equal(
    config.includes(
      `model_reasoning_effort = ${JSON.stringify(codexDefaultProfile.model_reasoning_effort)}`,
    ),
    true,
  );
}

test('system configure-codex writes the product endpoint and App-owned install fallback without leaking the API key', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-home-'));
  const apiKey = 'secret-stdin-key';

  try {
    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      `${apiKey}\n`,
      {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      },
    ) as {
      codex_config: {
        status: string;
        config_path: string;
        default_profile: {
          model_provider: string;
          model: string;
          model_reasoning_effort: string;
          base_url: string;
          base_url_role: string;
          model_profile_role: string;
        };
        bootstrap: {
          model: string;
          reasoning_effort: string;
          provider_base_url: string;
          api_key_present: boolean;
          management_receipt: {
            selection_mode: string;
            provider_route: string;
            owned_keys: string[];
            backup_path: string | null;
          };
          management_receipt_path: string;
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.default_profile.model_provider, 'gflab');
    assert.equal(output.codex_config.default_profile.model, codexDefaultProfile.model);
    assert.equal(
      output.codex_config.default_profile.model_reasoning_effort,
      codexDefaultProfile.model_reasoning_effort,
    );
    assert.equal(output.codex_config.default_profile.base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.default_profile.base_url_role, 'product_default_provider_endpoint');
    assert.equal(output.codex_config.default_profile.model_profile_role, 'app_catalog_unavailable_fallback_projection');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(output.codex_config.bootstrap.management_receipt.selection_mode, 'auto');
    assert.equal(output.codex_config.bootstrap.management_receipt.provider_route, 'direct_gateway');
    assert.equal(output.codex_config.bootstrap.management_receipt.backup_path, null);
    assert.equal(fs.existsSync(output.codex_config.bootstrap.management_receipt_path), true);
    assert.equal(JSON.stringify(output).includes(apiKey), false);

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assertBundledCodexModel(output.codex_config.bootstrap, config);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "secret-stdin-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex keeps environment overrides over bundled model profile', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-override-home-'));

  try {
    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'override-key\n',
      {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_CODEX_MODEL: 'gpt-5.6',
        OPL_CODEX_REASONING_EFFORT: 'high',
      },
    ) as {
      codex_config: {
        config_path: string;
        bootstrap: {
          model: string;
          reasoning_effort: string;
          provider_base_url: string;
        };
      };
    };

    assert.equal(output.codex_config.bootstrap.model, 'gpt-5.6');
    assert.equal(output.codex_config.bootstrap.reasoning_effort, 'high');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model = "gpt-5\.6"/);
    assert.match(config, /model_reasoning_effort = "high"/);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex preserves an existing custom provider and registers OPL Gateway as inactive', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-switch-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(codexHome, 'config.toml'),
      [
        'model_provider = "custom"',
        'model = "custom-model"',
        '',
        '[model_providers.custom]',
        'name = "custom"',
        'base_url = "https://custom-provider.example.test/v1"',
        'experimental_bearer_token = "existing-custom-key"',
        '',
      ].join('\n'),
      'utf8',
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'opl-gateway-key\n',
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      },
    ) as {
      codex_config: {
        status: string;
        config_path: string;
        bootstrap: {
          model: string;
          provider_base_url: string;
          api_key_present: boolean;
          management_receipt: {
            selection_mode: string;
            provider_route: string;
            backup_path: string | null;
          };
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.bootstrap.model, 'custom-model');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(output.codex_config.bootstrap.management_receipt.selection_mode, 'inactive_provider');
    assert.equal(output.codex_config.bootstrap.management_receipt.provider_route, 'inactive_provider');
    assert.equal(fs.existsSync(output.codex_config.bootstrap.management_receipt.backup_path!), true);

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model_provider = "custom"/);
    assert.match(config, /model = "custom-model"/);
    assert.match(config, /\[model_providers\.custom\]/);
    assert.match(config, /base_url = "https:\/\/custom-provider\.example\.test\/v1"/);
    assert.match(config, /\[model_providers\.gflab\]/);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "opl-gateway-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex preserves model and reasoning values changed after the last OPL receipt', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-local-override-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const stateDir = path.join(homeRoot, 'opl-state');

  try {
    const env = {
      HOME: homeRoot,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: stateDir,
    };
    runCliWithStdin(['system', 'configure-codex', '--api-key-stdin'], 'first-key\n', env);
    const configPath = path.join(codexHome, 'config.toml');
    const managedConfig = fs.readFileSync(configPath, 'utf8');
    fs.writeFileSync(
      configPath,
      managedConfig
        .replace(
          `model = ${JSON.stringify(codexDefaultProfile.model)}`,
          'model = "user-fixed-model"',
        )
        .replace(
          `model_reasoning_effort = ${JSON.stringify(codexDefaultProfile.model_reasoning_effort)}`,
          'model_reasoning_effort = "high"',
        ),
      'utf8',
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'second-key\n',
      env,
    ) as {
      codex_config: {
        bootstrap: {
          model: string;
          reasoning_effort: string;
          management_receipt: { selection_mode: string };
        };
      };
    };

    assert.equal(output.codex_config.bootstrap.model, 'user-fixed-model');
    assert.equal(output.codex_config.bootstrap.reasoning_effort, 'high');
    assert.equal(output.codex_config.bootstrap.management_receipt.selection_mode, 'local_override');
    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model = "user-fixed-model"/);
    assert.match(config, /model_reasoning_effort = "high"/);
    assert.match(config, /experimental_bearer_token = "second-key"/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex completes a plugin-only Codex config created during first-run install', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-plugin-home-'));
  const codexHome = path.join(homeRoot, 'codex-home');
  const configPath = path.join(codexHome, 'config.toml');
  const apiKey = 'secret-plugin-key';

  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      configPath,
      [
        '[marketplaces.med-autoscience-local]',
        'source_type = "local"',
        'source = "/Users/test/med-autoscience"',
        '',
        '[plugins."med-autoscience@med-autoscience-local"]',
        'enabled = true',
        '',
      ].join('\n'),
      'utf8',
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      `${apiKey}\n`,
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
      },
    ) as {
      codex_config: {
        status: string;
        bootstrap: {
          model: string;
          reasoning_effort: string;
          provider_base_url: string;
          api_key_present: boolean;
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(JSON.stringify(output).includes(apiKey), false);

    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assertBundledCodexModel(output.codex_config.bootstrap, config);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "secret-plugin-key"/);
    assert.match(config, /\[marketplaces\.med-autoscience-local\]/);
    assert.match(config, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex syncs packaged Full companion skills after API key setup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-full-skills-home-'));
  const runtimeHome = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
  const packagedSkillsRoot = path.join(runtimeHome, 'skills');
  const toolBin = path.join(runtimeHome, 'bin');
  const codexHome = path.join(homeRoot, 'codex-home');

  try {
    for (const skillId of [
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'officecli-academic-paper',
      'officecli-data-dashboard',
      'officecli-financial-model',
      'officecli-pitch-deck',
      'ui-ux-pro-max',
      'mineru-document-extractor',
    ]) {
      fs.mkdirSync(path.join(packagedSkillsRoot, skillId), { recursive: true });
      fs.writeFileSync(
        path.join(packagedSkillsRoot, skillId, 'SKILL.md'),
        `---\nname: ${skillId}\ndescription: packaged ${skillId}\n---\n\n# ${skillId}\n`,
        'utf8',
      );
    }
    fs.mkdirSync(toolBin, { recursive: true });
    fs.writeFileSync(
      path.join(toolBin, 'officecli'),
      '#!/usr/bin/env bash\nif [ "${1:-}" = "--version" ]; then echo "1.0.70-test"; else echo officecli; fi\n',
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(toolBin, 'mineru-open-api'),
      '#!/usr/bin/env bash\nif [ "${1:-}" = "version" ]; then echo "mineru-open-api version v0.1.3-test"; else echo mineru-open-api; fi\n',
      { mode: 0o755 },
    );

    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'secret-full-key\n',
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_FULL_RUNTIME_HOME: runtimeHome,
        OPL_PACKAGED_SKILLS_ROOT: packagedSkillsRoot,
        OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
        PATH: `${toolBin}:/usr/bin:/bin`,
      },
    ) as {
      codex_config: {
        companion_skill_sync: {
          mode: string;
          items: Array<{ skill_id: string; status: string; action: string }>;
          tools: Array<{ tool_id: string; status: string; action: string; binary_path: string | null }>;
        };
      };
    };

    assert.equal(output.codex_config.companion_skill_sync.mode, 'managed');
    const itemById = new Map(output.codex_config.companion_skill_sync.items.map((item) => [item.skill_id, item]));
    for (const skillId of [
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'officecli-academic-paper',
      'officecli-data-dashboard',
      'officecli-financial-model',
      'officecli-pitch-deck',
      'ui-ux-pro-max',
      'mineru-document-extractor',
    ]) {
      assert.equal(itemById.get(skillId)?.status, 'synced');
      assert.equal(itemById.get(skillId)?.action, 'symlink');
      assert.equal(fs.existsSync(path.join(codexHome, 'skills', skillId, 'SKILL.md')), true);
    }
    assert.deepEqual(
      output.codex_config.companion_skill_sync.tools.map((entry) => [
        entry.tool_id,
        entry.status,
        entry.action,
        entry.binary_path,
      ]),
      [
        ['officecli', 'ready', 'none', path.join(toolBin, 'officecli')],
        ['mineru-open-api', 'ready', 'none', path.join(toolBin, 'mineru-open-api')],
      ],
    );
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system configure-codex syncs Full runtime family Codex plugins after API key setup', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-family-plugins-home-'));
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-codex-family-plugins-capture-'));
  const familyWorkspace = createFakeFamilySkillWorkspace(captureDir);
  const codexHome = path.join(homeRoot, 'codex-home');

  try {
    const output = runCliWithStdin(
      ['system', 'configure-codex', '--api-key-stdin'],
      'secret-family-key\n',
      {
        HOME: homeRoot,
        CODEX_HOME: codexHome,
        OPL_STATE_DIR: path.join(homeRoot, 'opl-state'),
        OPL_MODULE_PATH_MEDAUTOSCIENCE: path.join(familyWorkspace.workspaceRoot, 'med-autoscience'),
        OPL_MODULE_PATH_MEDAUTOGRANT: path.join(familyWorkspace.workspaceRoot, 'med-autogrant'),
        OPL_MODULE_PATH_REDCUBE: path.join(familyWorkspace.workspaceRoot, 'redcube-ai'),
        OPL_MODULE_PATH_OPLMETAAGENT: path.join(familyWorkspace.workspaceRoot, 'opl-meta-agent'),
        OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
        PATH: `${process.execPath ? path.dirname(process.execPath) : '/usr/bin'}:/usr/bin:/bin`,
      },
    ) as {
      codex_config: {
        skill_sync: {
          packs: Array<{ domain_id: string; sync_status: string; installer_result: Record<string, unknown> | null }>;
          codex_plugin_registry: {
            summary: { registered: number; missing_marketplace: number };
            items: Array<{ module_id: string; status: string; repo_path: string }>;
          };
        };
      };
    };

    assert.equal(output.codex_config.skill_sync.codex_plugin_registry.summary.registered, 4);
    assert.equal(output.codex_config.skill_sync.codex_plugin_registry.summary.missing_marketplace, 0);
    assert.deepEqual(
      output.codex_config.skill_sync.packs.map((pack) => [pack.domain_id, pack.sync_status]),
      [
        ['medautoscience', 'synced'],
        ['medautogrant', 'synced'],
        ['redcube', 'synced'],
        ['oplmetaagent', 'synced'],
      ],
    );
    const omaPack = output.codex_config.skill_sync.packs.find((pack) => pack.domain_id === 'oplmetaagent');
    assert.equal(
      (omaPack?.installer_result?.materialized_codex_plugin_carrier as { source?: string } | undefined)?.source,
      'opl_standard_agent_primary_skill_codex_plugin',
    );

    const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    assert.match(config, /\[plugins\."med-autoscience@med-autoscience-local"\]/);
    assert.match(config, /\[plugins\."med-autogrant@med-autogrant-local"\]/);
    assert.match(config, /\[plugins\."redcube-ai@redcube-ai-local"\]/);
    assert.match(config, /\[plugins\."opl-meta-agent@opl-meta-agent-local"\]/);
    for (const [project, marketplaceId, pluginId] of [
      ['med-autoscience', 'med-autoscience-local', 'med-autoscience'],
      ['med-autogrant', 'med-autogrant-local', 'med-autogrant'],
      ['redcube-ai', 'redcube-ai-local', 'redcube-ai'],
    ] as const) {
      const checkoutPath = path.join(familyWorkspace.workspaceRoot, project);
      const marketplaceRoot = path.join(homeRoot, 'opl-state', 'codex-plugin-marketplaces', marketplaceId);
      assert.equal(fs.existsSync(path.join(checkoutPath, '.agents', 'plugins', 'marketplace.json')), false);
      const wrapperPluginRoot = path.join(marketplaceRoot, 'plugins', pluginId);
      const wrapperManifest = parseJsonText(fs.readFileSync(path.join(wrapperPluginRoot, '.codex-plugin', 'plugin.json'), 'utf8')) as Record<string, any>;
      const wrapperSkill = fs.readFileSync(path.join(wrapperPluginRoot, 'skills', pluginId, 'SKILL.md'), 'utf8');
      assert.equal(wrapperManifest.name, pluginId);
      assert.match(wrapperSkill, new RegExp(`^name:\\s*${pluginId}$`, 'm'));
      assert.match(config, new RegExp(`\\[marketplaces\\.${marketplaceId}\\]\\nsource_type = "local"\\nsource = "${marketplaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    }
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'codex-plugin-carriers',
        'opl-meta-agent-local',
        'plugins',
        'opl-meta-agent',
        '.codex-plugin',
        'plugin.json',
      )),
      true,
    );
    assert.equal(fs.existsSync(familyWorkspace.syncLogPath), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.rmSync(familyWorkspace.workspaceRoot, { recursive: true, force: true });
  }
});
