import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertStandardAgentDescriptorIdentity,
  readStandardAgentDescriptorInterface,
} from '../../../src/kernel/standard-agent-interface.ts';
import {
  readInstalledStandardAgentDescriptorForDomain,
  readInstalledStandardAgentDescriptorForPackage,
  readPackageManagedStandardAgentDescriptor,
  readStandardAgentDescriptorForDomain,
  resolveStandardAgentContractCheckout,
  standardAgentProgressDeltaKeySet,
  standardAgentProgressDeltaKeys,
} from '../../../src/adapters/integration/standard-agent-interface-discovery.ts';
import {
  fixture,
  standardAgentDescriptor,
  writeStandardAgentDescriptor,
} from './descriptor-and-source-material.ts';

function initializeGitCheckout(repoDir: string) {
  execFileSync('git', ['init', '--quiet'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: repoDir });
  execFileSync('git', ['add', '.'], { cwd: repoDir });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: repoDir });
}

function withDeveloperBookForgeSources(
  run: (input: {
    siblingRepo: string;
    managedRepo: string;
    statusReader: PackageStatusReaderFixture;
    statusReads: string[];
  }) => void,
) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-source-'));
  const stateDir = path.join(fixtureRoot, 'state');
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const siblingRepo = path.join(workspaceRoot, 'opl-bookforge');
  const managedRepo = path.join(stateDir, 'modules', 'opl-bookforge');
  const envKeys = [
    'OPL_STATE_DIR',
    'OPL_FAMILY_WORKSPACE_ROOT',
    'OPL_MODULES_ROOT',
    'OPL_MODULE_SOURCE_MODE',
    'OPL_MODULE_PATH_OPLBOOKFORGE',
    'OPL_MODULE_REPO_URL_OPLBOOKFORGE',
    'OPL_FULL_RUNTIME_HOME',
  ] as const;
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const statusReads: string[] = [];

  fs.mkdirSync(siblingRepo, { recursive: true });
  writeStandardAgentDescriptor(siblingRepo, standardAgentDescriptor('oplbookforge'));
  initializeGitCheckout(siblingRepo);
  writeStandardAgentDescriptor(managedRepo, standardAgentDescriptor('oplbookforge', {
    ...fixture(),
    workspace_binding: {
      ...fixture().workspace_binding,
      entry_command_template: ['stale', 'entry'],
    },
  } as ReturnType<typeof fixture>));
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'developer-supervisor.json'), `${JSON.stringify({
    version: 'g1',
    enabled: 'on',
    mode: 'developer_apply_safe',
    auto_enable_github_login: 'fixture',
    updated_at: '2026-07-14T00:00:00.000Z',
  }, null, 2)}\n`);

  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId ?? '');
    return {
      opl_agent_package_status: {
        installed_package_count: 1,
        package_dependency_readiness: {
          status: 'current',
          operational_ready: true,
        },
        installed_carrier_readback: {
          lifecycle_authority: 'carrier_owned',
          source_ref: managedRepo,
        },
        installed_readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        launch_allowed: true,
      },
    };
  }) as PackageStatusReaderFixture;

  try {
    process.env.OPL_STATE_DIR = stateDir;
    process.env.OPL_FAMILY_WORKSPACE_ROOT = workspaceRoot;
    for (const key of envKeys.slice(2)) delete process.env[key];
    run({ siblingRepo, managedRepo, statusReader, statusReads });
  } finally {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

type PackageStatusReaderFixture = Parameters<typeof readStandardAgentDescriptorForDomain>[1];

test('package dependency and native carrier readiness gate descriptor discovery independently of workspace scope', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-managed-'));
  try {
    fs.mkdirSync(path.join(repoDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'), `${JSON.stringify({
      domain_id: 'fixture-agent',
      standard_agent_interface: fixture(),
    })}\n`);
    const statusReads: Array<{ packageId?: string | null }> = [];
    const statusReader = ((input: { packageId?: string | null }) => {
      statusReads.push(input);
      return {
      opl_agent_package_status: input.packageId === 'mas'
        ? {
            installed_package_count: 1,
            operational_ready: false,
            package_dependency_readiness: {
              status: 'current',
              operational_ready: true,
            },
            materialization_readiness: {
              status: 'scope_required',
            },
            installed_carrier_readback: {
              lifecycle_authority: 'carrier_owned',
              source_ref: repoDir,
            },
            installed_readiness: {
              installed: true,
              physical_status: 'available',
              callability: 'callable',
            },
            launch_allowed: true,
          }
        : {
            installed_package_count: 0,
            operational_ready: false,
            package_dependency_readiness: {
              status: 'missing',
              operational_ready: false,
            },
          },
      };
    }) as any;
    const descriptor = readPackageManagedStandardAgentDescriptor(['mas'], statusReader);
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(repoDir));
    assert.equal(descriptor?.interface.runtime.runtime_domain_id, 'fixture');
    assert.equal(Object.hasOwn(statusReads[0] ?? {}, 'recoverRuntimeSource'), false);
    assert.deepEqual(standardAgentProgressDeltaKeys('fixture-agent', 'deliverable', statusReader), [
      'deliverable_progress_delta',
      'fixture_deliverable_delta',
    ]);
    const statusReadCountBeforeKeySet = statusReads.length;
    assert.deepEqual(standardAgentProgressDeltaKeySet('fixture-agent', statusReader), {
      deliverable: ['deliverable_progress_delta', 'fixture_deliverable_delta'],
      platform: ['platform_repair_delta', 'fixture_platform_delta'],
    });
    assert.equal(statusReads.length, statusReadCountBeforeKeySet + 2);
    const observedDeveloperDriftReader = statusReader;
    assert.equal(
      fs.realpathSync.native(
        readPackageManagedStandardAgentDescriptor(['mas'], observedDeveloperDriftReader)?.repo_dir ?? '',
      ),
      fs.realpathSync.native(repoDir),
    );
    const observedDriftResolution = resolveStandardAgentContractCheckout(
      'mas',
      observedDeveloperDriftReader,
      () => null,
      { result: 'typed_resolution' },
    );
    assert.equal(observedDriftResolution.status, 'resolved');
    assert.equal(observedDriftResolution.launch_allowed, true);
    assert.equal(observedDriftResolution.reason, null);
    assert.equal(
      fs.realpathSync.native(observedDriftResolution.checkout?.checkout_path ?? ''),
      fs.realpathSync.native(repoDir),
    );
    const incompatibleSourceStatusReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.launch_allowed = false;
        readback.opl_agent_package_status.launch_blocked_reason = 'installed_native_carrier_required';
        delete readback.opl_agent_package_status.installed_carrier_readback;
        delete readback.opl_agent_package_status.installed_readiness;
      }
      return readback;
    }) as any;
    assert.equal(readPackageManagedStandardAgentDescriptor(['mas'], incompatibleSourceStatusReader), null);
    const incompatibleResolution = resolveStandardAgentContractCheckout(
      'mas',
      incompatibleSourceStatusReader,
      () => null,
      { result: 'typed_resolution' },
    );
    assert.equal(incompatibleResolution.status, 'blocked');
    assert.equal(incompatibleResolution.launch_allowed, false);
    assert.equal(incompatibleResolution.reason, 'installed_native_carrier_required');
    const missingDependencyStatusReader = ((input: { packageId?: string | null }) => {
      const readback = statusReader(input);
      if (input.packageId === 'mas') {
        readback.opl_agent_package_status.package_dependency_readiness.operational_ready = false;
        readback.opl_agent_package_status.launch_allowed = false;
        readback.opl_agent_package_status.launch_blocked_reason = 'package_dependency_missing';
      }
      return readback;
    }) as any;
    assert.equal(readPackageManagedStandardAgentDescriptor(['mas'], missingDependencyStatusReader), null);
    assert.throws(
      () => assertStandardAgentDescriptorIdentity(descriptor!, {
        project: 'different-agent',
        domain_id: 'different',
      }),
      /identity does not match/,
    );
    assert.equal(assertStandardAgentDescriptorIdentity({
      ...descriptor!,
      domain_id: 'mas',
    }, {
      project: 'med-autoscience',
      domain_id: 'medautoscience',
    }).domain_id, 'mas');
    assert.equal(readStandardAgentDescriptorInterface(repoDir)?.domain_id, 'fixture-agent');
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('known domain discovery probes only its matching managed package', () => {
  const statusReads: Array<string | null | undefined> = [];
  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId);
    return {
      opl_agent_package_status: {
        operational_ready: false,
        runtime_source_readiness: {
          status: 'missing',
          operational_ready: false,
          checkout_path: null,
          expected_tree_sha256: null,
          actual_tree_sha256: null,
        },
      },
    };
  }) as any;

  readStandardAgentDescriptorForDomain('medautoscience', statusReader, () => null);

  assert.deepEqual(statusReads, ['mas']);
});

test('installed Agent discovery is presence-only while launch compatibility remains gated', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-present-'));
  try {
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('fixture-agent'),
      kind: 'agent',
      agent_id: 'fixture-agent',
      package_id: 'fixture-agent',
    });
    const statusReader = (() => ({
      opl_agent_package_status: {
        installed_package_count: 1,
        package_dependency_readiness: {
          status: 'missing',
          operational_ready: false,
        },
        installed_carrier_readback: {
          lifecycle_authority: 'carrier_owned',
          source_ref: repoDir,
        },
        installed_readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        launch_allowed: false,
        launch_blocked_reason: 'package_dependency_missing',
      },
    })) as PackageStatusReaderFixture;

    assert.equal(
      fs.realpathSync.native(
        readInstalledStandardAgentDescriptorForDomain('fixture-agent', statusReader, () => null)?.repo_dir ?? '',
      ),
      fs.realpathSync.native(repoDir),
    );
    assert.equal(readStandardAgentDescriptorForDomain('fixture-agent', statusReader, () => null), null);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('installed Agent discovery falls back to its native carrier when the legacy module is missing', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-missing-module-'));
  try {
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('oplbookforge'),
      kind: 'agent',
      agent_id: 'obf',
      package_id: 'obf',
    });
    const statusReads: string[] = [];
    const statusReader = ((input: { packageId?: string | null }) => {
      statusReads.push(input.packageId ?? '');
      return {
        opl_agent_package_status: {
          installed_package_count: 1,
          installed_carrier_readback: {
            lifecycle_authority: 'carrier_owned',
            source_ref: repoDir,
          },
          installed_readiness: {
            installed: true,
            physical_status: 'available',
            callability: 'callable',
          },
          launch_allowed: true,
        },
      };
    }) as PackageStatusReaderFixture;
    const missingModule = () => ({
      installed: false,
      health_status: 'missing' as const,
      install_origin: 'managed_root' as const,
      checkout_path: path.join(repoDir, 'missing-module'),
    });
    const descriptor = readInstalledStandardAgentDescriptorForDomain('oplbookforge', statusReader, missingModule);
    assert.equal(descriptor?.kind, 'agent');
    assert.equal(descriptor?.agent_id, 'obf');
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(repoDir));
    assert.deepEqual(statusReads, ['obf']);

    // A deliberately selected invalid source must not silently switch authority.
    const invalidModule = () => ({ ...missingModule(), health_status: 'invalid_checkout' as const });
    assert.equal(readInstalledStandardAgentDescriptorForDomain('oplbookforge', statusReader, invalidModule), null);
    assert.deepEqual(statusReads, ['obf']);

    const absentCarrier = (() => ({
      opl_agent_package_status: { installed_package_count: 0 },
    })) as PackageStatusReaderFixture;
    assert.equal(readInstalledStandardAgentDescriptorForDomain('oplbookforge', absentCarrier, missingModule), null);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('installed package descriptor discovery bypasses registry-selected module routing', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-direct-package-'));
  const statusReads: string[] = [];
  try {
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('independent-agent'),
      kind: 'agent',
      agent_id: 'independent-agent',
      package_id: 'fixture-package',
    });
    const statusReader = ((input: { packageId?: string | null }) => {
      statusReads.push(input.packageId ?? '');
      return {
        opl_agent_package_status: {
          installed_package_count: 1,
          agent_id: 'independent-agent',
          installed_carrier_readback: {
            lifecycle_authority: 'carrier_owned',
            source_ref: repoDir,
          },
          installed_readiness: {
            installed: true,
            physical_status: 'available',
            callability: 'callable',
          },
          launch_allowed: true,
        },
      };
    }) as PackageStatusReaderFixture;

    const descriptor = readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader);

    assert.equal(descriptor?.package_id, 'fixture-package');
    assert.equal(descriptor?.agent_id, 'independent-agent');
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(repoDir));
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('other-agent'),
      kind: 'agent',
      agent_id: 'other-agent',
      package_id: 'other-agent',
    });
    assert.equal(readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader), null);
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('second-independent-agent'),
      kind: 'agent',
      agent_id: 'second-independent-agent',
      package_id: 'fixture-package',
    });
    assert.equal(
      readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader),
      null,
    );
    writeStandardAgentDescriptor(repoDir, {
      ...standardAgentDescriptor('independent-agent'),
      kind: 'workflow_profile',
      agent_id: 'independent-agent',
      package_id: 'fixture-package',
    });
    assert.throws(
      () => readInstalledStandardAgentDescriptorForPackage('fixture-package', statusReader),
      /descriptor kind must be agent/,
    );
    assert.deepEqual(statusReads, [
      'fixture-package',
      'fixture-package',
      'fixture-package',
      'fixture-package',
    ]);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('installed carrier source owns descriptor discovery without legacy runtime source readiness', () => {
  const carrierRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-carrier-'));
  const legacyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-legacy-'));
  try {
    writeStandardAgentDescriptor(carrierRepo, {
      ...standardAgentDescriptor('future-agent'),
      kind: 'agent',
      agent_id: 'future-agent',
      package_id: 'future-package',
    });
    writeStandardAgentDescriptor(legacyRepo, {
      ...standardAgentDescriptor('legacy-agent'),
      kind: 'agent',
      agent_id: 'legacy-agent',
      package_id: 'future-package',
    });
    const carrierSource = { current: carrierRepo };
    const statusReader = (() => ({
      version: 'g2',
      opl_agent_package_status: {
        installed_package_count: 1,
        installed_carrier_readback: {
          kind: 'codex_plugin_manager',
          identity: 'future-package',
          source_ref: carrierSource.current,
          version: '1.0.0',
          enabled: true,
          lifecycle_authority: 'carrier_owned',
        },
        installed_readiness: {
          installed: true,
          physical_status: 'available',
          callability: 'callable',
        },
        launch_allowed: true,
      },
    })) as unknown as PackageStatusReaderFixture;

    const descriptor = readInstalledStandardAgentDescriptorForPackage('future-package', statusReader);
    assert.equal(descriptor?.agent_id, 'future-agent');
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(carrierRepo));

    carrierSource.current = path.join(carrierRepo, 'missing');
    assert.equal(readInstalledStandardAgentDescriptorForPackage('future-package', statusReader), null);

    const configuredStatus = { executorStatus: 'callable' };
    const configuredStatusReader = (() => ({
      version: 'g2',
      opl_agent_package_status: {
        installed_package_count: 1,
        configured_carrier: {
          status: 'installed',
          executor: { status: configuredStatus.executorStatus },
          plugin_source_path: carrierRepo,
        },
        installed_carrier_readback: null,
        installed_readiness: null,
        launch_allowed: true,
      },
    })) as unknown as PackageStatusReaderFixture;

    assert.equal(
      readInstalledStandardAgentDescriptorForPackage('future-package', configuredStatusReader)?.agent_id,
      'future-agent',
    );
    configuredStatus.executorStatus = 'attention_needed';
    assert.equal(
      readInstalledStandardAgentDescriptorForPackage('future-package', configuredStatusReader),
      null,
    );
  } finally {
    fs.rmSync(carrierRepo, { recursive: true, force: true });
    fs.rmSync(legacyRepo, { recursive: true, force: true });
  }
});

test('standard Agent contract checkout prefers the OPL-selected developer source', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-contract-checkout-'));
  const statusReads: string[] = [];
  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId ?? '');
    throw new Error('Package status must not override a selected developer checkout.');
  }) as PackageStatusReaderFixture;
  try {
    const checkout = resolveStandardAgentContractCheckout('medautoscience', statusReader, () => ({
      installed: true,
      install_origin: 'sibling_workspace',
      checkout_path: repoDir,
      health_status: 'ready',
    }));

    assert.equal(checkout?.agent_id, 'mas');
    assert.equal(checkout?.domain_id, 'medautoscience');
    assert.equal(checkout?.source_kind, 'opl_selected_developer_checkout');
    assert.equal(fs.realpathSync.native(checkout?.checkout_path ?? ''), fs.realpathSync.native(repoDir));
    assert.deepEqual(statusReads, []);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('managed-root contract checkout requires matching current package source', () => {
  const selectedRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-selected-managed-'));
  const packageRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-package-managed-'));
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      package_dependency_readiness: {
        status: 'current',
        operational_ready: true,
      },
      runtime_source_readiness: {
        status: 'current',
        operational_ready: true,
        checkout_path: packageRepo,
        expected_tree_sha256: 'sha256:current',
        actual_tree_sha256: 'sha256:current',
      },
    },
  })) as unknown as PackageStatusReaderFixture;
  try {
    const checkout = resolveStandardAgentContractCheckout('mas', statusReader, () => ({
      installed: true,
      install_origin: 'managed_root',
      checkout_path: selectedRepo,
      health_status: 'ready',
    }));

    assert.equal(checkout, null);
  } finally {
    fs.rmSync(selectedRepo, { recursive: true, force: true });
    fs.rmSync(packageRepo, { recursive: true, force: true });
  }
});

test('native carrier contract checkout uses the carrier source without runtime source readiness', () => {
  const carrierRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-native-contract-carrier-'));
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      installed_carrier_readback: {
        kind: 'codex_plugin_manager',
        identity: 'mas',
        source_ref: carrierRepo,
        version: '0.2.24',
        enabled: true,
        lifecycle_authority: 'carrier_owned',
      },
      installed_readiness: {
        installed: true,
        physical_status: 'available',
        callability: 'callable',
      },
      package_dependency_readiness: {
        status: 'current',
        operational_ready: true,
      },
    },
  })) as unknown as PackageStatusReaderFixture;

  try {
    const resolution = resolveStandardAgentContractCheckout(
      'mas',
      statusReader,
      () => null,
      { result: 'typed_resolution' },
    );

    assert.equal(resolution.status, 'resolved');
    assert.equal(resolution.launch_allowed, true);
    assert.equal(resolution.source_status, 'current');
    assert.equal(resolution.checkout?.source_kind, 'opl_installed_native_carrier');
    assert.equal(fs.realpathSync.native(resolution.checkout?.checkout_path ?? ''), fs.realpathSync.native(carrierRepo));
  } finally {
    fs.rmSync(carrierRepo, { recursive: true, force: true });
  }
});

test('installed Git marketplace discovery shares the hosted runtime root and rejects a foreign marker', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-marketplace-discovery-')));
  const pluginRoot = path.join(root, 'plugins', 'med-autoscience');
  fs.mkdirSync(pluginRoot, { recursive: true });
  writeStandardAgentDescriptor(root, standardAgentDescriptor('medautoscience'));
  const marker = path.join(root, '.codex-marketplace-install.json');
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      launch_allowed: true,
      installed_carrier_readback: {
        lifecycle_authority: 'carrier_owned',
        source_ref: pluginRoot,
      },
      installed_readiness: { installed: true, physical_status: 'available', callability: 'callable' },
      configured_carrier: { carrier: { marketplace_source: 'gaofeng21cn/med-autoscience' } },
    },
  })) as unknown as PackageStatusReaderFixture;
  try {
    fs.writeFileSync(marker, JSON.stringify({ source: 'https://github.com/gaofeng21cn/med-autoscience.git' }));
    assert.equal(resolveStandardAgentContractCheckout('mas', statusReader, () => null)?.checkout_path, root);
    assert.equal(readStandardAgentDescriptorForDomain('mas', statusReader, () => null)?.domain_id, 'medautoscience');
    fs.writeFileSync(marker, JSON.stringify({ source: 'https://github.com/other/foreign.git' }));
    assert.equal(resolveStandardAgentContractCheckout('mas', statusReader, () => null)?.checkout_path, pluginRoot);
    assert.equal(readStandardAgentDescriptorForDomain('mas', statusReader, () => null), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('typed contract checkout resolution fails closed without native carrier authority', () => {
  const statusReader = (() => ({
    opl_agent_package_status: {
      installed_package_count: 1,
      package_dependency_readiness: {
        status: 'current',
        operational_ready: true,
      },
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'installed_native_carrier_required',
    },
  })) as PackageStatusReaderFixture;

  const resolution = resolveStandardAgentContractCheckout(
    'mas',
    statusReader,
    () => null,
    { result: 'typed_resolution' },
  );

  assert.equal(resolution.status, 'blocked');
  assert.equal(resolution.reason, 'installed_native_carrier_required');
  assert.equal(resolution.source_status, null);
  assert.equal(resolution.launch_allowed, false);
  assert.equal(resolution.checkout, null);
  assert.equal(resolveStandardAgentContractCheckout('mas', statusReader, () => null), null);
});

test('developer-selected sibling descriptor wins over an inactive stale managed mirror', () => {
  withDeveloperBookForgeSources(({ siblingRepo, statusReader, statusReads }) => {
    const descriptor = readStandardAgentDescriptorForDomain('obf', statusReader);

    assert.equal(
      fs.realpathSync.native(descriptor?.repo_dir ?? ''),
      fs.realpathSync.native(siblingRepo),
    );
    assert.equal(descriptor?.domain_id, 'oplbookforge');
    assert.deepEqual(statusReads, []);
  });
});

test('selected descriptor accepts a canonical registry agent id as its domain identity', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-interface-agent-id-'));
  const statusReads: string[] = [];
  const statusReader = ((input: { packageId?: string | null }) => {
    statusReads.push(input.packageId ?? '');
    throw new Error('Package status should not be read for a selected sibling checkout.');
  }) as PackageStatusReaderFixture;
  try {
    writeStandardAgentDescriptor(repoDir, standardAgentDescriptor('mas'));
    const descriptor = readStandardAgentDescriptorForDomain('mas', statusReader, () => ({
      installed: true,
      install_origin: 'sibling_workspace',
      checkout_path: repoDir,
      health_status: 'ready',
    }));

    assert.equal(descriptor?.domain_id, 'mas');
    assert.equal(fs.realpathSync.native(descriptor?.repo_dir ?? ''), fs.realpathSync.native(repoDir));
    assert.deepEqual(statusReads, []);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('developer-selected sibling descriptor remains fail-closed when the selected source is invalid', () => {
  withDeveloperBookForgeSources(({ siblingRepo, statusReader, statusReads }) => {
    writeStandardAgentDescriptor(siblingRepo, standardAgentDescriptor('oplbookforge', {
      ...fixture(),
      workspace_binding: {
        ...fixture().workspace_binding,
        manifest_command_template: ['invalid', 'selected'],
      },
    } as ReturnType<typeof fixture>));

    assert.throws(
      () => readStandardAgentDescriptorForDomain('obf', statusReader),
      /unknown properties/,
    );
    assert.deepEqual(statusReads, []);
  });
});
