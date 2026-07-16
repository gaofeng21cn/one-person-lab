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

test('managed checkout resolver rejects package quality-debt fail-open states', async () => {
  const { workspaceRoot, checkoutRoot } = fixture();
  await assert.rejects(resolveStandardAgentManagedCheckout({
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
  }), /launch_allowed=true/);
});
