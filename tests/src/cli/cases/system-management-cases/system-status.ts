import { assert, assertBlockedDeveloperModeSurface, createCodexConfigFixture, createFakeCodexFixture, fs, os, path, runCli, test } from './shared.ts';

test('system exposes user-facing engine and managed-path status from OPL defaults', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-environment-home-'));
  const stateRoot = path.join(homeRoot, 'opl-state');
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.4-opl',
    reasoningEffort: 'high',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        OPL_STATE_DIR: stateRoot,
        OPL_DEVELOPER_MODE_GH_BINARY: path.join(homeRoot, 'missing-gh'),
        OPL_CODEX_CLI_LATEST_VERSION: '0.125.0',
        OPL_FAMILY_RUNTIME_PROVIDER: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        surface_id: string;
        overall_status: string;
        core_engines: {
          codex: {
            installed: boolean;
            version: string | null;
            parsed_version: string | null;
            minimum_version: string;
            version_status: string;
            latest_version: string | null;
            latest_version_status: string;
            update_available: boolean;
            config_path: string | null;
            default_model: string | null;
            default_reasoning_effort: string | null;
            provider_base_url: string | null;
            health_status: string;
            issues: string[];
            diagnostics: string[];
            runtime_substrate_updater: {
              global_toolchain_mutation_allowed: boolean;
              platform_package_materialization_policy: {
                package_name: string;
                target_triple: string;
                source_of_truth: string;
                explicit_install_when_optional_payload_missing: boolean;
                install_scope: string;
                global_toolchain_mutation_allowed: boolean;
                can_claim_domain_ready: boolean;
                can_claim_app_release_ready: boolean;
                can_claim_production_ready: boolean;
              };
            };
          };
          family_runtime_provider: {
            provider_kind: string;
            health_status: string;
            status: string;
            degraded_reason: string | null;
            details: {
              worker_ready: boolean;
            };
          };
        };
        native_helpers: {
          health_status: string;
          lifecycle: {
            status: string;
            commands: {
              repair: string;
            };
          };
          runtime: {
            status: string;
            discovery: {
              repair_command: string;
            };
          };
          issues: string[];
        };
        gui_shell: {
          strategy: string;
          service_dependency: string;
          local_product_api_retired: boolean;
        };
        developer_mode: any;
        managed_paths: {
          state_dir: string;
          modules_root: string;
          runtime_modes_file: string;
          workspace_registry_file: string;
        };
      };
    };

    assert.equal(output.system.surface_id, 'opl_system');
    assert.equal(output.system.overall_status, 'attention_needed');
    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.version, 'codex-cli 0.125.0');
    assert.equal(output.system.core_engines.codex.parsed_version, '0.125.0');
    assert.equal(output.system.core_engines.codex.minimum_version, '0.125.0');
    assert.equal(output.system.core_engines.codex.version_status, 'compatible');
    assert.equal(output.system.core_engines.codex.latest_version, '0.125.0');
    assert.equal(output.system.core_engines.codex.latest_version_status, 'current');
    assert.equal(output.system.core_engines.codex.update_available, false);
    assert.equal(
      output.system.core_engines.codex.config_path,
      codexConfigFixture.configPath,
    );
    assert.equal(output.system.core_engines.codex.default_model, 'gpt-5.4-opl');
    assert.equal(output.system.core_engines.codex.default_reasoning_effort, 'high');
    assert.equal(
      output.system.core_engines.codex.provider_base_url,
      'https://codex-opl.example.test/v1',
    );
    assert.equal(output.system.core_engines.codex.health_status, 'ready');
    assert.deepEqual(output.system.core_engines.codex.issues, []);
    assert.deepEqual(output.system.core_engines.codex.diagnostics, []);
    const materializationPolicy = output.system.core_engines.codex
      .runtime_substrate_updater.platform_package_materialization_policy;
    assert.equal(materializationPolicy.package_name, '@openai/codex-darwin-arm64');
    assert.equal(materializationPolicy.target_triple, 'aarch64-apple-darwin');
    assert.equal(materializationPolicy.source_of_truth, 'npm_optional_dependency_or_preseeded_platform_tarball');
    assert.equal(materializationPolicy.explicit_install_when_optional_payload_missing, true);
    assert.equal(materializationPolicy.install_scope, 'app_owned_stage_prefix_only');
    assert.equal(materializationPolicy.global_toolchain_mutation_allowed, false);
    assert.equal(materializationPolicy.can_claim_domain_ready, false);
    assert.equal(materializationPolicy.can_claim_app_release_ready, false);
    assert.equal(materializationPolicy.can_claim_production_ready, false);
    assert.equal(Object.hasOwn(output.system.core_engines, 'hermes'), false);
    assert.equal(output.system.core_engines.family_runtime_provider.provider_kind, 'temporal');
    assert.equal(output.system.core_engines.family_runtime_provider.health_status, 'attention_needed');
    assert.equal(output.system.core_engines.family_runtime_provider.status, 'provider_code_landed_unconfigured');
    assert.equal(output.system.core_engines.family_runtime_provider.degraded_reason, 'temporal_runtime_not_configured');
    assert.equal(output.system.core_engines.family_runtime_provider.details.worker_ready, false);
    assert.equal(output.system.native_helpers.lifecycle.status, 'ready_to_build');
    assert.equal(output.system.native_helpers.lifecycle.commands.repair, 'npm run native:repair');
    assert.equal(output.system.native_helpers.runtime.discovery.repair_command, 'npm run native:repair');
    assert.equal(['ready', 'attention_needed'].includes(output.system.native_helpers.health_status), true);
    assert.equal(Array.isArray(output.system.native_helpers.issues), true);
    assert.equal(output.system.gui_shell.strategy, 'aionui_remote_webui');
    assert.equal(output.system.gui_shell.service_dependency, 'none');
    assert.equal(output.system.gui_shell.local_product_api_retired, true);
    assertBlockedDeveloperModeSurface(output.system.developer_mode);
    assert.equal(output.system.managed_paths.state_dir, stateRoot);
    assert.equal(output.system.managed_paths.modules_root, path.join(stateRoot, 'modules'));
    assert.equal(output.system.managed_paths.runtime_modes_file, path.join(stateRoot, 'runtime-modes.json'));
    assert.equal(
      output.system.managed_paths.workspace_registry_file,
      path.join(stateRoot, 'workspace-registry.json'),
    );
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system reports compatible Codex CLI as update-available when npm latest is newer', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-latest-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.130.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        OPL_CODEX_CLI_LATEST_VERSION: '0.134.0',
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        core_engines: {
          codex: {
            version_status: string;
            health_status: string;
            issues: string[];
            diagnostics: string[];
            latest_version: string | null;
            latest_version_status: string;
            update_available: boolean;
          };
        };
      };
    };

    const codex = output.system.core_engines.codex;
    assert.equal(codex.version_status, 'compatible');
    assert.equal(codex.health_status, 'ready');
    assert.deepEqual(codex.issues, []);
    assert.equal(codex.latest_version, '0.134.0');
    assert.equal(codex.latest_version_status, 'outdated');
    assert.equal(codex.update_available, true);
    assert.equal(codex.diagnostics.includes('codex_cli_latest_update_available'), true);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system flags outdated Codex CLI versions as attention needed', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-outdated-codex-home-'));
  const codexConfigFixture = createCodexConfigFixture({
    model: 'gpt-5.5',
    reasoningEffort: 'xhigh',
    baseUrl: 'https://codex-opl.example.test/v1',
    apiKey: 'codex-opl-key',
  });
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.121.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: codexConfigFixture.codexHome,
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        overall_status: string;
        core_engines: {
          codex: {
            installed: boolean;
            version: string | null;
            parsed_version: string | null;
            minimum_version: string;
            version_status: string;
            health_status: string;
            issues: string[];
          };
        };
      };
    };

    assert.equal(output.system.overall_status, 'attention_needed');
    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.version, 'codex-cli 0.121.0');
    assert.equal(output.system.core_engines.codex.parsed_version, '0.121.0');
    assert.equal(output.system.core_engines.codex.minimum_version, '0.125.0');
    assert.equal(output.system.core_engines.codex.version_status, 'outdated');
    assert.equal(output.system.core_engines.codex.health_status, 'attention_needed');
    assert.deepEqual(output.system.core_engines.codex.issues, ['codex_cli_version_outdated']);
  } finally {
    fs.rmSync(codexConfigFixture.codexHome, { recursive: true, force: true });
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('system treats a compatible Codex CLI as ready even before reading a local config file', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-no-config-home-'));
  const codexFixture = createFakeCodexFixture(`
if [[ "$1" == "--version" ]]; then
  echo "codex-cli 0.125.0"
  exit 0
fi
echo "Unsupported codex fixture command: $*" >&2
exit 1
`);

  try {
    const output = runCli(
      ['system'],
      {
        HOME: homeRoot,
        CODEX_HOME: path.join(homeRoot, 'codex-home'),
        PATH: `${codexFixture.fixtureRoot}:/usr/bin:/bin`,
      },
    ) as {
      system: {
        core_engines: {
          codex: {
            installed: boolean;
            config_path: string | null;
            config_status: string;
            health_status: string;
            issues: string[];
          };
        };
      };
    };

    assert.equal(output.system.core_engines.codex.installed, true);
    assert.equal(output.system.core_engines.codex.config_path, null);
    assert.equal(output.system.core_engines.codex.config_status, 'not_detected');
    assert.equal(output.system.core_engines.codex.health_status, 'ready');
    assert.deepEqual(output.system.core_engines.codex.issues, []);
  } finally {
    fs.rmSync(codexFixture.fixtureRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});
