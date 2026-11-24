import assert from 'node:assert/strict';
import test from 'node:test';

import {
  companionToolLatestVersionEnvKey,
  configuredLatestVersion,
} from '../../src/adapters/integration/install-companions-parts/tool-version.ts';
import { repoNameForModuleId } from '../../src/adapters/integration/system-installation/startup-maintenance.ts';
import { resolveDefaultFoundrySemanticProviderAgentId } from '../../src/adapters/execution/foundry-production-runtime.ts';
import { discoverInstalledManagedPolicyDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/registry-flow-policy.ts';
import { familyRuntimeCommandDomainId } from '../../src/read-models/operator/runtime-tray-app-operator-drilldown-parts/stage-production-evidence-route-common.ts';
import type { InstalledPackageDescriptor } from '../../src/adapters/integration/agent-package-registry-parts/installed-codex-plugin-directory-types.ts';

test('companionToolLatestVersionEnvKey derives env keys generically for built-in and new tools', () => {
  assert.equal(companionToolLatestVersionEnvKey('officecli'), 'OPL_OFFICECLI_LATEST_VERSION');
  assert.equal(companionToolLatestVersionEnvKey('mineru-open-api'), 'OPL_MINERU_OPEN_API_LATEST_VERSION');
  assert.equal(companionToolLatestVersionEnvKey('custom-cli-tool'), 'OPL_CUSTOM_CLI_TOOL_LATEST_VERSION');

  const prevMode = process.env.OPL_DEPENDENCY_RESOLUTION_MODE;
  const prevVal = process.env.OPL_CUSTOM_CLI_TOOL_LATEST_VERSION;
  try {
    process.env.OPL_DEPENDENCY_RESOLUTION_MODE = 'test_override';
    process.env.OPL_CUSTOM_CLI_TOOL_LATEST_VERSION = 'v2.4.1';
    assert.equal(configuredLatestVersion('custom-cli-tool'), '2.4.1');
  } finally {
    if (prevMode === undefined) delete process.env.OPL_DEPENDENCY_RESOLUTION_MODE;
    else process.env.OPL_DEPENDENCY_RESOLUTION_MODE = prevMode;
    if (prevVal === undefined) delete process.env.OPL_CUSTOM_CLI_TOOL_LATEST_VERSION;
    else process.env.OPL_CUSTOM_CLI_TOOL_LATEST_VERSION = prevVal;
  }
});

test('repoNameForModuleId resolves all registered Standard Agents and capability packages dynamically', () => {
  assert.equal(repoNameForModuleId('medautoscience'), 'med-autoscience');
  assert.equal(repoNameForModuleId('medautogrant'), 'med-autogrant');
  assert.equal(repoNameForModuleId('redcube'), 'redcube-ai');
  assert.equal(repoNameForModuleId('oplmetaagent'), 'opl-meta-agent');
  assert.equal(repoNameForModuleId('oplbookforge'), 'opl-bookforge');
  assert.equal(repoNameForModuleId('medautocast'), 'med-autocast');
  assert.equal(repoNameForModuleId('occ'), 'opl-capital-compass');
  assert.equal(repoNameForModuleId('oplcapitalcompass'), 'opl-capital-compass');
  assert.equal(repoNameForModuleId('med-autopractice'), 'med-autopractice');
});

test('familyRuntimeCommandDomainId and foundry default provider resolve dynamically from package projections', () => {
  assert.equal(familyRuntimeCommandDomainId('mas', null), 'medautoscience');
  assert.equal(familyRuntimeCommandDomainId('redcube_ai', null), 'redcube');
  assert.equal(familyRuntimeCommandDomainId('med-autocast', null), 'medical_video');
  assert.equal(familyRuntimeCommandDomainId('opl-capital-compass', null), 'occ');
  assert.equal(resolveDefaultFoundrySemanticProviderAgentId(), 'oma');
});

test('discoverInstalledManagedPolicyDescriptor discovers non-opl-flow first-party policy descriptors dynamically', () => {
  const customDescriptor = {
    manifest: {
      package_id: 'custom-policy-pack',
      source: 'first_party',
      managed_policy_surface: {
        policy_kind: 'opl_flow_workflow_policy',
        source_path: 'contracts/workflow-policy.json',
        schema_path: 'contracts/workflow-policy.schema.json',
      },
    },
  } as unknown as InstalledPackageDescriptor;
  const discovered = discoverInstalledManagedPolicyDescriptor(
    new Map([['custom-policy-pack', customDescriptor]]),
  );
  assert.equal(discovered?.manifest.package_id, 'custom-policy-pack');
});
