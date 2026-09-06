import type {
  DesignRequest,
  FoundryRunInspection,
  FoundryRunState,
  OwnerDecision,
} from '../../authority/evolution/index.ts';
import type { FoundryProviderOperationCursor } from './foundry-provider-stage-run.ts';

export const FOUNDRY_RUN_WORKFLOW_NAME = 'FoundryRunWorkflow';
export const FOUNDRY_RUN_QUERY_NAME = 'FoundryRunQuery';
export const FOUNDRY_OWNER_DECISION_UPDATE_NAME = 'FoundryOwnerDecisionUpdate';
export const FOUNDRY_CANCEL_UPDATE_NAME = 'FoundryCancelUpdate';
export const FOUNDRY_PROVIDER_OPERATION_CURSOR_V2 = 'opl-foundry-provider-operation-cursor.v2';

export type FoundryRunStartInput = {
  run_id: string;
  request: DesignRequest;
};

export type FoundryRunWorkflowInput = FoundryRunStartInput & {
  request_digest: string;
  provider_operation_cursor?: FoundryProviderOperationCursor | null;
};

export type FoundryRunWorkflowStatus =
  | 'starting'
  | 'running'
  | 'awaiting_owner_canary'
  | 'awaiting_owner_active'
  | 'terminal';

export type FoundryRunWorkflowState = {
  surface_kind: 'opl_temporal_foundry_run';
  version: 'opl-temporal-foundry-run.v1';
  provider_kind: 'temporal';
  run_id: string;
  request_digest: string;
  workflow_status: FoundryRunWorkflowStatus;
  inspection: FoundryRunInspection | null;
  provider_operation_cursor: FoundryProviderOperationCursor | null;
};

export type FoundryOwnerDecisionUpdate = OwnerDecision;

export type FoundryCancelUpdate = {
  run_id: string;
  expected_revision: number;
  authority_receipt_ref: string;
};

export type FoundryAdvanceRunPhase =
  | 'start_design'
  | 'design'
  | 'materialize'
  | 'evaluate'
  | 'start_diagnosis'
  | 'diagnose'
  | 'qualification_route'
  | 'canary'
  | 'activate';

export type FoundryAdvanceRunActivityInput = {
  surface_kind: 'opl_temporal_foundry_advance_operation';
  version: 'opl-temporal-foundry-advance-operation.v1';
  run_id: string;
  generation: number;
  expected_revision: number;
  expected_state: FoundryRunState;
  phase: FoundryAdvanceRunPhase;
  input_digest: string;
  operation_key: string;
  provider_operation_protocol?: typeof FOUNDRY_PROVIDER_OPERATION_CURSOR_V2;
  provider_operation_cursor?: FoundryProviderOperationCursor | null;
};

const ADVANCE_PHASE_BY_STATE: Partial<Record<FoundryRunState, FoundryAdvanceRunPhase>> = {
  accepted: 'start_design',
  designing: 'design',
  materializing: 'materialize',
  evaluating: 'evaluate',
  evidence_ready: 'start_diagnosis',
  diagnosing: 'diagnose',
  qualified: 'qualification_route',
  canary: 'canary',
  activating: 'activate',
};

export function foundryAdvanceOperationKey(input: {
  run_id: string;
  expected_revision: number;
  phase: FoundryAdvanceRunPhase;
  input_digest: string;
}) {
  return [
    'opl-foundry-step.v1',
    encodeURIComponent(input.run_id),
    String(input.expected_revision),
    input.phase,
    input.input_digest,
  ].join('/');
}

export function foundryAdvanceOperationForInspection(
  inspection: FoundryRunInspection,
): FoundryAdvanceRunActivityInput {
  const phase = ADVANCE_PHASE_BY_STATE[inspection.run.state];
  if (!phase) {
    throw new Error(`FoundryRun state ${inspection.run.state} has no automatic Temporal advance operation.`);
  }
  const identity = {
    run_id: inspection.run.run_id,
    generation: inspection.run.generation,
    expected_revision: inspection.run.revision,
    phase,
    input_digest: inspection.run.last_event_hash,
  };
  return {
    surface_kind: 'opl_temporal_foundry_advance_operation',
    version: 'opl-temporal-foundry-advance-operation.v1',
    ...identity,
    expected_state: inspection.run.state,
    operation_key: foundryAdvanceOperationKey(identity),
  };
}

export interface FoundryTemporalActivities {
  foundryStartRunActivity(input: FoundryRunWorkflowInput): Promise<FoundryRunInspection>;
  foundryAuthorizeCancelRunActivity(input: FoundryCancelUpdate): Promise<FoundryRunInspection>;
  foundryAdvanceRunActivity(input: FoundryAdvanceRunActivityInput): Promise<FoundryRunInspection>;
  foundryLaunchProviderOperationActivity(
    input: FoundryAdvanceRunActivityInput,
  ): Promise<FoundryProviderOperationCursor | null>;
  foundryObserveProviderOperationActivity(input: {
    operation: FoundryAdvanceRunActivityInput;
    cursor: FoundryProviderOperationCursor;
  }): Promise<FoundryProviderOperationCursor>;
  foundryReadProviderOperationTerminalActivity(input: {
    operation: FoundryAdvanceRunActivityInput;
    cursor: FoundryProviderOperationCursor;
  }): Promise<FoundryProviderOperationCursor>;
  foundryCancelProviderOperationActivity(input: {
    operation: FoundryAdvanceRunActivityInput;
    cursor: FoundryProviderOperationCursor;
  }): Promise<FoundryProviderOperationCursor>;
  foundrySubmitOwnerDecisionActivity(input: FoundryOwnerDecisionUpdate): Promise<FoundryRunInspection>;
  foundryCancelRunActivity(input: FoundryCancelUpdate): Promise<FoundryRunInspection>;
  foundryFailRunActivity(input: {
    run_id: string;
    failure_code: string;
    failure_message: string;
  }): Promise<FoundryRunInspection>;
}
