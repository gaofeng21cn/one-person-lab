import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  resolveStandardAgentManagedCheckout as resolveStandardAgentManagedCheckoutProduction,
} from '../../src/adapters/execution/standard-agent-managed-checkout.ts';

const TREE_SHA256 = 'a'.repeat(64);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-runtime-'));
  const workspaceRoot = path.join(root, 'workspace');
  const checkoutRoot = path.join(root, 'native-source');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(checkoutRoot);
  fs.mkdirSync(path.join(checkoutRoot, 'contracts'));
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'domain_descriptor.json'), '{}\n');
  fs.writeFileSync(path.join(checkoutRoot, 'opl-package.json'), `${JSON.stringify({
    surface_kind: 'opl_agent_package_manifest.v1',
    agent_id: 'mas',
    package_id: 'mas',
    version: '0.2.25',
    domain_descriptor_ref: 'contracts/domain_descriptor.json',
    codex_surface: {
      plugin_id: 'med-autoscience',
      plugin_source_path: '.',
      configured_codex_plugin_carrier: {
        kind: 'codex_plugin_manager',
        plugin_selector: 'med-autoscience@med-autoscience',
        executor_route: 'codex_cli',
        marketplace_source: 'gaofeng21cn/med-autoscience',
        publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:latest-stable',
      },
    },
  }, null, 2)}\n`);
  return { root, workspaceRoot, checkoutRoot };
}

function status(checkoutRoot: string, overrides: Record<string, unknown> = {}) {
  const pluginId = 'med-autoscience@med-autoscience';
  const marketplaceSource = 'gaofeng21cn/med-autoscience';
  const installedVersion = `0.2.25-${'b'.repeat(64)}`;
  return {
    installed_package_count: 1,
    launch_allowed: true,
    launch_blocked_reason: null,
    configured_carrier: {
      surface_kind: 'opl_configured_codex_plugin_carrier_readback.v1',
      package_id: 'mas',
      carrier: {
        kind: 'codex_plugin_manager',
        plugin_id: pluginId,
        marketplace_source: marketplaceSource,
        observed_sources: [{
          plugin_id: pluginId,
          marketplace_source: marketplaceSource,
          installed_version: installedVersion,
          enabled: true,
          plugin_source_path: checkoutRoot,
          source_tree_sha256: TREE_SHA256,
        }],
        precedence: 'exact_single_source',
      },
      executor: { route: 'codex_cli', required_skill_ids: ['med-autoscience'], status: 'callable' },
      publication_ref: 'ghcr.io/gaofeng21cn/one-person-lab-packages/mas:latest-stable',
      status: 'installed',
      installed_version: installedVersion,
      enabled: true,
      plugin_source_path: checkoutRoot,
      operation: 'list',
      native_command: ['plugin', 'list', '--json'],
      native_action_dispatched: true,
      reason: null,
    },
    installed_carrier_readback: {
      kind: 'codex_plugin_manager',
      identity: pluginId,
      source_ref: checkoutRoot,
      version: installedVersion,
      enabled: true,
      lifecycle_authority: 'carrier_owned',
    },
    installed_readiness: {
      installed: true,
      physical_status: 'available',
      callability: 'callable',
    },
    ...overrides,
  };
}

function packageReadiness(
  packageStatus: Record<string, unknown>,
  sourcePolicy: Record<string, unknown> | null = null,
) {
  return {
    readStatus: () => ({ opl_agent_package_status: packageStatus }),
    readSourcePolicy: () => sourcePolicy,
  };
}

function resolveStandardAgentManagedCheckout(
  input: Parameters<typeof resolveStandardAgentManagedCheckoutProduction>[0],
) {
  return resolveStandardAgentManagedCheckoutProduction({
    ...input,
    workspaceEnsurer: ({ agentId, workspacePath }) => ({
      version: 'g2',
      contracts_context: {
        contracts_dir: 'test-fixture',
        contracts_root_source: 'test-fixture',
      },
      workspace_initialization: {
        action: 'ensure',
        agent: { agent_id: agentId },
        workspace_path: fs.realpathSync.native(workspacePath),
      },
    } as unknown as ReturnType<NonNullable<Parameters<typeof resolveStandardAgentManagedCheckoutProduction>[0]['workspaceEnsurer']>>),
  });
}

test('managed checkout resolver uses one installed descriptor and configured native carrier without scope activation', async () => {
  const { root, workspaceRoot, checkoutRoot } = fixture();
  try {
    const result = await resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(status(checkoutRoot)),
    });

    assert.equal(result.runtime_source_kind, 'installed_native_carrier');
    assert.equal(result.package_id, 'mas');
    assert.equal(result.checkout_root, fs.realpathSync(checkoutRoot));
    assert.equal(result.package_use_binding, null);
    assert.equal(result.use_boundary_id, null);
    assert.equal(result.native_runtime.package_version, '0.2.25');
    assert.equal(result.native_runtime.plugin_selector, 'med-autoscience@med-autoscience');
    assert.equal(result.native_runtime.marketplace_source, 'gaofeng21cn/med-autoscience');
    assert.equal(result.native_runtime.source_tree_sha256, `sha256:${TREE_SHA256}`);
    assert.match(result.native_runtime.manifest_sha256, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed checkout resolver accepts canonical GitHub source readback and uses the marketplace runtime root', async () => {
  const { root, workspaceRoot, checkoutRoot } = fixture();
  try {
    const marketplaceRoot = path.join(root, 'marketplace');
    const pluginRoot = path.join(marketplaceRoot, 'plugins', 'med-autoscience');
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    fs.renameSync(checkoutRoot, pluginRoot);
    fs.mkdirSync(path.join(marketplaceRoot, 'contracts'));
    fs.copyFileSync(
      path.join(pluginRoot, 'contracts', 'domain_descriptor.json'),
      path.join(marketplaceRoot, 'contracts', 'domain_descriptor.json'),
    );
    fs.writeFileSync(path.join(marketplaceRoot, '.codex-marketplace-install.json'), `${JSON.stringify({
      source_type: 'git',
      source: 'https://github.com/gaofeng21cn/med-autoscience.git',
    })}\n`);
    const packageStatus = status(pluginRoot);
    (packageStatus.configured_carrier as any).carrier.observed_sources[0].marketplace_source =
      'https://github.com/gaofeng21cn/med-autoscience.git';

    const result = await resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(packageStatus),
    });

    assert.equal(result.native_runtime.marketplace_source, 'gaofeng21cn/med-autoscience');
    assert.equal(result.native_runtime.carrier_plugin_source_path, fs.realpathSync(pluginRoot));
    assert.equal(result.native_runtime.plugin_source_path, fs.realpathSync(marketplaceRoot));
    assert.equal(result.checkout_root, fs.realpathSync(marketplaceRoot));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed checkout resolver accepts an exact owner SemVer carrier readback', async () => {
  const { root, workspaceRoot, checkoutRoot } = fixture();
  try {
    const packageStatus = status(checkoutRoot);
    (packageStatus.configured_carrier as any).installed_version = '0.2.25';
    (packageStatus.configured_carrier as any).carrier.observed_sources[0].installed_version = '0.2.25';
    (packageStatus.installed_carrier_readback as any).version = '0.2.25';
    const result = await resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(packageStatus),
    });
    assert.equal(result.native_runtime.carrier_installed_version, '0.2.25');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed checkout resolver accepts only the policy-bound developer marketplace path', async () => {
  const { root, workspaceRoot, checkoutRoot } = fixture();
  try {
    const marketplaceRoot = path.join(root, 'developer-marketplace');
    const pluginRoot = path.join(marketplaceRoot, 'plugins', 'med-autoscience');
    fs.mkdirSync(path.dirname(pluginRoot), { recursive: true });
    fs.renameSync(checkoutRoot, pluginRoot);
    fs.mkdirSync(path.join(marketplaceRoot, 'contracts'));
    fs.copyFileSync(
      path.join(pluginRoot, 'contracts', 'domain_descriptor.json'),
      path.join(marketplaceRoot, 'contracts', 'domain_descriptor.json'),
    );
    const packageStatus = status(pluginRoot);
    const configured = packageStatus.configured_carrier as any;
    configured.carrier.marketplace_source = marketplaceRoot;
    configured.carrier.observed_sources[0].marketplace_source = marketplaceRoot;
    const sourcePolicy = {
      desired_source_kind: 'developer_checkout_override',
      developer_checkout_available: true,
      developer_checkout_path: marketplaceRoot,
    };
    const result = await resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(packageStatus, sourcePolicy),
    });
    assert.equal(result.native_runtime.marketplace_source, 'gaofeng21cn/med-autoscience');
    assert.equal(result.native_runtime.carrier_plugin_source_path, fs.realpathSync(pluginRoot));
    assert.equal(result.native_runtime.plugin_source_path, fs.realpathSync(marketplaceRoot));
    assert.equal(result.checkout_root, fs.realpathSync(marketplaceRoot));

    sourcePolicy.developer_checkout_path = workspaceRoot;
    await assert.rejects(resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(packageStatus, sourcePolicy),
    }), (error: any) => {
      assert.equal(error?.details?.failure_code, 'standard_agent_managed_checkout_not_launchable');
      return true;
    });

    (packageStatus.installed_carrier_readback as any).kind = 'local';
    const localCarrierResult = await resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(packageStatus),
    });
    assert.equal(localCarrierResult.native_runtime.plugin_source_path, fs.realpathSync(marketplaceRoot));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed checkout resolver rejects a non-installed configured carrier even when legacy readiness is callable', async () => {
  const { root, workspaceRoot, checkoutRoot } = fixture();
  try {
    const packageStatus = status(checkoutRoot, {
      launch_allowed: false,
      launch_blocked_reason: 'configured_native_carrier_unexpected_source_present',
    });
    Object.assign(packageStatus.configured_carrier, {
      status: 'not_installed',
      enabled: false,
      reason: 'configured_native_carrier_unexpected_source_present',
    });
    (packageStatus.configured_carrier as any).carrier.precedence = 'unexpected_same_plugin_name';
    (packageStatus.configured_carrier as any).executor.status = 'attention_needed';

    await assert.rejects(resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(packageStatus),
    }), (error: any) => {
      assert.equal(error?.details?.failure_code, 'standard_agent_managed_checkout_not_launchable');
      assert.equal(error?.details?.launch_blocked_reason, 'configured_native_carrier_unexpected_source_present');
      return true;
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed checkout resolver ensures a missing workspace through the composed Skill refresher', async () => {
  const { root, workspaceRoot, checkoutRoot } = fixture();
  const previousStateDir = process.env.OPL_STATE_DIR;
  const refreshedPackages: string[] = [];
  try {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    process.env.OPL_STATE_DIR = path.join(root, 'opl-state');

    const result = await resolveStandardAgentManagedCheckoutProduction({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(status(checkoutRoot)),
      refreshWorkspaceSkills: (input) => {
        refreshedPackages.push(input.packageId);
        return { status: 'not_installed' };
      },
    });

    assert.equal(result.workspace_root, fs.realpathSync(workspaceRoot));
    assert.equal(result.workspace_initialization.action, 'ensure');
    assert.equal(result.workspace_initialization.workspace_path, path.resolve(workspaceRoot));
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'workspace.yaml')), true);
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'workspace_index.json')), true);
    assert.deepEqual(refreshedPackages, ['mas']);
    assert.equal(result.workspace_initialization.workspace_skill_projection.status, 'not_installed');
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(path.join(workspaceRoot, 'skills')), false);
    assert.equal(fs.existsSync(path.join(workspaceRoot, '.agents', 'skills')), false);
  } finally {
    if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed checkout resolver fails closed on native carrier and owner identity drift', async () => {
  for (const fault of [
    'package',
    'version',
    'missing-version',
    'plugin',
    'marketplace',
    'path',
    'digest',
    'missing-installed-kind',
    'disabled',
  ] as const) {
    const { root, workspaceRoot, checkoutRoot } = fixture();
    try {
      const packageStatus = status(checkoutRoot);
      const configured = packageStatus.configured_carrier as any;
      if (fault === 'package') configured.package_id = 'rca';
      if (fault === 'version') {
        configured.installed_version = '0.2.24';
        configured.carrier.observed_sources[0].installed_version = '0.2.24';
        (packageStatus.installed_carrier_readback as any).version = '0.2.24';
      }
      if (fault === 'missing-version') {
        configured.installed_version = null;
        configured.carrier.observed_sources[0].installed_version = null;
        (packageStatus.installed_carrier_readback as any).version = null;
      }
      if (fault === 'plugin') configured.carrier.plugin_id = 'med-autoscience@unexpected';
      if (fault === 'marketplace') configured.carrier.marketplace_source = 'gaofeng21cn/unexpected';
      if (fault === 'path') configured.carrier.observed_sources[0].plugin_source_path = workspaceRoot;
      if (fault === 'digest') configured.carrier.observed_sources[0].source_tree_sha256 = null;
      if (fault === 'missing-installed-kind') {
        (packageStatus.installed_carrier_readback as any).kind = null;
      }
      if (fault === 'disabled') {
        configured.enabled = false;
        configured.executor.status = 'attention_needed';
        configured.carrier.observed_sources[0].enabled = false;
        (packageStatus.installed_carrier_readback as any).enabled = false;
        (packageStatus.installed_readiness as any).callability = 'disabled';
      }
      await assert.rejects(resolveStandardAgentManagedCheckout({
        domainId: 'mas',
        workspaceRoot,
        packageReadiness: packageReadiness(packageStatus),
      }), (error: any) => {
        assert.equal(error?.details?.failure_code, 'standard_agent_managed_checkout_not_launchable');
        return true;
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('managed checkout resolver rejects a plugin-subdirectory descriptor instead of fabricating repo-root runtime', async () => {
  const { root, workspaceRoot, checkoutRoot } = fixture();
  try {
    const descriptorPath = path.join(checkoutRoot, 'opl-package.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    descriptor.codex_surface.plugin_source_path = 'plugins/med-autoscience';
    fs.mkdirSync(path.join(checkoutRoot, 'plugins', 'med-autoscience'), { recursive: true });
    fs.writeFileSync(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
    await assert.rejects(resolveStandardAgentManagedCheckout({
      domainId: 'mas',
      workspaceRoot,
      packageReadiness: packageReadiness(status(checkoutRoot)),
    }), /repo-root configured native carrier/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
