import { FrameworkContractError } from './contracts.ts';
import type { queryStageAttempt } from './family-runtime-stage-attempts.ts';

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider.ts');
}

export async function queryTemporalStageAttemptReadModel(
  attempt: ReturnType<typeof queryStageAttempt>['stage_attempt_query']['attempt'],
) {
  if (attempt.provider_kind !== 'temporal') {
    return null;
  }
  try {
    return await (await temporalProviderModule()).queryTemporalStageAttemptWorkflow(attempt);
  } catch (error) {
    if (
      error instanceof FrameworkContractError
      && error.code === 'contract_shape_invalid'
      && error.message.includes('OPL_TEMPORAL_ADDRESS')
    ) {
      return {
        surface_kind: 'temporal_stage_attempt_query_unavailable',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        status: 'unavailable',
        reason: 'temporal_address_not_configured',
        error: error.toJSON().error,
        authority_boundary: {
          opl: 'local_stage_attempt_ledger_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      };
    }
    throw error;
  }
}
