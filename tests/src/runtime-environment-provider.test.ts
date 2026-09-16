import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION,
  RUNTIME_ENVIRONMENT_PROVIDER_IDS,
  resolveRuntimeEnvironmentProvider,
  resolveRuntimeEnvironmentProviderId,
  runtimeEnvironmentProviderContract,
  runtimeEnvironmentProviderFor,
} from '../../src/adapters/execution/runtime-environment-provider.ts';
import {
  setE2bSandboxFactoryForTest,
} from '../../src/adapters/execution/e2b-codex-stage-execution.ts';
import {
  selectCodexStageSandboxProvider,
} from '../../src/adapters/execution/local-codex-stage-sandbox.ts';

test('runtime environment provider contract exposes E2B as the only implemented provider', () => {
  const contract = runtimeEnvironmentProviderContract();
  assert.equal(contract.surface_kind, 'opl_runtime_environment_provider_contract');
  assert.equal(contract.abi_version, RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION);
  assert.deepEqual(contract.implemented_provider_ids, ['e2b']);
  assert.deepEqual(RUNTIME_ENVIRONMENT_PROVIDER_IDS, ['e2b']);
  assert.equal(contract.selection, 'explicit_only');
  assert.equal(contract.unsupported_provider_behavior, 'fail_closed_no_host_fallback');
  assert.equal(contract.temporal_replacement, false);
});

test('runtime environment provider selection is explicit and never silently falls back', () => {
  assert.equal(resolveRuntimeEnvironmentProviderId({
    OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'e2b',
  }), 'e2b');
  assert.equal(resolveRuntimeEnvironmentProviderId({
    OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
    OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
  }), 'e2b');
  assert.equal(resolveRuntimeEnvironmentProviderId({
    OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'host',
  }), null);
  assert.equal(resolveRuntimeEnvironmentProviderId({
    OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'local_docker',
  }), null);
  for (const alias of ['dev_container', 'dev-container']) {
    assert.equal(resolveRuntimeEnvironmentProviderId({
      OPL_CODEX_STAGE_SANDBOX_PROVIDER: alias,
    }), null);
    assert.equal(selectCodexStageSandboxProvider({
      OPL_CODEX_STAGE_SANDBOX_PROVIDER: alias,
    }), 'local_devcontainer');
  }
  assert.throws(
    () => resolveRuntimeEnvironmentProviderId({
      OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'daytona',
    }),
    (error: any) => error?.code === 'cli_usage_error'
      && error?.details?.failure_code === 'runtime_environment_provider_unsupported'
      && error?.details?.fallback_allowed === false,
  );
  assert.throws(
    () => resolveRuntimeEnvironmentProviderId({
      OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
      OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'modal',
    }),
    (error: any) => error?.code === 'cli_usage_error'
      && error?.details?.failure_code === 'runtime_environment_provider_unsupported',
  );
  assert.equal(selectCodexStageSandboxProvider({
    OPL_FAMILY_RUNTIME_PROVIDER: 'external_sandbox',
    OPL_EXTERNAL_SANDBOX_SUBSTRATE: 'e2b',
  }), 'e2b');
  assert.throws(
    () => selectCodexStageSandboxProvider({
      OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'modal',
    }),
    (error: any) => error?.details?.fallback_allowed === false,
  );
});

test('E2B provider readback is configuration-only and preserves authority boundaries', () => {
  const provider = runtimeEnvironmentProviderFor('e2b');
  const readback = provider.inspect({
    OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'e2b',
    OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.example.test',
    OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'secret-ref:fixture',
    OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'receipt-ref:fixture',
  });
  assert.equal(readback.provider_id, 'e2b');
  assert.equal(readback.selected, true);
  assert.equal(readback.status, 'configured');
  assert.deepEqual(readback.missing_required_refs, []);
  assert.equal(readback.credential_material_read, false);
  assert.equal(readback.external_api_called, false);
  assert.equal(readback.provider_lifecycle_managed, false);
  assert.equal(readback.can_claim_provider_ready, false);
  assert.equal(readback.can_claim_runtime_ready, false);
  assert.equal(resolveRuntimeEnvironmentProvider({
    OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'e2b',
  }), provider);
});

test('E2B provider executes the existing sandbox caller through the provider boundary', async () => {
  const commands: string[] = [];
  const sandbox = {
    sandboxId: 'sandbox-provider-fixture',
    commands: {
      async run(command: string) {
        commands.push(command);
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    },
    files: {
      async write() {
        return {};
      },
    },
  };
  setE2bSandboxFactoryForTest({
    async create() { return sandbox; },
    async connect() { return sandbox; },
  });
  try {
    const result = await runtimeEnvironmentProviderFor('e2b').execute({
      attempt: {
        stage_attempt_id: 'sat-runtime-provider',
        workspace_locator: {
          git_remote_url: 'https://example.test/repo.git',
          checkout_ref: 'fixture-ref',
        },
      },
      args: ['exec', '--json', 'fixture prompt'],
      env: {
        OPL_CODEX_STAGE_SANDBOX_PROVIDER: 'e2b',
        OPL_EXTERNAL_SANDBOX_ENDPOINT: 'https://sandbox.example.test',
        OPL_EXTERNAL_SANDBOX_CREDENTIAL_REF: 'secret-ref:fixture',
        OPL_EXTERNAL_SANDBOX_PROVIDER_RECEIPT_REF: 'receipt-ref:fixture',
        OPL_E2B_WORKSPACE_ROOT: '/home/user/fixture',
      },
      timeoutMs: 10_000,
    });
    assert.equal(result.result.exitCode, 0);
    assert.equal(result.summary.provider_kind, 'e2b');
    assert.equal(result.summary.external_api_called, true);
    assert.ok(commands.some((command) => command.startsWith('git clone ')));
    assert.ok(commands.some((command) => command.startsWith("'codex'")));
  } finally {
    setE2bSandboxFactoryForTest(null);
  }
});
