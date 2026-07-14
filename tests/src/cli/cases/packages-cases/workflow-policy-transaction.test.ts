import { assert, fs, os, path, runCli, runCliAsync, runCliFailure, test } from '../../helpers.ts';
import { formatJsonPayload } from '../../../../../src/kernel/json-file.ts';
import {
  assertManagedPolicyRollbackReady,
  finalizeManagedPolicyRollback,
  rollbackManagedPolicyMigration,
} from '../../../../../src/modules/connect/agent-package-registry-parts/managed-policy-surface.ts';

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeOplFlowPackage(
  root: string,
  options: { includeRemoteCompanions?: boolean } = {},
) {
  const sourceRoot = path.join(root, 'opl-flow-source');
  const policy = {
    schema: 'opl_flow_workflow_policy.v1',
    package: { id: 'opl-flow', version: '0.1.16', owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: 'model-native-test',
    requires: [{
      id: 'opl-base',
      kind: 'base',
      offline_bundle: 'full',
      online_install_default: true,
      activation: 'always',
      source: 'fixture',
    }],
    recommends: options.includeRemoteCompanions
      ? [
          {
            id: 'officecli',
            kind: 'cli',
            offline_bundle: 'full',
            online_install_default: true,
            activation: 'task_routed',
            source: 'fixture-remote',
          },
          {
            id: 'mineru-open-api',
            kind: 'cli',
            offline_bundle: 'full',
            online_install_default: true,
            activation: 'task_routed',
            source: 'fixture-remote',
          },
          {
            id: 'ui-ux-pro-max',
            kind: 'codex_skill',
            offline_bundle: 'full',
            online_install_default: true,
            activation: 'explicit',
            source: 'fixture-remote',
          },
          {
            id: 'mineru-document-extractor',
            kind: 'codex_skill',
            offline_bundle: 'full',
            online_install_default: true,
            activation: 'explicit',
            source: 'fixture-remote',
          },
        ]
      : [],
    compatible_optional: [],
    conflicts: [
      {
        id: 'upstream-superpowers',
        discovery_ids: ['superpowers', 'using-superpowers'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'ponytail',
        discovery_ids: ['ponytail'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'codexcont-intelligence-enhancement',
        discovery_ids: ['codexcont', 'intelligence_enhancement'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
    ],
    retires: [
      {
        id: 'superpowers-local-method-profile',
        discovery_ids: ['superpowers-lite'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'legacy-development-role-prompts',
        discovery_ids: ['planner', 'executor', 'debugger', 'verifier'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
      {
        id: 'legacy-opl-flow-local-plugin',
        discovery_ids: ['opl-flow-local'],
        auto_retire_on_optimize: true,
        reason: 'fixture',
      },
    ],
    codex_model_policy: {
      authority: 'opl-flow',
      mode_default: 'auto',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      override_precedence: ['explicit_user_override', 'opl_flow_recommendation'],
      catalog_policy: {},
    },
    migration_policy: {
      trigger: 'explicit_opl_flow_install_update_optimize_or_generic_app_post_update_reconcile',
      default_action: 'backup_disable_and_remove_from_discovery',
      physical_delete: false,
      receipt_owner: 'opl-framework',
      rollback_required: true,
      keep_override_supported: true,
      fresh_discovery_required: true,
    },
    historical_fingerprints: {
      plugin_ids: ['superpowers', 'ponytail@ponytail', 'opl-flow@opl-flow-local'],
      skill_ids: ['using-superpowers', 'superpowers-lite'],
      service_ids: ['codexcont', 'com.opl.codexcont'],
      config_markers: ['ponytail', 'codexcont', 'intelligence_enhancement'],
      legacy_prompt_ids: ['planner', 'executor', 'debugger', 'verifier'],
    },
  };
  writeFile(path.join(sourceRoot, 'contracts', 'workflow-policy.json'), formatJsonPayload(policy));
  writeFile(path.join(sourceRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'opl-flow',
    version: '0.1.16',
    skills: './skills/',
  }));
  for (const skillId of ['opl-flow', 'codex-ops-kit']) {
    writeFile(path.join(sourceRoot, 'skills', skillId, 'SKILL.md'), `# ${skillId}\n`);
  }
  writeFile(path.join(sourceRoot, 'profile', 'runtime-profile'), '你始终用中文回复。\n');
  writeFile(path.join(sourceRoot, 'profile', 'authoring-source'), '# TASTE\n');
  writeFile(path.join(sourceRoot, 'profile', 'manifest.json'), '{}\n');
  writeFile(path.join(sourceRoot, 'profile', 'modules', 'user-preferences'), 'user preferences\n');
  const manifestPath = path.join(root, 'opl-flow-manifest.json');
  writeFile(manifestPath, formatJsonPayload({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'opl-flow',
    package_id: 'opl-flow',
    display_name: 'OPL Flow',
    publisher: 'one-person-lab',
    version: '0.1.16',
    source: 'first_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'opl-flow',
      plugin_source_path: sourceRoot,
      required_skill_ids: ['opl-flow', 'codex-ops-kit'],
    },
    profile_surface: {
      runtime_profile: { source_path: 'profile/runtime-profile', target_id: 'user_agents_profile' },
      authoring_sources: [{ source_path: 'profile/authoring-source', target_id: 'user_taste_source' }],
      merge_context_paths: ['profile/manifest.json', 'profile/modules/user-preferences', 'profile/authoring-source'],
      existing_profile_policy: 'semantic_merge_required',
    },
    managed_policy_surface: {
      policy_kind: 'opl_flow_workflow_policy',
      source_path: 'contracts/workflow-policy.json',
      schema_path: 'contracts/workflow-policy.schema.json',
    },
    capability_dependencies: [],
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    update_channel: 'manifest_url',
    rollback_ref: 'rollback-ref:opl-flow/generic-package-lkg',
  }));
  writeFile(path.join(sourceRoot, 'contracts', 'workflow-policy.schema.json'), formatJsonPayload({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.test/opl-flow-workflow-policy.schema.json',
    type: 'object',
    required: ['schema', 'package', 'requires', 'recommends', 'compatible_optional', 'conflicts', 'retires', 'migration_policy', 'historical_fingerprints', 'codex_model_policy'],
    properties: {
      schema: { const: 'opl_flow_workflow_policy.v1' },
      package: { type: 'object' },
      requires: { type: 'array' },
      recommends: { type: 'array' },
      compatible_optional: { type: 'array' },
      conflicts: { type: 'array' },
      retires: { type: 'array' },
      migration_policy: { type: 'object' },
      historical_fingerprints: { type: 'object' },
      codex_model_policy: { type: 'object' },
    },
  }));
  return manifestPath;
}

test('generic OPL package transaction owns OPL Flow policy migration without inventing a fresh-install rollback generation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-package-transaction-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(root, 'state');
  const manifestPath = writeOplFlowPackage(root);
  const configPath = path.join(codexHome, 'config.toml');
  const legacyPaths = [
    path.join(home, '.agents', 'skills', 'superpowers'),
    path.join(codexHome, 'plugins', 'cache', 'ponytail'),
    path.join(home, '.codexcont'),
    path.join(codexHome, 'prompts', 'planner.md'),
  ];
  const originalConfig = [
    'model = "user-model"',
    '',
    '[plugins."superpowers@superpowers"]',
    'enabled = true',
    '',
    '[marketplaces.ponytail]',
    'source_type = "local"',
    'source = "/tmp/ponytail"',
    '',
    '[mcp_servers.codexcont]',
    'command = "codexcont"',
    '',
    '[projects."/Users/test/workspace/opl-flow"]',
    'trust_level = "trusted"',
    '',
    '[plugins."documents@openai-primary-runtime"]',
    'enabled = true',
    '',
    '[marketplaces.opl-flow-local]',
    'source_type = "local"',
    'source = "/tmp/opl-flow-local"',
    '',
    '[plugins."opl-flow@opl-flow-local"]',
    'enabled = true',
    '',
  ].join('\n');
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: stateDir,
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };

  try {
    for (const legacyPath of legacyPaths) {
      writeFile(path.extname(legacyPath) ? legacyPath : path.join(legacyPath, 'fixture.txt'), 'legacy\n');
    }
    writeFile(configPath, originalConfig);

    const keepPreview = await runCliAsync([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
      '--keep-migration', 'upstream-superpowers', '--dry-run',
    ], env) as any;
    assert.equal(
      keepPreview.opl_agent_package_install.package_lock.physical_surface.workflow_policy_migration.migration_ids
        .includes('upstream-superpowers'),
      false,
    );

    const installed = await runCliAsync([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');
    assert.equal('workflow_package' in installed, false);
    const migration = installed.opl_agent_package_install.package_lock.physical_surface.workflow_policy_migration;
    assert.equal(migration.status, 'applied');
    assert.deepEqual(migration.dependency_ids, ['opl-base']);
    assert.deepEqual(migration.dependencies, [{
      id: 'opl-base',
      kind: 'base',
      offline_bundle: 'full',
      online_install_default: true,
      activation: 'always',
      source: 'fixture',
    }]);
    assert.deepEqual(migration.migration_ids, [
      'upstream-superpowers',
      'ponytail',
      'codexcont-intelligence-enhancement',
      'superpowers-local-method-profile',
      'legacy-development-role-prompts',
      'legacy-opl-flow-local-plugin',
    ]);
    assert.equal(migration.backup_active, true);
    assert.equal(fs.existsSync(migration.backup_root), true);
    const managedCachePath = installed.opl_agent_package_install.physical_surface.codex_plugin_cache_path;
    assert.equal(
      fs.existsSync(path.join(managedCachePath, '.codex-plugin', 'plugin.json')),
      true,
    );
    assert.equal(
      migration.actions.some((action: { source_ref: string }) =>
        action.source_ref === managedCachePath || action.source_ref.startsWith(`${managedCachePath}${path.sep}`)),
      false,
    );
    for (const legacyPath of legacyPaths) assert.equal(fs.existsSync(legacyPath), false, legacyPath);
    const installedConfig = fs.readFileSync(configPath, 'utf8');
    assert.doesNotMatch(installedConfig, /superpowers|ponytail|codexcont|opl-flow@opl-flow-local/i);
    assert.match(installedConfig, /\[projects\."\/Users\/test\/workspace\/opl-flow"\]/);
    assert.match(installedConfig, /\[plugins\."documents@openai-primary-runtime"\]/);

    const lockIndex = JSON.parse(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'));
    assert.deepEqual(lockIndex.last_known_good_transactions, []);
    assert.equal(fs.existsSync(path.join(stateDir, 'workflow-packages')), false);
    const current = runCli(['packages', 'status', '--package-id', 'opl-flow'], env) as any;
    const statusMaterializer = current.opl_agent_package_status.owner_route_readback.packages[0].materializer;
    assert.equal(statusMaterializer.managed_policy_migration.status, 'applied');
    assert.equal(
      statusMaterializer.managed_policy_migration.policy_sha256,
      migration.policy_sha256,
    );
    assert.equal(
      statusMaterializer.managed_policy_currentness.status,
      'current',
      JSON.stringify(statusMaterializer.managed_policy_currentness, null, 2),
    );
    assert.deepEqual(statusMaterializer.managed_policy_currentness.detected_conflicts, []);

    const restoredPonytailPath = path.join(codexHome, 'plugins', 'cache', 'ponytail');
    writeFile(path.join(restoredPonytailPath, 'restored.txt'), 'restored after install\n');
    const drifted = runCli(['packages', 'status', '--package-id', 'opl-flow'], env) as any;
    const driftedPackage = drifted.opl_agent_package_status.owner_route_readback.packages[0];
    const driftedCurrentness = driftedPackage.materializer.managed_policy_currentness;
    assert.equal(drifted.opl_agent_package_status.status, 'attention_needed');
    assert.equal(drifted.opl_agent_package_status.operational_ready, false);
    assert.equal(drifted.opl_agent_package_status.launch_blocked_reason, 'managed_policy_drifted');
    assert.equal(drifted.opl_agent_package_status.recommended_action, 'repair');
    assert.equal(driftedPackage.lifecycle_ux.recommended_action, 'repair');
    assert.equal(driftedCurrentness.status, 'drifted');
    assert.equal(driftedCurrentness.repair_command, 'opl packages repair --package-id opl-flow');
    assert.deepEqual(driftedCurrentness.detected_conflicts, [{
      migration_id: 'ponytail',
      surface_kind: 'plugin',
      canonical_id: 'ponytail',
      physical_ref: restoredPonytailPath,
    }]);

    const repaired = runCli(['packages', 'repair', '--package-id', 'opl-flow'], env) as any;
    assert.equal(repaired.opl_agent_package_repair.status, 'repaired');
    assert.equal(fs.existsSync(restoredPonytailPath), false);
    const repairedStatus = runCli(['packages', 'status', '--package-id', 'opl-flow'], env) as any;
    const repairedPackage = repairedStatus.opl_agent_package_status.owner_route_readback.packages[0];
    assert.equal(repairedStatus.opl_agent_package_status.operational_ready, true);
    assert.equal(repairedPackage.materializer.managed_policy_currentness.status, 'current');
    assert.notEqual(repairedPackage.lifecycle_ux.recommended_action, 'repair');

    const postInstallConfig = [
      'reasoning_effort = "high"',
      '',
      fs.readFileSync(configPath, 'utf8').trimEnd(),
      '',
      '[mcp_servers.post_install]',
      'command = "post-install"',
      '',
    ].join('\n');
    fs.writeFileSync(configPath, postInstallConfig, 'utf8');

    const rollbackFailure = runCliFailure(['packages', 'rollback', 'opl-flow'], env);
    assert.equal(rollbackFailure.payload.error.details.failure_code, 'agent_package_last_known_good_missing');
    const status = runCli(['packages', 'status', '--package-id', 'opl-flow'], env) as any;
    assert.equal(status.opl_agent_package_status.installed_package_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('fresh install rollback has no virtual target', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-clean-prestate-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    const manifestPath = writeOplFlowPackage(root);
    await runCliAsync([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env);
    assert.equal(fs.existsSync(path.join(codexHome, 'config.toml')), true);

    const lockIndex = JSON.parse(fs.readFileSync(path.join(env.OPL_STATE_DIR, 'agent-package-locks.json'), 'utf8'));
    assert.deepEqual(lockIndex.last_known_good_transactions, []);
    const failure = runCliFailure(['packages', 'rollback', 'opl-flow'], env);
    assert.equal(failure.payload.error.details.failure_code, 'agent_package_last_known_good_missing');
    assert.equal(runCli(['packages', 'status', '--package-id', 'opl-flow'], env)
      .opl_agent_package_status.installed_package_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('managed policy rollback helpers refuse conflicting TOML tables and recreated physical surfaces', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-policy-conflict-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const legacyPath = path.join(home, '.agents', 'skills', 'superpowers');
  const configPath = path.join(codexHome, 'config.toml');
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    writeFile(path.join(legacyPath, 'legacy.txt'), 'legacy\n');
    writeFile(configPath, '[marketplaces.ponytail]\nsource = "/legacy"\n');
    const installed = await runCliAsync([
      'packages', 'install', '--manifest-url', writeOplFlowPackage(root), '--trust-tier', 'first_party',
    ], env) as any;
    const migration = installed.opl_agent_package_install.physical_surface.workflow_policy_migration;

    fs.appendFileSync(configPath, '\n[marketplaces.ponytail]\nsource = "/replacement"\n', 'utf8');
    writeFile(path.join(legacyPath, 'replacement.txt'), 'replacement\n');

    assert.equal(fs.existsSync(installed.opl_agent_package_install.physical_surface.codex_plugin_cache_path), true);

    assert.throws(
      () => rollbackManagedPolicyMigration(migration),
      /conflicting TOML table/,
    );
    assert.equal(fs.readFileSync(path.join(legacyPath, 'replacement.txt'), 'utf8'), 'replacement\n');
    assert.match(fs.readFileSync(configPath, 'utf8'), /replacement/);
    assert.equal(fs.existsSync(migration.backup_root), true);

    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, 'utf8').replace(/\n\[marketplaces\.ponytail\]\nsource = "\/replacement"\n/, '\n'),
      'utf8',
    );
    assert.throws(
      () => rollbackManagedPolicyMigration(migration),
      /target was recreated/,
    );
    assert.equal(fs.readFileSync(path.join(legacyPath, 'replacement.txt'), 'utf8'), 'replacement\n');

    fs.rmSync(legacyPath, { recursive: true, force: true });
    assert.doesNotThrow(() => assertManagedPolicyRollbackReady(migration));
    const retained = rollbackManagedPolicyMigration(migration, { retainBackups: true });
    assert.equal(retained.backup_active, true);
    assert.equal(fs.readFileSync(path.join(legacyPath, 'legacy.txt'), 'utf8'), 'legacy\n');
    assert.equal(fs.existsSync(retained.backup_root!), true);
    const finalized = finalizeManagedPolicyRollback(retained);
    assert.equal(finalized.backup_active, false);
    assert.equal(fs.existsSync(retained.backup_root!), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('installed-source optimize is offline, dry-run safe, and explicitly rolls back policy and profile state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-installed-source-optimize-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(root, 'state');
  const fakeBin = path.join(root, 'fake-bin');
  const commandLog = path.join(root, 'remote-command.log');
  const configPath = path.join(codexHome, 'config.toml');
  const manifestPath = writeOplFlowPackage(root, { includeRemoteCompanions: true });
  const sourceRoot = path.join(root, 'opl-flow-source');
  const profilePath = path.join(codexHome, 'AGENTS.md');
  const conflictPath = path.join(codexHome, 'plugins', 'cache', 'ponytail');
  const baseEnv = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: stateDir,
    OPL_COMPANION_SOURCES_ROOT: path.join(codexHome, 'opl-companion-sources'),
  };
  try {
    writeFile(configPath, '[projects."/tmp/fixture"]\ntrust_level = "trusted"\n');
    await runCliAsync([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], { ...baseEnv, OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1' });
    const originalProfile = fs.readFileSync(profilePath, 'utf8');

    writeFile(path.join(sourceRoot, 'profile', 'runtime-profile'), '你始终用中文回复。\nOptimize fixture.\n');
    writeFile(path.join(conflictPath, 'restored.txt'), 'restore after rollback\n');
    fs.appendFileSync(
      configPath,
      '\n[marketplaces.ponytail]\nsource_type = "local"\nsource = "/tmp/ponytail-optimize"\n',
      'utf8',
    );
    for (const command of ['git', 'curl', 'npm']) {
      const commandPath = path.join(fakeBin, command);
      writeFile(commandPath, `#!/bin/sh\nprintf '%s\\n' '${command}' >> '${commandLog}'\nexit 97\n`);
      fs.chmodSync(commandPath, 0o755);
    }
    const optimizeEnv = {
      ...baseEnv,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '0',
      OPL_COMPANION_SKIP_LATEST_LOOKUP: '0',
    };
    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const ledgerPath = path.join(stateDir, 'agent-package-lifecycle-ledger.json');
    const beforeDryRun = {
      lock: fs.readFileSync(lockPath, 'utf8'),
      ledger: fs.readFileSync(ledgerPath, 'utf8'),
      config: fs.readFileSync(configPath, 'utf8'),
      profile: fs.readFileSync(profilePath, 'utf8'),
    };
    const preview = runCli(['packages', 'optimize', 'opl-flow', '--dry-run'], optimizeEnv) as any;
    assert.equal(preview.opl_agent_package_optimize.status, 'validated_no_write');
    assert.equal(preview.opl_agent_package_optimize.source_selection, 'installed_package_lock');
    assert.equal(preview.opl_agent_package_optimize.network_accessed, false);
    assert.equal(preview.opl_agent_package_optimize.remote_dependency_policy, 'forbidden');
    assert.equal(fs.readFileSync(lockPath, 'utf8'), beforeDryRun.lock);
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), beforeDryRun.ledger);
    assert.equal(fs.readFileSync(configPath, 'utf8'), beforeDryRun.config);
    assert.equal(fs.readFileSync(profilePath, 'utf8'), beforeDryRun.profile);

    const optimized = runCli(['packages', 'optimize', 'opl-flow'], optimizeEnv) as any;
    const optimization = optimized.opl_agent_package_optimize;
    assert.equal(optimization.status, 'optimized');
    assert.equal(optimization.lifecycle_receipt.source_selection, 'installed_package_lock');
    assert.equal(optimization.lifecycle_receipt.network_accessed, false);
    assert.equal(optimization.lifecycle_receipt.remote_dependency_policy, 'forbidden');
    assert.equal(fs.existsSync(commandLog), false, 'optimize must not invoke git, curl, or npm');
    assert.equal(fs.existsSync(conflictPath), false);
    assert.doesNotMatch(fs.readFileSync(configPath, 'utf8'), /marketplaces\.ponytail/);
    assert.match(fs.readFileSync(profilePath, 'utf8'), /Optimize fixture/);
    assert.equal(
      JSON.parse(fs.readFileSync(lockPath, 'utf8')).last_known_good_transactions.length,
      1,
    );

    const rollbackPreviewState = {
      lock: fs.readFileSync(lockPath, 'utf8'),
      ledger: fs.readFileSync(ledgerPath, 'utf8'),
      config: fs.readFileSync(configPath, 'utf8'),
      profile: fs.readFileSync(profilePath, 'utf8'),
    };
    const rollbackPreview = runCli(['packages', 'rollback', 'opl-flow', '--dry-run'], optimizeEnv) as any;
    assert.equal(rollbackPreview.opl_agent_package_rollback.status, 'validated_no_write');
    assert.equal(rollbackPreview.opl_agent_package_rollback.network_accessed, false);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), rollbackPreviewState.lock);
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), rollbackPreviewState.ledger);
    assert.equal(fs.readFileSync(configPath, 'utf8'), rollbackPreviewState.config);
    assert.equal(fs.readFileSync(profilePath, 'utf8'), rollbackPreviewState.profile);

    fs.chmodSync(stateDir, 0o555);
    const rollbackFailure = runCliFailure(['packages', 'rollback', 'opl-flow'], optimizeEnv);
    fs.chmodSync(stateDir, 0o755);
    assert.notEqual(rollbackFailure.status, 0);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), rollbackPreviewState.lock);
    assert.equal(fs.readFileSync(ledgerPath, 'utf8'), rollbackPreviewState.ledger);
    assert.doesNotMatch(fs.readFileSync(configPath, 'utf8'), /marketplaces\.ponytail/);
    assert.match(fs.readFileSync(profilePath, 'utf8'), /Optimize fixture/);
    assert.equal(fs.existsSync(conflictPath), false);

    const rolledBack = runCli(['packages', 'rollback', 'opl-flow'], optimizeEnv) as any;
    const rollback = rolledBack.opl_agent_package_rollback;
    assert.equal(rollback.status, 'rolled_back');
    assert.equal(rollback.source_selection, 'installed_package_lock');
    assert.equal(rollback.network_accessed, false);
    assert.equal(rollback.remote_dependency_policy, 'forbidden');
    assert.equal(fs.existsSync(commandLog), false, 'optimize rollback must remain offline');
    assert.equal(fs.readFileSync(path.join(conflictPath, 'restored.txt'), 'utf8'), 'restore after rollback\n');
    assert.match(fs.readFileSync(configPath, 'utf8'), /marketplaces\.ponytail/);
    assert.equal(fs.readFileSync(profilePath, 'utf8'), originalProfile);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(lockPath, 'utf8')).last_known_good_transactions,
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('failed installed-source optimize restores policy and profile state before returning failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-flow-optimize-failure-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const stateDir = path.join(root, 'state');
  const configPath = path.join(codexHome, 'config.toml');
  const profilePath = path.join(codexHome, 'AGENTS.md');
  const conflictPath = path.join(codexHome, 'plugins', 'cache', 'ponytail');
  const manifestPath = writeOplFlowPackage(root);
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_STATE_DIR: stateDir,
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    writeFile(configPath, '[projects."/tmp/fixture"]\ntrust_level = "trusted"\n');
    await runCliAsync([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env);
    const originalProfile = fs.readFileSync(profilePath, 'utf8');
    writeFile(path.join(root, 'opl-flow-source', 'profile', 'runtime-profile'), 'updated on failed optimize\n');
    writeFile(path.join(conflictPath, 'restored.txt'), 'must survive failed optimize\n');
    fs.appendFileSync(configPath, '\n[marketplaces.ponytail]\nsource = "/tmp/failure"\n', 'utf8');
    const lockBefore = fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8');
    const ledgerBefore = fs.readFileSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json'), 'utf8');
    fs.chmodSync(stateDir, 0o555);
    const failure = runCliFailure(['packages', 'optimize', 'opl-flow'], env);
    fs.chmodSync(stateDir, 0o755);
    assert.notEqual(failure.status, 0);
    assert.equal(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'), lockBefore);
    assert.equal(fs.readFileSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json'), 'utf8'), ledgerBefore);
    assert.equal(fs.readFileSync(profilePath, 'utf8'), originalProfile);
    assert.equal(fs.readFileSync(path.join(conflictPath, 'restored.txt'), 'utf8'), 'must survive failed optimize\n');
    assert.match(fs.readFileSync(configPath, 'utf8'), /marketplaces\.ponytail/);
  } finally {
    if (fs.existsSync(stateDir)) fs.chmodSync(stateDir, 0o755);
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
