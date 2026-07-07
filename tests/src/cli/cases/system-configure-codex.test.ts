import { assert, fs, os, path, test } from '../helpers.ts';
import { createFakeFamilySkillWorkspace } from '../../cli-codex-default-shell-helpers.ts';
import {
  runCliWithStdin,
} from './system-install-fixtures.ts';

test('system configure-codex writes the product endpoint default and current initial model profile without leaking the API key', () => {
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
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.default_profile.model_provider, 'gflab');
    assert.equal(output.codex_config.default_profile.model, 'gpt-5.5');
    assert.equal(output.codex_config.default_profile.model_reasoning_effort, 'xhigh');
    assert.equal(output.codex_config.default_profile.base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.default_profile.base_url_role, 'product_default_provider_endpoint');
    assert.equal(output.codex_config.default_profile.model_profile_role, 'maintainer_current_initial_profile');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(JSON.stringify(output).includes(apiKey), false);

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assert.match(config, /model = "gpt-5\.5"/);
    assert.match(config, /model_reasoning_effort = "xhigh"/);
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

test('system configure-codex switches an existing custom provider to OPL Gateway when the user submits a key', () => {
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
          provider_base_url: string;
          api_key_present: boolean;
        };
      };
    };

    assert.equal(output.codex_config.status, 'completed');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);

    const config = fs.readFileSync(output.codex_config.config_path, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "opl-gateway-key"/);
    assert.match(config, /\[model_providers\.custom\]/);
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
        '[marketplaces.mas-local]',
        'source_type = "local"',
        'source = "/Users/test/med-autoscience"',
        '',
        '[plugins."mas@mas-local"]',
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
    assert.equal(output.codex_config.bootstrap.model, 'gpt-5.5');
    assert.equal(output.codex_config.bootstrap.reasoning_effort, 'xhigh');
    assert.equal(output.codex_config.bootstrap.provider_base_url, 'https://gflabtoken.cn/v1');
    assert.equal(output.codex_config.bootstrap.api_key_present, true);
    assert.equal(JSON.stringify(output).includes(apiKey), false);

    const config = fs.readFileSync(configPath, 'utf8');
    assert.match(config, /model_provider = "gflab"/);
    assert.match(config, /model = "gpt-5\.5"/);
    assert.match(config, /model_reasoning_effort = "xhigh"/);
    assert.match(config, /base_url = "https:\/\/gflabtoken\.cn\/v1"/);
    assert.match(config, /experimental_bearer_token = "secret-plugin-key"/);
    assert.match(config, /\[marketplaces\.mas-local\]/);
    assert.match(config, /\[plugins\."mas@mas-local"\]/);
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
      'superpowers',
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'ui-ux-pro-max',
      'mineru-document-extractor',
    ]) {
      fs.mkdirSync(path.join(packagedSkillsRoot, skillId), { recursive: true });
      if (skillId === 'superpowers') {
        fs.mkdirSync(path.join(packagedSkillsRoot, skillId, 'skills', 'using-superpowers'), { recursive: true });
        fs.mkdirSync(
          path.join(packagedSkillsRoot, skillId, 'skills', 'verification-before-completion'),
          { recursive: true },
        );
        fs.writeFileSync(
          path.join(packagedSkillsRoot, skillId, 'skills', 'using-superpowers', 'SKILL.md'),
          '# using-superpowers\n',
          'utf8',
        );
        fs.writeFileSync(
          path.join(packagedSkillsRoot, skillId, 'skills', 'verification-before-completion', 'SKILL.md'),
          '# verification-before-completion\n',
          'utf8',
        );
      } else {
        fs.writeFileSync(
          path.join(packagedSkillsRoot, skillId, 'SKILL.md'),
          `---\nname: ${skillId}\ndescription: packaged ${skillId}\n---\n\n# ${skillId}\n`,
          'utf8',
        );
      }
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
          superpowers_profile: string;
          items: Array<{ skill_id: string; status: string; action: string }>;
          tools: Array<{ tool_id: string; status: string; action: string; binary_path: string | null }>;
        };
      };
    };

    assert.equal(output.codex_config.companion_skill_sync.mode, 'managed');
    assert.equal(output.codex_config.companion_skill_sync.superpowers_profile, 'full');
    const itemById = new Map(output.codex_config.companion_skill_sync.items.map((item) => [item.skill_id, item]));
    assert.equal(itemById.get('superpowers')?.status, 'synced');
    assert.equal(itemById.get('superpowers')?.action, 'symlink');
    assert.equal(
      fs.realpathSync(path.join(homeRoot, '.agents', 'skills', 'superpowers')),
      fs.realpathSync(path.join(packagedSkillsRoot, 'superpowers', 'skills')),
    );
    for (const skillId of [
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
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
      (omaPack?.installer_result?.generated_codex_plugin as { source?: string } | undefined)?.source,
      'opl_generated_agent_interface_bundle_codex_plugin',
    );

    const config = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
    assert.match(config, /\[plugins\."mas@mas-local"\]/);
    assert.match(config, /\[plugins\."mag@mag-local"\]/);
    assert.match(config, /\[plugins\."rca@rca-local"\]/);
    assert.match(config, /\[plugins\."oma@oma-local"\]/);
    for (const [project, marketplaceId, pluginId] of [
      ['med-autoscience', 'mas-local', 'mas'],
      ['med-autogrant', 'mag-local', 'mag'],
      ['redcube-ai', 'rca-local', 'rca'],
    ] as const) {
      const checkoutPath = path.join(familyWorkspace.workspaceRoot, project);
      const marketplaceRoot = path.join(homeRoot, 'opl-state', 'codex-plugin-marketplaces', marketplaceId);
      assert.equal(fs.existsSync(path.join(checkoutPath, '.agents', 'plugins', 'marketplace.json')), false);
      assert.equal(
        fs.realpathSync(path.join(marketplaceRoot, 'plugins', pluginId)),
        fs.realpathSync(path.join(checkoutPath, 'plugins', pluginId)),
      );
      assert.match(config, new RegExp(`\\[marketplaces\\.${marketplaceId}\\]\\nsource_type = "local"\\nsource = "${marketplaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    }
    assert.equal(
      fs.existsSync(path.join(
        homeRoot,
        'opl-state',
        'generated-codex-plugins',
        'oma-local',
        'plugins',
        'oma',
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
