import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readOplFlowManagedDependencies,
  readOplFlowManagedDependencyIds,
} from '../../src/adapters/integration/agent-package-registry.ts';
import { agentPackageManifest, formatJsonPayload } from './cli/cases/packages-cases/helpers.ts';

function writeFakePluginList(root: string, sourceRoot: string) {
  const binary = path.join(root, 'fake-codex');
  fs.writeFileSync(binary, `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(JSON.stringify({
  installed: [{
    pluginId: 'opl-flow@fixture-marketplace',
    version: '0.1.28',
    enabled: true,
    source: { source: 'local', path: sourceRoot },
    marketplaceSource: { sourceType: 'local', source: sourceRoot },
  }],
}))});
`, { mode: 0o755 });
  return binary;
}

function writeEmptyPluginList(root: string) {
  const binary = path.join(root, 'fake-empty-codex');
  fs.writeFileSync(binary, `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(JSON.stringify({ installed: [] }))});
`, { mode: 0o755 });
  return binary;
}

function writeLegacyDependencyLock(stateRoot: string) {
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.writeFileSync(path.join(stateRoot, 'agent-package-locks.json'), formatJsonPayload({
    surface_kind: 'opl_agent_package_lock_index',
    version: 'opl-agent-package-lock-index.v1',
    packages: [{
      package_id: 'opl-flow',
      lock_ref: 'opl://agent-package-lock/opl-flow/legacy',
      physical_surface: {
        workflow_policy_migration: {
          dependency_ids: ['opl-base', 'officecli'],
          dependencies: [{
            id: 'opl-base',
            kind: 'base',
            activation: 'always',
            offline_bundle: 'full',
            online_install_default: true,
            source: 'legacy-lock',
          }],
          dependency_sync: {
            tools: [{ tool_id: 'officecli', status: 'ready' }],
          },
        },
      },
    }],
  }));
}

test('managed dependencies read from the installed owner descriptor policy without lock state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-dependencies-descriptor-'));
  const sourceRoot = path.join(root, 'opl-flow');
  const stateRoot = path.join(root, 'state');
  const policyPath = path.join(sourceRoot, 'contracts', 'workflow-policy.json');
  const schemaPath = path.join(sourceRoot, 'contracts', 'workflow-policy.schema.json');
  const manifest = agentPackageManifest({
    packageId: 'opl-flow',
    agentId: 'opl-flow',
    pluginId: 'opl-flow',
    distributionPayload: null,
    profileSurface: {
      runtime_profile: { source_path: 'templates/AGENTS.md', target_id: 'user_agents_profile' },
      authoring_sources: [],
      merge_context_paths: [],
      existing_profile_policy: 'semantic_merge_required',
    },
  }) as unknown as Record<string, unknown>;
  manifest.source = 'first_party';
  manifest.publisher = 'one-person-lab';
  manifest.managed_policy_surface = {
    policy_kind: 'opl_flow_workflow_policy',
    source_path: 'contracts/workflow-policy.json',
    schema_path: 'contracts/workflow-policy.schema.json',
  };
  const policy = {
    schema: 'opl_flow_workflow_policy.v4',
    package: { id: 'opl-flow', version: '1.2.3', owner: 'opl-flow', kind: 'workflow_profile' },
    workflow_generation: 'fixture-generation',
    provides: [
      {
        id: 'opl-flow',
        kind: 'codex_plugin',
        online_install_default: true,
        activation: 'always',
      },
      {
        id: 'opl-flow',
        kind: 'codex_skill',
        online_install_default: true,
        activation: 'always',
      },
    ],
    requires: [
      {
        id: 'opl-base',
        kind: 'base',
        owner: 'one-person-lab',
        online_install_default: true,
        activation: 'always',
        source: 'gaofeng21cn/one-person-lab',
      },
      {
        id: 'agent-reach',
        kind: 'codex_skill',
        owner: 'agent-reach',
        online_install_default: true,
        activation: 'task_routed',
        source: 'https://github.com/Panniantong/Agent-Reach',
        source_path: 'agent_reach/skill',
      },
      {
        id: 'officecli',
        kind: 'cli',
        owner: 'iofficeai',
        online_install_default: false,
        activation: 'task_routed',
        source: 'officecli',
      },
    ],
    experience_baseline: [
      {
        id: 'mineru-open-api',
        kind: 'cli',
        owner: 'mineru',
        online_install_default: false,
        activation: 'task_routed',
        source: 'mineru-open-api',
      },
    ],
    compatible_optional: [],
    capability_bundles: [],
    conflicts: [],
    retires: [],
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
      plugin_ids: ['opl-flow'],
      skill_ids: ['opl-flow'],
      service_ids: ['opl-flow-service'],
      config_markers: ['opl-flow-config'],
      legacy_prompt_ids: ['opl-flow-prompt'],
    },
    codex_model_policy: {
      authority: 'opl-flow',
      mode_default: 'auto',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      override_precedence: ['local_codex_config'],
      catalog_policy: {},
    },
  };
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'opl-package.json'), formatJsonPayload(manifest));
  fs.writeFileSync(policyPath, formatJsonPayload(policy));
  fs.writeFileSync(schemaPath, formatJsonPayload({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['workflow_generation'],
    properties: {
      workflow_generation: { type: 'string', minLength: 1 },
    },
  }));
  fs.writeFileSync(
    path.join(sourceRoot, 'templates', 'AGENTS.md'),
    'descriptor dependency fixture\n',
  );

  const previous = {
    codexHome: process.env.CODEX_HOME,
    stateDir: process.env.OPL_STATE_DIR,
    pluginBin: process.env.OPL_CODEX_PLUGIN_BIN,
  };
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_CODEX_PLUGIN_BIN = writeFakePluginList(root, sourceRoot);

  try {
    assert.deepEqual(readOplFlowManagedDependencyIds(), [
      'opl-base',
      'agent-reach',
      'officecli',
      'mineru-open-api',
    ]);
    assert.deepEqual(readOplFlowManagedDependencies(), [
      {
        dependency_id: 'opl-base',
        dependency_kind: 'base',
        activation: 'always',
        offline_bundle: 'none',
        online_install_default: true,
        source: 'gaofeng21cn/one-person-lab',
        source_path: null,
        owner: 'one-person-lab',
        bundle_id: null,
        version_requirement: null,
        install_source: null,
        relationship: 'required',
        lifecycle_owner: 'opl_base',
        update_mode: 'silent_managed',
        observed_status: null,
        installed: true,
      },
      {
        dependency_id: 'agent-reach',
        dependency_kind: 'codex_skill',
        activation: 'task_routed',
        offline_bundle: 'none',
        online_install_default: true,
        source: 'https://github.com/Panniantong/Agent-Reach',
        source_path: 'agent_reach/skill',
        owner: 'agent-reach',
        bundle_id: null,
        version_requirement: null,
        install_source: null,
        relationship: 'required',
        lifecycle_owner: 'opl_packages',
        update_mode: 'silent_managed',
        observed_status: null,
        installed: null,
      },
      {
        dependency_id: 'officecli',
        dependency_kind: 'cli',
        activation: 'task_routed',
        offline_bundle: 'none',
        online_install_default: false,
        source: 'officecli',
        source_path: null,
        owner: 'iofficeai',
        bundle_id: null,
        version_requirement: null,
        install_source: null,
        relationship: 'required',
        lifecycle_owner: 'opl_base',
        update_mode: 'detect_only_guidance',
        observed_status: null,
        installed: null,
      },
      {
        dependency_id: 'mineru-open-api',
        dependency_kind: 'cli',
        activation: 'task_routed',
        offline_bundle: 'none',
        online_install_default: false,
        source: 'mineru-open-api',
        source_path: null,
        owner: 'mineru',
        bundle_id: null,
        version_requirement: null,
        install_source: null,
        relationship: 'recommended',
        lifecycle_owner: 'opl_base',
        update_mode: 'detect_only_guidance',
        observed_status: null,
        installed: null,
      },
    ]);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-locks.json')), false);
    assert.equal(fs.existsSync(path.join(stateRoot, 'agent-package-lifecycle-ledger.json')), false);

    for (const version of [1, 2, 3]) {
      fs.writeFileSync(policyPath, formatJsonPayload({
        ...policy,
        schema: `opl_flow_workflow_policy.v${version}`,
      }));
      assert.deepEqual(readOplFlowManagedDependencyIds(), []);
      assert.deepEqual(readOplFlowManagedDependencies(), []);
    }

    const schemaInvalidPolicy = { ...policy } as Record<string, unknown>;
    delete schemaInvalidPolicy.workflow_generation;
    fs.writeFileSync(policyPath, formatJsonPayload(schemaInvalidPolicy));
    assert.deepEqual(readOplFlowManagedDependencyIds(), []);
    assert.deepEqual(readOplFlowManagedDependencies(), []);

    fs.writeFileSync(policyPath, formatJsonPayload({
      ...policy,
      requires: [...policy.requires, { ...policy.requires[0] }],
    }));
    assert.deepEqual(readOplFlowManagedDependencyIds(), []);
    assert.deepEqual(readOplFlowManagedDependencies(), []);

    fs.writeFileSync(policyPath, formatJsonPayload({
      ...policy,
      requires: policy.requires.map((dependency, index) => index === 0
        ? { ...dependency, conflict_policy: 'unsafe_parallel_writer' }
        : dependency),
    }));
    assert.deepEqual(readOplFlowManagedDependencyIds(), []);
    assert.deepEqual(readOplFlowManagedDependencies(), []);

    fs.writeFileSync(policyPath, formatJsonPayload({
      ...policy,
      package: { ...policy.package, id: 'not-opl-flow' },
    }));
    assert.deepEqual(readOplFlowManagedDependencyIds(), []);
    assert.deepEqual(readOplFlowManagedDependencies(), []);
    fs.writeFileSync(policyPath, formatJsonPayload(policy));

    const outsidePolicyPath = path.join(root, 'outside-workflow-policy.json');
    fs.renameSync(policyPath, outsidePolicyPath);
    fs.symlinkSync(outsidePolicyPath, policyPath);
    assert.deepEqual(readOplFlowManagedDependencyIds(), []);
    assert.deepEqual(readOplFlowManagedDependencies(), []);

    fs.unlinkSync(policyPath);
    fs.writeFileSync(policyPath, '{invalid policy');
    assert.deepEqual(readOplFlowManagedDependencyIds(), []);
    assert.deepEqual(readOplFlowManagedDependencies(), []);
  } finally {
    if (previous.codexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous.codexHome;
    if (previous.stateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous.stateDir;
    if (previous.pluginBin === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previous.pluginBin;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy lock dependency metadata does not provide managed dependency authority', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-dependencies-legacy-lock-'));
  const stateRoot = path.join(root, 'state');
  writeLegacyDependencyLock(stateRoot);
  const previous = {
    codexHome: process.env.CODEX_HOME,
    stateDir: process.env.OPL_STATE_DIR,
    pluginBin: process.env.OPL_CODEX_PLUGIN_BIN,
  };
  process.env.CODEX_HOME = path.join(root, 'codex-home');
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_CODEX_PLUGIN_BIN = writeEmptyPluginList(root);

  try {
    assert.deepEqual(readOplFlowManagedDependencyIds(), []);
    assert.deepEqual(readOplFlowManagedDependencies(), []);
  } finally {
    if (previous.codexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous.codexHome;
    if (previous.stateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous.stateDir;
    if (previous.pluginBin === undefined) delete process.env.OPL_CODEX_PLUGIN_BIN;
    else process.env.OPL_CODEX_PLUGIN_BIN = previous.pluginBin;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
