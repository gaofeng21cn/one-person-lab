import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  EXTERNAL_SANDBOX_REQUIRED_REFS,
  inspectExternalSandboxProviderAdapterEnv,
} from './external-sandbox-provider-adapter.ts';
import {
  runCodexInE2bSandbox,
  type E2bCodexStageExecutionResult,
} from './e2b-codex-stage-execution.ts';
import type { JsonRecord } from './family-runtime-codex-stage-runner/shared.ts';
import type { RunnerEventSummary } from './family-runtime-codex-stage-runner/input-prompt.ts';

export const RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION = '1.0.0' as const;
export const RUNTIME_ENVIRONMENT_PROVIDER_IDS = ['e2b'] as const;

export type RuntimeEnvironmentProviderId = typeof RUNTIME_ENVIRONMENT_PROVIDER_IDS[number];

export type RuntimeEnvironmentProviderExecutionInput = {
  attempt: JsonRecord;
  args: string[];
  env?: Record<string, string | undefined>;
  timeoutMs: number;
  signal?: AbortSignal;
  onRunnerProgress?: (event: RunnerEventSummary) => void;
};

export type RuntimeEnvironmentProvider = Readonly<{
  provider_id: RuntimeEnvironmentProviderId;
  abi_version: typeof RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION;
  execution_substrate: 'external_sandbox';
  execute(
    input: RuntimeEnvironmentProviderExecutionInput,
  ): Promise<E2bCodexStageExecutionResult>;
  inspect(env?: Record<string, string | undefined>): RuntimeEnvironmentProviderReadback;
}>;

export type RuntimeEnvironmentProviderReadback = Readonly<{
  surface_kind: 'opl_runtime_environment_provider_readback';
  provider_id: RuntimeEnvironmentProviderId;
  abi_version: typeof RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION;
  execution_substrate: 'external_sandbox';
  status: 'configured' | 'unconfigured';
  selected: boolean;
  implemented_provider_ids: readonly RuntimeEnvironmentProviderId[];
  required_external_sandbox_refs: readonly string[];
  missing_required_refs: readonly string[];
  credential_material_read: false;
  external_api_called: false;
  provider_lifecycle_managed: false;
  creates_cloud_resource: false;
  can_claim_provider_ready: false;
  can_claim_runtime_ready: false;
}>;

function normalized(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/-/g, '_')
    : '';
}

function unsupportedProvider(value: string, source: string): never {
  throw new FrameworkContractError(
    'cli_usage_error',
    `Unsupported runtime environment provider: ${value}.`,
    {
      provider_id: value,
      source,
      implemented_provider_ids: [...RUNTIME_ENVIRONMENT_PROVIDER_IDS],
      fallback_allowed: false,
      failure_code: 'runtime_environment_provider_unsupported',
    },
  );
}

/**
 * Resolve only an explicitly requested external provider. Local/host sandbox
 * selection remains the stage runner's native path and returns null here.
 */
export function resolveRuntimeEnvironmentProviderId(
  env: Record<string, string | undefined> = process.env,
): RuntimeEnvironmentProviderId | null {
  const explicit = normalized(env.OPL_CODEX_STAGE_SANDBOX_PROVIDER);
  if (explicit) {
    if (explicit === 'e2b') return 'e2b';
    if (['host', 'none', 'local_host', 'docker', 'local_docker', 'devcontainer', 'dev_container', 'local_devcontainer'].includes(explicit)) {
      return null;
    }
    return unsupportedProvider(explicit, 'OPL_CODEX_STAGE_SANDBOX_PROVIDER');
  }

  if (normalized(env.OPL_FAMILY_RUNTIME_PROVIDER) !== 'external_sandbox') {
    return null;
  }

  const substrate = normalized(env.OPL_EXTERNAL_SANDBOX_SUBSTRATE);
  if (substrate === 'e2b') return 'e2b';
  if (!substrate) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'External sandbox runtime selection requires an explicit substrate.',
      {
        source: 'OPL_FAMILY_RUNTIME_PROVIDER',
        required_env: ['OPL_EXTERNAL_SANDBOX_SUBSTRATE'],
        implemented_provider_ids: [...RUNTIME_ENVIRONMENT_PROVIDER_IDS],
        fallback_allowed: false,
        failure_code: 'runtime_environment_provider_substrate_missing',
      },
    );
  }
  return unsupportedProvider(substrate, 'OPL_EXTERNAL_SANDBOX_SUBSTRATE');
}

function providerReadback(
  env: Record<string, string | undefined>,
): RuntimeEnvironmentProviderReadback {
  const config = inspectExternalSandboxProviderAdapterEnv(env as NodeJS.ProcessEnv);
  const selected = resolveRuntimeEnvironmentProviderId(env) === 'e2b';
  return Object.freeze({
    surface_kind: 'opl_runtime_environment_provider_readback',
    provider_id: 'e2b',
    abi_version: RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION,
    execution_substrate: 'external_sandbox',
    status: config.configured ? 'configured' : 'unconfigured',
    selected,
    implemented_provider_ids: Object.freeze([...RUNTIME_ENVIRONMENT_PROVIDER_IDS]),
    required_external_sandbox_refs: Object.freeze([...EXTERNAL_SANDBOX_REQUIRED_REFS]),
    missing_required_refs: Object.freeze([...config.missingRequiredEnv]),
    credential_material_read: false,
    external_api_called: false,
    provider_lifecycle_managed: false,
    creates_cloud_resource: false,
    can_claim_provider_ready: false,
    can_claim_runtime_ready: false,
  });
}

const e2bProvider: RuntimeEnvironmentProvider = Object.freeze({
  provider_id: 'e2b',
  abi_version: RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION,
  execution_substrate: 'external_sandbox',
  execute(input) {
    return runCodexInE2bSandbox(input);
  },
  inspect(env = process.env) {
    return providerReadback(env);
  },
});

export function runtimeEnvironmentProviderFor(
  providerId: RuntimeEnvironmentProviderId,
): RuntimeEnvironmentProvider {
  if (providerId === 'e2b') return e2bProvider;
  return unsupportedProvider(providerId, 'runtimeEnvironmentProviderFor');
}

export function resolveRuntimeEnvironmentProvider(
  env: Record<string, string | undefined> = process.env,
): RuntimeEnvironmentProvider | null {
  const providerId = resolveRuntimeEnvironmentProviderId(env);
  return providerId ? runtimeEnvironmentProviderFor(providerId) : null;
}

export function runtimeEnvironmentProviderContract() {
  return Object.freeze({
    surface_kind: 'opl_runtime_environment_provider_contract',
    abi_version: RUNTIME_ENVIRONMENT_PROVIDER_ABI_VERSION,
    implemented_provider_ids: Object.freeze([...RUNTIME_ENVIRONMENT_PROVIDER_IDS]),
    selection: 'explicit_only',
    unsupported_provider_behavior: 'fail_closed_no_host_fallback',
    temporal_replacement: false,
    authority_boundary: Object.freeze({
      opl_owns_stage_lifecycle_and_receipt_refs: true,
      provider_owns_isolated_execution_environment: true,
      provider_writes_domain_truth: false,
      provider_claims_runtime_ready: false,
      provider_claims_domain_ready: false,
      provider_claims_app_release_ready: false,
    }),
  });
}
