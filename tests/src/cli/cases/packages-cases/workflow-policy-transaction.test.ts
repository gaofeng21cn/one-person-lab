import { execFileSync } from 'node:child_process';

import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliAsync,
  runCliFailure,
  test,
} from '../../helpers.ts';
import { formatJsonPayload } from '../../../../../src/kernel/json-file.ts';
import {
  moveManagedPolicyPath,
  rollbackManagedPolicyMigration,
} from '../../../../../src/modules/connect/agent-package-registry-parts/managed-policy-surface.ts';

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeAbsentCodexPluginManager(root: string) {
  const binary = path.join(root, 'fake-codex-plugin-manager');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(binary, [
    '#!/usr/bin/env node',
    "if (process.argv.slice(2).join(' ') !== 'plugin list --json') process.exit(2);",
    "process.stdout.write(JSON.stringify({ installed: [], available: [] }));",
  ].join('\n'), { mode: 0o755 });
  return binary;
}

function writeInstalledCodexPluginManager(root: string, sourcePath: string) {
  const binary = path.join(root, 'fake-codex-installed-plugin-manager');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(binary, [
    '#!/usr/bin/env node',
    "if (process.argv.slice(2).join(' ') !== 'plugin list --json') process.exit(2);",
    `process.stdout.write(JSON.stringify({ installed: [{`,
    "  pluginId: 'fixture.opl-flow@fixture-marketplace',",
    "  version: '0.1.16',",
    '  installed: true,',
    '  enabled: true,',
    `  source: { source: 'local', path: ${JSON.stringify(sourcePath)} },`,
    "  marketplaceSource: { sourceType: 'local', source: 'fixture-marketplace' },",
    '}], available: [] }));',
  ].join('\n'), { mode: 0o755 });
  return binary;
}

function writeInstalledCodexPluginManagerFromLock(root: string) {
  const binary = path.join(root, 'fake-codex-installed-plugin-manager');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(binary, [
    '#!/usr/bin/env node',
    "if (process.argv.slice(2).join(' ') !== 'plugin list --json') process.exit(2);",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    `const counterPath = ${JSON.stringify(path.join(root, '.fake-codex-call-counts.json'))};`,
    "let counters = {};",
    "try { counters = JSON.parse(fs.readFileSync(counterPath, 'utf8')); } catch {}",
    "const parent = String(process.ppid);",
    "const call = Number(counters[parent] || 0) + 1;",
    "counters = { [parent]: call };",
    "fs.writeFileSync(counterPath, JSON.stringify(counters));",
    "let index = { packages: [] };",
    "try { index = JSON.parse(fs.readFileSync(path.join(process.env.OPL_STATE_DIR, 'agent-package-locks.json'), 'utf8')); } catch {}",
    "const installed = call > 1 ? (index.packages || []).flatMap((entry) => {",
    "  const surface = entry && entry.physical_surface;",
    "  if (!surface || !surface.plugin_id || !surface.marketplace_id || !surface.marketplace_root || !surface.marketplace_plugin_path) return [];",
    "  return [{ pluginId: `${surface.plugin_id}@${surface.marketplace_id}`, version: entry.package_version, installed: true, enabled: true, source: { source: 'local', path: surface.marketplace_plugin_path }, marketplaceSource: { sourceType: 'local', source: surface.marketplace_root } }];",
    "}) : [];",
    "process.stdout.write(JSON.stringify({ installed, available: [] }));",
  ].join('\n'), { mode: 0o755 });
  return binary;
}

function writeOplFlowPackage(
  root: string,
  options: {
    includeRemoteCompanions?: boolean;
    includeManagedSkillCompanion?: boolean;
    includeDeprecatedSkillManagerCompanion?: boolean;
    includeMissingManagedSkillCompanion?: boolean;
    includeKindCollision?: boolean;
    includeUnsupportedDefaultMcp?: boolean;
    includeOptionalArchitectureSkill?: boolean;
    includeOptionalRuntimeCapability?: boolean;
    policyVersion?: 'v1' | 'v2' | 'v3' | 'v4';
    packageVersion?: string;
  } = {},
) {
  const sourceRoot = path.join(root, 'fixture.opl-flow-source');
  const v2 = options.policyVersion === 'v2';
  const v3 = options.policyVersion === 'v3';
  const v4 = options.policyVersion === 'v4';
  const packageVersion = options.packageVersion ?? '0.1.16';
  const dependency = (
    value: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    ...value,
    ...(v2 ? {
      owner: 'fixture-owner',
      version_requirement: 'release_lock_exact',
      install_source: 'framework_managed_release_lock',
      lifecycle_owner: 'opl-framework',
      conflict_policy: 'managed_reconcile',
      credential_policy: 'none',
      ...overrides,
    } : {}),
  });
  const recommendations = options.includeRemoteCompanions
    ? [
        dependency({
          id: 'officecli',
          kind: 'cli',
          offline_bundle: 'full',
          online_install_default: true,
          activation: 'task_routed',
          source: 'fixture-remote',
        }),
        dependency({
          id: 'mineru-open-api',
          kind: 'cli',
          offline_bundle: 'full',
          online_install_default: true,
          activation: 'task_routed',
          source: 'fixture-remote',
        }),
        dependency({
          id: 'ui-ux-pro-max',
          kind: 'codex_skill',
          offline_bundle: 'full',
          online_install_default: true,
          activation: 'explicit',
          source: 'fixture-remote',
        }),
        dependency({
          id: 'mineru-document-extractor',
          kind: 'codex_skill',
          offline_bundle: 'full',
          online_install_default: true,
          activation: 'explicit',
          source: 'fixture-remote',
        }),
      ]
      : options.includeManagedSkillCompanion || options.includeDeprecatedSkillManagerCompanion
      ? [
          dependency({
            id: 'ui-ux-pro-max',
            kind: 'codex_skill',
            offline_bundle: 'full',
            online_install_default: true,
            activation: 'explicit',
            source: options.includeDeprecatedSkillManagerCompanion
              ? 'skills-manager:ui-ux-pro-max'
              : 'https://github.com/fixture/ui-ux-pro-max',
            ...(options.includeDeprecatedSkillManagerCompanion ? {} : { source_path: 'skill' }),
          }),
        ]
      : options.includeKindCollision
        ? [
            dependency({
              id: 'officecli',
              kind: 'codex_skill',
              offline_bundle: 'full',
              online_install_default: true,
              activation: 'task_routed',
              source: 'fixture-remote',
            }),
            dependency({
              id: 'officecli',
              kind: 'cli',
              offline_bundle: 'full',
              online_install_default: true,
              activation: 'task_routed',
              source: 'fixture-remote',
            }),
          ]
        : options.includeUnsupportedDefaultMcp
          ? [
              dependency({
                id: 'fixture-mcp',
                kind: 'mcp_server',
                offline_bundle: 'full',
                online_install_default: true,
                activation: 'task_routed',
                source: 'fixture-mcp',
              }, { credential_policy: 'user_or_provider_owned_not_bundled' }),
            ]
          : [];
  const v4Recommendations: Record<string, unknown>[] = v4
    ? recommendations.map((entry) => ({
        ...entry,
        bundle_id: 'fixture-experience-baseline',
        install_source: entry.kind === 'codex_skill' ? 'framework_git_projection' : 'owner_release',
        lifecycle_owner: 'opl-framework',
        readiness_adapter: entry.kind === 'codex_skill' ? 'codex_skill_payload' : 'binary_version',
        conflict_policy: 'managed_reconcile',
        credential_policy: 'none',
        ...(entry.kind === 'codex_skill' && !String(entry.source).startsWith('https://github.com/')
          ? {
              source: `https://github.com/fixture/${entry.id}`,
              source_path: entry.source_path ?? 'skill',
            }
          : {}),
      }))
    : recommendations;
  const optionalCapabilities: Record<string, unknown>[] = [
    ...(options.includeOptionalArchitectureSkill ? [dependency({
      id: 'architect-and-simplify',
      kind: 'codex_skill',
      owner: 'opl-skills',
      online_install_default: false,
      activation: 'task_routed',
      source: 'https://github.com/gaofeng21cn/opl-skills',
      source_path: 'skills/architect-and-simplify',
    })] : []),
    ...(options.includeOptionalRuntimeCapability ? [dependency({
      id: 'openai-primary-runtime-office-pdf',
      kind: 'runtime_capability',
      owner: 'openai',
      online_install_default: false,
      activation: 'task_routed',
      source: 'openai-primary-runtime',
    })] : []),
  ].map((entry) => v4 ? {
    ...entry,
    bundle_id: 'fixture-compatible-optional',
    readiness_adapter: entry.kind === 'codex_skill' ? 'codex_skill_payload' : 'runtime_observation',
  } : entry);
  const policy = {
    schema: v2
      ? 'opl_flow_workflow_policy.v2'
      : v3
        ? 'opl_flow_workflow_policy.v3'
        : v4
          ? 'opl_flow_workflow_policy.v4'
        : 'opl_flow_workflow_policy.v1',
    package: { id: 'fixture.opl-flow', version: packageVersion, owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: 'model-native-test',
    ...(v2 || v3 || v4 ? {
      provides: [
        dependency({
          id: 'fixture.opl-flow',
          kind: 'codex_plugin',
          ...(v2 ? { offline_bundle: 'full' } : {}),
          online_install_default: true,
          activation: 'always',
          source: 'package:fixture.opl-flow',
        }, {
          owner: 'opl-flow',
          version_requirement: `=${packageVersion}`,
          install_source: 'package_payload',
        }),
        ...['fixture.opl-flow', 'codex-ops-kit'].map((skillId) => dependency({
          id: skillId,
          kind: 'codex_skill',
          ...(v2 ? { offline_bundle: 'full' } : {}),
          online_install_default: true,
          activation: 'task_routed',
          source: `package:fixture.opl-flow/skills/${skillId}`,
        }, {
          owner: 'opl-flow',
          version_requirement: `=${packageVersion}`,
          install_source: 'package_payload',
        })),
      ],
      ...(v2 ? {
        installation_convergence: {
          standard_target_closure: 'workflow_policy_release_lock',
          full_target_closure: 'workflow_policy_release_lock',
          standard_source: 'online_exact_release_lock',
          full_source: 'embedded_exact_release_lock',
          final_projection_equivalence_required: true,
          default_dependencies_require_full_bundle: true,
          secrets_bundled: false,
          user_third_party_surfaces_policy: 'preserve',
        },
      } : {}),
    } : {}),
    requires: [
      dependency({
        id: 'opl-base',
        kind: 'base',
        offline_bundle: 'full',
        online_install_default: true,
        activation: 'always',
        source: 'fixture',
      }),
      ...(options.includeMissingManagedSkillCompanion
        ? [dependency({
            id: 'fixture-managed-skill',
            kind: 'codex_skill',
            owner: 'fixture-owner',
            online_install_default: true,
            activation: 'task_routed',
            source: 'https://github.com/fixture/managed-skill',
            source_path: 'skills/fixture-managed-skill',
          })]
        : []),
    ],
    ...(v4 ? { experience_baseline: v4Recommendations } : { recommends: recommendations }),
    compatible_optional: optionalCapabilities,
    ...(v4 ? {
      capability_bundles: [
        ...(v4Recommendations.length > 0 ? [{
          id: 'fixture-experience-baseline',
          label: 'Fixture experience baseline',
          relationship: 'experience_baseline',
          member_refs: v4Recommendations.map((entry) => `${entry.kind}:${entry.id}`),
          online_materialization: 'members_marked_default',
          full_distribution: 'members_marked_full',
          readiness: {
            aggregation: 'all_members',
            absence_effect: 'degraded_non_blocking',
            repair_policy: 'framework_or_owner_adapter',
          },
        }] : []),
        ...(optionalCapabilities.length > 0 ? [{
          id: 'fixture-compatible-optional',
          label: 'Fixture compatible optional',
          relationship: 'compatible_optional',
          member_refs: optionalCapabilities.map((entry) => `${entry.kind}:${entry.id}`),
          online_materialization: 'observe_only',
          full_distribution: 'none',
          readiness: {
            aggregation: 'observe_members',
            absence_effect: 'optional_absent',
            repair_policy: 'none',
          },
        }] : []),
      ],
    } : {}),
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
      ...(v4 ? ['experience_baseline', 'capability_bundles'] : ['recommends']),
      'compatible_optional',
      'conflicts',
      'retires',
      'migration_policy',
      'historical_fingerprints',
      'codex_model_policy',
      ...(v2 ? ['provides', 'installation_convergence'] : v3 || v4 ? ['provides'] : []),
    ],
    properties: {
      schema: {
        const: v2
          ? 'opl_flow_workflow_policy.v2'
          : v3
            ? 'opl_flow_workflow_policy.v3'
            : v4
              ? 'opl_flow_workflow_policy.v4'
            : 'opl_flow_workflow_policy.v1',
      },
      package: { type: 'object' },
      provides: { type: 'array' },
      installation_convergence: { type: 'object' },
      requires: { type: 'array' },
      recommends: { type: 'array' },
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

test('workflow policy v2 preserves (kind, id) dependency identity and converges through known adapters', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v2-'));
  const env = {
    HOME: path.join(root, 'home'),
    CODEX_HOME: path.join(root, 'home', '.codex'),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    const preview = runCli([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, { policyVersion: 'v2', includeKindCollision: true }),
      '--trust-tier',
      'first_party',
      '--dry-run',
    ], env) as any;
    const migration = preview.opl_agent_package_install.package_lock.physical_surface.workflow_policy_migration;
    assert.equal(migration.status, 'validated_no_write');
    assert.deepEqual(migration.dependency_ids, ['opl-base', 'officecli']);
    assert.deepEqual(
      migration.dependencies.map((entry: { kind: string; id: string }) => `${entry.kind}:${entry.id}`),
      ['base:opl-base', 'codex_skill:officecli', 'cli:officecli'],
    );
    assert.equal(migration.dependencies.every((entry: { lifecycle_owner?: string }) => (
      entry.lifecycle_owner === 'opl-framework'
    )), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workflow policy v2 fails closed when a default dependency has no lifecycle adapter', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v2-adapter-'));
  const env = {
    HOME: path.join(root, 'home'),
    CODEX_HOME: path.join(root, 'home', '.codex'),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    const failure = runCliFailure([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, { policyVersion: 'v2', includeUnsupportedDefaultMcp: true }),
      '--trust-tier',
      'first_party',
      '--dry-run',
    ], env);
    assert.equal(
      failure.payload.error.details.failure_code,
      'agent_package_managed_policy_dependency_adapter_missing',
    );
    assert.deepEqual(failure.payload.error.details.dependency_keys, ['mcp_server:fixture-mcp']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workflow policy v2 observes an existing compatible Skill entrypoint without using its private source', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v2-private-skill-source-'));
  const home = path.join(root, 'home');
  const privateSkillRoot = path.join(home, '.skills-manager', 'skills', 'ui-ux-pro-max');
  const codexSkillRoot = path.join(home, '.codex', 'skills', 'ui-ux-pro-max');
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    writeFile(
      path.join(privateSkillRoot, 'SKILL.md'),
      '---\nname: ui-ux-pro-max\ndescription: Existing compatible legacy Skill fixture.\n---\n',
    );
    fs.mkdirSync(path.dirname(codexSkillRoot), { recursive: true });
    fs.symlinkSync(privateSkillRoot, codexSkillRoot, 'junction');
    const installed = await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v2',
        includeDeprecatedSkillManagerCompanion: true,
      }),
      '--trust-tier',
      'first_party',
    ], env) as any;
    const item = installed.opl_agent_package_install.physical_surface
      .workflow_policy_migration.dependency_sync.items[0];
    assert.equal(item.status, 'ready');
    assert.equal(item.action, 'none');
    assert.equal(item.source_authority, 'existing_codex_entry');
    assert.equal(fs.realpathSync(codexSkillRoot), fs.realpathSync(privateSkillRoot));
    assert.equal(fs.existsSync(path.join(home, '.agents', 'skills', 'ui-ux-pro-max')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workflow policy v3 installs a GitHub Skill from its declared repository source_path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v3-existing-skill-'));
  const home = path.join(root, 'home');
  const upstreamRoot = path.join(root, 'upstream');
  const skillId = 'fixture-managed-skill';
  const upstreamSkillRoot = path.join(upstreamRoot, 'skills', skillId);
  const privateManagerSkillRoot = path.join(home, '.skills-manager', 'skills', skillId);
  const sourceUrl = 'https://github.com/fixture/managed-skill';
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeAbsentCodexPluginManager(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.file://${upstreamRoot}.insteadOf`,
    GIT_CONFIG_VALUE_0: sourceUrl,
  };
  try {
    writeFile(
      path.join(upstreamSkillRoot, 'SKILL.md'),
      '---\nname: Upstream Display Name\ndescription: Generic GitHub Skill fixture.\n---\n\n# Fixture\n\nSee [guide](references/guide.md).\n',
    );
    writeFile(path.join(upstreamSkillRoot, '_meta.json'), `${JSON.stringify({ slug: skillId }, null, 2)}\n`);
    writeFile(path.join(upstreamSkillRoot, 'references', 'guide.md'), '# Guide\n');
    writeFile(
      path.join(privateManagerSkillRoot, 'SKILL.md'),
      '---\nname: poisoned-private-copy\ndescription: Must not be selected.\n---\n',
    );
    execFileSync('git', ['init', upstreamRoot]);
    execFileSync('git', ['-C', upstreamRoot, 'add', '.']);
    execFileSync('git', [
      '-C', upstreamRoot,
      '-c', 'user.name=Fixture',
      '-c', 'user.email=fixture@example.com',
      'commit', '-m', 'fixture upstream',
    ]);
    const installed = await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v3',
        includeMissingManagedSkillCompanion: true,
      }),
      '--trust-tier',
      'first_party',
    ], env) as any;
    const migration = installed.opl_agent_package_install.physical_surface.workflow_policy_migration;
    const dependency = migration.dependencies.find((entry: { id: string }) => entry.id === skillId);
    assert.deepEqual(dependency, {
      id: skillId,
      kind: 'codex_skill',
      owner: 'fixture-owner',
      online_install_default: true,
      activation: 'task_routed',
      source: sourceUrl,
      source_path: `skills/${skillId}`,
      relationship: 'required',
    });
    assert.equal('offline_bundle' in dependency, false);
    const codexSkillRoot = path.join(env.CODEX_HOME, 'skills', skillId);
    const agentsSkillRoot = path.join(home, '.agents', 'skills', skillId);
    const resolvedSourceRoot = fs.realpathSync(codexSkillRoot);
    assert.equal(
      resolvedSourceRoot.startsWith(
        fs.realpathSync(path.join(env.CODEX_HOME, 'opl-companion-sources', 'github')),
      ),
      true,
      resolvedSourceRoot,
    );
    assert.equal(fs.existsSync(agentsSkillRoot), false);
    assert.notEqual(resolvedSourceRoot, fs.realpathSync(privateManagerSkillRoot));
    assert.equal(
      fs.readFileSync(path.join(resolvedSourceRoot, 'SKILL.md'), 'utf8'),
      fs.readFileSync(path.join(upstreamSkillRoot, 'SKILL.md'), 'utf8'),
    );
    assert.equal(migration.dependency_sync.items[0].status, 'synced');
    assert.equal(migration.dependency_sync.items[0].source_authority, 'github_repository');
    assert.equal(migration.dependency_sync.items[0].agents_entry_realpath, null);
    assert.equal(migration.dependency_sync.items[0].frontmatter_schema_status, 'valid');
    assert.equal(migration.dependency_sync.items[0].resource_closure_status, 'complete');
    const directory = (await runCliAsync(['packages', 'list'], env) as any).opl_agent_packages.directory;
    const flowEntry = directory.entries.find(
      (entry: { package_id: string }) => entry.package_id === 'fixture.opl-flow',
    );
    const summary = flowEntry.capability_dependency_summary.find(
      (entry: { id: string }) => entry.id === skillId,
    );
    assert.deepEqual(summary, {
      id: skillId,
      kind: 'codex_skill',
      relationship: 'required',
      activation: 'task_routed',
      presence: 'present',
      callability: 'callable',
      user_outcome: 'required_for_workflow',
      route: {
        action_ref: 'app_state.actions#agent_package_repair',
        payload: { package_id: 'fixture.opl-flow' },
        detail_surface: 'opl packages status --package-id fixture.opl-flow --json',
      },
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('workflow policy v3 projects a generic install action when a required Skill is absent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v3-missing-skill-'));
  const home = path.join(root, 'home');
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    const installed = await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v3',
        includeMissingManagedSkillCompanion: true,
      }),
      '--trust-tier',
      'first_party',
    ], env) as any;
    const migration = installed.opl_agent_package_install.physical_surface.workflow_policy_migration;
    assert.equal(migration.dependency_sync.items[0].skill_id, 'fixture-managed-skill');
    assert.equal(migration.dependency_sync.items[0].status, 'missing_source');
    assert.equal(migration.dependency_sync.items[0].action, 'install');
    assert.match(migration.dependency_sync.items[0].note, /https:\/\/github\.com\/fixture\/managed-skill/);
    assert.match(migration.dependency_sync.items[0].note, /skills\/fixture-managed-skill/);

    const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const currentness = status.opl_agent_package_status.managed_policy_currentness;
    assert.equal(status.opl_agent_package_status.operational_ready, false);
    assert.equal(status.opl_agent_package_status.status, 'attention_needed');
    assert.equal(
      status.opl_agent_package_status.launch_blocked_reason,
      'managed_policy_required_dependency_unavailable',
    );
    assert.equal(status.opl_agent_package_status.repair_action, 'opl packages repair --package-id fixture.opl-flow');
    assert.equal(Object.hasOwn(status.opl_agent_package_status, 'owner_route_readback'), false);
    assert.equal(currentness.status, 'drifted');
    assert.equal(currentness.required_dependencies_operational, false);
    assert.deepEqual(currentness.required_dependency_failure_ids, ['fixture-managed-skill']);
    assert.equal(
      currentness.dependency_sync.items[0].action,
      'install',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('OPL Flow package lifecycle advances workflow policy v1 v2 v3 v4 and reaches a fixed point', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-history-'));
  const stateDir = path.join(root, 'state');
  const env = {
    HOME: path.join(root, 'home'),
    CODEX_HOME: path.join(root, 'home', '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: stateDir,
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    const manifestPath = writeOplFlowPackage(root, {
      policyVersion: 'v1',
      packageVersion: '0.1.24',
    });
    const installed = await runCliAsync([
      'packages', 'install', '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    assert.equal(installed.opl_agent_package_install.package_lock.package_version, '0.1.24');

    writeOplFlowPackage(root, {
      policyVersion: 'v2',
      packageVersion: '0.1.25',
    });
    const updatedV2 = runCli([
      'packages', 'update', 'fixture.opl-flow',
      '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    assert.equal(updatedV2.opl_agent_package_update.package_lock.package_version, '0.1.25');

    writeOplFlowPackage(root, {
      policyVersion: 'v3',
      packageVersion: '0.1.26',
    });
    const updatedV3 = runCli([
      'packages', 'update', 'fixture.opl-flow',
      '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    const v3Lock = updatedV3.opl_agent_package_update.package_lock;
    assert.equal(v3Lock.package_version, '0.1.26');
    assert.equal(
      JSON.parse(fs.readFileSync(
        path.join(v3Lock.physical_surface.codex_plugin_cache_path, 'contracts', 'workflow-policy.json'),
        'utf8',
      )).schema,
      'opl_flow_workflow_policy.v3',
    );

    writeOplFlowPackage(root, {
      policyVersion: 'v4',
      packageVersion: '0.1.30',
    });
    const updatedV4 = runCli([
      'packages', 'update', 'fixture.opl-flow',
      '--manifest-url', manifestPath, '--trust-tier', 'first_party',
    ], env) as any;
    const v4Lock = updatedV4.opl_agent_package_update.package_lock;
    assert.equal(v4Lock.package_version, '0.1.30');
    assert.equal(
      JSON.parse(fs.readFileSync(
        path.join(v4Lock.physical_surface.codex_plugin_cache_path, 'contracts', 'workflow-policy.json'),
        'utf8',
      )).schema,
      'opl_flow_workflow_policy.v4',
    );

    const lockPath = path.join(stateDir, 'agent-package-locks.json');
    const beforeFixedPoint = {
      lock: fs.readFileSync(lockPath),
    };
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
      assert.equal(status.opl_agent_package_status.operational_ready, true);
      assert.equal(
        status.opl_agent_package_status.managed_policy_currentness.status,
        'current',
      );
    }
    assert.deepEqual(fs.readFileSync(lockPath), beforeFixedPoint.lock);
    assert.equal(fs.existsSync(path.join(stateDir, 'agent-package-lifecycle-ledger.json')), false);

    const workflowProfileIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    workflowProfileIndex.packages.find(
      (entry: any) => entry.package_id === 'fixture.opl-flow',
    ).package_role = 'workflow_profile';
    fs.writeFileSync(lockPath, formatJsonPayload(workflowProfileIndex));
    const v4CachePath = v4Lock.physical_surface.codex_plugin_cache_path;
    const uninstalled = runCli([
      'packages', 'uninstall', '--package-id', 'fixture.opl-flow',
    ], env) as any;
    assert.equal(uninstalled.opl_agent_package_uninstall.status, 'uninstalled');
    assert.equal(fs.existsSync(v4CachePath), false);
    const uninstalledIndex = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.equal(
      uninstalledIndex.packages.some((entry: any) => entry.package_id === 'fixture.opl-flow'),
      false,
    );
    assert.equal('last_known_good_transactions' in uninstalledIndex, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('workflow policy v3 keeps a missing recommended Skill non-blocking', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v3-missing-recommended-skill-'));
  const home = path.join(root, 'home');
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v3',
        includeManagedSkillCompanion: true,
      }),
      '--trust-tier',
      'first_party',
    ], env);
    const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const currentness = status.opl_agent_package_status.managed_policy_currentness;
    assert.equal(status.opl_agent_package_status.operational_ready, true);
    assert.equal(status.opl_agent_package_status.launch_blocked_reason, null);
    assert.equal(currentness.status, 'drifted');
    assert.equal(currentness.required_dependencies_operational, true);
    assert.deepEqual(currentness.required_dependency_failure_ids, []);
    assert.equal(currentness.dependency_sync.items[0].status, 'missing_source');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('workflow policy v4 reports a missing experience baseline as degraded without blocking Flow', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v4-baseline-'));
  const home = path.join(root, 'home');
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v4',
        includeManagedSkillCompanion: true,
      }),
      '--trust-tier',
      'first_party',
    ], env);
    const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const packageStatus = status.opl_agent_package_status;
    assert.equal(packageStatus.operational_ready, true);
    assert.equal(packageStatus.launch_allowed, true);
    assert.equal(packageStatus.launch_blocked_reason, null);
    assert.deepEqual(packageStatus.package_operational, {
      status: 'operational',
      operational_ready: true,
      failure_reason: null,
      repair_command: null,
    });
    assert.equal(packageStatus.experience_baseline.status, 'degraded');
    assert.deepEqual(packageStatus.experience_baseline.failure_ids, ['ui-ux-pro-max']);
    assert.equal(
      packageStatus.experience_baseline.repair_command,
      'opl packages repair --package-id fixture.opl-flow',
    );
    assert.equal(packageStatus.launch_state, 'degraded');
    assert.equal(packageStatus.launch_state_reason, 'experience_baseline_degraded');
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('installed native descriptor projects Flow policy planes and model recommendation without a legacy lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-native-descriptor-policy-'));
  const home = path.join(root, 'home');
  const sourceRoot = path.join(root, 'fixture.opl-flow-source');
  const manifestPath = writeOplFlowPackage(root, {
    policyVersion: 'v4',
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

test('workflow policy v4 observes missing specialized capabilities without installing or repairing them', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v4-optional-'));
  const home = path.join(root, 'home');
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    const installed = await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v4',
        includeOptionalArchitectureSkill: true,
      }),
      '--trust-tier',
      'first_party',
    ], env) as any;
    const migration = installed.opl_agent_package_install.physical_surface.workflow_policy_migration;
    assert.deepEqual(migration.optional_dependency_ids, ['architect-and-simplify']);
    assert.equal(
      migration.dependencies.some((entry: { id: string }) => entry.id === 'architect-and-simplify'),
      false,
    );
    assert.equal(migration.dependency_sync.items.length, 0);

    const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const packageStatus = status.opl_agent_package_status;
    assert.equal(packageStatus.operational_ready, true);
    assert.equal(packageStatus.experience_baseline.status, 'current');
    assert.equal(packageStatus.specialized_capabilities.status, 'absent');
    assert.equal(packageStatus.specialized_capabilities.repair_command, null);
    assert.deepEqual(packageStatus.specialized_capabilities.capabilities, [{
      id: 'architect-and-simplify',
      kind: 'codex_skill',
      status: 'missing',
      reason: 'optional_capability_not_installed',
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('workflow policy v4 still blocks Flow when a required Skill is missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v4-required-'));
  const home = path.join(root, 'home');
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v4',
        includeMissingManagedSkillCompanion: true,
      }),
      '--trust-tier',
      'first_party',
    ], env);
    const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const packageStatus = status.opl_agent_package_status;
    assert.equal(packageStatus.operational_ready, false);
    assert.equal(packageStatus.package_operational.status, 'unavailable');
    assert.equal(
      packageStatus.package_operational.failure_reason,
      'managed_policy_required_dependency_unavailable',
    );
    assert.deepEqual(
      packageStatus.managed_policy_currentness.required_dependency_failure_ids,
      ['fixture-managed-skill'],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('workflow policy v4 preserves unobserved optional runtime capabilities without claiming absence', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-v4-optional-runtime-'));
  const home = path.join(root, 'home');
  const env = {
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    OPL_CODEX_PLUGIN_BIN: writeAbsentCodexPluginManager(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_COMPANION_DISABLE_REMOTE_INSTALL: '1',
  };
  try {
    await runCliAsync([
      'packages',
      'install',
      '--manifest-url',
      writeOplFlowPackage(root, {
        policyVersion: 'v4',
        includeOptionalArchitectureSkill: true,
        includeOptionalRuntimeCapability: true,
      }),
      '--trust-tier',
      'first_party',
    ], env);
    const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const specialized = status.opl_agent_package_status.specialized_capabilities;
    assert.equal(specialized.status, 'partial');
    assert.deepEqual(specialized.capabilities, [
      {
        id: 'architect-and-simplify',
        kind: 'codex_skill',
        status: 'missing',
        reason: 'optional_capability_not_installed',
      },
      {
        id: 'openai-primary-runtime-office-pdf',
        kind: 'runtime_capability',
        status: 'unobserved',
        reason: 'no_generic_presence_probe',
      },
    ]);
    assert.equal(specialized.repair_command, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('generic OPL package transaction owns OPL Flow policy migration without inventing a fresh-install rollback generation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-package-transaction-'));
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
    '[projects."/Users/test/workspace/fixture.opl-flow"]',
    'trust_level = "trusted"',
    '',
    '[plugins."documents@openai-primary-runtime"]',
    'enabled = true',
    '',
    '[marketplaces.fixture.opl-flow-local]',
    'source_type = "local"',
    'source = "/tmp/fixture.opl-flow-local"',
    '',
    '[plugins."fixture.opl-flow@fixture.opl-flow-local"]',
    'enabled = true',
    '',
  ].join('\n');
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
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
      relationship: 'required',
    }]);
    assert.deepEqual(migration.migration_ids, [
      'upstream-superpowers',
      'ponytail',
      'codexcont-intelligence-enhancement',
      'superpowers-local-method-profile',
      'legacy-development-role-prompts',
      'legacy-fixture.opl-flow-local-plugin',
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
    assert.doesNotMatch(installedConfig, /superpowers|ponytail|codexcont|fixture.opl-flow@fixture.opl-flow-local/i);
    assert.match(installedConfig, /\[projects\."\/Users\/test\/workspace\/fixture.opl-flow"\]/);
    assert.match(installedConfig, /\[plugins\."documents@openai-primary-runtime"\]/);

    const lockIndex = JSON.parse(fs.readFileSync(path.join(stateDir, 'agent-package-locks.json'), 'utf8'));
    assert.equal('last_known_good_transactions' in lockIndex, false);
    assert.equal(fs.existsSync(path.join(stateDir, 'workflow-packages')), false);
    const current = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const statusCurrentness = current.opl_agent_package_status.managed_policy_currentness;
    assert.equal(
      statusCurrentness.status,
      'current',
      JSON.stringify(statusCurrentness, null, 2),
    );
    assert.deepEqual(statusCurrentness.detected_conflicts, []);

    const restoredPonytailPath = path.join(codexHome, 'plugins', 'cache', 'ponytail');
    writeFile(path.join(restoredPonytailPath, 'restored.txt'), 'restored after install\n');
    const drifted = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const driftedCurrentness = drifted.opl_agent_package_status.managed_policy_currentness;
    assert.equal(drifted.opl_agent_package_status.status, 'available');
    assert.equal(drifted.opl_agent_package_status.operational_ready, true);
    assert.equal(drifted.opl_agent_package_status.launch_blocked_reason, null);
    assert.equal(driftedCurrentness.status, 'drifted');
    assert.equal(driftedCurrentness.repair_command, null);
    assert.deepEqual(driftedCurrentness.detected_conflicts, [{
      migration_id: 'ponytail',
      surface_kind: 'plugin',
      canonical_id: 'ponytail',
      physical_ref: restoredPonytailPath,
    }]);

    const repaired = runCli(['packages', 'repair', '--package-id', 'fixture.opl-flow'], env) as any;
    assert.equal(repaired.opl_agent_package_repair.status, 'repaired');
    assert.equal(fs.existsSync(restoredPonytailPath), false);
    const repairedStatus = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    assert.equal(repairedStatus.opl_agent_package_status.operational_ready, true);
    assert.equal(repairedStatus.opl_agent_package_status.managed_policy_currentness.status, 'current');

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

    const status = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    assert.equal(status.opl_agent_package_status.installed_package_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('fresh install writes no legacy generation field', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-clean-prestate-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_CODEX_PLUGIN_BIN: writeAbsentCodexPluginManager(path.join(root, 'fake-codex')),
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
    assert.equal('last_known_good_transactions' in lockIndex, false);
    assert.equal(runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env)
      .opl_agent_package_status.installed_package_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('managed policy currentness detects and repairs a missing global Codex skill entrypoint', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-skill-currentness-'));
  const home = path.join(root, 'home');
  const codexHome = path.join(home, '.codex');
  const upstreamRoot = path.join(root, 'upstream');
  const upstreamSkillRoot = path.join(upstreamRoot, 'skill');
  const sourceUrl = 'https://github.com/fixture/ui-ux-pro-max';
  const codexSkillRoot = path.join(codexHome, 'skills', 'ui-ux-pro-max');
  const agentsSkillRoot = path.join(home, '.agents', 'skills', 'ui-ux-pro-max');
  const env = {
    HOME: home,
    CODEX_HOME: codexHome,
    OPL_CODEX_PLUGIN_BIN: writeInstalledCodexPluginManagerFromLock(path.join(root, 'fake-codex')),
    OPL_STATE_DIR: path.join(root, 'state'),
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `url.file://${upstreamRoot}.insteadOf`,
    GIT_CONFIG_VALUE_0: sourceUrl,
  };
  try {
    writeFile(
      path.join(upstreamSkillRoot, 'SKILL.md'),
      '---\nname: ui-ux-pro-max\ndescription: GitHub UI review skill.\n---\n\n# UI UX Pro Max\n',
    );
    execFileSync('git', ['init', upstreamRoot]);
    execFileSync('git', ['-C', upstreamRoot, 'add', '.']);
    execFileSync('git', [
      '-C', upstreamRoot,
      '-c', 'user.name=Fixture',
      '-c', 'user.email=fixture@example.com',
      'commit', '-m', 'fixture upstream',
    ]);
    const installed = await runCliAsync([
      'packages', 'install', '--manifest-url', writeOplFlowPackage(root, {
        includeManagedSkillCompanion: true,
        policyVersion: 'v3',
      }),
      '--trust-tier', 'first_party',
    ], env) as any;
    assert.equal(installed.opl_agent_package_install.status, 'installed');
    assert.equal(fs.existsSync(codexSkillRoot), true);
    assert.equal(fs.existsSync(agentsSkillRoot), false);

    const current = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const currentness = current.opl_agent_package_status.managed_policy_currentness;
    assert.equal(currentness.status, 'current');
    assert.equal(currentness.dependency_sync.items[0].source_authority, 'github_repository');
    assert.equal(currentness.dependency_sync.items[0].payload_currentness, 'current');
    assert.equal(currentness.dependency_sync.items[0].entrypoint_authority_status, 'converged');

    fs.rmSync(codexSkillRoot, { recursive: true, force: true });
    const drifted = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    const driftedCurrentness = drifted.opl_agent_package_status.managed_policy_currentness;
    assert.equal(drifted.opl_agent_package_status.status, 'available');
    assert.equal(drifted.opl_agent_package_status.operational_ready, true);
    assert.equal(drifted.opl_agent_package_status.launch_blocked_reason, null);
    assert.equal(driftedCurrentness.status, 'drifted');
    assert.equal(driftedCurrentness.dependency_sync.items[0].entrypoint_authority_status, 'missing');
    assert.equal(driftedCurrentness.repair_command, null);

    const repaired = runCli(['packages', 'repair', '--package-id', 'fixture.opl-flow'], env) as any;
    assert.equal(repaired.opl_agent_package_repair.status, 'repaired');
    const repairedItem = repaired.opl_agent_package_repair.physical_surface
      .workflow_policy_migration.dependency_sync.items[0];
    assert.equal(repairedItem.status, 'synced', JSON.stringify(repairedItem));
    assert.equal(
      fs.existsSync(codexSkillRoot),
      true,
      JSON.stringify(repaired.opl_agent_package_repair.physical_surface.workflow_policy_migration, null, 2),
    );
    assert.equal(fs.existsSync(agentsSkillRoot), false);
    const repairedStatus = runCli(['packages', 'status', '--package-id', 'fixture.opl-flow'], env) as any;
    assert.equal(
      repairedStatus.opl_agent_package_status.managed_policy_currentness.status,
      'current',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('managed policy rollback helpers refuse conflicting TOML tables and recreated physical surfaces', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-conflict-'));
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
    const previousStateDir = process.env.OPL_STATE_DIR;
    process.env.OPL_STATE_DIR = env.OPL_STATE_DIR;
    let rolledBack: ReturnType<typeof rollbackManagedPolicyMigration>;
    try {
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
      rolledBack = rollbackManagedPolicyMigration(migration);
    } finally {
      if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
      else process.env.OPL_STATE_DIR = previousStateDir;
    }
    assert.equal(rolledBack.backup_active, false);
    assert.equal(fs.readFileSync(path.join(legacyPath, 'legacy.txt'), 'utf8'), 'legacy\n');
    assert.equal(fs.existsSync(rolledBack.backup_root!), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed policy path movement preserves paths across filesystems', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture.opl-flow-policy-exdev-'));
  const legacyPath = path.join(root, 'legacy', 'superpowers');
  const backupPath = path.join(root, 'state', 'agent-package-transactions', 'superpowers');
  let backupExdevCount = 0;
  let restoreExdevCount = 0;
  try {
    writeFile(path.join(legacyPath, 'legacy.txt'), 'legacy\n');
    fs.symlinkSync('legacy.txt', path.join(legacyPath, 'legacy-link.txt'));
    const renameSync = ((source: fs.PathLike, target: fs.PathLike) => {
      const sourcePath = String(source);
      const targetPath = String(target);
      if (sourcePath === legacyPath && targetPath === backupPath) {
        backupExdevCount += 1;
        throw Object.assign(new Error('simulated cross-device backup'), { code: 'EXDEV' });
      }
      if (sourcePath === backupPath && targetPath === legacyPath) {
        restoreExdevCount += 1;
        throw Object.assign(new Error('simulated cross-device restore'), { code: 'EXDEV' });
      }
      return fs.renameSync(source, target);
    }) as typeof fs.renameSync;

    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    moveManagedPolicyPath(legacyPath, backupPath, { renameSync });
    assert.equal(backupExdevCount, 1);
    assert.equal(fs.existsSync(legacyPath), false);
    assert.equal(fs.readFileSync(path.join(backupPath, 'legacy.txt'), 'utf8'), 'legacy\n');
    assert.equal(fs.readlinkSync(path.join(backupPath, 'legacy-link.txt')), 'legacy.txt');

    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    moveManagedPolicyPath(backupPath, legacyPath, { renameSync });
    assert.equal(restoreExdevCount, 1);
    assert.equal(fs.readFileSync(path.join(legacyPath, 'legacy.txt'), 'utf8'), 'legacy\n');
    assert.equal(fs.readlinkSync(path.join(legacyPath, 'legacy-link.txt')), 'legacy.txt');
    assert.equal(fs.existsSync(backupPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
