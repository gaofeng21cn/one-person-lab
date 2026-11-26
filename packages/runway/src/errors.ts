export type RunwayErrorCode =
  | 'INVALID_INPUT'
  | 'WORKSPACE_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'STAGE_RUN_NOT_FOUND'
  | 'ATTEMPT_NOT_FOUND'
  | 'SCHEDULE_NOT_FOUND'
  | 'EXECUTOR_NOT_FOUND'
  | 'EXECUTOR_UNAVAILABLE'
  | 'EXECUTOR_FAILED'
  | 'REVISION_CONFLICT'
  | 'INVALID_TASK_STATE'
  | 'INVALID_STAGE_STATE'
  | 'TASK_PAUSED_BY_HUMAN'
  | 'EXECUTION_ABORTED'
  | 'DB_ERROR';

const RUNWAY_ERROR_RPC_CODE: Record<RunwayErrorCode, number> = {
  INVALID_INPUT: -32602,
  WORKSPACE_NOT_FOUND: -32004,
  TASK_NOT_FOUND: -32004,
  STAGE_RUN_NOT_FOUND: -32004,
  ATTEMPT_NOT_FOUND: -32004,
  SCHEDULE_NOT_FOUND: -32004,
  EXECUTOR_NOT_FOUND: -32004,
  EXECUTOR_UNAVAILABLE: -32003,
  EXECUTOR_FAILED: -32000,
  REVISION_CONFLICT: -32009,
  INVALID_TASK_STATE: -32602,
  INVALID_STAGE_STATE: -32602,
  TASK_PAUSED_BY_HUMAN: -32009,
  EXECUTION_ABORTED: -32000,
  DB_ERROR: -32000,
};

export class RunwayError extends Error {
  readonly code: RunwayErrorCode;
  readonly rpcCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: RunwayErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RunwayError';
    this.code = code;
    this.rpcCode = RUNWAY_ERROR_RPC_CODE[code];
    this.details = details;
  }

  toJSON(): {
    name: string;
    code: RunwayErrorCode;
    rpcCode: number;
    message: string;
    details: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      rpcCode: this.rpcCode,
      message: this.message,
      details: this.details,
    };
  }
}
