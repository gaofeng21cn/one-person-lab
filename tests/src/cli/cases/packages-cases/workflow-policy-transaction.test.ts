import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';
import { formatJsonPayload } from '../../../../../src/kernel/json-file.ts';

function withEnvironment<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeInstalledCodexPluginManager(
  root: string,
  sourcePath: string,
  pluginId = 'fixture.opl-flow@fixture-marketplace',
  options: { allowMutations?: boolean } = {},
) {
  const binary = path.join(root, 'fake-codex-installed-plugin-manager');
  const marketplaceId = pluginId.split('@').slice(1).join('@');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(binary, [
    '#!/usr/bin/env node',
    `const allowMutations = ${JSON.stringify(options.allowMutations === true)};`,
    "const command = process.argv.slice(2).join(' ');",
    "const readOnly = command === 'plugin list --json' || command === 'plugin marketplace list --json';",
    "const mutation = /^plugin (add|remove|marketplace (add|remove|upgrade)) /.test(command);",
    'if (!readOnly && !(allowMutations && mutation)) process.exit(2);',
    "if (command === 'plugin marketplace list --json') {",
    `  process.stdout.write(JSON.stringify({ marketplaces: [{ name: ${JSON.stringify(marketplaceId)}, marketplaceSource: { sourceType: 'local', source: ${JSON.stringify(marketplaceId)} } }] }));`,
    '  process.exit(0);',
    '}',
    `process.stdout.write(JSON.stringify({ installed: [{`,
    `  pluginId: ${JSON.stringify(pluginId)},`,
    "  version: '0.1.16',",
    '  installed: true,',
    '  enabled: true,',
    `  source: { source: 'local', path: ${JSON.stringify(sourcePath)} },`,
    `  marketplaceSource: { sourceType: 'local', source: ${JSON.stringify(marketplaceId)} },`,
    '}], available: [] }));',
  ].join('\n'), { mode: 0o755 });
  return binary;
}

function writeOplFlowPackage(
  root: string,
  options: {
    includeManagedSkillCompanion?: boolean;
    packageVersion?: string;
    marketplaceId?: string;
  } = {},
) {
  const sourceRoot = path.join(root, 'fixture.opl-flow-source');
  const packageVersion = options.packageVersion ?? '0.1.16';
  const marketplaceId = options.marketplaceId ?? 'fixture-marketplace';
  const experienceBaseline = options.includeManagedSkillCompanion ? [{
    id: 'ui-ux-pro-max',
    kind: 'codex_skill',
    offline_bundle: 'full',
    online_install_default: true,
    activation: 'explicit',
    source: 'https://github.com/fixture/ui-ux-pro-max',
    source_path: 'skill',
    bundle_id: 'fixture-experience-baseline',
    install_source: 'framework_git_projection',
    lifecycle_owner: 'opl-framework',
    readiness_adapter: 'codex_skill_payload',
    conflict_policy: 'managed_reconcile',
    credential_policy: 'none',
  }] : [];
  const policy = {
    schema: 'opl_flow_workflow_policy.v4',
    package: { id: 'fixture.opl-flow', version: packageVersion, owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: 'model-native-test',
    provides: [
      {
        id: 'fixture.opl-flow',
        kind: 'codex_plugin',
        online_install_default: true,
        activation: 'always',
        source: 'package:fixture.opl-flow',
        owner: 'opl-flow',
        version_requirement: `=${packageVersion}`,
        install_source: 'package_payload',
      },
      ...['fixture.opl-flow', 'codex-ops-kit'].map((skillId) => ({
        id: skillId,
        kind: 'codex_skill',
        online_install_default: true,
        activation: 'task_routed',
        source: `package:fixture.opl-flow/skills/${skillId}`,
        owner: 'opl-flow',
        version_requirement: `=${packageVersion}`,
        install_source: 'package_payload',
      })),
    ],
    requires: [
      {
        id: 'opl-base',
        kind: 'base',
        offline_bundle: 'full',
        online_install_default: true,
        activation: 'always',
        source: 'fixture',
      },
    ],
    experience_baseline: experienceBaseline,
    compatible_optional: [],
    capability_bundles: [
      ...(experienceBaseline.length > 0 ? [{
        id: 'fixture-experience-baseline',
        label: 'Fixture experience baseline',
        relationship: 'experience_baseline',
        member_refs: experienceBaseline.map((entry) => `${entry.kind}:${entry.id}`),
        online_materialization: 'members_marked_default',
        full_distribution: 'members_marked_full',
        readiness: {
          aggregation: 'all_members',
          absence_effect: 'degraded_non_blocking',
          repair_policy: 'framework_or_owner_adapter',
        },
      }] : []),
    ],
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
        surface_kinds: ['plugin', 'config_table', 'service', 'prompt_or_agent'],
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
        id: 'legacy-fixture.opl-flow-local-plugin',
        discovery_ids: ['fixture.opl-flow-local'],
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
      plugin_ids: ['superpowers', 'ponytail@ponytail', 'fixture.opl-flow@fixture.opl-flow-local'],
      skill_ids: ['using-superpowers', 'superpowers-lite'],
      service_ids: ['codexcont', 'com.opl.codexcont'],
      config_markers: ['ponytail', 'codexcont', 'intelligence_enhancement'],
      legacy_prompt_ids: ['planner', 'executor', 'debugger', 'verifier'],
    },
  };
  writeFile(path.join(sourceRoot, 'contracts', 'workflow-policy.json'), formatJsonPayload(policy));
  writeFile(path.join(sourceRoot, '.codex-plugin', 'plugin.json'), formatJsonPayload({
    name: 'fixture.opl-flow',
    version: packageVersion,
    skills: './skills/',
  }));
  for (const skillId of ['fixture.opl-flow', 'codex-ops-kit']) {
    writeFile(path.join(sourceRoot, 'skills', skillId, 'SKILL.md'), `# ${skillId}\n`);
  }
  writeFile(path.join(sourceRoot, 'profile', 'runtime-profile'), '你始终用中文回复。\n');
  writeFile(path.join(sourceRoot, 'profile', 'authoring-source'), '# TASTE\n');
  writeFile(path.join(sourceRoot, 'profile', 'manifest.json'), '{}\n');
  writeFile(path.join(sourceRoot, 'profile', 'modules', 'user-preferences'), 'user preferences\n');
  const manifestPath = path.join(root, 'fixture.opl-flow-manifest.json');
  writeFile(manifestPath, formatJsonPayload({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'fixture.opl-flow',
    package_id: 'fixture.opl-flow',
    display_name: 'OPL Flow',
    publisher: 'one-person-lab',
    version: packageVersion,
    source: 'first_party',
    carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
    codex_surface: {
      plugin_id: 'fixture.opl-flow',
      plugin_source_path: sourceRoot,
      required_skill_ids: ['fixture.opl-flow', 'codex-ops-kit'],
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: `fixture.opl-flow@${marketplaceId}`,
        executor_route: 'codex_cli',
        marketplace_source: marketplaceId,
        publication_ref: 'ghcr.io/fixture/packages/fixture.opl-flow:latest-stable',
      },
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
    rollback_ref: 'rollback-ref:fixture.opl-flow/generic-package-lkg',
  }));
  writeFile(path.join(sourceRoot, 'contracts', 'workflow-policy.schema.json'), formatJsonPayload({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.test/fixture.opl-flow-workflow-policy.schema.json',
    type: 'object',
    required: [
      'schema',
      'package',
      'requires',
      'experience_baseline',
      'capability_bundles',
      'compatible_optional',
      'conflicts',
      'retires',
      'migration_policy',
      'historical_fingerprints',
      'codex_model_policy',
      'provides',
    ],
    properties: {
      schema: {
        const: 'opl_flow_workflow_policy.v4',
      },
      package: { type: 'object' },
      provides: { type: 'array' },
      requires: { type: 'array' },
      experience_baseline: { type: 'array' },
      capability_bundles: { type: 'array' },
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

test('installed native descriptor projects Flow policy planes and model recommendation without a legacy lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-native-descriptor-policy-'));
  const home = path.join(root, 'home');
  const sourceRoot = path.join(root, 'fixture.opl-flow-source');
  const manifestPath = writeOplFlowPackage(root, {
    includeManagedSkillCompanion: true,
  });
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManager(root, sourceRoot),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    const configPath = path.join(env.CODEX_HOME, 'config.toml');
    const originalConfig = [
      'model = "gpt-5.6-sol"',
      'model_reasoning_effort = "xhigh"',
      '',
      '[features]',
      'memories = true',
      '',
    ].join('\n');
    fs.mkdirSync(env.CODEX_HOME, { recursive: true });
    fs.writeFileSync(configPath, originalConfig, 'utf8');
    fs.copyFileSync(manifestPath, path.join(sourceRoot, 'opl-package.json'));
    const packageStatus = (runCli([
      'packages',
      'status',
      '--package-id',
      'fixture.opl-flow',
    ], env) as any).opl_agent_package_status;

    assert.equal(packageStatus.installed_readiness.installed, true);
    assert.equal(packageStatus.managed_policy_currentness.status, 'drifted');
    assert.equal(packageStatus.managed_policy_currentness.required_dependencies_operational, true);
    assert.deepEqual(packageStatus.package_operational, {
      status: 'operational',
      operational_ready: true,
      failure_reason: null,
      repair_command: null,
    });
    assert.equal(packageStatus.experience_baseline.status, 'degraded');
    assert.deepEqual(packageStatus.experience_baseline.failure_ids, ['ui-ux-pro-max']);
    assert.equal(packageStatus.specialized_capabilities.status, 'not_declared');
    assert.deepEqual(packageStatus.model_projection, {
      surface_kind: 'opl_codex_model_policy_projection.v1',
      authority: 'opl-flow',
      mode_default: 'auto',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      override_precedence: ['explicit_user_override', 'opl_flow_recommendation'],
      catalog_policy: {},
      configured_default_role: 'recommendation_only',
      effective_selection: {
        mode: 'fixed',
        model: 'gpt-5.6-sol',
        reasoning_effort: 'xhigh',
        source: 'local_codex_config',
        overrides_recommendation: true,
      },
      role: 'package_recommendation_consumed_from_framework_projection',
    });
    assert.equal(fs.readFileSync(configPath, 'utf8'), originalConfig);
    assert.equal(packageStatus.operational_ready, true);
    assert.equal(packageStatus.launch_allowed, true);
    assert.equal(packageStatus.launch_state, 'degraded');
    assert.equal(packageStatus.launch_state_reason, 'experience_baseline_degraded');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('public packages repair runs the native carrier and preserves an owner-managed policy Skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-local-policy-repair-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const sourceRoot = path.join(root, 'fixture.opl-flow-source');
  const manifestPath = writeOplFlowPackage(root, {
    includeManagedSkillCompanion: true,
  });
  fs.copyFileSync(manifestPath, path.join(sourceRoot, 'opl-package.json'));
  const skillRoot = path.join(home, '.agents', 'skills', 'ui-ux-pro-max');
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), [
    '---',
    'name: ui-ux-pro-max',
    'description: Managed policy repair fixture.',
    '---',
    '',
    '# UI UX Pro Max',
    '',
  ].join('\n'), 'utf8');
  try {
    const env = {
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManager(
        root,
        sourceRoot,
        'fixture.opl-flow@fixture-marketplace',
        { allowMutations: true },
      ),
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    };
    withEnvironment({
      HOME: home,
      CODEX_HOME: codexHome,
      OPL_STATE_DIR: path.join(root, 'state'),
      OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
    }, () => {
      const repair = (runCli(['packages', 'repair', 'fixture.opl-flow'], env) as any)
        .opl_agent_package_repair;

      assert.equal(repair?.status, 'repaired');
      assert.equal(repair?.configured_carrier.operation, 'repair');
      assert.equal(repair?.configured_carrier.native_action_dispatched, true);
      assert.deepEqual(repair?.configured_carrier.native_command, [
        'plugin',
        'add',
        'fixture.opl-flow@fixture-marketplace',
        '--json',
      ]);
      assert.equal(repair?.managed_policy_repair?.status, 'current');
      assert.equal(repair?.managed_policy_repair?.writes_performed, false);
      assert.equal(repair?.managed_policy_repair?.currentness.experience_baseline?.status, 'current');
      assert.equal(fs.lstatSync(skillRoot).isDirectory(), true);
      assert.equal(fs.existsSync(path.join(codexHome, 'skills', 'ui-ux-pro-max')), false);
      assert.match(fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8'), /Managed policy repair fixture/);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('installed native descriptor excludes its active marketplace from historical self-carrier drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-active-self-carrier-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const marketplaceId = 'fixture.opl-flow-local';
  const packageRoot = path.join(
    codexHome,
    'plugins',
    'cache',
    marketplaceId,
    'fixture.opl-flow',
    '0.1.16',
  );
  const manifestPath = writeOplFlowPackage(packageRoot, { marketplaceId });
  const sourceRoot = path.join(packageRoot, 'fixture.opl-flow-source');
  const configPath = path.join(codexHome, 'config.toml');
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManager(
      root,
      sourceRoot,
      `fixture.opl-flow@${marketplaceId}`,
    ),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    fs.mkdirSync(codexHome, { recursive: true });
    fs.copyFileSync(manifestPath, path.join(sourceRoot, 'opl-package.json'));
    fs.writeFileSync(configPath, [
      `[marketplaces.${marketplaceId}]`,
      `source = ${JSON.stringify(sourceRoot)}`,
      '',
      `[plugins.\"fixture.opl-flow@${marketplaceId}\"]`,
      'enabled = true',
      '',
    ].join('\n'), 'utf8');

    const packageStatus = (runCli([
      'packages',
      'status',
      '--package-id',
      'fixture.opl-flow',
    ], env) as any).opl_agent_package_status;

    assert.equal(packageStatus.managed_policy_currentness.status, 'current');
    assert.deepEqual(packageStatus.managed_policy_currentness.detected_conflicts, []);
    assert.equal(packageStatus.operational_ready, true);
    assert.equal(packageStatus.launch_allowed, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('managed policy ignores inactive plugin payloads and preserves a manual Ponytail Skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-active-conflicts-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const sourceRoot = path.join(root, 'fixture.opl-flow-source');
  const manifestPath = writeOplFlowPackage(root, {});
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManager(root, sourceRoot),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    fs.copyFileSync(manifestPath, path.join(sourceRoot, 'opl-package.json'));
    writeFile(path.join(home, '.agents', 'skills', 'ponytail', 'SKILL.md'), '# Manual Ponytail\n');
    writeFile(path.join(codexHome, '.tmp', 'plugins', 'plugins', 'superpowers', 'SKILL.md'), '# Cache\n');
    writeFile(path.join(codexHome, 'plugins', 'cache', 'superpowers', 'SKILL.md'), '# Cache\n');
    writeFile(path.join(codexHome, 'config.toml'), [
      '[marketplaces.superpowers]',
      'source = "cache-only"',
      '',
      '[plugins."superpowers@superpowers"]',
      'enabled = false',
      '',
    ].join('\n'));

    const inactiveStatus = (runCli([
      'packages',
      'status',
      '--package-id',
      'fixture.opl-flow',
    ], env) as any).opl_agent_package_status;
    assert.equal(inactiveStatus.managed_policy_currentness.status, 'current');
    assert.deepEqual(inactiveStatus.managed_policy_currentness.detected_conflicts, []);

    fs.appendFileSync(path.join(codexHome, 'config.toml'), [
      '[plugins."ponytail@ponytail"]',
      'enabled = true',
      '',
    ].join('\n'), 'utf8');
    const activeStatus = (runCli([
      'packages',
      'status',
      '--package-id',
      'fixture.opl-flow',
    ], env) as any).opl_agent_package_status;
    assert.equal(activeStatus.managed_policy_currentness.status, 'drifted');
    assert.deepEqual(activeStatus.managed_policy_currentness.detected_conflicts.map((entry: any) => ({
      migration_id: entry.migration_id,
      surface_kind: entry.surface_kind,
      canonical_id: entry.canonical_id,
    })), [{
      migration_id: 'ponytail',
      surface_kind: 'config_table',
      canonical_id: 'plugins.ponytail@ponytail',
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
