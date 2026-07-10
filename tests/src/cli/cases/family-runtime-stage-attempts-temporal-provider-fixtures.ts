import type {
  TemporalStageAttemptWorkflowInput,
} from '../../../../src/modules/runway/family-runtime-temporal.ts';

export type TemporalStageAttemptCreateOutput = {
  family_runtime_stage_attempt: {
    attempt: TemporalStageAttemptWorkflowInput & { provider_kind: 'temporal' };
  };
};
