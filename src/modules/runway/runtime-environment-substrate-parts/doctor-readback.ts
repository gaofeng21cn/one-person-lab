import { baseReadback } from './shared.ts';

export function buildRuntimeEnvironmentDoctorReadback() {
  return {
    ...baseReadback('doctor'),
    doctor: {
      surface_kind: 'opl_runtime_environment_doctor',
      status: 'runtime_lock_materializer_verify_cache_prune_run_context_guard_available',
      can_block_domain_progress: false,
      findings: [
        {
          severity: 'info',
          code: 'runtime_environment_lock_manifest_projection_available',
          message:
            'Runtime environment descriptor, lock, bundle manifest, cache inventory, and cleanup plan readbacks are available.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: false,
        },
        {
          severity: 'info',
          code: 'runtime_environment_materializer_verify_prune_available',
          message:
            'Explicit --apply can write an OPL-managed runtime root, materialization receipt, verification readback, and protected cache prune receipt without writing domain truth or App release authority.',
          can_block_domain_progress: false,
          can_claim_runtime_ready: true,
          can_claim_domain_ready: false,
          can_claim_app_release_ready: false,
        },
        {
          severity: 'info',
          code: 'fast_local_env_prepare_apply_managed_library_available',
          message:
            'Fast Local Env prepare --apply may use host language binaries while installing missing language packages only into the OPL-managed library path and writing run-context refs for consumers.',
          can_block_domain_progress: false,
          environment_tier: 'fast_local_env',
          host_binary_allowed: true,
          host_environment_fallback_allowed: false,
          can_claim_runtime_ready: false,
        },
        {
          severity: 'info',
          code: 'runtime_environment_run_context_consumer_preflight_available',
          message:
            'Run-context readback fail-closes when artifact root, dependency_run_context.json, or target identity is missing or mismatched; consumers must not fall back to host environment packages.',
          can_block_domain_progress: false,
          host_environment_fallback_allowed: false,
          can_claim_provider_ready: false,
          can_claim_domain_ready: false,
          can_claim_app_release_ready: false,
        },
        {
          severity: 'info',
          code: 'external_agent_sandbox_provider_adapter_available_as_target',
          message:
            'External sandbox providers can carry isolated filesystem, process, git, template, snapshot, and persistence substrate; OPL requires a live provider receipt before provider-ready or runtime-ready claims.',
          can_block_domain_progress: false,
          temporal_replacement: false,
          can_claim_provider_ready: false,
          can_claim_runtime_ready: false,
          can_claim_domain_ready: false,
        },
      ],
    },
  };
}
