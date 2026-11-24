import { baseReadback } from './projection-cache.ts';

export function buildRuntimeEnvironmentDoctorReadback() {
  return {
    ...baseReadback('doctor'),
    doctor: {
      surface_kind: 'opl_runtime_environment_doctor', status: 'cached_language_environments_and_lightweight_execution',
      can_block_domain_progress: false,
      findings: [{ severity: 'info', code: 'fast_local_environment',
        message: 'Use opl env run to reuse or prepare uv/Python and renv/R dependencies. Environment versions are recorded once; executions reference that environment.',
        can_claim_runtime_ready: false, can_claim_domain_ready: false }],
    },
  };
}
