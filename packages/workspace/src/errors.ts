export type WorkspaceErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_PATH'
  | 'FILE_TOO_LARGE'
  | 'WORKSPACE_DUPLICATE'
  | 'WORKSPACE_NOT_FOUND'
  | 'SOURCE_NOT_FOUND'
  | 'SNAPSHOT_NOT_FOUND'
  | 'PROPOSAL_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'SOURCE_REVOKED'
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_NOT_ACTIVE'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'PATH_OUTSIDE_SOURCE'
  | 'REVISION_CONFLICT';

const RPC_CODE_BY_WORKSPACE_ERROR: Readonly<Record<WorkspaceErrorCode, number>> = {
  INVALID_INPUT: -32602,
  INVALID_PATH: -32602,
  FILE_TOO_LARGE: -32602,
  WORKSPACE_DUPLICATE: -32602,
  WORKSPACE_NOT_FOUND: -32004,
  SOURCE_NOT_FOUND: -32004,
  SNAPSHOT_NOT_FOUND: -32004,
  PROPOSAL_NOT_FOUND: -32004,
  FILE_NOT_FOUND: -32004,
  SOURCE_REVOKED: -32003,
  SOURCE_UNAVAILABLE: -32003,
  SOURCE_NOT_ACTIVE: -32003,
  PATH_OUTSIDE_WORKSPACE: -32003,
  PATH_OUTSIDE_SOURCE: -32003,
  REVISION_CONFLICT: -32009,
};

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  readonly rpcCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: WorkspaceErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WorkspaceError';
    this.code = code;
    this.rpcCode = RPC_CODE_BY_WORKSPACE_ERROR[code];
    this.details = details;
  }

  toJSON(): {
    name: string;
    code: WorkspaceErrorCode;
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
