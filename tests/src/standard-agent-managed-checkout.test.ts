import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveStandardAgentManagedCheckout } from '../../src/modules/runway/standard-agent-managed-checkout.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-managed-checkout-'));
  const workspaceRoot = path.join(root, 'workspace');
  const checkoutRoot = path.join(root, 'managed-source');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(checkoutRoot);
  return { workspaceRoot, checkoutRoot };
}

function status(checkoutRoot: string, overrides: Record<string, unknown> = {}) {
  return {
    installed_package_count: 1,
    launch_allowed: true,
    launch_blocked_reason: null,
    runtime_source_readiness: {
      status: 'current',
      operational_ready: true,
      checkout_path: checkoutRoot,
      expected_tree_sha256: 'tree-sha',
      actual_tree_sha256: 'tree-sha',
    },
    ...overrides,
  };
}

test('managed checkout resolver uses package activation and exact current runtime source', async () => {
  const { workspaceRoot, checkoutRoot } = fixture();
  let activationCalls = 0;
  const result = await resolveStandardAgentManagedCheckout({
    domainId: 'mas',
    workspaceRoot,
    packageReadiness: {
      readStatus: () => ({ opl_agent_package_status: status(checkoutRoot) }),
      ensureScopeActivation: async () => {
        activationCalls += 1;
        return { package_use_binding: { use_boundary_id: 'package-use:test' } };
      },
    },
  });

  assert.equal(result.package_id, 'mas');
  assert.equal(result.checkout_root, fs.realpathSync(checkoutRoot));
  assert.equal(result.package_status.launch_allowed, true);
  assert.equal(activationCalls, 1);
});

test('managed checkout resolver rejects an installed runtime source identity mismatch before scope activation', async () => {
  const { workspaceRoot, checkoutRoot } = fixture();
  let activationCalls = 0;
  await assert.rejects(resolveStandardAgentManagedCheckout({
    domainId: 'oma',
    workspaceRoot,
    packageReadiness: {
      readStatus: () => ({
        opl_agent_package_status: status(checkoutRoot, {
          launch_allowed: false,
          launch_blocked_reason: 'managed_runtime_source_identity_mismatch',
          runtime_source_readiness: {
            status: 'incompatible',
            operational_ready: false,
            reason: 'managed_runtime_source_identity_mismatch',
            checkout_path: checkoutRoot,
            expected_tree_sha256: 'expected-tree-sha',
            actual_tree_sha256: 'actual-tree-sha',
          },
        }),
      }),
      ensureScopeActivation: async () => {
        activationCalls += 1;
        throw new Error('scope activation must not run for an untrusted runtime source');
      },
    },
  }), (error: any) => {
    assert.equal(error?.details?.failure_code, 'standard_agent_managed_checkout_not_launchable');
    assert.equal(error?.details?.launch_blocked_reason, 'managed_runtime_source_identity_mismatch');
    assert.equal(error?.details?.runtime_source_readiness?.expected_tree_sha256, 'expected-tree-sha');
    assert.equal(error?.details?.runtime_source_readiness?.actual_tree_sha256, 'actual-tree-sha');
    return true;
  });
  assert.equal(activationCalls, 0);
});

test('managed checkout resolver keeps the activation binding and runtime snapshot in one generation', async () => {
  const { workspaceRoot, checkoutRoot: firstCheckoutRoot } = fixture();
  const secondCheckoutRoot = path.join(path.dirname(firstCheckoutRoot), 'managed-source-v2');
  fs.mkdirSync(secondCheckoutRoot);
  let generation: 'v1' | 'v2' = 'v1';
  let readCalls = 0;
  const firstStatus = status(firstCheckoutRoot, {
    installed_packages: [{ package_id: 'mas', package_version: '0.2.9' }],
  });
  const secondStatus = status(secondCheckoutRoot, {
    installed_packages: [{ package_id: 'mas', package_version: '0.3.0' }],
  });
  const result = await resolveStandardAgentManagedCheckout({
    domainId: 'mas',
    workspaceRoot,
    packageReadiness: {
      readStatus: () => {
        readCalls += 1;
        return {
          opl_agent_package_status: generation === 'v1' ? firstStatus : secondStatus,
        };
      },
      ensureScopeActivation: async () => {
        generation = 'v2';
        return {
          package_use_binding: {
            use_boundary_id: 'package-use:generation-v1',
            root_package: { package_id: 'mas', package_version: '0.2.9' },
          },
          package_status: firstStatus,
        };
      },
    },
  });

  assert.equal(readCalls, 1);
  assert.equal(result.checkout_root, fs.realpathSync(firstCheckoutRoot));
  assert.equal(result.package_status.installed_packages[0].package_version, '0.2.9');
  assert.equal(result.package_use_binding.root_package.package_version, '0.2.9');
});

test('managed checkout resolver accepts live-probed developer checkout provenance drift', async () => {
  const { workspaceRoot, checkoutRoot } = fixture();
  const result = await resolveStandardAgentManagedCheckout({
    domainId: 'mas',
    workspaceRoot,
    packageReadiness: {
      readStatus: () => ({
        opl_agent_package_status: status(checkoutRoot, {
          runtime_source_readiness: {
            status: 'current',
            operational_ready: true,
            checkout_path: checkoutRoot,
            expected_tree_sha256: 'recorded-tree-sha',
            actual_tree_sha256: 'current-tree-sha',
            provenance_observation: {
              policy: 'observation_only',
              status: 'changed',
            },
          },
        }),
      }),
      ensureScopeActivation: async () => ({ package_use_binding: null }),
    },
  });

  assert.equal(result.checkout_root, fs.realpathSync(checkoutRoot));
  assert.equal(result.package_status.launch_allowed, true);
});

test('managed checkout resolver permits package quality debt when the runtime source is operational', async () => {
  const { workspaceRoot, checkoutRoot } = fixture();
  const result = await resolveStandardAgentManagedCheckout({
    domainId: 'mas',
    workspaceRoot,
    packageReadiness: {
      readStatus: () => ({
        opl_agent_package_status: status(checkoutRoot, {
          launch_allowed: false,
          launch_blocked_reason: 'scope_materialization_stale',
        }),
      }),
      ensureScopeActivation: async () => ({ package_use_binding: null }),
    },
  });

  assert.equal(result.checkout_root, fs.realpathSync(checkoutRoot));
  assert.equal(result.package_status.launch_allowed, false);
  assert.equal(result.package_status.launch_blocked_reason, 'scope_materialization_stale');
});
