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

function writeOplFlowPackage(root: string) {
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
    recommends: [],
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
    ],
    codex_model_policy: {
      authority: 'opl-flow',
      mode_default: 'auto',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      override_precedence: ['explicit_user_override', 'opl_flow_recommendation'],
      catalog_policy: {},
    },
    migration_policy: {
      trigger: 'explicit_opl_flow_install_update_optimize_or_app_post_update_reconcile',
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
    assert.deepEqual(migration.migration_ids, [
      'upstream-superpowers',
      'ponytail',
      'codexcont-intelligence-enhancement',
      'superpowers-local-method-profile',
      'legacy-development-role-prompts',
    ]);
    assert.equal(migration.backup_active, true);
    assert.equal(fs.existsSync(migration.backup_root), true);
    for (const legacyPath of legacyPaths) assert.equal(fs.existsSync(legacyPath), false, legacyPath);
    assert.doesNotMatch(fs.readFileSync(configPath, 'utf8'), /superpowers|ponytail|codexcont/i);

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
